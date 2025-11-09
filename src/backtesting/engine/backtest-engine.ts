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
    this.portfolioTracker = new PortfolioTracker(config.initialCapital);
    this.fillSimulator = new FillSimulator(config.commission, config.slippage);
    this.dataProvider = dataProvider;
    this.errors = [];
    this.isRunning = false;
    this.startTime = 0;
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

    // Update portfolio with current prices
    this.portfolioTracker.updatePrices({ [data.symbol]: data.close });

    // Check for stop loss / take profit triggers
    await this.checkExitConditions(data);

    // Generate signals from strategy
    const signalEvent = await this.strategyExecutor.processMarketData(event);
    if (signalEvent) {
      this.eventQueue.push(signalEvent);
    }

    // Record portfolio snapshot
    this.portfolioTracker.recordSnapshot(data.timestamp);
  }

  /**
   * Handle signal event
   * @param event Signal event
   */
  private async handleSignalEvent(event: SignalEvent): Promise<void> {
    const { signal } = event;

    // Convert signal to order
    const order = await this.portfolioTracker.createOrderFromSignal(signal, event.timestamp);

    if (order) {
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

    // Simulate order fill
    const fill = await this.fillSimulator.simulateFill(order, event.timestamp);

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
  private async checkExitConditions(data: { symbol: string; high: number; low: number }): Promise<void> {
    const exitSignals = this.portfolioTracker.checkExitConditions(data.symbol, data.high, data.low);

    for (const signal of exitSignals) {
      const signalEvent: SignalEvent = {
        type: "SIGNAL",
        timestamp: new Date(),
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
    const positions = this.portfolioTracker.getOpenPositions();

    for (const position of positions) {
      const closeSignal = this.portfolioTracker.createCloseSignal(position, "END_OF_BACKTEST");

      if (closeSignal) {
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
  }

  /**
   * Calculate final backtest results
   * @returns Backtest results
   */
  private calculateResults(): BacktestResult {
    const executionTime = Date.now() - this.startTime;
    const trades = this.portfolioTracker.getTrades();
    const snapshots = this.portfolioTracker.getSnapshots();

    // Build equity curve
    const equityCurveBuilder = new EquityCurveBuilder(this.config.initialCapital);
    const equityCurve = equityCurveBuilder.build(snapshots);

    // Calculate performance metrics
    const metricsCalculator = new PerformanceMetricsCalculator(this.config.initialCapital);
    const metrics = metricsCalculator.calculate(trades, equityCurve);

    // Calculate statistics
    const statistics = metricsCalculator.calculateStatistics(trades, equityCurve);

    return {
      config: this.config,
      timestamp: new Date(),
      executionTimeMs: executionTime,
      metrics,
      equityCurve,
      trades,
      portfolioSnapshots: snapshots,
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
