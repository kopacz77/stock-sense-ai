/**
 * Simple RSI Mean Reversion Strategy
 * Example strategy for backtesting demonstration
 */

import type {
  Bar,
  BacktestStrategy,
  Fill,
  HistoricalDataPoint,
} from "../types/backtest-types.js";
import type { Signal } from "../../types/trading.js";

export class SimpleRSIStrategy implements BacktestStrategy {
  name = "SIMPLE_RSI_MEAN_REVERSION";

  private rsiPeriod: number;
  private oversoldThreshold: number;
  private overboughtThreshold: number;
  private rsiValues: Map<string, number[]> = new Map();
  private positions: Set<string> = new Set();

  constructor(config: {
    rsiPeriod?: number;
    oversoldThreshold?: number;
    overboughtThreshold?: number;
  } = {}) {
    this.rsiPeriod = config.rsiPeriod ?? 14;
    this.oversoldThreshold = config.oversoldThreshold ?? 30;
    this.overboughtThreshold = config.overboughtThreshold ?? 70;
  }

  getName(): string {
    return this.name;
  }

  async initialize(): Promise<void> {
    console.log(`Initializing ${this.name} strategy`);
    console.log(`- RSI Period: ${this.rsiPeriod}`);
    console.log(`- Oversold: ${this.oversoldThreshold}`);
    console.log(`- Overbought: ${this.overboughtThreshold}`);
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    // Default HOLD signal
    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.name,
      indicators: {} as any,
      confidence: 0,
      reasons: [],
      timestamp: new Date(),
    };
  }

  async onBar(symbol: string, bar: Bar, historicalData: Bar[]): Promise<Signal | null> {
    // Calculate RSI
    const rsi = this.calculateRSI(symbol, bar);

    if (rsi === null) {
      return null; // Not enough data yet
    }

    // Mean reversion logic
    const hasPosition = this.positions.has(symbol);

    // BUY signal: RSI oversold and no position
    if (rsi < this.oversoldThreshold && !hasPosition) {
      return {
        symbol,
        action: "BUY",
        strength: (this.oversoldThreshold - rsi) / this.oversoldThreshold * 100,
        strategy: this.name,
        indicators: { rsi } as any,
        confidence: (this.oversoldThreshold - rsi) / this.oversoldThreshold * 100,
        reasons: [`RSI oversold at ${rsi.toFixed(2)}`],
        timestamp: bar.timestamp,
      };
    }

    // SELL signal: RSI overbought and have position
    if (rsi > this.overboughtThreshold && hasPosition) {
      return {
        symbol,
        action: "SELL",
        strength: (rsi - this.overboughtThreshold) / (100 - this.overboughtThreshold) * 100,
        strategy: this.name,
        indicators: { rsi } as any,
        confidence: (rsi - this.overboughtThreshold) / (100 - this.overboughtThreshold) * 100,
        reasons: [`RSI overbought at ${rsi.toFixed(2)}`],
        timestamp: bar.timestamp,
      };
    }

    return null;
  }

  async onFill(fill: Fill): Promise<void> {
    console.log(
      `Fill: ${fill.side} ${fill.quantity} shares of ${fill.symbol} at $${fill.price.toFixed(2)}`
    );

    // Track positions
    if (fill.side === "BUY") {
      this.positions.add(fill.symbol);
    } else if (fill.side === "SELL") {
      this.positions.delete(fill.symbol);
    }
  }

  async finalize(): Promise<void> {
    console.log(`\n${this.name} - Backtest Complete`);
  }

  /**
   * Calculate RSI using Wilder's smoothing method
   */
  private calculateRSI(symbol: string, bar: Bar): number | null {
    // Get or create RSI values array for this symbol
    if (!this.rsiValues.has(symbol)) {
      this.rsiValues.set(symbol, []);
    }

    const values = this.rsiValues.get(symbol)!;

    // Store close price
    values.push(bar.close);

    // Need at least rsiPeriod + 1 values
    if (values.length < this.rsiPeriod + 1) {
      return null;
    }

    // Keep only last rsiPeriod + 1 values
    if (values.length > this.rsiPeriod + 1) {
      values.shift();
    }

    // Calculate gains and losses
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < values.length; i++) {
      const diff = (values[i] ?? 0) - (values[i - 1] ?? 0);
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
