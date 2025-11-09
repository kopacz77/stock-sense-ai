/**
 * Conditional Value at Risk (CVaR) / Expected Shortfall Calculator
 * Calculates the expected loss beyond VaR threshold
 * More conservative than VaR - measures tail risk
 */

import type { Position } from "../../types/trading.js";
import type { CVaRResult, VaRMethod } from "../types/risk-types.js";
import { VaRCalculator } from "./var-calculator.js";

export class CVaRCalculator {
  private varCalculator: VaRCalculator;

  constructor() {
    this.varCalculator = new VaRCalculator();
  }

  /**
   * Calculate Conditional VaR (Expected Shortfall)
   * CVaR is the expected loss given that loss exceeds VaR threshold
   * All three methods: Historical, Parametric, Monte Carlo
   */
  async calculateCVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number = 0.95,
    method: VaRMethod = "historical"
  ): Promise<CVaRResult> {
    switch (method) {
      case "historical":
        return this.calculateHistoricalCVaR(positions, historicalReturns, confidenceLevel);
      case "parametric":
        return this.calculateParametricCVaR(positions, historicalReturns, confidenceLevel);
      case "monte-carlo":
        return this.calculateMonteCarloCVaR(positions, historicalReturns, confidenceLevel);
      default:
        throw new Error(`Unknown CVaR method: ${method}`);
    }
  }

  /**
   * Historical CVaR: Average of returns worse than VaR threshold
   */
  private async calculateHistoricalCVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number
  ): Promise<CVaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Calculate portfolio returns
    const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);

    if (portfolioReturns.length === 0) {
      throw new Error("Insufficient historical data for CVaR calculation");
    }

    // Sort returns from worst to best
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);

    // Find VaR threshold index
    const varIndex95 = Math.floor((1 - 0.95) * sortedReturns.length);
    const varIndex99 = Math.floor((1 - 0.99) * sortedReturns.length);

    // CVaR is the average of all returns worse than VaR
    const tailReturns95 = sortedReturns.slice(0, varIndex95);
    const tailReturns99 = sortedReturns.slice(0, varIndex99);

    const cvar95Return =
      tailReturns95.length > 0
        ? tailReturns95.reduce((sum, r) => sum + r, 0) / tailReturns95.length
        : sortedReturns[0];

    const cvar99Return =
      tailReturns99.length > 0
        ? tailReturns99.reduce((sum, r) => sum + r, 0) / tailReturns99.length
        : sortedReturns[0];

    const cvar95 = Math.abs(portfolioValue * cvar95Return);
    const cvar99 = Math.abs(portfolioValue * cvar99Return);

    // Calculate VaR for comparison
    const var95 = Math.abs(portfolioValue * sortedReturns[varIndex95]);
    const var99 = Math.abs(portfolioValue * sortedReturns[varIndex99]);

    // Tail risk ratio: CVaR / VaR (higher = fatter tails = more dangerous)
    const tailRiskRatio95 = var95 > 0 ? cvar95 / var95 : 1.0;
    const tailRiskRatio99 = var99 > 0 ? cvar99 / var99 : 1.0;

    // Use average tail risk ratio
    const tailRiskRatio = (tailRiskRatio95 + tailRiskRatio99) / 2;

    const interpretation = this.generateInterpretation(cvar95, var95, tailRiskRatio);

    return {
      cvar95: Number(cvar95.toFixed(2)),
      cvar99: Number(cvar99.toFixed(2)),
      tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
      expectedShortfall: Number(cvar95.toFixed(2)),
      interpretation,
    };
  }

  /**
   * Parametric CVaR: Assumes normal distribution
   * CVaR = μ - σ × φ(Φ^-1(α)) / α
   * where φ is PDF, Φ^-1 is inverse CDF
   */
  private async calculateParametricCVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number
  ): Promise<CVaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Calculate portfolio returns
    const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);

    if (portfolioReturns.length === 0) {
      throw new Error("Insufficient historical data for CVaR calculation");
    }

    // Calculate mean and standard deviation
    const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const variance =
      portfolioReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      portfolioReturns.length;
    const stdDev = Math.sqrt(variance);

    // For normal distribution:
    // CVaR = μ - σ × φ(z) / (1 - α)
    // where z is z-score for confidence level α
    // φ(z) is standard normal PDF at z

    // For 95% confidence: z = 1.645, φ(z) ≈ 0.103
    // For 99% confidence: z = 2.326, φ(z) ≈ 0.027

    const z95 = 1.645;
    const z99 = 2.326;
    const phi95 = 0.103; // Standard normal PDF at z=1.645
    const phi99 = 0.027; // Standard normal PDF at z=2.326

    const cvar95Return = -(mean - stdDev * (phi95 / (1 - 0.95)));
    const cvar99Return = -(mean - stdDev * (phi99 / (1 - 0.99)));

    const cvar95 = Math.abs(portfolioValue * cvar95Return);
    const cvar99 = Math.abs(portfolioValue * cvar99Return);

    // Calculate VaR for tail risk ratio
    const var95 = Math.abs(portfolioValue * (z95 * stdDev - mean));
    const var99 = Math.abs(portfolioValue * (z99 * stdDev - mean));

    const tailRiskRatio95 = var95 > 0 ? cvar95 / var95 : 1.0;
    const tailRiskRatio99 = var99 > 0 ? cvar99 / var99 : 1.0;
    const tailRiskRatio = (tailRiskRatio95 + tailRiskRatio99) / 2;

    const interpretation = this.generateInterpretation(cvar95, var95, tailRiskRatio);

    return {
      cvar95: Number(cvar95.toFixed(2)),
      cvar99: Number(cvar99.toFixed(2)),
      tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
      expectedShortfall: Number(cvar95.toFixed(2)),
      interpretation,
    };
  }

  /**
   * Monte Carlo CVaR: Simulation-based
   */
  private async calculateMonteCarloCVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number
  ): Promise<CVaRResult> {
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const numSimulations = 10000;

    // Calculate statistics for each asset
    const assetStats = this.calculateAssetStatistics(historicalReturns);

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

    // Sort returns from worst to best
    const sortedReturns = simulatedReturns.sort((a, b) => a - b);

    // Find VaR threshold
    const varIndex95 = Math.floor((1 - 0.95) * sortedReturns.length);
    const varIndex99 = Math.floor((1 - 0.99) * sortedReturns.length);

    // CVaR is average of tail returns
    const tailReturns95 = sortedReturns.slice(0, varIndex95);
    const tailReturns99 = sortedReturns.slice(0, varIndex99);

    const cvar95Return =
      tailReturns95.length > 0
        ? tailReturns95.reduce((sum, r) => sum + r, 0) / tailReturns95.length
        : sortedReturns[0];

    const cvar99Return =
      tailReturns99.length > 0
        ? tailReturns99.reduce((sum, r) => sum + r, 0) / tailReturns99.length
        : sortedReturns[0];

    const cvar95 = Math.abs(portfolioValue * cvar95Return);
    const cvar99 = Math.abs(portfolioValue * cvar99Return);

    // Calculate VaR for tail risk ratio
    const var95 = Math.abs(portfolioValue * sortedReturns[varIndex95]);
    const var99 = Math.abs(portfolioValue * sortedReturns[varIndex99]);

    const tailRiskRatio95 = var95 > 0 ? cvar95 / var95 : 1.0;
    const tailRiskRatio99 = var99 > 0 ? cvar99 / var99 : 1.0;
    const tailRiskRatio = (tailRiskRatio95 + tailRiskRatio99) / 2;

    const interpretation = this.generateInterpretation(cvar95, var95, tailRiskRatio);

    return {
      cvar95: Number(cvar95.toFixed(2)),
      cvar99: Number(cvar99.toFixed(2)),
      tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
      expectedShortfall: Number(cvar95.toFixed(2)),
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
   * Generate random number from normal distribution (Box-Muller transform)
   */
  private generateNormalRandom(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
  }

  /**
   * Generate interpretation text for CVaR result
   */
  private generateInterpretation(cvar95: number, var95: number, tailRiskRatio: number): string {
    const riskAssessment =
      tailRiskRatio > 1.5
        ? "High tail risk - losses could be significantly worse than VaR suggests"
        : tailRiskRatio > 1.2
          ? "Moderate tail risk - some potential for extreme losses"
          : "Normal tail risk distribution";

    return `Expected Shortfall (CVaR): $${cvar95.toFixed(2)}. Average loss when VaR threshold ($${var95.toFixed(2)}) is exceeded. Tail Risk Ratio: ${tailRiskRatio.toFixed(2)}. ${riskAssessment}.`;
  }
}
