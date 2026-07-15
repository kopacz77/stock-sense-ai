/**
 * VaR Calculator Tests
 * CRITICAL: Tests Value at Risk calculations for accuracy
 *
 * Targets the REAL public API:
 *   const calc = new VaRCalculator();
 *   const result: VaRResult = await calc.calculateVaR(positions, historicalReturns, options);
 *
 * where:
 *   - positions:         Position[]                    (uses .symbol and .value)
 *   - historicalReturns: Map<string, number[]>         (per-symbol DECIMAL daily returns, e.g. 0.02 = +2%)
 *   - options:           { method, confidenceLevel, timeHorizon, lookbackPeriod? }
 *
 * VaRResult exposes oneDayVaR95 / oneDayVaR99 / tenDayVaR95 / tenDayVaR99 (all positive
 * loss magnitudes in dollars), plus method / portfolioValue / calculationDate / interpretation.
 *
 * NOTE: The 95%/99% confidence levels and the 1-day/10-day horizons are produced INTERNALLY
 * for every call (the options.confidenceLevel / options.timeHorizon scalars are not used to
 * select a percentile). So "confidence rises -> VaR rises" is asserted by comparing the 99 vs
 * 95 fields of a single result, and horizon scaling by comparing tenDay vs oneDay fields.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VaRCalculator } from "../../../src/risk/metrics/var-calculator.js";
import type { Position } from "../../../src/types/trading.js";
import type { VaRCalculationOptions, VaRMethod } from "../../../src/risk/types/risk-types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a single Position whose dollar `value` drives the VaR math. */
function makePosition(symbol: string, value: number): Position {
  const price = 100;
  return {
    symbol,
    entryPrice: price,
    currentPrice: price,
    quantity: value / price,
    value,
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    entryDate: new Date("2024-01-01"),
    strategy: "TEST",
    riskAmount: 0,
  };
}

/** A one-asset portfolio worth `value` dollars mapped to `returns`. */
function singleAsset(
  value: number,
  returns: number[],
  symbol = "AAPL"
): { positions: Position[]; historicalReturns: Map<string, number[]> } {
  return {
    positions: [makePosition(symbol, value)],
    historicalReturns: new Map([[symbol, returns]]),
  };
}

function opts(
  method: VaRMethod,
  confidenceLevel = 0.95,
  timeHorizon = 1
): VaRCalculationOptions {
  return { method, confidenceLevel, timeHorizon };
}

