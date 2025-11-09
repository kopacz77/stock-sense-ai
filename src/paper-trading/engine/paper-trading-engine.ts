/**
 * Paper Trading Engine - Main Orchestrator
 * Coordinates all paper trading components
 * Executes strategy loop with real-time market data
 */

import type {
  PaperTradingConfig,
  EngineStatus,
  MarketDataUpdate,
  PaperTradingEvent,
  PerformanceSnapshot,
} from "../types/paper-trading-types.js";
import type { Signal } from "../../types/trading.js";
import type { BacktestStrategy } from "../../backtesting/types/backtest-types.js";
import { PortfolioManager } from "../portfolio/portfolio-manager.js";
import { OrderManager } from "../orders/order-manager.js";
import { ExecutionSimulator } from "../execution/execution-simulator.js";
import { TradeJournal } from "../journal/trade-journal.js";
import { PerformanceCalculator } from "../performance/performance-calculator.js";
import { PreTradeValidator } from "../risk/pre-trade-validator.js";
import { EncryptedStorage } from "../storage/encrypted-storage.js";
import { FixedBPSSlippageModel } from "../../backtesting/execution/slippage-models.js";
import { ZeroCommissionModel } from "../../backtesting/execution/commission-models.js";
import { EventEmitter } from "node:events";

/**
 * Paper Trading Engine
 * Main orchestrator for virtual trading system
 */
export class PaperTradingEngine extends EventEmitter {
  private portfolio: PortfolioManager;
  private orderManager: OrderManager;
  private executionSimulator: ExecutionSimulator;
  private tradeJournal: TradeJournal;
  private performanceCalculator: PerformanceCalculator;
  private riskValidator: PreTradeValidator;
  private storage: EncryptedStorage;

  private strategy: BacktestStrategy | null = null;
  private running = false;
  private startTime: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  // Statistics
  private totalOrders = 0;
  private filledOrders = 0;
  private cancelledOrders = 0;
  private errors = 0;
  private lastError: string | null = null;

  constructor(
    private config: PaperTradingConfig,
    private storageDir: string = "./data/paper-trading"
  ) {
    super();

    // Initialize storage
    this.storage = new EncryptedStorage(storageDir);

    // Initialize components
    this.portfolio = new PortfolioManager(config.initialCapital);
    this.orderManager = new OrderManager();

    const slippageModel = config.slippageModel ?? new FixedBPSSlippageModel(5); // 5 BPS default
    const commissionModel = config.commissionModel ?? new ZeroCommissionModel();

    this.executionSimulator = new ExecutionSimulator(
      config,
      slippageModel,
      commissionModel
    );

    this.tradeJournal = new TradeJournal(this.storage);
    this.performanceCalculator = new PerformanceCalculator();
    this.riskValidator = new PreTradeValidator(config);
  }

  /**
   * Initialize engine
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();

    // Try to load existing state
    await this.loadState();

    this.emit("initialized");
  }

  /**
   * Start paper trading with a strategy
   */
  async start(strategy: BacktestStrategy, symbols: string[]): Promise<void> {
    if (this.running) {
      throw new Error("Engine is already running");
    }

    this.strategy = strategy;
    this.running = true;
    this.startTime = new Date();

    // Initialize strategy if needed
    if (this.strategy.initialize) {
      await this.strategy.initialize();
    }

    // Start execution loop
    this.startExecutionLoop(symbols);

    this.emit("started", { strategy: this.strategy.getName(), symbols });
  }

  /**
   * Stop paper trading
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Cleanup strategy
    if (this.strategy?.cleanup) {
      await this.strategy.cleanup();
    }

    // Save state
    await this.saveState();

    this.emit("stopped");
  }

  /**
   * Start execution loop
   */
  private startExecutionLoop(symbols: string[]): void {
    // Execute immediately
    this.executeStrategyLoop(symbols);

    // Then execute at configured interval
    this.intervalId = setInterval(() => {
      this.executeStrategyLoop(symbols);
    }, this.config.dataRefreshInterval);
  }

