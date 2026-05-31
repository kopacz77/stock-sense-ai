/**
 * Regime Segmenter
 *
 * Slices a full 2018-2025 backtest equity curve + trades into per-regime
 * metrics (bull / bear / high-vol) per the locked windows in
 * `.planning/phases/07-strategy-reality-check/07-CONTEXT.md`.
 *
 * Why this module exists:
 * `PerformanceMetricsCalculator.calculate()` operates on the whole-backtest
 * equity curve and trades. There is no built-in "give me metrics for this
 * date slice." Naively splicing discontinuous regime windows (e.g.,
 * bull = 2019 + 2020-H2 + 2023 + 2024 — with gaps between them) and feeding
 * the result to `calculate()` produces TWO subtle bugs:
 *
 *   1. Cross-window equity "jumps" between sub-windows (e.g., 2019-12-31 →
 *      2020-07-01) become single-day returns that distort volatility and
 *      thus distort Sharpe / Sortino.
 *
 *   2. `maxDrawdown` computed over the spliced curve becomes the cross-
 *      window peak-to-trough, which is not meaningful (the "drawdown"
 *      reflects a 6-month gap, not a sustained decline).
 *
 * This module addresses both by:
 *   - Recomputing daily returns PER contiguous sub-window (the inter-window
 *     jump return is implicitly dropped because each sub-window starts at
 *     index 1 of its own series).
 *   - Selecting `maxDrawdown` as the WORST per-sub-window drawdown rather
 *     than the spliced one.
 *
 * See RESEARCH.md pitfall #5 for full context.
 */

import type {
  BacktestResult,
  EquityCurvePoint,
  PerformanceMetrics,
  Trade,
} from "../types/backtest-types.js";
import { PerformanceMetricsCalculator } from "./performance-metrics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegimeName = "bull" | "bear" | "highVol";

export interface RegimeWindow {
  start: Date;
  end: Date;
}

/**
 * Result of slicing a (full equity curve + trades) by a regime's windows.
 *
 * - `equityCurve` is the chronologically-ordered concatenation of every
 *   per-window slice. Use this for cosmetic export only; do NOT compute
 *   day-over-day returns directly on it (cross-window jumps will distort).
 * - `trades` is every trade whose `exitDate` falls inside any window.
 * - `contiguousSubWindows` preserves the per-window slices so callers can
 *   recompute returns / drawdowns within each contiguous block.
 * - `totalCommissions` and `totalSlippage` aggregate the cost of the
 *   in-regime trades only.
 */
export interface SlicedResult {
  equityCurve: EquityCurvePoint[];
  trades: Trade[];
  contiguousSubWindows: Array<{
    window: RegimeWindow;
    equityCurve: EquityCurvePoint[];
  }>;
  totalCommissions: number;
  totalSlippage: number;
}

// ---------------------------------------------------------------------------
// Regime windows (locked in 07-CONTEXT.md)
// ---------------------------------------------------------------------------

/**
 * Per-regime date windows. Windows within a regime are NON-OVERLAPPING and
 * appear in chronological order.
 *
 * Source: `.planning/phases/07-strategy-reality-check/07-CONTEXT.md` →
 * "Regime Segmentation" decision.
 */
export const REGIMES: Record<RegimeName, RegimeWindow[]> = {
  bull: [
    { start: new Date("2019-01-01"), end: new Date("2019-12-31") },
    { start: new Date("2020-07-01"), end: new Date("2020-12-31") },
    { start: new Date("2023-01-01"), end: new Date("2023-12-31") },
    { start: new Date("2024-01-01"), end: new Date("2024-12-31") },
  ],
  bear: [
    { start: new Date("2018-10-01"), end: new Date("2018-12-31") },
    { start: new Date("2022-01-01"), end: new Date("2022-12-31") },
  ],
  highVol: [
    { start: new Date("2020-01-01"), end: new Date("2020-06-30") },
    { start: new Date("2025-01-01"), end: new Date("2025-12-31") },
  ],
};

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------

/**
 * Get the trade exit date in a way that tolerates the dual exitDate /
 * exitTime field naming used in our `Trade` interface.
 */
function tradeExitDate(t: Trade): Date | undefined {
  return t.exitDate ?? t.exitTime;
}

/**
 * Get the timestamp from an equity curve point (timestamp is primary, date
 * is an alias for compatibility).
 */
function pointTimestamp(p: EquityCurvePoint): Date {
  return p.timestamp ?? (p.date as Date);
}

function withinWindow(d: Date, w: RegimeWindow): boolean {
  return d >= w.start && d <= w.end;
}

/**
 * Slice a full-period equity curve + trades by the windows of a named
 * regime. Returns the spliced arrays plus the per-sub-window equity slices
 * so callers can recompute returns / drawdowns within each contiguous block.
 */
export function sliceByRegime(
  equityCurve: EquityCurvePoint[],
  trades: Trade[],
  regime: RegimeName,
): SlicedResult {
  return sliceByWindows(equityCurve, trades, REGIMES[regime]);
}

