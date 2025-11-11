/**
 * Core backtesting engine
 * Orchestrates the entire backtesting process using event-driven architecture
 */

import type {
  BacktestConfig,
  BacktestError,
  BacktestEvent,
  BacktestResult,
  BacktestStrategy,
  DataProvider,
  FillEvent,
  MarketDataEvent,
  OrderEvent,
  SignalEvent,
} from "../types/backtest-types.js";
import { EventQueue } from "./event-queue.js";
import { StrategyExecutor } from "./strategy-executor.js";
import { PortfolioTracker } from "../portfolio/portfolio-tracker.js";
import { FillSimulator } from "../execution/fill-simulator.js";
import { PerformanceMetricsCalculator } from "../analytics/performance-metrics.js";
import { EquityCurveBuilder } from "../analytics/equity-curve.js";

/**
 * Main backtesting engine
 * Coordinates event processing, strategy execution, order simulation, and portfolio tracking
 */
export class BacktestEngine {
  private config: BacktestConfig;
  private eventQueue: EventQueue;
  private strategyExecutor: StrategyExecutor;
  private portfolioTracker: PortfolioTracker;
  private fillSimulator: FillSimulator;
  private dataProvider: DataProvider;
  private errors: BacktestError[];
  private isRunning: boolean;
  private startTime: number;
  private currentBars: Map<string, any>; // Store current bar for each symbol

  /**
   * Create a new backtest engine
   * @param config Backtest configuration
   * @param strategy Strategy to backtest
   * @param dataProvider Data provider for historical data
   */
  constructor(config: BacktestConfig, strategy: BacktestStrategy, dataProvider: DataProvider) {
    this.config = config;
    this.eventQueue = new EventQueue();
    this.strategyExecutor = new StrategyExecutor(strategy);
    this.portfolioTracker = new PortfolioTracker(config.initialCapital, config.startDate);

    // Create FillSimulator config from BacktestConfig
    const fillSimulatorConfig = {
      slippageModel: config.slippageModel!,
      commissionModel: config.commissionModel!,
      fillOnClose: config.fillOnClose ?? true,
      rejectPartialFills: false,
    };
    this.fillSimulator = new FillSimulator(fillSimulatorConfig);

    this.dataProvider = dataProvider;
    this.errors = [];
    this.isRunning = false;
    this.startTime = 0;
    this.currentBars = new Map();
  }

  /**
   * Run the backtest
   * @returns Backtest results
   */
  async run(): Promise<BacktestResult> {
    this.startTime = Date.now();
    this.isRunning = true;

    try {
      // Initialize components
      await this.initialize();

      // Load and queue historical data
      await this.loadHistoricalData();

      // Process events
      await this.processEvents();

      // Close any remaining positions
      await this.closeRemainingPositions();

      // Calculate results
      const result = this.calculateResults();

      return result;
    } catch (error) {
      this.addError("CRITICAL", `Backtest failed: ${(error as Error).message}`, { error });
      throw error;
    } finally {
      this.isRunning = false;
      await this.cleanup();
    }
  }

  /**
   * Initialize all components
   */
  private async initialize(): Promise<void> {
    await this.strategyExecutor.initialize();
  }

  /**
   * Load historical data and create market data events
   */
  private async loadHistoricalData(): Promise<void> {
    for (const symbol of this.config.symbols) {
      try {
        // Check if data is available
        const hasData = await this.dataProvider.hasData(
          symbol,
          this.config.startDate,
          this.config.endDate,
        );

        if (!hasData) {
          this.addError("WARNING", `No data available for ${symbol}`, { symbol });
          continue;
        }

        // Load data
        const data = await this.dataProvider.loadData(
          symbol,
          this.config.startDate,
          this.config.endDate,
        );

        // Create market data events
        for (const dataPoint of data) {
          const event: MarketDataEvent = {
            type: "MARKET_DATA",
            timestamp: dataPoint.timestamp,
            priority: 1, // Market data has highest priority
            data: dataPoint,
          };
          this.eventQueue.push(event);
        }
      } catch (error) {
        this.addError("ERROR", `Failed to load data for ${symbol}: ${(error as Error).message}`, {
          symbol,
          error,
        });
      }
    }
  }

  /**
   * Main event processing loop
   */
  private async processEvents(): Promise<void> {
    while (!this.eventQueue.isEmpty() && this.isRunning) {
      const event = this.eventQueue.pop();
      if (!event) break;

      try {
        await this.processEvent(event);
      } catch (error) {
        this.addError("ERROR", `Error processing event: ${(error as Error).message}`, {
          event,
          error,
        });
      }
    }
  }