  /**
   * Execute strategy loop
   */
  private async executeStrategyLoop(symbols: string[]): Promise<void> {
    try {
      // 1. Fetch latest market data
      const marketDataMap = await this.fetchMarketData(symbols);

      // 2. Update position prices
      this.portfolio.updatePositionPrices(marketDataMap);

      // 3. Process existing orders
      await this.processOrders(marketDataMap);

      // 4. Check stop losses and take profits
      await this.checkStopLossesAndTargets(marketDataMap);

      // 5. Generate signals from strategy
      if (this.strategy) {
        for (const symbol of symbols) {
          await this.processStrategySignals(symbol, marketDataMap);
        }
      }

      // 6. Save state periodically
      await this.saveState();

      // 7. Record performance snapshot
      await this.recordPerformanceSnapshot();

      this.emit("loop-completed");
    } catch (error) {
      this.errors++;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit("error", error);
    }
  }

  /**
   * Fetch market data for symbols
   * This is a placeholder - integrate with real market data provider
   */
  private async fetchMarketData(
    symbols: string[]
  ): Promise<Map<string, MarketDataUpdate>> {
    const marketData = new Map<string, MarketDataUpdate>();

    // TODO: Integrate with Alpha Vantage or Finnhub API
    // For now, return mock data
    for (const symbol of symbols) {
      marketData.set(symbol, {
        symbol,
        timestamp: new Date(),
        price: 100 + Math.random() * 10, // Mock price
        volume: 1000000,
        high: 105,
        low: 95,
        open: 100,
        previousClose: 100,
      });
    }

    return marketData;
  }

  /**
   * Process strategy signals
   */
  private async processStrategySignals(
    symbol: string,
    marketDataMap: Map<string, MarketDataUpdate>
  ): Promise<void> {
    if (!this.strategy) return;

    const marketData = marketDataMap.get(symbol);
    if (!marketData) return;

    // Generate signal
    const signal = await this.strategy.generateSignal(
      symbol,
      {
        symbol,
        timestamp: marketData.timestamp,
        open: marketData.open,
        high: marketData.high,
        low: marketData.low,
        close: marketData.price,
        volume: marketData.volume,
      },
      [] // Historical data would go here
    );

    if (signal.action === "HOLD") {
      return; // No action
    }

    // Create order from signal
    if (signal.action === "BUY") {
      await this.createBuyOrder(signal, marketData);
    } else if (signal.action === "SELL") {
      await this.closeSellOrder(signal, marketData);
    }
  }

  /**
   * Create buy order from signal
   */
  private async createBuyOrder(
    signal: Signal,
    marketData: MarketDataUpdate
  ): Promise<void> {
    // Check if we already have a position
    if (this.portfolio.hasPosition(signal.symbol)) {
      return; // Don't add to existing position
    }

    // Calculate position size
    const portfolioValue = this.portfolio.getTotalValue();
    const maxPositionSize = this.riskValidator.calculateMaxPositionSize(portfolioValue);
    const positionValue = Math.min(
      signal.positionSize ?? maxPositionSize,
      maxPositionSize
    );
    const quantity = Math.floor(positionValue / marketData.price);

    if (quantity === 0) {
      return; // Not enough capital
    }

    // Validate order
    const order = this.orderManager.createOrder({
      symbol: signal.symbol,
      type: "MARKET",
      side: "BUY",
      quantity,
      signal,
      strategyName: this.strategy?.getName(),
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    });

    this.totalOrders++;

    // Pre-trade validation
    const validation = this.riskValidator.validateOrder(
      order,
      this.portfolio.getState(),
      marketData.price
    );

    if (!validation.allowed) {
      this.orderManager.cancelOrder(order.id, validation.reasons.join("; "));
      this.cancelledOrders++;

      await this.tradeJournal.recordRiskEvent(
        "ORDER_REJECTED",
        signal.symbol,
        { reasons: validation.reasons },
        this.portfolio.getTotalValue(),
        this.portfolio.getCash(),
        this.portfolio.getPositionsValue()
      );

      return;
    }

    // Record order
    await this.tradeJournal.recordOrderCreated(
      order,
      this.portfolio.getTotalValue(),
      this.portfolio.getCash(),
      this.portfolio.getPositionsValue()
    );

    this.emit("order-created", { order });
  }

