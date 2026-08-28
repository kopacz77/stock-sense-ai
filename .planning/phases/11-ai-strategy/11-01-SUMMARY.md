---
phase: 11-ai-strategy
plan: 01
subsystem: intel
tags: [materiality-prescreen, article-intake, cycle-runner, commander-cli, vitest]

requires:
  - phase: 10-llm-trade-signal
    provides: "scored-articles-*.jsonl / news-*.jsonl JSONL streams, JsonlStore, cycle-runner.ts scoring step, watchlist.txt loader"
provides:
  - "materiality-prescreen.ts — pure, synchronous D-16 ranking module (predictMateriality/comparePrescreen/evaluatePrescreen/matchedPrescreenTopics)"
  - "intel prescreen-eval CLI — offline retention metric over real data/intel, no LLM/network"
  - "cycle-runner.ts scoring step reordered by predicted materiality, soft-cap admission gated on PRESCREEN_HARD_ADMIT"
  - "committed held-out fixture prescreen-holdout.jsonl (2026-07-22 -> 07-26, 2518 rows) + regression-guard test"
affects: [11-03, 11-04, 11-05, 11-06, 11-08]

actuals:
  tokens: 302352   # chars/4 over full realized diff (src/market-intelligence/**); ~13,000 of that is
                    # authored code (materiality-prescreen.ts + intel-commands.ts + cycle-runner.ts + 2
                    # test files, 52,310 chars); the rest (~1.15MB) is the machine-generated
                    # prescreen-holdout.jsonl fixture (2518 lines of real news-article data emitted by
                    # `intel prescreen-eval --emit-fixture`, not hand-authored). Do not use the blended
                    # figure to calibrate future *code-writing* estimates for a fixture-heavy plan.
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Additive score = clamp01(sourceWeight + topicBonus), topicBonus = max(matched positive-topic weights) + crypto penalty if matched"
    - "Word-boundary regex keyword matching with lightweight plural stemming (\\bkeyword s?\\b), precompiled once at module load"
    - "Fit-on-train / measure-once-on-holdout methodology for a hand-tuned linear ranking model, with an oracle-ceiling sanity check before accepting a tuning result as final"

key-files:
  created:
    - src/market-intelligence/signal/materiality-prescreen.ts
    - src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts
    - src/market-intelligence/signal/__tests__/fixtures/prescreen-holdout.jsonl
    - src/market-intelligence/scheduler/__tests__/cycle-runner-prescreen.test.ts
  modified:
    - src/market-intelligence/cli/intel-commands.ts
    - src/market-intelligence/scheduler/cycle-runner.ts

key-decisions:
  - "Retuned all weight constants against the real 2026-06-02 -> 06-30 corpus rather than shipping Task 1's starting-point numbers verbatim (plan explicitly authorized this: 'the weight constants in this task are the starting point fitted in Task 2')"
  - "Fixed a substring-match false-positive bug (`.includes('war')` matched 'warranty'/'warehouse'; `.includes('ai')` matched 'said'/'maintain'/'air') by switching to word-boundary regex matching with an optional trailing 's' for lightweight plural stemming"
  - "Added two topic buckets (ai_infra, corp_action) discovered by inspecting which high-materiality June articles matched none of the original 6 seed topics (47% of June's high-materiality mass) — AI/mega-cap infrastructure news and M&A/regulatory/FDA catalysts were the dominant missing signal"
  - "Honored the operator's explicit 'US companies clearly first' priority as a hard constraint during weight tuning: no RSS source-tier base weight is ever allowed to exceed the finnhub:watchlist base, even where doing so would have measured a higher retention number"
  - "PRESCREEN_HARD_ADMIT kept at 0.55 (same number as Task 1), but its semantics shifted: under the retuned weights it is only reachable via a strong source tier PLUS a strong topic match, not by source strength alone — this is a deliberate tightening consistent with D-16's thrift goal (a bare watchlist-ticker mention no longer auto-bypasses the cap)"
  - "Exported matchedPrescreenTopics from materiality-prescreen.ts and had intel prescreen-eval's diagnostic breakdown call it, instead of maintaining a second, drifting keyword-matching implementation in the CLI"
  - "D-16's >= 0.85 retention bar is NOT met (0.81 training / 0.69 held-out, two honest measurements) — reported per plan instruction rather than silently retuned to pass; see 'Fit methodology' below"

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "Pure materiality pre-screen ranking module (predictMateriality/comparePrescreen/extractFeedId/evaluatePrescreen) — replaces isPriorityArticle boolean"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "intel prescreen-eval CLI command — offline D-16 retention metric over real data/intel, no LLM/network calls"
    requirement: INCOME-01
    verification:
      - kind: integration
        ref: "pnpm intel prescreen-eval --start 2026-07-22 --end 2026-07-26"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-16 acceptance bar (>= 0.85 retention at top-50%) measured against real training and held-out windows"
    requirement: INCOME-01
    verification:
      - kind: integration
        ref: "pnpm intel prescreen-eval --start 2026-06-02 --end 2026-06-30 (0.8107) / --start 2026-07-22 --end 2026-07-26 (0.6878)"
        status: fail
    human_judgment: true
    rationale: "Bar not met on either window despite genuine fitting effort (see Fit methodology). Operator needs to decide whether to accept the module as a strict improvement over the status quo boolean, invest further in feature engineering, or redefine the acceptance bar — analogous to the phase's own 2026-08-27 backtest-bar decision."
  - id: D4
    description: "cycle-runner.ts scoring step sorts by predicted materiality and admits past the 500/day cap only at/above PRESCREEN_HARD_ADMIT"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/market-intelligence/scheduler/__tests__/cycle-runner-prescreen.test.ts"
        status: pass
      - kind: unit
        ref: "src/market-intelligence/scheduler/__tests__/cycle-runner.test.ts"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 01: Article-Intake Materiality Pre-Screen Summary