  /**
   * Process a single event
   * @param event Event to process
   */
  private async processEvent(event: BacktestEvent): Promise<void> {
    switch (event.type) {
      case "MARKET_DATA":
        await this.handleMarketDataEvent(event as MarketDataEvent);
        break;
      case "SIGNAL":
        await this.handleSignalEvent(event as SignalEvent);
        break;
      case "ORDER":
        await this.handleOrderEvent(event as OrderEvent);
        break;
      case "FILL":
        await this.handleFillEvent(event as FillEvent);
        break;
      default:
        this.addError("WARNING", `Unknown event type: ${event.type}`, { event });
    }
  }

  /**
   * Handle market data event
   * @param event Market data event
   */
  private async handleMarketDataEvent(event: MarketDataEvent): Promise<void> {
    const { data } = event;

    // Store current bar for fill simulation
    this.currentBars.set(data.symbol, data);

    // Update portfolio with current prices
    const priceMap = new Map<string, number>();
    priceMap.set(data.symbol, data.close);
    this.portfolioTracker.updatePositionPrices(priceMap, data.timestamp);

    // Check for stop loss / take profit triggers
    await this.checkExitConditions(data);

    // Generate signals from strategy
    const signalEvent = await this.strategyExecutor.processMarketData(event);
    if (signalEvent) {
      this.eventQueue.push(signalEvent);
    }

    // Portfolio snapshot is automatically recorded in updatePositionPrices
  }

  /**
   * Handle signal event
   * @param event Signal event
   */
  private async handleSignalEvent(event: SignalEvent): Promise<void> {
    const { signal } = event;

    // Convert signal to order (simplified - create order directly)
    if (signal.action === "BUY" || signal.action === "SELL") {
      const order = {
        id: `order-${Date.now()}`,
        symbol: signal.symbol,
        type: "MARKET" as const,
        side: signal.action,
        quantity: signal.positionSize || 0,
        createdAt: event.timestamp,
        signal,
        strategyName: signal.strategy,
      };

      const orderEvent: OrderEvent = {
        type: "ORDER",
        timestamp: event.timestamp,
        priority: 3, // Orders have priority 3
        order,
      };
      this.eventQueue.push(orderEvent);
    }
  }

  /**
   * Handle order event
   * @param event Order event
   */
  private async handleOrderEvent(event: OrderEvent): Promise<void> {
    const { order } = event;

    // Get current bar for the symbol
    const bar = this.currentBars.get(order.symbol);
    if (!bar) {
      this.addError("ERROR", `No bar data available for ${order.symbol}`, { order });
      return;
    }

    // Simulate order fill
    const fill = this.fillSimulator.simulateFill(order, bar);

    if (fill) {
      const fillEvent: FillEvent = {
        type: "FILL",
        timestamp: event.timestamp,
        priority: 4, // Fills have priority 4
        fill,
      };
      this.eventQueue.push(fillEvent);
    }
  }

  /**
   * Handle fill event
   * @param event Fill event
   */
  private async handleFillEvent(event: FillEvent): Promise<void> {
    const { fill } = event;

    // Update portfolio with fill
    this.portfolioTracker.processFill(fill);
  }

  /**
   * Check exit conditions for open positions (stop loss, take profit)
   * @param data Current market data
   */
  private async checkExitConditions(data: { symbol: string; high: number; low: number; timestamp: Date }): Promise<void> {
    // Check if position has stop loss or take profit levels
    const position = this.portfolioTracker.getPosition(data.symbol);
    if (!position) return;

    let shouldExit = false;
    let exitReason = "STOP_LOSS";

    if (position.stopLoss && data.low <= position.stopLoss) {
      shouldExit = true;
      exitReason = "STOP_LOSS";
    } else if (position.takeProfit && data.high >= position.takeProfit) {
      shouldExit = true;
      exitReason = "TAKE_PROFIT";
    }

    if (shouldExit) {
      const signal = {
        symbol: data.symbol,
        action: "SELL" as const,
        strength: 100,
        strategy: "EXIT_CONDITIONS",
        indicators: {} as any, // Empty indicators for exit signals
        confidence: 100,
        reasons: [exitReason],
        timestamp: data.timestamp,
        positionSize: position.quantity,
      };

      const signalEvent: SignalEvent = {
        type: "SIGNAL",
        timestamp: data.timestamp,
        priority: 2,
        signal,
      };
      this.eventQueue.push(signalEvent);
    }
  }

