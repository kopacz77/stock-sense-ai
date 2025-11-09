/**
 * Real Correlation Matrix Calculator
 * Calculates actual correlations from historical returns (not sector approximations)
 * Uses Pearson correlation coefficient
 * Supports rolling correlations and clustering analysis
 */

import type { Position } from "../../types/trading.js";
import type {
  CorrelationMatrix,
  CorrelationAnalysis,
  CorrelationCluster,
} from "../types/risk-types.js";

export class CorrelationMatrixCalculator {
  private cachedMatrix: CorrelationMatrix | null = null;
  private cacheTimestamp: Date | null = null;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Calculate correlation matrix from historical returns
   * Pearson correlation coefficient between each pair of assets
   * Rolling correlation (30d, 90d windows)
   * Update daily with new data
   */
  async calculateCorrelationMatrix(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    lookbackPeriod: number = 90
  ): Promise<CorrelationMatrix> {
    // Check cache
    if (this.isCacheValid()) {
      return this.cachedMatrix!;
    }

    const matrix = new Map<string, Map<string, number>>();
    const symbols = positions.map((p) => p.symbol);
    let totalCorrelation = 0;
    let pairCount = 0;
    const highlyCorrelated: Array<{ symbol1: string; symbol2: string; correlation: number }> =
      [];

    // Calculate correlation for each pair
    for (let i = 0; i < symbols.length; i++) {
      const symbol1 = symbols[i];
      const returns1 = historicalReturns.get(symbol1)?.slice(-lookbackPeriod);

      if (!returns1 || returns1.length === 0) continue;

      if (!matrix.has(symbol1)) {
        matrix.set(symbol1, new Map());
      }

      for (let j = 0; j < symbols.length; j++) {
        const symbol2 = symbols[j];
        const returns2 = historicalReturns.get(symbol2)?.slice(-lookbackPeriod);

        if (!returns2 || returns2.length === 0) continue;

        const correlation = this.calculatePearsonCorrelation(returns1, returns2);
        matrix.get(symbol1)!.set(symbol2, correlation);

        if (i < j) {
          // Only count each pair once
          totalCorrelation += correlation;
          pairCount++;

          // Track highly correlated pairs (correlation > 0.7)
          if (correlation > 0.7 && i !== j) {
            highlyCorrelated.push({ symbol1, symbol2, correlation });
          }
        }
      }
    }

    const result: CorrelationMatrix = {
      matrix,
      lastUpdated: new Date(),
      dataPoints: lookbackPeriod,
      avgCorrelation: pairCount > 0 ? totalCorrelation / pairCount : 0,
      highlyCorrelated: highlyCorrelated.sort((a, b) => b.correlation - a.correlation),
    };

    // Update cache
    this.cachedMatrix = result;
    this.cacheTimestamp = new Date();

    return result;
  }

  /**
   * Calculate full correlation analysis including diversification metrics
   */
  async analyzeCorrelations(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    lookbackPeriod: number = 90
  ): Promise<CorrelationAnalysis> {
    const matrix = await this.calculateCorrelationMatrix(positions, historicalReturns, lookbackPeriod);

    // Calculate portfolio-level correlation
    const portfolioCorrelation = this.calculatePortfolioCorrelation(positions, matrix);

    // Calculate diversification ratio
    const diversificationRatio = this.calculateDiversificationRatio(
      positions,
      historicalReturns,
      matrix
    );

    // Perform cluster analysis
    const clusterAnalysis = this.performClusterAnalysis(positions, matrix);

    return {
      matrix,
      portfolioCorrelation,
      diversificationRatio,
      clusterAnalysis,
    };
  }

  /**
   * Calculate rolling correlation for a specific window
   * Useful for tracking correlation changes over time
   */
  async calculateRollingCorrelation(
    symbol1: string,
    symbol2: string,
    historicalReturns: Map<string, number[]>,
    window: number = 30
  ): Promise<number[]> {
    const returns1 = historicalReturns.get(symbol1);
    const returns2 = historicalReturns.get(symbol2);

    if (!returns1 || !returns2) {
      return [];
    }

    const rollingCorrelations: number[] = [];
    const minLength = Math.min(returns1.length, returns2.length);

    for (let i = window; i <= minLength; i++) {
      const window1 = returns1.slice(i - window, i);
      const window2 = returns2.slice(i - window, i);
      const correlation = this.calculatePearsonCorrelation(window1, window2);
      rollingCorrelations.push(correlation);
    }

    return rollingCorrelations;
  }

