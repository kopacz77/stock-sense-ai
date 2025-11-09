/**
 * Parameter Optimizer - Main orchestrator for all optimization methods
 * Coordinates grid search, random search, and walk-forward analysis
 *
 * This is the main entry point for parameter optimization.
 */

import type {
  OptimizationConfig,
  OptimizationRunResult,
  WalkForwardConfig,
  WalkForwardResult,
  ProgressCallback,
} from "./types.js";
import type { BacktestStrategy, DataProvider } from "../types/backtest-types.js";
import { GridSearchOptimizer } from "./grid-search.js";
import { RandomSearchOptimizer } from "./random-search.js";
import { WalkForwardAnalyzer } from "./walk-forward.js";
import { OptimizationReporter } from "./optimization-report.js";
import { promises as fs } from "fs";
import path from "path";

/**
 * Main parameter optimizer class
 */
export class ParameterOptimizer {
  private dataProvider: DataProvider;
  private strategyFactory: (params: Record<string, unknown>) => BacktestStrategy;
  private progressCallback?: ProgressCallback;

  constructor(
    dataProvider: DataProvider,
    strategyFactory: (params: Record<string, unknown>) => BacktestStrategy,
    progressCallback?: ProgressCallback
  ) {
    this.dataProvider = dataProvider;
    this.strategyFactory = strategyFactory;
    this.progressCallback = progressCallback;
  }

