/**
 * Core Type Definitions for Paper Trading System
 * Comprehensive types for virtual trading, orders, positions, and performance tracking
 */

import type { Signal } from "../../types/trading.js";
import type { CommissionModel, SlippageModel } from "../../backtesting/types/backtest-types.js";

/**
 * Order Types supported by the paper trading system
 */
export type OrderType = "MARKET" | "LIMIT" | "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP";

/**
 * Order Side
 */
export type OrderSide = "BUY" | "SELL";

/**
 * Order Status Lifecycle
 */
export type OrderStatus = "PENDING" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";

/**
 * Order Time in Force
 */
export type TimeInForce = "DAY" | "GTC" | "IOC" | "FOK";

/**
 * Exit Reason for Trades
 */
export type ExitReason = "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP" | "MANUAL" | "TIME_LIMIT" | "RISK_LIMIT";

/**
 * Paper Trading Order
 */
export interface PaperOrder {
  id: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  quantity: number;
  status: OrderStatus;

  // Pricing
  limitPrice?: number; // For LIMIT orders
  stopPrice?: number; // For STOP_LOSS orders
  trailingAmount?: number; // For TRAILING_STOP (dollar amount or percentage)
  trailingPercent?: number; // For TRAILING_STOP percentage

  // Execution
  fillPrice?: number;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  filledAt?: Date;
  cancelledAt?: Date;
  expiresAt?: Date;

  // Associated data
  signal?: Signal;
  strategyName?: string;

  // Risk management
  stopLoss?: number;
  takeProfit?: number;

  // Metadata
  timeInForce: TimeInForce;
  commissionPaid: number;
  slippagePaid: number;
  notes?: string;
}

/**
 * Paper Trading Position
 */
export interface PaperPosition {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";

  // Entry information
  entryPrice: number;
  entryTime: Date;
  quantity: number;

  // Current state
  currentPrice: number;
  currentValue: number;
  lastUpdate: Date;

  // P&L tracking
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number; // From partial closes

  // Risk management
  stopLoss?: number;
  takeProfit?: number;
  trailingStopPrice?: number;

  // Costs
  entryCommission: number;
  entrySlippage: number;
  totalCommissions: number; // Including partial closes
  totalSlippage: number; // Including partial closes

  // Tracking
  highestPrice: number; // For MAE/MFE
  lowestPrice: number;
  mae: number; // Maximum Adverse Excursion
  mfe: number; // Maximum Favorable Excursion

  // Metadata
  entrySignal?: Signal;
  strategyName?: string;
  notes?: string;
}

/**
 * Completed Trade Record
 */
export interface PaperTrade {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";

  // Entry
  entryTime: Date;
  entryPrice: number;
  entrySignal?: Signal;

  // Exit
  exitTime: Date;
  exitPrice: number;
  exitReason: ExitReason;
  exitSignal?: Signal;

  // Position details
  quantity: number;

  // P&L
  grossPnL: number;
  commission: number;
  slippage: number;
  netPnL: number;
  returnPercent: number;

  // Risk metrics
  mae: number;
  mfe: number;
  rValue: number; // R-multiple (profit/initial risk)

  // Duration
  holdDuration: number; // in milliseconds
  holdDurationDays: number;

  // Metadata
  strategyName?: string;
  notes?: string;
}

/**
 * Portfolio State
 */
export interface PortfolioState {
  // Balances
  cash: number;
  totalValue: number;
  positionsValue: number;

  // Positions
  positions: Map<string, PaperPosition>;
  openOrders: Map<string, PaperOrder>;

  // P&L
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  totalPnL: number;

  // Performance
  initialCapital: number;
  totalReturn: number;
  totalReturnPercent: number;

  // Risk metrics
  portfolioRisk: number;
  maxDrawdown: number;
  currentDrawdown: number;

  // Statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  // Costs
  totalCommissions: number;
  totalSlippage: number;

  // Timestamp
  lastUpdate: Date;
}

/**
 * Paper Trading Configuration
 */
export interface PaperTradingConfig {
  // Capital
  initialCapital: number;

  // Execution
  slippageModel: SlippageModel;
  commissionModel: CommissionModel;

