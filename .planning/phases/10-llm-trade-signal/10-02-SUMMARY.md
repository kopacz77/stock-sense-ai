---
phase: 10-llm-trade-signal
plan: 02
subsystem: market-intelligence
tags: [m2-04, llm, lm-studio, openai-sdk, scorer, backlog, sequential-gate, qwen]

# Dependency graph
requires:
  - phase: 10-llm-trade-signal
    plan: 01
    provides: src/market-intelligence/signal/types.ts (ScoredArticle, ScoreBacklogEntry, ExtractedCatalyst, CalendarEvent, PmMappingProposal); config/themes.json + config/macro-tickers.json injected via ScoringContext at runtime
  - phase: 09-market-intelligence-bot
    provides: src/market-intelligence/correlator/llm-correlator.ts (reference LM Studio call surface — mirrored here)
provides:
  - ArticleScorer class with scoreArticle(article, context) → ScoredArticle[] (per-ticker fan-out)
  - parseScorerResponse + canonicalizeTheme + fanOutScoredArticle exported helpers (unit-testable)
  - ScoreBacklog persistent queue with enqueue / drain / size / oldestAgeMs
  - SCORER_VERSION="v1" + SYSTEM_PROMPT_V1 frozen for downstream re-scoring/stability tests
affects: [10-06, 10-07, m2-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-to-LlmCorrelator pattern: new module mirrors call surface (OpenAI SDK, baseURL override, apiKey 'lm-studio' default, timeout 60_000, maxRetries 0, /no_think, response_format omitted) rather than forking or subclassing"
    - "Promise-chain sequential gate: this.inFlight = new Promise; await prev; release on finally — guarantees serialized execution even when callers issue parallel scoreArticle calls without await between"
    - "Single-file rolling backlog (NOT date-rotated) with atomic temp-file-rename writes — entries leave when scored so daily rotation would create orphaned partial files"
    - "Bail-on-first-failure drain semantics — when LLM is still down on call N+1 in a drain cycle, abort and let next cycle retry the slice rather than burning the maxN budget"
    - "clientOverride constructor arg as the standard test-injection seam — production constructs its own OpenAI client; tests inject a fake matching Pick<OpenAI, 'chat' | 'models'> shape"

key-files:
  created:
    - src/market-intelligence/signal/article-scorer.ts
    - src/market-intelligence/signal/score-backlog.ts
    - src/market-intelligence/signal/__tests__/article-scorer.test.ts
    - src/market-intelligence/signal/__tests__/score-backlog.test.ts
  modified: []

key-decisions:
  - "SCORER_VERSION=v1 captures both prompt and output schema — bump on any change to SYSTEM_PROMPT_V1, expected JSON shape, or theme canonicalization rules"
  - "Sequential gate implemented as promise chain (not semaphore) — simpler, no library, and naturally provides FIFO ordering with O(1) per-call overhead"
  - "Drain stops on first failure within a cycle — 1 failure burns 1 call from maxN, remaining slice goes back to queue for next cycle to retry"
  - "Themed-only fallback (ticker='') preserves the article in the data layer when no scope and no universe match — M2-05 can query by theme even without a ticker dimension"
  - "proposedPmMappings + proposedAffectedTickers only populate the FIRST record in a multi-ticker fan-out (downstream rollup reads them as article-level metadata, not per-ticker — duplicating across fan-out would cause double-counting)"
  - "Catalyst validation: unknown types and out-of-range magnitudes are silently dropped (not thrown) — defensive against LLM invention, downstream still gets the valid subset"
  - "OpenAIClientSurface type alias = Pick<OpenAI, 'chat' | 'models'> — narrowest surface the scorer touches, makes test injection trivial without leaking 'any' types"

patterns-established:
  - "Sibling-to-LlmCorrelator: anywhere a new module needs LM Studio access, copy the constructor pattern verbatim (baseURL/apiKey/timeout/maxRetries), do not introduce a new HTTP client or wrap OpenAI"
  - "Sequential gate via promise chain — reusable for any future per-input LLM module on the same local GPU"
  - "Atomic temp-file rename writes for any single-file persistent queue under data/"

# Metrics
duration: 6min
completed: 2026-05-31
---

# Phase 10 Plan 02: M2-04 LLM Scorer + Backlog Summary

**Built ArticleScorer (per-article LM Studio scoring) + ScoreBacklog (persistent queue absorbing LLM-down windows), mirroring LlmCorrelator's call surface exactly and adding the sequential-gate + drain-cap-bail-on-failure semantics M2-04 needs.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files created:** 4 (2 modules + 2 test files)
- **Tests added:** 26 (18 article-scorer + 8 score-backlog), all passing
- **Lines:** ~530 article-scorer.ts + ~160 score-backlog.ts + ~440 of test code

## Accomplishments

- ArticleScorer mirrors LlmCorrelator's LM Studio call surface byte-for-byte: OpenAI SDK with `baseURL` override, `apiKey: "lm-studio"` default, `timeout: 60_000`, `maxRetries: 0`, `/no_think` directive at end of user prompt, `response_format` omitted (LM Studio rejects `"json_object"`)
- Sequential gate empirically proven via test — even when 3 calls are issued in parallel without await between, the fake client never sees more than 1 in-flight at a time
- `concurrency > 1` clamped to 1 with a console.warn (single-GPU saturation)
- `parseScorerResponse` is tolerant of bare JSON, markdown-fenced JSON (Qwen sometimes wraps), and leading-prose+JSON; clamps sentiment to [-1,1], materiality to [0,1], caps themes at 5, drops invalid catalysts (unknown type or out-of-range magnitude)
- `fanOutScoredArticle` handles 3 cases: per-ticker fan-out (`article.tickers` non-empty), affected_tickers ∩ universe fan-out (macro article with LLM-proposed scope), themed-only single row with `ticker=""` (no scope, no match)
- ScoreBacklog: single-file rolling at `data/intel/score-backlog.jsonl` with atomic temp-rename writes, FIFO drain ordering, `maxN` cap (default 50), bail-on-first-failure semantics, in-memory cache for hot reads
- `pnpm tsc --noEmit` clean across the whole project
- 34/34 tests across the signal module pass (includes 8 pre-existing pm-mapping-engine tests from concurrent Wave 2 work)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build ArticleScorer module** — `2ed987e` (feat)
2. **Task 2: Build ScoreBacklog persistent queue** — `4c0b2eb` (feat)

## Files Created

- `src/market-intelligence/signal/article-scorer.ts` — 530 lines:
  - `SCORER_VERSION = "v1"` (exported)
  - `SYSTEM_PROMPT_V1` (exported, frozen)
  - `ArticleScorer` class with `scoreArticle(article, context): Promise<ScoredArticle[]>` + `ping(): Promise<{ models: string[] }>`
  - Exported helpers: `parseScorerResponse`, `canonicalizeTheme`, `fanOutScoredArticle`
  - Exported types: `ArticleScorerOptions`, `ScoringContext`, `ParsedScorerResponse`
- `src/market-intelligence/signal/score-backlog.ts` — 160 lines:
  - `ScoreBacklog` class with `enqueue`, `drain`, `size`, `oldestAgeMs`
  - Exported types: `ScoreBacklogOptions`, `DrainResult`
- `src/market-intelligence/signal/__tests__/article-scorer.test.ts` — 18 tests
- `src/market-intelligence/signal/__tests__/score-backlog.test.ts` — 8 tests

## Decisions Made

### SCORER_VERSION = "v1" — what triggers a bump

`SCORER_VERSION` is embedded in every `ScoredArticle` so future stability tests (`intel stability-test`) can identify which prompt produced a given score. Bump when **any** of these change:

1. **`SYSTEM_PROMPT_V1` body** — wording, schema description, rules, ordering
2. **Expected JSON output shape** — adding/removing required fields, renaming fields
3. **Theme canonicalization rules** — current rules are `.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")`; any change to this regex bumps the version
4. **Catalyst type enum** — adding/removing valid catalyst types in `VALID_CATALYST_TYPES`
5. **Clamping behavior** — current rules clamp sentiment to [-1,1], materiality to [0,1], cap themes at 5

Do NOT bump for: code refactors that produce byte-identical output, internal helper renames, comment changes, or test additions.

### Sequential gate via promise chain (not semaphore library)

Choice: implement the sequential gate as a `this.inFlight: Promise<unknown>` chain rather than pulling in `p-limit` or rolling a semaphore class.

Rationale:
- Zero dependency cost — uses only language primitives
- Naturally FIFO without explicit queueing
- O(1) per-call overhead (one promise allocation, one resolve callback)
- Trivially testable — the test that proves it works (`maxConcurrent` counter inside fake client) is 30 lines

Tradeoff: not configurable per-call. For M2-04's use case (one local Qwen, one GPU) this is exactly right — global serialization is the goal. If we ever move to a multi-GPU deployment, the gate is the only thing that needs replacing.

### Drain stops on first failure

When the LLM is still down on call N+1 in a drain cycle, abort and let the next cycle retry the slice rather than burning the `maxN` budget on guaranteed failures.

Justification:
- An LM Studio outage is a binary state (server up / server down), not a transient flicker. If a call fails with "connection refused" or "timeout", the next call within seconds will almost certainly fail the same way.
- Burning all 50 backlog slots on guaranteed failures wastes ~50 × 60s = 50 minutes of wall time per cycle on nothing.
- The next cycle retries from the same FIFO head — no progress is lost, just delayed by 15 minutes.
- The single failure counter (`failed: number` in `DrainResult`) is always 0 or 1 by construction — operator dashboards can read it as "did the LLM come back?" rather than "how many failed today?"

### Themed-only fallback (`ticker = ""`)

When an article has empty `tickers` AND the LLM's `affected_tickers` doesn't intersect with the configured universe, emit a single row with `ticker = ""` instead of dropping the article.

Rationale: M2-05 may query by theme even without a ticker dimension (e.g., "what's today's net sentiment on `fed-rate-cuts`?"). Dropping the article would lose the theme signal entirely. The `ticker = ""` row keeps it in the rollup's themed-aggregation slice. Composite id `${articleId}::__theme__` is unique and dedup-safe.

### PM proposals + proposed-affected-tickers only on first record

When an article fans out to multiple ticker records, the LLM's `proposed_pm_mappings` and `affected_tickers` populate only the FIRST record. Subsequent records have these fields as `undefined`.

Rationale: these are article-level metadata, not per-ticker. Replicating them across all fan-out records would cause downstream double-counting when RollupBuilder (Plan 10-06) aggregates them. The first record is canonical; subsequent records carry just the per-ticker score.

## Deviations from Plan

### Auto-added (Rule 2 — missing critical functionality)

**1. Expanded VALID_CATALYST_TYPES enum from plan's 10 to types.ts's 22**

- **Found during:** Task 1
- **Issue:** Plan-level prompt enumerated only 10 catalyst types (`"earnings", "guidance", "ma", "regulatory", "fda", "macro_print", "fomc", "geopolitical", "lawsuit", "product", "other"`), but `signal/types.ts` `CatalystType` union declares 22 (adds `fda_pdufa`, `cpi`, `nfp`, `pce`, `retail_sales`, `jolts`, `gdp`, `ism`, `opec`, `eia_petroleum`, `treasury_auction`). If the prompt asked the LLM for the smaller enum but the type system accepted the larger one, the scorer's runtime validation (`VALID_CATALYST_TYPES.has(...)`) would reject any LLM-emitted catalyst from the calendar fetchers (Plan 10-04) that uses the full enum — silent data loss.
- **Fix:** Updated SYSTEM_PROMPT_V1's catalyst-type list to enumerate the full 22-type union, matching the type contract. The model now knows which fine-grained calendar events it can refine (e.g., article handicaps next week's `cpi` not generic `macro_print`).
- **Files modified:** `src/market-intelligence/signal/article-scorer.ts` (SYSTEM_PROMPT_V1)
- **Commit:** `2ed987e`

