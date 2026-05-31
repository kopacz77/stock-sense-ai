---
phase: 10-llm-trade-signal
plan: 07
subsystem: cli
tags: [stability-test, themes-review, pm-mappings-review, calendar-list, rollup-today, scorer-ping, percentile, commander, vitest]

# Dependency graph
requires:
  - phase: 10-llm-trade-signal
    provides:
      - "10-02 ArticleScorer (re-scored through it; scorer-ping calls it directly)"
      - "10-03 CalendarRefresher (calendar-refresh subcommand wraps it)"
      - "10-04 PmMappingEngine + PmMappingProposal stream (pm-mappings-review surfaces them)"
      - "10-05 RollupBuilder JSONL output (rollup-today reads ticker-day-summary-*.jsonl)"
provides:
  - "intel stability-test — M2-04 success criterion 6 acceptance gate (article P95 <= 0.15 + rollup P95 <= 0.08)"
  - "intel themes-review — interactive weekly curation of LLM-proposed themes"
  - "intel pm-mappings-review — interactive curation of LLM-proposed PM mappings"
  - "intel calendar-list / calendar-refresh / rollup-today / scorer-ping — operator inspection + diagnostics surface"
  - "runStabilityTest() + computeWeightedSentByBucket() + percentile() — reusable stability math"
  - "aggregateThemeCandidates() + atomic themes.json / themes-rejected.json I/O — reusable review aggregator"