**Pure predictMateriality/comparePrescreen ranking module wired into cycle-runner's soft-cap scoring step, with a fitted-and-measured `intel prescreen-eval` CLI — D-16's 85% retention bar was targeted but not met (0.81 training / 0.69 held-out), reported honestly rather than gamed.**

## Performance

- **Duration:** 55 min (01:04 → wrap-up)
- **Started:** 2026-08-28T05:04:00Z (approx, first Task 1 commit)
- **Completed:** 2026-08-28T05:35:28Z (Task 3 commit) + SUMMARY writeup
- **Tasks:** 3
- **Files modified:** 6 (2 created source, 3 test files, 1 CLI/1 scheduler modified)

## Accomplishments

- `src/market-intelligence/signal/materiality-prescreen.ts` — pure, synchronous ranking function (`predictMateriality`, `comparePrescreen`, `extractFeedId`, `evaluatePrescreen`, `matchedPrescreenTopics`) exported with fully tested ordering guarantees (18 vitest cases).
- `intel prescreen-eval` CLI — joins `news-*.jsonl` to `scored-articles-*.jsonl` over any date window, computes the D-16 retention metric with zero LLM calls and zero network, prints a per-source-tier and per-topic breakdown, and can emit a labelled fixture via `--emit-fixture`.
- `cycle-runner.ts`'s scoring step now sorts intake by predicted materiality and gates past-cap admission on `PRESCREEN_HARD_ADMIT`, replacing the old `isPriorityArticle` boolean (watchlist ticker OR any macro keyword = always score).
- Fitted the weight constants against the real June 2026 corpus (13,426 distinct labelled articles), including discovering and fixing a substring-match bug and adding two new topic buckets that account for the largest share of previously-unclassified high-materiality content.
- Full project test suite: 404/404 passing (was 380 at plan start). `pnpm tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure pre-screen ranking module** - `ed2b423` (feat)
2. **Task 2: Fit + measure D-16 retention bar** - `0144451` (feat)
3. **Task 3: Wire pre-screen into cycle-runner** - `fd04fde` (feat)

**Plan metadata:** committed below (docs: complete plan)

## Files Created/Modified

- `src/market-intelligence/signal/materiality-prescreen.ts` — the D-16 ranking module (source-tier + topic-keyword additive scorer, evaluation metric, feed-id parser)
- `src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts` — 18 vitest cases covering every ordering rule, the T-11-01-02 boundary, the word-boundary bug fix, and the held-out fixture regression guard
- `src/market-intelligence/signal/__tests__/fixtures/prescreen-holdout.jsonl` — committed evaluation corpus, 2,518 distinct labelled articles, 2026-07-22 → 07-26
- `src/market-intelligence/cli/intel-commands.ts` — `intel prescreen-eval` subcommand + helper functions (`enumerateDaysUtc`, `classifySourceTier`, `matchedTopics`, bucket-breakdown printer); `printResult`'s cycle log line extended with `prescreenTop=`/`prescreenCut=`
- `src/market-intelligence/scheduler/cycle-runner.ts` — scoring-step sort/admission swapped from `isPriorityArticle` to `comparePrescreen`/`predictMateriality`+`PRESCREEN_HARD_ADMIT`; `CycleResult` gains `prescreenTop`/`prescreenCut`
- `src/market-intelligence/scheduler/__tests__/cycle-runner-prescreen.test.ts` — 3 vitest cases: ranking order, cap-admission boundary, skipped-articles-untouched

## Fit methodology (full writeup)

**First-draft measurement.** Task 1's starting-point weights (finnhub:watchlist=0.70, cnbc-top=0.25, china bonus=0.30, etc.) scored **0.5303** retention on the June training window — far below 0.85. Diagnosis: `finnhub:watchlist` (articles fetched via the operator's own watchlist tickers) is **69% of intake volume** (9,244/13,426 distinct articles) but only barely above the corpus baseline hit-rate (6.4% vs 6.1% overall). Because its flat base score (0.70) unconditionally outranked every RSS article regardless of topic content, the top-50% cutoff (6,713 rows) was entirely consumed by the low-signal Finnhub bulk, and **zero** RSS-sourced high-materiality articles (230 of 824 total highs) could enter the cut no matter how topic weights were tuned.

**Root-cause investigation.** Inspecting the 389 high-materiality, no-topic-match Finnhub articles by hand showed the dominant missing signal was AI/mega-cap infrastructure news (Nvidia chip launches, Alphabet's $80B equity raise, SpaceX's IPO, Meta enterprise-AI launches) and general corporate-action catalysts (mergers, downgrades, FDA/legal). Neither was covered by the original 6-topic seed list (china/earnings/fed_rates/oil/war_geo/crypto).

**Fixes applied (in order):**
1. **Word-boundary matching (Rule 1 bug fix).** The spec's literal `.includes(keyword)` substring check false-positived badly on short tokens: `"war"` matched "warranty"/"warehouse"/"reward"; `"ai"` matched "said"/"maintain"/"air"/"chair". Switched to precompiled `\bkeyword s?\b` regexes (the trailing `s?` is lightweight plural stemming — "tariff"/"tariffs", "chip"/"chips" — discovered while investigating the held-out-week generalization gap; this fix generalizes beyond any specific corpus so it was not held-out-informed).
2. **Two new topic buckets (Rule 2 — missing critical coverage).** `ai_infra` (ai, chip, gpu, semiconductor, nvidia, data center, trillion, hyperscaler, robotaxi, self-driving) and `corp_action` (merger, acquisition, ipo, downgrade, upgrade, price target, lawsuit, subpoena, ftc, doj, bankruptcy, fda, drug trial, settlement). These alone accounted for 636+233 = 869 of the 5,075 previously-unclassified rows on the training window.
3. **Source-weight rebalancing, honoring the operator's stated priority.** Coordinate-ascent local search over the weight space, constrained so no RSS source-tier base could exceed `finnhub:watchlist`'s base (per CONTEXT.md: "the big global movers are US companies... clearly first"). Final weights are much flatter than Task 1's draft (max source weight 0.20 vs. 0.70) — this is intentional: giving "is a watchlist ticker" a large unconditional bonus was exactly the low-selectivity behavior D-16 set out to fix.

**Oracle-ceiling sanity check.** Before accepting any weight configuration as final, a lookup-table "oracle" scorer (rank by each row's own exact `(source-tier, matched-topic-set)` bucket empirical hit-rate — the best possible ranking achievable from these features, ignoring the additive-formula constraint) was computed for comparison. With the original 6-topic list the oracle ceiling was **0.66** — meaning >=0.85 was structurally unreachable no matter how weights were tuned. With the expanded 8-topic list, the oracle ceiling rose to **0.86** on the training window. The best achievable additive-model result was **0.8107** — close to, but below, that ceiling (an additive/linear model cannot fully capture the joint interaction effects a lookup table can).

**Measured results (both honestly reported per plan instruction — "do NOT silently retune to pass"):**

| Window | Distinct labelled articles | High-materiality count | Retention @ top-50% | Verdict |
|---|---|---|---|---|
| Training (2026-06-02 → 06-30) | 13,426 | 824 | **0.8107** | FAIL (target 0.85) |
| Held-out, 1st measurement (2026-07-22 → 07-26) | 2,518 | 221 | **0.7014** | FAIL |
| Held-out, 2nd measurement (after the general plural-stemming fix, tuned only on June, per plan instruction) | 2,518 | 221 | **0.6878** | FAIL |

Per plan instruction ("tune on the June window only and re-measure, recording both attempts"), the held-out week was measured exactly twice and was NOT further tuned against its own content — the second measurement only reflects a general (not July-specific) regex fix. Inspecting the July-specific leftover articles surfaced additional patterns (EU antitrust fines, "record backlog"/"beat-and-raise" earnings language) that were deliberately **not** added as keywords, because doing so would be tuning directly against the held-out set.

**Final weight constants** (`PRESCREEN_SOURCE_WEIGHTS` / `PRESCREEN_TOPIC_WEIGHTS` in `materiality-prescreen.ts`):

```
finnhub:watchlist=0.20  finnhub:tickered=0.16  finnhub:untickered=0.08  unknown=0.05
rss:google-business=0.20  rss:cnbc-top=0.15  rss:google-world=0.02  rss:cnbc-markets=0.02  rss:marketwatch-top=0.02

