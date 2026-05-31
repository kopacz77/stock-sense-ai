---
phase: 07-strategy-reality-check
plan: 04
subsystem: backtesting
tags: [analytics, regime-segmentation, performance-metrics, vitest, backtesting, sharpe, drawdown]

# Dependency graph
requires:
  - phase: 01-backtesting-fix
    provides: PerformanceMetricsCalculator, BacktestResult, EquityCurvePoint, Trade types
provides:
  - REGIMES constant exposing locked 2018-2025 bull/bear/highVol windows from CONTEXT.md
  - sliceByRegime() / sliceByWindows() helpers that filter equity curve + trades by date
  - metricsByRegime() that runs PerformanceMetricsCalculator on spliced data with correct
    Sharpe/Sortino/volatility/maxDrawdown overrides (per-sub-window recomputation)
  - 12 passing vitest unit tests covering filtering, return recomputation, drawdown selection,
    empty-regime safety, and single-window calculator parity
affects:
  - 07-strategy-reality-check Plan 05 (reality-check runner will call metricsByRegime() after each backtest)
  - 07-strategy-reality-check Plan 06 (recommendation generator will aggregate per-regime metrics from JSONL)
  - any future per-regime analytics (e.g., M2-04 LLM trade-signal layer if it needs per-regime conviction)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-sub-window daily-return recomputation: drop cross-window jump returns to avoid distorting Sharpe/volatility on discontinuous regime windows"
    - "Worst-per-sub-window maxDrawdown selection: meaningful drawdown is sustained within a single contiguous window, not artifact of splicing"
    - "Calculator delegation + targeted override: reuse PerformanceMetricsCalculator for trade-statistics and aggregate-return fields, then override splicing-sensitive fields"
    - "Internal-API export for tests (computeMetricsForWindows / sliceByWindows): keeps the public API regime-locked while enabling sanity tests with synthetic windows"

key-files:
  created:
    - src/backtesting/analytics/regime-segmenter.ts (418 lines)
    - src/backtesting/analytics/__tests__/regime-segmenter.test.ts (474 lines)
  modified:
    - vitest.config.ts (broadened include glob to discover src/**/__tests__/ tests)

key-decisions:
  - "maxDrawdown = worst per-sub-window, not spliced peak-to-trough (otherwise drawdown reflects 6-month gap between regime windows, not a real decline)"
  - "Sharpe/Sortino/volatility recomputed from per-sub-window daily returns (cross-window jump returns are implicitly dropped because each sub-window starts at index 1 of its own series)"
  - "totalReturn/cagr/annualizedReturn left as the calculator computes them (using spliced first/last endpoints and regime full-span dates) — defensible interpretation for KEEP/MODIFY/DISCARD bar; strict in-regime compounding deferred"
  - "Empty regime → zero-filled PerformanceMetrics, do not throw (regime windows can have no data if cache only spans a subset)"
  - "Exposed computeMetricsForWindows + sliceByWindows internals for tests (Plan 05 runner uses only the regime-locked public API)"

patterns-established:
  - "Reusable per-regime analytics live in src/backtesting/analytics/, callable from runner scripts and the CLI"
  - "Tests colocated with their module in src/**/__tests__/ are discovered via vitest config"

# Metrics
duration: 4min
completed: 2026-05-30
---

# Phase 07 Plan 04: Regime Segmenter Summary

**Pure-function module slices a full 2018-2025 backtest equity curve into per-regime Sharpe / Sortino / MaxDD metrics with correct handling of discontinuous regime windows.**

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-05-31T01:57:14Z
- **Completed:** 2026-05-31T02:01:40Z
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Built `regime-segmenter.ts` (418 lines, 5 exported symbols: `REGIMES`, `sliceByRegime`, `metricsByRegime`, `RegimeName`, `RegimeWindow`) with two non-obvious correctness fixes baked in: per-sub-window daily-return recomputation (drops cross-window jump returns) and per-sub-window worst-drawdown selection.
- Wrote 12 vitest unit tests (474 lines, all passing) that PROVE the correctness fixes empirically — including a "100k → 180k cross-window jump" test that demonstrably shows volatility stays sane (<1.0 in decimal terms) instead of blowing up.
- Module is import-ready for Plan 05's reality-check runner: `import { metricsByRegime } from "@/backtesting/analytics/regime-segmenter.js"` then call after each full-period backtest.

## Task Commits

1. **Task 1: regime-segmenter module** — `ff925db` (feat)
2. **Task 2: vitest unit tests + config update** — `ea9c40d` (test)

## Files Created/Modified

- `src/backtesting/analytics/regime-segmenter.ts` (new, 418 lines) — REGIMES constant + sliceByRegime + metricsByRegime + internal helpers exposed for tests
- `src/backtesting/analytics/__tests__/regime-segmenter.test.ts` (new, 474 lines) — 12 passing tests
- `vitest.config.ts` (modified) — added `src/**/__tests__/**/*.test.ts` and `.spec.ts` to the include glob

## Verification

- `pnpm build` clean (TypeScript strict mode, `noUncheckedIndexedAccess` enabled)
- `pnpm exec biome check src/backtesting/analytics/regime-segmenter.ts` clean (test files and vitest.config.ts excluded by Biome config — by design, not a deviation)
- `pnpm vitest run src/backtesting/analytics/__tests__/regime-segmenter.test.ts` → 12/12 passing in <1s

## Test Coverage

