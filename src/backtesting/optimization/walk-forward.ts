/**
 * Walk-Forward Analysis
 * CRITICAL for preventing overfitting!
 *
 * Algorithm:
 * 1. Split data into rolling windows (train + test periods)
 * 2. For each window:
 *    a. Optimize parameters using ONLY training data
 *    b. Test optimized parameters on out-of-sample test data
 * 3. Aggregate out-of-sample results
 * 4. Compare in-sample vs out-of-sample performance
 *
 * Example: 6-month train, 3-month test, roll forward monthly
 * - Window 1: Train on Jan-Jun, test on Jul-Sep
 * - Window 2: Train on Feb-Jul, test on Aug-Oct
 * - Window 3: Train on Mar-Aug, test on Sep-Nov
 * etc.
 *
 * Key Principle: Test data is NEVER used during optimization!
 * This ensures we detect if parameters are overfit to historical data.
 */

import type {
  WalkForwardConfig,
  WalkForwardWindow,
  WalkForwardResult,
  OptimizationConfig,
  OverfittingAnalysis,
  OptimizationResult,
} from "./types.js";
import type { BacktestConfig, DataProvider, BacktestStrategy, PerformanceMetrics } from "../types/backtest-types.js";
import { GridSearchOptimizer } from "./grid-search.js";
import { RandomSearchOptimizer } from "./random-search.js";
import { BacktestEngine } from "../engine/backtest-engine.js";

export class WalkForwardAnalyzer {
  private config: WalkForwardConfig;
  private optimizationConfig: OptimizationConfig;
  private dataProvider: DataProvider;
  private strategyFactory: (params: Record<string, unknown>) => BacktestStrategy;

  constructor(
    config: WalkForwardConfig,
    optimizationConfig: OptimizationConfig,
    dataProvider: DataProvider,
    strategyFactory: (params: Record<string, unknown>) => BacktestStrategy
  ) {
    this.config = config;
    this.optimizationConfig = optimizationConfig;
    this.dataProvider = dataProvider;
    this.strategyFactory = strategyFactory;
  }

  /**
   * Run walk-forward analysis
   */
  async analyze(): Promise<WalkForwardResult> {
    const startTime = Date.now();

    console.log(`\n========================================`);
    console.log(`Walk-Forward Analysis`);
    console.log(`========================================`);
    console.log(`Configuration:`);
    console.log(`- Training window: ${this.config.trainMonths} months`);
    console.log(`- Testing window: ${this.config.testMonths} months`);
    console.log(`- Step size: ${this.config.stepMonths} months`);
    console.log(`- Window type: ${this.config.windowType}`);

    // Generate windows
    const windows = this.generateWindows();
    console.log(`\nGenerated ${windows.length} windows`);

    // Process each window
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i]!;
      console.log(`\n--- Window ${i + 1}/${windows.length} ---`);
      console.log(`Train: ${window.trainStart.toISOString().split("T")[0]} to ${window.trainEnd.toISOString().split("T")[0]}`);
      console.log(`Test: ${window.testStart.toISOString().split("T")[0]} to ${window.testEnd.toISOString().split("T")[0]}`);

      // Optimize on training data
      console.log(`\nOptimizing on training data...`);
      const optimizationResult = await this.optimizeWindow(window);
      window.optimizationResult = optimizationResult;

      // Test on out-of-sample data
      console.log(`\nTesting on out-of-sample data...`);
      const testResult = await this.testWindow(window, optimizationResult);
      window.testResult = testResult;

      // Calculate test objective
      const testObjective = this.calculateObjective(testResult.metrics);
      window.testObjectiveValue = testObjective;