### Other deviations

**2. Tests exceed minimum**

- Plan specified 10 minimum tests for `article-scorer.test.ts`; delivered 18. Plan specified 7 minimum for `score-backlog.test.ts`; delivered 8.
- All additional tests cover edge cases the plan implied but didn't enumerate as separate cases (catalyst validation filtering, canonicalizeTheme exported function, concurrency clamp warn observability, parseScorerResponse error on no-JSON-found).
- Not a deviation in the rule-fix sense; mentioned for completeness only.

## Authentication Gates

None — no live LM Studio calls in the test suite (entire test surface uses the `clientOverride` injection seam with a fake client).

LM Studio production endpoint reachability is not tested here; the existing M2-03 `LlmCorrelator` already validates the call surface against the live endpoint daily. When Plan 10-06 wires this into `cycle-runner`, the same env vars (`LLM_ENDPOINT`, `LLM_MODEL`) will resolve, and the existing `intel ping-llm` command provides operator-visible reachability checking.

## Issues Encountered

None — both tasks completed cleanly on the first pass. Test setup (vitest pattern, co-located `__tests__/`) was already established by the pre-existing `pm-mapping-engine.test.ts`, so no scaffolding cost.

One micro-friction worth noting: the fake-client typing requires casting `as unknown as Pick<OpenAI, "chat" | "models">` because the OpenAI SDK's `chat.completions.create` is heavily overloaded. Confined to the test helper; production code uses the real `new OpenAI(...)` and has full typing.

