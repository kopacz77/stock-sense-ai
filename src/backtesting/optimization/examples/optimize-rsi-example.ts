/**
 * Example: How to use the optimization framework
 * This demonstrates RSI strategy optimization with walk-forward analysis
 */

import { ParameterOptimizer } from "../parameter-optimizer.js";
import {
  createRSIOptimizationConfig,
  createStandardWalkForwardConfig,
} from "../example-configs.js";
import type { BacktestConfig, DataProvider, BacktestStrategy } from "../../types/backtest-types.js";

/**
 * Example: Optimize RSI strategy using grid search
 */
export async function optimizeRSIGridSearch(
  dataProvider: DataProvider,
  strategyFactory: (params: Record<string, unknown>) => BacktestStrategy
) {
  // Base backtest configuration
  const baseBacktestConfig: BacktestConfig = {
    id: "rsi-opt-example",
    name: "RSI Optimization Example",
    symbols: ["AAPL"],
    startDate: new Date("2023-01-01"),
    endDate: new Date("2023-12-31"),
    initialCapital: 100000,
    strategy: {
      name: "RSI_MEAN_REVERSION",
      parameters: {}, // Will be filled by optimizer
    },
    commission: {
      type: "FIXED",
      fixedFee: 1.0,
    },
    slippage: {
      type: "PERCENTAGE",
      percentage: 0.1,
    },
  };

  // Create optimization config
  const optimizationConfig = createRSIOptimizationConfig(baseBacktestConfig);

  // Create optimizer
  const optimizer = new ParameterOptimizer(dataProvider, strategyFactory);

  // Run optimization
  console.log("Starting RSI optimization with grid search...");
  const result = await optimizer.optimize(optimizationConfig);

  // Export results
  await optimizer.exportResults(result, "./optimization-results.json", "json");
  await optimizer.generateReport(result, "./optimization-report.txt");

  console.log("\nOptimization complete!");
  console.log(`Best parameters found: ${JSON.stringify(result.bestResult.parameters.parameters)}`);
  console.log(`Best Sharpe Ratio: ${result.bestResult.objectiveValue.toFixed(2)}`);

  return result;
}

/**
 * Example: Optimize RSI strategy using random search
 */
export async function optimizeRSIRandomSearch(
  dataProvider: DataProvider,
  strategyFactory: (params: Record<string, unknown>) => BacktestStrategy
) {
  const baseBacktestConfig: BacktestConfig = {
    id: "rsi-random-example",
    name: "RSI Random Search Example",
    symbols: ["AAPL"],
    startDate: new Date("2023-01-01"),
    endDate: new Date("2023-12-31"),
    initialCapital: 100000,
    strategy: {
      name: "RSI_MEAN_REVERSION",
      parameters: {},
    },
    commission: {
      type: "FIXED",
      fixedFee: 1.0,
    },
    slippage: {
      type: "PERCENTAGE",
      percentage: 0.1,
    },
  };

  // Use random search config (larger parameter space)
  const optimizationConfig = {
    ...createRSIOptimizationConfig(baseBacktestConfig),
    method: "random" as const,
    methodOptions: {
      iterations: 50,
      seed: 42,
      earlyStoppingRounds: 10,
    },
  };

  const optimizer = new ParameterOptimizer(dataProvider, strategyFactory);

  console.log("Starting RSI optimization with random search...");
  console.log("Testing 50 random parameter combinations...");

  const result = await optimizer.optimize(optimizationConfig);

  console.log(`\nRandom search complete!`);
  console.log(`Tested ${result.summary.totalCombinations} combinations`);
  console.log(`Best Sharpe Ratio: ${result.bestResult.objectiveValue.toFixed(2)}`);

  return result;
}

/**
 * Example: Run walk-forward analysis to detect overfitting
 */
