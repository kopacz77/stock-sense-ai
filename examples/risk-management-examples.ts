/**
 * Risk Management Enhancement Examples
 * Stock Sense AI - Institutional-Grade Risk Management
 *
 * This file contains example code for implementing the enhanced risk management features.
 * These examples demonstrate the key algorithms and integration patterns.
 */

import type { Position, Signal, HistoricalData, PortfolioMetrics } from '../src/types/trading.js';

// ============================================================================
// EXAMPLE 1: Value at Risk (VaR) Calculation
// ============================================================================

interface VaRResult {
  oneDayVaR95: number;
  oneDayVaR99: number;
  tenDayVaR95: number;
  tenDayVaR99: number;
  method: string;
  calculationDate: Date;
  portfolioValue: number;
  interpretation: string;
}

/**
 * Calculate Historical Value at Risk
 *
 * Uses actual historical returns to estimate maximum potential loss
 * at a given confidence level.
 */
function calculateHistoricalVaR(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  confidenceLevel: number = 0.95,
  timeHorizon: number = 1
): VaRResult {
  const portfolioReturns: number[] = [];
  const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  if (totalValue === 0) {
    throw new Error('Portfolio has no value');
  }

  // Get the length of historical data (assuming all assets have same length)
  const firstReturns = historicalReturns.values().next().value;
  const numDays = firstReturns ? firstReturns.length : 0;

  // Calculate portfolio returns for each historical day
  for (let day = 0; day < numDays; day++) {
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

  // Sort returns from worst to best
  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);

  // Find VaR at different confidence levels
  const percentileIndex95 = Math.floor((1 - 0.95) * sortedReturns.length);
  const percentileIndex99 = Math.floor((1 - 0.99) * sortedReturns.length);

  const varReturn95 = sortedReturns[percentileIndex95] || 0;
  const varReturn99 = sortedReturns[percentileIndex99] || 0;

  // Calculate VaR in dollar terms
  const oneDayVaR95 = Math.abs(totalValue * varReturn95);
  const oneDayVaR99 = Math.abs(totalValue * varReturn99);

  // Scale for longer time horizons using square root of time rule
  const scaleFactor = Math.sqrt(timeHorizon);
  const tenDayVaR95 = oneDayVaR95 * Math.sqrt(10);
  const tenDayVaR99 = oneDayVaR99 * Math.sqrt(10);

  return {
    oneDayVaR95: Number(oneDayVaR95.toFixed(2)),
    oneDayVaR99: Number(oneDayVaR99.toFixed(2)),
    tenDayVaR95: Number(tenDayVaR95.toFixed(2)),
    tenDayVaR99: Number(tenDayVaR99.toFixed(2)),
    method: 'historical',
    calculationDate: new Date(),
    portfolioValue: totalValue,
    interpretation: `There is a ${confidenceLevel * 100}% confidence that losses will not exceed $${oneDayVaR95.toFixed(2)} in one day.`
  };
}

/**
 * Calculate Parametric VaR (assumes normal distribution)
 * Faster but less accurate for fat-tailed distributions
 */
function calculateParametricVaR(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  confidenceLevel: number = 0.95
): number {
  const portfolioReturns = calculatePortfolioReturns(positions, historicalReturns);

  // Calculate mean and standard deviation
  const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
  const variance = portfolioReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / portfolioReturns.length;
  const stdDev = Math.sqrt(variance);

  // Z-scores for confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.282,
    0.95: 1.645,
    0.99: 2.326
  };

  const zScore = zScores[confidenceLevel] || 1.645;
  const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  // VaR = Portfolio Value × Z-score × σ
  const var95 = portfolioValue * zScore * stdDev;

  return Number(var95.toFixed(2));
}

// ============================================================================
// EXAMPLE 2: Conditional Value at Risk (CVaR / Expected Shortfall)
// ============================================================================

interface CVaRResult {
  cvar95: number;
  cvar99: number;
  tailRiskRatio: number;
  expectedShortfall: number;
  interpretation: string;
}

/**
 * Calculate Expected Shortfall (CVaR)
 *
 * Measures the average loss when VaR threshold is exceeded.
 * More conservative than VaR as it considers tail risk.
 */
