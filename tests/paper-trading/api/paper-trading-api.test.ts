/**
 * Paper Trading API Tests
 * Tests for strategy loading and API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PaperTradingAPI } from "../../../src/paper-trading/api/paper-trading-api.js";
import { PaperTradingEngine } from "../../../src/paper-trading/engine/paper-trading-engine.js";
import { StrategyRegistry, getStrategy } from "../../../src/strategies/strategy-registry.js";
import { StrategyAdapter } from "../../../src/paper-trading/adapters/strategy-adapter.js";
import type { PaperTradingConfig } from "../../../src/paper-trading/types/paper-trading-types.js";
import type { BacktestStrategy, HistoricalDataPoint } from "../../../src/backtesting/types/backtest-types.js";

describe("StrategyAdapter", () => {
  it("should implement BacktestStrategy interface", () => {
    const strategy = getStrategy("mean-reversion");
    const adapter = new StrategyAdapter(strategy, "mean-reversion");

    expect(typeof adapter.getName).toBe("function");
    expect(typeof adapter.generateSignal).toBe("function");
    expect(typeof adapter.onBar).toBe("function");
    expect(typeof adapter.initialize).toBe("function");
    expect(typeof adapter.cleanup).toBe("function");
  });

  it("should return correct strategy name", () => {
    const strategy = getStrategy("momentum");
    const adapter = new StrategyAdapter(strategy, "momentum");

    expect(adapter.getName()).toBe("momentum");
    expect(adapter.name).toBe("momentum");
  });

  it("should generate signal from historical data", async () => {
    const strategy = getStrategy("mean-reversion");
    const adapter = new StrategyAdapter(strategy, "mean-reversion");

    // Create mock historical data with proper date formatting
    const baseDate = new Date("2024-01-01");
    const historicalData: HistoricalDataPoint[] = Array.from({ length: 50 }, (_, i) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      return {
        symbol: "AAPL",
        timestamp: date,
        open: 150 + Math.random() * 10,
        high: 155 + Math.random() * 10,
        low: 145 + Math.random() * 10,
        close: 150 + Math.random() * 10,
        volume: 1000000 + Math.random() * 500000,
      };
    });

    const currentData = historicalData[historicalData.length - 1]!;

    const signal = await adapter.generateSignal("AAPL", currentData, historicalData);

    expect(signal).toBeDefined();
    expect(signal.symbol).toBe("AAPL");
    expect(["BUY", "SELL", "HOLD"]).toContain(signal.action);
    expect(signal.strategy).toBeDefined();
  });

  it("should return null from onBar for HOLD signals", async () => {
    const strategy = getStrategy("mean-reversion");
    const adapter = new StrategyAdapter(strategy, "mean-reversion");

    // Create mock data that likely results in HOLD (normal price range)
    const baseDate = new Date("2024-01-01");
    const historicalData: HistoricalDataPoint[] = Array.from({ length: 50 }, (_, i) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      return {
        symbol: "AAPL",
        timestamp: date,
        open: 150,
        high: 151,
        low: 149,
        close: 150,
        volume: 1000000,
      };
    });

    const bar = historicalData[historicalData.length - 1]!;

    // Note: onBar may return Signal or null
    const result = await adapter.onBar("AAPL", bar, historicalData);

    // Either returns null (HOLD) or a Signal with BUY/SELL
    if (result !== null) {
      expect(["BUY", "SELL"]).toContain(result.action);
    }
  });

  it("should call initialize and cleanup without errors", async () => {
    const strategy = getStrategy("mean-reversion");
    const adapter = new StrategyAdapter(strategy, "mean-reversion");

    await expect(adapter.initialize()).resolves.toBeUndefined();
    await expect(adapter.cleanup()).resolves.toBeUndefined();
  });
});

describe("StrategyRegistry Integration", () => {
  it("should list available strategies", () => {
    const registry = StrategyRegistry.getInstance();
    const strategies = registry.listStrategies();

    expect(strategies).toContain("mean-reversion");
    expect(strategies).toContain("momentum");
  });

  it("should check if strategy exists", () => {
    const registry = StrategyRegistry.getInstance();

    expect(registry.hasStrategy("mean-reversion")).toBe(true);
    expect(registry.hasStrategy("momentum")).toBe(true);
    expect(registry.hasStrategy("invalid-strategy")).toBe(false);
  });

  it("should get strategy info with descriptions", () => {
    const registry = StrategyRegistry.getInstance();
    const allInfo = registry.getAllStrategyInfo();

    expect(allInfo.length).toBeGreaterThan(0);

    const meanReversion = allInfo.find((s) => s.name === "mean-reversion");
    expect(meanReversion).toBeDefined();
    expect(meanReversion?.description).toBeDefined();
    expect(meanReversion?.defaultParams).toBeDefined();
  });

  it("should create strategy with custom params", () => {
    const customParams = { rsiOversold: 25, rsiOverbought: 75 };
    const strategy = getStrategy("mean-reversion", customParams);

    expect(strategy).toBeDefined();
    // Strategy returns its internal name (MEAN_REVERSION) not the registry key
    expect(strategy.getName()).toBeDefined();
  });

  it("should throw error for unknown strategy", () => {
    expect(() => getStrategy("unknown-strategy")).toThrow();
  });
});

describe("Strategy to BacktestStrategy Adapter Flow", () => {
  it("should create adapter from registry strategy", () => {
    const strategyName = "mean-reversion";
    const strategy = getStrategy(strategyName);
    const adapter = new StrategyAdapter(strategy, strategyName);

    expect(adapter).toBeInstanceOf(StrategyAdapter);
    expect(adapter.getName()).toBe(strategyName);
  });

  it("should work with momentum strategy", () => {
    const strategyName = "momentum";
    const strategy = getStrategy(strategyName);
    const adapter = new StrategyAdapter(strategy, strategyName);

    expect(adapter).toBeInstanceOf(StrategyAdapter);
    expect(adapter.getName()).toBe(strategyName);
  });

  it("should satisfy BacktestStrategy type requirements", () => {
    const strategy = getStrategy("mean-reversion");
    const adapter: BacktestStrategy = new StrategyAdapter(strategy, "mean-reversion");

    // Type check - these should all be valid on BacktestStrategy
    expect(adapter.getName()).toBe("mean-reversion");
    expect(adapter.generateSignal).toBeDefined();
    expect(adapter.onBar).toBeDefined();
    expect(adapter.initialize).toBeDefined();
    expect(adapter.cleanup).toBeDefined();
  });
});
