/**
 * Performance Calculator for Paper Trading
 * Calculates 25+ real-time performance metrics
 * Includes comparison with benchmarks (SPY)
 */

import type {
  PerformanceSnapshot,
  PaperTrade,
  PortfolioState,
} from "../types/paper-trading-types.js";

/**
 * Performance Calculator
 * Real-time calculation of comprehensive trading metrics
 */
export class PerformanceCalculator {
  private valueHistory: Array<{ timestamp: Date; value: number; returns: number }> = [];
  private dailyReturns: number[] = [];
  private benchmarkReturns: number[] = [];

  constructor() {}

  /**
   * Calculate comprehensive performance snapshot
   */
  calculatePerformance(
    portfolio: PortfolioState,
    trades: PaperTrade[],
    benchmarkReturn?: number
  ): PerformanceSnapshot {
    // Update value history
    this.updateValueHistory(portfolio);

    // Calculate returns
    const dailyReturn = this.calculateDailyReturn(portfolio);
    const weeklyReturn = this.calculatePeriodReturn(7);
    const monthlyReturn = this.calculatePeriodReturn(30);
    const totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;

    // Calculate risk metrics
    const sharpeRatio = this.calculateSharpeRatio();
    const sortinoRatio = this.calculateSortinoRatio();
    const maxDrawdown = this.calculateMaxDrawdown();
    const currentDrawdown = portfolio.currentDrawdown;

    // Calculate trade statistics
    const winningTrades = trades.filter((t) => t.netPnL > 0);
    const losingTrades = trades.filter((t) => t.netPnL < 0);
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    // Calculate profit metrics
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.netPnL, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.netPnL, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
    const expectancy = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.netPnL, 0) / totalTrades : 0;

