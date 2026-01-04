/**
 * Value at Risk (VaR) Calculator
 * Supports Historical, Parametric, and Monte Carlo methods
 *
 * Statistical Notes:
 * - Uses ONE-TAILED z-scores (1.645 for 95%, 2.326 for 99%) because VaR measures
 *   directional loss risk (left tail only), not two-tailed confidence intervals
 * - Uses Bessel's correction (n-1 denominator) for unbiased sample variance
 * - Monte Carlo uses Cholesky decomposition for proper correlation modeling
 */

import type { Position } from "../../types/trading.js";
import type { VaRResult, VaRCalculationOptions, VaRMethod } from "../types/risk-types.js";

// One-tailed z-scores for VaR (left tail only - measuring loss probability)
// These are the correct values for VaR as we only care about downside risk
const Z_SCORE_95 = 1.645; // P(Z < -1.645) = 0.05 (5% left tail)
const Z_SCORE_99 = 2.326; // P(Z < -2.326) = 0.01 (1% left tail)

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

    const varReturn95 = sortedReturns[index95] ?? 0;
    const varReturn99 = sortedReturns[index99] ?? 0;

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

    // Calculate mean and standard deviation with Bessel's correction (n-1)
    // Bessel's correction provides unbiased estimate of population variance from sample
    const n = portfolioReturns.length;
    const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
    const variance =
      portfolioReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (n - 1); // Bessel's correction: divide by (n-1) not n
    const stdDev = Math.sqrt(variance);

    // VaR = Portfolio Value × (z-score × σ - mean)
    // Using one-tailed z-scores because VaR measures left-tail loss probability only
    // The mean is subtracted to account for expected return (conservative approach)
    const oneDayVaR95 = Math.abs(portfolioValue * (Z_SCORE_95 * stdDev - mean));
    const oneDayVaR99 = Math.abs(portfolioValue * (Z_SCORE_99 * stdDev - mean));

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
   * Monte Carlo VaR: Simulation-based with Cholesky decomposition
   * - Generate 10,000+ scenarios
   * - Uses Cholesky decomposition for proper correlation modeling
   * - More accurate for non-normal distributions and correlated assets
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
    const symbols = positions.map(p => p.symbol).filter(s => assetStats.has(s));
    const n = symbols.length;

    if (n === 0) {
      throw new Error("No valid asset statistics for Monte Carlo simulation");
    }

    // Build correlation matrix as 2D array for Cholesky decomposition
    const correlationMatrix = this.buildCorrelationMatrix(symbols, historicalReturns);

    // Perform Cholesky decomposition: Σ = L × L^T
    // This allows us to generate correlated random variables from independent ones
    const choleskyL = this.choleskyDecomposition(correlationMatrix);

    // Get means and standard deviations as arrays
    const means = symbols.map(s => assetStats.get(s)?.mean ?? 0);
    const stdDevs = symbols.map(s => assetStats.get(s)?.stdDev ?? 0);
    const weights = symbols.map(s => {
      const pos = positions.find(p => p.symbol === s);
      return pos ? pos.value / portfolioValue : 0;
    });

    // Run Monte Carlo simulations with correlated returns
    const simulatedReturns: number[] = [];

    for (let sim = 0; sim < numSimulations; sim++) {
      // Generate n independent standard normal random variables
      const z: number[] = [];
      for (let i = 0; i < n; i++) {
        z.push(this.generateStandardNormalRandom());
      }

      // Transform to correlated random variables using Cholesky: Y = L × Z
      const correlatedZ = this.multiplyMatrixVector(choleskyL, z);

      // Calculate portfolio return with correlated asset returns
      let portfolioReturn = 0;
      for (let i = 0; i < n; i++) {
        // Transform standard normal to asset return: r = μ + σ × correlated_z
        const assetReturn = (means[i] ?? 0) + (stdDevs[i] ?? 0) * (correlatedZ[i] ?? 0);
        portfolioReturn += (weights[i] ?? 0) * assetReturn;
      }

      simulatedReturns.push(portfolioReturn);
    }

    // Sort returns and find VaR at percentiles
    const sortedReturns = simulatedReturns.sort((a, b) => a - b);

    const index95 = Math.floor((1 - 0.95) * sortedReturns.length);
    const index99 = Math.floor((1 - 0.99) * sortedReturns.length);

    const oneDayVaR95 = Math.abs(portfolioValue * (sortedReturns[index95] ?? 0));
    const oneDayVaR99 = Math.abs(portfolioValue * (sortedReturns[index99] ?? 0));

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
   * Build correlation matrix as 2D array from historical returns
   */
  private buildCorrelationMatrix(
    symbols: string[],
    historicalReturns: Map<string, number[]>
  ): number[][] {
    const n = symbols.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      const symbolI = symbols[i];
      const returns1 = symbolI ? historicalReturns.get(symbolI) ?? [] : [];

      for (let j = 0; j < n; j++) {
        const row = matrix[i];
        if (!row) continue;

        if (i === j) {
          row[j] = 1.0; // Diagonal is always 1
        } else {
          const symbolJ = symbols[j];
          const returns2 = symbolJ ? historicalReturns.get(symbolJ) ?? [] : [];
          row[j] = this.calculatePearsonCorrelation(returns1, returns2);
        }
      }
    }

    return matrix;
  }

  /**
   * Cholesky decomposition: decompose positive-definite matrix Σ into L × L^T
   * where L is a lower triangular matrix.
   *
   * This is essential for generating correlated random variables:
   * If Z is a vector of independent standard normals, then Y = L × Z
   * has covariance matrix Σ.
   *
   * Uses Cholesky-Banachiewicz algorithm.
   */
  private choleskyDecomposition(matrix: number[][]): number[][] {
    const n = matrix.length;
    const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0) as number[]);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        const rowI = L[i];
        const rowJ = L[j];
        const matrixRowI = matrix[i];
        const matrixRowJ = matrix[j];

        if (!rowI || !rowJ || !matrixRowI || !matrixRowJ) continue;

        if (j === i) {
          // Diagonal elements
          for (let k = 0; k < j; k++) {
            const Ljk = rowJ[k] ?? 0;
            sum += Ljk * Ljk;
          }
          const diagonalValue = (matrixRowJ[j] ?? 0) - sum;

          // Handle numerical instability - if slightly negative due to floating point, clamp to small positive
          if (diagonalValue < 0) {
            if (diagonalValue > -1e-10) {
              rowJ[j] = 1e-10; // Small positive value
            } else {
              // Matrix is not positive definite - fall back to identity-like behavior
              console.warn(`Cholesky decomposition: matrix not positive definite at index ${j}`);
              rowJ[j] = 1e-6;
            }
          } else {
            rowJ[j] = Math.sqrt(diagonalValue);
          }
        } else {
          // Off-diagonal elements
          for (let k = 0; k < j; k++) {
            sum += (rowI[k] ?? 0) * (rowJ[k] ?? 0);
          }
          const divisor = rowJ[j] ?? 0;
          rowI[j] = divisor > 1e-10 ? ((matrixRowI[j] ?? 0) - sum) / divisor : 0;
        }
      }
    }

    return L;
  }

  /**
   * Multiply matrix by vector: result = M × v
   */
  private multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
    const n = matrix.length;
    const result: number[] = [];

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        sum += (matrix[i]?.[j] ?? 0) * (vector[j] ?? 0);
      }
      result.push(sum);
    }

    return result;
  }

  /**
   * Generate standard normal random number (mean=0, stdDev=1) using Box-Muller
   */
  private generateStandardNormalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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
          dayReturn += weight * (returns[day] ?? 0);
        }
      }

      portfolioReturns.push(dayReturn);
    }

    return portfolioReturns;
  }

  /**
   * Calculate mean and standard deviation for each asset
   * Uses Bessel's correction (n-1) for unbiased sample variance
   */
  private calculateAssetStatistics(
    historicalReturns: Map<string, number[]>
  ): Map<string, { mean: number; stdDev: number }> {
    const stats = new Map<string, { mean: number; stdDev: number }>();

    for (const [symbol, returns] of historicalReturns.entries()) {
      if (returns.length < 2) continue; // Need at least 2 samples for Bessel's correction

      const n = returns.length;
      const mean = returns.reduce((sum, r) => sum + r, 0) / n;
      const variance =
        returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1); // Bessel's correction
      const stdDev = Math.sqrt(variance);

      stats.set(symbol, { mean, stdDev });
    }

    return stats;
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
      const xi = x[i] ?? 0;
      const yi = y[i] ?? 0;
      const dx = xi - meanX;
      const dy = yi - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
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
