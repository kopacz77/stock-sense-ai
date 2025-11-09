/**
 * Grid Search Optimization Tests
 * Tests parameter optimization functionality
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GridSearchOptimizer } from "../../../src/backtesting/optimization/grid-search.js";
import { MockDataProvider } from "../../utils/mock-data-provider.js";
import { generateTrendingData } from "../../utils/mock-market-data.js";
import { PriceThresholdStrategy } from "../../utils/test-strategies.js";
import type { OptimizationConfig } from "../../../src/backtesting/optimization/types.js";
import type { BacktestConfig } from "../../../src/backtesting/types/backtest-types.js";

describe("GridSearchOptimizer", () => {
  let dataProvider: MockDataProvider;
  let backtestConfig: BacktestConfig;

  beforeEach(() => {
    dataProvider = new MockDataProvider();

    // Add test data
    const testData = generateTrendingData({
      symbol: "TEST",
      startDate: new Date("2024-01-01"),
      days: 30,
      basePrice: 100,
      trend: "up"
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
        parameters: {}
      },
      commission: {
        type: "FIXED",
        fixedFee: 1.0
      },
      slippage: {
        type: "FIXED",
        fixedAmount: 0.01
      }
    };
  });

  describe("Parameter Grid Generation", () => {
    it("should generate all parameter combinations", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Test Optimization",
        objective: "sharpeRatio",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "continuous",
            min: 95,
            max: 105,
            step: 5
          },
          {
            name: "sellThreshold",
            type: "continuous",
            min: 105,
            max: 115,
            step: 5
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // 3 buyThreshold values (95, 100, 105) x 3 sellThreshold values (105, 110, 115) = 9 combinations
      expect(result.results.length).toBe(9);
      expect(result.bestResult).toBeDefined();
    }, 30000); // Extended timeout for optimization

    it("should use discrete values when provided", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Discrete Test",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "integer",
            values: [95, 98, 100]
          },
          {
            name: "sellThreshold",
            type: "integer",
            values: [105, 110]
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // 3 x 2 = 6 combinations
      expect(result.results.length).toBe(6);
    }, 30000);
  });

  describe("Objective Optimization", () => {
    it("should maximize Sharpe ratio", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Sharpe Optimization",
        objective: "sharpeRatio",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "integer",
            values: [95, 100]
          },
          {
            name: "sellThreshold",
            type: "integer",
            values: [105, 110]
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // Best result should have highest Sharpe ratio
      const allSharpes = result.results.map(r => r.objectiveValue);
      expect(result.bestResult.objectiveValue).toBe(Math.max(...allSharpes));
    }, 30000);

    it("should minimize max drawdown", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Drawdown Minimization",
        objective: "maxDrawdown",
        direction: "minimize", // Minimize negative drawdown
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "integer",
            values: [95, 100]
          },
          {
            name: "sellThreshold",
            type: "integer",
            values: [105, 110]
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      // Best result should have smallest (least negative) drawdown
      const allDrawdowns = result.results.map(r => r.objectiveValue);
      expect(result.bestResult.objectiveValue).toBe(Math.min(...allDrawdowns));
    }, 30000);
  });

  describe("Results and Summary", () => {
    it("should provide summary statistics", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Summary Test",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "integer",
            values: [95, 100]
          },
          {
            name: "sellThreshold",
            type: "integer",
            values: [105, 110]
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
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
      expect(result.summary.bestObjectiveValue).toBeDefined();
      expect(result.summary.worstObjectiveValue).toBeDefined();
    }, 30000);

    it("should track execution time", async () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Timing Test",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "integer",
            values: [95, 100]
          },
          {
            name: "sellThreshold",
            type: "integer",
            values: [105]
          }
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(
          params.buyThreshold as number,
          params.sellThreshold as number
        );
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      const result = await optimizer.optimize();

      expect(result.totalExecutionTimeMs).toBeGreaterThan(0);
      expect(result.summary.avgExecutionTimeMs).toBeGreaterThan(0);
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should handle missing parameter range fields", () => {
      const optimizationConfig: OptimizationConfig = {
        name: "Error Test",
        objective: "totalReturn",
        direction: "maximize",
        parameterRanges: [
          {
            name: "buyThreshold",
            type: "continuous",
            // Missing min, max, step
          } as any
        ],
        backtestConfig
      };

      const strategyFactory = (params: Record<string, unknown>) => {
        return new PriceThresholdStrategy(95, 105);
      };

      const optimizer = new GridSearchOptimizer(
        optimizationConfig,
        dataProvider,
        strategyFactory
      );

      expect(async () => {
        await optimizer.optimize();
      }).rejects.toThrow();
    });
  });
});
