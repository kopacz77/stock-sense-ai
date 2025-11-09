/**
 * Backtest Engine Tests
 * Tests for the core backtesting engine
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BacktestEngine } from "../../../src/backtesting/engine/backtest-engine.js";
import { MemoryDataLoader } from "../../../src/backtesting/data/data-loader.js";
import { HistoricalDataManager } from "../../../src/backtesting/data/historical-data-manager.js";
import type {
  BacktestConfig,
  BacktestStrategy,
  HistoricalDataPoint,
  Signal,
} from "../../../src/backtesting/types/backtest-types.js";

/**
 * Simple test strategy that generates buy/sell signals based on price
 */
class SimpleTestStrategy implements BacktestStrategy {
  private name = "SIMPLE_TEST";

  getName(): string {
    return this.name;
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[],
  ): Promise<Signal> {
    // Simple strategy: buy if price < 100, sell if price > 110
    const action = currentData.close < 100 ? "BUY" : currentData.close > 110 ? "SELL" : "HOLD";

    return {
      symbol,
      action,
      strength: 50,
      strategy: this.name,
      indicators: {} as never,
      confidence: 50,
      reasons: [`Price is ${currentData.close}`],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close,
    };
  }
}

describe("BacktestEngine", () => {
  let config: BacktestConfig;
  let strategy: BacktestStrategy;
  let dataProvider: HistoricalDataManager;
  let memoryLoader: MemoryDataLoader;

  beforeEach(() => {
    // Create test data
    const testData: HistoricalDataPoint[] = [
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-01"),
        open: 100,
        high: 105,
        low: 95,
        close: 98,
        volume: 1000000,
      },
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-02"),
        open: 98,
        high: 102,
        low: 96,
        close: 101,
        volume: 1100000,
      },
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-03"),
        open: 101,
        high: 115,
        low: 100,
        close: 112,
        volume: 1200000,
      },
    ];

    // Set up in-memory data provider
    memoryLoader = new MemoryDataLoader();
    memoryLoader.addData("TEST", testData);
    dataProvider = new HistoricalDataManager(memoryLoader);

    // Create test strategy
    strategy = new SimpleTestStrategy();

    // Create test configuration
    config = {
      id: "test-backtest-1",
      name: "Test Backtest",
      symbols: ["TEST"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-03"),
      initialCapital: 10000,
      strategy: {
        name: "SIMPLE_TEST",
        parameters: {},
      },
      commission: {
        type: "FIXED",
        fixedFee: 1.0,
      },
      slippage: {
        type: "FIXED",
        fixedAmount: 0.01,
      },
    };
  });

  it("should create a backtest engine instance", () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);
    expect(engine).toBeDefined();
  });

  it("should have initial progress state", () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);
    const progress = engine.getProgress();

    expect(progress.isRunning).toBe(false);
    expect(progress.eventsRemaining).toBe(0);
  });

  it("should run a simple backtest", async () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);
    const result = await engine.run();

    // Check result structure
    expect(result).toBeDefined();
    expect(result.config).toEqual(config);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.executionTimeMs).toBeGreaterThan(0);

    // Check metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);

    // Check equity curve
    expect(result.equityCurve).toBeInstanceOf(Array);
    expect(result.equityCurve.length).toBeGreaterThan(0);

    // Check trades
    expect(result.trades).toBeInstanceOf(Array);

    // Check snapshots
    expect(result.portfolioSnapshots).toBeInstanceOf(Array);
  });

  it("should calculate metrics correctly", async () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);
    const result = await engine.run();

    const { metrics } = result;

    // Check metrics are numbers
    expect(typeof metrics.totalReturn).toBe("number");
    expect(typeof metrics.sharpeRatio).toBe("number");
    expect(typeof metrics.maxDrawdown).toBe("number");
    expect(typeof metrics.winRate).toBe("number");

    // Check win rate is a valid percentage
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.winRate).toBeLessThanOrEqual(100);
  });

  it("should handle empty data gracefully", async () => {
    const emptyLoader = new MemoryDataLoader();
    const emptyProvider = new HistoricalDataManager(emptyLoader);

    const engine = new BacktestEngine(config, strategy, emptyProvider);

    // Should not throw, but should log errors
    await expect(engine.run()).resolves.toBeDefined();
  });

  it("should stop when requested", async () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);

    // Start backtest in background
    const resultPromise = engine.run();

    // Stop immediately
    engine.stop();

    // Wait for completion
    const result = await resultPromise;

    expect(result).toBeDefined();
  });
});
