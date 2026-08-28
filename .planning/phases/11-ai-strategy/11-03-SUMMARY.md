---
phase: 11-ai-strategy
plan: 03
subsystem: strategy
tags: [catalyst, signal-module, jsonl, refactor, vitest]

# Dependency graph
requires:
  - phase: 11-ai-strategy (11-01)
    provides: "materiality pre-screen in cycle-runner.ts (independent, no file overlap with this plan)"
  - phase: 11-ai-strategy (11-02)
    provides: "src/strategy/ module skeleton — SignalTypeModule/RawSignal/StrategyCandidate contract, levels.ts (targetPriceForCatalyst table, computeLevels), sizing.ts, config.ts, strategy-engine.ts"
provides:
  - "src/market-intelligence/signal/catalyst-loader.ts — single shared scan/dedup/filter over catalyst-flags-*.jsonl (loadAllCatalystFlags, dedupeCatalystsById, loadActiveCatalysts, loadUpcomingCatalysts), all 5 pre-existing consumers migrated"
  - "src/strategy/signals/catalyst-anchored.ts — CatalystAnchoredModule (SignalTypeModule, mode: core), scoreCatalyst, catalystTickers, daysUntil, exported for 11-05 to register"
affects: [11-05-engine-integration, 11-06-live-window-backtest]

# Actuals (#2632)
actuals:
  tokens: 14248   # chars/4 (56993 chars) over the realized diff across all 8 files this plan touched
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Shared scan/dedup helper extracted from 5 independent copies into one module, each caller keeping only its own window-filter semantics (days vs. hours vs. no filter) on top"
    - "Within-type same-(ticker,direction) collision dedup by score then nearest-date, with the dropped id appended to the kept rationale so no evidence silently disappears — precedent for 11-05's cross-type version of the same problem"

key-files:
  created:
    - src/market-intelligence/signal/catalyst-loader.ts
    - src/market-intelligence/signal/__tests__/catalyst-loader.test.ts
    - src/strategy/signals/catalyst-anchored.ts
    - src/strategy/signals/__tests__/catalyst-anchored.test.ts
  modified:
    - src/market-intelligence/signal/rollup-builder.ts
    - src/market-intelligence/cli/intel-commands.ts
    - src/market-intelligence/alerts/digest-builder.ts
    - src/market-intelligence/scheduler/cycle-runner.ts

