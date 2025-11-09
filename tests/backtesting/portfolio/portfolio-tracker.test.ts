/**
 * Portfolio Tracker Tests
 * Critical tests for position tracking and P&L calculations
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PortfolioTracker } from "../../../src/backtesting/portfolio/portfolio-tracker.js";
import type { Fill } from "../../../src/backtesting/types/backtest-types.js";

describe("PortfolioTracker", () => {
  let tracker: PortfolioTracker;
  const initialCapital = 100000;
  const startDate = new Date("2024-01-01");

  beforeEach(() => {
    tracker = new PortfolioTracker(initialCapital, startDate);
  });

  describe("Initialization", () => {
    it("should initialize with correct capital", () => {
      expect(tracker.getCash()).toBe(initialCapital);
      expect(tracker.getInitialCapital()).toBe(initialCapital);
      expect(tracker.getEquity()).toBe(initialCapital);
    });

    it("should throw error for non-positive initial capital", () => {
      expect(() => new PortfolioTracker(0, startDate)).toThrow();
      expect(() => new PortfolioTracker(-1000, startDate)).toThrow();
    });

    it("should start with no positions", () => {
      expect(tracker.getPositions().size).toBe(0);
      expect(tracker.getClosedTrades().length).toBe(0);
    });
  });

  describe("Buy Operations", () => {
    it("should process buy fill correctly", () => {
      const buyFill: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.50,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buyFill);

      const expectedCost = 100 * 150.00 + 1.00 + 0.50; // 15001.50
      expect(tracker.getCash()).toBeCloseTo(initialCapital - expectedCost, 2);
      expect(tracker.hasPosition("AAPL")).toBe(true);

      const position = tracker.getPosition("AAPL");
      expect(position).toBeDefined();
      expect(position!.quantity).toBe(100);
      expect(position!.avgEntryPrice).toBe(150.00);
      expect(position!.marketValue).toBe(15000);
    });

    it("should average entry price on multiple buys", () => {
      const buy1: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      const buy2: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "BUY",
        quantity: 50,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-03"),
        strategyName: "TEST"
      };

      tracker.processFill(buy1);
      tracker.processFill(buy2);

      const position = tracker.getPosition("AAPL");
      expect(position!.quantity).toBe(150);

      // Average: (100 * 150 + 50 * 160) / 150 = 153.33
      expect(position!.avgEntryPrice).toBeCloseTo(153.33, 2);
    });

    it("should throw error when insufficient cash", () => {
      const largeBuy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 1000,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      expect(() => tracker.processFill(largeBuy)).toThrow("Insufficient cash");
    });

    it("should track transaction costs", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 5.00,
        slippage: 2.50,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);

      const costs = tracker.getTransactionCosts();
      expect(costs.commissions).toBe(5.00);
      expect(costs.slippage).toBe(2.50);
      expect(costs.total).toBe(7.50);
    });
  });

  describe("Sell Operations", () => {
    beforeEach(() => {
      // Set up initial position
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };
      tracker.processFill(buy);
    });

    it("should process profitable sell correctly", () => {
      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 100,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      const cashBefore = tracker.getCash();
      tracker.processFill(sell);

      const proceeds = 100 * 160.00 - 1.00; // 15999
      expect(tracker.getCash()).toBeCloseTo(cashBefore + proceeds, 2);
      expect(tracker.hasPosition("AAPL")).toBe(false);

      const closedTrades = tracker.getClosedTrades();
      expect(closedTrades.length).toBe(1);
      expect(closedTrades[0]!.pnl).toBeCloseTo(999, 2); // (160-150)*100 - 1 - 1
    });

    it("should process losing sell correctly", () => {
      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 100,
        price: 140.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      tracker.processFill(sell);

      const closedTrades = tracker.getClosedTrades();
      expect(closedTrades[0]!.pnl).toBeCloseTo(-1001, 2); // (140-150)*100 - 1 - 1
    });

    it("should handle partial sells", () => {
      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 50,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      tracker.processFill(sell);

      expect(tracker.hasPosition("AAPL")).toBe(true);
      const position = tracker.getPosition("AAPL");
      expect(position!.quantity).toBe(50);
      expect(position!.avgEntryPrice).toBe(150.00); // Unchanged
    });

    it("should throw error when selling without position", () => {
      const sell: Fill = {
        orderId: "order-2",
        symbol: "GOOGL",
        side: "SELL",
        quantity: 100,
        price: 140.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      expect(() => tracker.processFill(sell)).toThrow("no position exists");
    });

    it("should throw error when selling more than held", () => {
      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 150,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      expect(() => tracker.processFill(sell)).toThrow("only 100 shares held");
    });
  });

  describe("Position Updates", () => {
    beforeEach(() => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };
      tracker.processFill(buy);
    });

    it("should update position prices correctly", () => {
      const newPrices = new Map<string, number>();
      newPrices.set("AAPL", 160.00);

      tracker.updatePositionPrices(newPrices, new Date("2024-01-03"));

      const position = tracker.getPosition("AAPL");
      expect(position!.currentPrice).toBe(160.00);
      expect(position!.marketValue).toBe(16000);
      expect(position!.unrealizedPnL).toBe(1000);
      expect(position!.unrealizedPnLPercent).toBeCloseTo(6.67, 2);
    });

    it("should calculate total P&L correctly", () => {
      const newPrices = new Map<string, number>();
      newPrices.set("AAPL", 160.00);

      tracker.updatePositionPrices(newPrices, new Date("2024-01-03"));

      expect(tracker.getUnrealizedPnL()).toBe(1000);
      expect(tracker.getTotalPnL()).toBe(1000);
    });

    it("should track equity curve", () => {
      const newPrices = new Map<string, number>();
      newPrices.set("AAPL", 160.00);

      tracker.updatePositionPrices(newPrices, new Date("2024-01-03"));

      const equityCurve = tracker.getEquityCurve();
      expect(equityCurve.length).toBeGreaterThan(0);
      expect(equityCurve[0]!.equity).toBeGreaterThan(initialCapital);
    });
  });

  describe("P&L Calculations", () => {
    it("should calculate realized P&L from closed trades", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 100,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-05"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);
      tracker.processFill(sell);

      expect(tracker.getRealizedPnL()).toBeCloseTo(998, 2);
    });

    it("should combine realized and unrealized P&L", () => {
      // First trade: Closed with profit
      const buy1: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      const sell1: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 100,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-03"),
        strategyName: "TEST"
      };

      // Second trade: Open with unrealized profit
      const buy2: Fill = {
        orderId: "order-3",
        symbol: "GOOGL",
        side: "BUY",
        quantity: 50,
        price: 140.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-04"),
        strategyName: "TEST"
      };

      tracker.processFill(buy1);
      tracker.processFill(sell1);
      tracker.processFill(buy2);

      // Update GOOGL price
      const newPrices = new Map<string, number>();
      newPrices.set("GOOGL", 145.00);
      tracker.updatePositionPrices(newPrices, new Date("2024-01-05"));

      const realizedPnL = tracker.getRealizedPnL();
      const unrealizedPnL = tracker.getUnrealizedPnL();
      const totalPnL = tracker.getTotalPnL();

      expect(realizedPnL).toBeCloseTo(998, 2); // First trade
      expect(unrealizedPnL).toBeCloseTo(250, 2); // Second trade
      expect(totalPnL).toBeCloseTo(1248, 2);
    });
  });

  describe("Portfolio Metrics", () => {
    it("should calculate equity correctly", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);

      const newPrices = new Map<string, number>();
      newPrices.set("AAPL", 160.00);
      tracker.updatePositionPrices(newPrices, new Date("2024-01-03"));

      const equity = tracker.getEquity();
      const cash = tracker.getCash();
      const marketValue = tracker.getMarketValue();

      expect(equity).toBeCloseTo(cash + marketValue, 2);
    });

    it("should calculate leverage correctly", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);

      const leverage = tracker.getLeverage();
      const marketValue = tracker.getMarketValue();
      const equity = tracker.getEquity();

      expect(leverage).toBeCloseTo(marketValue / equity, 2);
    });

    it("should return zero leverage when no positions", () => {
      expect(tracker.getLeverage()).toBe(0);
    });
  });

  describe("Portfolio Snapshot", () => {
    it("should create accurate snapshot", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);

      const snapshot = tracker.getSnapshot();

      expect(snapshot.cash).toBe(tracker.getCash());
      expect(snapshot.equity).toBe(tracker.getEquity());
      expect(snapshot.positions.size).toBe(1);
      expect(snapshot.totalValue).toBe(tracker.getEquity());
    });
  });

  describe("Reset Functionality", () => {
    it("should reset to initial state", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      tracker.processFill(buy);
      tracker.reset();

      expect(tracker.getCash()).toBe(initialCapital);
      expect(tracker.getPositions().size).toBe(0);
      expect(tracker.getClosedTrades().length).toBe(0);
      expect(tracker.getEquityCurve().length).toBe(0);
    });

    it("should reset with new capital", () => {
      tracker.reset(200000);

      expect(tracker.getCash()).toBe(200000);
      expect(tracker.getInitialCapital()).toBe(200000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple positions correctly", () => {
      const buy1: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      const buy2: Fill = {
        orderId: "order-2",
        symbol: "GOOGL",
        side: "BUY",
        quantity: 50,
        price: 140.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-03"),
        strategyName: "TEST"
      };

      tracker.processFill(buy1);
      tracker.processFill(buy2);

      expect(tracker.getPositions().size).toBe(2);
      expect(tracker.hasPosition("AAPL")).toBe(true);
      expect(tracker.hasPosition("GOOGL")).toBe(true);
    });

    it("should track holding period correctly", () => {
      const buy: Fill = {
        orderId: "order-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 150.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-02"),
        strategyName: "TEST"
      };

      const sell: Fill = {
        orderId: "order-2",
        symbol: "AAPL",
        side: "SELL",
        quantity: 100,
        price: 160.00,
        commission: 1.00,
        slippage: 0.00,
        timestamp: new Date("2024-01-07"), // 5 days later
        strategyName: "TEST"
      };

      tracker.processFill(buy);
      tracker.processFill(sell);

      const trades = tracker.getClosedTrades();
      expect(trades[0]!.holdingPeriod).toBe(5);
    });
  });
});
