/**
 * Type definitions for parameter optimization framework
 * Supports grid search, random search, and walk-forward analysis
 */

import type { BacktestConfig, BacktestResult, PerformanceMetrics } from "../types/backtest-types.js";

/**
 * Parameter range definition
 * Supports discrete values or continuous ranges
 */
export interface ParameterRange {
  /** Parameter name */
  name: string;
  /** Discrete values to test */
  values?: (number | string | boolean)[];
  /** Minimum value (for continuous ranges) */
  min?: number;
  /** Maximum value (for continuous ranges) */
  max?: number;
  /** Step size (for continuous ranges) */
  step?: number;
  /** Parameter type */
  type: "discrete" | "continuous" | "integer";
}

/**
 * Parameter set (one combination of parameters)
 */
export interface ParameterSet {
  /** Parameter values */
  parameters: Record<string, number | string | boolean>;
  /** Hash for deduplication */
  hash?: string;
}

/**
 * Optimization method type
 */
export type OptimizationMethod = "grid" | "random" | "genetic" | "bayesian";

/**
 * Optimization objective metric
 */
export type OptimizationObjective =
  | "sharpeRatio"
  | "sortinoRatio"
  | "calmarRatio"
  | "totalReturn"
  | "cagr"
  | "profitFactor"
  | "winRate"
  | "expectancy"
  | "custom";

/**
 * Optimization configuration
 */
