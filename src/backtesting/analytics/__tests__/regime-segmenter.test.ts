/**
 * Regime Segmenter Tests
 *
 * Verifies the subtle correctness properties of the per-regime metrics
 * computation:
 *   - Window filtering (equity points and trades)
 *   - Per-sub-window daily-return recomputation (no cross-window jumps)
 *   - Worst-per-sub-window maxDrawdown selection
 *   - Empty-regime safety
 *   - Sanity: single-window regime spanning the whole curve matches
 *     the calculator's direct output (for splicing-immune fields)
 */

import { describe, expect, it } from "vitest";
import { PerformanceMetricsCalculator } from "../performance-metrics.js";
import {
  REGIMES,
  type RegimeWindow,
  computeMetricsForWindows,
  metricsByRegime,
  sliceByRegime,
  sliceByWindows,
} from "../regime-segmenter.js";
import type {
  BacktestConfig,
  BacktestResult,
  EquityCurvePoint,
  Trade,
} from "../../types/backtest-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a daily equity curve from `from` to `to` (inclusive of both),
 * deriving equity at each point via the supplied function (default: flat
 * at 100k).
 */
function buildDailyEquityCurve(
  from: Date,
  to: Date,
  equityFn: (date: Date, index: number) => number = () => 100_000,
): EquityCurvePoint[] {
  const out: EquityCurvePoint[] = [];
  const cursor = new Date(from);
  let i = 0;
  while (cursor <= to) {
    const date = new Date(cursor);
    const equity = equityFn(date, i);
    out.push({
      timestamp: date,
      date,
      equity,
      cash: equity,
      positionsValue: 0,
      marketValue: 0,
      cumulativeReturn: 0,
      cumulativeReturns: 0,
      dailyReturn: 0,
      drawdown: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return out;
}

/**
 * Build a synthetic equity curve from explicit (date, equity) pairs.
 */
function buildEquityCurveFromPairs(
  pairs: Array<{ date: Date; equity: number }>,
): EquityCurvePoint[] {
  return pairs.map(({ date, equity }) => ({
    timestamp: new Date(date),
    date: new Date(date),
    equity,
    cash: equity,
    positionsValue: 0,
    marketValue: 0,
    cumulativeReturn: 0,
    cumulativeReturns: 0,
    dailyReturn: 0,
    drawdown: 0,
  }));
}

/**
 * Build a minimal `Trade` object with sensible defaults; override fields
 * via `overrides`.
 */
function buildTrade(overrides: Partial<Trade> & { exitDate: Date }): Trade {
  return {
    id: overrides.id ?? `t-${overrides.exitDate.toISOString()}`,
    symbol: overrides.symbol ?? "TEST",
    entryPrice: overrides.entryPrice ?? 100,
    quantity: overrides.quantity ?? 1,
    exitPrice: overrides.exitPrice ?? 110,
    exitDate: overrides.exitDate,
    exitReason: overrides.exitReason ?? "SIGNAL",
    commission: overrides.commission ?? 0,
    slippage: overrides.slippage ?? 0,
    pnl: overrides.pnl ?? 10,
    pnlPercent: overrides.pnlPercent ?? 10,
    holdingPeriod: overrides.holdingPeriod ?? 1,
  };
}

/**
 * Build a minimal `BacktestResult` for tests of `metricsByRegime`.
 */
function buildBacktestResult(
  equityCurve: EquityCurvePoint[],
  trades: Trade[],
): BacktestResult {
  const config: BacktestConfig = {
    id: "test",
    name: "test",
    symbols: ["TEST"],
    startDate: equityCurve[0]?.timestamp ?? new Date("2018-01-01"),
    endDate:
      equityCurve[equityCurve.length - 1]?.timestamp ?? new Date("2025-12-31"),
    initialCapital: equityCurve[0]?.equity ?? 100_000,
    strategy: { name: "test", parameters: {} },
    commission: { type: "FIXED", fixedFee: 0 },
    slippage: { type: "FIXED", fixedAmount: 0 },
  };
  return {
    config,
    timestamp: new Date(),
    executionTimeMs: 0,
    metrics: {} as BacktestResult["metrics"],
    equityCurve,
    trades,
    portfolioSnapshots: [],
    errors: [],
    statistics: {} as BacktestResult["statistics"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("regime-segmenter", () => {
  describe("REGIMES constant", () => {
    it("exposes bull / bear / highVol with non-empty windows", () => {
      expect(REGIMES.bull.length).toBeGreaterThan(0);
      expect(REGIMES.bear.length).toBeGreaterThan(0);
      expect(REGIMES.highVol.length).toBeGreaterThan(0);
    });

    it("matches the CONTEXT.md locked windows for bear (2018-Q4 + 2022)", () => {
      expect(REGIMES.bear).toEqual([
        { start: new Date("2018-10-01"), end: new Date("2018-12-31") },
        { start: new Date("2022-01-01"), end: new Date("2022-12-31") },
      ]);
    });
  });

  describe("sliceByRegime", () => {
    it("filters equity points to only bear windows (2018-Q4 + 2022)", () => {
      // Full 2018-2025 daily curve, flat equity.
      const curve = buildDailyEquityCurve(
        new Date("2018-01-01"),
        new Date("2025-12-31"),
      );

      const sliced = sliceByRegime(curve, [], "bear");

      expect(sliced.contiguousSubWindows.length).toBe(2);

      // Every spliced point falls in one of the two bear windows.
      for (const p of sliced.equityCurve) {
        const t = p.timestamp;
        const in2018Q4 =
          t >= new Date("2018-10-01") && t <= new Date("2018-12-31");
        const in2022 =
          t >= new Date("2022-01-01") && t <= new Date("2022-12-31");
        expect(in2018Q4 || in2022).toBe(true);
      }

      // No points from non-bear years.
      const stray = sliced.equityCurve.filter((p) => {
        const y = p.timestamp.getUTCFullYear();
        return y === 2019 || y === 2020 || y === 2021 || y === 2023 || y === 2024 || y === 2025;
      });
      expect(stray.length).toBe(0);
    });

    it("filters trades by exitDate falling inside any bull window", () => {
      const curve = buildDailyEquityCurve(
        new Date("2018-01-01"),
        new Date("2025-12-31"),
      );
      const trades: Trade[] = [
        buildTrade({ exitDate: new Date("2018-06-15") }), // not bull
        buildTrade({ exitDate: new Date("2019-04-01") }), // bull
        buildTrade({ exitDate: new Date("2020-03-15") }), // high-vol, not bull
        buildTrade({ exitDate: new Date("2020-08-01") }), // bull (2020-H2)
        buildTrade({ exitDate: new Date("2022-06-01") }), // bear
        buildTrade({ exitDate: new Date("2023-07-04") }), // bull
        buildTrade({ exitDate: new Date("2024-12-01") }), // bull
        buildTrade({ exitDate: new Date("2025-05-01") }), // high-vol, not bull
      ];

      const sliced = sliceByRegime(curve, trades, "bull");

      const exitYears = sliced.trades
        .map((t) => t.exitDate?.getUTCFullYear() ?? -1)
        .sort();
      expect(exitYears).toEqual([2019, 2020, 2023, 2024]);
    });

    it("aggregates totalCommissions and totalSlippage across in-regime trades", () => {
      const curve = buildDailyEquityCurve(
        new Date("2018-01-01"),
        new Date("2025-12-31"),
      );
      const trades: Trade[] = [
        buildTrade({ exitDate: new Date("2019-04-01"), commission: 1, slippage: 0.5 }),
        buildTrade({ exitDate: new Date("2024-12-01"), commission: 2, slippage: 1.5 }),
        buildTrade({ exitDate: new Date("2022-06-01"), commission: 99, slippage: 99 }), // bear, excluded
      ];

      const sliced = sliceByRegime(curve, trades, "bull");

      expect(sliced.totalCommissions).toBe(3);
      expect(sliced.totalSlippage).toBe(2);
    });
  });

  describe("metricsByRegime - per-sub-window daily-return recomputation", () => {
    it("does NOT include the cross-window jump return in Sharpe", () => {
      // Build a curve where bull windows have smooth in-window growth but a
      // GIANT cross-window jump. Naive splicing would treat the jump as a
      // single-day return and blow up volatility / inflate Sharpe magnitude.
      //
      // Bull regime windows: 2019, 2020-H2, 2023, 2024.
      // We only populate 2019-12 (climbing 100k → 110k linearly) and
      // 2020-07 (jumping to 180k, then climbing smoothly to 200k).
      const pairs: Array<{ date: Date; equity: number }> = [];

      // 2019-12: 10 daily points climbing 100k → 110k
      for (let i = 0; i < 10; i++) {
        pairs.push({
          date: new Date(2019, 11, 1 + i), // Dec 1, 2, ..., Dec 10
          equity: 100_000 + i * 1_000, // 100k → 109k
        });
      }
      // Gap covered by other regimes (2020-H1 = highVol, excluded from bull)

      // 2020-07: 10 daily points climbing 180k → 200k
      for (let i = 0; i < 10; i++) {
        pairs.push({
          date: new Date(2020, 6, 1 + i), // Jul 1, 2, ..., Jul 10
          equity: 180_000 + i * 2_000, // 180k → 198k
        });
      }
      // Also include some 2023 and 2024 points so we have 4 sub-windows
      for (let i = 0; i < 5; i++) {
        pairs.push({
          date: new Date(2023, 5, 1 + i),
          equity: 250_000 + i * 1_000,
        });
        pairs.push({
          date: new Date(2024, 5, 1 + i),
          equity: 300_000 + i * 1_000,
        });
      }

      const curve = buildEquityCurveFromPairs(pairs);
      const result = buildBacktestResult(curve, []);

      const metrics = metricsByRegime(result, "bull");

      // Sharpe must be finite and reasonable. With per-sub-window
      // recomputation, the only returns are small in-window day-over-day
      // moves (~0.5-1.1% / day). With naive splicing, the cross-window
      // jump 109k→180k would be a ~65% single-day return, distorting
      // volatility into the stratosphere AND distorting the mean.
      //
      // The fix-correctness proof: Sharpe should be FINITE and the
      // recomputed volatility (annualized stddev) should be far below
      // what a 65% jump would yield (which is on the order of 10x the
      // sane value).
      expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
      expect(Number.isFinite(metrics.volatility)).toBe(true);

      // The naive-splicing volatility would include a ~65% daily return.
      // Annualized stddev with even a single 0.65 outlier among ~30
      // sub-1% returns is enormous (>3.0 in decimal terms, i.e. 300%+).
      // Per-sub-window recomputation should yield a much smaller value.
      expect(metrics.volatility).toBeLessThan(1.0);

      // Climbing curve → positive Sharpe.
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });

    it("contributes no returns from a single-point sub-window", () => {
      // Construct a regime via the internal API with two windows:
      //   - W1: single point (contributes 0 returns)
      //   - W2: many points (contributes returns)
      const w1Pairs: Array<{ date: Date; equity: number }> = [
        { date: new Date(2020, 0, 1), equity: 100_000 },
      ];
      const w2Pairs: Array<{ date: Date; equity: number }> = [];
      for (let i = 0; i < 20; i++) {
        w2Pairs.push({
          date: new Date(2021, 0, 1 + i),
          equity: 100_000 + i * 500, // smooth growth
        });
      }
      const curve = buildEquityCurveFromPairs([...w1Pairs, ...w2Pairs]);
      const windows: RegimeWindow[] = [
        { start: new Date(2020, 0, 1), end: new Date(2020, 0, 31) },
        { start: new Date(2021, 0, 1), end: new Date(2021, 0, 31) },
      ];

      const metrics = computeMetricsForWindows(curve, [], windows);

      // Sharpe is finite and computed only from W2's smooth growth (positive).
      expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });
  });

  describe("metricsByRegime - maxDrawdown is worst per-sub-window", () => {
    it("captures within-sub-window drawdown rather than cross-window peak-to-trough", () => {
      // Construct two sub-windows where each window has a small in-window
      // drawdown but the overall curve is monotonically rising. A naive
      // cross-window maxDrawdown would be ~0 (curve never declines from
      // peak); the correct per-sub-window worst is the larger of the two
      // in-window dips.
      const pairs: Array<{ date: Date; equity: number }> = [];

      // 2019: 100k → 120k with a 5k dip in the middle
      //  100k, 105k, 110k, 105k (DIP), 115k, 120k
      pairs.push({ date: new Date(2019, 0, 1), equity: 100_000 });
      pairs.push({ date: new Date(2019, 0, 2), equity: 105_000 });
      pairs.push({ date: new Date(2019, 0, 3), equity: 110_000 });
      pairs.push({ date: new Date(2019, 0, 4), equity: 105_000 }); // -4.5% from 110k
      pairs.push({ date: new Date(2019, 0, 5), equity: 115_000 });
      pairs.push({ date: new Date(2019, 0, 6), equity: 120_000 });

      // 2023: 200k → 220k with a 20k dip in the middle (larger drawdown)
      //  200k, 210k, 220k, 200k (DIP, -9.09%), 215k, 220k
      pairs.push({ date: new Date(2023, 0, 1), equity: 200_000 });
      pairs.push({ date: new Date(2023, 0, 2), equity: 210_000 });
      pairs.push({ date: new Date(2023, 0, 3), equity: 220_000 });
      pairs.push({ date: new Date(2023, 0, 4), equity: 200_000 }); // -9.09% from 220k
      pairs.push({ date: new Date(2023, 0, 5), equity: 215_000 });
      pairs.push({ date: new Date(2023, 0, 6), equity: 220_000 });

      // 2024 + 2020-H2 sub-windows: include single points so they don't
      // add drawdown but the bull regime has all 4 windows.
      pairs.push({ date: new Date(2020, 7, 1), equity: 130_000 });
      pairs.push({ date: new Date(2024, 0, 1), equity: 250_000 });

      const curve = buildEquityCurveFromPairs(pairs);
      const result = buildBacktestResult(curve, []);

      const metrics = metricsByRegime(result, "bull");

      // Worst per-sub-window drawdown is the 2023 dip: 220k → 200k = -9.09%.
      // PerformanceMetricsCalculator returns drawdown as signed-percent,
      // so the value is ~-9.09.
      expect(metrics.maxDrawdown).toBeLessThan(-5); // demonstrably non-zero
      expect(metrics.maxDrawdown).toBeCloseTo(-9.09, 1);
    });
  });

  describe("metricsByRegime - edge cases", () => {
    it("returns zero metrics when no equity points fall in any regime window", () => {
      // Curve only contains 2021 points (no regime overlaps 2021 fully —
      // bull = 2019/2020-H2/2023/2024, bear = 2018-Q4/2022, highVol = 2020-H1/2025)
      const curve = buildDailyEquityCurve(
        new Date("2021-01-01"),
        new Date("2021-12-31"),
      );
      const result = buildBacktestResult(curve, []);

      // bear regime windows don't overlap 2021.
      const metrics = metricsByRegime(result, "bear");

      expect(metrics.totalTrades).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
      expect(metrics.sortinoRatio).toBe(0);
      expect(metrics.volatility).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.totalReturn).toBe(0);
    });

    it("does not throw when equity curve is empty", () => {
      const result = buildBacktestResult([], []);
      expect(() => metricsByRegime(result, "bull")).not.toThrow();
      const metrics = metricsByRegime(result, "bull");
      expect(metrics.totalTrades).toBe(0);
    });
  });

  describe("sanity: full-period regime via internal API", () => {
    it("recomputed-Sharpe matches direct calculator output when there is exactly one contiguous window", () => {
      // 60 daily points of a smooth-with-noise curve, single window covering
      // the whole span. With one contiguous sub-window, our per-sub-window
      // recomputation must yield the same daily-returns series that the
      // calculator computes internally — so Sharpe should match (modulo
      // the difference that the calculator only includes points whose
      // `.returns` field is defined; for our spliced curve those returns
      // are computed from the equity differences just like our function
      // does internally).
      //
      // To make the comparison apples-to-apples we pre-populate the
      // `returns` field on the equity curve with the day-over-day return
      // (which is what `EquityCurveBuilder` does in production).
      const pairs: Array<{ date: Date; equity: number }> = [];
      let equity = 100_000;
      for (let i = 0; i < 60; i++) {
        // Pseudo-random but deterministic noise
        const dailyReturn = 0.002 + ((i * 7) % 11) / 1000 - 0.005;
        equity = equity * (1 + dailyReturn);
        pairs.push({ date: new Date(2022, 0, 1 + i), equity });
      }
      const curve = buildEquityCurveFromPairs(pairs);
      // Populate `.returns` for the calculator's internal Sharpe.
      for (let i = 1; i < curve.length; i++) {
        const prev = curve[i - 1]!.equity;
        const curr = curve[i]!.equity;
        curve[i]!.returns = (curr - prev) / prev;
      }

      const singleWindow: RegimeWindow[] = [
        { start: pairs[0]!.date, end: pairs[pairs.length - 1]!.date },
      ];

      const ourMetrics = computeMetricsForWindows(curve, [], singleWindow);
      const directMetrics = PerformanceMetricsCalculator.calculate(
        curve,
        [],
        curve[0]!.equity,
        singleWindow[0]!.start,
        singleWindow[0]!.end,
        0,
        0,
      );

      // Sharpe / volatility should match to high precision: both methods
      // compute the same daily-returns array from the same curve.
      expect(ourMetrics.sharpeRatio).toBeCloseTo(directMetrics.sharpeRatio, 5);
      expect(ourMetrics.volatility).toBeCloseTo(directMetrics.volatility, 5);

      // totalReturn / cagr come straight from the baseline calculator;
      // these match exactly.
      expect(ourMetrics.totalReturn).toBeCloseTo(directMetrics.totalReturn, 5);
      expect(ourMetrics.cagr).toBeCloseTo(directMetrics.cagr, 5);
    });

    it("sliceByWindows on a single covering window returns the full curve", () => {
      const curve = buildDailyEquityCurve(
        new Date("2022-01-01"),
        new Date("2022-12-31"),
      );
      const windows: RegimeWindow[] = [
        { start: new Date("2022-01-01"), end: new Date("2022-12-31") },
      ];
      const sliced = sliceByWindows(curve, [], windows);

      expect(sliced.equityCurve.length).toBe(curve.length);
      expect(sliced.contiguousSubWindows.length).toBe(1);
      expect(sliced.contiguousSubWindows[0]!.equityCurve.length).toBe(curve.length);
    });
  });
});