export async function runWalkForwardAnalysis(
  dataProvider: DataProvider,
  strategyFactory: (params: Record<string, unknown>) => BacktestStrategy
) {
  const baseBacktestConfig: BacktestConfig = {
    id: "rsi-walkforward-example",
    name: "RSI Walk-Forward Analysis",
    symbols: ["AAPL"],
    startDate: new Date("2022-01-01"),
    endDate: new Date("2023-12-31"),
    initialCapital: 100000,
    strategy: {
      name: "RSI_MEAN_REVERSION",
      parameters: {},
    },
    commission: {
      type: "FIXED",
      fixedFee: 1.0,
    },
    slippage: {
      type: "PERCENTAGE",
      percentage: 0.1,
    },
  };

  // Create optimization config (smaller space for faster walk-forward)
  const optimizationConfig = {
    ...createRSIOptimizationConfig(baseBacktestConfig),
    parameterRanges: [
      { name: "rsiPeriod", values: [14, 20], type: "discrete" as const },
      { name: "oversoldThreshold", values: [30, 35], type: "discrete" as const },
      { name: "overboughtThreshold", values: [65, 70], type: "discrete" as const },
    ],
  };

  // Create walk-forward config
  const walkForwardConfig = createStandardWalkForwardConfig();

  // Create optimizer
  const optimizer = new ParameterOptimizer(dataProvider, strategyFactory);

  console.log("Starting walk-forward analysis...");
  console.log("This will take several minutes as we optimize on each window...");

  const result = await optimizer.walkForward(walkForwardConfig, optimizationConfig);

  // Analyze overfitting
  const overfitting = result.overfittingAnalysis;

  console.log("\n=== OVERFITTING ANALYSIS ===");
  console.log(`Severity: ${overfitting.severity}`);
  console.log(`Degradation: ${overfitting.degradationPercent.toFixed(2)}%`);
  console.log(`Consistency Score: ${overfitting.consistencyScore.toFixed(2)}/100`);

  if (overfitting.isOverfitted) {
    console.log("\n⚠️  WARNING: Overfitting detected!");
    console.log("Recommendations:");
    overfitting.recommendations.forEach((rec) => console.log(`  - ${rec}`));
  } else {
    console.log("\n✓ No significant overfitting detected");
  }

  return result;
}

/**
 * Example: Complete optimization workflow
 * 1. Grid search to find best parameters
 * 2. Walk-forward analysis to validate robustness
 */
export async function completeOptimizationWorkflow(
  dataProvider: DataProvider,
  strategyFactory: (params: Record<string, unknown>) => BacktestStrategy
) {
  console.log("=== COMPLETE OPTIMIZATION WORKFLOW ===\n");

  // Step 1: Grid search
  console.log("Step 1: Running grid search to find best parameters...");
  const gridResult = await optimizeRSIGridSearch(dataProvider, strategyFactory);
  const bestParams = gridResult.bestResult.parameters.parameters;

  console.log(`\nBest parameters from grid search:`);
  console.log(JSON.stringify(bestParams, null, 2));

  // Step 2: Walk-forward validation
  console.log("\n\nStep 2: Validating with walk-forward analysis...");
  const walkForwardResult = await runWalkForwardAnalysis(dataProvider, strategyFactory);

  // Step 3: Compare results
  console.log("\n\n=== COMPARISON ===");
  console.log(`Grid Search Best Sharpe: ${gridResult.bestResult.objectiveValue.toFixed(2)}`);
  console.log(
    `Walk-Forward Avg Out-of-Sample Sharpe: ${walkForwardResult.overfittingAnalysis.avgOutOfSampleObjective.toFixed(2)}`
  );

  const degradation = walkForwardResult.overfittingAnalysis.degradationPercent;
  console.log(`Performance Degradation: ${degradation.toFixed(2)}%`);

  if (Math.abs(degradation) < 10) {
    console.log("\n✓ Strategy shows good generalization!");
  } else if (Math.abs(degradation) < 25) {
    console.log("\n⚠️  Moderate overfitting - use with caution");
  } else {
    console.log("\n❌ Severe overfitting - do not use these parameters!");
  }

  return {
    gridResult,
    walkForwardResult,
  };
}

/**
 * Usage example:
 *
 * import { optimizeRSIGridSearch } from './examples/optimize-rsi-example.js';
 * import { MyDataProvider } from './my-data-provider.js';
 * import { RSIStrategy } from './strategies/rsi-strategy.js';
 *
 * const dataProvider = new MyDataProvider();
 * const strategyFactory = (params) => new RSIStrategy(params);
 *
 * const result = await optimizeRSIGridSearch(dataProvider, strategyFactory);
 */