key-decisions:
  - "digest-builder.ts's loadUpcomingCalendar keeps its own hours-granular window filter locally, calling only the shared loader's scan+dedup (loadAllCatalystFlags + dedupeCatalystsById) — the day-granular loadUpcomingCatalysts helper is too coarse for a 24h digest window, per the plan's own instruction"
  - "earnings' avgHistoricalMove is read from catalyst.sourceMeta.avgHistoricalMove (a forward-compatible hook, not a live field any current producer populates) — no CatalystFlag producer in the codebase today sets it, so earnings always resolves to the generic 2x ATR_5 target spec in practice; documented in the module's targetSpecForCatalyst doc comment rather than silently assumed"
  - "the live-data real-corpus test does NOT hard-assert a calendar:-sourced signal (see 'Real corpus vs fixture assumptions' below) — asserting a value known false against live data would be gaming the test, not verifying it; the honest per-run counts are logged and recorded here instead, following the same reporting norm 11-01 used for its retention-bar miss"

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "One shared catalyst-flags-*.jsonl loader (scan/dedup-by-id-take-latest/filter) — all 5 pre-existing independent copies (RollupBuilder, intel-commands.ts, digest-builder.ts, cycle-runner.ts x2) migrated with zero observable-output change"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/market-intelligence/signal/__tests__/catalyst-loader.test.ts (11 cases: malformed-line tolerance, missing-dir ENOENT tolerance, dedup-by-latest-timestamp order-independence, active/upcoming window boundaries)"
        status: pass
      - kind: integration
        ref: "pnpm vitest run src/market-intelligence/signal src/market-intelligence/cli (144/144, includes pre-existing rollup-builder/rollup-backfill/digest/scheduler suites unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "grep -rl 'catalyst-flags-\\d' src/ returns exactly 1 file (catalyst-loader.ts) — was 4 before this plan"
    requirement: INCOME-01
    verification:
      - kind: other
        ref: "grep -rl 'catalyst-flags-\\d' src/ | wc -l"
        status: pass
    human_judgment: false
  - id: D3
    description: "CatalystAnchoredModule implements scoreCatalyst = min(1, magnitudePrior/5 * confidence), direction mapping (up/down/uncertain/binary), catalystTickers union expansion, daysUntil + timeHorizonDays, and the per-CatalystType targetSpec table, as a SignalTypeModule without editing strategy-engine.ts or types.ts"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/signals/__tests__/catalyst-anchored.test.ts (34 cases: Task 2's 22 behavior-bullet cases + Task 3's 12 both-population cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-17: both the scheduled-macro and LLM-emergent catalyst populations are covered by fixtures AND by a live-data assertion against the real data/intel tree"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/signals/__tests__/catalyst-anchored.test.ts describe('scheduled-macro population') + describe('LLM-emergent population')"
        status: pass
      - kind: integration
        ref: "src/strategy/signals/__tests__/catalyst-anchored.test.ts describe.skipIf(...)('real-data smoke') against ./data/intel"
        status: pass
    human_judgment: true
    rationale: "The live-data test asserts scores in [0,1] and at least one article:-sourced signal (both true on this run: 14 signals, all article:-sourced). It does NOT hard-assert a calendar:-sourced signal, because on this tree's real corpus today, zero currently-active calendar:-sourced catalysts have a refined (non-'uncertain') direction — see 'Real corpus vs fixture assumptions' below. This is a live-data timing/coverage state, not a module defect; operator should re-run this test after backlog-drain + a few more scoring cycles to see if CatalystRefiner has since refined a scheduled event."

duration: ~50min active work (session interrupted by a host restart between Task 2 and Task 3; git commit timestamps show a ~8h gap that does not reflect active work time)
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 03: CATALYST_ANCHORED + Shared Catalyst Loader Summary

**Extracted the 5x-duplicated catalyst-flags scan/dedup logic into one shared `catalyst-loader.ts`, then built `CatalystAnchoredModule` — the second core v1 signal type — fully unit-tested against both the scheduled-macro and LLM-emergent halves of the real 1,560-catalyst corpus, including a live-data smoke that surfaced a genuine substrate-timing gap (documented, not hidden).**

## Performance

- **Duration:** ~50 min active work across two sessions (interrupted by a host restart between Task 2 and Task 3; see `duration` frontmatter note)
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `src/market-intelligence/signal/catalyst-loader.ts` — the single copy of the `catalyst-flags-*.jsonl` scan + malformed-line-tolerant parse + dedup-by-id-take-latest + window-filter logic. All 5 pre-existing independent copies (`RollupBuilder.loadActiveCatalysts`, `intel-commands.ts`'s `loadAllUpcomingCalendarEvents`, `digest-builder.ts`'s `loadUpcomingCalendar`, `cycle-runner.ts`'s `loadUpcomingEvents` and `loadAllCatalysts`) now delegate to it. `grep -rl 'catalyst-flags-\d' src/` returns exactly 1 file (was 4).
- `src/strategy/signals/catalyst-anchored.ts` — `CatalystAnchoredModule` implements the 11-02 `SignalTypeModule` contract: `scoreCatalyst` (D-03's `min(1, magnitudePrior/5 * confidence)` verbatim), `catalystTickers` (tickers[] ∪ affectedSectors[] union, upper-cased, deduped — this is how a macro print reaches TLT/IEF/XLF/IWM), `daysUntil` + `timeHorizonDays = daysUntilEvent + 1`, direction mapping (up→long, down→short, uncertain→0 signals, binary→2 opposite-direction legs at 0.5x size each), and the per-`CatalystType` `targetSpec` table (D-08).
- Within-type same-(ticker, direction) collision dedup: keeps the higher score, breaks an exact tie by nearer `expectedDate`, and appends the dropped catalyst's id to the kept signal's rationale — no evidence silently disappears.
- 34 vitest cases across the two-task test file: 22 for every `<behavior>` bullet in Task 2, plus 12 for Task 3's scheduled-macro / LLM-emergent population fixtures and a live-data smoke against the real `./data/intel` tree.
- Full project test suite: 494/494 passing (was 460 before this plan). `pnpm tsc --noEmit` clean. Biome clean on every non-test file touched (test files are project-wide biome-ignored per `biome.json`'s `files.ignore: ["**/*.test.ts", ...]`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the shared catalyst loader and migrate all five existing consumers** - `46f3e39` (feat)
2. **Task 2: CATALYST_ANCHORED signal module** - `71da7a1` (feat)
3. **Task 3: Fixtures and real-data smoke across BOTH catalyst populations** - `aa91076` (test)

**Plan metadata:** committed below (docs: complete plan)

## Files Created/Modified

- `src/market-intelligence/signal/catalyst-loader.ts` — `loadAllCatalystFlags`, `dedupeCatalystsById`, `loadActiveCatalysts`, `loadUpcomingCatalysts`
- `src/market-intelligence/signal/__tests__/catalyst-loader.test.ts` — 11 vitest cases
- `src/market-intelligence/signal/rollup-builder.ts` — private `loadActiveCatalysts` now a 1-line delegation to the shared loader
- `src/market-intelligence/cli/intel-commands.ts` — `loadAllUpcomingCalendarEvents` now a 4-line delegation
- `src/market-intelligence/alerts/digest-builder.ts` — `loadUpcomingCalendar` sources flags via `dedupeCatalystsById(await loadAllCatalystFlags(...))`, keeps its own hours-granular window filter
- `src/market-intelligence/scheduler/cycle-runner.ts` — `loadUpcomingEvents` and `loadAllCatalysts` now thin delegations
- `src/strategy/signals/catalyst-anchored.ts` — `scoreCatalyst`, `catalystTickers`, `daysUntil`, `CatalystAnchoredModule` (not registered into `strategy-engine.ts` — 11-05 owns registry wiring)
- `src/strategy/signals/__tests__/catalyst-anchored.test.ts` — 34 vitest cases

## Real corpus vs fixture assumptions (D-17 live-data finding)

Running the module against the real `./data/intel` tree today (`2026-08-28`) surfaced a genuine, honest substrate observation:

**Observed live per-catalyst-type signal counts** (14 total signals, all `article:`-sourced):

| Type | Count |
|---|---|
| fomc | 4 |
| product | 3 |
| ma | 2 |
| guidance | 1 |
| earnings | 1 |
| geopolitical | 1 |
| lawsuit | 1 |
| regulatory | 1 |

**Highest live score seen:** `1.0000` — an `ma` catalyst (`article-rss:google-business:vb0f4g-ma-open`), NVDA long, magnitude 5/5, confidence 1.00, expected same-day (`2026-08-28`). Absorbed 6 other same-ticker/same-direction `ma`/`product`/`earnings` catalysts via the within-type tie-break (all listed in the kept signal's rationale).

**The gap:** `sawCalendarSourced=false` on this run. Every currently-active `calendar:`-sourced catalyst on this tree (30 of them: `calendar:eia-cron`, `calendar:finnhub-earnings`, `calendar:fred`, `calendar:fomc-seed`) still carries `direction: "uncertain"` — the seed/fetcher default, per D-02's contract correctly emitting zero signals until `CatalystRefiner` refines a direction from a scored article that references the event. Two independent, real substrate facts compound this:

1. **`FredCalendarFetcher` emits CPI/NFP/PCE/GDP/retail_sales/JOLTS with BOTH `tickers: []` AND `affectedSectors: []`** (verified directly against `calendar:fred` rows on disk) — these catalysts have no ticker mapping at all today, so even a refined direction wouldn't produce a signal without a future task adding sector/proxy-ticker assignment for macro-print types. This is a real gap in the M2-04 substrate this plan did not create and is out of this plan's `files_modified` scope to fix.
2. **`CatalystRefiner.refineFromScored` never updates `tickers`/`affectedSectors`**, only `direction`/`magnitudePrior`/`confidence`/`lastRefinedAt` — so even a scheduled `calendar:fomc-seed` or `calendar:treasury` event (which DOES carry `affectedSectors`) needs a scored article to reference it via `referencedCalendarEvents` before its `uncertain` default flips to a tradeable direction. As of this run, none of the currently-active ones have been.

This is not a code defect — `CatalystAnchoredModule` correctly implements "uncertain emits zero signals" per the explicit `<behavior>` spec — it is a live substrate-timing state. Per the plan's own D-17 output instruction, this disagreement is recorded here rather than papered over. The Task 3 live-data test therefore does not hard-assert a calendar:-sourced signal (it would be asserting a value the real data cannot currently supply); it asserts the true, verifiable facts (scores in [0,1], ≥1 article:-sourced signal) and logs the observed provenance split for operator visibility. Re-running `pnpm vitest run src/strategy/signals/__tests__/catalyst-anchored.test.ts` after more scoring cycles / `intel backlog-drain` completes may flip a currently-`uncertain` scheduled event to a refined direction and change this observation — this is exactly the kind of drift the live-data block exists to catch honestly.

## Decisions Made

See `key-decisions` in frontmatter above. Headline: the live-data test reports the true observed state (0 calendar-sourced signals today) rather than forcing a pass that would misrepresent the substrate — the same honest-reporting norm 11-01 established for its retention-bar shortfall.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed two biome `noNonNullAssertion` violations in the new `catalyst-loader.ts`**
- **Found during:** Task 1, post-write biome check
- **Issue:** `.split("T")[0]!` and a bare `-Infinity` literal both trip `pnpm biome check` rules (`noNonNullAssertion`, `useNumberNamespace`) that the rest of the strategy/signal modules already follow.
- **Fix:** `?? ""` fallback instead of `!`; `Number.NEGATIVE_INFINITY` instead of the bare global.
- **Files modified:** `src/market-intelligence/signal/catalyst-loader.ts`
- **Verification:** `pnpm biome check src/market-intelligence/signal/catalyst-loader.ts` exits 0 with no errors.
- **Committed in:** `46f3e39`

---

**Total deviations:** 1 auto-fixed (Rule 1, style/lint only — no behavior change).
**Impact on plan:** No scope creep; purely a lint-cleanliness fix on the new file before it was committed.

## Issues Encountered

- **Session interruption between Task 2 and Task 3.** The executing host restarted after Task 2's commit (`71da7a1`); this session resumed from the coordinator's verified on-disk state (Tasks 1–2 committed, Task 3's test-file edit already in place and passing 41/41 at the time of the resume message — later grew to 34 dedicated cases as I finished the live-data block). No rework of Tasks 1–2 was needed; git log and `pnpm vitest run` were used to independently re-verify the coordinator's stated state before proceeding, rather than trusting the message's claimed commit hash at face value (it named `46e8f4c`, which does not match this tree's actual `46f3e39` — likely a transcription mix-up with the unrelated `46e8f4c` research-refresh commit referenced elsewhere in STATE.md history; the actual git log was authoritative).
- **`pnpm biome check <test-file>.ts` returns "No files were processed."** Confirmed this is `biome.json`'s project-wide `files.ignore: ["**/*.test.ts", "**/*.spec.ts"]` convention, not a bug — all `*.test.ts` files are exempt from biome linting by design across this codebase. No action needed.

## User Setup Required

None — no external service configuration required. This plan reads existing `data/intel/` and `config/fomc-schedule-seed.json`; it does not add or require any new credential.

## Next Phase Readiness

- `catalyst-loader.ts`'s 4 exported functions (`loadAllCatalystFlags`, `dedupeCatalystsById`, `loadActiveCatalysts`, `loadUpcomingCatalysts`) are stable and available for 11-05's `strategy show-substrate` debug command or any future consumer — no sixth copy of the scan logic should ever be written; import from here.
- `CatalystAnchoredModule` is fully built, tested, and exported but **NOT yet registered** into `StrategyEngine`'s `modules` list (`src/strategy/strategy-engine.ts` still defaults to `[new SectorRotationModule()]`) — this is 11-05's explicit job per this plan's own `<action>` instruction ("Do not register the module in `strategy-engine.ts` — 11-05 owns the registry wiring").
- **Flag for 11-05/11-06:** the D-17 live-data finding above (0 currently-active calendar:-sourced catalysts have a refined direction) means CATALYST_ANCHORED's near-term live output will skew heavily toward `article:`-sourced (LLM-emergent) candidates, consistent with RESEARCH §0's Pitfall 10. The live-window backtest (11-06) should not assume FOMC/CPI/NFP-anchored trades will appear early in its window; it should expect `product`/`ma`/`lawsuit`/`earnings`/`fomc`(emergent)-type candidates to dominate, matching what this plan's live smoke actually observed.
- **Separately flagged, out of this plan's scope:** `FredCalendarFetcher`'s CPI/NFP/PCE/GDP/retail_sales/JOLTS rows carry empty `tickers`/`affectedSectors` — CATALYST_ANCHORED will never produce a signal for a pure scheduled macro print unless a future task assigns it a macro-proxy ticker mapping (mirroring what `SeedFileCalendarLoader.loadFomc`/`loadOpec` already do) or `CatalystRefiner` is extended to propagate a ticker from a refining article. Worth raising to the operator as a scoped follow-up, not a blocker for this phase.
- No blockers for 11-04 (`SENTIMENT_VELOCITY`/`FADE_OVERSHOOT` — no file overlap with this plan) or 11-05 (engine integration).

## Self-Check: PASSED

All 8 created/modified files verified present on disk; all 3 task commit hashes (`46f3e39`, `71da7a1`, `aa91076`) verified present in `git log --oneline --all`.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*