  /**
   * Close position from sell signal
   */
  private async closeSellOrder(
    signal: Signal,
    marketData: MarketDataUpdate
  ): Promise<void> {
    const position = this.portfolio.getPosition(signal.symbol);

    if (!position) {
      return; // No position to close
    }

    // Create sell order
    const order = this.orderManager.createOrder({
      symbol: signal.symbol,
      type: "MARKET",
      side: "SELL",
      quantity: position.quantity,
      signal,
      strategyName: this.strategy?.getName(),
    });

    this.totalOrders++;

    await this.tradeJournal.recordOrderCreated(
      order,
      this.portfolio.getTotalValue(),
      this.portfolio.getCash(),
      this.portfolio.getPositionsValue()
    );

    this.emit("order-created", { order });
  }

  /**
   * Process pending orders
   */
  private async processOrders(
    marketDataMap: Map<string, MarketDataUpdate>
  ): Promise<void> {
    const activeOrders = this.orderManager.getActiveOrders();

    for (const [orderId, order] of activeOrders) {
      const marketData = marketDataMap.get(order.symbol);

      if (!marketData) {
        continue; // No market data for this symbol
      }

      // Check if order should execute
      if (this.orderManager.shouldExecuteOrder(order, marketData)) {
        await this.executeOrder(order, marketData);
      }

      // Update trailing stops
      if (order.type === "TRAILING_STOP") {
        this.orderManager.updateTrailingStop(
          orderId,
          marketData.high,
          marketData.low
        );
      }
    }

    // Expire old orders
    const expired = this.orderManager.expireOrders(new Date());
    for (const order of expired) {
      this.cancelledOrders++;
      await this.tradeJournal.recordOrderCancelled(
        order,
        "Expired",
        this.portfolio.getTotalValue(),
        this.portfolio.getCash(),
        this.portfolio.getPositionsValue()
      );
    }
  }

  /**
   * Execute order
   */
  private async executeOrder(
    order: any,
    marketData: MarketDataUpdate
  ): Promise<void> {
    // Simulate execution
    const fillResult = this.executionSimulator.simulateExecution(
      order,
      marketData
    );

    if (!fillResult.canFill) {
      return; // Cannot fill
    }

    // Fill order
    this.orderManager.fillOrder(
      order.id,
      fillResult.fillPrice,
      fillResult.fillQuantity,
      fillResult.commission,
      fillResult.slippage
    );

    this.filledOrders++;

    // Update portfolio
    if (order.side === "BUY") {
      // Open position
      const position = this.portfolio.openPosition(
        order.symbol,
        "LONG",
        fillResult.fillPrice,
        fillResult.fillQuantity,
        fillResult.commission,
        fillResult.slippage,
        order.signal,
        order.strategyName,
        order.stopLoss,
        order.takeProfit
      );

      await this.tradeJournal.recordPositionOpened(
        position,
        this.portfolio.getTotalValue(),
        this.portfolio.getCash(),
        this.portfolio.getPositionsValue()
      );

      this.emit("position-opened", { position });
    } else {
      // Close position
      const trade = this.portfolio.closePosition(
        order.symbol,
        fillResult.fillPrice,
        fillResult.commission,
        fillResult.slippage,
        "SIGNAL",
        order.signal
      );

      await this.tradeJournal.recordPositionClosed(
        trade,
        this.portfolio.getTotalValue(),
        this.portfolio.getCash(),
        this.portfolio.getPositionsValue()
      );

      this.emit("position-closed", { trade });
    }

    // Record fill
    await this.tradeJournal.recordOrderFilled(
      order,
      fillResult.fillPrice,
      fillResult.fillQuantity,
      fillResult.commission,
      fillResult.slippage,
      this.portfolio.getTotalValue(),
      this.portfolio.getCash(),
      this.portfolio.getPositionsValue()
    );

    this.emit("order-filled", { order, fillResult });
  }