  /**
   * Detect high correlation clusters
   * Groups assets with average correlation > threshold
   */
  private performClusterAnalysis(
    positions: Position[],
    matrix: CorrelationMatrix
  ): CorrelationCluster[] {
    const clusters: CorrelationCluster[] = [];
    const assigned = new Set<string>();
    const correlationThreshold = 0.7;

    for (const position of positions) {
      if (assigned.has(position.symbol)) continue;

      const cluster: string[] = [position.symbol];
      assigned.add(position.symbol);

      // Find correlated assets
      for (const other of positions) {
        if (assigned.has(other.symbol)) continue;

        const correlation = matrix.matrix.get(position.symbol)?.get(other.symbol) || 0;

        if (correlation > correlationThreshold) {
          cluster.push(other.symbol);
          assigned.add(other.symbol);
        }
      }

      if (cluster.length > 1) {
        // Calculate average correlation within cluster
        let totalCorr = 0;
        let count = 0;

        for (let i = 0; i < cluster.length; i++) {
          for (let j = i + 1; j < cluster.length; j++) {
            const corr = matrix.matrix.get(cluster[i])?.get(cluster[j]) || 0;
            totalCorr += corr;
            count++;
          }
        }

        const avgCorrelation = count > 0 ? totalCorr / count : 0;

        // Calculate risk contribution (simplified)
        const clusterPositions = positions.filter((p) => cluster.includes(p.symbol));
        const riskContribution =
          clusterPositions.reduce((sum, p) => sum + p.value, 0) /
          positions.reduce((sum, p) => sum + p.value, 0);

        clusters.push({
          symbols: cluster,
          avgCorrelation,
          riskContribution,
        });
      }
    }

    return clusters.sort((a, b) => b.riskContribution - a.riskContribution);
  }

  /**
   * Calculate average correlation of entire portfolio
   */
  private calculatePortfolioCorrelation(
    positions: Position[],
    matrix: CorrelationMatrix
  ): number {
    let totalCorrelation = 0;
    let pairCount = 0;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const symbol1 = positions[i].symbol;
        const symbol2 = positions[j].symbol;
        const correlation = matrix.matrix.get(symbol1)?.get(symbol2) || 0;
        totalCorrelation += correlation;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalCorrelation / pairCount : 0;
  }

  /**
   * Calculate diversification ratio
   * DR = (Σ w_i × σ_i) / σ_portfolio
   * Higher DR = better diversification
   */
  private calculateDiversificationRatio(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    matrix: CorrelationMatrix
  ): number {
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Calculate weighted sum of individual volatilities
    let weightedVolSum = 0;

    for (const position of positions) {
      const returns = historicalReturns.get(position.symbol);
      if (!returns) continue;

      const weight = position.value / totalValue;
      const volatility = this.calculateVolatility(returns);
      weightedVolSum += weight * volatility;
    }

    // Calculate portfolio volatility (accounting for correlations)
    const portfolioVolatility = this.calculatePortfolioVolatility(
      positions,
      historicalReturns,
      matrix
    );

    return portfolioVolatility > 0 ? weightedVolSum / portfolioVolatility : 1.0;
  }

  /**
   * Calculate portfolio volatility considering correlations
   * σ_p = √(Σ_i Σ_j w_i w_j σ_i σ_j ρ_ij)
   */
  private calculatePortfolioVolatility(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    matrix: CorrelationMatrix
  ): number {
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    let variance = 0;

    for (let i = 0; i < positions.length; i++) {
      const pos1 = positions[i];
      const returns1 = historicalReturns.get(pos1.symbol);
      if (!returns1) continue;

      const weight1 = pos1.value / totalValue;
      const vol1 = this.calculateVolatility(returns1);

      for (let j = 0; j < positions.length; j++) {
        const pos2 = positions[j];
        const returns2 = historicalReturns.get(pos2.symbol);
        if (!returns2) continue;

        const weight2 = pos2.value / totalValue;
        const vol2 = this.calculateVolatility(returns2);
        const correlation = matrix.matrix.get(pos1.symbol)?.get(pos2.symbol) || 0;

        variance += weight1 * weight2 * vol1 * vol2 * correlation;
      }
    }

    return Math.sqrt(variance);
  }

  /**
   * Calculate volatility (standard deviation) of returns
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate Pearson correlation coefficient
   * ρ = Cov(X,Y) / (σ_X × σ_Y)
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
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cachedMatrix || !this.cacheTimestamp) {
      return false;
    }

    const now = new Date();
    const age = now.getTime() - this.cacheTimestamp.getTime();
    return age < this.cacheTTL;
  }

  /**
   * Invalidate cache (call when portfolio changes)
   */
  invalidateCache(): void {
    this.cachedMatrix = null;
    this.cacheTimestamp = null;
  }

  /**
   * Generate correlation heatmap data for visualization
   */
  generateHeatmapData(matrix: CorrelationMatrix): {
    symbols: string[];
    correlations: number[][];
  } {
    const symbols = Array.from(matrix.matrix.keys());
    const correlations: number[][] = [];

    for (const symbol1 of symbols) {
      const row: number[] = [];
      for (const symbol2 of symbols) {
        const correlation = matrix.matrix.get(symbol1)?.get(symbol2) || 0;
        row.push(Number(correlation.toFixed(3)));
      }
      correlations.push(row);
    }

    return { symbols, correlations };
  }
}
