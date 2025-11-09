/**
 * Parameter Optimization Framework
 * Main exports for the optimization module
 */

// Core optimizer
export { ParameterOptimizer } from "./parameter-optimizer.js";

// Optimization methods
export { GridSearchOptimizer } from "./grid-search.js";
export { RandomSearchOptimizer } from "./random-search.js";
export { WalkForwardAnalyzer } from "./walk-forward.js";

// Reporting and analysis
export { OptimizationReporter } from "./optimization-report.js";

// Example configurations
export {
  createRSIOptimizationConfig,
  createMomentumOptimizationConfig,
  createMACrossoverOptimizationConfig,
  createRandomSearchConfig,
  createCustomObjectiveConfig,
  createStandardWalkForwardConfig,
  createAnchoredWalkForwardConfig,
  createConservativeWalkForwardConfig,
  createAggressiveWalkForwardConfig,
  createRSIWithWalkForward,
  createFastOptimizationConfig,
} from "./example-configs.js";

// Types
export type {
  OptimizationConfig,
  OptimizationResult,
  OptimizationRunResult,
  OptimizationSummary,
  OptimizationMethod,
  OptimizationObjective,
  ParameterRange,
  ParameterSet,
  ParameterSensitivity,
  WalkForwardConfig,
  WalkForwardWindow,
  WalkForwardResult,
  OverfittingAnalysis,
  OptimizationProgress,
  ProgressCallback,
  OptimizationConstraint,
} from "./types.js";