    // Calculate win/loss statistics
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.netPnL, 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.netPnL, 0) / losingTrades.length
      : 0;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map((t) => t.netPnL))
      : 0;

    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map((t) => t.netPnL))
      : 0;

    // Calculate holding period
    const avgHoldingPeriod = totalTrades > 0
      ? trades.reduce((sum, t) => sum + t.holdDurationDays, 0) / totalTrades
      : 0;

    // Calculate alpha and beta if benchmark provided
    let alpha: number | undefined;
    let beta: number | undefined;

    if (benchmarkReturn !== undefined) {
      this.benchmarkReturns.push(benchmarkReturn);
      const result = this.calculateAlphaBeta();
      alpha = result.alpha;
      beta = result.beta;
    }

    return {
      timestamp: new Date(),
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      positionsValue: portfolio.positionsValue,
      dailyReturn,
      weeklyReturn,
      monthlyReturn,
      totalReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      currentDrawdown,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      profitFactor,
      expectancy,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      avgHoldingPeriod,
      totalCommissions: portfolio.totalCommissions,
      totalSlippage: portfolio.totalSlippage,
      benchmarkReturn,
      alpha,
      beta,
    };
  }

  /**
   * Update value history
   */
  private updateValueHistory(portfolio: PortfolioState): void {
    const lastHistoryPoint = this.valueHistory[this.valueHistory.length - 1];
    const previousValue = lastHistoryPoint?.value ?? portfolio.initialCapital;

    const returns = previousValue > 0
      ? ((portfolio.totalValue - previousValue) / previousValue) * 100
      : 0;

    this.valueHistory.push({
      timestamp: portfolio.lastUpdate,
      value: portfolio.totalValue,
      returns,
    });

    // Track daily returns separately
    if (returns !== 0) {
      this.dailyReturns.push(returns);
    }

    // Keep only last 1000 points
    if (this.valueHistory.length > 1000) {
      this.valueHistory.shift();
      this.dailyReturns.shift();
    }
  }

  /**
   * Calculate daily return
   */
  private calculateDailyReturn(portfolio: PortfolioState): number {
    if (this.valueHistory.length < 2) {
      return 0;
    }

    const current = portfolio.totalValue;
    const previous = this.valueHistory[this.valueHistory.length - 1]?.value ?? portfolio.initialCapital;

    return previous > 0 ? ((current - previous) / previous) * 100 : 0;
  }

  /**
   * Calculate period return (N days)
   */
  private calculatePeriodReturn(days: number): number {
    if (this.valueHistory.length < days + 1) {
      return 0;
    }

    const current = this.valueHistory[this.valueHistory.length - 1]?.value ?? 0;
    const previous = this.valueHistory[this.valueHistory.length - days - 1]?.value ?? 0;

    return previous > 0 ? ((current - previous) / previous) * 100 : 0;
  }

  /**
   * Calculate Sharpe Ratio (rolling)
   * Assumes 0% risk-free rate
   */
  private calculateSharpeRatio(): number {
    if (this.dailyReturns.length < 30) {
      return 0; // Need at least 30 days
    }

    const meanReturn = this.dailyReturns.reduce((sum, r) => sum + r, 0) / this.dailyReturns.length;
    const variance = this.dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / this.dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming 252 trading days)
    const annualizedReturn = meanReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);

    return annualizedReturn / annualizedStdDev;
  }

  /**
   * Calculate Sortino Ratio (rolling)
   * Only penalizes downside volatility
   */
  private calculateSortinoRatio(): number {
    if (this.dailyReturns.length < 30) {
      return 0;
    }

    const meanReturn = this.dailyReturns.reduce((sum, r) => sum + r, 0) / this.dailyReturns.length;
    const downsideReturns = this.dailyReturns.filter((r) => r < 0);

    if (downsideReturns.length === 0) return 0;

    const downsideVariance = downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length;
    const downsideStdDev = Math.sqrt(downsideVariance);

    if (downsideStdDev === 0) return 0;

    // Annualize
    const annualizedReturn = meanReturn * 252;
    const annualizedDownsideDev = downsideStdDev * Math.sqrt(252);

    return annualizedReturn / annualizedDownsideDev;
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(): number {
    if (this.valueHistory.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = this.valueHistory[0]?.value ?? 0;

    for (const point of this.valueHistory) {
      if (point.value > peak) {
        peak = point.value;
      }

      const drawdown = peak > 0 ? ((point.value - peak) / peak) * 100 : 0;

      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Alpha and Beta relative to benchmark
   */
  private calculateAlphaBeta(): { alpha: number; beta: number } {
    if (this.dailyReturns.length < 30 || this.benchmarkReturns.length < 30) {
      return { alpha: 0, beta: 0 };
    }

    // Ensure arrays are same length
    const minLength = Math.min(this.dailyReturns.length, this.benchmarkReturns.length);
    const portfolioReturns = this.dailyReturns.slice(-minLength);
    const benchReturns = this.benchmarkReturns.slice(-minLength);

    // Calculate means
    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const benchMean = benchReturns.reduce((sum, r) => sum + r, 0) / benchReturns.length;

    // Calculate covariance and variance
    let covariance = 0;
    let benchVariance = 0;

    for (let i = 0; i < minLength; i++) {
      const portfolioDev = (portfolioReturns[i] ?? 0) - portfolioMean;
      const benchDev = (benchReturns[i] ?? 0) - benchMean;

      covariance += portfolioDev * benchDev;
      benchVariance += benchDev * benchDev;
    }

    covariance /= minLength;
    benchVariance /= minLength;

    // Calculate beta
    const beta = benchVariance !== 0 ? covariance / benchVariance : 0;

    // Calculate alpha (annualized)
    const annualizedPortfolioReturn = portfolioMean * 252;
    const annualizedBenchReturn = benchMean * 252;
    const alpha = annualizedPortfolioReturn - (beta * annualizedBenchReturn);

    return { alpha, beta };
  }

  /**
   * Calculate Calmar Ratio
   */
  calculateCalmarRatio(totalReturn: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return 0;
    return totalReturn / Math.abs(maxDrawdown);
  }

  /**
   * Calculate expectancy (Kelly Criterion related)
   */
  calculateExpectancy(trades: PaperTrade[]): number {
    if (trades.length === 0) return 0;

    const winningTrades = trades.filter((t) => t.netPnL > 0);
    const losingTrades = trades.filter((t) => t.netPnL < 0);

    if (winningTrades.length === 0 || losingTrades.length === 0) return 0;

    const winRate = winningTrades.length / trades.length;
    const avgWin = winningTrades.reduce((sum, t) => sum + t.netPnL, 0) / winningTrades.length;
    const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.netPnL, 0) / losingTrades.length);

    return (winRate * avgWin) - ((1 - winRate) * avgLoss);
  }

  /**
   * Calculate R-squared (goodness of fit with benchmark)
   */
  calculateRSquared(): number {
    if (this.dailyReturns.length < 30 || this.benchmarkReturns.length < 30) {
      return 0;
    }

    const minLength = Math.min(this.dailyReturns.length, this.benchmarkReturns.length);
    const portfolioReturns = this.dailyReturns.slice(-minLength);
    const benchReturns = this.benchmarkReturns.slice(-minLength);

    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const benchMean = benchReturns.reduce((sum, r) => sum + r, 0) / benchReturns.length;

    let ssTotal = 0;
    let ssResidual = 0;
    const { beta, alpha } = this.calculateAlphaBeta();

    for (let i = 0; i < minLength; i++) {
      const actual = portfolioReturns[i] ?? 0;
      const predicted = alpha + beta * (benchReturns[i] ?? 0);

      ssTotal += Math.pow(actual - portfolioMean, 2);
      ssResidual += Math.pow(actual - predicted, 2);
    }

    if (ssTotal === 0) return 0;

    return 1 - (ssResidual / ssTotal);
  }

  /**
   * Calculate consecutive win/loss streaks
   */
  calculateStreaks(trades: PaperTrade[]): {
    currentWinStreak: number;
    currentLossStreak: number;
    maxWinStreak: number;
    maxLossStreak: number;
  } {
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const trade of trades) {
      if (trade.netPnL > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (trade.netPnL < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    return {
      currentWinStreak,
      currentLossStreak,
      maxWinStreak,
      maxLossStreak,
    };
  }

  /**
   * Calculate recovery factor
   */
  calculateRecoveryFactor(totalReturn: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return 0;
    return totalReturn / Math.abs(maxDrawdown);
  }

  /**
   * Calculate Ulcer Index (volatility of drawdowns)
   */
  calculateUlcerIndex(): number {
    if (this.valueHistory.length === 0) return 0;

    let peak = this.valueHistory[0]?.value ?? 0;
    const squaredDrawdowns: number[] = [];

    for (const point of this.valueHistory) {
      if (point.value > peak) {
        peak = point.value;
      }

      const drawdown = peak > 0 ? ((point.value - peak) / peak) * 100 : 0;
      squaredDrawdowns.push(drawdown * drawdown);
    }

    const meanSquaredDrawdown = squaredDrawdowns.reduce((sum, d) => sum + d, 0) / squaredDrawdowns.length;

    return Math.sqrt(meanSquaredDrawdown);
  }

  /**
   * Generate daily performance report
   */
  generateDailyReport(
    portfolio: PortfolioState,
    trades: PaperTrade[]
  ): {
    date: string;
    totalValue: number;
    dailyPnL: number;
    dailyReturn: number;
    tradesCount: number;
    winRate: number;
    totalCommissions: number;
    totalSlippage: number;
  } {
    const dailyPnL = this.calculateDailyReturn(portfolio);
    const todayTrades = trades.filter((t) => {
      const today = new Date().toDateString();
      return new Date(t.exitTime).toDateString() === today;
    });

    const winningTrades = todayTrades.filter((t) => t.netPnL > 0);
    const winRate = todayTrades.length > 0 ? (winningTrades.length / todayTrades.length) * 100 : 0;

    return {
      date: new Date().toISOString().split("T")[0] ?? "",
      totalValue: portfolio.totalValue,
      dailyPnL,
      dailyReturn: this.calculateDailyReturn(portfolio),
      tradesCount: todayTrades.length,
      winRate,
      totalCommissions: portfolio.totalCommissions,
      totalSlippage: portfolio.totalSlippage,
    };
  }

  /**
   * Reset calculator
   */
  reset(): void {
    this.valueHistory = [];
    this.dailyReturns = [];
    this.benchmarkReturns = [];
  }

  /**
   * Get value history
   */
  getValueHistory(): Array<{ timestamp: Date; value: number; returns: number }> {
    return [...this.valueHistory];
  }
}