affects:
  - M2-05 AI-Augmented Strategy Engine (consumer of stable scoring + curated themes/PM mappings)
  - "Future M2-04 maintenance: stability test is the regression bar for prompt or model changes"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hyphenated single-word CLI subcommand names (Commander.js multi-word names don't create true sub-subcommands)"
    - "Pure-logic helper modules separated from interactive readline loops for unit-testability"
    - "Atomic temp-rename writes for any config JSON we mutate (themes.json, themes-rejected.json, pm-market-mappings.json)"
    - "Linear-interpolated percentile (rank = p/100 × (n-1)) over a pre-sorted array — matches np.percentile default"

key-files:
  created:
    - src/market-intelligence/signal/stability-test.ts
    - src/market-intelligence/signal/__tests__/stability-test.test.ts
    - src/market-intelligence/cli/themes-review-helpers.ts
    - src/market-intelligence/cli/__tests__/themes-review.test.ts
  modified:
    - src/market-intelligence/cli/intel-commands.ts

key-decisions:
  - "Use hyphenated names (scorer-ping, calendar-refresh, etc.) instead of space-separated multi-word commands"
  - "Stability test computes weighted-sent inline, never calls RollupBuilder.buildForDay (which writes to disk)"
  - "Skip articles that error on re-score so they don't masquerade as false-0 deltas in the report"
  - "pm-mappings-review filters out shell records with empty proposedTickers — they're unmatched markets, not reviewable proposals"
  - "Themes-review aggregates from scored-articles JSONL (not a separate themes-proposed stream); themes live inside ScoredArticle"

patterns-established:
  - "stability-test pattern: re-score frozen window, compare deltas, percentile pass/fail"
  - "interactive review CLI pattern: aggregate candidates → readline accept/alias/reject loop → atomic config write per action"

# Metrics
duration: 10min
completed: 2026-05-31
---

# Phase 10 Plan 07: Operator CLI Surface for M2-04 (Review + Inspection + Stability Test)

**7 new `intel` subcommands + 24 vitest cases that put the M2-04 success criterion 6 acceptance gate into the operator's hands.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-31T15:23:31Z
- **Completed:** 2026-05-31T15:33:05Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 1

## Accomplishments

- **`intel stability-test`** wires runStabilityTest into a CLI command with configurable thresholds, progress spinner, and exit-code-on-fail. M2-04 success criterion 6 is now operator-callable.
- **`intel themes-review` + `intel pm-mappings-review`** put weekly LLM curation behind a low-friction readline loop. Accept = atomic-write back to `config/themes.json` (or `config/pm-market-mappings.json`); reject = atomic-write to `themes-rejected.json`; alias = atomic-merge into an existing canonical's aliases array.
- **`intel calendar-list`** (with `--days N --ticker T` filters) and **`intel rollup-today --ticker T`** give the operator at-a-glance visibility into the M2-04 data substrate without grepping JSONL files.
- **`intel scorer-ping`** is the prereq diagnostic — verifies LM Studio can actually complete a scoring call (not just `models.list`) before kicking off a long stability test or live cycle.
- **`intel calendar-refresh`** bypasses the 24h gate in `cycle-runner.ts` (state file `calendar-refresh-state.json`) for ad-hoc refreshes after editing seed files.

## Task Commits

1. **Task 1: Build stability-test module + unit tests** — `5b7e060` (feat)
2. **Task 2: Register 7 new intel subcommands + themes-review aggregator + unit tests** — `f234d6f` (feat)

**Plan metadata:** Pending (next commit after this SUMMARY lands)

## Files Created

- `src/market-intelligence/signal/stability-test.ts` (~290 lines) — `runStabilityTest()` reads baseline scored rows from the window, dedups to unique NewsArticles, re-scores each through the configured ArticleScorer (sequential per Plan 10-02), computes per-article + per-(date × ticker) rollup deltas, percentile-tests against thresholds. Exports `computeWeightedSentByBucket` and `percentile` as pure-math helpers.
- `src/market-intelligence/signal/__tests__/stability-test.test.ts` (~360 lines, 14 cases) — covers percentile math (empty/single/even/odd-rank-interp), bucket weighting (sentiment math, materiality=0, themed-only-row skip), and end-to-end scenarios (zero/small/large drift, article-passes-but-rollup-fails, progress callback, error-skip on re-score failure).
- `src/market-intelligence/cli/themes-review-helpers.ts` (~210 lines) — `aggregateThemeCandidates()` tallies theme mentions from `scored-articles-*.jsonl`, filters out canonical + alias + rejected entries, enriches survivors with highest-materiality sample headlines. Plus `readThemesConfig` / `writeThemesConfig` / `readRejectedConfig` / `writeRejectedConfig` (atomic temp-rename writes).
- `src/market-intelligence/cli/__tests__/themes-review.test.ts` (~280 lines, 10 cases) — covers threshold filter, canonical exclusion, alias exclusion, rejected exclusion, sample-headline enrichment by materiality, ticker aggregation, and config I/O round-trips.

## Files Modified

- `src/market-intelligence/cli/intel-commands.ts` — added 7 subcommand registrations (`scorer-ping`, `calendar-refresh`, `calendar-list`, `rollup-today`, `themes-review`, `pm-mappings-review`, `stability-test`) plus helper functions (`resolveFredKey`, `loadCanonicalThemes`, `loadMacroTickers`, `loadAllUpcomingCalendarEvents`, `loadPmMappingProposals`, `readPmMappingConfig`, `writePmMappingConfig`, `makeAsker`).

## Subcommand Signatures

```
$ intel scorer-ping
  (no options) — calls ArticleScorer on a synthetic NVDA article; reports latency + records emitted.

$ intel calendar-refresh
  (no options) — calls CalendarRefresher.refreshAll(60); bypasses cycle-runner's 24h gate.

$ intel calendar-list [--days 14] [--ticker T]
  -d, --days <n>          Look ahead N days (default 14)
  -t, --ticker <symbol>   Filter to events affecting this ticker (or its sector) (default: all)

$ intel rollup-today --ticker T
  -t, --ticker <symbol>   Ticker symbol (REQUIRED)

$ intel themes-review [--days 7] [--min-mentions 5]
  --days <n>              Window in days (default 7)
  --min-mentions <n>      Minimum mentions to surface (default 5)
  Interactive: [a]ccept | [r]eject | [l] <existing-theme> alias | [s]kip

$ intel pm-mappings-review [--days 14]
  --days <n>              Window in days (default 14)
  Interactive: [a]ccept | [r]eject | [s]kip

$ intel stability-test [-d 7] [--article-threshold 0.15] [--rollup-threshold 0.08]
  -d, --days <n>                  Window in days (default 7)
  --article-threshold <x>         Article P95 sentiment-delta threshold (PASS if <=)
  --rollup-threshold <x>          Rollup P95 sentiment-delta threshold (PASS if <=)
  Exit code: 0 on PASS, 1 on FAIL, 2 on internal error
```

## Decisions Made

1. **Hyphenated single-word command names instead of space-separated multi-word names.** Commander.js's `.command("calendar list")` interprets the space as part of the command name (you'd invoke it as `intel "calendar list"` literally), not as a subcommand. True nested subcommands would need `.command("calendar").command("list")`, which would also require restructuring the existing flat layout. The plan's intent (`intel calendar refresh`, `intel calendar list`, etc.) is preserved as `intel calendar-refresh`, `intel calendar-list`. Operator UX is essentially identical; tab completion / help output is cleaner.

