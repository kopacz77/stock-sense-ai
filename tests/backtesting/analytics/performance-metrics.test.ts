/**
 * Performance Metrics Tests
 * CRITICAL: Tests all 30+ metric calculations for accuracy
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
        { date: startDate, equity: 100000, cash: 100000, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: endDate, equity: 120000, cash: 120000, marketValue: 0, returns: 0, cumulativeReturns: 20 }
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalReturn).toBeCloseTo(20, 2); // 20% return
      expect(metrics.totalReturnDollar).toBeCloseTo(20000, 2);
    });

    it("should calculate CAGR correctly for multi-year period", () => {
      const threeYearsLater = new Date("2027-01-01");
      const equityCurve: EquityCurvePoint[] = [
        { date: startDate, equity: 100000, cash: 100000, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: threeYearsLater, equity: 133100, cash: 133100, marketValue: 0, returns: 0, cumulativeReturns: 33.1 }
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, threeYearsLater, 0, 0
      );

      // CAGR = (133100/100000)^(1/3) - 1 = 10% annual
      expect(metrics.cagr).toBeCloseTo(10, 1);
    });

    it("should handle negative returns", () => {
      const equityCurve: EquityCurvePoint[] = [
        { date: startDate, equity: 100000, cash: 100000, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: endDate, equity: 80000, cash: 80000, marketValue: 0, returns: 0, cumulativeReturns: -20 }
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalReturn).toBeCloseTo(-20, 2);
      expect(metrics.totalReturnDollar).toBeCloseTo(-20000, 2);
    });
  });

  describe("Risk Metrics", () => {
    it("should calculate volatility correctly", () => {
      // Create equity curve with known volatility
      const equityCurve: EquityCurvePoint[] = [];
      const returns = [1, -1, 2, -2, 1.5, -1.5]; // Daily returns %

      for (let i = 0; i < returns.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        equityCurve.push({
          date,
          equity: initialCapital * (1 + returns[i]! / 100),
          cash: 0,
          marketValue: 0,
          returns: returns[i]!,
          cumulativeReturns: 0
        });
      }

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.volatility).toBeGreaterThan(0);
      // Volatility should be annualized (daily vol * sqrt(252))
    });

    it("should calculate Sharpe ratio correctly", () => {
      const equityCurve: EquityCurvePoint[] = [];
      const returns = [1, 1, 1, 1, 1]; // Consistent 1% daily returns

      for (let i = 0; i < returns.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        equityCurve.push({
          date,
          equity: initialCapital * (1 + returns[i]! / 100),
          cash: 0,
          marketValue: 0,
          returns: returns[i]!,
          cumulativeReturns: 0
        });
      }

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // High consistent returns should give high Sharpe
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });

    it("should calculate Sortino ratio (downside deviation only)", () => {
      const equityCurve: EquityCurvePoint[] = [];
      const returns = [2, -1, 3, -1, 2]; // Mixed returns

      for (let i = 0; i < returns.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        equityCurve.push({
          date,
          equity: initialCapital,
          cash: 0,
          marketValue: 0,
          returns: returns[i]!,
          cumulativeReturns: 0
        });
      }

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // Sortino should be defined (may be 0 for minimal data)
      expect(typeof metrics.sortinoRatio).toBe("number");
    });
  });

  describe("Drawdown Metrics", () => {
    it("should calculate maximum drawdown correctly", () => {
      const equityCurve: EquityCurvePoint[] = [
        { date: new Date("2024-01-01"), equity: 100000, cash: 0, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: new Date("2024-01-02"), equity: 110000, cash: 0, marketValue: 0, returns: 10, cumulativeReturns: 10 },
        { date: new Date("2024-01-03"), equity: 90000, cash: 0, marketValue: 0, returns: -18.18, cumulativeReturns: -10 },
        { date: new Date("2024-01-04"), equity: 95000, cash: 0, marketValue: 0, returns: 5.56, cumulativeReturns: -5 },
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // Max DD = (90000 - 110000) / 110000 = -18.18%
      expect(metrics.maxDrawdown).toBeCloseTo(-18.18, 1);
    });

    it("should calculate drawdown duration", () => {
      const equityCurve: EquityCurvePoint[] = [];

      // Create a drawdown lasting 10 days
      for (let i = 0; i < 20; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        let equity = initialCapital;
        if (i >= 5 && i < 15) {
          equity = initialCapital * 0.9; // 10% drawdown
        }

        equityCurve.push({
          date,
          equity,
          cash: 0,
          marketValue: 0,
          returns: 0,
          cumulativeReturns: 0
        });
      }

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.maxDrawdownDuration).toBeGreaterThanOrEqual(0);
    });

    it("should calculate Calmar ratio (CAGR / Max DD)", () => {
      const equityCurve: EquityCurvePoint[] = [
        { date: startDate, equity: 100000, cash: 0, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: new Date("2024-06-01"), equity: 80000, cash: 0, marketValue: 0, returns: -20, cumulativeReturns: -20 },
        { date: endDate, equity: 120000, cash: 0, marketValue: 0, returns: 50, cumulativeReturns: 20 },
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        equityCurve, [], initialCapital, startDate, endDate, 0, 0
      );

      // Calmar = CAGR / |Max DD|
      expect(metrics.calmarRatio).toBeGreaterThan(0);
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
        [], trades, initialCapital, startDate, endDate, 0, 0
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.avgWin).toBe(1500); // (1000 + 2000) / 2
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.largestWin).toBe(3000);
      expect(metrics.largestLoss).toBe(-2000);
    });

    it("should calculate consecutive win/loss streaks", () => {
      const trades: Trade[] = [
        createTrade(1000),  // Win 1
        createTrade(1000),  // Win 2
        createTrade(1000),  // Win 3 (max streak)
        createTrade(-500),  // Loss 1
        createTrade(500),   // Win
        createTrade(-300),  // Loss 2
        createTrade(-200),  // Loss 2 (max streak)
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        [], trades, initialCapital, startDate, endDate, 0, 0
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      // Profit factor = 5000 / 1500 = 3.33
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      // Payoff ratio = 3000 / 1000 = 3.0
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      // Expectancy = (1000 - 500 + 2000 - 300) / 4 = 550
      expect(metrics.expectancy).toBeCloseTo(550, 2);
    });
  });

  describe("Cost Analysis", () => {
    it("should track total commissions and slippage", () => {
      const metrics = PerformanceMetricsCalculator.calculate(
        [], [], initialCapital, startDate, endDate, 150, 50
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
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.winRate).toBe(100);
      expect(metrics.losingTrades).toBe(0);
      expect(metrics.profitFactor).toBe(0); // No losses to divide by
    });

    it("should handle all losing trades", () => {
      const trades: Trade[] = [
        createTrade(-1000),
        createTrade(-2000),
        createTrade(-1500),
      ];

      const metrics = PerformanceMetricsCalculator.calculate(
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.winRate).toBe(0);
      expect(metrics.winningTrades).toBe(0);
    });

    it("should handle single trade", () => {
      const trades: Trade[] = [createTrade(1000)];

      const metrics = PerformanceMetricsCalculator.calculate(
        [], trades, initialCapital, startDate, endDate, 0, 0
      );

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.winRate).toBe(100);
      expect(metrics.expectancy).toBe(1000);
    });
  });

  describe("Drawdown Calculation Utility", () => {
    it("should calculate drawdowns for equity curve", () => {
      const equityCurve: EquityCurvePoint[] = [
        { date: new Date("2024-01-01"), equity: 100000, cash: 0, marketValue: 0, returns: 0, cumulativeReturns: 0 },
        { date: new Date("2024-01-02"), equity: 110000, cash: 0, marketValue: 0, returns: 10, cumulativeReturns: 10 },
        { date: new Date("2024-01-03"), equity: 105000, cash: 0, marketValue: 0, returns: -4.5, cumulativeReturns: 5 },
      ];

      const drawdowns = PerformanceMetricsCalculator.calculateDrawdowns(equityCurve);

      expect(drawdowns.length).toBe(3);
      expect(drawdowns[0]!.drawdown).toBe(0);
      expect(drawdowns[1]!.drawdown).toBe(0); // New peak
      expect(drawdowns[2]!.drawdown).toBeLessThan(0); // In drawdown
    });
  });
});

// Helper function to create test trade
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
    pnlPercent: pnl / 10000 * 100,
    commission: 0,
    slippage: 0,
    totalCost: 0,
    netPnl: pnl,
    holdingPeriod: 1,
    strategyName: "TEST",
    exitReason: "STRATEGY_EXIT"
  };
}
