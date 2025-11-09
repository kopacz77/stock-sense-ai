/**
 * Grid Search Optimization
 * Exhaustively tests all parameter combinations
 *
 * Algorithm:
 * 1. Generate all possible parameter combinations (Cartesian product)
 * 2. Run backtest for each combination
 * 3. Rank results by objective metric
 *
 * Pros: Guaranteed to find best combination in search space
 * Cons: Exponential time complexity - can be slow for large parameter spaces
 *
 * Example: RSI with periods [10,14,20], oversold [25,30,35], overbought [65,70,75]
 * = 3 x 3 x 3 = 27 combinations
 */

import type {
  OptimizationConfig,
  OptimizationResult,
  OptimizationRunResult,
  ParameterRange,
  ParameterSet,
  ProgressCallback,
} from "./types.js";
import type { BacktestConfig, DataProvider, BacktestStrategy } from "../types/backtest-types.js";
import { BacktestEngine } from "../engine/backtest-engine.js";
import { createHash } from "crypto";

export class GridSearchOptimizer {
  private config: OptimizationConfig;
  private dataProvider: DataProvider;
  private strategyFactory: (params: Record<string, unknown>) => BacktestStrategy;
  private progressCallback?: ProgressCallback;

  constructor(
    config: OptimizationConfig,
    dataProvider: DataProvider,
    strategyFactory: (params: Record<string, unknown>) => BacktestStrategy,
    progressCallback?: ProgressCallback
  ) {
    this.config = config;
    this.dataProvider = dataProvider;
    this.strategyFactory = strategyFactory;
    this.progressCallback = progressCallback;
  }

  /**
   * Run grid search optimization
   */
  async optimize(): Promise<OptimizationRunResult> {
    const startTime = new Date();
    const startTimeMs = Date.now();

    console.log(`\n========================================`);
    console.log(`Grid Search Optimization: ${this.config.name}`);
    console.log(`========================================`);

    // Generate all parameter combinations
    const parameterSets = this.generateParameterGrid();
    console.log(`Total combinations to test: ${parameterSets.length}`);

    // Run backtests for all combinations
    const results = await this.runBacktests(parameterSets);

    // Sort by objective value
    const sortedResults = this.sortResults(results);

    const endTime = new Date();
    const totalExecutionTimeMs = Date.now() - startTimeMs;

    // Calculate summary statistics
    const summary = this.calculateSummary(sortedResults);

    console.log(`\nOptimization Complete!`);
    console.log(`Total execution time: ${(totalExecutionTimeMs / 1000).toFixed(2)}s`);
    console.log(`Best ${this.config.objective}: ${sortedResults[0]?.objectiveValue.toFixed(4) ?? "N/A"}`);

    return {
      config: this.config,
      startTime,
      endTime,
      totalExecutionTimeMs,
      results: sortedResults,
      bestResult: sortedResults[0]!,
      summary,
    };
  }

  /**
   * Generate all parameter combinations (Cartesian product)
   */
  private generateParameterGrid(): ParameterSet[] {
    const ranges = this.config.parameterRanges;

    // Generate values for each parameter
    const parameterValues: Record<string, (number | string | boolean)[]> = {};

    for (const range of ranges) {
      if (range.values) {
        // Discrete values provided
        parameterValues[range.name] = range.values;
      } else if (range.type === "continuous" || range.type === "integer") {
        // Generate values from range
        if (range.min === undefined || range.max === undefined || range.step === undefined) {
          throw new Error(
            `Parameter ${range.name}: min, max, and step are required for continuous/integer ranges`
          );
        }

        const values: number[] = [];
        for (let value = range.min; value <= range.max; value += range.step) {
          values.push(range.type === "integer" ? Math.round(value) : value);
        }
        parameterValues[range.name] = values;
      } else {
        throw new Error(`Invalid parameter range type for ${range.name}`);
      }
    }

    // Generate Cartesian product
    const combinations = this.cartesianProduct(parameterValues);

    // Convert to ParameterSet array
    return combinations.map((params) => ({
      parameters: params,
      hash: this.hashParameters(params),
    }));
  }

