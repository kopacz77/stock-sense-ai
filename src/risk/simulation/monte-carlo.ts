/**
 * Monte Carlo Portfolio Simulation
 * Generates 10,000+ scenarios to analyze portfolio risk distribution
 * Target: <3s for 10,000 scenarios
 */

import type { Position } from "../../types/trading.js";
import type {
  MonteCarloConfig,
  MonteCarloResult,
  PortfolioScenario,
  CorrelationMatrix,
} from "../types/risk-types.js";

export class MonteCarloSimulator {
  /**
   * Run Monte Carlo portfolio simulation
   * Generate 10,000+ portfolio scenarios
   * Use historical mean and covariance
   * Calculate probability distributions
   * Scenario analysis (bull, bear, sideways)
   * Target: <3s for 10,000 scenarios
   */
  async runSimulation(
    positions: Position[],
    accountBalance: number,
    historicalReturns: Map<string, number[]>,
    config: MonteCarloConfig
  ): Promise<MonteCarloResult> {
    const startTime = Date.now();

    // Calculate asset statistics
    const assetStats = this.calculateAssetStatistics(historicalReturns);

    // Calculate correlation matrix if needed
    let correlationMatrix: CorrelationMatrix | null = null;
    if (config.includeCorrelations) {
      correlationMatrix = this.calculateCorrelationMatrix(positions, historicalReturns);
    }

    // Run scenarios in batches for performance
    const batchSize = 1000;
    const numBatches = Math.ceil(config.simulations / batchSize);
    const scenarios: PortfolioScenario[] = [];

    for (let batch = 0; batch < numBatches; batch++) {
      const batchScenarios = this.generateScenarioBatch(
        positions,
        accountBalance,
        assetStats,
        correlationMatrix,
        config,
        batch * batchSize,
        Math.min(batchSize, config.simulations - batch * batchSize)
      );
      scenarios.push(...batchScenarios);
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(scenarios, accountBalance);

    // Generate distribution
    const distribution = this.generateDistribution(scenarios);

    const calculationTime = Date.now() - startTime;

    return {
      scenarios,
      statistics,
      distribution,
      calculationTime,
    };
  }

  /**
   * Generate a batch of scenarios for parallel processing
   */
  private generateScenarioBatch(
    positions: Position[],
    accountBalance: number,
    assetStats: Map<string, { mean: number; stdDev: number }>,
    correlationMatrix: CorrelationMatrix | null,
    config: MonteCarloConfig,
    startId: number,
    count: number
  ): PortfolioScenario[] {
    const scenarios: PortfolioScenario[] = [];
    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    for (let i = 0; i < count; i++) {
      const scenarioId = startId + i;
      const path: number[] = [portfolioValue];
      let maxDrawdown = 0;
      let peak = portfolioValue;

      // Simulate T-day forward returns
      for (let day = 0; day < config.timeHorizon; day++) {
        let dayReturn = 0;

        // Apply volatility shocks if configured
        const volMultiplier = config.volatilityShocks ? this.getVolatilityShock(day) : 1.0;

        // Generate correlated or uncorrelated returns
        if (config.includeCorrelations && correlationMatrix) {
          // Use Cholesky decomposition for correlated returns (simplified)
          dayReturn = this.generateCorrelatedReturn(
            positions,
            assetStats,
            correlationMatrix,
            portfolioValue,
            volMultiplier
          );
        } else {
          // Independent returns
          for (const position of positions) {
            const stats = assetStats.get(position.symbol);
            if (!stats) continue;

            const weight = position.value / portfolioValue;
            const randomReturn = this.generateNormalRandom(
              stats.mean,
              stats.stdDev * volMultiplier
            );
            dayReturn += weight * randomReturn;
          }
        }

        // Update portfolio value
        const currentValue = path[path.length - 1];
        const newValue = currentValue * (1 + dayReturn);
        path.push(newValue);

        // Track drawdown
        if (newValue > peak) {
          peak = newValue;
        }
        const drawdown = (peak - newValue) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      const finalValue = path[path.length - 1];
      const returnPercent = ((finalValue - portfolioValue) / portfolioValue) * 100;

      scenarios.push({
        scenarioId,
        finalValue: Number(finalValue.toFixed(2)),
        returnPercent: Number(returnPercent.toFixed(2)),
        maxDrawdown: Number((maxDrawdown * 100).toFixed(2)),
        path,
      });
    }

    return scenarios;
  }

  /**
   * Generate correlated returns using correlation matrix
   * Simplified approach - full Cholesky decomposition would be more accurate
   */
  private generateCorrelatedReturn(
    positions: Position[],
    assetStats: Map<string, { mean: number; stdDev: number }>,
    correlationMatrix: CorrelationMatrix,
    portfolioValue: number,
    volMultiplier: number
  ): number {
    let portfolioReturn = 0;

    // For each asset, generate return influenced by other assets
    for (const position of positions) {
      const stats = assetStats.get(position.symbol);
      if (!stats) continue;

      // Base random return
      const baseReturn = this.generateNormalRandom(stats.mean, stats.stdDev * volMultiplier);

      // Adjust based on correlations with other assets (simplified)
      let correlationAdjustment = 0;
      let correlationCount = 0;

      for (const other of positions) {
        if (other.symbol === position.symbol) continue;

        const correlation =
          correlationMatrix.matrix.get(position.symbol)?.get(other.symbol) || 0;
        const otherStats = assetStats.get(other.symbol);

        if (otherStats && Math.abs(correlation) > 0.3) {
          // Only consider significant correlations
          const otherReturn = this.generateNormalRandom(
            otherStats.mean,
            otherStats.stdDev * volMultiplier
          );
          correlationAdjustment += correlation * otherReturn;
          correlationCount++;
        }
      }

      // Blend base return with correlation adjustment
      const adjustedReturn =
        correlationCount > 0
          ? baseReturn * 0.7 + (correlationAdjustment / correlationCount) * 0.3
          : baseReturn;

      const weight = position.value / portfolioValue;
      portfolioReturn += weight * adjustedReturn;
    }

    return portfolioReturn;
  }

  /**
   * Calculate volatility shock for stress scenarios
   * Simulates market crashes and high volatility periods
   */
  private getVolatilityShock(day: number): number {
    // Random shock events (5% chance per day)
    if (Math.random() < 0.05) {
      return 2.0 + Math.random() * 1.0; // 2-3x normal volatility
    }
    return 1.0;
  }

  /**
   * Calculate statistics from scenarios
   */
  private calculateStatistics(
    scenarios: PortfolioScenario[],
    accountBalance: number
  ): MonteCarloResult["statistics"] {
    const returns = scenarios.map((s) => s.returnPercent / 100);
    const finalValues = scenarios.map((s) => s.finalValue);
    const drawdowns = scenarios.map((s) => s.maxDrawdown);

    // Sort for percentile calculations
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const sortedValues = [...finalValues].sort((a, b) => a - b);
    const sortedDrawdowns = [...drawdowns].sort((a, b) => b - a);

    // Calculate statistics
    const expectedReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const medianReturn = sortedReturns[Math.floor(sortedReturns.length / 2)];

    const worstCase5th = sortedValues[Math.floor(sortedValues.length * 0.05)];
    const bestCase95th = sortedValues[Math.floor(sortedValues.length * 0.95)];

    const profitScenarios = scenarios.filter((s) => s.returnPercent > 0).length;
    const lossScenarios = scenarios.filter((s) => s.returnPercent < 0).length;
    const loss10Scenarios = scenarios.filter((s) => s.returnPercent < -10).length;
    const loss20Scenarios = scenarios.filter((s) => s.returnPercent < -20).length;

    const probabilityOfProfit = profitScenarios / scenarios.length;
    const probabilityOfLoss = lossScenarios / scenarios.length;
    const probabilityOfLoss10Percent = loss10Scenarios / scenarios.length;
    const probabilityOfLoss20Percent = loss20Scenarios / scenarios.length;

    const maxDrawdown = sortedDrawdowns[0];

    return {
      expectedReturn: Number((accountBalance * expectedReturn).toFixed(2)),
      expectedReturnPercent: Number((expectedReturn * 100).toFixed(2)),
      medianReturn: Number((accountBalance * medianReturn).toFixed(2)),
      worstCase5th: Number(worstCase5th.toFixed(2)),
      bestCase95th: Number(bestCase95th.toFixed(2)),
      probabilityOfProfit: Number(probabilityOfProfit.toFixed(3)),
      probabilityOfLoss: Number(probabilityOfLoss.toFixed(3)),
      probabilityOfLoss10Percent: Number(probabilityOfLoss10Percent.toFixed(3)),
      probabilityOfLoss20Percent: Number(probabilityOfLoss20Percent.toFixed(3)),
      maxDrawdown: Number((accountBalance * (maxDrawdown / 100)).toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
    };
  }

  /**
   * Generate distribution for histogram
   */
  private generateDistribution(scenarios: PortfolioScenario[]): {
    bins: number[];
    frequencies: number[];
  } {
    const numBins = 20;
    const returns = scenarios.map((s) => s.returnPercent);

    const minReturn = Math.min(...returns);
    const maxReturn = Math.max(...returns);
    const binWidth = (maxReturn - minReturn) / numBins;

    const bins: number[] = [];
    const frequencies: number[] = [];

    for (let i = 0; i < numBins; i++) {
      const binStart = minReturn + i * binWidth;
      bins.push(Number(binStart.toFixed(2)));

      const count = returns.filter((r) => r >= binStart && r < binStart + binWidth).length;
      frequencies.push(count);
    }

    return { bins, frequencies };
  }

  /**
   * Calculate asset statistics
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
   * Calculate simple correlation matrix
   */
  private calculateCorrelationMatrix(
    positions: Position[],
    historicalReturns: Map<string, number[]>
  ): CorrelationMatrix {
    const matrix = new Map<string, Map<string, number>>();
    const symbols = positions.map((p) => p.symbol);
    let totalCorrelation = 0;
    let pairCount = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol1 = symbols[i];
      const returns1 = historicalReturns.get(symbol1);

      if (!returns1) continue;
      if (!matrix.has(symbol1)) {
        matrix.set(symbol1, new Map());
      }

      for (let j = 0; j < symbols.length; j++) {
        const symbol2 = symbols[j];
        const returns2 = historicalReturns.get(symbol2);

        if (!returns2) continue;

        const correlation = this.calculatePearsonCorrelation(returns1, returns2);
        matrix.get(symbol1)!.set(symbol2, correlation);

        if (i < j) {
          totalCorrelation += correlation;
          pairCount++;
        }
      }
    }

    return {
      matrix,
      lastUpdated: new Date(),
      dataPoints: historicalReturns.values().next().value?.length || 0,
      avgCorrelation: pairCount > 0 ? totalCorrelation / pairCount : 0,
      highlyCorrelated: [],
    };
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
   * Run scenario analysis (bull, bear, sideways)
   */
  async runScenarioAnalysis(
    positions: Position[],
    accountBalance: number,
    historicalReturns: Map<string, number[]>,
    config: Omit<MonteCarloConfig, "simulations">
  ): Promise<{
    bullMarket: MonteCarloResult;
    bearMarket: MonteCarloResult;
    sidewaysMarket: MonteCarloResult;
  }> {
    const baseConfig: MonteCarloConfig = {
      ...config,
      simulations: 5000, // Fewer simulations per scenario
    };

    // Adjust asset statistics for different market conditions
    const assetStats = this.calculateAssetStatistics(historicalReturns);

    // Bull market: +0.1% mean daily return, 0.8x volatility
    const bullStats = this.adjustStatsForMarket(assetStats, 0.001, 0.8);
    const bullReturns = this.convertStatsToReturns(bullStats, 252);

    // Bear market: -0.1% mean daily return, 1.5x volatility
    const bearStats = this.adjustStatsForMarket(assetStats, -0.001, 1.5);
    const bearReturns = this.convertStatsToReturns(bearStats, 252);

    // Sideways market: 0% mean daily return, 1.2x volatility
    const sidewaysStats = this.adjustStatsForMarket(assetStats, 0, 1.2);
    const sidewaysReturns = this.convertStatsToReturns(sidewaysStats, 252);

    const [bullMarket, bearMarket, sidewaysMarket] = await Promise.all([
      this.runSimulation(positions, accountBalance, bullReturns, baseConfig),
      this.runSimulation(positions, accountBalance, bearReturns, baseConfig),
      this.runSimulation(positions, accountBalance, sidewaysReturns, baseConfig),
    ]);

    return { bullMarket, bearMarket, sidewaysMarket };
  }

  /**
   * Adjust statistics for market conditions
   */
  private adjustStatsForMarket(
    stats: Map<string, { mean: number; stdDev: number }>,
    meanAdjustment: number,
    volMultiplier: number
  ): Map<string, { mean: number; stdDev: number }> {
    const adjustedStats = new Map<string, { mean: number; stdDev: number }>();

    for (const [symbol, { mean, stdDev }] of stats.entries()) {
      adjustedStats.set(symbol, {
        mean: mean + meanAdjustment,
        stdDev: stdDev * volMultiplier,
      });
    }

    return adjustedStats;
  }

  /**
   * Convert statistics back to returns array for simulation
   */
  private convertStatsToReturns(
    stats: Map<string, { mean: number; stdDev: number }>,
    length: number
  ): Map<string, number[]> {
    const returns = new Map<string, number[]>();

    for (const [symbol, { mean, stdDev }] of stats.entries()) {
      const symbolReturns: number[] = [];
      for (let i = 0; i < length; i++) {
        symbolReturns.push(this.generateNormalRandom(mean, stdDev));
      }
      returns.set(symbol, symbolReturns);
    }

    return returns;
  }
}