china=0.35  corp_action=0.35  fed_rates=0.25  ai_infra=0.25  earnings=0.20  war_geo=0.15  oil=0.02  crypto=-0.30
```

`PRESCREEN_HARD_ADMIT` stays at 0.55 — reachable only by a strong source tier (0.20) plus a strong topic bonus (0.35), never by source strength or topic strength alone. This admits ~15% of intake past the daily cap on the training window, capturing ~30% of that window's high-materiality articles.

**Cycle log line format** (before → after, in `intel-commands.ts`'s `printResult`):

```
Before: [ts] label articles=N markets=N alerts=N sent=N via=llm scored=N backlogged=N backlog=N (Nms)
After:  [ts] label articles=N markets=N alerts=N sent=N via=llm scored=N backlogged=N backlog=N prescreenTop=0.XX prescreenCut=0.XX (Nms)
```

## Decisions Made

See `key-decisions` in frontmatter above for the full list. The headline decision: retention of **0.81 (training) / 0.69 (held-out)** is honestly below the D-16 target of 0.85, after a genuine and multi-round fitting effort (including a bug fix and two newly-discovered topic categories that materially improved the number from an initial 0.53). An oracle-ceiling analysis independently confirms the additive-model approach on this feature set structurally caps out around 0.86 on the training window and clearly degrades on an out-of-window week whose dominant news narratives differ. This is analogous to the phase's own 2026-08-27 decision to downgrade the per-regime backtest bar to a live-window interim gate (documented in `11-CONTEXT.md`) — flagging this for the same kind of operator review rather than silently declaring success.

The pre-screen module is still shipped and wired into `cycle-runner.ts` (Task 3) because it is a **strict improvement** over the status quo it replaces: the old `isPriorityArticle` boolean had no ranking at all (any watchlist ticker or any macro-keyword mention scored equally, with a 43%-of-intake / 4%-hit-rate "matches nothing" tail scored in arrival order); the new pre-screen at least orders intake by predicted value even where its precision falls short of the aspirational bar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `score: number` field to `PrescreenLabelledArticle`**
- **Found during:** Task 1
- **Issue:** The plan's "Types:" prose listed `PrescreenLabelledArticle` without a `score` field, but `evaluatePrescreen(rows, topFraction)`'s two-argument signature and its "sort rows by score descending" behavior require each row to already carry a predicted score — `evaluatePrescreen` has no watchlist parameter, so it cannot derive one itself.
- **Fix:** Added `score: number` to the interface; the fixture on disk still carries it (for convenience/debugging) but the fixture test explicitly recomputes it from the live weights before calling `evaluatePrescreen`, so a weight regression is caught rather than masked by a stale persisted value.
- **Files modified:** `src/market-intelligence/signal/materiality-prescreen.ts`
- **Committed in:** `ed2b423`

**2. [Rule 1 - Bug] Word-boundary keyword matching (substring false-positives)**
- **Found during:** Task 2, while investigating why the retention metric plateaued below the oracle ceiling
- **Issue:** `.includes(keyword)` on short tokens like `"war"` and `"ai"` matched unrelated substrings ("warranty", "warehouse", "reward", "said", "maintain", "air", "chair") — inflating false-positive matches on the war_geo and ai_infra buckets and diluting their predictive precision.
- **Fix:** Precompiled `\bkeyword s?\b` word-boundary regexes (module-load-time, one per keyword) with an optional trailing `s` for lightweight plural stemming.
- **Files modified:** `src/market-intelligence/signal/materiality-prescreen.ts`
- **Verification:** New test case "matches keywords on word boundaries, not raw substrings"; full suite still green.
- **Committed in:** `0144451`

**3. [Rule 2 - Missing Critical] Added `ai_infra` and `corp_action` topic buckets**
- **Found during:** Task 2, root-cause investigation of the 0.53 first-draft retention
- **Issue:** The original 6-topic seed list (china/earnings/fed_rates/oil/war_geo/crypto) matched none of 389 of the training window's 824 high-materiality articles (47%) — the dominant missing content was AI/mega-cap infrastructure news and M&A/regulatory/FDA catalysts.
- **Fix:** Added two topic buckets with weights fit the same way as the original six; `PrescreenTopic` union type expanded from 6 to 8 members.
- **Files modified:** `src/market-intelligence/signal/materiality-prescreen.ts`, `src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts`
- **Committed in:** `0144451`

**4. [Rule 1 - Bug] Deduplicated keyword-matching logic between production scoring and the CLI diagnostic**
- **Found during:** Task 2, cross-checking the CLI's per-topic breakdown against the real `predictMateriality` output
- **Issue:** `intel-commands.ts`'s `matchedTopics` helper (used only for the `intel prescreen-eval` breakdown printout) had its own hand-rolled `.includes()`-based matcher, separate from `materiality-prescreen.ts`'s word-boundary matcher — producing visibly inconsistent counts in the printed diagnostic vs. the actual score used for ranking.
- **Fix:** Exported `matchedPrescreenTopics(headline, summary)` from `materiality-prescreen.ts` and had the CLI helper delegate to it — one matcher, no drift.
- **Files modified:** `src/market-intelligence/signal/materiality-prescreen.ts`, `src/market-intelligence/cli/intel-commands.ts`
- **Committed in:** `0144451`

---

**Total deviations:** 4 auto-fixed (2 missing-critical, 2 bugs), plus 1 reported-not-fixed known gap (D-16 retention bar).
**Impact on plan:** All auto-fixes were necessary for the module's own stated correctness/precision goals — none introduce new infrastructure, external dependencies, or architectural changes. No scope creep. The retention-bar shortfall is reported per the plan's own explicit instruction and does not block Task 3's integration (the module remains a strict improvement over the code it replaces).

## Issues Encountered

- **Pre-existing project-wide biome debt.** `pnpm biome check src/` fails with 641 errors / 189 warnings on `main` before any of this plan's changes (confirmed via `git stash` A/B comparison) — almost entirely `noConsoleLog` in CLI files, an established project convention biome's default config flags. Task 3's acceptance criteria state `pnpm biome check src/ exits 0`, which was already unattainable at plan start. Every file this plan created or modified is individually biome-clean at its own pre-existing error count (materiality-prescreen.ts: 0 errors; cycle-runner.ts: 8 errors both before and after — my additions introduce zero new violations, confirmed by the same before/after diff). Out of scope to fix per the SCOPE BOUNDARY rule (pre-existing, unrelated to this task).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The pre-screen module (`predictMateriality`/`comparePrescreen`/`PRESCREEN_HARD_ADMIT`) is live in `cycle-runner.ts`'s scoring step and will affect which articles get scored starting the next scheduler cycle. Skipped articles remain in `news-*.jsonl`, fully auditable and re-scoreable via `intel backlog-drain` if the operator wants to recover them later.
- **Open item for operator review:** D-16's >= 0.85 retention bar is not met (0.81 training / 0.69 held-out). Recommend treating this the same way the phase's per-regime backtest bar was handled (2026-08-27 CONTEXT.md decision) — either (a) accept the module as-is since it strictly improves on the status quo boolean, (b) invest in a v2 with richer features (this plan's oracle-ceiling analysis suggests the (source-tier × topic-keyword) feature space tops out around 0.86 even with perfect fitting — a materially different feature set, e.g. incorporating LLM-scored historical similarity or per-ticker base rates, would be needed to clear 0.85 reliably), or (c) redefine the D-16 acceptance bar for v1 the same way the backtest bar was redefined.
- `intel prescreen-eval` is available for the operator to re-measure the bar at any time over any window, including after future keyword/weight adjustments — `pnpm intel prescreen-eval --start <date> --end <date> [--top-fraction 0.5] [--emit-fixture <path>]`.
- No blockers for Wave 1's sibling plan (11-02, tracer) or downstream Wave 2 plans (11-03/11-04) — this plan's scope is fully contained to `src/market-intelligence/signal/` and `src/market-intelligence/scheduler/cycle-runner.ts`, with no changes to the `TickerDaySummary`/`ScoredArticle`/`CatalystFlag` contracts M2-05's strategy layer reads.

## Self-Check: PASSED

All 6 created/modified files verified present on disk; all 3 task commit hashes (`ed2b423`, `0144451`, `fd04fde`) verified present in `git log --all`.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*
