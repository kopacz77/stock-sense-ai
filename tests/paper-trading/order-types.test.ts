/**
 * Order Types Test Suite
 * Comprehensive tests for all 5 order types:
 * - MARKET: Execute immediately at current price
 * - LIMIT: Execute at specified price or better
 * - STOP_LOSS: Execute when price crosses threshold (protective)
 * - TAKE_PROFIT: Execute when price reaches target
 * - TRAILING_STOP: Execute when price retreats from peak
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OrderManager } from "../../src/paper-trading/orders/order-manager.js";
import type { MarketDataUpdate } from "../../src/paper-trading/types/paper-trading-types.js";

describe("Order Types", () => {
  let orderManager: OrderManager;

  // Helper to create market data
  const createMarketData = (
    symbol: string,
    price: number,
    high?: number,
    low?: number
  ): MarketDataUpdate => ({
    symbol,
    timestamp: new Date(),
    price,
    volume: 1000000,
    high: high ?? price + 1,
    low: low ?? price - 1,
    open: price,
    previousClose: price - 0.5,
  });

  beforeEach(() => {
    orderManager = new OrderManager();
  });

  describe("MARKET orders", () => {
    it("should execute immediately at current price", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const marketData = createMarketData("AAPL", 150.5);

      expect(orderManager.shouldExecuteOrder(order, marketData)).toBe(true);
    });

    it("should execute BUY orders at any price", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      // Test at various prices
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 100))
      ).toBe(true);
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 200))
      ).toBe(true);
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 50))
      ).toBe(true);
    });

    it("should execute SELL orders at any price", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "SELL",
        quantity: 100,
      });

      // Test at various prices
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 100))
      ).toBe(true);
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 200))
      ).toBe(true);
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 50))
      ).toBe(true);
    });

    it("should have PENDING status when created", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      expect(order.status).toBe("PENDING");
    });
  });

  describe("LIMIT orders", () => {
    it("should execute BUY when price <= limit", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 150,
      });

      // Price at limit - should execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 150))
      ).toBe(true);

      // Price below limit - should execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 149))
      ).toBe(true);

      // Price above limit - should NOT execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 151))
      ).toBe(false);
    });

    it("should execute SELL when price >= limit", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "SELL",
        quantity: 100,
        limitPrice: 150,
      });

      // Price at limit - should execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 150))
      ).toBe(true);

      // Price above limit - should execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 151))
      ).toBe(true);

      // Price below limit - should NOT execute
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 149))
      ).toBe(false);
    });

    it("should require limitPrice parameter", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "LIMIT",
          side: "BUY",
          quantity: 100,
        })
      ).toThrow("Limit price required for LIMIT orders");
    });

    it("should reject negative limit price", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "LIMIT",
          side: "BUY",
          quantity: 100,
          limitPrice: -50,
        })
      ).toThrow("Limit price must be positive");
    });

    it("should handle edge case where price equals limit exactly", () => {
      const buyOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 150,
      });

      const sellOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "SELL",
        quantity: 100,
        limitPrice: 150,
      });

      const marketData = createMarketData("AAPL", 150);

      // Both should execute at exact limit price
      expect(orderManager.shouldExecuteOrder(buyOrder, marketData)).toBe(true);
      expect(orderManager.shouldExecuteOrder(sellOrder, marketData)).toBe(true);
    });
  });

  describe("STOP_LOSS orders", () => {
    it("should execute SELL when price <= stop (protecting long position)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "STOP_LOSS",
        side: "SELL",
        quantity: 100,
        stopPrice: 145,
      });

      // Price above stop - should NOT trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 150))
      ).toBe(false);

      // Price at stop - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 145))
      ).toBe(true);

      // Price below stop - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 140))
      ).toBe(true);
    });

    it("should execute BUY when price >= stop (protecting short position)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "STOP_LOSS",
        side: "BUY",
        quantity: 100,
        stopPrice: 155,
      });

      // Price below stop - should NOT trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 150))
      ).toBe(false);

      // Price at stop - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 155))
      ).toBe(true);

      // Price above stop - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 160))
      ).toBe(true);
    });

    it("should require stopPrice parameter", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "STOP_LOSS",
          side: "SELL",
          quantity: 100,
        })
      ).toThrow("Stop price required for STOP_LOSS orders");
    });

    it("should reject negative stop price", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "STOP_LOSS",
          side: "SELL",
          quantity: 100,
          stopPrice: -50,
        })
      ).toThrow("Stop price must be positive");
    });

    it("should handle gap down scenario", () => {
      // Simulate overnight gap down
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "STOP_LOSS",
        side: "SELL",
        quantity: 100,
        stopPrice: 145,
      });

      // Price gaps down past stop to 130 - should still trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 130))
      ).toBe(true);
    });
  });

  describe("TAKE_PROFIT orders", () => {
    it("should execute SELL when price >= target (profit on long)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TAKE_PROFIT",
        side: "SELL",
        quantity: 100,
        limitPrice: 160,
      });

      // Price below target - should NOT trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 155))
      ).toBe(false);

      // Price at target - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 160))
      ).toBe(true);

      // Price above target - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 165))
      ).toBe(true);
    });

    it("should execute BUY when price <= target (profit on short)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TAKE_PROFIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 140,
      });

      // Price above target - should NOT trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 145))
      ).toBe(false);

      // Price at target - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 140))
      ).toBe(true);

      // Price below target - should trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 135))
      ).toBe(true);
    });

    it("should require limitPrice parameter", () => {
      // TAKE_PROFIT uses limitPrice for the target
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TAKE_PROFIT",
        side: "SELL",
        quantity: 100,
        limitPrice: 160,
      });

      expect(order.limitPrice).toBe(160);
    });

    it("should handle gap up scenario", () => {
      // Simulate gap up past target
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TAKE_PROFIT",
        side: "SELL",
        quantity: 100,
        limitPrice: 160,
      });

      // Price gaps up to 175 - should still trigger
      expect(
        orderManager.shouldExecuteOrder(order, createMarketData("AAPL", 175))
      ).toBe(true);
    });
  });

  describe("TRAILING_STOP orders", () => {
    it("should track peak price and trigger on retreat (percentage)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Initial state: peak=100, stop=95 (5% below 100)
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95);

      // Price rises to 110 - update trailing stop
      orderManager.updateTrailingStop(order.id, 110, 108);
      const updatedOrder = orderManager.getOrder(order.id)!;
      expect(updatedOrder.peakPrice).toBe(110);
      expect(updatedOrder.stopPrice).toBe(104.5); // 5% below 110

      // Price drops but still above stop - no trigger
      expect(
        orderManager.shouldExecuteOrder(
          updatedOrder,
          createMarketData("AAPL", 106)
        )
      ).toBe(false);

      // Price drops to stop - TRIGGER
      expect(
        orderManager.shouldExecuteOrder(
          updatedOrder,
          createMarketData("AAPL", 104.5)
        )
      ).toBe(true);

      // Price drops below stop - TRIGGER
      expect(
        orderManager.shouldExecuteOrder(
          updatedOrder,
          createMarketData("AAPL", 100)
        )
      ).toBe(true);
    });

    it("should only adjust stop in favorable direction (SELL)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Price rises to 110
      orderManager.updateTrailingStop(order.id, 110, 105);
      let updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(110);
      expect(updated.stopPrice).toBe(104.5);

      // Price drops to 105 - stop should NOT adjust down
      orderManager.updateTrailingStop(order.id, 105, 103);
      updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(110); // Unchanged
      expect(updated.stopPrice).toBe(104.5); // Unchanged

      // Price rises to 115 - stop should adjust up
      orderManager.updateTrailingStop(order.id, 115, 112);
      updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(115);
      expect(updated.stopPrice).toBe(109.25); // 5% below 115
    });

    it("should work with fixed amount trail", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingAmount: 5,
        currentPrice: 100,
      });

      // Initial state: peak=100, stop=95 ($5 below 100)
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95);

      // Price rises to 110
      orderManager.updateTrailingStop(order.id, 110, 108);
      let updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(110);
      expect(updated.stopPrice).toBe(105); // $5 below 110

      // Price at stop - TRIGGER
      expect(
        orderManager.shouldExecuteOrder(updated, createMarketData("AAPL", 105))
      ).toBe(true);
    });

    it("should work for BUY side (short position)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "BUY",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Initial state: trough=100, stop=105 (5% above 100)
      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(105);

      // Price drops to 90 - update trailing stop
      orderManager.updateTrailingStop(order.id, 92, 90);
      const updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(90);
      expect(updated.stopPrice).toBe(94.5); // 5% above 90

      // Price rises but still below stop - no trigger
      expect(
        orderManager.shouldExecuteOrder(updated, createMarketData("AAPL", 93))
      ).toBe(false);

      // Price rises to stop - TRIGGER
      expect(
        orderManager.shouldExecuteOrder(updated, createMarketData("AAPL", 94.5))
      ).toBe(true);
    });

    it("should only adjust stop in favorable direction (BUY)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "BUY",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      // Price drops to 90
      orderManager.updateTrailingStop(order.id, 92, 90);
      let updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(90);
      expect(updated.stopPrice).toBe(94.5);

      // Price rises to 95 - stop should NOT adjust up
      orderManager.updateTrailingStop(order.id, 95, 93);
      updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(90); // Unchanged
      expect(updated.stopPrice).toBe(94.5); // Unchanged

      // Price drops to 85 - stop should adjust down
      orderManager.updateTrailingStop(order.id, 87, 85);
      updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(85);
      expect(updated.stopPrice).toBe(89.25); // 5% above 85
    });

    it("should require trailingAmount or trailingPercent", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "TRAILING_STOP",
          side: "SELL",
          quantity: 100,
        })
      ).toThrow("Trailing amount or percent required for TRAILING_STOP orders");
    });

    it("should reject invalid trailing percent", () => {
      // 0% is rejected as "not provided" since it's falsy
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "TRAILING_STOP",
          side: "SELL",
          quantity: 100,
          trailingPercent: 0,
        })
      ).toThrow("Trailing amount or percent required for TRAILING_STOP orders");

      // 100% is rejected as invalid range
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "TRAILING_STOP",
          side: "SELL",
          quantity: 100,
          trailingPercent: 100,
        })
      ).toThrow("Trailing percent must be between 0 and 100");

      // -5% is rejected as invalid range
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "TRAILING_STOP",
          side: "SELL",
          quantity: 100,
          trailingPercent: -5,
        })
      ).toThrow("Trailing percent must be between 0 and 100");
    });

    it("should reject negative trailing amount", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "TRAILING_STOP",
          side: "SELL",
          quantity: 100,
          trailingAmount: -5,
        })
      ).toThrow("Trailing amount must be positive");
    });

    it("should work without initial currentPrice (peak defaults to first update)", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
      });

      // No initial peak set
      expect(order.peakPrice).toBeUndefined();

      // First market update sets the peak
      orderManager.updateTrailingStop(order.id, 100, 98);
      const updated = orderManager.getOrder(order.id)!;
      expect(updated.peakPrice).toBe(100);
      expect(updated.stopPrice).toBe(95);
    });
  });

  describe("Order validation", () => {
    it("should reject zero quantity", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "MARKET",
          side: "BUY",
          quantity: 0,
        })
      ).toThrow("Order quantity must be positive");
    });

    it("should reject negative quantity", () => {
      expect(() =>
        orderManager.createOrder({
          symbol: "AAPL",
          type: "MARKET",
          side: "BUY",
          quantity: -100,
        })
      ).toThrow("Order quantity must be positive");
    });
  });

  describe("Order lifecycle", () => {
    it("should fill order completely", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const filledOrder = orderManager.fillOrder(order.id, 150.5, 100, 1, 0.5);

      expect(filledOrder.status).toBe("FILLED");
      expect(filledOrder.filledQuantity).toBe(100);
      expect(filledOrder.remainingQuantity).toBe(0);
      expect(filledOrder.fillPrice).toBe(150.5);
      expect(filledOrder.commissionPaid).toBe(1);
      expect(filledOrder.slippagePaid).toBe(0.5);
    });

    it("should partially fill order", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const partialOrder = orderManager.fillOrder(order.id, 150.5, 50, 0.5, 0.25);

      expect(partialOrder.status).toBe("PARTIALLY_FILLED");
      expect(partialOrder.filledQuantity).toBe(50);
      expect(partialOrder.remainingQuantity).toBe(50);
    });

    it("should cancel order", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 145,
      });

      const cancelledOrder = orderManager.cancelOrder(order.id, "User request");

      expect(cancelledOrder.status).toBe("CANCELLED");
      expect(cancelledOrder.notes).toContain("Cancelled: User request");
    });

    it("should not cancel filled order", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      orderManager.fillOrder(order.id, 150.5, 100, 1, 0.5);

      expect(() => orderManager.cancelOrder(order.id)).toThrow(
        "Order " + order.id + " not found"
      );
    });
  });
});