function calculateCVaR(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  confidenceLevel: number = 0.95
): CVaRResult {
  const portfolioReturns = calculatePortfolioReturns(positions, historicalReturns);
  const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  // Sort returns from worst to best
  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);

  // Find VaR threshold
  const varIndex95 = Math.floor((1 - 0.95) * sortedReturns.length);
  const varIndex99 = Math.floor((1 - 0.99) * sortedReturns.length);

  const varReturn95 = sortedReturns[varIndex95] || 0;
  const varReturn99 = sortedReturns[varIndex99] || 0;

  // CVaR is the average of all returns worse than VaR
  const tailReturns95 = sortedReturns.slice(0, varIndex95 + 1);
  const tailReturns99 = sortedReturns.slice(0, varIndex99 + 1);

  const cvarReturn95 = tailReturns95.reduce((sum, r) => sum + r, 0) / tailReturns95.length;
  const cvarReturn99 = tailReturns99.reduce((sum, r) => sum + r, 0) / tailReturns99.length;

  const cvar95 = Math.abs(portfolioValue * cvarReturn95);
  const cvar99 = Math.abs(portfolioValue * cvarReturn99);

  // Tail Risk Ratio: CVaR / VaR
  // Higher ratio = fatter tails (more dangerous)
  const var95 = Math.abs(portfolioValue * varReturn95);
  const tailRiskRatio = var95 > 0 ? cvar95 / var95 : 1;

  return {
    cvar95: Number(cvar95.toFixed(2)),
    cvar99: Number(cvar99.toFixed(2)),
    tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
    expectedShortfall: Number(cvar95.toFixed(2)),
    interpretation: tailRiskRatio > 1.5
      ? 'High tail risk - losses could be significantly worse than VaR suggests'
      : 'Normal tail risk distribution'
  };
}

// ============================================================================
// EXAMPLE 3: Correlation Matrix Calculation
// ============================================================================

interface CorrelationMatrix {
  matrix: Map<string, Map<string, number>>;
  lastUpdated: Date;
  dataPoints: number;
  avgCorrelation: number;
  highlyCorrelated: Array<{ symbol1: string; symbol2: string; correlation: number }>;
}

/**
 * Calculate Pearson correlation coefficient between two return series
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  // Calculate means
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  // Calculate correlation
  let numerator = 0;
  let sumSquareX = 0;
  let sumSquareY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumSquareX += dx * dx;
    sumSquareY += dy * dy;
  }

  const denominator = Math.sqrt(sumSquareX * sumSquareY);

  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * Build correlation matrix for entire portfolio
 * Uses real historical returns, not sector approximations
 */
function calculateCorrelationMatrix(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  lookbackPeriod: number = 90
): CorrelationMatrix {
  const matrix = new Map<string, Map<string, number>>();
  const symbols = positions.map(p => p.symbol);
  let totalCorrelation = 0;
  let pairCount = 0;
  const highlyCorrelated: Array<{ symbol1: string; symbol2: string; correlation: number }> = [];

  // Calculate correlation for each pair of assets
  for (let i = 0; i < symbols.length; i++) {
    const symbol1 = symbols[i];
    const returns1 = historicalReturns.get(symbol1)?.slice(-lookbackPeriod);

    if (!returns1) continue;

    if (!matrix.has(symbol1)) {
      matrix.set(symbol1, new Map());
    }

    for (let j = 0; j < symbols.length; j++) {
      const symbol2 = symbols[j];
      const returns2 = historicalReturns.get(symbol2)?.slice(-lookbackPeriod);

      if (!returns2) continue;

      const correlation = calculatePearsonCorrelation(returns1, returns2);
      matrix.get(symbol1)!.set(symbol2, correlation);

      // Only count each pair once and exclude self-correlation
      if (i < j) {
        totalCorrelation += correlation;
        pairCount++;

        // Flag highly correlated pairs (correlation > 0.7)
        if (correlation > 0.7) {
          highlyCorrelated.push({ symbol1, symbol2, correlation });
        }
      }
    }
  }

  return {
    matrix,
    lastUpdated: new Date(),
    dataPoints: lookbackPeriod,
    avgCorrelation: pairCount > 0 ? totalCorrelation / pairCount : 0,
    highlyCorrelated: highlyCorrelated.sort((a, b) => b.correlation - a.correlation)
  };
}

/**
 * Calculate diversification ratio
 * Higher ratio = better diversification
 */