describe("VaRCalculator", () => {
  let calc: VaRCalculator;
  let returns: number[];
  const portfolioValue = 100_000;

  beforeEach(() => {
    calc = new VaRCalculator();
    // Realistic daily returns as DECIMAL fractions (e.g. -0.032 = -3.2%),
    // with a clearly-negative left tail so downside VaR is well defined.
    returns = [
      -0.032, -0.025, -0.021, -0.018, -0.012, -0.009, -0.005, -0.002, 0.001, 0.004,
      0.007, 0.01, 0.013, 0.016, 0.019, 0.022, 0.026, 0.011, 0.015, -0.008,
    ];
  });

  describe("Historical VaR", () => {
    it("should calculate historical VaR correctly", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      expect(result.method).toBe("historical");
      expect(result.portfolioValue).toBeCloseTo(portfolioValue, 2);
      // VaR is a positive loss magnitude, strictly below the whole portfolio.
      expect(result.oneDayVaR95).toBeGreaterThan(0);
      expect(result.oneDayVaR95).toBeLessThan(portfolioValue);
    });

    it("should locate VaR at the historical loss percentile", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      // The 95% one-day VaR must correspond to a return in the observed left tail.
      // Worst observed daily loss = 3.2% of value -> VaR cannot exceed that.
      const worstLoss = portfolioValue * Math.abs(Math.min(...returns));
      expect(result.oneDayVaR95).toBeGreaterThan(0);
      expect(result.oneDayVaR95).toBeLessThanOrEqual(worstLoss + 1e-6);
    });

    it("should report higher VaR at 99% than at 95% confidence", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      // Deeper into the tail (99%) is at least as severe as 95%.
      expect(result.oneDayVaR99).toBeGreaterThanOrEqual(result.oneDayVaR95);
      expect(result.tenDayVaR99).toBeGreaterThanOrEqual(result.tenDayVaR95);
    });

    it("should scale VaR to a 10-day horizon by sqrt(time)", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      expect(result.tenDayVaR95).toBeGreaterThan(result.oneDayVaR95);
      // sqrt(10) scaling rule.
      expect(result.tenDayVaR95 / result.oneDayVaR95).toBeCloseTo(Math.sqrt(10), 3);
    });

    it("should throw on empty return history (insufficient data)", async () => {
      const positions = [makePosition("AAPL", portfolioValue)];
      const emptyReturns = new Map<string, number[]>(); // no data for the symbol
      await expect(
        calc.calculateVaR(positions, emptyReturns, opts("historical"))
      ).rejects.toThrow(/insufficient historical data/i);
    });

    it("should handle all-positive returns (no downside loss)", async () => {
      const positive = [0.01, 0.02, 0.03, 0.04, 0.05];
      const { positions, historicalReturns } = singleAsset(portfolioValue, positive);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      // No historical losses -> reported VaR magnitude is small and non-negative.
      expect(result.oneDayVaR95).toBeGreaterThanOrEqual(0);
      expect(result.oneDayVaR95).toBeLessThan(portfolioValue);
    });

    it("should report large VaR when all returns are negative", async () => {
      const negative = [-0.01, -0.02, -0.03, -0.04, -0.05];
      const { positions, historicalReturns } = singleAsset(portfolioValue, negative);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      expect(result.oneDayVaR95).toBeGreaterThan(0);
      // Every day lost money -> VaR is a material fraction (> 1%) of the portfolio.
      expect(result.oneDayVaR95).toBeGreaterThan(portfolioValue * 0.01);
    });
  });

  describe("Parametric VaR (Variance-Covariance)", () => {
    it("should calculate parametric VaR correctly", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("parametric"));

      expect(result.method).toBe("parametric");
      expect(result.oneDayVaR95).toBeGreaterThan(0);
      expect(result.oneDayVaR95).toBeLessThan(portfolioValue);
    });

    it("should follow the normal-distribution z-score formula", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("parametric"));

      // Replicate the model: VaR = |PV * (z * sigma - mean)|, one-tailed z, sample stdev (n-1).
      const n = returns.length;
      const mean = returns.reduce((a, b) => a + b, 0) / n;
      const variance =
        returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1); // Bessel's correction
      const stdDev = Math.sqrt(variance);
      const Z95 = 1.645;
      const expectedVaR95 = Math.abs(portfolioValue * (Z95 * stdDev - mean));

      expect(result.oneDayVaR95).toBeCloseTo(expectedVaR95, 0); // within $0.50 (rounding)
    });

    it("should report higher VaR for higher volatility", async () => {
      const lowVol = [0.005, -0.005, 0.005, -0.005, 0.005, -0.005];
      const highVol = [0.05, -0.05, 0.05, -0.05, 0.05, -0.05];

      const low = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, lowVol)),
        opts("parametric")
      );
      const high = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, highVol)),
        opts("parametric")
      );

      expect(high.oneDayVaR95).toBeGreaterThan(low.oneDayVaR95);
    });
  });

  describe("Monte Carlo VaR", () => {
    it("should calculate Monte Carlo VaR correctly", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("monte-carlo"));

      expect(result.method).toBe("monte-carlo");
      expect(result.oneDayVaR95).toBeGreaterThan(0);
      expect(result.oneDayVaR95).toBeLessThan(portfolioValue);
    });

    it("should produce stable estimates across independent runs", async () => {
      const runA = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, returns)),
        opts("monte-carlo")
      );
      const runB = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, returns)),
        opts("monte-carlo")
      );

      // 10k simulations each -> the 5% quantile estimate should be reproducible within a
      // wide statistical tolerance (unseeded Math.random, so assert a band, not equality).
      const relDiff = Math.abs(runA.oneDayVaR95 - runB.oneDayVaR95) / runA.oneDayVaR95;
      expect(relDiff).toBeLessThan(0.3);
    });

    it("should scale Monte Carlo VaR across time horizons", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("monte-carlo"));

      expect(result.tenDayVaR95).toBeGreaterThan(result.oneDayVaR95);
      expect(result.tenDayVaR95 / result.oneDayVaR95).toBeCloseTo(Math.sqrt(10), 3);
    });
  });

  describe("Comparison of Methods", () => {
    it("should produce positive VaR of the same order across all three methods", async () => {
      const hist = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, returns)),
        opts("historical")
      );
      const param = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, returns)),
        opts("parametric")
      );
      const mc = await calc.calculateVaR(
        ...toArgs(singleAsset(portfolioValue, returns)),
        opts("monte-carlo")
      );

      expect(hist.oneDayVaR95).toBeGreaterThan(0);
      expect(param.oneDayVaR95).toBeGreaterThan(0);
      expect(mc.oneDayVaR95).toBeGreaterThan(0);

      const values = [hist.oneDayVaR95, param.oneDayVaR95, mc.oneDayVaR95];
      const ratio = Math.max(...values) / Math.min(...values);
      expect(ratio).toBeLessThan(4); // same order of magnitude
    });
  });

  describe("Edge Cases", () => {
    it("should handle a single historical observation", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, [-0.015]);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      expect(Number.isFinite(result.oneDayVaR95)).toBe(true);
      expect(result.oneDayVaR95).toBeGreaterThanOrEqual(0);
    });

    it("should handle a very small portfolio value", async () => {
      const small = 100;
      const { positions, historicalReturns } = singleAsset(small, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));

      expect(result.oneDayVaR95).toBeGreaterThanOrEqual(0);
      expect(result.oneDayVaR95).toBeLessThan(small);
    });

    it("should handle a very large portfolio value", async () => {
      const large = 1_000_000_000;
      const { positions, historicalReturns } = singleAsset(large, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("parametric"));

      expect(result.oneDayVaR95).toBeGreaterThan(0);
      expect(result.oneDayVaR95).toBeLessThan(large);
    });

    it("should report a more severe VaR at the deeper (99%) confidence tail", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const result = await calc.calculateVaR(positions, historicalReturns, opts("parametric"));

      // Parametric 99% uses a larger z-score than 95%, so must be strictly larger here
      // (non-zero volatility guarantees strict inequality).
      expect(result.oneDayVaR99).toBeGreaterThan(result.oneDayVaR95);
      expect(result.tenDayVaR99).toBeGreaterThan(result.tenDayVaR95);
    });
  });

  describe("Performance", () => {
    it("should calculate historical VaR quickly (< 100ms)", async () => {
      const { positions, historicalReturns } = singleAsset(portfolioValue, returns);
      const start = Date.now();
      await calc.calculateVaR(positions, historicalReturns, opts("historical"));
      expect(Date.now() - start).toBeLessThan(100);
    });

    it("should handle large datasets efficiently (< 500ms)", async () => {
      const largeReturns = Array.from({ length: 1000 }, () => (Math.random() - 0.5) * 0.06);
      const { positions, historicalReturns } = singleAsset(portfolioValue, largeReturns);

      const start = Date.now();
      const result = await calc.calculateVaR(positions, historicalReturns, opts("historical"));
      expect(Date.now() - start).toBeLessThan(500);
      expect(result.oneDayVaR95).toBeGreaterThan(0);
    });
  });

  describe("Multi-Asset Portfolio", () => {
    it("should calculate VaR for a correlated multi-asset portfolio", async () => {
      const returns1 = [-0.02, -0.01, 0.0, 0.01, 0.02, -0.015, 0.005];
      const returns2 = [-0.021, -0.009, 0.001, 0.011, 0.019, -0.014, 0.006]; // highly correlated

      const positions = [
        makePosition("AAPL", portfolioValue / 2),
        makePosition("MSFT", portfolioValue / 2),
      ];
      const historicalReturns = new Map<string, number[]>([
        ["AAPL", returns1],
        ["MSFT", returns2],
      ]);

      const hist = await calc.calculateVaR(positions, historicalReturns, opts("historical"));
      const mc = await calc.calculateVaR(positions, historicalReturns, opts("monte-carlo"));

      expect(hist.oneDayVaR95).toBeGreaterThan(0);
      expect(hist.oneDayVaR95).toBeLessThan(portfolioValue);
      // Monte Carlo path (Cholesky + correlated draws) must also yield a valid positive loss.
      expect(mc.oneDayVaR95).toBeGreaterThan(0);
      expect(mc.oneDayVaR95).toBeLessThan(portfolioValue);
    });
  });
});

/**
 * Spread helper so `calc.calculateVaR(...toArgs(fixture), options)` reads cleanly.
 */
function toArgs(fixture: {
  positions: Position[];
  historicalReturns: Map<string, number[]>;
}): [Position[], Map<string, number[]>] {
  return [fixture.positions, fixture.historicalReturns];
}