  /**
   * Run optimization with the specified method
   */
  async optimize(config: OptimizationConfig): Promise<OptimizationRunResult> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`PARAMETER OPTIMIZATION`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Method: ${config.method.toUpperCase()}`);
    console.log(`Objective: ${config.objective}`);
    console.log(`Direction: ${config.direction}`);
    console.log(`Parameters to optimize: ${config.parameterRanges.length}`);
    console.log(`${"=".repeat(60)}\n`);

    let result: OptimizationRunResult;

    switch (config.method) {
      case "grid":
        result = await this.runGridSearch(config);
        break;
      case "random":
        result = await this.runRandomSearch(config);
        break;
      case "genetic":
        throw new Error("Genetic algorithm not yet implemented");
      case "bayesian":
        throw new Error("Bayesian optimization not yet implemented");
      default:
        throw new Error(`Unknown optimization method: ${config.method}`);
    }

    // Generate and print report
    this.printSummary(result);

    return result;
  }

  /**
   * Run walk-forward analysis
   */
  async walkForward(
    walkForwardConfig: WalkForwardConfig,
    optimizationConfig: OptimizationConfig
  ): Promise<WalkForwardResult> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`WALK-FORWARD ANALYSIS`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Optimization Method: ${optimizationConfig.method.toUpperCase()}`);
    console.log(`Training Period: ${walkForwardConfig.trainMonths} months`);
    console.log(`Testing Period: ${walkForwardConfig.testMonths} months`);
    console.log(`Step Size: ${walkForwardConfig.stepMonths} months`);
    console.log(`${"=".repeat(60)}\n`);

    const analyzer = new WalkForwardAnalyzer(
      walkForwardConfig,
      optimizationConfig,
      this.dataProvider,
      this.strategyFactory
    );

    const result = await analyzer.analyze();

    // Print walk-forward summary
    this.printWalkForwardSummary(result);

    return result;
  }

  /**
   * Export optimization results to file
   */
  async exportResults(
    result: OptimizationRunResult | WalkForwardResult,
    outputPath: string,
    format: "json" | "csv" = "json"
  ): Promise<void> {
    console.log(`\nExporting results to ${outputPath}...`);

    if (format === "json") {
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    } else if (format === "csv") {
      // Export as CSV
      const csv = this.convertToCSV(result);
      await fs.writeFile(outputPath, csv);
    }

    console.log(`Results exported successfully!`);
  }

  /**
   * Generate optimization report
   */
  async generateReport(
    result: OptimizationRunResult,
    outputPath: string
  ): Promise<void> {
    const reporter = new OptimizationReporter();
    const report = reporter.generateReport(result);
    await fs.writeFile(outputPath, report);
    console.log(`\nReport generated: ${outputPath}`);
  }

  /**
   * Run grid search optimization
   */
  private async runGridSearch(config: OptimizationConfig): Promise<OptimizationRunResult> {
    const optimizer = new GridSearchOptimizer(
      config,
      this.dataProvider,
      this.strategyFactory,
      this.progressCallback
    );

    return await optimizer.optimize();
  }

  /**
   * Run random search optimization
   */
  private async runRandomSearch(config: OptimizationConfig): Promise<OptimizationRunResult> {
    const optimizer = new RandomSearchOptimizer(
      config,
      this.dataProvider,
      this.strategyFactory,
      this.progressCallback
    );

    return await optimizer.optimize();
  }

  /**
   * Print optimization summary
   */
  private printSummary(result: OptimizationRunResult): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`OPTIMIZATION RESULTS`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\nBest Parameters:`);

    const bestParams = result.bestResult.parameters.parameters;
    for (const [key, value] of Object.entries(bestParams)) {
      console.log(`  ${key}: ${value}`);
    }

    console.log(`\nPerformance:`);
    console.log(`  ${result.config.objective}: ${result.bestResult.objectiveValue.toFixed(4)}`);
    console.log(`  Total Return: ${result.bestResult.backtestResult.metrics.totalReturn.toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${result.bestResult.backtestResult.metrics.sharpeRatio.toFixed(2)}`);
    console.log(`  Win Rate: ${result.bestResult.backtestResult.metrics.winRate.toFixed(2)}%`);
    console.log(`  Total Trades: ${result.bestResult.backtestResult.metrics.totalTrades}`);

    console.log(`\nSummary:`);
    console.log(`  Total Combinations Tested: ${result.summary.totalCombinations}`);
    console.log(`  Valid Combinations: ${result.summary.validCombinations}`);
    console.log(`  Best ${result.config.objective}: ${result.summary.bestObjectiveValue.toFixed(4)}`);
    console.log(`  Worst ${result.config.objective}: ${result.summary.worstObjectiveValue.toFixed(4)}`);
    console.log(`  Mean ${result.config.objective}: ${result.summary.meanObjectiveValue.toFixed(4)}`);
    console.log(`  Execution Time: ${(result.totalExecutionTimeMs / 1000).toFixed(2)}s`);
    console.log(`  Avg Time/Backtest: ${result.summary.avgExecutionTimeMs.toFixed(0)}ms`);

    console.log(`\nParameter Sensitivity (Top 3):`);
    const topSensitive = result.summary.parameterSensitivity
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, 3);

    for (const param of topSensitive) {
      console.log(`  ${param.parameterName}:`);
      console.log(`    Impact: ${param.correlation.toFixed(4)}`);
      console.log(`    Best Value: ${param.bestValue}`);
    }

    console.log(`\n${"=".repeat(60)}\n`);
  }

  /**
   * Print walk-forward summary
   */
  private printWalkForwardSummary(result: WalkForwardResult): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`WALK-FORWARD RESULTS`);
    console.log(`${"=".repeat(60)}`);

    console.log(`\nOverfitting Analysis:`);
    console.log(`  Severity: ${result.overfittingAnalysis.severity.toUpperCase()}`);
    console.log(`  Is Overfit: ${result.overfittingAnalysis.isOverfitted ? "YES" : "NO"}`);
    console.log(`  Degradation: ${result.overfittingAnalysis.degradationPercent.toFixed(2)}%`);
    console.log(`  Consistency Score: ${result.overfittingAnalysis.consistencyScore.toFixed(2)}/100`);
    console.log(`  Avg In-Sample ${result.optimizationConfig.objective}: ${result.overfittingAnalysis.avgInSampleObjective.toFixed(4)}`);
    console.log(`  Avg Out-of-Sample ${result.optimizationConfig.objective}: ${result.overfittingAnalysis.avgOutOfSampleObjective.toFixed(4)}`);

    console.log(`\nWindow Performance:`);
    for (const window of result.windows) {
      const inSample = window.optimizationResult?.objectiveValue ?? 0;
      const outOfSample = window.testObjectiveValue ?? 0;
      const degradation = ((outOfSample - inSample) / inSample) * 100;

      console.log(`  Window ${window.index + 1}:`);
      console.log(`    In-Sample: ${inSample.toFixed(4)} | Out-of-Sample: ${outOfSample.toFixed(4)} | Degradation: ${degradation.toFixed(2)}%`);
    }

    console.log(`\nRecommendations:`);
    for (const rec of result.overfittingAnalysis.recommendations) {
      console.log(`  - ${rec}`);
    }

    console.log(`\nAggregated Out-of-Sample Metrics:`);
    console.log(`  Total Return: ${result.aggregatedMetrics.totalReturn.toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${result.aggregatedMetrics.sharpeRatio.toFixed(2)}`);
    console.log(`  Win Rate: ${result.aggregatedMetrics.winRate.toFixed(2)}%`);
    console.log(`  Total Trades: ${result.aggregatedMetrics.totalTrades}`);

    console.log(`\n${"=".repeat(60)}\n`);
  }

  /**
   * Convert results to CSV format
   */
  private convertToCSV(result: OptimizationRunResult | WalkForwardResult): string {
    const lines: string[] = [];

    if ("results" in result) {
      // OptimizationRunResult
      lines.push("Index,ObjectiveValue,IsValid,...Parameters...");

      for (const res of result.results) {
        const paramValues = Object.values(res.parameters.parameters).join(",");
        lines.push(`${res.index},${res.objectiveValue},${res.isValid},${paramValues}`);
      }
    } else {
      // WalkForwardResult
      lines.push("Window,TrainStart,TrainEnd,TestStart,TestEnd,InSample,OutOfSample,Degradation%");

      for (const window of result.windows) {
        const inSample = window.optimizationResult?.objectiveValue ?? 0;
        const outOfSample = window.testObjectiveValue ?? 0;
        const degradation = ((outOfSample - inSample) / inSample) * 100;

        lines.push(
          `${window.index},${window.trainStart.toISOString()},${window.trainEnd.toISOString()},${window.testStart.toISOString()},${window.testEnd.toISOString()},${inSample},${outOfSample},${degradation}`
        );
      }
    }

    return lines.join("\n");
  }
}
