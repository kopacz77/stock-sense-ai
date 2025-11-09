/**
 * Example Optimization Configurations
 * Pre-configured optimization setups for common strategies
 */

import type { OptimizationConfig, WalkForwardConfig, ParameterRange } from "./types.js";
import type { BacktestConfig } from "../types/backtest-types.js";

/**
 * RSI Mean Reversion Strategy Optimization
 *
 * Parameters to optimize:
 * - rsiPeriod: How many periods for RSI calculation (10, 14, 20)
 * - oversoldThreshold: Buy when RSI below this (25, 30, 35)
 * - overboughtThreshold: Sell when RSI above this (65, 70, 75)
 *
 * Total combinations: 3 x 3 x 3 = 27
 */
export function createRSIOptimizationConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  const parameterRanges: ParameterRange[] = [
    {
      name: "rsiPeriod",
      values: [10, 14, 20],
      type: "discrete",
    },
    {
      name: "oversoldThreshold",
      values: [25, 30, 35],
      type: "discrete",
    },
    {
      name: "overboughtThreshold",
      values: [65, 70, 75],
      type: "discrete",
    },
  ];

  return {
    id: `rsi-opt-${Date.now()}`,
    name: "RSI Mean Reversion Optimization",
    backtestConfig: baseBacktestConfig,
    parameterRanges,
    method: "grid",
    objective: "sharpeRatio",
    direction: "maximize",
    methodOptions: {
      parallel: false,
    },
    constraints: [
      {
        type: "parameter",
        validate: (params) => {
          const oversold = params.parameters.oversoldThreshold as number;
          const overbought = params.parameters.overboughtThreshold as number;
          // Ensure oversold < overbought with reasonable gap
          return overbought - oversold >= 30;
        },
        description: "Overbought threshold must be at least 30 points above oversold",
      },
    ],
  };
}

/**
 * Momentum Strategy Optimization
 *
 * Parameters to optimize:
 * - lookbackPeriod: How many days to look back (10, 20, 30, 50)
 * - momentumThreshold: Minimum % change to trigger signal (2%, 5%, 8%)
 * - holdingPeriod: How many days to hold position (5, 10, 20)
 *
 * Total combinations: 4 x 3 x 3 = 36
 */
export function createMomentumOptimizationConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  const parameterRanges: ParameterRange[] = [
    {
      name: "lookbackPeriod",
      values: [10, 20, 30, 50],
      type: "discrete",
    },
    {
      name: "momentumThreshold",
      values: [2, 5, 8],
      type: "discrete",
    },
    {
      name: "holdingPeriod",
      values: [5, 10, 20],
      type: "discrete",
    },
  ];

  return {
    id: `momentum-opt-${Date.now()}`,
    name: "Momentum Strategy Optimization",
    backtestConfig: baseBacktestConfig,
    parameterRanges,
    method: "grid",
    objective: "sortinoRatio",
    direction: "maximize",
  };
}

/**
 * Moving Average Crossover Optimization
 *
 * Parameters to optimize:
 * - shortMA: Short moving average period (5, 10, 20)
 * - longMA: Long moving average period (50, 100, 200)
 *
 * Total combinations: 3 x 3 = 9
 */
export function createMACrossoverOptimizationConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  const parameterRanges: ParameterRange[] = [
    {
      name: "shortMA",
      values: [5, 10, 20],
      type: "discrete",
    },
    {
      name: "longMA",
      values: [50, 100, 200],
      type: "discrete",
    },
  ];

  return {
    id: `ma-crossover-opt-${Date.now()}`,
    name: "MA Crossover Optimization",
    backtestConfig: baseBacktestConfig,
    parameterRanges,
    method: "grid",
    objective: "sharpeRatio",
    direction: "maximize",
    constraints: [
      {
        type: "parameter",
        validate: (params) => {
          const shortMA = params.parameters.shortMA as number;
          const longMA = params.parameters.longMA as number;
          // Short MA must be less than long MA
          return shortMA < longMA;
        },
        description: "Short MA must be less than long MA",
      },
    ],
  };
}

/**
 * Random Search Example
 * Use random search for larger parameter spaces
 */