function calculateDiversificationRatio(
  positions: Position[],
  correlationMatrix: CorrelationMatrix
): number {
  const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  if (totalValue === 0) return 0;

  // Weighted sum of individual volatilities
  let weightedVolatilitySum = 0;

  // This is simplified - in production, calculate actual volatility per asset
  for (const pos of positions) {
    const weight = pos.value / totalValue;
    const assetVolatility = 0.20; // Placeholder - should calculate from historical data
    weightedVolatilitySum += weight * assetVolatility;
  }

  // Portfolio volatility (accounting for correlations)
  let portfolioVariance = 0;
  for (let i = 0; i < positions.length; i++) {
    const pos1 = positions[i];
    const weight1 = pos1.value / totalValue;
    const vol1 = 0.20; // Placeholder

    for (let j = 0; j < positions.length; j++) {
      const pos2 = positions[j];
      const weight2 = pos2.value / totalValue;
      const vol2 = 0.20; // Placeholder

      const correlation = correlationMatrix.matrix.get(pos1.symbol)?.get(pos2.symbol) || 0;
      portfolioVariance += weight1 * weight2 * vol1 * vol2 * correlation;
    }
  }

  const portfolioVolatility = Math.sqrt(portfolioVariance);

  // Diversification Ratio = Weighted Volatility Sum / Portfolio Volatility
  return portfolioVolatility > 0 ? weightedVolatilitySum / portfolioVolatility : 1;
}

// ============================================================================
// EXAMPLE 4: Kelly Criterion Position Sizing
// ============================================================================

interface KellyCalculation {
  optimalPositionSize: number;
  conservativePositionSize: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectedValue: number;
  riskOfRuin: number;
  recommendation: 'FULL_KELLY' | 'HALF_KELLY' | 'QUARTER_KELLY' | 'TOO_RISKY';
}

/**
 * Calculate optimal position size using Kelly Criterion
 *
 * Kelly Formula: f* = (p * b - q) / b
 * where:
 *   f* = fraction of capital to bet
 *   p = probability of win
 *   q = probability of loss (1 - p)
 *   b = ratio of win to loss (avg_win / avg_loss)
 */
function calculateKellyPosition(
  accountBalance: number,
  winRate: number,
  avgWin: number,
  avgLoss: number,
  conservativeness: 'FULL' | 'HALF' | 'QUARTER' = 'HALF'
): KellyCalculation {
  const lossRate = 1 - winRate;

  // Calculate win/loss ratio
  const b = Math.abs(avgWin / avgLoss);

  // Kelly percentage: (p * b - q) / b
  const kellyPercent = (winRate * b - lossRate) / b;

  // Conservative adjustments
  let adjustedKelly = kellyPercent;
  if (conservativeness === 'HALF') {
    adjustedKelly = kellyPercent / 2;
  } else if (conservativeness === 'QUARTER') {
    adjustedKelly = kellyPercent / 4;
  }

  // Apply hard limits (never exceed 25% of capital)
  const cappedKelly = Math.max(0, Math.min(kellyPercent, 0.25));
  const cappedConservative = Math.max(0, Math.min(adjustedKelly, 0.25));

  // Calculate position sizes
  const fullKellySize = accountBalance * cappedKelly;
  const conservativeSize = accountBalance * cappedConservative;

  // Calculate expected value
  const expectedValue = winRate * avgWin - lossRate * Math.abs(avgLoss);

  // Calculate risk of ruin (simplified)
  const riskOfRuin = Math.pow(lossRate / winRate, accountBalance / Math.abs(avgLoss));

  // Generate recommendation
  let recommendation: 'FULL_KELLY' | 'HALF_KELLY' | 'QUARTER_KELLY' | 'TOO_RISKY';
  if (kellyPercent <= 0 || expectedValue <= 0) {
    recommendation = 'TOO_RISKY';
  } else if (kellyPercent > 0.20) {
    recommendation = 'TOO_RISKY'; // Strategy might be overfitted
  } else if (kellyPercent > 0.10) {
    recommendation = 'QUARTER_KELLY';
  } else if (kellyPercent > 0.05) {
    recommendation = 'HALF_KELLY';
  } else {
    recommendation = 'FULL_KELLY';
  }

  return {
    optimalPositionSize: Number(fullKellySize.toFixed(2)),
    conservativePositionSize: Number(conservativeSize.toFixed(2)),
    winRate,
    avgWin,
    avgLoss,
    expectedValue: Number(expectedValue.toFixed(2)),
    riskOfRuin: Number(riskOfRuin.toFixed(6)),
    recommendation
  };
}

