/**
 * Simple RSI Mean Reversion Strategy
 * Example strategy for backtesting demonstration
 */

import type {
  Bar,
  BacktestStrategy,
  PortfolioSnapshot,
  SignalEvent,
  Fill,
  BacktestConfig,
  BacktestResult,
} from "../types/backtest-types.js";

export class SimpleRSIStrategy implements BacktestStrategy {
  name = "SIMPLE_RSI_MEAN_REVERSION";

  private rsiPeriod: number;
  private oversoldThreshold: number;
  private overboughtThreshold: number;
  private rsiValues: number[] = [];

  constructor(config: {
    rsiPeriod?: number;
    oversoldThreshold?: number;
    overboughtThreshold?: number;
  } = {}) {
    this.rsiPeriod = config.rsiPeriod ?? 14;
    this.oversoldThreshold = config.oversoldThreshold ?? 30;
    this.overboughtThreshold = config.overboughtThreshold ?? 70;
  }

  initialize(config: BacktestConfig): void {
    console.log(`Initializing ${this.name} strategy`);
    console.log(`- RSI Period: ${this.rsiPeriod}`);
    console.log(`- Oversold: ${this.oversoldThreshold}`);
    console.log(`- Overbought: ${this.overboughtThreshold}`);
  }

  onBar(bar: Bar, portfolio: PortfolioSnapshot): SignalEvent | null {
    // Calculate RSI
    const rsi = this.calculateRSI(bar);

    if (rsi === null) {
      return null; // Not enough data yet
    }

    // Mean reversion logic
    const hasPosition = portfolio.positions.has(bar.symbol);

    // BUY signal: RSI oversold and no position
    if (rsi < this.oversoldThreshold && !hasPosition) {
      return {
        type: "SIGNAL",
        timestamp: bar.timestamp,
        priority: 2,
        symbol: bar.symbol,
        action: "BUY",
        strength: (this.oversoldThreshold - rsi) / this.oversoldThreshold * 100,
        strategyName: this.name,
        metadata: { rsi },
      };
    }

    // SELL signal: RSI overbought and have position
    if (rsi > this.overboughtThreshold && hasPosition) {
      return {
        type: "SIGNAL",
        timestamp: bar.timestamp,
        priority: 2,
        symbol: bar.symbol,
        action: "SELL",
        strength: (rsi - this.overboughtThreshold) / (100 - this.overboughtThreshold) * 100,
        strategyName: this.name,
        metadata: { rsi },
      };
    }

    return null;
  }

  onFill(fill: Fill): void {
    console.log(
      `Fill: ${fill.side} ${fill.quantity} shares of ${fill.symbol} at $${fill.price.toFixed(2)}`
    );
  }

  finalize(result: BacktestResult): void {
    console.log(`\n${this.name} - Backtest Complete`);
    console.log(`Total Return: ${result.metrics.totalReturn.toFixed(2)}%`);
    console.log(`Total Trades: ${result.metrics.totalTrades}`);
    console.log(`Win Rate: ${result.metrics.winRate.toFixed(2)}%`);
  }

  /**
   * Calculate RSI using Wilder's smoothing method
   */
  private calculateRSI(bar: Bar): number | null {
    // Store close price
    this.rsiValues.push(bar.close);

    // Need at least rsiPeriod + 1 values
    if (this.rsiValues.length < this.rsiPeriod + 1) {
      return null;
    }

    // Keep only last rsiPeriod + 1 values
    if (this.rsiValues.length > this.rsiPeriod + 1) {
      this.rsiValues.shift();
    }

    // Calculate gains and losses
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < this.rsiValues.length; i++) {
      const diff = (this.rsiValues[i] ?? 0) - (this.rsiValues[i - 1] ?? 0);
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? Math.abs(diff) : 0);
    }

    // Calculate average gain and average loss
    const avgGain = gains.reduce((sum, val) => sum + val, 0) / this.rsiPeriod;
    const avgLoss = losses.reduce((sum, val) => sum + val, 0) / this.rsiPeriod;

    if (avgLoss === 0) {
      return 100; // No losses = RSI 100
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  }
}