  /**
   * Cartesian product of parameter values
   */
  private cartesianProduct(
    parameterValues: Record<string, (number | string | boolean)[]>
  ): Record<string, number | string | boolean>[] {
    const keys = Object.keys(parameterValues);
    if (keys.length === 0) return [{}];

    const result: Record<string, number | string | boolean>[] = [];

    const recurse = (
      index: number,
      current: Record<string, number | string | boolean>
    ) => {
      if (index === keys.length) {
        result.push({ ...current });
        return;
      }

      const key = keys[index]!;
      const values = parameterValues[key]!;

      for (const value of values) {
        current[key] = value;
        recurse(index + 1, current);
      }
    };

    recurse(0, {});
    return result;
  }

  /**
   * Run backtests for all parameter sets
   */
  private async runBacktests(parameterSets: ParameterSet[]): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];
    const total = parameterSets.length;
    let completed = 0;

    for (const paramSet of parameterSets) {
      const iterationStartTime = Date.now();

      try {
        // Validate constraints
        const isValid = this.validateConstraints(paramSet);
        const constraintViolations: string[] = [];

        if (!isValid) {
          constraintViolations.push("Parameter constraints violated");
        }

        // Create strategy with these parameters
        const strategy = this.strategyFactory(paramSet.parameters);

        // Create backtest config with these parameters
        const backtestConfig: BacktestConfig = {
          ...this.config.backtestConfig,
          strategy: {
            name: strategy.getName(),
            parameters: paramSet.parameters,
          },
        };

        // Run backtest
        const engine = new BacktestEngine(backtestConfig, strategy, this.dataProvider);
        const backtestResult = await engine.run();

        // Calculate objective value
        const objectiveValue = this.calculateObjective(backtestResult.metrics);

        const result: OptimizationResult = {
          parameters: paramSet,
          backtestResult,
          objectiveValue,
          executionTimeMs: Date.now() - iterationStartTime,
          index: completed,
          isValid,
          constraintViolations: constraintViolations.length > 0 ? constraintViolations : undefined,
        };

        results.push(result);

        // Update progress
        completed++;
        this.reportProgress(completed, total, results);
      } catch (error) {
        console.error(`Error testing parameters:`, paramSet.parameters, error);
        completed++;
      }
    }

    return results;
  }

  /**
   * Validate parameter constraints
   */
  private validateConstraints(paramSet: ParameterSet): boolean {
    if (!this.config.constraints) return true;

    for (const constraint of this.config.constraints) {
      if (constraint.type === "parameter") {
        if (!constraint.validate(paramSet)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate objective metric value
   */
  private calculateObjective(metrics: any): number {
    if (this.config.objective === "custom" && this.config.customObjective) {
      return this.config.customObjective(metrics);
    }

    // Map objective to metric
    const metricMap: Record<string, keyof typeof metrics> = {
      sharpeRatio: "sharpeRatio",
      sortinoRatio: "sortinoRatio",
      calmarRatio: "calmarRatio",
      totalReturn: "totalReturn",
      cagr: "cagr",
      profitFactor: "profitFactor",
      winRate: "winRate",
      expectancy: "expectancy",
    };

    const metricKey = metricMap[this.config.objective];
    if (!metricKey) {
      throw new Error(`Unknown objective: ${this.config.objective}`);
    }

    return Number(metrics[metricKey]) || 0;
  }

  /**
   * Sort results by objective value
   */
  private sortResults(results: OptimizationResult[]): OptimizationResult[] {
    const direction = this.config.direction === "maximize" ? -1 : 1;

    return [...results].sort((a, b) => {
      // Prioritize valid results
      if (a.isValid !== b.isValid) {
        return a.isValid ? -1 : 1;
      }

      return direction * (a.objectiveValue - b.objectiveValue);
    });
  }

  /**
   * Report progress
   */
  private reportProgress(current: number, total: number, results: OptimizationResult[]): void {
    const percentComplete = (current / total) * 100;
    const bestSoFar = results.reduce((best, r) => {
      if (!r.isValid) return best;
      if (!best) return r.objectiveValue;
      return this.config.direction === "maximize"
        ? Math.max(best, r.objectiveValue)
        : Math.min(best, r.objectiveValue);
    }, 0);

    console.log(
      `Progress: ${current}/${total} (${percentComplete.toFixed(1)}%) | Best: ${bestSoFar.toFixed(4)}`
    );

    if (this.progressCallback) {
      this.progressCallback({
        current,
        total,
        percentComplete,
        currentBest: bestSoFar,
        timeElapsedMs: 0, // Would need to track
        estimatedTimeRemainingMs: 0, // Would need to estimate
        currentParameters: results[results.length - 1]?.parameters,
      });
    }
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: OptimizationResult[]) {
    const validResults = results.filter((r) => r.isValid);
    const objectiveValues = validResults.map((r) => r.objectiveValue);

    const mean =
      objectiveValues.length > 0
        ? objectiveValues.reduce((sum, val) => sum + val, 0) / objectiveValues.length
        : 0;

    const sortedValues = [...objectiveValues].sort((a, b) => a - b);
    const median =
      sortedValues.length > 0
        ? sortedValues[Math.floor(sortedValues.length / 2)] ?? 0
        : 0;

    const variance =
      objectiveValues.length > 0
        ? objectiveValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          objectiveValues.length
        : 0;

    const stdDev = Math.sqrt(variance);

    const avgExecutionTime =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length
        : 0;

    // Calculate parameter sensitivity
    const parameterSensitivity = this.calculateParameterSensitivity(validResults);

    return {
      totalCombinations: results.length,
      validCombinations: validResults.length,
      invalidCombinations: results.length - validResults.length,
      bestObjectiveValue: validResults[0]?.objectiveValue ?? 0,
      worstObjectiveValue: validResults[validResults.length - 1]?.objectiveValue ?? 0,
      meanObjectiveValue: mean,
      medianObjectiveValue: median,
      stdDevObjectiveValue: stdDev,
      avgExecutionTimeMs: avgExecutionTime,
      parameterSensitivity,
    };
  }

  /**
   * Calculate parameter sensitivity (how each parameter affects the objective)
   */
  private calculateParameterSensitivity(results: OptimizationResult[]) {
    const sensitivity = [];

    for (const range of this.config.parameterRanges) {
      const paramName = range.name;
      const valueGroups = new Map<string | number | boolean, number[]>();

      // Group results by parameter value
      for (const result of results) {
        const value = result.parameters.parameters[paramName];
        if (value !== undefined) {
          if (!valueGroups.has(value)) {
            valueGroups.set(value, []);
          }
          valueGroups.get(value)!.push(result.objectiveValue);
        }
      }

      // Calculate average objective for each value
      const valuePerformance = Array.from(valueGroups.entries()).map(([value, objectives]) => ({
        value,
        avgObjective: objectives.reduce((sum, val) => sum + val, 0) / objectives.length,
      }));

      // Find best value
      const bestPerf =
        this.config.direction === "maximize"
          ? valuePerformance.reduce((best, curr) =>
              curr.avgObjective > best.avgObjective ? curr : best
            )
          : valuePerformance.reduce((best, curr) =>
              curr.avgObjective < best.avgObjective ? curr : best
            );

      // Calculate correlation (simplified - just range of averages)
      const avgObjectives = valuePerformance.map((vp) => vp.avgObjective);
      const correlation =
        avgObjectives.length > 1
          ? Math.max(...avgObjectives) - Math.min(...avgObjectives)
          : 0;

      sensitivity.push({
        parameterName: paramName,
        correlation,
        bestValue: bestPerf?.value ?? 0,
        valueRange: Array.from(valueGroups.keys()),
        valuePerformance,
      });
    }

    return sensitivity;
  }

  /**
   * Hash parameters for deduplication
   */
  private hashParameters(params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("|");
    return createHash("md5").update(sorted).digest("hex");
  }
}
