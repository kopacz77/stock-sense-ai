/**
 * Strategy Adapter for Paper Trading
 * Converts Strategy interface from StrategyRegistry to BacktestStrategy interface
 * required by the Paper Trading Engine
 */

import type { Strategy } from "../../strategies/strategy-registry.js";
import type {
  BacktestStrategy,
  HistoricalDataPoint,
  Bar,
  Fill,
} from "../../backtesting/types/backtest-types.js";
import type { Signal, HistoricalData } from "../../types/trading.js";

/**
 * Adapts a Strategy from StrategyRegistry to the BacktestStrategy interface
 * used by the Paper Trading Engine and Backtest Engine
 */
export class StrategyAdapter implements BacktestStrategy {
  public readonly name: string;

  constructor(
    private strategy: Strategy,
    strategyName: string
  ) {
    this.name = strategyName;
  }

  /**
   * Get the strategy name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Generate a trading signal based on current and historical data
   */
  async generateSignal(
    symbol: string,
    _currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    // Convert HistoricalDataPoint[] to HistoricalData[] for strategy
    const convertedData = this.convertToHistoricalData(historicalData);
    return this.strategy.analyze(symbol, convertedData);
  }

  /**
   * Called on each new bar of data
   * Returns a signal if action is needed, null otherwise
   */
  async onBar(
    symbol: string,
    _bar: Bar,
    historicalData: Bar[]
  ): Promise<Signal | null> {
    // Convert to HistoricalData format expected by strategies
    const convertedData = this.convertToHistoricalData(historicalData);
    const signal = await this.strategy.analyze(symbol, convertedData);

    // Only return signal if action is BUY or SELL
    return signal.action === "HOLD" ? null : signal;
  }

  /**
   * Called when an order fill occurs (optional)
   */
  async onFill(_fill: Fill): Promise<void> {
    // No specific action needed on fill for these strategies
  }

  /**
   * Initialize the strategy (optional)
   */
  async initialize(): Promise<void> {
    // No initialization needed for these strategies
  }

  /**
   * Cleanup the strategy (optional)
   */
  async cleanup(): Promise<void> {
    // No cleanup needed for these strategies
  }

  /**
   * Finalize the strategy at end of backtest/trading session (optional)
   */
  async finalize(): Promise<void> {
    // No finalization needed for these strategies
  }

  /**
   * Convert HistoricalDataPoint array to HistoricalData array
   * Handles the format difference between backtesting and strategy interfaces
   */
  private convertToHistoricalData(
    dataPoints: HistoricalDataPoint[]
  ): HistoricalData[] {
    return dataPoints.map((point) => ({
      date: point.timestamp.toISOString().split("T")[0] ?? "",
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }));
  }
}