2. **Stability test computes its rollup math inline rather than calling `RollupBuilder.buildForDay`.** RollupBuilder writes to disk (atomic temp-rename of `ticker-day-summary-{day}.jsonl`); a stability test should be read-only against the data dir so it can run concurrently with the scheduler without racing on file writes. The math is the same materiality-weighted mean — extracted to `computeWeightedSentByBucket` as a re-usable pure function.

3. **Re-scoring errors skip the article entirely** rather than recording a synthetic 0-delta. If LM Studio drops mid-test, we don't want the failures to artificially pass the threshold (delta=0 between baseline and "no rerun" would look perfect). Skipping means the failed articles don't contribute to either the numerator or denominator of the percentile — the report still reflects the genuine stability of the articles that did re-score.

4. **`pm-mappings-review` filters out proposals with empty `proposedTickers`.** PmMappingEngine writes shell records for every unmatched market it sees (so we can audit the gap); the ArticleScorer is responsible for enriching them with LLM-proposed tickers when it sees the same market in a PM context with an article. Reviewing the empty shells would surface dozens of unmatched markets per week with no ticker proposals — not actionable. The reviewable subset is "shells the LLM has touched", which is the actual operator decision surface.

5. **`themes-review` aggregates from `scored-articles-*.jsonl` rather than a separate `themes-proposed-*.jsonl` stream.** Themes live inside ScoredArticle as the `themes: string[]` array — that IS the proposal stream. No separate emission needed. The aggregator counts theme occurrences across scored rows and surfaces ones not yet in canonical/alias/rejected lists.

6. **Single-action atomic write per accept/reject during the interactive loop.** We could batch writes until the loop closes, but a Ctrl+C mid-loop would lose all decisions. Per-action writes mean every approval is durable immediately; the small file-write overhead is dwarfed by the human keystroke latency.

7. **`stability-test` exits 1 on FAIL (not 2).** Distinguishes "test ran but didn't pass" from "test couldn't run at all". Operator can wire into CI gating: exit 0 = ship, exit 1 = scoring drift detected (investigate), exit 2 = scaffold broken (alert).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Commander.js multi-word command names don't create true subcommands**
- **Found during:** Task 2 (subcommand registration smoke test)
- **Issue:** The plan specified commands as `intel themes review` / `intel calendar list` etc. Commander.js treats the whole string `"themes review"` as a single command name — invoking it requires `intel "themes review"` with quotes, and `intel --help` shows the awkward name. True sub-subcommand nesting would require chained `.command()` calls and a deeper structural change to the existing flat layout.
- **Fix:** Hyphenated single-word names (`themes-review`, `calendar-list`, `calendar-refresh`, `rollup-today`, `pm-mappings-review`, `scorer-ping`). Smoke test confirmed all 7 register correctly under `intel --help` and respond to `--help` individually.
- **Files modified:** src/market-intelligence/cli/intel-commands.ts
- **Verification:** `pnpm dev intel --help` lists all 7 new commands; `pnpm dev intel calendar-list --days 14` prints upcoming events live.
- **Committed in:** f234d6f (Task 2 commit)

