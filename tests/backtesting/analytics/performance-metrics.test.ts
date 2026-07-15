/**
 * Performance Metrics Tests
 * Exercises the real PerformanceMetricsCalculator.calculate() API.
 *
 * Field-usage notes (see src/backtesting/analytics/performance-metrics.ts):
 *  - finalEquity / totalReturn / drawdowns read `point.equity`
 *  - volatility / sharpe / sortino read `point.returns` (undefined values filtered out)
 *  - drawdown dates read `point.date ?? point.timestamp`
 *  - CAGR / trading days derive from the startDate/endDate PARAMS, not equity dates
 *  - win/loss classification, avg/largest win-loss, profit factor, payoff, expectancy,
 *    and streaks all read `trade.pnl`; percent variants read `trade.pnlPercent`;
 *    holding period reads `trade.holdingPeriod`
 *  - IMPORTANT: calculate() early-returns getEmptyMetrics() when equityCurve.length === 0,
 *    so any test asserting TRADE stats must supply a non-empty equity curve.
 */

import { describe, it, expect } from "vitest";
import { PerformanceMetricsCalculator } from "../../../src/backtesting/analytics/performance-metrics.js";
import type { EquityCurvePoint, Trade } from "../../../src/backtesting/types/backtest-types.js";

describe("PerformanceMetricsCalculator", () => {
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-12-31");
  const initialCapital = 100000;

  describe("Return Metrics", () => {
    it("should calculate total return correctly", () => {
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(startDate, 100000),
        eqPoint(endDate, 120000),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // (120000 - 100000) / 100000 * 100 = 20
      expect(metrics.totalReturn).toBeCloseTo(20, 2);
      expect(metrics.totalReturnDollar).toBeCloseTo(20000, 2);
    });

    it("should calculate CAGR correctly for multi-year period", () => {
      const threeYearsLater = new Date("2027-01-01");
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(startDate, 100000),
        eqPoint(threeYearsLater, 133100),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, threeYearsLater, 0, 0
      );

      // 1096 calendar days -> 756 trading days -> 3.0 years.
      // CAGR = (133100/100000)^(1/3) - 1 = 1.1 - 1 = 10%
      expect(metrics.cagr).toBeCloseTo(10, 1);
    });

    it("should handle negative returns", () => {
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(startDate, 100000),
        eqPoint(endDate, 80000),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalReturn).toBeCloseTo(-20, 2);
      expect(metrics.totalReturnDollar).toBeCloseTo(-20000, 2);
    });
  });

  describe("Risk Metrics", () => {
    it("should calculate annualized volatility correctly", () => {
      const returns = [1, -1, 2, -2, 1.5, -1.5]; // daily returns %
      const equityCurve = returnsToEquityCurve(returns);

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // mean = 0; sample variance = 14.5/(6-1) = 2.9; dailyVol = sqrt(2.9) = 1.702938...
      // annualized = dailyVol * sqrt(252) = 27.0333...
      expect(metrics.volatility).toBeGreaterThan(0);
      expect(metrics.volatility).toBeCloseTo(27.03, 1);
    });

    it("should calculate Sharpe ratio correctly", () => {
      // Varying POSITIVE returns -> non-zero variance -> genuinely positive Sharpe.
      const returns = [1, 0.5, 1.5, 0.8, 1.2]; // daily returns %
      const equityCurve = returnsToEquityCurve(returns);

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // mean = 1.0; annualizedReturn = 252
      // sample variance = 0.58/4 = 0.145; dailyVol = 0.380789; annualVol = 6.044622
      // Sharpe = 252 / 6.044622 = 41.6905
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
      expect(metrics.sharpeRatio).toBeCloseTo(41.69, 1);
    });

    it("should calculate Sortino ratio (downside deviation only)", () => {
      const returns = [2, -1, 3, -1, 2]; // mixed returns %
      const equityCurve = returnsToEquityCurve(returns);

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // mean = 1.0; annualizedReturn = 252
      // downside returns = [-1, -1]; downsideVariance = 2/2 = 1; downsideDev = 1
      // annualizedDownsideDev = 1 * sqrt(252) = 15.8745
      // Sortino = 252 / 15.8745 = 15.8745
      expect(metrics.sortinoRatio).toBeGreaterThan(0);
      expect(metrics.sortinoRatio).toBeCloseTo(15.87, 1);
    });
  });

  describe("Drawdown Metrics", () => {
    it("should calculate maximum drawdown correctly", () => {
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(new Date("2024-01-01"), 100000),
        eqPoint(new Date("2024-01-02"), 110000),
        eqPoint(new Date("2024-01-03"), 90000),
        eqPoint(new Date("2024-01-04"), 95000),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // Peak 110000, trough 90000 -> (90000 - 110000) / 110000 * 100 = -18.1818%
      expect(metrics.maxDrawdown).toBeCloseTo(-18.18, 1);
    });

    it("should calculate drawdown duration", () => {
      const equityCurve: EquityCurvePoint[] = [];

      // Peak established at day 0 (100000) and never exceeded thereafter,
      // so drawdown duration grows until the final point (day 19).
      for (let i = 0; i < 20; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        let equity = initialCapital;
        if (i >= 5 && i < 15) {
          equity = initialCapital * 0.9; // 10% drawdown window
        }

        equityCurve.push(eqPoint(date, equity));
      }

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // Max duration = day19 - day0 = 19 days
      expect(metrics.maxDrawdownDuration).toBe(19);
    });

    it("should calculate Calmar ratio (CAGR / Max DD)", () => {
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(startDate, 100000),
        eqPoint(new Date("2024-06-01"), 80000),
        eqPoint(endDate, 120000),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // 1 year -> CAGR = 20%; Max DD = -20% -> Calmar = 20 / 20 = 1.0
      expect(metrics.calmarRatio).toBeCloseTo(1.0, 2);
      expect(metrics.calmarRatio).toBe(metrics.cagr / Math.abs(metrics.maxDrawdown));
    });
  });

  describe("Trade Statistics", () => {
    it("should calculate win rate correctly", () => {
      const trades: Trade[] = [
        createTrade(1000),  // Win
        createTrade(-500),  // Loss
        createTrade(2000),  // Win
        createTrade(-300),  // Loss
        createTrade(1500),  // Win
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalTrades).toBe(5);
      expect(metrics.winningTrades).toBe(3);
      expect(metrics.losingTrades).toBe(2);
      expect(metrics.winRate).toBe(60); // 3/5 = 60%
    });

    it("should calculate average win and loss", () => {
      const trades: Trade[] = [
        createTrade(1000),
        createTrade(2000),
        createTrade(-500),
        createTrade(-1000),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.avgWin).toBe(1500);  // (1000 + 2000) / 2
      expect(metrics.avgLoss).toBe(-750); // (-500 + -1000) / 2
    });

    it("should calculate largest win and loss", () => {
      const trades: Trade[] = [
        createTrade(1000),
        createTrade(3000),  // Largest win
        createTrade(-500),
        createTrade(-2000), // Largest loss
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.largestWin).toBe(3000);
      expect(metrics.largestLoss).toBe(-2000);
    });

    it("should calculate consecutive win/loss streaks", () => {
      const trades: Trade[] = [
        createTrade(1000),  // Win 1
        createTrade(1000),  // Win 2
        createTrade(1000),  // Win 3 (max win streak)
        createTrade(-500),  // Loss 1
        createTrade(500),   // Win (resets loss streak)
        createTrade(-300),  // Loss 1
        createTrade(-200),  // Loss 2 (max loss streak)
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.maxConsecutiveWins).toBe(3);
      expect(metrics.maxConsecutiveLosses).toBe(2);
    });
  });

  describe("Profit Metrics", () => {
    it("should calculate profit factor", () => {
      const trades: Trade[] = [
        createTrade(2000),
        createTrade(3000),  // Gross profit = 5000
        createTrade(-1000),
        createTrade(-500),  // Gross loss = 1500
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      // Profit factor = 5000 / 1500 = 3.3333
      expect(metrics.profitFactor).toBeCloseTo(3.33, 2);
    });

    it("should calculate payoff ratio", () => {
      const trades: Trade[] = [
        createTrade(2000),
        createTrade(4000),  // Avg win = 3000
        createTrade(-500),
        createTrade(-1500), // Avg loss = -1000
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      // Payoff ratio = 3000 / |−1000| = 3.0
      expect(metrics.payoffRatio).toBeCloseTo(3.0, 1);
    });

    it("should calculate expectancy (average profit per trade)", () => {
      const trades: Trade[] = [
        createTrade(1000),
        createTrade(-500),
        createTrade(2000),
        createTrade(-300),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      // Expectancy = (1000 - 500 + 2000 - 300) / 4 = 550
      expect(metrics.expectancy).toBeCloseTo(550, 2);
    });
  });

  describe("Cost Analysis", () => {
    it("should track total commissions and slippage", () => {
      const metrics = PerformanceMetricsCalculator.calculate(
        [eqPoint(startDate, initialCapital)], [], initialCapital, startDate, endDate, 150, 50
      );

      expect(metrics.totalCommissions).toBe(150);
      expect(metrics.totalSlippage).toBe(50);
      expect(metrics.totalCosts).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty equity curve", () => {
      const metrics = PerformanceMetricsCalculator.calculate(
        [], [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalReturn).toBe(0);
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
    });

    it("should handle all winning trades", () => {
      const trades: Trade[] = [
        createTrade(1000),
        createTrade(2000),
        createTrade(1500),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.winRate).toBe(100);
      expect(metrics.losingTrades).toBe(0);
      expect(metrics.profitFactor).toBe(0); // grossLoss === 0 -> guarded to 0
    });

    it("should handle all losing trades", () => {
      const trades: Trade[] = [
        createTrade(-1000),
        createTrade(-2000),
        createTrade(-1500),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.winRate).toBe(0);
      expect(metrics.winningTrades).toBe(0);
    });

    it("should handle single trade", () => {
      const trades: Trade[] = [createTrade(1000)];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurveFromTrades(trades), trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.winRate).toBe(100);
      expect(metrics.expectancy).toBe(1000);
    });
  });

  describe("Drawdown Calculation Utility", () => {
    it("should calculate drawdowns for equity curve", () => {
      const equityCurve: EquityCurvePoint[] = [
        eqPoint(new Date("2024-01-01"), 100000),
        eqPoint(new Date("2024-01-02"), 110000),
        eqPoint(new Date("2024-01-03"), 105000),
      ];

      const drawdowns = PerformanceMetricsCalculator.calculateDrawdowns(equityCurve);

      expect(drawdowns.length).toBe(3);
      expect(drawdowns[0]!.drawdown).toBe(0);        // at initial peak
      expect(drawdowns[1]!.drawdown).toBe(0);        // new peak
      // (105000 - 110000) / 110000 * 100 = -4.5454...
      expect(drawdowns[2]!.drawdown).toBeCloseTo(-4.55, 1);
      expect(drawdowns[2]!.drawdown).toBeLessThan(0);
    });
  });
});

/**
 * Build a fully-typed EquityCurvePoint. The calculator only reads `equity`,
 * `returns`, and `date ?? timestamp`; the remaining fields are required by the
 * type and populated with consistent placeholder values.
 */
function eqPoint(date: Date, equity: number, returns?: number): EquityCurvePoint {
  return {
    timestamp: date,
    date,
    equity,
    cash: equity,
    positionsValue: 0,
    marketValue: 0,
    cumulativeReturn: 0,
    cumulativeReturns: 0,
    returns,
    dailyReturn: returns ?? 0,
    drawdown: 0,
  };
}

/**
 * Turn an array of daily percent returns into a dated equity curve, populating
 * the `returns` field the risk metrics read.
 */
function returnsToEquityCurve(returns: number[]): EquityCurvePoint[] {
  const start = new Date("2024-01-01");
  return returns.map((r, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return eqPoint(date, 100000 * (1 + r / 100), r);
  });
}

/**
 * Build a minimal non-empty equity curve consistent with a set of trades so the
 * early empty-curve guard does not fire and trade-stat assertions are reachable.
 */
function equityCurveFromTrades(trades: Trade[]): EquityCurvePoint[] {
  const start = new Date("2024-01-01");
  let equity = 100000;
  const points: EquityCurvePoint[] = [eqPoint(start, equity)];
  trades.forEach((t, i) => {
    equity += t.pnl;
    const date = new Date(start);
    date.setDate(date.getDate() + i + 1);
    points.push(eqPoint(date, equity));
  });
  return points;
}

// Helper function to create a test trade. Populates the exact fields the
// calculator reads: `pnl`, `pnlPercent`, `holdingPeriod`.
function createTrade(pnl: number): Trade {
  return {
    id: `trade-${Math.random()}`,
    symbol: "TEST",
    entryDate: new Date("2024-01-01"),
    exitDate: new Date("2024-01-02"),
    entryPrice: 100,
    exitPrice: 100 + pnl / 100,
    quantity: 100,
    side: "BUY",
    pnl,
    pnlPercent: (pnl / 10000) * 100,
    commission: 0,
    slippage: 0,
    totalCost: 0,
    netPnl: pnl,
    holdingPeriod: 1,
    strategyName: "TEST",
    exitReason: "STRATEGY_EXIT",
  };
}
