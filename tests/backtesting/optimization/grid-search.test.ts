/**
 * Grid Search Optimization Tests
 * Tests parameter optimization functionality against the real
 * GridSearchOptimizer API (src/backtesting/optimization/grid-search.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GridSearchOptimizer } from "../../../src/backtesting/optimization/grid-search.js";
import { MockDataProvider } from "../../utils/mock-data-provider.js";
import { generateTrendingData } from "../../utils/mock-market-data.js";
import { PriceThresholdStrategy } from "../../utils/test-strategies.js";
import type { OptimizationConfig } from "../../../src/backtesting/optimization/types.js";
import type {
  BacktestConfig,
  BacktestStrategy,
  PerformanceMetrics,
} from "../../../src/backtesting/types/backtest-types.js";

describe("GridSearchOptimizer", () => {
  let dataProvider: MockDataProvider;
  let backtestConfig: BacktestConfig;

  // Strategy factory shared by all tests: builds a PriceThresholdStrategy
  // from the parameter set produced by the grid.
  const strategyFactory = (params: Record<string, unknown>): BacktestStrategy =>
    new PriceThresholdStrategy(
      params.buyThreshold as number,
      params.sellThreshold as number
    );

  beforeEach(() => {
    dataProvider = new MockDataProvider();

    // Add test data (30 trading days, uptrend from base 100).
    const testData = generateTrendingData({
      symbol: "TEST",
      startDate: new Date("2024-01-01"),
      days: 30,
      basePrice: 100,
      trend: "up",
    });
    dataProvider.addData("TEST", testData);

    backtestConfig = {
      id: "test-1",
      name: "Test Backtest",
      symbols: ["TEST"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-30"),
      initialCapital: 10000,
      strategy: {
        name: "PRICE_THRESHOLD",
        parameters: {},
      },
      commission: {
        type: "FIXED",
        fixedFee: 1.0,
      },
      slippage: {
        type: "FIXED",
        fixedAmount: 0.01,
      },
    };
  });

  describe("Parameter Grid Generation", () => {
    it("should enumerate all continuous-range combinations (Cartesian product)", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "grid-continuous",
        name: "Test Optimization",
        method: "grid",
        objective: "sharpeRatio",
        direction: "maximize",
        parameterRanges: [
          { name: "buyThreshold", type: "continuous", min: 95, max: 105, step: 5 },
          { name: "sellThreshold", type: "continuous", min: 105, max: 115, step: 5 },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // buyThreshold {95,100,105} x sellThreshold {105,110,115} = 9 combinations.
      expect(result.results).toHaveLength(9);
      expect(result.summary.totalCombinations).toBe(9);
      expect(result.bestResult).toBeDefined();

      // Every enumerated combination must be unique (Cartesian product, no dupes).
      const seen = new Set(
        result.results.map(
          (r) => `${r.parameters.parameters.buyThreshold}/${r.parameters.parameters.sellThreshold}`
        )
      );
      expect(seen.size).toBe(9);
    }, 30000);

    it("should use discrete values when provided", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "grid-discrete",
        name: "Discrete Test",
        method: "grid",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          { name: "buyThreshold", type: "integer", values: [95, 98, 100] },
          { name: "sellThreshold", type: "integer", values: [105, 110] },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // 3 x 2 = 6 combinations.
      expect(result.results).toHaveLength(6);
      expect(result.summary.totalCombinations).toBe(6);
    }, 30000);
  });

  describe("Objective Optimization", () => {
    it("should maximize Sharpe ratio (best score >= every evaluated score)", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "obj-sharpe",
        name: "Sharpe Optimization",
        method: "grid",
        objective: "sharpeRatio",
        direction: "maximize",
        parameterRanges: [
          { name: "buyThreshold", type: "integer", values: [95, 100] },
          { name: "sellThreshold", type: "integer", values: [105, 110] },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      const allSharpes = result.results.map((r) => r.objectiveValue);
      const best = result.bestResult.objectiveValue;

      // Maximize: the reported best must equal the maximum, and be >= all others.
      expect(best).toBe(Math.max(...allSharpes));
      for (const score of allSharpes) {
        expect(best).toBeGreaterThanOrEqual(score);
      }
      // Results are returned sorted best-first for a maximize objective.
      expect(result.results[0]!.objectiveValue).toBe(best);
    }, 30000);

    it("should minimize max drawdown (best score <= every evaluated score)", async () => {
      // maxDrawdown is not one of the built-in objectives, so the correct
      // way to minimize it is a custom objective reading the metric directly.
      const optimizationConfig: OptimizationConfig = {
        id: "obj-drawdown",
        name: "Drawdown Minimization",
        method: "grid",
        objective: "custom",
        customObjective: (metrics: PerformanceMetrics) => metrics.maxDrawdown,
        direction: "minimize",
        parameterRanges: [
          { name: "buyThreshold", type: "integer", values: [95, 100] },
          { name: "sellThreshold", type: "integer", values: [105, 110] },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      const allDrawdowns = result.results.map((r) => r.objectiveValue);
      const best = result.bestResult.objectiveValue;

      // Minimize: the reported best must equal the minimum, and be <= all others.
      expect(best).toBe(Math.min(...allDrawdowns));
      for (const score of allDrawdowns) {
        expect(best).toBeLessThanOrEqual(score);
      }
      // Results are returned sorted best-first for a minimize objective.
      expect(result.results[0]!.objectiveValue).toBe(best);
    }, 30000);
  });

  describe("Results and Summary", () => {
    it("should provide summary statistics", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "summary",
        name: "Summary Test",
        method: "grid",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          { name: "buyThreshold", type: "integer", values: [95, 100] },
          { name: "sellThreshold", type: "integer", values: [105, 110] },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      expect(result.summary).toBeDefined();
      expect(result.summary.totalCombinations).toBe(4);
      expect(result.summary.validCombinations).toBeGreaterThan(0);
      expect(result.summary.validCombinations).toBeLessThanOrEqual(4);

      // best/worst summary values are consistent with the evaluated results.
      const values = result.results.map((r) => r.objectiveValue);
      expect(result.summary.bestObjectiveValue).toBe(Math.max(...values));
      expect(result.summary.worstObjectiveValue).toBe(Math.min(...values));
      // For a maximize objective, best >= worst.
      expect(result.summary.bestObjectiveValue).toBeGreaterThanOrEqual(
        result.summary.worstObjectiveValue
      );
    }, 30000);

    it("should track execution time", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "timing",
        name: "Timing Test",
        method: "grid",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          { name: "buyThreshold", type: "integer", values: [95, 100] },
          { name: "sellThreshold", type: "integer", values: [105] },
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      expect(result.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.summary.avgExecutionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should reject when a continuous range is missing min/max/step", async () => {
      const optimizationConfig: OptimizationConfig = {
        id: "error-missing-range",
        name: "Error Test",
        method: "grid",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "continuous",
            // Missing min, max, step — grid generation must throw.
          } as any,
        ],
        backtestConfig,
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      await expect(optimizer.optimize()).rejects.toThrow(
        /min, max, and step are required/
      );
    });
  });
});
