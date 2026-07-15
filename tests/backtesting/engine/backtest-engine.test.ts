/**
 * Backtest Engine Tests
 * Tests for the core backtesting engine
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BacktestEngine } from "../../../src/backtesting/engine/backtest-engine.js";
import { NoSlippageModel } from "../../../src/backtesting/execution/slippage-models.js";
import { ZeroCommissionModel } from "../../../src/backtesting/execution/commission-models.js";
import type {
  BacktestConfig,
  BacktestStrategy,
  DataProvider,
  HistoricalDataPoint,
  Signal,
} from "../../../src/backtesting/types/backtest-types.js";
import type { TechnicalIndicatorResults } from "../../../src/analysis/technical-indicators.js";

/**
 * Minimal in-memory DataProvider test double.
 *
 * NOTE: The engine requires an object matching the `DataProvider` interface —
 * `loadData(symbol, startDate, endDate)` + `hasData(symbol, startDate, endDate)`.
 * Neither `HistoricalDataManager` nor `MemoryDataLoader` implement that shape,
 * which is why the previous version of this test queued zero bars and produced
 * an empty equity curve.
 */
class InMemoryDataProvider implements DataProvider {
  private store = new Map<string, HistoricalDataPoint[]>();

  addData(symbol: string, data: HistoricalDataPoint[]): void {
    this.store.set(symbol, data);
  }

  async loadData(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalDataPoint[]> {
    const data = this.store.get(symbol) ?? [];
    return data.filter(
      (p) => p.timestamp >= startDate && p.timestamp <= endDate,
    );
  }

  async hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean> {
    const data = await this.loadData(symbol, startDate, endDate);
    return data.length > 0;
  }
}

const POSITION_SIZE = 10;

/**
 * Simple deterministic strategy: buy below 100, sell above 110, otherwise hold.
 * Emits `positionSize` so the engine actually sizes the order (it reads
 * `signal.positionSize` when converting a signal into an order).
 */
class SimpleTestStrategy implements BacktestStrategy {
  private readonly name = "SIMPLE_TEST";

  getName(): string {
    return this.name;
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
  ): Promise<Signal> {
    const action: Signal["action"] =
      currentData.close < 100 ? "BUY" : currentData.close > 110 ? "SELL" : "HOLD";

    return {
      symbol,
      action,
      strength: 50,
      strategy: this.name,
      indicators: {} as TechnicalIndicatorResults,
      confidence: 50,
      reasons: [`Price is ${currentData.close}`],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close,
      positionSize: POSITION_SIZE,
    };
  }
}

describe("BacktestEngine", () => {
  let config: BacktestConfig;
  let strategy: BacktestStrategy;
  let dataProvider: InMemoryDataProvider;

  beforeEach(() => {
    // Three bars: close 98 (BUY) -> 101 (HOLD) -> 112 (SELL)
    const testData: HistoricalDataPoint[] = [
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-01"),
        open: 100,
        high: 105,
        low: 95,
        close: 98,
        volume: 1_000_000,
      },
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-02"),
        open: 98,
        high: 102,
        low: 96,
        close: 101,
        volume: 1_100_000,
      },
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-03"),
        open: 101,
        high: 115,
        low: 100,
        close: 112,
        volume: 1_200_000,
      },
    ];

    dataProvider = new InMemoryDataProvider();
    dataProvider.addData("TEST", testData);

    strategy = new SimpleTestStrategy();

    config = {
      id: "test-backtest-1",
      name: "Test Backtest",
      symbols: ["TEST"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-03"),
      initialCapital: 10_000,
      strategy: {
        name: "SIMPLE_TEST",
        parameters: {},
      },
      commission: {
        type: "FIXED",
        fixedFee: 0,
      },
      slippage: {
        type: "FIXED",
        fixedAmount: 0,
      },
      // The engine reads the *model instances* (config.slippageModel /
      // config.commissionModel), not the plain commission/slippage config
      // objects above. Zero-cost models keep the trade math exact.
      slippageModel: new NoSlippageModel(),
      commissionModel: new ZeroCommissionModel(),
      fillOnClose: true,
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

    // Result structure
    expect(result).toBeDefined();
    expect(result.config).toEqual(config);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

    // One equity-curve point is recorded per processed bar (3 bars in, 3 out).
    expect(result.equityCurve).toBeInstanceOf(Array);
    expect(result.equityCurve).toHaveLength(3);

    // Metrics reflect the executed trades.
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalTrades).toBe(1);

    // Trades: strategy buys at 98 and sells at 112 -> one profitable round trip.
    expect(result.trades).toBeInstanceOf(Array);
    expect(result.trades).toHaveLength(1);

    const [trade] = result.trades;
    expect(trade.symbol).toBe("TEST");
    expect(trade.quantity).toBe(POSITION_SIZE);
    expect(trade.entryPrice).toBeCloseTo(98, 6);
    expect(trade.exitPrice).toBeCloseTo(112, 6);
    // (112 - 98) * 10 = 140, zero commission/slippage.
    expect(trade.pnl).toBeCloseTo(140, 6);

    // Final equity = 10_000 + 140.
    const finalEquity = result.equityCurve[result.equityCurve.length - 1]?.equity;
    expect(finalEquity).toBeCloseTo(10_140, 6);

    expect(result.portfolioSnapshots).toBeInstanceOf(Array);
  });

  it("should calculate metrics correctly", async () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);
    const result = await engine.run();

    const { metrics } = result;

    expect(typeof metrics.totalReturn).toBe("number");
    expect(typeof metrics.sharpeRatio).toBe("number");
    expect(typeof metrics.maxDrawdown).toBe("number");
    expect(typeof metrics.winRate).toBe("number");

    // Win rate is expressed as a percentage.
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.winRate).toBeLessThanOrEqual(100);

    // The single trade is a winner, so win rate is 100% and return is positive.
    expect(metrics.winRate).toBe(100);
    expect(metrics.totalReturn).toBeGreaterThan(0);
  });

  it("should handle empty data gracefully", async () => {
    const emptyProvider = new InMemoryDataProvider();

    const engine = new BacktestEngine(config, strategy, emptyProvider);

    const result = await engine.run();

    // No data -> no events processed, no trades, empty equity curve, but a
    // valid (warning-annotated) result rather than a throw.
    expect(result).toBeDefined();
    expect(result.equityCurve).toHaveLength(0);
    expect(result.trades).toHaveLength(0);
    expect(result.errors.some((e) => e.severity === "WARNING")).toBe(true);
  });

  it("should stop when requested", async () => {
    const engine = new BacktestEngine(config, strategy, dataProvider);

    // Start the backtest, then request a stop before the event loop runs.
    const resultPromise = engine.run();
    engine.stop();

    const result = await resultPromise;

    // Stopping short-circuits the event loop, so nothing is processed.
    expect(result).toBeDefined();
    expect(result.equityCurve).toHaveLength(0);
    expect(result.trades).toHaveLength(0);
  });
});