export function createRandomSearchConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  const parameterRanges: ParameterRange[] = [
    {
      name: "rsiPeriod",
      min: 5,
      max: 30,
      step: 1,
      type: "integer",
    },
    {
      name: "oversoldThreshold",
      min: 20,
      max: 40,
      step: 1,
      type: "integer",
    },
    {
      name: "overboughtThreshold",
      min: 60,
      max: 80,
      step: 1,
      type: "integer",
    },
  ];

  return {
    id: `rsi-random-opt-${Date.now()}`,
    name: "RSI Random Search Optimization",
    backtestConfig: baseBacktestConfig,
    parameterRanges,
    method: "random",
    objective: "sharpeRatio",
    direction: "maximize",
    methodOptions: {
      iterations: 100,
      seed: 42, // For reproducibility
      earlyStoppingRounds: 20, // Stop if no improvement for 20 iterations
    },
  };
}

/**
 * Custom Objective Function Example
 * Optimize for a combination of return and risk
 */
export function createCustomObjectiveConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  return {
    id: `custom-obj-${Date.now()}`,
    name: "Custom Objective Optimization",
    backtestConfig: baseBacktestConfig,
    parameterRanges: [
      { name: "rsiPeriod", values: [10, 14, 20], type: "discrete" },
      { name: "oversoldThreshold", values: [25, 30, 35], type: "discrete" },
      { name: "overboughtThreshold", values: [65, 70, 75], type: "discrete" },
    ],
    method: "grid",
    objective: "custom",
    direction: "maximize",
    customObjective: (metrics) => {
      // Custom objective: Sharpe Ratio weighted with Win Rate
      // This prioritizes strategies with both good risk-adjusted returns
      // and high probability of success
      const sharpeWeight = 0.7;
      const winRateWeight = 0.3;

      return sharpeWeight * metrics.sharpeRatio + winRateWeight * (metrics.winRate / 100);
    },
  };
}

/**
 * Walk-Forward Analysis Configuration
 * Standard 6-month train, 3-month test, monthly roll
 */
export function createStandardWalkForwardConfig(): WalkForwardConfig {
  return {
    trainMonths: 6,
    testMonths: 3,
    stepMonths: 1,
    minWindows: 3,
    windowType: "rolling",
  };
}

/**
 * Anchored Walk-Forward Configuration
 * Always train from the beginning, expand training set over time
 */
export function createAnchoredWalkForwardConfig(): WalkForwardConfig {
  return {
    trainMonths: 6,
    testMonths: 3,
    stepMonths: 3,
    minWindows: 3,
    windowType: "anchored",
  };
}

/**
 * Conservative Walk-Forward Configuration
 * Longer training, shorter testing, less frequent rolls
 */
export function createConservativeWalkForwardConfig(): WalkForwardConfig {
  return {
    trainMonths: 12,
    testMonths: 2,
    stepMonths: 2,
    minWindows: 3,
    windowType: "rolling",
  };
}

/**
 * Aggressive Walk-Forward Configuration
 * Shorter training, longer testing, frequent rolls
 */
export function createAggressiveWalkForwardConfig(): WalkForwardConfig {
  return {
    trainMonths: 3,
    testMonths: 3,
    stepMonths: 1,
    minWindows: 5,
    windowType: "rolling",
  };
}

/**
 * Example: Complete RSI optimization with walk-forward
 */
export function createRSIWithWalkForward(baseBacktestConfig: BacktestConfig) {
  const optimizationConfig = createRSIOptimizationConfig(baseBacktestConfig);
  const walkForwardConfig = createStandardWalkForwardConfig();

  return {
    optimizationConfig,
    walkForwardConfig,
  };
}

/**
 * Example: Fast optimization (for testing)
 * Small parameter space for quick validation
 */
export function createFastOptimizationConfig(
  baseBacktestConfig: BacktestConfig
): OptimizationConfig {
  return {
    id: `fast-opt-${Date.now()}`,
    name: "Fast Optimization Test",
    backtestConfig: baseBacktestConfig,
    parameterRanges: [
      { name: "rsiPeriod", values: [14, 20], type: "discrete" },
      { name: "oversoldThreshold", values: [30], type: "discrete" },
      { name: "overboughtThreshold", values: [70], type: "discrete" },
    ],
    method: "grid",
    objective: "sharpeRatio",
    direction: "maximize",
  };
}