export interface OptimizationConfig {
  /** Unique optimization run ID */
  id: string;
  /** Optimization name */
  name: string;
  /** Base backtest configuration */
  backtestConfig: BacktestConfig;
  /** Parameter ranges to optimize */
  parameterRanges: ParameterRange[];
  /** Optimization method */
  method: OptimizationMethod;
  /** Objective metric to optimize */
  objective: OptimizationObjective;
  /** Custom objective function (if objective is "custom") */
  customObjective?: (metrics: PerformanceMetrics) => number;
  /** Maximize or minimize objective */
  direction: "maximize" | "minimize";
  /** Method-specific options */
  methodOptions?: {
    /** Number of iterations (for random search) */
    iterations?: number;
    /** Random seed for reproducibility */
    seed?: number;
    /** Population size (for genetic algorithm) */
    populationSize?: number;
    /** Number of generations (for genetic algorithm) */
    generations?: number;
    /** Early stopping threshold (stop if no improvement) */
    earlyStoppingRounds?: number;
    /** Enable parallel execution */
    parallel?: boolean;
    /** Maximum concurrent backtests */
    maxConcurrent?: number;
  };
  /** Constraints */
  constraints?: OptimizationConstraint[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Optimization constraint
 */
export interface OptimizationConstraint {
  /** Constraint type */
  type: "parameter" | "metric";
  /** Constraint function (returns true if valid) */
  validate: (params: ParameterSet, metrics?: PerformanceMetrics) => boolean;
  /** Constraint description */
  description: string;
}

/**
 * Single optimization result
 */
export interface OptimizationResult {
  /** Parameter set tested */
  parameters: ParameterSet;
  /** Backtest result */
  backtestResult: BacktestResult;
  /** Objective metric value */
  objectiveValue: number;
  /** Execution time (ms) */
  executionTimeMs: number;
  /** Result index (order tested) */
  index: number;
  /** Validation result (if applicable) */
  isValid: boolean;
  /** Constraint violations */
  constraintViolations?: string[];
}

/**
 * Complete optimization run result
 */
export interface OptimizationRunResult {
  /** Optimization configuration */
  config: OptimizationConfig;
  /** Timestamp when started */
  startTime: Date;
  /** Timestamp when completed */
  endTime: Date;
  /** Total execution time (ms) */
  totalExecutionTimeMs: number;
  /** All results (sorted by objective value) */
  results: OptimizationResult[];
  /** Best result */
  bestResult: OptimizationResult;
  /** Summary statistics */
  summary: OptimizationSummary;
  /** Overfitting metrics (if walk-forward was used) */
  overfittingAnalysis?: OverfittingAnalysis;
}

/**
 * Optimization summary statistics
 */
export interface OptimizationSummary {
  /** Total parameter combinations tested */
  totalCombinations: number;
  /** Valid combinations (passed constraints) */
  validCombinations: number;
  /** Invalid combinations */
  invalidCombinations: number;
  /** Best objective value */
  bestObjectiveValue: number;
  /** Worst objective value */
  worstObjectiveValue: number;
  /** Mean objective value */
  meanObjectiveValue: number;
  /** Median objective value */
  medianObjectiveValue: number;
  /** Standard deviation of objective values */
  stdDevObjectiveValue: number;
  /** Average execution time per backtest (ms) */
  avgExecutionTimeMs: number;
  /** Parameter sensitivity analysis */
  parameterSensitivity: ParameterSensitivity[];
}

/**
 * Parameter sensitivity analysis
 */
export interface ParameterSensitivity {
  /** Parameter name */
  parameterName: string;
  /** Impact on objective (correlation coefficient) */
  correlation: number;
  /** Most impactful value */
  bestValue: number | string | boolean;
  /** Value range tested */
  valueRange: (number | string | boolean)[];
  /** Performance for each value */
  valuePerformance: { value: number | string | boolean; avgObjective: number }[];
}

/**
 * Walk-forward analysis configuration
 */
export interface WalkForwardConfig {
  /** Training window size (months) */
  trainMonths: number;
  /** Testing window size (months) */
  testMonths: number;
  /** Step size (months to roll forward) */
  stepMonths: number;
  /** Minimum number of windows required */
  minWindows?: number;
  /** Anchored or rolling window */
  windowType: "rolling" | "anchored";
}

/**
 * Walk-forward window
 */
export interface WalkForwardWindow {
  /** Window index */
  index: number;
  /** Training period start */
  trainStart: Date;
  /** Training period end */
  trainEnd: Date;
  /** Testing period start */
  testStart: Date;
  /** Testing period end */
  testEnd: Date;
  /** Optimization result from training period */
  optimizationResult?: OptimizationResult;
  /** Backtest result from testing period (out-of-sample) */
  testResult?: BacktestResult;
  /** Test objective value */
  testObjectiveValue?: number;
}

/**
 * Walk-forward analysis result
 */
export interface WalkForwardResult {
  /** Walk-forward configuration */
  config: WalkForwardConfig;
  /** Base optimization config */
  optimizationConfig: OptimizationConfig;
  /** All windows */
  windows: WalkForwardWindow[];
  /** Aggregated out-of-sample metrics */
  aggregatedMetrics: PerformanceMetrics;
  /** Overfitting analysis */
  overfittingAnalysis: OverfittingAnalysis;
  /** Total execution time (ms) */
  totalExecutionTimeMs: number;
}

/**
 * Overfitting analysis
 */
export interface OverfittingAnalysis {
  /** Average in-sample objective value */
  avgInSampleObjective: number;
  /** Average out-of-sample objective value */
  avgOutOfSampleObjective: number;
  /** Degradation percentage */
  degradationPercent: number;
  /** Consistency score (0-100, higher is better) */
  consistencyScore: number;
  /** Number of windows where out-of-sample beat in-sample */
  outperformingWindows: number;
  /** Total windows */
  totalWindows: number;
  /** Overfitting detected */
  isOverfitted: boolean;
  /** Overfitting severity */
  severity: "none" | "low" | "moderate" | "high" | "severe";
  /** Recommendations */
  recommendations: string[];
}

/**
 * Optimization progress callback
 */
export interface OptimizationProgress {
  /** Current iteration */
  current: number;
  /** Total iterations */
  total: number;
  /** Percentage complete */
  percentComplete: number;
  /** Current best objective value */
  currentBest: number;
  /** Time elapsed (ms) */
  timeElapsedMs: number;
  /** Estimated time remaining (ms) */
  estimatedTimeRemainingMs: number;
  /** Current parameter set being tested */
  currentParameters?: ParameterSet;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: OptimizationProgress) => void;
