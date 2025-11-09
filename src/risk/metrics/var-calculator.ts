/**
 * Value at Risk (VaR) Calculator
 * Supports Historical, Parametric, and Monte Carlo methods
 */

import type { Position } from "../../types/trading.js";
import type { VaRResult, VaRCalculationOptions, VaRMethod } from "../types/risk-types.js";

export class VaRCalculator {
  /**
   * Calculate Value at Risk using specified method
   */
  async calculateVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    options: VaRCalculationOptions
  ): Promise<VaRResult> {
    const startTime = Date.now();

    switch (options.method) {
      case "historical":
        return this.calculateHistoricalVaR(positions, historicalReturns, options);
      case "parametric":
        return this.calculateParametricVaR(positions, historicalReturns, options);
      case "monte-carlo":
        return this.calculateMonteCarloVaR(positions, historicalReturns, options);
      default:
        throw new Error(`Unknown VaR method: ${options.method}`);
    }
  }

  /**
   * Historical VaR: Based on actual historical returns
   * - Sort returns, take percentile
   * - Confidence levels: 95%, 99%
   * - Lookback periods: 30d, 90d, 252d
   */
  private async calculateHistoricalVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    options: VaRCalculationOptions
  ): Promise<VaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Calculate portfolio returns for each day
    const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);

    if (portfolioReturns.length === 0) {
      throw new Error("Insufficient historical data for VaR calculation");
    }

    // Sort returns from worst to best
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);

    // Calculate VaR at different confidence levels
    const index95 = Math.floor((1 - 0.95) * sortedReturns.length);
    const index99 = Math.floor((1 - 0.99) * sortedReturns.length);

    const varReturn95 = sortedReturns[index95];
    const varReturn99 = sortedReturns[index99];

    // VaR is the absolute value of the loss at the percentile
    const oneDayVaR95 = Math.abs(portfolioValue * varReturn95);
    const oneDayVaR99 = Math.abs(portfolioValue * varReturn99);

    // Scale VaR for different time horizons using square root of time rule
    const tenDayVaR95 = oneDayVaR95 * Math.sqrt(10);
    const tenDayVaR99 = oneDayVaR99 * Math.sqrt(10);

    const interpretation = this.generateInterpretation(oneDayVaR95, portfolioValue, 0.95);

    return {
      oneDayVaR95: Number(oneDayVaR95.toFixed(2)),
      oneDayVaR99: Number(oneDayVaR99.toFixed(2)),
      tenDayVaR95: Number(tenDayVaR95.toFixed(2)),
      tenDayVaR99: Number(tenDayVaR99.toFixed(2)),
      method: "historical" as VaRMethod,
      calculationDate: new Date(),
      portfolioValue: Number(portfolioValue.toFixed(2)),
      interpretation,
    };
  }

  /**
   * Parametric VaR: Assumes normal distribution
   * - Calculate mean and std dev
   * - Use z-score formula
   */
  private async calculateParametricVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    options: VaRCalculationOptions
  ): Promise<VaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Calculate portfolio returns
    const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);

    if (portfolioReturns.length === 0) {
      throw new Error("Insufficient historical data for VaR calculation");
    }

    // Calculate mean and standard deviation
    const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const variance =
      portfolioReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      portfolioReturns.length;
    const stdDev = Math.sqrt(variance);

    // Z-scores for different confidence levels
    // 95% confidence: 1.645 (one-tailed)
    // 99% confidence: 2.326 (one-tailed)
    const zScore95 = 1.645;
    const zScore99 = 2.326;

    // VaR = Portfolio Value × (mean - z-score × σ)
    // We use absolute value and subtract mean if it's positive (conservative)
    const oneDayVaR95 = Math.abs(portfolioValue * (zScore95 * stdDev - mean));
    const oneDayVaR99 = Math.abs(portfolioValue * (zScore99 * stdDev - mean));

    // Scale for 10-day horizon using sqrt(T) rule
    const tenDayVaR95 = oneDayVaR95 * Math.sqrt(10);
    const tenDayVaR99 = oneDayVaR99 * Math.sqrt(10);

    const interpretation = this.generateInterpretation(oneDayVaR95, portfolioValue, 0.95);

    return {
      oneDayVaR95: Number(oneDayVaR95.toFixed(2)),
      oneDayVaR99: Number(oneDayVaR99.toFixed(2)),
      tenDayVaR95: Number(tenDayVaR95.toFixed(2)),
      tenDayVaR99: Number(tenDayVaR99.toFixed(2)),
      method: "parametric" as VaRMethod,
      calculationDate: new Date(),
      portfolioValue: Number(portfolioValue.toFixed(2)),
      interpretation,
    };
  }

  /**
   * Monte Carlo VaR: Simulation-based
   * - Generate 10,000+ scenarios
   * - Account for correlations
   * - More accurate for non-normal distributions
   * Target: <500ms for 10-position portfolio
   */
  private async calculateMonteCarloVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    options: VaRCalculationOptions
  ): Promise<VaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const numSimulations = 10000;

    // Calculate statistics for each asset
    const assetStats = this.calculateAssetStatistics(historicalReturns);

    // Calculate correlation matrix
    const correlationMatrix = this.calculateSimpleCorrelationMatrix(positions, historicalReturns);

    // Run Monte Carlo simulations
    const simulatedReturns: number[] = [];

    for (let sim = 0; sim < numSimulations; sim++) {
      let portfolioReturn = 0;

      for (const position of positions) {
        const stats = assetStats.get(position.symbol);
        if (!stats) continue;

        // Generate random return using normal distribution
        const randomReturn = this.generateNormalRandom(stats.mean, stats.stdDev);
        const weight = position.value / portfolioValue;
        portfolioReturn += weight * randomReturn;
      }

      simulatedReturns.push(portfolioReturn);
    }

    // Sort returns and find VaR at percentiles
    const sortedReturns = simulatedReturns.sort((a, b) => a - b);

    const index95 = Math.floor((1 - 0.95) * sortedReturns.length);
    const index99 = Math.floor((1 - 0.99) * sortedReturns.length);

    const oneDayVaR95 = Math.abs(portfolioValue * sortedReturns[index95]);
    const oneDayVaR99 = Math.abs(portfolioValue * sortedReturns[index99]);

    const tenDayVaR95 = oneDayVaR95 * Math.sqrt(10);
    const tenDayVaR99 = oneDayVaR99 * Math.sqrt(10);

    const interpretation = this.generateInterpretation(oneDayVaR95, portfolioValue, 0.95);

    return {
      oneDayVaR95: Number(oneDayVaR95.toFixed(2)),
      oneDayVaR99: Number(oneDayVaR99.toFixed(2)),
      tenDayVaR95: Number(tenDayVaR95.toFixed(2)),
      tenDayVaR99: Number(tenDayVaR99.toFixed(2)),
      method: "monte-carlo" as VaRMethod,
      calculationDate: new Date(),
      portfolioValue: Number(portfolioValue.toFixed(2)),
      interpretation,
    };
  }

  /**
   * Calculate portfolio returns for each day
   */
  private calculatePortfolioReturns(
    positions: Position[],
    historicalReturns: Map<string, number[]>
  ): number[] {
    const portfolioReturns: number[] = [];
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    if (totalValue === 0) return [];

    // Find minimum length across all assets
    let minLength = Infinity;
    for (const position of positions) {
      const returns = historicalReturns.get(position.symbol);
      if (returns && returns.length < minLength) {
        minLength = returns.length;
      }
    }

    if (minLength === Infinity || minLength === 0) return [];

    // Calculate portfolio return for each day
    for (let day = 0; day < minLength; day++) {
      let dayReturn = 0;

      for (const position of positions) {
        const returns = historicalReturns.get(position.symbol);
        if (returns && returns[day] !== undefined) {
          const weight = position.value / totalValue;
          dayReturn += weight * returns[day];
        }
      }

      portfolioReturns.push(dayReturn);
    }

    return portfolioReturns;
  }

  /**
   * Calculate mean and standard deviation for each asset
   */
  private calculateAssetStatistics(
    historicalReturns: Map<string, number[]>
  ): Map<string, { mean: number; stdDev: number }> {
    const stats = new Map<string, { mean: number; stdDev: number }>();

    for (const [symbol, returns] of historicalReturns.entries()) {
      if (returns.length === 0) continue;

      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance =
        returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      stats.set(symbol, { mean, stdDev });
    }

    return stats;
  }

  /**
   * Calculate simple correlation matrix (for Monte Carlo)
   */
  private calculateSimpleCorrelationMatrix(
    positions: Position[],
    historicalReturns: Map<string, number[]>
  ): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const pos1 of positions) {
      const returns1 = historicalReturns.get(pos1.symbol);
      if (!returns1) continue;

      if (!matrix.has(pos1.symbol)) {
        matrix.set(pos1.symbol, new Map());
      }

      for (const pos2 of positions) {
        const returns2 = historicalReturns.get(pos2.symbol);
        if (!returns2) continue;

        const correlation = this.calculatePearsonCorrelation(returns1, returns2);
        matrix.get(pos1.symbol)!.set(pos2.symbol, correlation);
      }
    }

    return matrix;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Generate random number from normal distribution (Box-Muller transform)
   */
  private generateNormalRandom(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
  }

  /**
   * Generate interpretation text for VaR result
   */
  private generateInterpretation(var95: number, portfolioValue: number, confidence: number): string {
    const varPercent = (var95 / portfolioValue) * 100;
    const confidencePercent = confidence * 100;

    return `There is a ${confidencePercent}% confidence that daily losses will not exceed $${var95.toFixed(2)} (${varPercent.toFixed(2)}% of portfolio value).`;
  }
}
