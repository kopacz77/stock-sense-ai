/**
 * Simple Backtest Engine
 * Streamlined backtesting engine for Week 1-4 implementation
 */

import type {
  Bar,
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  Order,
  OrderSide,
} from "../types/backtest-types.js";
import { EventQueue } from "../events/event-queue.js";
import { PortfolioTracker } from "../portfolio/portfolio-tracker.js";
import { FillSimulator } from "../execution/fill-simulator.js";
import { PerformanceMetricsCalculator } from "../analytics/performance-metrics.js";
import { HistoricalDataManager } from "../data/historical-data-manager.js";

export class SimpleBacktestEngine {
  private config: BacktestConfig;
  private strategy: BacktestStrategy;
  private portfolio: PortfolioTracker;
  private fillSimulator: FillSimulator;
  private dataManager: HistoricalDataManager;
  private eventQueue: EventQueue;

  constructor(config: BacktestConfig, strategy: BacktestStrategy) {
    this.config = config;
    this.strategy = strategy;
    this.portfolio = new PortfolioTracker(config.initialCapital, config.startDate);
    this.fillSimulator = new FillSimulator({
      slippageModel: config.slippageModel!,
      commissionModel: config.commissionModel!,
      fillOnClose: config.fillOnClose ?? true,
      rejectPartialFills: true,
      maxOrderSizePercent: 0.1, // Max 10% of daily volume
    });
    this.dataManager = new HistoricalDataManager();
    this.eventQueue = new EventQueue();
  }

  /**
   * Run the backtest
   */
  async run(symbol: string, bars: Bar[]): Promise<BacktestResult> {
    // Initialize strategy
    if (this.strategy.initialize) {
      await this.strategy.initialize();
    }

    // Filter bars to date range
    const filteredBars = this.dataManager.filterByDateRange(
      bars,
      this.config.startDate,
      this.config.endDate
    );

    if (filteredBars.length === 0) {
      throw new Error("No data in specified date range");
    }

    // Calculate average volume
    const avgVolume = this.dataManager.calculateAverageVolume(filteredBars);

    // Main backtest loop - process each bar
    for (let i = 0; i < filteredBars.length; i++) {
      const bar = filteredBars[i];
      if (!bar) continue;

      // Update portfolio with current prices
      const priceMap = new Map<string, number>();
      priceMap.set(bar.symbol, bar.close);
      this.portfolio.updatePositionPrices(priceMap, bar.timestamp);

      // Generate signal from strategy
      const signal = this.strategy.onBar ? await this.strategy.onBar(bar.symbol, bar, [bar]) : null;

      // Process signal if generated
      if (signal && signal.action !== "HOLD") {
        const order = this.createOrder(bar, signal.action);

        if (order) {
          // Get next bar for fill (if fillOnClose=false, use next bar's open)
          const fillBar = this.config.fillOnClose ? bar : filteredBars[i + 1];

          if (fillBar) {
            const fill = this.fillSimulator.simulateMarketOrderFill(
              order,
              fillBar,
              avgVolume
            );

            if (fill) {
              this.portfolio.processFill(fill);

              // Notify strategy of fill
              this.strategy.onFill?.(fill);
            }
          }
        }
      }
    }

    // Calculate results
    const equityCurve = this.portfolio.getEquityCurve();
    const trades = this.portfolio.getClosedTrades();
    const costs = this.portfolio.getTransactionCosts();

    const metrics = PerformanceMetricsCalculator.calculate(
      equityCurve,
      trades,
      this.config.initialCapital,
      this.config.startDate,
      this.config.endDate,
      costs.commissions,
      costs.slippage
    );

    const drawdowns = PerformanceMetricsCalculator.calculateDrawdowns(equityCurve);

    const result: BacktestResult = {
      config: this.config,
      timestamp: new Date(),
      executionTimeMs: 0,
      metrics,
      trades,
      equityCurve,
      drawdownCurve: drawdowns,
      portfolioSnapshots: [this.portfolio.getSnapshot()],
      dailyReturns: equityCurve
        .map((point) => point.returns)
        .filter((r): r is number => r !== undefined),
      errors: [],
      statistics: {
        tradingDays: filteredBars.length,
        avgDailyReturn: 0,
        dailyReturnStdDev: 0,
        bestDay: 0,
        worstDay: 0,
        positiveDays: 0,
        negativeDays: 0,
        totalCommission: costs.commissions,
        totalSlippage: costs.slippage,
        avgWinDuration: 0,
        avgLossDuration: 0,
        maxConsecutiveWins: metrics.maxConsecutiveWins ?? 0,
        maxConsecutiveLosses: metrics.maxConsecutiveLosses ?? 0,
        avgTradesPerMonth: 0,
      },
    };

    // Finalize strategy
    this.strategy.finalize?.();

    return result;
  }

  /**
   * Create an order from a signal
   */
  private createOrder(bar: Bar, action: "BUY" | "SELL"): Order | null {
    const position = this.portfolio.getPosition(bar.symbol);

    // BUY logic
    if (action === "BUY") {
      // Don't buy if we already have a position
      if (position) {
        return null;
      }

      // Calculate position size (simple: use 95% of cash)
      const availableCash = this.portfolio.getCash() * 0.95;
      const quantity = Math.floor(availableCash / bar.close);

      if (quantity === 0) {
        return null;
      }

      return {
        id: `ORDER_${Date.now()}_${Math.random()}`,
        symbol: bar.symbol,
        type: "MARKET",
        side: "BUY",
        quantity,
        timeInForce: "DAY",
        createdAt: bar.timestamp,
        strategyName: this.strategy.name,
      };
    }

    // SELL logic
    if (action === "SELL") {
      // Can only sell if we have a position
      if (!position) {
        return null;
      }

      return {
        id: `ORDER_${Date.now()}_${Math.random()}`,
        symbol: bar.symbol,
        type: "MARKET",
        side: "SELL",
        quantity: position.quantity,
        timeInForce: "DAY",
        createdAt: bar.timestamp,
        strategyName: this.strategy.name,
      };
    }

    return null;
  }
}