  /**
   * Check stop losses and take profits
   */
  private async checkStopLossesAndTargets(
    marketDataMap: Map<string, MarketDataUpdate>
  ): Promise<void> {
    for (const [symbol, position] of this.portfolio.getAllPositions()) {
      const marketData = marketDataMap.get(symbol);

      if (!marketData) {
        continue;
      }

      // Check stop loss
      if (
        position.stopLoss &&
        ((position.side === "LONG" && marketData.price <= position.stopLoss) ||
          (position.side === "SHORT" && marketData.price >= position.stopLoss))
      ) {
        // Create stop loss order
        const order = this.orderManager.createOrder({
          symbol,
          type: "MARKET",
          side: "SELL",
          quantity: position.quantity,
          strategyName: position.strategyName,
        });

        await this.executeOrder(order, marketData);
      }

      // Check take profit
      if (
        position.takeProfit &&
        ((position.side === "LONG" && marketData.price >= position.takeProfit) ||
          (position.side === "SHORT" && marketData.price <= position.takeProfit))
      ) {
        // Create take profit order
        const order = this.orderManager.createOrder({
          symbol,
          type: "MARKET",
          side: "SELL",
          quantity: position.quantity,
          strategyName: position.strategyName,
        });

        await this.executeOrder(order, marketData);
      }

      // Check trailing stop
      if (position.trailingStopPrice) {
        if (
          (position.side === "LONG" && marketData.price <= position.trailingStopPrice) ||
          (position.side === "SHORT" && marketData.price >= position.trailingStopPrice)
        ) {
          const order = this.orderManager.createOrder({
            symbol,
            type: "MARKET",
            side: "SELL",
            quantity: position.quantity,
            strategyName: position.strategyName,
          });

          await this.executeOrder(order, marketData);
        } else {
          // Update trailing stop
          this.portfolio.updateTrailingStop(
            symbol,
            position.trailingAmount ?? 0,
            position.trailingPercent
          );
        }
      }
    }
  }

  /**
   * Record performance snapshot
   */
  private async recordPerformanceSnapshot(): Promise<void> {
    const snapshot = this.performanceCalculator.calculatePerformance(
      this.portfolio.getState(),
      this.portfolio.getClosedTrades()
    );

    await this.storage.appendPerformanceSnapshot(snapshot);
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    const state = {
      portfolio: this.portfolio.getState(),
      orders: {
        active: Array.from(this.orderManager.getActiveOrders().entries()),
        history: this.orderManager.getOrderHistory(),
      },
      statistics: {
        totalOrders: this.totalOrders,
        filledOrders: this.filledOrders,
        cancelledOrders: this.cancelledOrders,
        errors: this.errors,
      },
    };

    await this.storage.writePortfolioState(state);
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    const state = await this.storage.readPortfolioState<any>();

    if (state) {
      this.portfolio.loadState(state.portfolio);
      this.orderManager.loadOrders(
        new Map(state.orders.active),
        state.orders.history
      );
      this.totalOrders = state.statistics.totalOrders ?? 0;
      this.filledOrders = state.statistics.filledOrders ?? 0;
      this.cancelledOrders = state.statistics.cancelledOrders ?? 0;
      this.errors = state.statistics.errors ?? 0;
    }
  }

  /**
   * Get engine status
   */
  getStatus(): EngineStatus {
    return {
      running: this.running,
      startTime: this.startTime ?? undefined,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : undefined,
      lastUpdate: new Date(),
      totalOrders: this.totalOrders,
      filledOrders: this.filledOrders,
      cancelledOrders: this.cancelledOrders,
      currentValue: this.portfolio.getTotalValue(),
      dailyPnL: this.portfolio.getDailyPnL(),
      totalPnL: this.portfolio.getTotalPnL(),
      activePositions: this.portfolio.getPositionCount(),
      openOrders: this.orderManager.getOrderCount(),
      errors: this.errors,
      lastError: this.lastError ?? undefined,
    };
  }

  /**
   * Get portfolio state
   */
  getPortfolio() {
    return this.portfolio.getState();
  }

  /**
   * Get orders
   */
  getOrders() {
    return this.orderManager.getActiveOrders();
  }

  /**
   * Get trades
   */
  getTrades() {
    return this.portfolio.getClosedTrades();
  }

  /**
   * Get performance
   */
  async getPerformance(): Promise<PerformanceSnapshot> {
    return this.performanceCalculator.calculatePerformance(
      this.portfolio.getState(),
      this.portfolio.getClosedTrades()
    );
  }

  /**
   * Reset engine (USE WITH CAUTION)
   */
  async reset(): Promise<void> {
    if (this.running) {
      await this.stop();
    }

    this.portfolio.reset();
    this.orderManager.reset();
    this.performanceCalculator.reset();

    this.totalOrders = 0;
    this.filledOrders = 0;
    this.cancelledOrders = 0;
    this.errors = 0;
    this.lastError = null;

    await this.storage.clearAllData();

    this.emit("reset");
  }
}
