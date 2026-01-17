/**
 * Paper Trading Integration Tests
 * End-to-end tests for complete order lifecycle and multi-order scenarios
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OrderManager } from "../../src/paper-trading/orders/order-manager.js";
import { PortfolioManager } from "../../src/paper-trading/portfolio/portfolio-manager.js";
import { ExecutionSimulator } from "../../src/paper-trading/execution/execution-simulator.js";
import type {
  MarketDataUpdate,
  PaperTradingConfig,
} from "../../src/paper-trading/types/paper-trading-types.js";
import { FixedBPSSlippageModel } from "../../src/backtesting/execution/slippage-models.js";
import { ZeroCommissionModel, PerShareCommissionModel } from "../../src/backtesting/execution/commission-models.js";

describe("Paper Trading Integration", () => {
  let orderManager: OrderManager;
  let portfolio: PortfolioManager;
  let executionSimulator: ExecutionSimulator;

  const createConfig = (overrides?: Partial<PaperTradingConfig>): PaperTradingConfig => ({
    initialCapital: 100000,
    slippageModel: new FixedBPSSlippageModel(5), // 5 BPS
    commissionModel: new ZeroCommissionModel(),
    maxPositionSize: 50000,
    maxPositionPercent: 50,
    maxPositions: 10,
    maxDailyLoss: 5000,
    maxDailyLossPercent: 5,
    maxTotalExposure: 100,
    maxSymbolConcentration: 25,
    executeOnClose: true,
    partialFills: false,
    maxSlippageBPS: 50,
    enforceMarketHours: false, // Disable for tests
    marketOpenHour: 9,
    marketOpenMinute: 30,
    marketCloseHour: 16,
    marketCloseMinute: 0,
    timezone: "America/New_York",
    defaultTimeInForce: "GTC",
    defaultOrderExpiration: 0,
    dataRefreshInterval: 60000,
    enableEncryption: false,
    backupEnabled: false,
    backupInterval: 3600000,
    ...overrides,
  });

  const createMarketData = (
    symbol: string,
    price: number,
    options?: Partial<MarketDataUpdate>
  ): MarketDataUpdate => ({
    symbol,
    timestamp: new Date(),
    price,
    volume: 1000000,
    high: price + 1,
    low: price - 1,
    open: price,
    previousClose: price - 0.5,
    ...options,
  });

  beforeEach(() => {
    orderManager = new OrderManager();
    portfolio = new PortfolioManager(100000);
    const config = createConfig();
    executionSimulator = new ExecutionSimulator(
      config,
      config.slippageModel,
      config.commissionModel
    );
  });

  describe("Full Order Lifecycle", () => {
    it("should complete full order lifecycle: create -> execute -> position -> close", () => {
      // 1. Create BUY order
      const buyOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
        stopLoss: 145,
        takeProfit: 165,
      });

      expect(buyOrder.status).toBe("PENDING");
      expect(orderManager.getOrderCount()).toBe(1);

      // 2. Simulate market data and check if order should execute
      const marketData = createMarketData("AAPL", 150);
      expect(orderManager.shouldExecuteOrder(buyOrder, marketData)).toBe(true);

      // 3. Simulate fill
      const fillResult = executionSimulator.simulateExecution(buyOrder, marketData);
      expect(fillResult.canFill).toBe(true);
      expect(fillResult.fillPrice).toBeGreaterThan(0);
      expect(fillResult.fillQuantity).toBe(100);

      // 4. Fill order and record in order manager
      const filledOrder = orderManager.fillOrder(
        buyOrder.id,
        fillResult.fillPrice,
        fillResult.fillQuantity,
        fillResult.commission,
        fillResult.slippage
      );

      expect(filledOrder.status).toBe("FILLED");
      expect(filledOrder.filledAt).toBeDefined();

      // 5. Open position in portfolio
      const position = portfolio.openPosition(
        "AAPL",
        "LONG",
        fillResult.fillPrice,
        100,
        fillResult.commission,
        fillResult.slippage,
        undefined,
        "test-strategy",
        145,
        165
      );

      expect(portfolio.hasPosition("AAPL")).toBe(true);
      expect(position.quantity).toBe(100);
      expect(position.stopLoss).toBe(145);
      expect(position.takeProfit).toBe(165);

      // 6. Update position with new market data
      const newMarketData = new Map<string, MarketDataUpdate>();
      newMarketData.set("AAPL", createMarketData("AAPL", 155));
      portfolio.updatePositionPrices(newMarketData);

      const updatedPosition = portfolio.getPosition("AAPL")!;
      expect(updatedPosition.currentPrice).toBe(155);
      expect(updatedPosition.unrealizedPnL).toBeGreaterThan(0);

      // 7. Create SELL order to close position
      const sellOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "SELL",
        quantity: 100,
      });

      // 8. Execute sell
      const sellMarketData = createMarketData("AAPL", 160);
      const sellFillResult = executionSimulator.simulateExecution(sellOrder, sellMarketData);

      orderManager.fillOrder(
        sellOrder.id,
        sellFillResult.fillPrice,
        sellFillResult.fillQuantity,
        sellFillResult.commission,
        sellFillResult.slippage
      );

      // 9. Close position
      const trade = portfolio.closePosition(
        "AAPL",
        sellFillResult.fillPrice,
        sellFillResult.commission,
        sellFillResult.slippage,
        "SIGNAL"
      );

      expect(portfolio.hasPosition("AAPL")).toBe(false);
      expect(trade.netPnL).toBeGreaterThan(0);
      expect(trade.exitReason).toBe("SIGNAL");
    });

    it("should handle position with stop loss trigger", () => {
      // Open long position at $100
      const position = portfolio.openPosition(
        "MSFT",
        "LONG",
        100,
        50,
        0,
        0,
        undefined,
        "test-strategy",
        95 // Stop loss at $95
      );

      expect(position.stopLoss).toBe(95);

      // Price drops to stop loss level
      const stopMarketData = createMarketData("MSFT", 94);

      // Check stop loss condition
      const shouldStop = position.stopLoss && stopMarketData.price <= position.stopLoss;
      expect(shouldStop).toBe(true);

      // Execute stop loss
      const trade = portfolio.closePosition("MSFT", 94, 0, 0, "STOP_LOSS");

      expect(trade.exitReason).toBe("STOP_LOSS");
      expect(trade.netPnL).toBeLessThan(0); // Loss
      expect(portfolio.hasPosition("MSFT")).toBe(false);
    });

    it("should handle position with take profit trigger", () => {
      // Open long position at $100
      const position = portfolio.openPosition(
        "GOOGL",
        "LONG",
        100,
        30,
        0,
        0,
        undefined,
        "test-strategy",
        90, // Stop loss
        120 // Take profit at $120
      );

      expect(position.takeProfit).toBe(120);

      // Price rises to take profit level
      const profitMarketData = createMarketData("GOOGL", 125);

      // Check take profit condition
      const shouldTakeProfit = position.takeProfit && profitMarketData.price >= position.takeProfit;
      expect(shouldTakeProfit).toBe(true);

      // Execute take profit
      const trade = portfolio.closePosition("GOOGL", 125, 0, 0, "TAKE_PROFIT");

      expect(trade.exitReason).toBe("TAKE_PROFIT");
      expect(trade.netPnL).toBeGreaterThan(0); // Profit
      expect(trade.returnPercent).toBeCloseTo(25, 1); // ~25% return
    });
  });

  describe("Multiple Order Types Simultaneously", () => {
    it("should handle multiple order types simultaneously", () => {
      // Create different order types
      const marketOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const limitOrder = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 50,
        limitPrice: 145,
      });

      const stopLossOrder = orderManager.createOrder({
        symbol: "MSFT",
        type: "STOP_LOSS",
        side: "SELL",
        quantity: 25,
        stopPrice: 95,
      });

      expect(orderManager.getOrderCount()).toBe(3);

      // Price scenario: AAPL at $150, MSFT at $100
      const aaplMarketData = createMarketData("AAPL", 150);
      const msftMarketData = createMarketData("MSFT", 100);

      // MARKET order should execute immediately
      expect(orderManager.shouldExecuteOrder(marketOrder, aaplMarketData)).toBe(true);

      // LIMIT order should NOT execute (price 150 > limit 145)
      expect(orderManager.shouldExecuteOrder(limitOrder, aaplMarketData)).toBe(false);

      // STOP_LOSS should NOT trigger (price 100 > stop 95)
      expect(orderManager.shouldExecuteOrder(stopLossOrder, msftMarketData)).toBe(false);

      // Change prices
      const aaplLowerMarketData = createMarketData("AAPL", 144);
      const msftLowerMarketData = createMarketData("MSFT", 94);

      // LIMIT order should now execute (price 144 <= limit 145)
      expect(orderManager.shouldExecuteOrder(limitOrder, aaplLowerMarketData)).toBe(true);

      // STOP_LOSS should now trigger (price 94 <= stop 95)
      expect(orderManager.shouldExecuteOrder(stopLossOrder, msftLowerMarketData)).toBe(true);
    });

    it("should process orders for multiple symbols", () => {
      const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN"];
      const orders: Map<string, ReturnType<typeof orderManager.createOrder>> = new Map();

      // Create limit orders for each symbol
      for (const symbol of symbols) {
        const order = orderManager.createOrder({
          symbol,
          type: "LIMIT",
          side: "BUY",
          quantity: 10,
          limitPrice: 100,
        });
        orders.set(symbol, order);
      }

      expect(orderManager.getOrderCount()).toBe(4);

      // Only AAPL and MSFT drop below limit
      const marketDataMap = new Map<string, MarketDataUpdate>();
      marketDataMap.set("AAPL", createMarketData("AAPL", 99)); // Below limit
      marketDataMap.set("MSFT", createMarketData("MSFT", 98)); // Below limit
      marketDataMap.set("GOOGL", createMarketData("GOOGL", 105)); // Above limit
      marketDataMap.set("AMZN", createMarketData("AMZN", 110)); // Above limit

      let triggeredCount = 0;
      for (const [symbol, order] of orders) {
        const marketData = marketDataMap.get(symbol)!;
        if (orderManager.shouldExecuteOrder(order, marketData)) {
          triggeredCount++;
        }
      }

      expect(triggeredCount).toBe(2); // Only AAPL and MSFT
    });
  });

  describe("Trailing Stop Integration", () => {
    it("should track trailing stop through price movements", () => {
      // Create trailing stop order starting at $100
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 100,
        trailingPercent: 5,
        currentPrice: 100,
      });

      expect(order.peakPrice).toBe(100);
      expect(order.stopPrice).toBe(95); // 5% below $100

      // Simulate price movements
      const priceHistory = [
        { high: 102, low: 100 }, // Price rises slightly
        { high: 108, low: 105 }, // Price rises more
        { high: 110, low: 107 }, // New peak at 110
        { high: 109, low: 106 }, // Price drops but above stop
        { high: 108, low: 103 }, // Price drops more, still above stop (104.5)
      ];

      for (const { high, low } of priceHistory) {
        orderManager.updateTrailingStop(order.id, high, low);
      }

      const updatedOrder = orderManager.getOrder(order.id)!;

      // Peak should be 110 (highest seen)
      expect(updatedOrder.peakPrice).toBe(110);

      // Stop should be 5% below peak = 104.5
      expect(updatedOrder.stopPrice).toBe(104.5);

      // Test trigger scenarios
      const aboveStopData = createMarketData("AAPL", 105);
      expect(orderManager.shouldExecuteOrder(updatedOrder, aboveStopData)).toBe(false);

      const atStopData = createMarketData("AAPL", 104.5);
      expect(orderManager.shouldExecuteOrder(updatedOrder, atStopData)).toBe(true);

      const belowStopData = createMarketData("AAPL", 100);
      expect(orderManager.shouldExecuteOrder(updatedOrder, belowStopData)).toBe(true);
    });

    it("should integrate trailing stop with portfolio management", () => {
      // Open position
      const position = portfolio.openPosition(
        "NVDA",
        "LONG",
        100, // Entry at $100
        50,  // 50 shares
        1,   // Commission
        0.5  // Slippage
      );

      // Create trailing stop order for the position
      const trailingStopOrder = orderManager.createOrder({
        symbol: "NVDA",
        type: "TRAILING_STOP",
        side: "SELL",
        quantity: 50,
        trailingPercent: 10,
        currentPrice: 100,
      });

      // Initial stop at $90 (10% below $100)
      expect(trailingStopOrder.stopPrice).toBe(90);

      // Price rises to $120
      orderManager.updateTrailingStop(trailingStopOrder.id, 120, 118);
      let updated = orderManager.getOrder(trailingStopOrder.id)!;
      expect(updated.stopPrice).toBe(108); // 10% below $120

      // Update position price
      const marketData = new Map<string, MarketDataUpdate>();
      marketData.set("NVDA", createMarketData("NVDA", 120));
      portfolio.updatePositionPrices(marketData);

      const updatedPosition = portfolio.getPosition("NVDA")!;
      expect(updatedPosition.currentPrice).toBe(120);
      // unrealizedPnL is (120-100)*50 = 1000 (costs are tracked separately in position)
      expect(updatedPosition.unrealizedPnL).toBeCloseTo(1000, 1);

      // Price drops to trigger trailing stop at $107
      const stopMarketData = createMarketData("NVDA", 107);
      expect(orderManager.shouldExecuteOrder(updated, stopMarketData)).toBe(true);

      // Execute the stop
      const trade = portfolio.closePosition("NVDA", 107, 1, 0.5, "TRAILING_STOP");

      expect(trade.exitReason).toBe("TRAILING_STOP");
      expect(trade.netPnL).toBeGreaterThan(0); // Still profitable due to trailing
    });
  });

  describe("Order Fill with Slippage and Commission", () => {
    it("should correctly calculate fills with slippage model", () => {
      const config = createConfig({
        slippageModel: new FixedBPSSlippageModel(10), // 10 BPS = 0.1%
      });
      const simulator = new ExecutionSimulator(
        config,
        config.slippageModel,
        config.commissionModel
      );

      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const marketData = createMarketData("AAPL", 150);
      const fillResult = simulator.simulateExecution(order, marketData);

      expect(fillResult.canFill).toBe(true);
      // Fill price should be slightly higher than market price for BUY orders
      expect(fillResult.fillPrice).toBeGreaterThanOrEqual(150);
      expect(fillResult.slippage).toBeGreaterThanOrEqual(0);
    });

    it("should correctly calculate fills with commission model", () => {
      const config = createConfig({
        commissionModel: new PerShareCommissionModel(0.01), // $0.01 per share
      });
      const simulator = new ExecutionSimulator(
        config,
        config.slippageModel,
        config.commissionModel
      );

      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      const marketData = createMarketData("AAPL", 150);
      const fillResult = simulator.simulateExecution(order, marketData);

      expect(fillResult.canFill).toBe(true);
      expect(fillResult.commission).toBeCloseTo(1, 2); // $0.01 * 100 = $1
    });

    it("should track total costs in portfolio", () => {
      const config = createConfig({
        commissionModel: new PerShareCommissionModel(0.01),
      });

      // Execute buy with commission
      portfolio.openPosition(
        "AAPL",
        "LONG",
        150,
        100,
        1,    // Commission $1
        0.15  // Slippage
      );

      // Execute sell with commission
      portfolio.closePosition("AAPL", 155, 1, 0.15, "SIGNAL");

      const state = portfolio.getState();
      expect(state.totalCommissions).toBe(2); // $1 + $1
      expect(state.totalSlippage).toBe(0.3); // $0.15 + $0.15
    });
  });

  describe("Portfolio State Tracking", () => {
    it("should track portfolio value through multiple trades", () => {
      const initialCash = portfolio.getCash();
      expect(initialCash).toBe(100000);

      // Trade 1: Buy AAPL at $150, sell at $160 (profit)
      portfolio.openPosition("AAPL", "LONG", 150, 100, 1, 0.5);
      const afterBuy1 = portfolio.getCash();
      expect(afterBuy1).toBeLessThan(initialCash);

      portfolio.closePosition("AAPL", 160, 1, 0.5, "SIGNAL");
      const afterSell1 = portfolio.getCash();

      // Trade 2: Buy MSFT at $200, sell at $190 (loss)
      portfolio.openPosition("MSFT", "LONG", 200, 50, 1, 0.5);
      portfolio.closePosition("MSFT", 190, 1, 0.5, "STOP_LOSS");

      const finalState = portfolio.getState();

      // Should have realized P&L from both trades
      expect(finalState.totalRealizedPnL).toBeDefined();
      expect(portfolio.getClosedTrades().length).toBe(2);
    });

    it("should track win/loss statistics", () => {
      // Execute winning trade
      portfolio.openPosition("AAPL", "LONG", 100, 100, 0, 0);
      portfolio.closePosition("AAPL", 110, 0, 0, "SIGNAL");

      // Execute losing trade
      portfolio.openPosition("MSFT", "LONG", 100, 100, 0, 0);
      portfolio.closePosition("MSFT", 95, 0, 0, "STOP_LOSS");

      // Execute another winning trade
      portfolio.openPosition("GOOGL", "LONG", 100, 100, 0, 0);
      portfolio.closePosition("GOOGL", 115, 0, 0, "TAKE_PROFIT");

      const state = portfolio.getState();
      expect(state.totalTrades).toBe(3);
      expect(state.winningTrades).toBe(2);
      expect(state.losingTrades).toBe(1);
      expect(state.winRate).toBeCloseTo(66.67, 1);
    });

    it("should calculate drawdown correctly", () => {
      // Start with profitable trades to establish peak
      portfolio.openPosition("AAPL", "LONG", 100, 500, 0, 0);

      // Update position prices to establish new peak
      // This is required because peakValue is only updated in updatePositionPrices
      const marketDataPeak = new Map<string, MarketDataUpdate>();
      marketDataPeak.set("AAPL", createMarketData("AAPL", 120));
      portfolio.updatePositionPrices(marketDataPeak);

      // Now close at the peak price
      portfolio.closePosition("AAPL", 120, 0, 0, "SIGNAL"); // +$10,000

      const peakValue = portfolio.getTotalValue();
      expect(peakValue).toBe(110000);

      // Now take a loss
      portfolio.openPosition("MSFT", "LONG", 200, 200, 0, 0);
      portfolio.closePosition("MSFT", 150, 0, 0, "STOP_LOSS"); // -$10,000

      const state = portfolio.getState();
      // currentDrawdown = (current - peak) / peak * 100
      // = (100000 - 110000) / 110000 * 100 = -9.09%
      // The value is NEGATIVE (indicating we're below peak)
      expect(state.currentDrawdown).toBeLessThan(0);
      expect(Math.abs(state.currentDrawdown)).toBeCloseTo(9.09, 1);
    });
  });

  describe("Order Expiration and Cancellation", () => {
    it("should expire DAY orders after 24 hours", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 145,
        timeInForce: "DAY",
      });

      // Check immediately - should not be expired
      const immediate = orderManager.expireOrders(new Date());
      expect(immediate.length).toBe(0);

      // Check after 25 hours - should be expired
      const futureDate = new Date(Date.now() + 25 * 60 * 60 * 1000);
      const expired = orderManager.expireOrders(futureDate);

      expect(expired.length).toBe(1);
      expect(expired[0].status).toBe("EXPIRED");
    });

    it("should cancel all orders for a symbol", () => {
      // Create multiple orders for AAPL
      orderManager.createOrder({
        symbol: "AAPL",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 145,
      });
      orderManager.createOrder({
        symbol: "AAPL",
        type: "STOP_LOSS",
        side: "SELL",
        quantity: 50,
        stopPrice: 140,
      });

      // Create order for different symbol
      orderManager.createOrder({
        symbol: "MSFT",
        type: "LIMIT",
        side: "BUY",
        quantity: 100,
        limitPrice: 200,
      });

      expect(orderManager.getOrderCount()).toBe(3);

      // Cancel all AAPL orders
      const cancelled = orderManager.cancelAllOrdersForSymbol("AAPL");

      expect(cancelled.length).toBe(2);
      expect(orderManager.getOrderCount()).toBe(1); // Only MSFT order remains
      expect(orderManager.getActiveOrdersForSymbol("AAPL").length).toBe(0);
      expect(orderManager.getActiveOrdersForSymbol("MSFT").length).toBe(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle insufficient funds", () => {
      expect(() =>
        portfolio.openPosition(
          "AAPL",
          "LONG",
          1000, // High price
          200,  // Large quantity = $200,000
          0,
          0
        )
      ).toThrow(/Insufficient cash/);
    });

    it("should handle duplicate position", () => {
      portfolio.openPosition("AAPL", "LONG", 100, 100, 0, 0);

      expect(() =>
        portfolio.openPosition("AAPL", "LONG", 105, 50, 0, 0)
      ).toThrow(/Position already exists/);
    });

    it("should handle closing non-existent position", () => {
      expect(() =>
        portfolio.closePosition("AAPL", 150, 0, 0, "SIGNAL")
      ).toThrow(/No position found/);
    });

    it("should handle filling already filled order", () => {
      const order = orderManager.createOrder({
        symbol: "AAPL",
        type: "MARKET",
        side: "BUY",
        quantity: 100,
      });

      // Fill once
      orderManager.fillOrder(order.id, 150, 100, 0, 0);

      // Try to fill again - order has been moved to history
      expect(() =>
        orderManager.fillOrder(order.id, 150, 100, 0, 0)
      ).toThrow(/not found/);
    });
  });
});
