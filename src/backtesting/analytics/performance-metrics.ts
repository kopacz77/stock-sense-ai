/**
 * Performance Metrics Calculator
 * Calculates comprehensive trading performance metrics
 * Industry-standard calculations matching professional platforms
 */

import type {
  PerformanceMetrics,
  Trade,
  EquityCurvePoint,
  DrawdownPoint,
} from "../types/backtest-types.js";

export class PerformanceMetricsCalculator {
  /**
   * Calculate all performance metrics from backtest results
   */
  static calculate(
    equityCurve: EquityCurvePoint[],
    trades: Trade[],
    initialCapital: number,
    startDate: Date,
    endDate: Date,
    totalCommissions: number,
    totalSlippage: number
  ): PerformanceMetrics {
    if (equityCurve.length === 0) {
      return this.getEmptyMetrics(startDate, endDate);
    }

    const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialCapital;

    // Calculate return metrics
    const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
    const totalReturnDollar = finalEquity - initialCapital;
    const tradingDays = this.calculateTradingDays(startDate, endDate);
    const years = tradingDays / 252; // Assuming 252 trading days per year
    const cagr = this.calculateCAGR(initialCapital, finalEquity, years);

    // Calculate risk metrics
    const dailyReturns = equityCurve.map((point) => point.returns);
    const volatility = this.calculateVolatility(dailyReturns);
    const sharpeRatio = this.calculateSharpeRatio(dailyReturns, volatility);
    const sortinoRatio = this.calculateSortinoRatio(dailyReturns);

    // Calculate drawdown metrics
    const drawdowns = this.calculateDrawdowns(equityCurve);
    const maxDrawdown = this.getMaxDrawdown(drawdowns);
    const maxDrawdownDuration = this.getMaxDrawdownDuration(drawdowns);
    const calmarRatio = cagr / Math.abs(maxDrawdown);

    // Calculate trade statistics
    const winningTrades = trades.filter((t) => t.pnl > 0);
    const losingTrades = trades.filter((t) => t.pnl < 0);
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    // Calculate win/loss statistics
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length
      : 0;

    const avgWinPercent = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
      : 0;

    const avgLossPercent = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length
      : 0;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map((t) => t.pnl))
      : 0;

    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map((t) => t.pnl))
      : 0;

    // Calculate profit metrics
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
    const payoffRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;

    // Expectancy = average profit per trade
    const expectancy = totalTrades > 0
      ? trades.reduce((sum, t) => sum + t.pnl, 0) / totalTrades
      : 0;

    const expectancyPercent = totalTrades > 0
      ? trades.reduce((sum, t) => sum + t.pnlPercent, 0) / totalTrades
      : 0;

    // Calculate holding period
    const avgHoldingPeriod = totalTrades > 0
      ? trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / totalTrades
      : 0;

    // Calculate consecutive win/loss streaks
    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateStreaks(trades);

    return {
      // Return Metrics
      totalReturn,
      totalReturnDollar,
      cagr,

      // Risk Metrics
      volatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown,
      maxDrawdownDuration,

      // Trade Statistics
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,

      // Win/Loss Statistics
      avgWin,
      avgLoss,
      avgWinPercent,
      avgLossPercent,
      largestWin,
      largestLoss,

      // Profit Metrics
      profitFactor,
      payoffRatio,
      expectancy,
      expectancyPercent,

      // Additional Metrics
      avgHoldingPeriod,
      maxConsecutiveWins,
      maxConsecutiveLosses,

      // Time-based
      startDate,
      endDate,
      tradingDays,

      // Cost Analysis
      totalCommissions,
      totalSlippage,
      totalCosts: totalCommissions + totalSlippage,
    };
  }

  /**
   * Calculate CAGR (Compound Annual Growth Rate)
   * Formula: CAGR = (Ending Value / Beginning Value)^(1/years) - 1
   */
  private static calculateCAGR(
    initialCapital: number,
    finalCapital: number,
    years: number
  ): number {
    if (years === 0 || initialCapital === 0) return 0;
    return (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100;
  }

  /**
   * Calculate annualized volatility (standard deviation of returns)
   */
  private static calculateVolatility(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 0;

    const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const squaredDiffs = dailyReturns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (dailyReturns.length - 1);
    const dailyVol = Math.sqrt(variance);

    // Annualize: multiply by sqrt(252)
    return dailyVol * Math.sqrt(252);
  }

  /**
   * Calculate Sharpe Ratio
   * Sharpe = (Mean Return - Risk Free Rate) / Std Dev
   * Assumes 0% risk-free rate for simplicity
   */
  private static calculateSharpeRatio(dailyReturns: number[], volatility: number): number {
    if (dailyReturns.length === 0 || volatility === 0) return 0;

    const meanDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const annualizedReturn = meanDailyReturn * 252; // Annualize

    return annualizedReturn / volatility;
  }

  /**
   * Calculate Sortino Ratio
   * Like Sharpe, but only penalizes downside volatility
   */
  private static calculateSortinoRatio(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;

    const meanDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

    // Calculate downside deviation (only negative returns)
    const downsideReturns = dailyReturns.filter((r) => r < 0);
    if (downsideReturns.length === 0) return 0;

    const downsideVariance =
      downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);

    // Annualize
    const annualizedReturn = meanDailyReturn * 252;
    const annualizedDownsideDev = downsideDeviation * Math.sqrt(252);

    return annualizedDownsideDev > 0 ? annualizedReturn / annualizedDownsideDev : 0;
  }

  /**
   * Calculate drawdowns for equity curve
   */
  static calculateDrawdowns(equityCurve: EquityCurvePoint[]): DrawdownPoint[] {
    const drawdowns: DrawdownPoint[] = [];
    let peak = equityCurve[0]?.equity ?? 0;
    let peakDate = equityCurve[0]?.date ?? new Date();

    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
        peakDate = point.date;
      }

      const drawdown = peak > 0 ? ((point.equity - peak) / peak) * 100 : 0;
      const durationMs = point.date.getTime() - peakDate.getTime();
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

      drawdowns.push({
        date: point.date,
        equity: point.equity,
        peak,
        drawdown,
        drawdownDuration: durationDays,
      });
    }

    return drawdowns;
  }

  /**
   * Get maximum drawdown percentage
   */
  private static getMaxDrawdown(drawdowns: DrawdownPoint[]): number {
    if (drawdowns.length === 0) return 0;
    return Math.min(...drawdowns.map((d) => d.drawdown));
  }

  /**
   * Get maximum drawdown duration in days
   */
  private static getMaxDrawdownDuration(drawdowns: DrawdownPoint[]): number {
    if (drawdowns.length === 0) return 0;
    return Math.max(...drawdowns.map((d) => d.drawdownDuration));
  }

  /**
   * Calculate consecutive win/loss streaks
   */
  private static calculateStreaks(trades: Trade[]): {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
  } {
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const trade of trades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else if (trade.pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      }
    }

    return { maxConsecutiveWins, maxConsecutiveLosses };
  }

  /**
   * Calculate trading days between two dates
   */
  private static calculateTradingDays(startDate: Date, endDate: Date): number {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Approximate: 252 trading days / 365 calendar days
    return Math.floor(diffDays * (252 / 365));
  }

  /**
   * Get empty metrics (for zero trades)
   */
  private static getEmptyMetrics(startDate: Date, endDate: Date): PerformanceMetrics {
    return {
      totalReturn: 0,
      totalReturnDollar: 0,
      cagr: 0,
      volatility: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
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
      startDate,
      endDate,
      tradingDays: 0,
      totalCommissions: 0,
      totalSlippage: 0,
      totalCosts: 0,
    };
  }
}
