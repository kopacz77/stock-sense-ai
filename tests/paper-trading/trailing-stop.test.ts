/**
 * Trailing Stop Order Tests
 * Tests the trailing stop implementation for proper peak price tracking
 * and trigger logic based on price retreat from peak.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OrderManager } from "../../src/paper-trading/orders/order-manager.js";
import type { MarketDataUpdate } from "../../src/paper-trading/types/paper-trading-types.js";

describe("Trailing Stop Orders", () => {
  let orderManager: OrderManager;

  beforeEach(() => {
    orderManager = new OrderManager();
  });

  /**
   * Helper to create market data update
   */
  function createMarketData(
    symbol: string,
    price: number,
    high?: number,
    low?: number
  ): MarketDataUpdate {
    return {
      symbol,
      timestamp: new Date(),
      price,
      high: high ?? price,
      low: low ?? price,
      open: price,
      volume: 1000,
      previousClose: price,
    };
  }

  describe("Scenario 1: Long position with 5% trailing stop", () => {
    /**
     * Entry: $100, Peak: $100, Stop: $95
     * Price rises to $110: Peak: $110, Stop: $104.50
     * Price drops to $106: Peak: $110, Stop: $104.50 (unchanged)
     * Price drops to $104: TRIGGER
     */
    it("should track peak price and trigger on retreat from peak", () => {
      // Create trailing stop order with currentPrice for initialization
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Verify initial state: peak $100, stop $95
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95); // 100 * (1 - 0.05) = 95

      // Price rises to $110: peak should update to $110, stop to $104.50
      orderManager.updateTrailingStop(order.id, 110, 100);
      expect(order.peakPrice).toBe(110);
      expect(order.stopPrice).toBe(104.5); // 110 * (1 - 0.05) = 104.5

      // Price drops to $106: peak stays $110, stop stays $104.50
      orderManager.updateTrailingStop(order.id, 106, 104);
      expect(order.peakPrice).toBe(110); // Unchanged
      expect(order.stopPrice).toBe(104.5); // Unchanged

      // Check: at $106, should NOT trigger (price > stopPrice)
      const marketDataAt106 = createMarketData("AAPL", 106);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt106)).toBe(false);

      // Check: at $104.50, should TRIGGER (price <= stopPrice)
      const marketDataAt104_5 = createMarketData("AAPL", 104.5);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt104_5)).toBe(true);

      // Check: at $104, should also TRIGGER
      const marketDataAt104 = createMarketData("AAPL", 104);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt104)).toBe(true);
    });
  });

  describe("Scenario 2: Price never favorable - immediate trigger", () => {
    /**
     * Entry: $100, Peak: $100, Stop: $95
     * Price drops immediately to $95: TRIGGER
     */
    it("should trigger if price drops immediately without rising", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Initial state
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95);

      // Price drops to $95 without any upward movement
      const marketDataAt95 = createMarketData("AAPL", 95);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt95)).toBe(true);
    });

    it("should not trigger if price drops less than trailing percent", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Price drops to $96 (4% drop, less than 5% trailing)
      const marketDataAt96 = createMarketData("AAPL", 96);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt96)).toBe(false);
    });
  });

  describe("Scenario 3: Short position with $5 trailing stop", () => {
    /**
     * Entry: $100, Trough: $100, Stop: $105
     * Price drops to $90: Trough: $90, Stop: $95
     * Price rises to $92: Trough: $90, Stop: $95 (unchanged)
     * Price rises to $95: TRIGGER
     */
    it("should track trough price and trigger on rise from trough", () => {
      // Create BUY trailing stop (protecting short position)
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "BUY",
        quantity: 100,
        trailingAmount: 5,
        currentPrice: 100,
      });

      // Initial state: trough $100, stop $105
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(105); // 100 + 5 = 105

      // Price drops to $90: trough should update to $90, stop to $95
      orderManager.updateTrailingStop(order.id, 100, 90);
      expect(order.peakPrice).toBe(90);
      expect(order.stopPrice).toBe(95); // 90 + 5 = 95

      // Price rises to $92: trough stays $90, stop stays $95
      orderManager.updateTrailingStop(order.id, 92, 91);
      expect(order.peakPrice).toBe(90); // Unchanged
      expect(order.stopPrice).toBe(95); // Unchanged

      // Check: at $92, should NOT trigger (price < stopPrice)
      const marketDataAt92 = createMarketData("AAPL", 92);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt92)).toBe(false);

      // Check: at $95, should TRIGGER (price >= stopPrice)
      const marketDataAt95 = createMarketData("AAPL", 95);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt95)).toBe(true);
    });
  });

  describe("Fixed amount trailing stops", () => {
    it("should work with fixed dollar amount for SELL orders", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingAmount: 10,
        currentPrice: 100,
      });

      // Initial: peak $100, stop $90
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(90);

      // Price rises to $120: stop should adjust to $110
      orderManager.updateTrailingStop(order.id, 120, 100);
      expect(order.peakPrice).toBe(120);
      expect(order.stopPrice).toBe(110);

      // Price drops to $115: stop unchanged at $110
      orderManager.updateTrailingStop(order.id, 115, 112);
      expect(order.stopPrice).toBe(110);

      // Check trigger at $110
      const marketDataAt110 = createMarketData("AAPL", 110);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt110)).toBe(true);
    });
  });

  describe("Percentage-based trailing stops", () => {
    it("should work with percentage for BUY orders (short protection)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "BUY",
        quantity: 100,
        trailingPercent: 10,
        currentPrice: 100,
      });

      // Initial: trough $100, stop $110
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBeCloseTo(110, 10); // 100 * 1.10 = 110

      // Price drops to $80: trough updates, stop moves to $88
      orderManager.updateTrailingStop(order.id, 90, 80);
      expect(order.peakPrice).toBe(80);
      expect(order.stopPrice).toBeCloseTo(88, 10); // 80 * 1.10 = 88

      // Check trigger at $88
      const marketDataAt88 = createMarketData("AAPL", 88);
      expect(orderManager.shouldExecuteOrder(order, marketDataAt88)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle order without currentPrice initialization", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        // No currentPrice provided
      });

      // peakPrice should be undefined initially
      expect(order.peakPrice).toBeUndefined();
      expect(order.stopPrice).toBeUndefined();

      // First update sets the peak
      orderManager.updateTrailingStop(order.id, 100, 95);
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95);
    });

    it("should not update for non-trailing-stop orders", () => {
      const limitOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 90,
      });

      // This should do nothing for LIMIT orders
      orderManager.updateTrailingStop(limitOrder.id, 110, 85);
      expect(limitOrder.peakPrice).toBeUndefined();
    });

    it("should handle multiple price updates correctly", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Simulate price movements over time
      const priceSequence = [
        { high: 102, low: 99 },   // Up: peak -> 102
        { high: 105, low: 101 },  // Up: peak -> 105
        { high: 103, low: 100 },  // Down: peak stays 105
        { high: 108, low: 102 },  // Up: peak -> 108
        { high: 106, low: 103 },  // Down: peak stays 108
      ];

      for (const { high, low } of priceSequence) {
        orderManager.updateTrailingStop(order.id, high, low);
      }

      expect(order.peakPrice).toBe(108);
      expect(order.stopPrice).toBe(102.6); // 108 * 0.95 = 102.6
    });
  });
});
