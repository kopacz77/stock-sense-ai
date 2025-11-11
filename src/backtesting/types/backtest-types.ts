/**
 * Core type definitions for the backtesting framework
 * These types define the data structures and interfaces used throughout the backtesting system
 */

import type { Signal } from "../../types/trading.js";

/**
 * Represents a single historical data point (OHLCV)
 * Also aliased as Bar for compatibility
 */
export interface HistoricalDataPoint {
  /** Trading symbol */
  symbol: string;
  /** Timestamp of the data point */
  timestamp: Date;
  /** Opening price */
  open: number;
  /** Highest price during the period */
  high: number;
  /** Lowest price during the period */
  low: number;
  /** Closing price */
  close: number;
  /** Trading volume */
  volume: number;
  /** Adjusted close price (for splits/dividends) */
  adjustedClose?: number;
  /** Stock split coefficient */
  splitCoefficient?: number;
  /** Dividend amount */
  dividendAmount?: number;
}

/**
 * Alias for HistoricalDataPoint (commonly used term in backtesting)
 */
export type Bar = HistoricalDataPoint;

/**
 * Configuration for a backtest run
 */
export interface BacktestConfig {
  /** Unique identifier for the backtest */
  id: string;
  /** Name/description of the backtest */
  name: string;
  /** Trading symbol(s) to backtest */
  symbols: string[];
  /** Start date for the backtest period */
  startDate: Date;
  /** End date for the backtest period */
  endDate: Date;
  /** Initial capital amount */
  initialCapital: number;
  /** Strategy configuration */
  strategy: {
    /** Strategy name/identifier */
    name: string;
    /** Strategy-specific parameters */
    parameters: Record<string, unknown>;
  };
  /** Commission model configuration */
  commission: {
    /** Commission type */
    type: "FIXED" | "PERCENTAGE" | "TIERED";
    /** Fixed fee per trade (if type is FIXED) */
    fixedFee?: number;
    /** Percentage fee (if type is PERCENTAGE) */
    percentage?: number;
    /** Minimum commission */
    minimum?: number;
  };
  /** Slippage model configuration */
  slippage: {
    /** Slippage type */
    type: "FIXED" | "PERCENTAGE" | "VOLUME_BASED";
    /** Fixed slippage amount (if type is FIXED) */
    fixedAmount?: number;
    /** Percentage slippage (if type is PERCENTAGE) */
    percentage?: number;
    /** Volume impact factor (if type is VOLUME_BASED) */
    volumeImpact?: number;
  };
  /** Slippage model instance (alternative to config) */
  slippageModel?: SlippageModel;
  /** Commission model instance (alternative to config) */
  commissionModel?: CommissionModel;
  /** Fill orders on bar close (true) or next bar open (false) */
  fillOnClose?: boolean;
  /** Risk management parameters */
  riskManagement?: {
    /** Maximum risk per trade (as decimal, e.g., 0.01 = 1%) */
    maxRiskPerTrade?: number;
    /** Maximum position size (as decimal, e.g., 0.25 = 25%) */
    maxPositionSize?: number;
    /** Stop loss multiplier (ATR multiplier) */
    stopLossMultiplier?: number;
    /** Take profit ratio */
    takeProfitRatio?: number;
  };
  /** Data source configuration */
  dataSource?: {
    /** Source type */
    type: "CSV" | "API" | "DATABASE";
    /** Source-specific configuration */
    config?: Record<string, unknown>;
  };
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a backtest run
 */
export interface BacktestResult {
  /** Reference to the backtest configuration */
  config: BacktestConfig;
  /** Execution timestamp */
  timestamp: Date;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Performance metrics */
  metrics: PerformanceMetrics;
  /** Equity curve data */
  equityCurve: EquityCurvePoint[];
  /** Drawdown curve data */
  drawdownCurve?: DrawdownPoint[];
  /** Daily returns for analysis */
  dailyReturns?: number[];
  /** All trades executed during the backtest */
  trades: Trade[];
  /** Daily portfolio snapshots */
  portfolioSnapshots: PortfolioSnapshot[];
  /** Any errors or warnings encountered */
  errors: BacktestError[];
  /** Statistics summary */
  statistics: BacktestStatistics;
}

/**
 * Performance metrics calculated from backtest results
 */
export interface PerformanceMetrics {
  /** Total return (decimal, e.g., 0.15 = 15%) */
  totalReturn: number;
  /** Total return in dollars */
  totalReturnDollar: number;
  /** Compound Annual Growth Rate (decimal) */
  cagr: number;
  /** Annualized return */
  annualizedReturn: number;
  /** Sharpe ratio (risk-adjusted return) */
  sharpeRatio: number;
  /** Sortino ratio (downside risk-adjusted return) */
  sortinoRatio: number;
  /** Calmar ratio (return over max drawdown) */
  calmarRatio: number;
  /** Maximum drawdown (decimal) */
  maxDrawdown: number;
  /** Maximum drawdown duration in days */
  maxDrawdownDuration: number;
  /** Win rate (decimal, e.g., 0.6 = 60%) */
  winRate: number;
  /** Total number of trades */
  totalTrades: number;
  /** Number of winning trades */
  winningTrades: number;
  /** Number of losing trades */
  losingTrades: number;
  /** Average winning trade amount */
  avgWin: number;
  /** Average losing trade amount */
  avgLoss: number;
  /** Average winning trade percentage */
  avgWinPercent?: number;
  /** Average losing trade percentage */
  avgLossPercent?: number;
  /** Largest winning trade */
  largestWin: number;
  /** Largest losing trade */
  largestLoss: number;
  /** Profit factor (gross profit / gross loss) */
  profitFactor: number;
  /** Payoff ratio (average win / average loss) */
  payoffRatio?: number;
  /** Expectancy (average profit per trade) */
  expectancy: number;
  /** Expectancy as a percentage */
  expectancyPercent?: number;
  /** Average holding period in days */
  avgHoldingPeriod?: number;
  /** Maximum consecutive winning trades */
  maxConsecutiveWins?: number;
  /** Maximum consecutive losing trades */
  maxConsecutiveLosses?: number;
  /** Volatility (annualized standard deviation) */
  volatility: number;
  /** Beta (market correlation) */
  beta?: number;
  /** Alpha (excess return) */
  alpha?: number;
  /** Value at Risk (95% confidence) */
  valueAtRisk95?: number;
  /** Conditional Value at Risk (expected shortfall) */
  conditionalVaR95?: number;
}

/**
 * Point on the equity curve
 */
export interface EquityCurvePoint {
  /** Timestamp */
  timestamp: Date;
  /** Alias for timestamp for compatibility */
  date?: Date;
  /** Total portfolio value */
  equity: number;
  /** Cash available */
  cash: number;
  /** Value of open positions */
  positionsValue: number;
  /** Alias for positionsValue for compatibility */
  marketValue?: number;
  /** Cumulative return (decimal) */
  cumulativeReturn: number;
  /** Alias for cumulativeReturn for compatibility */
  cumulativeReturns?: number;
  /** Period return (decimal) */
  returns?: number;
  /** Daily return (decimal) */
  dailyReturn: number;
  /** Current drawdown (decimal) */
  drawdown: number;
}

/**
 * Represents a completed trade
 */
export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Trading symbol */
  symbol: string;
  /** Trade type */
  type?: "LONG" | "SHORT";
  /** Side (BUY/SELL) for compatibility */
  side?: "BUY" | "SELL";
  /** Entry timestamp */
  entryTime?: Date;
  /** Alias for entryTime */
  entryDate?: Date;
  /** Entry price */
  entryPrice: number;
  /** Quantity */
  quantity: number;
  /** Exit timestamp */
  exitTime?: Date;
  /** Alias for exitTime */
  exitDate?: Date;
  /** Exit price */
  exitPrice: number;
  /** Exit reason */
  exitReason: "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "END_OF_BACKTEST" | "STRATEGY_EXIT";
  /** Gross profit/loss */
  grossPnL?: number;
  /** Commission paid */
  commission: number;
  /** Slippage cost */
  slippage: number;
  /** Total cost (commission + slippage) */
  totalCost?: number;
  /** Net profit/loss */
  netPnL?: number;
  /** Net PnL (alternative naming) */
  netPnl?: number;
  /** Alias for netPnL for compatibility */
  pnl: number;
  /** Return on investment (decimal) */
  returnPct?: number;
  /** Alias for returnPct for compatibility */
  pnlPercent: number;
  /** Maximum adverse excursion (worst unrealized loss) */
  mae?: number;
  /** Maximum favorable excursion (best unrealized profit) */
  mfe?: number;
  /** Hold duration in days */
  holdDuration?: number;
  /** Alias for holdDuration for compatibility */
  holdingPeriod: number;
  /** Strategy name */
  strategyName?: string;
  /** Associated entry signal */
  entrySignal?: Signal;
  /** Associated exit signal */
  exitSignal?: Signal;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Represents an open position
 */
export interface Position {
  /** Position identifier */
  id?: string;
  /** Trading symbol */
  symbol: string;
  /** Position type */
  type?: "LONG" | "SHORT";
  /** Entry timestamp */
  entryTime?: Date;
  /** Alias for entryTime for compatibility */
  entryDate?: Date;
  /** Entry price (optional, use avgEntryPrice if not present) */
  entryPrice?: number;
  /** Average entry price for multiple buys */
  avgEntryPrice?: number;
  /** Current quantity */
  quantity: number;
  /** Current market price */
  currentPrice: number;
  /** Current market value */
  marketValue?: number;
  /** Unrealized profit/loss */
  unrealizedPnL: number;
  /** Unrealized profit/loss percentage */
  unrealizedPnLPercent?: number;
  /** Realized profit/loss */
  realizedPnL?: number;
  /** Total profit/loss (realized + unrealized) */
  totalPnL?: number;
  /** Stop loss price */
  stopLoss?: number;
  /** Take profit price */
  takeProfit?: number;
  /** Commission paid on entry */
  entryCommission?: number;
  /** Slippage on entry */
  entrySlippage?: number;
  /** Associated entry signal */
  entrySignal?: Signal;
  /** Maximum adverse excursion (running) */
  currentMae?: number;
  /** Maximum favorable excursion (running) */
  currentMfe?: number;
  /** Last update timestamp */
  lastUpdateDate?: Date;
  /** Position value */
  value?: number;
  /** Strategy name that created this position */
  strategyName?: string;
}

/**
 * Snapshot of portfolio state at a point in time
 */
export interface PortfolioSnapshot {
  /** Timestamp */
  timestamp: Date;
  /** Total portfolio value */
  totalValue: number;
  /** Total equity (alias for totalValue) */
  equity?: number;
  /** Cash available */
  cash: number;
  /** Open positions */
  positions: Position[] | Map<string, Position>;
  /** Total position value */
  positionsValue?: number;
  /** Unrealized PnL */
  unrealizedPnL?: number;
  /** Realized PnL */
  realizedPnL?: number;
  /** Number of trades executed to date */
  tradesCount?: number;
  /** Leverage ratio */
  leverage?: number;
  /** Margin used */
  marginUsed?: number;
}

/**
 * Event types for event-driven backtesting
 */
export type BacktestEventType = "MARKET_DATA" | "SIGNAL" | "ORDER" | "FILL";

/**
 * Base event interface
 */
export interface BacktestEvent {
  /** Event type */
  type: BacktestEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Event priority (lower = higher priority) */
  priority: number;
}

/**
 * Market data event
 */
export interface MarketDataEvent extends BacktestEvent {
  type: "MARKET_DATA";
  /** Market data point */
  data: HistoricalDataPoint;
}

/**
 * Signal event (generated by strategy)
 */
export interface SignalEvent extends BacktestEvent {
  type: "SIGNAL";
  /** Trading signal */
  signal: Signal;
}

/**
 * Order event (generated from signal)
 */
export interface OrderEvent extends BacktestEvent {
  type: "ORDER";
  /** Order details */
  order: Order;
}

/**
 * Fill event (order execution result)
 */
export interface FillEvent extends BacktestEvent {
  type: "FILL";
  /** Fill details */
  fill: Fill;
}

/**
 * Order representation
 */
export interface Order {
  /** Unique order ID */
  id: string;
  /** Trading symbol */
  symbol: string;
  /** Order type */
  type: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  /** Order side */
  side: "BUY" | "SELL";
  /** Order quantity */
  quantity: number;
  /** Limit price (for limit orders) */
  limitPrice?: number;
  /** Stop price (for stop orders) */
  stopPrice?: number;
  /** Time in force */
  timeInForce?: "DAY" | "GTC" | "IOC" | "FOK";
  /** Timestamp when order was created */
  createdAt: Date;
  /** Associated signal */
  signal?: Signal;
  /** Stop loss price */
  stopLoss?: number;
  /** Take profit price */
  takeProfit?: number;
  /** Strategy name */
  strategyName?: string;
}

/**
 * Order fill (execution result)
 */
export interface Fill {
  /** Unique fill ID */
  id?: string;
  /** Associated order ID */
  orderId: string;
  /** Trading symbol */
  symbol: string;
  /** Fill side */
  side: "BUY" | "SELL";
  /** Fill quantity */
  quantity: number;
  /** Fill price */
  price: number;
  /** Fill timestamp */
  timestamp: Date;
  /** Commission charged */
  commission: number;
  /** Slippage amount */
  slippage: number;
  /** Strategy name */
  strategyName?: string;
}

/**
 * Statistics summary for backtest
 */
export interface BacktestStatistics {
  /** Number of trading days */
  tradingDays: number;
  /** Average daily return */
  avgDailyReturn: number;
  /** Daily return volatility */
  dailyReturnStdDev: number;
  /** Best day return */
  bestDay: number;
  /** Worst day return */
  worstDay: number;
  /** Number of positive days */
  positiveDays: number;
  /** Number of negative days */
  negativeDays: number;
  /** Average winning trade duration (days) */
  avgWinDuration: number;
  /** Average losing trade duration (days) */
  avgLossDuration: number;
  /** Maximum consecutive wins */
  maxConsecutiveWins: number;
  /** Maximum consecutive losses */
  maxConsecutiveLosses: number;
  /** Total commission paid */
  totalCommission: number;
  /** Total slippage cost */
  totalSlippage: number;
  /** Average trades per month */
  avgTradesPerMonth: number;
}

/**
 * Backtest error
 */
export interface BacktestError {
  /** Error timestamp */
  timestamp: Date;
  /** Error severity */
  severity: "WARNING" | "ERROR" | "CRITICAL";
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Associated data */
  data?: Record<string, unknown>;
}

/**
 * Strategy interface for backtesting
 */
export interface BacktestStrategy {
  /** Strategy name */
  getName(): string;
  /** Strategy name property (alternative) */
  name?: string;
  /** Generate signal from historical data */
  generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[],
  ): Promise<Signal>;
  /** Called on each new bar */
  onBar?(symbol: string, bar: Bar, historicalData: Bar[]): Promise<Signal | null>;
  /** Called when a fill occurs */
  onFill?(fill: Fill): Promise<void>;
  /** Optional strategy initialization */
  initialize?(): Promise<void>;
  /** Optional cleanup */
  cleanup?(): Promise<void>;
  /** Called at end of backtest */
  finalize?(): Promise<void>;
}