  /**
   * Close all remaining positions at the end of the backtest
   */
  private async closeRemainingPositions(): Promise<void> {
    const positionsMap = this.portfolioTracker.getPositions();
    const positions = Array.from(positionsMap.values());

    for (const position of positions) {
      const closeSignal = {
        symbol: position.symbol,
        action: "SELL" as const,
        strength: 100,
        strategy: "END_OF_BACKTEST",
        indicators: {} as any,
        confidence: 100,
        reasons: ["END_OF_BACKTEST"],
        timestamp: this.config.endDate,
        positionSize: position.quantity,
      };

      const signalEvent: SignalEvent = {
        type: "SIGNAL",
        timestamp: this.config.endDate,
        priority: 2,
        signal: closeSignal,
      };

      // Process the close signal immediately
      await this.handleSignalEvent(signalEvent);

      // Process any resulting order and fill events
      while (!this.eventQueue.isEmpty()) {
        const event = this.eventQueue.pop();
        if (event) {
          await this.processEvent(event);
        }
      }
    }
  }

  /**
   * Calculate final backtest results
   * @returns Backtest results
   */
  private calculateResults(): BacktestResult {
    const executionTime = Date.now() - this.startTime;
    const trades = this.portfolioTracker.getClosedTrades();
    const equityCurve = this.portfolioTracker.getEquityCurve();
    const transactionCosts = this.portfolioTracker.getTransactionCosts();

    // Calculate performance metrics
    const metrics = PerformanceMetricsCalculator.calculate(
      equityCurve,
      trades,
      this.config.initialCapital,
      this.config.startDate,
      this.config.endDate,
      transactionCosts.commissions,
      transactionCosts.slippage,
    );

    // Calculate statistics (simplified - using subset of metrics)
    const statistics = {
      tradingDays: Math.floor((this.config.endDate.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      avgDailyReturn: equityCurve.length > 0 ? equityCurve.reduce((sum, p) => sum + p.dailyReturn, 0) / equityCurve.length : 0,
      dailyReturnStdDev: metrics.volatility / Math.sqrt(252),
      bestDay: equityCurve.length > 0 ? Math.max(...equityCurve.map(p => p.dailyReturn)) : 0,
      worstDay: equityCurve.length > 0 ? Math.min(...equityCurve.map(p => p.dailyReturn)) : 0,
      positiveDays: equityCurve.filter(p => p.dailyReturn > 0).length,
      negativeDays: equityCurve.filter(p => p.dailyReturn < 0).length,
      avgWinDuration: trades.filter(t => t.pnl > 0).length > 0
        ? trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.filter(t => t.pnl > 0).length
        : 0,
      avgLossDuration: trades.filter(t => t.pnl < 0).length > 0
        ? trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.filter(t => t.pnl < 0).length
        : 0,
      maxConsecutiveWins: 0, // TODO: Calculate
      maxConsecutiveLosses: 0, // TODO: Calculate
      totalCommission: transactionCosts.commissions,
      totalSlippage: transactionCosts.slippage,
      avgTradesPerMonth: trades.length / ((this.config.endDate.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)),
    };

    return {
      config: this.config,
      timestamp: new Date(),
      executionTimeMs: executionTime,
      metrics,
      equityCurve,
      trades,
      portfolioSnapshots: [], // Empty for now - was using getSnapshots which doesn't exist
      errors: this.errors,
      statistics,
    };
  }

  /**
   * Add an error to the error log
   * @param severity Error severity
   * @param message Error message
   * @param data Additional error data
   */
  private addError(
    severity: "WARNING" | "ERROR" | "CRITICAL",
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.errors.push({
      timestamp: new Date(),
      severity,
      message,
      data,
    });
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    await this.strategyExecutor.cleanup();
    this.eventQueue.clear();
  }

  /**
   * Get current backtest progress
   * @returns Progress information
   */
  getProgress(): {
    isRunning: boolean;
    eventsProcessed: number;
    eventsRemaining: number;
    currentDate?: Date;
  } {
    const nextEvent = this.eventQueue.peek();
    return {
      isRunning: this.isRunning,
      eventsProcessed: 0, // Would need to track this
      eventsRemaining: this.eventQueue.size(),
      currentDate: nextEvent?.timestamp,
    };
  }

  /**
   * Stop the backtest early
   */
  stop(): void {
    this.isRunning = false;
  }
}