/**
 * Internal: slice by an arbitrary array of windows. Exposed for tests that
 * want to construct synthetic regimes (e.g., the "full-period regime"
 * sanity test).
 */
export function sliceByWindows(
  equityCurve: EquityCurvePoint[],
  trades: Trade[],
  windows: RegimeWindow[],
): SlicedResult {
  const contiguousSubWindows: SlicedResult["contiguousSubWindows"] = [];
  const splicedEquity: EquityCurvePoint[] = [];
  const slicedTrades: Trade[] = [];

  for (const window of windows) {
    const subCurve = equityCurve.filter((p) => withinWindow(pointTimestamp(p), window));
    contiguousSubWindows.push({ window, equityCurve: subCurve });
    splicedEquity.push(...subCurve);

    const subTrades = trades.filter((t) => {
      const exit = tradeExitDate(t);
      return exit !== undefined && withinWindow(exit, window);
    });
    slicedTrades.push(...subTrades);
  }

  let totalCommissions = 0;
  let totalSlippage = 0;
  for (const t of slicedTrades) {
    totalCommissions += t.commission ?? 0;
    totalSlippage += t.slippage ?? 0;
  }

  return {
    equityCurve: splicedEquity,
    trades: slicedTrades,
    contiguousSubWindows,
    totalCommissions,
    totalSlippage,
  };
}

// ---------------------------------------------------------------------------
// Per-regime metrics
// ---------------------------------------------------------------------------

/**
 * Compute the per-sub-window daily returns for a sliced regime. The
 * cross-window "jump" return between consecutive sub-windows is NOT
 * included — each sub-window independently starts at index 1, so the
 * jump from the previous window's last point to this window's first
 * point never produces a return.
 *
 * Returns an empty array if no sub-window has 2+ points (Sharpe/Sortino
 * will then be 0 by the calculator's div-by-zero guard).
 */