      console.log(`\nWindow ${i + 1} Results:`);
      console.log(`- In-Sample ${this.optimizationConfig.objective}: ${optimizationResult.objectiveValue.toFixed(4)}`);
      console.log(`- Out-of-Sample ${this.optimizationConfig.objective}: ${testObjective.toFixed(4)}`);
      console.log(`- Degradation: ${(((testObjective - optimizationResult.objectiveValue) / optimizationResult.objectiveValue) * 100).toFixed(2)}%`);
    }

    // Aggregate out-of-sample results
    console.log(`\n\nAggregating out-of-sample results...`);
    const aggregatedMetrics = this.aggregateMetrics(windows);

    // Perform overfitting analysis
    const overfittingAnalysis = this.analyzeOverfitting(windows);

    const totalExecutionTimeMs = Date.now() - startTime;

    console.log(`\n========================================`);
    console.log(`Walk-Forward Analysis Complete`);
    console.log(`========================================`);
    console.log(`Total execution time: ${(totalExecutionTimeMs / 1000 / 60).toFixed(2)} minutes`);
    console.log(`\nOverfitting Analysis:`);
    console.log(`- Severity: ${overfittingAnalysis.severity.toUpperCase()}`);
    console.log(`- Degradation: ${overfittingAnalysis.degradationPercent.toFixed(2)}%`);
    console.log(`- Consistency Score: ${overfittingAnalysis.consistencyScore.toFixed(2)}/100`);

    return {
      config: this.config,
      optimizationConfig: this.optimizationConfig,
      windows,
      aggregatedMetrics,
      overfittingAnalysis,
      totalExecutionTimeMs,
    };
  }

  /**
   * Generate walk-forward windows
   */
  private generateWindows(): WalkForwardWindow[] {
    const windows: WalkForwardWindow[] = [];
    const startDate = this.optimizationConfig.backtestConfig.startDate;
    const endDate = this.optimizationConfig.backtestConfig.endDate;

    let currentStart = new Date(startDate);
    let index = 0;

    while (true) {
      // Calculate train window
      const trainStart =
        this.config.windowType === "anchored" ? new Date(startDate) : new Date(currentStart);
      const trainEnd = this.addMonths(currentStart, this.config.trainMonths);

      // Calculate test window
      const testStart = new Date(trainEnd);
      const testEnd = this.addMonths(testStart, this.config.testMonths);

      // Check if we have enough data
      if (testEnd > endDate) {
        break;
      }

      windows.push({
        index,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
      });

      // Move to next window
      currentStart = this.addMonths(currentStart, this.config.stepMonths);
      index++;
    }

    // Check minimum windows requirement
    const minWindows = this.config.minWindows ?? 3;
    if (windows.length < minWindows) {
      console.warn(
        `Warning: Only ${windows.length} windows generated. Minimum recommended: ${minWindows}`
      );
    }

    return windows;
  }

  /**
   * Optimize parameters for a window
   */
  private async optimizeWindow(window: WalkForwardWindow): Promise<OptimizationResult> {
    // Create optimization config for this window's training period
    const windowOptConfig: OptimizationConfig = {
      ...this.optimizationConfig,
      backtestConfig: {
        ...this.optimizationConfig.backtestConfig,
        startDate: window.trainStart,
        endDate: window.trainEnd,
      },
    };

    // Run optimization
    let optimizer;
    if (this.optimizationConfig.method === "grid") {
      optimizer = new GridSearchOptimizer(
        windowOptConfig,
        this.dataProvider,
        this.strategyFactory
      );
    } else if (this.optimizationConfig.method === "random") {
      optimizer = new RandomSearchOptimizer(
        windowOptConfig,
        this.dataProvider,
        this.strategyFactory
      );
    } else {
      throw new Error(`Optimization method ${this.optimizationConfig.method} not supported`);
    }

    const result = await optimizer.optimize();
    return result.bestResult;
  }

  /**
   * Test optimized parameters on out-of-sample data
   */
  private async testWindow(
    window: WalkForwardWindow,
    optimizationResult: OptimizationResult
  ): Promise<any> {
    // Create backtest config for test period with optimized parameters
    const testConfig: BacktestConfig = {
      ...this.optimizationConfig.backtestConfig,
      startDate: window.testStart,
      endDate: window.testEnd,
      strategy: {
        name: this.optimizationConfig.backtestConfig.strategy.name,
        parameters: optimizationResult.parameters.parameters,
      },
    };

    // Create strategy with optimized parameters
    const strategy = this.strategyFactory(optimizationResult.parameters.parameters);

    // Run backtest on test period
    const engine = new BacktestEngine(testConfig, strategy, this.dataProvider);
    const result = await engine.run();

    return result;
  }

  /**
   * Aggregate metrics from all out-of-sample windows
   */
  private aggregateMetrics(windows: WalkForwardWindow[]): PerformanceMetrics {
    // Combine all trades from test periods
    const allTrades = windows.flatMap((w) => w.testResult?.trades ?? []);

    // Combine equity curves
    const allEquityPoints = windows.flatMap((w) => w.testResult?.equityCurve ?? []);

    // Calculate aggregated metrics
    // This is a simplified version - in production, you'd properly combine equity curves
    const totalReturn = windows.reduce(
      (sum, w) => sum + (w.testResult?.metrics.totalReturn ?? 0),
      0
    ) / windows.length;

    const avgSharpe = windows.reduce(
      (sum, w) => sum + (w.testResult?.metrics.sharpeRatio ?? 0),
      0
    ) / windows.length;

    const avgSortino = windows.reduce(
      (sum, w) => sum + (w.testResult?.metrics.sortinoRatio ?? 0),
      0
    ) / windows.length;

    const avgWinRate = windows.reduce(
      (sum, w) => sum + (w.testResult?.metrics.winRate ?? 0),
      0
    ) / windows.length;

    const totalTrades = allTrades.length;

    // Return aggregated metrics
    return {
      totalReturn,
      totalReturnDollar: 0,
      cagr: 0,
      volatility: 0,
      sharpeRatio: avgSharpe,
      sortinoRatio: avgSortino,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      totalTrades,
      winningTrades: allTrades.filter((t) => (t as any).netPnL > 0).length,
      losingTrades: allTrades.filter((t) => (t as any).netPnL <= 0).length,
      winRate: avgWinRate,
      avgWin: 0,
      avgLoss: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      payoffRatio: 0,
      expectancy: 0,
      expectancyPercent: 0,
      avgHoldingPeriod: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      startDate: windows[0]!.testStart,
      endDate: windows[windows.length - 1]!.testEnd,
      tradingDays: 0,
      totalCommissions: 0,
      totalSlippage: 0,
      totalCosts: 0,
    };
  }

  /**
   * Analyze overfitting by comparing in-sample vs out-of-sample performance
   */
  private analyzeOverfitting(windows: WalkForwardWindow[]): OverfittingAnalysis {
    const inSampleValues = windows
      .map((w) => w.optimizationResult?.objectiveValue)
      .filter((v): v is number => v !== undefined);

    const outOfSampleValues = windows
      .map((w) => w.testObjectiveValue)
      .filter((v): v is number => v !== undefined);

    if (inSampleValues.length === 0 || outOfSampleValues.length === 0) {
      return this.getEmptyOverfittingAnalysis();
    }

    // Calculate averages
    const avgInSample =
      inSampleValues.reduce((sum, val) => sum + val, 0) / inSampleValues.length;
    const avgOutOfSample =
      outOfSampleValues.reduce((sum, val) => sum + val, 0) / outOfSampleValues.length;

    // Calculate degradation percentage
    const degradationPercent = ((avgOutOfSample - avgInSample) / avgInSample) * 100;

    // Count windows where out-of-sample beat in-sample
    let outperformingWindows = 0;
    for (let i = 0; i < windows.length; i++) {
      const inSample = windows[i]!.optimizationResult?.objectiveValue ?? 0;
      const outOfSample = windows[i]!.testObjectiveValue ?? 0;
      if (
        this.optimizationConfig.direction === "maximize"
          ? outOfSample >= inSample
          : outOfSample <= inSample
      ) {
        outperformingWindows++;
      }
    }

    // Calculate consistency score (0-100)
    // Based on standard deviation of out-of-sample results
    const outOfSampleStdDev = this.calculateStdDev(outOfSampleValues);
    const coefficientOfVariation = Math.abs(outOfSampleStdDev / avgOutOfSample);
    const consistencyScore = Math.max(0, Math.min(100, 100 - coefficientOfVariation * 100));

    // Determine overfitting severity
    let severity: "none" | "low" | "moderate" | "high" | "severe";
    let isOverfitted = false;

    const absDegradation = Math.abs(degradationPercent);
    if (absDegradation < 5) {
      severity = "none";
    } else if (absDegradation < 15) {
      severity = "low";
      isOverfitted = true;
    } else if (absDegradation < 30) {
      severity = "moderate";
      isOverfitted = true;
    } else if (absDegradation < 50) {
      severity = "high";
      isOverfitted = true;
    } else {
      severity = "severe";
      isOverfitted = true;
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (isOverfitted) {
      recommendations.push("Parameters appear to be overfit to historical data");
      recommendations.push("Consider widening parameter ranges");
      recommendations.push("Use longer training windows");
      recommendations.push("Simplify strategy (reduce number of parameters)");
    }
    if (consistencyScore < 50) {
      recommendations.push("Strategy performance is inconsistent across different periods");
      recommendations.push("Consider market regime filtering");
    }
    if (outperformingWindows / windows.length < 0.4) {
      recommendations.push(
        "Strategy frequently underperforms out-of-sample - high overfitting risk"
      );
    }
    if (!isOverfitted) {
      recommendations.push("Strategy shows good generalization to out-of-sample data");
      recommendations.push("Parameters appear robust");
    }

    return {
      avgInSampleObjective: avgInSample,
      avgOutOfSampleObjective: avgOutOfSample,
      degradationPercent,
      consistencyScore,
      outperformingWindows,
      totalWindows: windows.length,
      isOverfitted,
      severity,
      recommendations,
    };
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate objective value from metrics
   */
  private calculateObjective(metrics: PerformanceMetrics): number {
    if (this.optimizationConfig.objective === "custom" && this.optimizationConfig.customObjective) {
      return this.optimizationConfig.customObjective(metrics);
    }

    const metricMap: Record<string, keyof PerformanceMetrics> = {
      sharpeRatio: "sharpeRatio",
      sortinoRatio: "sortinoRatio",
      calmarRatio: "calmarRatio",
      totalReturn: "totalReturn",
      cagr: "cagr",
      profitFactor: "profitFactor",
      winRate: "winRate",
      expectancy: "expectancy",
    };

    const metricKey = metricMap[this.optimizationConfig.objective];
    if (!metricKey) {
      throw new Error(`Unknown objective: ${this.optimizationConfig.objective}`);
    }

    return Number(metrics[metricKey]) || 0;
  }

  /**
   * Get empty overfitting analysis
   */
  private getEmptyOverfittingAnalysis(): OverfittingAnalysis {
    return {
      avgInSampleObjective: 0,
      avgOutOfSampleObjective: 0,
      degradationPercent: 0,
      consistencyScore: 0,
      outperformingWindows: 0,
      totalWindows: 0,
      isOverfitted: false,
      severity: "none",
      recommendations: [],
    };
  }

  /**
   * Add months to a date
   */
  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
