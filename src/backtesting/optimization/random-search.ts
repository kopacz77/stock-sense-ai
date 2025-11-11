/**
 * Random Search Optimization
 * Randomly samples parameter space
 *
 * Algorithm:
 * 1. Generate random parameter combinations
 * 2. Run backtest for each combination
 * 3. Track best result found
 * 4. Optional: Early stopping if no improvement
 *
 * Pros: Much faster than grid search for large parameter spaces
 * Cons: Not guaranteed to find global optimum
 *
 * Research shows random search often finds near-optimal solutions
 * in 10-20% of the time of exhaustive grid search.
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

export class RandomSearchOptimizer {
  private config: OptimizationConfig;
  private dataProvider: DataProvider;
  private strategyFactory: (params: Record<string, unknown>) => BacktestStrategy;
  private progressCallback?: ProgressCallback;
  private rng: () => number;
  private testedHashes: Set<string>;

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
    this.testedHashes = new Set();

    // Initialize RNG with seed for reproducibility
    const seed = this.config.methodOptions?.seed ?? Date.now();
    this.rng = this.createSeededRandom(seed);
  }

  /**
   * Run random search optimization
   */
  async optimize(): Promise<OptimizationRunResult> {
    const startTime = new Date();
    const startTimeMs = Date.now();

    const iterations = this.config.methodOptions?.iterations ?? 100;
    const earlyStoppingRounds = this.config.methodOptions?.earlyStoppingRounds;

    console.log(`\n========================================`);
    console.log(`Random Search Optimization: ${this.config.name}`);
    console.log(`========================================`);
    console.log(`Iterations: ${iterations}`);
    if (earlyStoppingRounds) {
      console.log(`Early stopping: ${earlyStoppingRounds} rounds without improvement`);
    }

    const results: OptimizationResult[] = [];
    let bestObjectiveValue =
      this.config.direction === "maximize" ? -Infinity : Infinity;
    let roundsWithoutImprovement = 0;

    for (let i = 0; i < iterations; i++) {
      const iterationStartTime = Date.now();

      // Generate random parameter set
      const paramSet = this.generateRandomParameters();

      // Skip if we've already tested this combination
      if (this.testedHashes.has(paramSet.hash!)) {
        console.log(`Iteration ${i + 1}/${iterations}: Skipping duplicate`);
        continue;
      }

      this.testedHashes.add(paramSet.hash!);

      try {
        // Validate constraints
        const isValid = this.validateConstraints(paramSet);
        const constraintViolations: string[] = [];

        if (!isValid) {
          constraintViolations.push("Parameter constraints violated");
        }

        // Create strategy with these parameters
        const strategy = this.strategyFactory(paramSet.parameters);

        // Create backtest config
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
          index: i,
          isValid,
          constraintViolations: constraintViolations.length > 0 ? constraintViolations : undefined,
        };

        results.push(result);

        // Check for improvement
        const isImprovement =
          this.config.direction === "maximize"
            ? objectiveValue > bestObjectiveValue
            : objectiveValue < bestObjectiveValue;

        if (isImprovement && isValid) {
          bestObjectiveValue = objectiveValue;
          roundsWithoutImprovement = 0;
          console.log(
            `Iteration ${i + 1}/${iterations}: NEW BEST! ${this.config.objective} = ${objectiveValue.toFixed(4)}`
          );
        } else {
          roundsWithoutImprovement++;
          console.log(
            `Iteration ${i + 1}/${iterations}: ${this.config.objective} = ${objectiveValue.toFixed(4)} (Best: ${bestObjectiveValue.toFixed(4)})`
          );
        }

        // Report progress
        this.reportProgress(i + 1, iterations, results, bestObjectiveValue);

        // Early stopping check
        if (earlyStoppingRounds && roundsWithoutImprovement >= earlyStoppingRounds) {
          console.log(
            `\nEarly stopping triggered after ${roundsWithoutImprovement} rounds without improvement`
          );
          break;
        }
      } catch (error) {
        console.error(`Error in iteration ${i + 1}:`, error);
      }
    }

    // Sort results by objective value
    const sortedResults = this.sortResults(results);

    const endTime = new Date();
    const totalExecutionTimeMs = Date.now() - startTimeMs;

    // Calculate summary statistics
    const summary = this.calculateSummary(sortedResults);

    console.log(`\nOptimization Complete!`);
    console.log(`Total execution time: ${(totalExecutionTimeMs / 1000).toFixed(2)}s`);
    console.log(`Iterations completed: ${results.length}`);
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
   * Generate random parameter set
   */
  private generateRandomParameters(): ParameterSet {
    const parameters: Record<string, number | string | boolean> = {};

    for (const range of this.config.parameterRanges) {
      if (range.values) {
        // Random choice from discrete values
        const index = Math.floor(this.rng() * range.values.length);
        parameters[range.name] = range.values[index]!;
      } else if (range.type === "continuous") {
        // Random value in continuous range
        if (range.min === undefined || range.max === undefined) {
          throw new Error(`Parameter ${range.name}: min and max required for continuous range`);
        }
        parameters[range.name] = range.min + this.rng() * (range.max - range.min);
      } else if (range.type === "integer") {
        // Random integer in range
        if (range.min === undefined || range.max === undefined) {
          throw new Error(`Parameter ${range.name}: min and max required for integer range`);
        }
        parameters[range.name] = Math.floor(
          range.min + this.rng() * (range.max - range.min + 1)
        );
      }
    }

    return {
      parameters,
      hash: this.hashParameters(parameters),
    };
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
      if (a.isValid !== b.isValid) {
        return a.isValid ? -1 : 1;
      }
      return direction * (a.objectiveValue - b.objectiveValue);
    });
  }

  /**
   * Report progress
   */
  private reportProgress(
    current: number,
    total: number,
    results: OptimizationResult[],
    currentBest: number
  ): void {
    if (this.progressCallback) {
      this.progressCallback({
        current,
        total,
        percentComplete: (current / total) * 100,
        currentBest,
        timeElapsedMs: 0,
        estimatedTimeRemainingMs: 0,
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
   * Calculate parameter sensitivity
   */
  private calculateParameterSensitivity(results: OptimizationResult[]) {
    const sensitivity = [];

    for (const range of this.config.parameterRanges) {
      const paramName = range.name;

      // For random search, we can't group by discrete values easily
      // Instead, calculate correlation coefficient
      const paramValues: number[] = [];
      const objectives: number[] = [];

      for (const result of results) {
        const value = result.parameters.parameters[paramName];
        if (typeof value === "number") {
          paramValues.push(value);
          objectives.push(result.objectiveValue);
        }
      }

      let correlation = 0;
      if (paramValues.length > 1) {
        correlation = this.calculateCorrelation(paramValues, objectives);
      }

      // Find best value
      const bestResult = results[0];
      const bestValue = bestResult?.parameters.parameters[paramName] ?? 0;

      sensitivity.push({
        parameterName: paramName,
        correlation: Math.abs(correlation),
        bestValue,
        valueRange: [...new Set(results.map((r) => r.parameters.parameters[paramName]))]
          .filter((v): v is string | number | boolean => v !== undefined),
        valuePerformance: [], // Not applicable for random search
      });
    }

    return sensitivity;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i]! - meanX;
      const dy = y[i]! - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : numerator / denom;
  }

  /**
   * Create seeded random number generator (LCG)
   */
  private createSeededRandom(seed: number): () => number {
    let state = seed;
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;

    return () => {
      state = (a * state + c) % m;
      return state / m;
    };
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