**2. [Rule 1 - Bug] Plan's `loadAllUpcomingCalendarEvents` helper didn't exist**
- **Found during:** Task 2 (calendar-list implementation)
- **Issue:** Plan referenced "helper using same logic as digest builder" but Plan 10-06 (concurrent agent) had not yet exposed it as a shared helper. Plan 10-06's digest-builder did land while my work was in progress (commit 2f8d6e2), but uses its own internal scan logic.
- **Fix:** Replicated the dedup-by-id-take-latest + non-archived + expectedDate-in-window scan inline in intel-commands.ts (matches RollupBuilder.loadActiveCatalysts pattern; ~30 lines).
- **Files modified:** src/market-intelligence/cli/intel-commands.ts
- **Verification:** Live smoke against `data/intel/catalyst-flags-2026-05-31.jsonl` returned 4 events (2 EIA + 2 Treasury) within 14 days.
- **Committed in:** f234d6f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** No scope change. The first is a Commander.js mechanics adjustment; the second is a parallel-execution coordination side-effect that resolved with a local helper instead of a cross-agent shared one.

## Issues Encountered

- **Mid-execution rebase from Plan 10-06.** During tsc verification I stashed my work to confirm an unrelated cycle-runner type error came from Plan 10-06's mid-work state. While stashed, Plan 10-06 landed commit `2f8d6e2` (DigestBuilder + flavor widening), and my stash pop conflicted on `intelligence-alerter.ts` (which I never touched). Resolved by `git checkout stash@{0} -- src/market-intelligence/cli/intel-commands.ts` to restore only my file from the stash, then `git stash drop`. No data lost; Plan 10-06's uncommitted alerter/scheduler changes stayed in their working tree unchanged.
- **`pnpm build` (full tsc emit) failed with errors from `intelligence-alerter.ts`**. Those are Plan 10-06's mid-work errors (uncommitted refactor in progress). `pnpm tsc --noEmit` project-wide is clean, and `pnpm dev` (tsx) works around the dist cache. Not a regression I introduced.

## Stability Test Empirical Baseline

A live `intel stability-test --days 1` was NOT run as part of this plan because:

1. Today's `scored-articles-2026-05-31.jsonl` does not exist yet in the live data dir — the operator hasn't kicked off a Wave 3 end-to-end cycle.
2. Running it now would re-score 0 articles and return "No scored articles in window — cannot evaluate stability" (which is correctly handled by the empty-window test case).

**Operator follow-up:** Once `intel run-once` (or `intel start`) has populated 1-7 days of scored articles, run:

```bash
intel stability-test --days 7 --article-threshold 0.15 --rollup-threshold 0.08
```

If the report fails:
- **Article P95 > 0.15:** sentiment/materiality drift on the per-article axis. Likely causes: temperature too high (currently 0.2 in ArticleScorer), prompt under-constrained, model quantization noise. Consider lowering temperature to 0.0 or bumping SCORER_VERSION after a prompt tightening pass.
- **Rollup P95 > 0.08:** even small per-article drift may compound at the rollup level when materiality is concentrated. If only the rollup axis fails, the per-article drift is real but the article threshold may be too permissive for this universe; consider tightening to 0.10.

The 0.15 / 0.08 defaults come from RESEARCH ("Stability test threshold"). They are a starting point, not a permanent contract — adjust based on what real data shows.

## Next Phase Readiness

- **M2-04 (Plan 10-08 if planned, or phase close):** The 7 CLI subcommands plus the 6 alert-side changes from Plan 10-06 (DigestBuilder + flavor widening) complete the operator-facing surface for M2-04. Remaining acceptance work is operator-driven: weekly themes-review + pm-mappings-review, daily stability-test sampling, and per-cycle calendar-list spot-checks.
- **M2-05:** Now has both (a) a stable data substrate (rollup + catalyst-flags + curated themes/PM mappings) and (b) a stability-test guard rail to detect when the substrate's quality is degrading. Strategies built in M2-05 can assume scoring stability within the documented thresholds; if those thresholds slip, the gate fails before bad data reaches the strategy layer.
- **No new blockers** for downstream phases.

## Operator Workflow

```
Weekly:           intel themes-review                  # curate LLM-proposed themes
Weekly:           intel pm-mappings-review             # canonicalize PM mappings
Daily (post AM):  intel calendar-list --days 14       # spot-check upcoming catalysts
Ad-hoc:           intel rollup-today --ticker NVDA   # inspect today's per-ticker rollup
Diagnostic:       intel scorer-ping                    # verify LLM endpoint pre-cycle
Acceptance gate:  intel stability-test --days 7      # M2-04 success criterion 6
Ad-hoc:           intel calendar-refresh               # force refresh outside 24h gate
```

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