/**
 * Data provider interface
 */
export interface DataProvider {
  /** Load historical data for a symbol */
  loadData(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalDataPoint[]>;
  /** Check if data is available */
  hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean>;
}

/**
 * Commission model interface
 */
export interface CommissionModel {
  /** Model type */
  type: string;
  /** Calculate commission for an order */
  calculate(order: Order, fillPrice?: number): number;
}

/**
 * Slippage model interface
 */
export interface SlippageModel {
  /** Model type */
  type: string;
  /** Calculate slippage for an order */
  calculate(order: Order, bar?: Bar, avgVolume?: number, spread?: number): number;
}

/**
 * Drawdown point for tracking drawdown over time
 */
export interface DrawdownPoint {
  timestamp: Date;
  date?: Date; // Alias for timestamp
  equity: number;
  peak: number;
  drawdown: number;
  drawdownPercent: number;
  drawdownDuration?: number; // Duration in days
}

/**
 * Alias for HistoricalDataPoint with adjusted prices
 */
export type BarAdjusted = HistoricalDataPoint;

/**
 * Union type for all backtest events
 */
export type Event = MarketDataEvent | SignalEvent | OrderEvent | FillEvent;

/**
 * Event type enum
 */
export type EventType = 'MARKET_DATA' | 'SIGNAL' | 'ORDER' | 'FILL';

/**
 * Order side enum
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Re-export Signal from trading types for convenience
 */
export type { Signal } from "../../types/trading.js";
