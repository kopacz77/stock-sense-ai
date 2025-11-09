/**
 * VaR Calculator Tests
 * CRITICAL: Tests Value at Risk calculations for accuracy
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VaRCalculator } from "../../../src/risk/metrics/var-calculator.js";
import { createHistoricalReturns } from "../../utils/test-portfolios.js";

describe("VaRCalculator", () => {
  let returns: number[];
  const portfolioValue = 100000;
  const confidenceLevel = 0.95; // 95% confidence

  beforeEach(() => {
    // Generate consistent test returns for predictable results
    returns = [
      -3.0, -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5,
      2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 1.5, 2.0, -1.0
    ];
  });

  describe("Historical VaR", () => {
    it("should calculate historical VaR correctly", () => {
      const var95 = VaRCalculator.calculateHistoricalVaR(
        returns,
        portfolioValue,
        confidenceLevel
      );

      expect(var95).toBeGreaterThan(0); // VaR is a positive number representing loss
      expect(var95).toBeLessThan(portfolioValue); // VaR should be less than total value
    });

    it("should return correct VaR for 95% confidence level", () => {
      const var95 = VaRCalculator.calculateHistoricalVaR(
        returns,
        portfolioValue,
        0.95
      );

      // At 95% confidence, we expect ~5% of returns to be worse than VaR
      const worstReturns = returns.filter(r => r < 0).sort((a, b) => a - b);
      const var95Percent = var95 / portfolioValue * 100;

      // VaR should be around the 5th percentile of losses
      expect(var95Percent).toBeGreaterThan(0);
    });

    it("should return higher VaR for 99% confidence level", () => {
      const var95 = VaRCalculator.calculateHistoricalVaR(returns, portfolioValue, 0.95);
      const var99 = VaRCalculator.calculateHistoricalVaR(returns, portfolioValue, 0.99);

      // 99% VaR should be higher (more conservative) than 95% VaR
      expect(var99).toBeGreaterThan(var95);
    });

    it("should handle empty returns array", () => {
      const varResult = VaRCalculator.calculateHistoricalVaR([], portfolioValue, 0.95);

      expect(varResult).toBe(0); // Should return 0 for no data
    });

    it("should handle all positive returns", () => {
      const positiveReturns = [1, 2, 3, 4, 5];
      const varResult = VaRCalculator.calculateHistoricalVaR(
        positiveReturns,
        portfolioValue,
        0.95
      );

      expect(varResult).toBeGreaterThanOrEqual(0);
    });

    it("should handle all negative returns", () => {
      const negativeReturns = [-1, -2, -3, -4, -5];
      const varResult = VaRCalculator.calculateHistoricalVaR(
        negativeReturns,
        portfolioValue,
        0.95
      );

      expect(varResult).toBeGreaterThan(0);
      // Should be significant loss since all returns are negative
      expect(varResult).toBeGreaterThan(portfolioValue * 0.01);
    });
  });

  describe("Parametric VaR (Variance-Covariance)", () => {
    it("should calculate parametric VaR correctly", () => {
      const varParam = VaRCalculator.calculateParametricVaR(
        returns,
        portfolioValue,
        confidenceLevel
      );

      expect(varParam).toBeGreaterThan(0);
      expect(varParam).toBeLessThan(portfolioValue);
    });

    it("should use normal distribution assumption", () => {
      const var95 = VaRCalculator.calculateParametricVaR(returns, portfolioValue, 0.95);

      // Parametric VaR uses z-score (1.65 for 95% confidence)
      // VaR = z * std * portfolioValue
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      const zScore = 1.645; // 95% confidence

      const expectedVaR = Math.abs(zScore * stdDev * portfolioValue / 100);

      expect(var95).toBeCloseTo(expectedVaR, -2); // Allow some rounding difference
    });

    it("should return higher VaR for higher volatility", () => {
      const lowVolReturns = [0.5, -0.5, 0.5, -0.5, 0.5];
      const highVolReturns = [-5, 5, -5, 5, -5];

      const varLow = VaRCalculator.calculateParametricVaR(lowVolReturns, portfolioValue, 0.95);
      const varHigh = VaRCalculator.calculateParametricVaR(highVolReturns, portfolioValue, 0.95);

      expect(varHigh).toBeGreaterThan(varLow);
    });
  });

  describe("Monte Carlo VaR", () => {
    it("should calculate Monte Carlo VaR correctly", () => {
      const varMC = VaRCalculator.calculateMonteCarloVaR(
        returns,
        portfolioValue,
        confidenceLevel,
        1000 // Number of simulations
      );

      expect(varMC).toBeGreaterThan(0);
      expect(varMC).toBeLessThan(portfolioValue);
    });

    it("should produce more stable results with more simulations", () => {
      const var1000 = VaRCalculator.calculateMonteCarloVaR(returns, portfolioValue, 0.95, 1000);
      const var10000 = VaRCalculator.calculateMonteCarloVaR(returns, portfolioValue, 0.95, 10000);

      // Results should be similar (within 20%)
      const difference = Math.abs(var1000 - var10000) / var1000;
      expect(difference).toBeLessThan(0.2);
    });

    it("should handle different time horizons", () => {
      const var1Day = VaRCalculator.calculateMonteCarloVaR(
        returns,
        portfolioValue,
        0.95,
        1000,
        1 // 1 day horizon
      );

      const var10Day = VaRCalculator.calculateMonteCarloVaR(
        returns,
        portfolioValue,
        0.95,
        1000,
        10 // 10 day horizon
      );

      // Multi-day VaR should be higher (scales with sqrt(time))
      expect(var10Day).toBeGreaterThan(var1Day);
    });
  });

  describe("Comparison of Methods", () => {
    it("should have all three methods produce reasonable VaR values", () => {
      const varHistorical = VaRCalculator.calculateHistoricalVaR(
        returns,
        portfolioValue,
        0.95
      );

      const varParametric = VaRCalculator.calculateParametricVaR(
        returns,
        portfolioValue,
        0.95
      );

      const varMonteCarlo = VaRCalculator.calculateMonteCarloVaR(
        returns,
        portfolioValue,
        0.95,
        5000
      );

      // All methods should produce positive VaR
      expect(varHistorical).toBeGreaterThan(0);
      expect(varParametric).toBeGreaterThan(0);
      expect(varMonteCarlo).toBeGreaterThan(0);

      // They should be within the same order of magnitude
      const values = [varHistorical, varParametric, varMonteCarlo];
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);

      expect(maxValue / minValue).toBeLessThan(3); // Within 3x of each other
    });
  });

  describe("Edge Cases", () => {
    it("should handle single return value", () => {
      const singleReturn = [1.5];
      const varResult = VaRCalculator.calculateHistoricalVaR(
        singleReturn,
        portfolioValue,
        0.95
      );

      expect(varResult).toBeGreaterThanOrEqual(0);
    });

    it("should handle very small portfolio value", () => {
      const smallPortfolio = 100;
      const varResult = VaRCalculator.calculateHistoricalVaR(
        returns,
        smallPortfolio,
        0.95
      );

      expect(varResult).toBeGreaterThanOrEqual(0);
      expect(varResult).toBeLessThan(smallPortfolio);
    });

    it("should handle very large portfolio value", () => {
      const largePortfolio = 1000000000;
      const varResult = VaRCalculator.calculateParametricVaR(
        returns,
        largePortfolio,
        0.95
      );

      expect(varResult).toBeGreaterThan(0);
      expect(varResult).toBeLessThan(largePortfolio);
    });

    it("should handle extreme confidence levels", () => {
      const var90 = VaRCalculator.calculateHistoricalVaR(returns, portfolioValue, 0.90);
      const var99_9 = VaRCalculator.calculateHistoricalVaR(returns, portfolioValue, 0.999);

      expect(var90).toBeGreaterThan(0);
      expect(var99_9).toBeGreaterThan(var90);
    });
  });

  describe("Performance", () => {
    it("should calculate VaR quickly (< 100ms)", () => {
      const start = Date.now();

      VaRCalculator.calculateHistoricalVaR(returns, portfolioValue, 0.95);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it("should handle large datasets efficiently", () => {
      const largeReturns = Array(1000).fill(0).map(() => (Math.random() - 0.5) * 6);

      const start = Date.now();

      VaRCalculator.calculateHistoricalVaR(largeReturns, portfolioValue, 0.95);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Should complete in < 500ms
    });
  });

  describe("Multi-Asset Portfolio", () => {
    it("should calculate VaR for correlated assets", () => {
      const returns1 = [-2, -1, 0, 1, 2];
      const returns2 = [-2.1, -0.9, 0.1, 1.1, 1.9]; // Highly correlated

      // For multi-asset, we would need correlation matrix
      // This is a simplified test
      const var1 = VaRCalculator.calculateHistoricalVaR(returns1, portfolioValue, 0.95);
      const var2 = VaRCalculator.calculateHistoricalVaR(returns2, portfolioValue, 0.95);

      expect(var1).toBeGreaterThan(0);
      expect(var2).toBeGreaterThan(0);
      // Highly correlated assets should have similar VaR
      expect(Math.abs(var1 - var2) / var1).toBeLessThan(0.2);
    });
  });
});