| # | Test | What it proves |
|---|------|----------------|
| 1 | REGIMES has bull/bear/highVol non-empty | Constant is populated |
| 2 | bear regime matches CONTEXT.md windows exactly | No silent drift from locked windows |
| 3 | sliceByRegime filters to bear windows only | Date filter correctness |
| 4 | sliceByRegime filters trades by exitDate | Trade attribution to "completed in regime" semantics |
| 5 | sliceByRegime aggregates commission/slippage | Cost accounting per regime |
| 6 | metricsByRegime drops cross-window jump from Sharpe | **The key correctness fix** — proves volatility stays <1.0 even with 100k→180k inter-window gap |
| 7 | Single-point sub-window contributes no returns | Div-by-zero safety |
| 8 | maxDrawdown = worst per-sub-window | **The other key fix** — proves a 220k→200k in-window dip is captured (-9.09%) where naive splicing yields ~0 |
| 9 | Empty regime returns zero metrics, no throw | Operator can backtest a partial date range without crashes |
| 10 | Empty equity curve does not throw | Defensive on degenerate input |
| 11 | Single-window Sharpe/volatility match calculator output | Sanity check: our recomputation reduces to the canonical formula when there's one contiguous window |
| 12 | sliceByWindows on full-cover window returns full curve | Filter is inclusive on both bounds |

## Decisions Made

- **maxDrawdown = worst per-sub-window**: A naively spliced bull-regime equity curve (2019 + 2020-H2 + 2023 + 2024) shows the operator's portfolio rising from 100k to 300k+, but the only "drawdowns" the spliced curve reflects are the gaps where 2020-H1 and 2022 are missing — which are not drawdowns at all. The meaningful drawdown is the worst within-window peak-to-trough; reporting that is what the operator actually wants to know ("how bad did it get during a bull regime").
- **Sharpe/Sortino/volatility recomputed from per-sub-window returns**: Same logic. A single inter-window jump like 100k→180k (when 2019-12 transitions to 2020-07) produces a 65%+ "daily return" that distorts both the mean (slightly) and the stddev (catastrophically). The fix is to compute returns only within each contiguous sub-window and concatenate the resulting return series.
- **totalReturn/cagr left as calculator computes**: The calculator uses first-point equity, last-point equity, and the regime's date span (start-of-first-window to end-of-last-window). This treats the regime as one continuous "stretch the operator was deployed" which is a defensible read of "what did this strategy return during bull regimes." If Plan 05's results show this interpretation is misleading, switch to strict in-regime compounding then.
- **Empty regime returns zero**, not throw: Plan 05 runner will iterate over all 3 regimes × 1050+ backtests; a single ticker with sparse data in a regime should produce a zero row, not abort the whole sweep.

## Deviations from Plan

### Rule 3 (Blocking) — vitest config did not pick up tests in src/\*\*/\_\_tests\_\_/

**Found during:** Task 2
**Issue:** The plan specifies `src/backtesting/analytics/__tests__/regime-segmenter.test.ts` as the test file path, but `vitest.config.ts` only included `tests/**/*.test.ts` (the codebase had a split convention: most tests live under `tests/`, but some legacy tests live under `src/**/__tests__/` and were silently unreachable).
**Fix:** Extended the `include` glob to add `src/**/__tests__/**/*.test.ts` and `src/**/__tests__/**/*.spec.ts`.
**Files modified:** `vitest.config.ts`
**Verification:** `pnpm vitest run src/backtesting/analytics/__tests__/regime-segmenter.test.ts` now discovers and runs the 12 new tests in <1s, all passing.
**Committed in:** `ea9c40d` (part of Task 2 commit)
**Side effect (documented, not fixed):** This change also surfaces ~45 pre-existing failures in unrelated test files under `src/**/__tests__/` (`csv-loader.test.ts`, `data-validator.test.ts`, `rate-limiter.test.ts`, `performance-benchmarks.test.ts`). These failures existed before my changes and are out of scope for 07-04 — they are independent stale tests that the broader project should address in a maintenance pass. Decision to broaden vitest config rather than narrow-include only the new file: future tests in `src/**/__tests__/` should also be discovered without further config tweaks, and surfacing the stale tests is honestly better than hiding them.

## Edge Cases Not Covered (Deferred)

- **Beta / alpha / VaR per-regime**: Not computed because the calculator doesn't compute them at the whole-backtest level either (fields are optional in `PerformanceMetrics`). If a downstream phase needs them per-regime, add a recomputation pass alongside the existing overrides.
- **maxDrawdownDuration override**: Currently inherits the spliced-curve value from the calculator, which is misleading for the same reason maxDrawdown was (a "duration" that spans cross-window gaps is meaningless). Not overridden because no downstream consumer reads it in the M2-01 scope (the KEEP/MODIFY/DISCARD bar uses `maxDrawdown` percentage, not duration).
- **Trade-attribution by entryDate**: Trades are attributed to a regime by `exitDate` ("completed in this regime"). A trade entered in bull and exited in bear is counted as a bear-regime trade. This is the more defensible interpretation (PnL is realized at exit), but if a downstream phase wants the alternative (count by entry), expose an option.
- **Sortino edge case: zero downside returns**: Returns 0 (consistent with the calculator's behavior on monotonically-rising curves). A more nuanced report could distinguish "0 because no downside" from "0 because no data" — deferred until the recommendation generator decides whether this matters.

## Sources

- `.planning/phases/07-strategy-reality-check/07-CONTEXT.md` — regime window decisions (lines 50-55)
- `.planning/phases/07-strategy-reality-check/07-RESEARCH.md` — pitfall #5 (cross-window jump distortion); section 5 (post-process equity curve approach)
- `src/backtesting/analytics/performance-metrics.ts` — `PerformanceMetricsCalculator.calculate()` and `calculateDrawdowns()` reuse
- `src/backtesting/types/backtest-types.ts` — `BacktestResult`, `EquityCurvePoint`, `Trade`, `PerformanceMetrics`
- `tests/backtesting/analytics/performance-metrics.test.ts` — reference for test pattern + EquityCurvePoint construction