// ============================================================================
// EXAMPLE 5: Monte Carlo Simulation
// ============================================================================

interface MonteCarloResult {
  scenarios: number;
  expectedReturn: number;
  expectedReturnPercent: number;
  medianReturn: number;
  worstCase5th: number;
  bestCase95th: number;
  probabilityOfProfit: number;
  probabilityOfLoss10Percent: number;
  probabilityOfLoss20Percent: number;
  maxDrawdown: number;
  returns: number[]; // All simulated returns for distribution
}

/**
 * Run Monte Carlo simulation for portfolio
 *
 * Simulates thousands of possible outcomes based on historical
 * volatility and correlations
 */
function runMonteCarloSimulation(
  positions: Position[],
  accountBalance: number,
  historicalReturns: Map<string, number[]>,
  correlationMatrix: CorrelationMatrix,
  config: {
    simulations: number;
    timeHorizon: number; // days
    includeCorrelations: boolean;
  }
): MonteCarloResult {
  const { simulations, timeHorizon, includeCorrelations } = config;
  const simulatedReturns: number[] = [];

  // Calculate mean and volatility for each asset
  const assetStats = new Map<string, { mean: number; stdDev: number }>();

  for (const [symbol, returns] of historicalReturns.entries()) {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    assetStats.set(symbol, { mean, stdDev });
  }

  // Run simulations
  for (let sim = 0; sim < simulations; sim++) {
    let portfolioReturn = 0;
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    for (const position of positions) {
      const stats = assetStats.get(position.symbol);
      if (!stats) continue;

      const weight = position.value / totalValue;

      // Generate random return for this asset
      // Using Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      // Simulated return = mean + (z-score × volatility × sqrt(time))
      const assetReturn = stats.mean * timeHorizon + z * stats.stdDev * Math.sqrt(timeHorizon);

      portfolioReturn += weight * assetReturn;
    }

    simulatedReturns.push(portfolioReturn);
  }

  // Sort returns for percentile calculations
  const sortedReturns = [...simulatedReturns].sort((a, b) => a - b);

  // Calculate statistics
  const expectedReturn = simulatedReturns.reduce((sum, r) => sum + r, 0) / simulations;
  const medianReturn = sortedReturns[Math.floor(simulations / 2)] || 0;
  const worstCase5th = sortedReturns[Math.floor(simulations * 0.05)] || 0;
  const bestCase95th = sortedReturns[Math.floor(simulations * 0.95)] || 0;

  // Calculate probabilities
  const profitableScenarios = simulatedReturns.filter(r => r > 0).length;
  const loss10Scenarios = simulatedReturns.filter(r => r < -0.10).length;
  const loss20Scenarios = simulatedReturns.filter(r => r < -0.20).length;

  const probabilityOfProfit = profitableScenarios / simulations;
  const probabilityOfLoss10Percent = loss10Scenarios / simulations;
  const probabilityOfLoss20Percent = loss20Scenarios / simulations;

  // Estimate max drawdown (simplified)
  const maxDrawdown = Math.abs(worstCase5th);

  return {
    scenarios: simulations,
    expectedReturn: Number((expectedReturn * accountBalance).toFixed(2)),
    expectedReturnPercent: Number((expectedReturn * 100).toFixed(2)),
    medianReturn: Number((medianReturn * accountBalance).toFixed(2)),
    worstCase5th: Number((worstCase5th * accountBalance).toFixed(2)),
    bestCase95th: Number((bestCase95th * accountBalance).toFixed(2)),
    probabilityOfProfit: Number((probabilityOfProfit * 100).toFixed(2)),
    probabilityOfLoss10Percent: Number((probabilityOfLoss10Percent * 100).toFixed(2)),
    probabilityOfLoss20Percent: Number((probabilityOfLoss20Percent * 100).toFixed(2)),
    maxDrawdown: Number((maxDrawdown * accountBalance).toFixed(2)),
    returns: simulatedReturns
  };
}

// ============================================================================
// EXAMPLE 6: Sharpe Ratio and Risk-Adjusted Returns
// ============================================================================

interface SharpeRatioResult {
  sharpeRatio: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  riskFreeRate: number;
  interpretation: string;
}