function computeSubWindowDailyReturns(
  contiguousSubWindows: SlicedResult["contiguousSubWindows"],
): number[] {
  const returns: number[] = [];
  for (const { equityCurve: sub } of contiguousSubWindows) {
    if (sub.length < 2) continue; // single-point sub-window contributes no returns
    for (let i = 1; i < sub.length; i++) {
      const prev = sub[i - 1]?.equity ?? 0;
      const curr = sub[i]?.equity ?? 0;
      if (prev === 0) continue;
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

/**
 * Compute the WORST per-sub-window maxDrawdown (most negative). Operates
 * on each sub-window independently so the result reflects an actual
 * sustained peak-to-trough decline within the regime, not the artifact
 * of splicing.
 *
 * Returns 0 when there is no qualifying sub-window data.
 */
function worstSubWindowMaxDrawdown(
  contiguousSubWindows: SlicedResult["contiguousSubWindows"],
): number {
  let worst = 0;
  for (const { equityCurve: sub } of contiguousSubWindows) {
    if (sub.length === 0) continue;
    const drawdowns = PerformanceMetricsCalculator.calculateDrawdowns(sub);
    if (drawdowns.length === 0) continue;
    const subMax = Math.min(...drawdowns.map((d) => d.drawdown));
    if (subMax < worst) worst = subMax;
  }
  return worst;
}

/**
 * Standard-deviation helper (sample stddev, n-1 denominator). Returns 0
 * for arrays with <2 entries.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Annualized Sharpe ratio (risk-free = 0) computed from a pre-computed
 * daily-returns series. Matches `PerformanceMetricsCalculator`'s formula:
 * Sharpe = (mean(returns) * 252) / (stddev(returns) * sqrt(252)).
 */
function sharpeFromReturns(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const dailyVol = stddev(returns);
  if (dailyVol === 0) return 0;
  const annualizedReturn = mean * 252;
  const annualizedVol = dailyVol * Math.sqrt(252);
  return annualizedReturn / annualizedVol;
}

/**
 * Annualized Sortino ratio (downside-only stddev). Matches
 * `PerformanceMetricsCalculator`'s formula.
 */
function sortinoFromReturns(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  if (downside.length === 0) return 0;
  const downsideVariance = downside.reduce((sum, r) => sum + r * r, 0) / downside.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;
  const annualizedReturn = mean * 252;
  const annualizedDownsideDev = downsideDev * Math.sqrt(252);
  return annualizedReturn / annualizedDownsideDev;
}

/**
 * Compute per-regime performance metrics from a full-period backtest result.
 *
 * Algorithm:
 *   1. Slice equity curve + trades by the regime's windows.
 *   2. Run `PerformanceMetricsCalculator.calculate()` on the spliced data
 *      to get baseline trade-statistics + return-aggregate fields (totalReturn,
 *      winRate, profitFactor, avgWin/Loss, expectancy, etc.). These are
 *      computed correctly from the trade list and spliced endpoints and
 *      don't suffer from the splicing distortion.
 *   3. OVERRIDE the splicing-sensitive fields:
 *      - `sharpeRatio` / `sortinoRatio`: recomputed from per-sub-window daily
 *        returns (cross-window jump returns excluded).
 *      - `volatility`: recomputed from the same per-sub-window returns.
 *      - `maxDrawdown` / `calmarRatio`: maxDrawdown replaced with the worst
 *        per-sub-window drawdown; calmarRatio re-derived from CAGR / |maxDD|.
 *
 * Edge cases:
 *   - Empty regime (no equity points in any window) → returns a zero-filled
 *     `PerformanceMetrics` (does not throw).
 *   - Sub-window with only 1 point → contributes no daily returns and no
 *     drawdown calculation; safe.
 *   - Fewer than 2 total returns across all sub-windows → Sharpe / Sortino
 *     / volatility are 0.
 *
 * Note: `totalReturn` / `cagr` / `annualizedReturn` are computed by the
 * underlying calculator from `(firstEquity, lastEquity, startDate, endDate)`
 * of the spliced curve. Because we use the spliced first/last points and
 * the regime's full date span, this measures "compounded growth of $1
 * deployed at regime start through regime end (including the time spent
 * outside the regime)" — which is a defensible interpretation for the
 * KEEP/MODIFY/DISCARD bar. If the operator later wants strict in-regime
 * compounding, that's a separate, more invasive change.
 */
export function metricsByRegime(result: BacktestResult, regime: RegimeName): PerformanceMetrics {
  return computeMetricsForWindows(result.equityCurve, result.trades, REGIMES[regime]);
}

/**
 * Internal: like `metricsByRegime` but takes arbitrary windows. Exposed
 * for tests (e.g., sanity-check that a single-window regime spanning the
 * whole curve produces identical metrics to running the calculator directly
 * — modulo the known overrides, which by design match on a single window).
 */
export function computeMetricsForWindows(
  equityCurve: EquityCurvePoint[],
  trades: Trade[],
  windows: RegimeWindow[],
): PerformanceMetrics {
  const sliced = sliceByWindows(equityCurve, trades, windows);

  // Empty regime → return zero metrics, do not throw.
  if (sliced.equityCurve.length === 0) {
    return zeroMetrics();
  }

  const firstPoint = sliced.equityCurve[0];
  const lastPoint = sliced.equityCurve[sliced.equityCurve.length - 1];
  if (!firstPoint || !lastPoint) {
    return zeroMetrics();
  }

  const sliceInitialCapital = firstPoint.equity;
  const firstWindow = windows[0];
  const lastWindow = windows[windows.length - 1];
  if (!firstWindow || !lastWindow) {
    return zeroMetrics();
  }
  const startDate = firstWindow.start;
  const endDate = lastWindow.end;

  // Step 1+2: baseline metrics from the calculator. Trade-statistics
  // (winRate, profitFactor, expectancy, ...) and aggregate-return fields
  // (totalReturn, cagr, annualizedReturn) are sound; volatility / Sharpe /
  // Sortino / maxDrawdown are NOT and will be overridden below.
  const baseline = PerformanceMetricsCalculator.calculate(
    sliced.equityCurve,
    sliced.trades,
    sliceInitialCapital,
    startDate,
    endDate,
    sliced.totalCommissions,
    sliced.totalSlippage,
  );

  // Step 3: override splicing-sensitive fields with per-sub-window
  // recomputation.
  const subWindowReturns = computeSubWindowDailyReturns(sliced.contiguousSubWindows);
  const recomputedSharpe = sharpeFromReturns(subWindowReturns);
  const recomputedSortino = sortinoFromReturns(subWindowReturns);
  const recomputedVolatility =
    subWindowReturns.length >= 2 ? stddev(subWindowReturns) * Math.sqrt(252) : 0;
  const recomputedMaxDrawdown = worstSubWindowMaxDrawdown(sliced.contiguousSubWindows);
  const recomputedCalmarRatio =
    recomputedMaxDrawdown !== 0 ? baseline.cagr / Math.abs(recomputedMaxDrawdown) : 0;

  return {
    ...baseline,
    sharpeRatio: recomputedSharpe,
    sortinoRatio: recomputedSortino,
    volatility: recomputedVolatility,
    maxDrawdown: recomputedMaxDrawdown,
    calmarRatio: recomputedCalmarRatio,
  };
}

// ---------------------------------------------------------------------------
// Zero metrics
// ---------------------------------------------------------------------------

function zeroMetrics(): PerformanceMetrics {
  return {
    totalReturn: 0,
    totalReturnDollar: 0,
    cagr: 0,
    annualizedReturn: 0,
    volatility: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    maxDrawdown: 0,
    maxDrawdownDuration: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    avgWinPercent: 0,
    avgLossPercent: 0,
    largestWin: 0,
    largestLoss: 0,
    profitFactor: 0,
    payoffRatio: 0,
    expectancy: 0,
    expectancyPercent: 0,
    avgHoldingPeriod: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
  };
}
