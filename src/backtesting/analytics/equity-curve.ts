/**
 * Equity Curve Builder
 * Constructs equity curve data from portfolio snapshots
 */

import type { EquityCurvePoint, PortfolioSnapshot } from "../types/backtest-types.js";

/**
 * Builds and analyzes equity curve
 */
export class EquityCurveBuilder {
  private initialCapital: number;

  /**
   * Create a new equity curve builder
   * @param initialCapital Initial capital amount
   */
  constructor(initialCapital: number) {
    this.initialCapital = initialCapital;
  }

  /**
   * Build equity curve from portfolio snapshots
   * @param snapshots Array of portfolio snapshots
   * @returns Array of equity curve points
   */
  build(snapshots: PortfolioSnapshot[]): EquityCurvePoint[] {
    if (snapshots.length === 0) {
      return [];
    }

    const curve: EquityCurvePoint[] = [];
    let previousEquity = this.initialCapital;
    let peakEquity = this.initialCapital;

    for (const snapshot of snapshots) {
      const equity = snapshot.totalValue;
      const dailyReturn = (equity - previousEquity) / previousEquity;
      const cumulativeReturn = (equity - this.initialCapital) / this.initialCapital;

      // Update peak for drawdown calculation
      if (equity > peakEquity) {
        peakEquity = equity;
      }

      const drawdown = (peakEquity - equity) / peakEquity;

      const point: EquityCurvePoint = {
        timestamp: snapshot.timestamp,
        equity,
        cash: snapshot.cash,
        positionsValue: snapshot.positionsValue ?? 0,
        cumulativeReturn,
        dailyReturn,
        drawdown,
      };

      curve.push(point);
      previousEquity = equity;
    }

    return curve;
  }

  /**
   * Calculate maximum drawdown from equity curve
   * @param curve Equity curve
   * @returns Maximum drawdown (as decimal, e.g., 0.15 = 15%)
   */
  calculateMaxDrawdown(curve: EquityCurvePoint[]): number {
    if (curve.length === 0) return 0;

    let maxDrawdown = 0;
    for (const point of curve) {
      if (point.drawdown > maxDrawdown) {
        maxDrawdown = point.drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate maximum drawdown duration
   * @param curve Equity curve
   * @returns Duration in days
   */
  calculateMaxDrawdownDuration(curve: EquityCurvePoint[]): number {
    if (curve.length === 0) return 0;

    let maxDuration = 0;
    let currentDuration = 0;
    let inDrawdown = false;

    for (const point of curve) {
      if (point.drawdown > 0) {
        if (!inDrawdown) {
          inDrawdown = true;
          currentDuration = 1;
        } else {
          currentDuration++;
        }
      } else {
        if (inDrawdown) {
          maxDuration = Math.max(maxDuration, currentDuration);
          inDrawdown = false;
          currentDuration = 0;
        }
      }
    }

    // Check if still in drawdown at end
    if (inDrawdown) {
      maxDuration = Math.max(maxDuration, currentDuration);
    }

    return maxDuration;
  }

  /**
   * Get volatility from equity curve
   * @param curve Equity curve
   * @returns Annualized volatility
   */
  calculateVolatility(curve: EquityCurvePoint[]): number {
    if (curve.length < 2) return 0;

    const returns = curve.map((p) => p.dailyReturn);

    // Calculate standard deviation
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const dailyStdDev = Math.sqrt(variance);

    // Annualize (assuming 252 trading days)
    return dailyStdDev * Math.sqrt(252);
  }

  /**
   * Get total return from equity curve
   * @param curve Equity curve
   * @returns Total return (decimal)
   */
  getTotalReturn(curve: EquityCurvePoint[]): number {
    if (curve.length === 0) return 0;
    const lastPoint = curve[curve.length - 1];
    return lastPoint?.cumulativeReturn ?? 0;
  }
}