## Smoke Test (live LM Studio)

Not run as part of this plan — the test suite uses faked client injection. A live smoke test will happen naturally when Plan 10-06's cycle-runner integration first executes against the production LM Studio. The existing M2-03 LlmCorrelator's per-cycle latency observation (5-15s per ~1200-2400-token call) is the operator's baseline for what to expect; per-article scoring with a smaller prompt (~250-600 input tokens) and smaller output (~150-300 output tokens) should land at the lower end (~3-8s per article per RESEARCH section "Throughput estimates").

## Next Phase Readiness

- Plan 10-06 (cycle-runner integration) can now construct the scorer with the same env vars `LlmCorrelator` uses (`LLM_ENDPOINT`, `LLM_MODEL`, `LLM_API_KEY`) and the same `intel ping-llm` semantics work for it.
- `ScoringContext` requires the caller to assemble: `canonicalThemes` (from `config/themes.json`), `upcomingEvents` (from the catalyst-flags stream filtered to next 14 days), `tickerUniverse` (from `watchlist.txt ∪ config/macro-tickers.json`), `pmContext` (from today's polymarket-snapshots stream).
- `ScoreBacklog` is ready for cycle-runner to call `await backlog.enqueue(article, pmContext, err.message)` on every scorer throw, and `await backlog.drain(scorer, ctx, 50)` at the end of each cycle (after fresh-article scoring completes — so backlog doesn't starve fresh signal per RESEARCH pitfall #5).
- `scheduler-state.json` should gain `backlogSize: number` + `backlogOldestAt: string` fields for operator visibility (Plan 10-06 owns this wiring).
- Stability test (`intel stability-test`) becomes possible once scored-article persistence is live — re-scoring the same week's articles and computing per-article + per-ticker-day-rollup deltas validates the temperature=0.2 stability target (95th-percentile per-article ≤0.15, per-rollup ≤0.08 per RESEARCH pitfall #3).

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