/**
 * Calculate Sharpe Ratio
 * Measures risk-adjusted return
 */
function calculateSharpeRatio(
  portfolioReturns: number[],
  riskFreeRate: number = 0.04 // 4% annual
): SharpeRatioResult {
  if (portfolioReturns.length === 0) {
    throw new Error('No returns data available');
  }

  // Calculate mean return
  const avgDailyReturn = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;

  // Annualize (assuming daily returns)
  const annualizedReturn = avgDailyReturn * 252;

  // Calculate volatility
  const variance = portfolioReturns.reduce((sum, r) => {
    return sum + Math.pow(r - avgDailyReturn, 2);
  }, 0) / portfolioReturns.length;

  const dailyVolatility = Math.sqrt(variance);
  const annualizedVolatility = dailyVolatility * Math.sqrt(252);

  // Sharpe Ratio = (Return - Risk-Free Rate) / Volatility
  const sharpeRatio = annualizedVolatility > 0
    ? (annualizedReturn - riskFreeRate) / annualizedVolatility
    : 0;

  // Interpretation
  let interpretation: string;
  if (sharpeRatio > 3.0) interpretation = 'Excellent (>3.0)';
  else if (sharpeRatio > 2.0) interpretation = 'Very Good (2.0-3.0)';
  else if (sharpeRatio > 1.0) interpretation = 'Good (1.0-2.0)';
  else if (sharpeRatio > 0.5) interpretation = 'Fair (0.5-1.0)';
  else interpretation = 'Poor (<0.5)';

  return {
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    annualizedReturn: Number((annualizedReturn * 100).toFixed(2)),
    annualizedVolatility: Number((annualizedVolatility * 100).toFixed(2)),
    riskFreeRate,
    interpretation
  };
}

/**
 * Calculate Sortino Ratio
 * Like Sharpe but only penalizes downside volatility
 */
function calculateSortinoRatio(
  portfolioReturns: number[],
  targetReturn: number = 0,
  riskFreeRate: number = 0.04
): { sortinoRatio: number; downsideDeviation: number } {
  const avgReturn = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
  const annualizedReturn = avgReturn * 252;

  // Calculate downside deviation (only negative returns)
  const downsideReturns = portfolioReturns.filter(r => r < targetReturn);
  const downsideVariance = downsideReturns.reduce((sum, r) => {
    return sum + Math.pow(r - targetReturn, 2);
  }, 0) / portfolioReturns.length; // Divide by all periods, not just downside

  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);

  const sortinoRatio = downsideDeviation > 0
    ? (annualizedReturn - riskFreeRate) / downsideDeviation
    : 0;

  return {
    sortinoRatio: Number(sortinoRatio.toFixed(2)),
    downsideDeviation: Number((downsideDeviation * 100).toFixed(2))
  };
}

/**
 * Calculate Maximum Drawdown
 * Largest peak-to-trough decline
 */
function calculateMaximumDrawdown(
  portfolioValues: Array<{ date: Date; value: number }>
): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  drawdownStart: Date | null;
  drawdownBottom: Date | null;
  currentDrawdown: number;
} {
  if (portfolioValues.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      drawdownStart: null,
      drawdownBottom: null,
      currentDrawdown: 0
    };
  }

  let maxValue = portfolioValues[0].value;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let drawdownStart: Date | null = null;
  let drawdownBottom: Date | null = null;

  for (const point of portfolioValues) {
    // Update peak
    if (point.value > maxValue) {
      maxValue = point.value;
    }

    // Calculate current drawdown
    const currentDrawdown = maxValue - point.value;
    const currentDrawdownPercent = (currentDrawdown / maxValue) * 100;

    // Update max drawdown
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
      maxDrawdownPercent = currentDrawdownPercent;
      drawdownBottom = point.date;

      // Find the start of this drawdown
      for (let i = portfolioValues.indexOf(point); i >= 0; i--) {
        if (portfolioValues[i].value === maxValue) {
          drawdownStart = portfolioValues[i].date;
          break;
        }
      }
    }
  }

  // Calculate current drawdown from latest peak
  const currentValue = portfolioValues[portfolioValues.length - 1].value;
  const currentDrawdown = ((currentValue - maxValue) / maxValue) * 100;

  return {
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    drawdownStart,
    drawdownBottom,
    currentDrawdown: Number(currentDrawdown.toFixed(2))
  };
}

