/**
 * Strategy executor for backtesting
 * Manages strategy execution and signal generation
 */

import type {
  BacktestStrategy,
  HistoricalDataPoint,
  MarketDataEvent,
  SignalEvent,
} from "../types/backtest-types.js";
import type { Signal } from "../../types/trading.js";

/**
 * Executes trading strategies and generates signals during backtesting
 */
export class StrategyExecutor {
  private strategy: BacktestStrategy;
  private historicalDataCache: Map<string, HistoricalDataPoint[]>;

  /**
   * Create a new strategy executor
   * @param strategy The strategy to execute
   */
  constructor(strategy: BacktestStrategy) {
    this.strategy = strategy;
    this.historicalDataCache = new Map();
  }

  /**
   * Initialize the strategy
   */
  async initialize(): Promise<void> {
    if (this.strategy.initialize) {
      await this.strategy.initialize();
    }
  }

  /**
   * Process a market data event and generate signals if applicable
   * @param event Market data event
   * @returns Signal event if a signal was generated, undefined otherwise
   */
  async processMarketData(event: MarketDataEvent): Promise<SignalEvent | undefined> {
    const { data } = event;

    // Update historical data cache
    this.updateHistoricalCache(data);

    // Get historical data for this symbol
    const historicalData = this.getHistoricalData(data.symbol);

    // Generate signal from strategy
    const signal = await this.strategy.generateSignal(data.symbol, data, historicalData);

    // Only create signal event if action is not HOLD
    if (signal.action === "HOLD") {
      return undefined;
    }

    // Create signal event
    const signalEvent: SignalEvent = {
      type: "SIGNAL",
      timestamp: data.timestamp,
      priority: 2, // Signals have priority 2 (after market data)
      signal,
    };

    return signalEvent;
  }

  /**
   * Update the historical data cache with new data
   * @param data New data point
   */
  private updateHistoricalCache(data: HistoricalDataPoint): void {
    const existing = this.historicalDataCache.get(data.symbol) || [];
    existing.push(data);
    this.historicalDataCache.set(data.symbol, existing);
  }

  /**
   * Get historical data for a symbol
   * @param symbol Trading symbol
   * @returns Array of historical data points
   */
  private getHistoricalData(symbol: string): HistoricalDataPoint[] {
    return this.historicalDataCache.get(symbol) || [];
  }

  /**
   * Clear the historical data cache
   */
  clearCache(): void {
    this.historicalDataCache.clear();
  }

  /**
   * Get the strategy name
   * @returns Strategy name
   */
  getStrategyName(): string {
    return this.strategy.getName();
  }

  /**
   * Cleanup strategy resources
   */
  async cleanup(): Promise<void> {
    if (this.strategy.cleanup) {
      await this.strategy.cleanup();
    }
    this.clearCache();
  }
}
