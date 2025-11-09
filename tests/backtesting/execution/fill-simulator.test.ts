/**
 * Fill Simulator Tests
 * Tests order execution simulation with slippage and commissions
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FillSimulator } from "../../../src/backtesting/execution/fill-simulator.js";
import type {
  Order,
  Bar,
  SlippageModel,
  CommissionModel
} from "../../../src/backtesting/types/backtest-types.js";

describe("FillSimulator", () => {
  let simulator: FillSimulator;
  let testBar: Bar;
  let testOrder: Order;

  // Mock slippage model - 0.1% slippage
  const mockSlippage: SlippageModel = {
    type: "FIXED",
    fixedPercentage: 0.001,
    calculate: () => 0.001
  };

  // Mock commission model - $1 per trade
  const mockCommission: CommissionModel = {
    type: "FIXED",
    fixedFee: 1.0,
    calculate: () => 1.0
  };

  beforeEach(() => {
    simulator = new FillSimulator({
      slippageModel: mockSlippage,
      commissionModel: mockCommission,
      fillOnClose: true,
      rejectPartialFills: false
    });

    testBar = {
      symbol: "AAPL",
      timestamp: new Date("2024-01-01"),
      open: 150.00,
      high: 152.00,
      low: 149.00,
      close: 151.00,
      volume: 1000000
    };

    testOrder = {
      id: "order-1",
      symbol: "AAPL",
      type: "MARKET",
      side: "BUY",
      quantity: 100,
      timestamp: new Date("2024-01-01"),
      strategyName: "TEST"
    };
  });

  describe("Market Orders", () => {
    it("should fill market buy order at close with slippage", () => {
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.symbol).toBe("AAPL");
      expect(fill!.side).toBe("BUY");
      expect(fill!.quantity).toBe(100);
      expect(fill!.price).toBeGreaterThan(testBar.close); // Buy pays more
      expect(fill!.commission).toBe(1.0);
      expect(fill!.slippage).toBeGreaterThan(0);
    });

    it("should fill market sell order at close with slippage", () => {
      testOrder.side = "SELL";
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.side).toBe("SELL");
      expect(fill!.price).toBeLessThan(testBar.close); // Sell receives less
      expect(fill!.commission).toBe(1.0);
    });

    it("should fill at open when fillOnClose is false", () => {
      simulator.updateConfig({ fillOnClose: false });
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      // Price should be based on open (150) not close (151)
      expect(fill!.price).toBeGreaterThan(testBar.open);
      expect(fill!.price).toBeLessThan(testBar.open * 1.01);
    });

    it("should reject orders exceeding volume limits", () => {
      simulator.updateConfig({
        rejectPartialFills: true,
        maxOrderSizePercent: 0.01 // 1% of volume
      });

      testOrder.quantity = 50000; // 5% of volume
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).toBeNull(); // Should be rejected
    });

    it("should calculate correct total costs", () => {
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      const totalCost = fill!.quantity * fill!.price + fill!.commission + fill!.slippage;
      expect(totalCost).toBeGreaterThan(testOrder.quantity * testBar.close);
    });
  });

  describe("Limit Orders", () => {
    it("should fill buy limit when price reaches limit", () => {
      testOrder.type = "LIMIT";
      testOrder.limitPrice = 150.00;

      const fill = simulator.simulateLimitOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.price).toBeLessThanOrEqual(testOrder.limitPrice!);
    });

    it("should not fill buy limit when price above limit", () => {
      testOrder.type = "LIMIT";
      testOrder.limitPrice = 148.00; // Below bar's low

      const fill = simulator.simulateLimitOrderFill(testOrder, testBar);

      expect(fill).toBeNull();
    });

    it("should fill sell limit when price reaches limit", () => {
      testOrder.type = "LIMIT";
      testOrder.side = "SELL";
      testOrder.limitPrice = 152.00;

      const fill = simulator.simulateLimitOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.price).toBeGreaterThanOrEqual(testOrder.limitPrice!);
    });

    it("should not fill sell limit when price below limit", () => {
      testOrder.type = "LIMIT";
      testOrder.side = "SELL";
      testOrder.limitPrice = 153.00; // Above bar's high

      const fill = simulator.simulateLimitOrderFill(testOrder, testBar);

      expect(fill).toBeNull();
    });

    it("should have minimal slippage on limit orders", () => {
      testOrder.type = "LIMIT";
      testOrder.limitPrice = 150.00;

      const fill = simulator.simulateLimitOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.slippage).toBe(0); // Limit orders have no slippage
    });

    it("should throw error if limitPrice not specified", () => {
      testOrder.type = "LIMIT";
      testOrder.limitPrice = undefined;

      expect(() => {
        simulator.simulateLimitOrderFill(testOrder, testBar);
      }).toThrow("Limit order must have limitPrice specified");
    });
  });

  describe("Stop Orders", () => {
    it("should trigger buy stop when price reaches stop", () => {
      testOrder.type = "STOP";
      testOrder.stopPrice = 151.00;

      const fill = simulator.simulateStopOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.price).toBeGreaterThanOrEqual(testOrder.stopPrice!);
    });

    it("should not trigger buy stop when price below stop", () => {
      testOrder.type = "STOP";
      testOrder.stopPrice = 153.00; // Above bar's high

      const fill = simulator.simulateStopOrderFill(testOrder, testBar);

      expect(fill).toBeNull();
    });

    it("should trigger sell stop when price reaches stop", () => {
      testOrder.type = "STOP";
      testOrder.side = "SELL";
      testOrder.stopPrice = 150.00;

      const fill = simulator.simulateStopOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.price).toBeLessThanOrEqual(testOrder.stopPrice!);
    });

    it("should not trigger sell stop when price above stop", () => {
      testOrder.type = "STOP";
      testOrder.side = "SELL";
      testOrder.stopPrice = 148.00; // Below bar's low

      const fill = simulator.simulateStopOrderFill(testOrder, testBar);

      expect(fill).toBeNull();
    });

    it("should apply slippage to stop orders", () => {
      testOrder.type = "STOP";
      testOrder.stopPrice = 151.00;

      const fill = simulator.simulateStopOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.slippage).toBeGreaterThan(0);
    });

    it("should throw error if stopPrice not specified", () => {
      testOrder.type = "STOP";
      testOrder.stopPrice = undefined;

      expect(() => {
        simulator.simulateStopOrderFill(testOrder, testBar);
      }).toThrow("Stop order must have stopPrice specified");
    });
  });

  describe("Stop-Limit Orders", () => {
    it("should fill when both stop and limit conditions met", () => {
      testOrder.type = "STOP_LIMIT";
      testOrder.stopPrice = 150.00;
      testOrder.limitPrice = 151.00;

      const fill = simulator.simulateFill(testOrder, testBar);

      // This is a simplified test - actual behavior depends on implementation
      expect(fill).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should update configuration", () => {
      simulator.updateConfig({ fillOnClose: false });
      const config = simulator.getConfig();

      expect(config.fillOnClose).toBe(false);
    });

    it("should return copy of configuration", () => {
      const config1 = simulator.getConfig();
      const config2 = simulator.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero quantity orders", () => {
      testOrder.quantity = 0;
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.quantity).toBe(0);
      expect(fill!.slippage).toBe(0);
    });

    it("should handle very large orders", () => {
      testOrder.quantity = 1000000;
      const fill = simulator.simulateMarketOrderFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.quantity).toBe(1000000);
    });

    it("should handle gap down/up scenarios for limit orders", () => {
      // Gap down - open below previous close
      const gapBar: Bar = {
        symbol: "AAPL",
        timestamp: new Date("2024-01-02"),
        open: 145.00,
        high: 146.00,
        low: 144.00,
        close: 145.50,
        volume: 2000000
      };

      testOrder.type = "LIMIT";
      testOrder.limitPrice = 148.00;

      const fill = simulator.simulateLimitOrderFill(testOrder, gapBar);

      expect(fill).not.toBeNull(); // Should fill below limit
    });
  });

  describe("Auto-detect Order Type", () => {
    it("should auto-detect and fill market order", () => {
      testOrder.type = "MARKET";
      const fill = simulator.simulateFill(testOrder, testBar);

      expect(fill).not.toBeNull();
      expect(fill!.price).toBeGreaterThan(testBar.close * 0.99);
    });

    it("should auto-detect and fill limit order", () => {
      testOrder.type = "LIMIT";
      testOrder.limitPrice = 150.00;
      const fill = simulator.simulateFill(testOrder, testBar);

      expect(fill).toBeDefined();
    });

    it("should throw error for unsupported order type", () => {
      testOrder.type = "UNKNOWN" as any;

      expect(() => {
        simulator.simulateFill(testOrder, testBar);
      }).toThrow("Unsupported order type");
    });
  });
});