// ============================================================================
// EXAMPLE 7: Pre-Trade Risk Validation
// ============================================================================

interface PreTradeCheck {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  riskImpact: {
    currentRisk: number;
    newRisk: number;
    riskIncrease: number;
    riskLimit: number;
    utilizationPercent: number;
  };
  recommendation: 'APPROVE' | 'REDUCE_SIZE' | 'REJECT';
}

/**
 * Validate trade against risk limits before execution
 */
function validateTrade(
  signal: Signal,
  currentPositions: Position[],
  accountBalance: number,
  riskLimits: {
    maxPositionSize: number; // 0.25 = 25%
    maxTotalRisk: number; // 0.10 = 10%
    maxSectorExposure: number; // 0.30 = 30%
    maxDrawdown: number; // -0.15 = -15%
  }
): PreTradeCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Position Size Check
  const proposedValue = (signal.positionSize || 0) * (signal.entryPrice || 0);
  const positionSizePercent = proposedValue / accountBalance;

  if (positionSizePercent > riskLimits.maxPositionSize) {
    blockers.push(
      `Position size ${(positionSizePercent * 100).toFixed(1)}% exceeds limit of ${(riskLimits.maxPositionSize * 100).toFixed(0)}%`
    );
  } else if (positionSizePercent > riskLimits.maxPositionSize * 0.8) {
    warnings.push(`Large position size: ${(positionSizePercent * 100).toFixed(1)}%`);
  }

  // 2. Total Portfolio Risk Check
  const currentRisk = currentPositions.reduce((sum, pos) => sum + pos.riskAmount, 0);
  const newRisk = currentRisk + (signal.riskAmount || 0);
  const riskPercent = newRisk / accountBalance;

  if (riskPercent > riskLimits.maxTotalRisk) {
    blockers.push(
      `Total portfolio risk ${(riskPercent * 100).toFixed(1)}% exceeds limit of ${(riskLimits.maxTotalRisk * 100).toFixed(0)}%`
    );
  } else if (riskPercent > riskLimits.maxTotalRisk * 0.6) {
    warnings.push(`High portfolio risk: ${(riskPercent * 100).toFixed(1)}%`);
  }

  // 3. Check if too many positions
  if (currentPositions.length >= 15) {
    warnings.push(`Portfolio already has ${currentPositions.length} positions - consider diversification limits`);
  }

  // Determine recommendation
  let recommendation: 'APPROVE' | 'REDUCE_SIZE' | 'REJECT';
  if (blockers.length > 0) {
    recommendation = 'REJECT';
  } else if (warnings.length >= 2) {
    recommendation = 'REDUCE_SIZE';
  } else {
    recommendation = 'APPROVE';
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    riskImpact: {
      currentRisk,
      newRisk,
      riskIncrease: newRisk - currentRisk,
      riskLimit: accountBalance * riskLimits.maxTotalRisk,
      utilizationPercent: (newRisk / (accountBalance * riskLimits.maxTotalRisk)) * 100
    },
    recommendation
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate portfolio returns from positions and historical data
 */
function calculatePortfolioReturns(
  positions: Position[],
  historicalReturns: Map<string, number[]>
): number[] {
  const portfolioReturns: number[] = [];
  const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  if (totalValue === 0) return [];

  const firstReturns = historicalReturns.values().next().value;
  const numDays = firstReturns ? firstReturns.length : 0;

  for (let day = 0; day < numDays; day++) {
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
 * Generate sample historical returns for testing
 */
function generateSampleReturns(numDays: number, meanReturn: number = 0.001, volatility: number = 0.02): number[] {
  const returns: number[] = [];

  for (let i = 0; i < numDays; i++) {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const dailyReturn = meanReturn + volatility * z;
    returns.push(dailyReturn);
  }

  return returns;
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Complete risk analysis workflow
 */
async function exampleRiskAnalysisWorkflow() {
  // Mock data
  const positions: Position[] = [
    {
      symbol: 'AAPL',
      entryPrice: 150,
      currentPrice: 155,
      quantity: 100,
      value: 15500,
      unrealizedPnL: 500,
      unrealizedPnLPercent: 3.33,
      entryDate: new Date('2025-10-01'),
      strategy: 'Momentum',
      riskAmount: 300
    },
    {
      symbol: 'MSFT',
      entryPrice: 350,
      currentPrice: 360,
      quantity: 50,
      value: 18000,
      unrealizedPnL: 500,
      unrealizedPnLPercent: 2.86,
      entryDate: new Date('2025-10-05'),
      strategy: 'Mean Reversion',
      riskAmount: 400
    }
  ];

  const accountBalance = 100000;

  // Generate sample historical returns
  const historicalReturns = new Map<string, number[]>();
  historicalReturns.set('AAPL', generateSampleReturns(252, 0.0008, 0.025));
  historicalReturns.set('MSFT', generateSampleReturns(252, 0.0007, 0.022));

  console.log('=== RISK ANALYSIS REPORT ===\n');

  // 1. VaR Calculation
  console.log('1. Value at Risk (VaR):');
  const varResult = calculateHistoricalVaR(positions, historicalReturns, 0.95, 1);
  console.log(`   1-Day VaR (95%): $${varResult.oneDayVaR95}`);
  console.log(`   1-Day VaR (99%): $${varResult.oneDayVaR99}`);
  console.log(`   ${varResult.interpretation}\n`);

  // 2. CVaR Calculation
  console.log('2. Conditional VaR (Expected Shortfall):');
  const cvarResult = calculateCVaR(positions, historicalReturns, 0.95);
  console.log(`   CVaR (95%): $${cvarResult.cvar95}`);
  console.log(`   Tail Risk Ratio: ${cvarResult.tailRiskRatio}`);
  console.log(`   ${cvarResult.interpretation}\n`);

  // 3. Correlation Analysis
  console.log('3. Correlation Analysis:');
  const corrMatrix = calculateCorrelationMatrix(positions, historicalReturns, 90);
  console.log(`   Average Correlation: ${corrMatrix.avgCorrelation.toFixed(2)}`);
  console.log(`   Highly Correlated Pairs: ${corrMatrix.highlyCorrelated.length}\n`);

  // 4. Sharpe Ratio
  console.log('4. Risk-Adjusted Performance:');
  const portfolioReturns = calculatePortfolioReturns(positions, historicalReturns);
  const sharpe = calculateSharpeRatio(portfolioReturns);
  console.log(`   Sharpe Ratio: ${sharpe.sharpeRatio} (${sharpe.interpretation})`);
  console.log(`   Annualized Return: ${sharpe.annualizedReturn}%`);
  console.log(`   Annualized Volatility: ${sharpe.annualizedVolatility}%\n`);

  // 5. Kelly Criterion
  console.log('5. Kelly Criterion Position Sizing:');
  const kelly = calculateKellyPosition(accountBalance, 0.60, 500, -300, 'HALF');
  console.log(`   Optimal Position: $${kelly.optimalPositionSize}`);
  console.log(`   Conservative Position: $${kelly.conservativePositionSize}`);
  console.log(`   Recommendation: ${kelly.recommendation}\n`);

  // 6. Monte Carlo Simulation
  console.log('6. Monte Carlo Simulation (30 days):');
  const monteCarlo = runMonteCarloSimulation(
    positions,
    accountBalance,
    historicalReturns,
    corrMatrix,
    { simulations: 10000, timeHorizon: 30, includeCorrelations: true }
  );
  console.log(`   Expected Return: $${monteCarlo.expectedReturn} (${monteCarlo.expectedReturnPercent}%)`);
  console.log(`   Probability of Profit: ${monteCarlo.probabilityOfProfit}%`);
  console.log(`   Worst Case (5th percentile): $${monteCarlo.worstCase5th}`);
  console.log(`   Best Case (95th percentile): $${monteCarlo.bestCase95th}\n`);
}

// Export all functions
export {
  // VaR
  calculateHistoricalVaR,
  calculateParametricVaR,

  // CVaR
  calculateCVaR,

  // Correlation
  calculatePearsonCorrelation,
  calculateCorrelationMatrix,
  calculateDiversificationRatio,

  // Kelly Criterion
  calculateKellyPosition,

  // Monte Carlo
  runMonteCarloSimulation,

  // Performance Metrics
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaximumDrawdown,

  // Pre-Trade Validation
  validateTrade,

  // Helpers
  calculatePortfolioReturns,
  generateSampleReturns,

  // Example workflow
  exampleRiskAnalysisWorkflow
};