  // Risk limits
  maxPositionSize: number; // Maximum $ per position
  maxPositionPercent: number; // Maximum % of portfolio per position
  maxPositions: number; // Maximum number of concurrent positions
  maxDailyLoss: number; // Maximum daily loss in $
  maxDailyLossPercent: number; // Maximum daily loss in %
  maxTotalExposure: number; // Maximum total position value as % of portfolio

  // Position limits per symbol
  maxSymbolConcentration: number; // Maximum % in single symbol

  // Execution settings
  executeOnClose: boolean; // Execute at bar close or next bar open
  partialFills: boolean; // Allow partial fills for large orders
  maxSlippageBPS: number; // Maximum acceptable slippage in BPS

  // Market hours enforcement
  enforceMarketHours: boolean;
  marketOpenHour: number; // 9 for 9:30 AM ET
  marketOpenMinute: number; // 30
  marketCloseHour: number; // 16 for 4:00 PM ET
  marketCloseMinute: number; // 0
  timezone: string; // "America/New_York"

  // Order expiration
  defaultTimeInForce: TimeInForce;
  defaultOrderExpiration: number; // in milliseconds (0 = no expiration)

  // Data refresh
  dataRefreshInterval: number; // in milliseconds (60000 = 1 min)

  // Persistence
  enableEncryption: boolean;
  backupEnabled: boolean;
  backupInterval: number; // in milliseconds
}

/**
 * Trade Journal Entry
 */
export interface TradeJournalEntry {
  timestamp: Date;
  type: "ORDER" | "FILL" | "CANCEL" | "UPDATE" | "POSITION_OPEN" | "POSITION_CLOSE" | "RISK_EVENT";

  // Order/Trade data
  orderId?: string;
  tradeId?: string;
  symbol?: string;

  // Event details
  action: string;
  details: Record<string, unknown>;

  // Portfolio snapshot
  portfolioValue: number;
  cash: number;
  positionsValue: number;

  // Metadata
  strategyName?: string;
  notes?: string;
}

/**
 * Performance Snapshot
 */
export interface PerformanceSnapshot {
  timestamp: Date;

  // Portfolio value
  totalValue: number;
  cash: number;
  positionsValue: number;

  // Returns
  dailyReturn: number;
  weeklyReturn: number;
  monthlyReturn: number;
  totalReturn: number;

  // Risk metrics
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;

  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;

  // Advanced metrics
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingPeriod: number;

  // Cost analysis
  totalCommissions: number;
  totalSlippage: number;

  // Comparison
  benchmarkReturn?: number;
  alpha?: number;
  beta?: number;
}

/**
 * Risk Validation Result
 */
export interface RiskValidationResult {
  allowed: boolean;
  reasons: string[];
  limits: {
    positionSize?: boolean;
    positionPercent?: boolean;
    maxPositions?: boolean;
    dailyLoss?: boolean;
    symbolConcentration?: boolean;
    totalExposure?: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Market Data Update
 */
export interface MarketDataUpdate {
  symbol: string;
  timestamp: Date;
  price: number;
  bid?: number;
  ask?: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

/**
 * Engine Status
 */
export interface EngineStatus {
  running: boolean;
  startTime?: Date;
  uptime?: number; // in milliseconds
  lastUpdate?: Date;

  // Statistics
  totalOrders: number;
  filledOrders: number;
  cancelledOrders: number;

  // Performance
  currentValue: number;
  dailyPnL: number;
  totalPnL: number;

  // Active positions
  activePositions: number;
  openOrders: number;

  // Errors
  errors: number;
  lastError?: string;
}

/**
 * Paper Trading Event
 */
export interface PaperTradingEvent {
  type: "ORDER_CREATED" | "ORDER_FILLED" | "ORDER_CANCELLED" | "POSITION_OPENED" | "POSITION_CLOSED" | "RISK_LIMIT_BREACH" | "ERROR";
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Storage File Paths
 */
export interface StorageConfig {
  baseDir: string;
  portfolioStateFile: string;
  ordersFile: string;
  tradesFile: string;
  journalFile: string;
  performanceFile: string;
  backupDir: string;
}
