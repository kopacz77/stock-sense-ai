# Paper Trading System Design - Stock Sense AI

**Version:** 1.0
**Date:** November 8, 2025
**Status:** Design Document
**Security Level:** High (Encrypted Storage Required)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [Class/Interface Design](#classinterface-design)
5. [CLI Command Design](#cli-command-design)
6. [Order Management System](#order-management-system)
7. [Position & Portfolio Management](#position--portfolio-management)
8. [Order Execution Simulation](#order-execution-simulation)
9. [Transaction Cost Model](#transaction-cost-model)
10. [Real-time P&L Calculation](#real-time-pl-calculation)
11. [Trade Journal & History](#trade-journal--history)
12. [Performance Reporting](#performance-reporting)
13. [Risk Limits Enforcement](#risk-limits-enforcement)
14. [Integration with Existing Systems](#integration-with-existing-systems)
15. [API Endpoints for Web Dashboard](#api-endpoints-for-web-dashboard)
16. [Persistence Strategy](#persistence-strategy)
17. [Security & Compliance](#security--compliance)
18. [Code Examples](#code-examples)
19. [Testing Strategy](#testing-strategy)
20. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

The Paper Trading System for Stock Sense AI is designed to provide realistic trading simulation capabilities while maintaining the platform's security-first architecture. The system enables users to validate trading strategies with simulated capital before committing real funds.

### Key Features

- **Virtual Portfolio Management**: Simulated cash and position tracking with realistic constraints
- **Advanced Order Types**: Market, Limit, Stop-Loss, Take-Profit, Trailing Stop
- **Realistic Order Fills**: Price slippage, partial fills, market impact simulation
- **Transaction Costs**: Commission, fees, spread modeling
- **Real-time P&L**: Live profit/loss calculations with market data
- **Comprehensive Journal**: Detailed trade history with performance attribution
- **Risk Enforcement**: Integration with existing RiskManager for position sizing
- **Encrypted Storage**: AES-256-CBC encryption for all trading data
- **Strategy Integration**: Seamless connection to Mean Reversion & Momentum strategies
- **Web Dashboard**: Real-time portfolio visualization and trade monitoring

### Design Principles

1. **Security First**: All trading data encrypted at rest using existing SecureConfig patterns
2. **Realistic Simulation**: Accurate modeling of real-world trading conditions
3. **Zero Breaking Changes**: Extends existing architecture without modifying core systems
4. **Type Safety**: Full TypeScript type coverage with Zod validation
5. **Auditability**: Complete trade history with immutable journal entries
6. **Performance**: Efficient data structures for real-time updates

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Stock Sense AI CLI                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├──────────────────────────┐
                              │                          │
                              ▼                          ▼
                    ┌──────────────────┐      ┌──────────────────┐
                    │ Existing Systems │      │ New Paper Trading│
                    ├──────────────────┤      ├──────────────────┤
                    │• MonitoringService│     │• PaperTradingEngine│
                    │• Strategies      │      │• OrderManager    │
                    │• RiskManager     │      │• PortfolioManager│
                    │• MarketDataService│     │• TradeJournal    │
                    │• AlertService    │      │• ExecutionSim    │
                    └────────┬─────────┘      └────────┬─────────┘
                             │                         │
                             │    ┌───────────────────┐│
                             └───▶│  Integration Layer││
                                  └───────────┬───────┘│
                                              │        │
                    ┌─────────────────────────┼────────┘
                    │                         │
                    ▼                         ▼
          ┌──────────────────┐    ┌──────────────────┐
          │ Encrypted Storage│    │  Market Data API  │
          ├──────────────────┤    ├──────────────────┤
          │• Portfolios      │    │• Real-time Quotes │
          │• Orders          │    │• Historical Data  │
          │• Positions       │    │• Fill Simulation  │
          │• Trades          │    └──────────────────┘
          │• Performance     │
          └──────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │  Web Dashboard   │
          ├──────────────────┤
          │• Portfolio View  │
          │• Order Book      │
          │• Trade History   │
          │• Performance     │
          │• Charts          │
          └──────────────────┘
```

### Component Interaction Flow

```
User Command (CLI)
    │
    ├──▶ PaperTradingEngine.executeTrade(signal)
    │         │
    │         ├──▶ RiskManager.calculatePosition(params)
    │         │         │
    │         │         └──▶ Returns: positionSize, stopLoss, takeProfit
    │         │
    │         ├──▶ OrderManager.createOrder(orderDetails)
    │         │         │
    │         │         └──▶ Validates, assigns ID, persists
    │         │
    │         ├──▶ ExecutionSimulator.simulateFill(order)
    │         │         │
    │         │         ├──▶ MarketDataService.getCurrentPrice()
    │         │         ├──▶ Calculate slippage
    │         │         ├──▶ Apply transaction costs
    │         │         └──▶ Returns: ExecutionResult
    │         │
    │         ├──▶ PortfolioManager.updatePosition(execution)
    │         │         │
    │         │         ├──▶ Update cash balance
    │         │         ├──▶ Create/update position
    │         │         ├──▶ Calculate P&L
    │         │         └──▶ Persist to encrypted storage
    │         │
    │         ├──▶ TradeJournal.recordTrade(trade)
    │         │         │
    │         │         └──▶ Immutable append to journal
    │         │
    │         └──▶ AlertService.sendAlert(tradeNotification)
    │
    └──▶ Return: TradeConfirmation
```

---

## Database Schema

### Design Decision: Encrypted JSON Files

Following the existing architecture pattern (see `src/config/secure-config.ts`), we use encrypted JSON files for data persistence:

**Advantages:**
- Consistent with existing security model
- No external database dependency
- Easy backup/restore
- Strong encryption (AES-256-CBC)
- OS keychain integration for key management
- Portable across environments

**File Structure:**
```
data/
  paper-trading/
    portfolios.encrypted      # Active portfolio state
    orders.encrypted          # All orders (pending + filled)
    positions.encrypted       # Current positions
    trades.jsonl.encrypted    # Immutable trade journal (append-only)
    performance.encrypted     # Calculated performance metrics
    backups/
      portfolio-{timestamp}.encrypted
```

### 1. Portfolio Schema

```typescript
interface PaperPortfolio {
  id: string;                    // UUID v4
  name: string;                  // e.g., "Mean Reversion Test"
  strategy?: string;             // Optional strategy name
  initialBalance: number;        // Starting capital
  currentBalance: number;        // Available cash
  totalValue: number;            // Cash + position values
  createdAt: Date;
  updatedAt: Date;
  status: "ACTIVE" | "PAUSED" | "CLOSED";

  // Risk parameters (inherits from RiskManager)
  riskParams: {
    maxRiskPerTrade: number;     // 0.01 = 1%
    maxPositionSize: number;     // 0.25 = 25%
    stopLossMultiplier: number;  // 2.0 = 2x ATR
    takeProfitRatio: number;     // 2.0 = 2:1 R:R
    maxCorrelatedPositions: number;
    maxSectorExposure: number;   // 0.3 = 30%
  };

  // Transaction costs
  commissionModel: {
    type: "FIXED" | "PERCENTAGE" | "TIERED";
    fixedFee?: number;           // e.g., $1 per trade
    percentageFee?: number;      // e.g., 0.0001 = 0.01%
    minFee?: number;
    maxFee?: number;
  };

  // Settings
  settings: {
    enableSlippage: boolean;
    slippageModel: "FIXED_BPS" | "VOLUME_BASED" | "SPREAD_BASED";
    fixedSlippageBps?: number;   // Basis points
    enablePartialFills: boolean;
    marketImpactFactor: number;  // 0.0 - 1.0
    requireMarketHours: boolean;
  };

  // Statistics (denormalized for quick access)
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalReturn: number;
    totalReturnPercent: number;
    unrealizedPnL: number;
    realizedPnL: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    largestWin: number;
    largestLoss: number;
  };

  // Metadata
  metadata: {
    description?: string;
    tags: string[];
    notes: string;
  };
}
```

### 2. Order Schema

```typescript
interface PaperOrder {
  id: string;                    // UUID v4
  portfolioId: string;
  symbol: string;

  // Order details
  type: "MARKET" | "LIMIT" | "STOP_LOSS" | "STOP_LIMIT" | "TRAILING_STOP";
  side: "BUY" | "SELL";
  quantity: number;

  // Pricing
  limitPrice?: number;           // For LIMIT orders
  stopPrice?: number;            // For STOP orders
  trailingAmount?: number;       // For TRAILING_STOP ($ or %)
  trailingPercent?: number;      // For percentage trailing stops

  // Time in force
  timeInForce: "GTC" | "DAY" | "IOC" | "FOK";
  expiresAt?: Date;              // For DAY or custom expiry

  // Status tracking
  status: "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";
  filledQuantity: number;
  remainingQuantity: number;

  // Execution details
  fills: Array<{
    id: string;
    timestamp: Date;
    price: number;
    quantity: number;
    commission: number;
    fees: number;
    liquidity: "TAKER" | "MAKER";
  }>;

  avgFillPrice?: number;
  totalCommission: number;
  totalFees: number;

  // Timestamps
  createdAt: Date;
  submittedAt: Date;
  filledAt?: Date;
  cancelledAt?: Date;

  // Source
  source: "MANUAL" | "STRATEGY" | "RISK_MANAGEMENT";
  strategyName?: string;
  signalId?: string;             // Link to original signal

  // Related orders (for OCO, bracket orders)
  linkedOrders?: {
    stopLossOrderId?: string;
    takeProfitOrderId?: string;
    parentOrderId?: string;
  };

  // Rejection details
  rejectionReason?: string;

  // Metadata
  notes?: string;
  tags: string[];
}
```

### 3. Position Schema

```typescript
interface PaperPosition {
  id: string;                    // UUID v4
  portfolioId: string;
  symbol: string;

  // Position details
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;            // Average entry price
  currentPrice: number;
  marketValue: number;           // quantity * currentPrice

  // Cost basis
  totalCost: number;             // Including commissions/fees
  costBasis: number;             // Cost per share

  // P&L
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;           // From partial closes

  // Risk management
  stopLoss?: number;
  takeProfit?: number;
  riskAmount: number;            // $ at risk
  riskPercentage: number;        // % of portfolio

  // Tracking
  openedAt: Date;
  updatedAt: Date;
  closedAt?: Date;

  // Strategy attribution
  strategy: string;
  signalConfidence?: number;

  // Trade IDs that created this position
  entryTradeIds: string[];
  exitTradeIds: string[];

  // Performance metrics
  holdingPeriod: number;         // Days
  maxUnrealizedProfit: number;
  maxUnrealizedLoss: number;

  // Sector/industry (for correlation tracking)
  sector?: string;
  industry?: string;

  // Metadata
  notes?: string;
  tags: string[];
}
```

### 4. Trade Journal Schema (Append-Only JSONL)

```typescript
interface TradeJournalEntry {
  id: string;                    // UUID v4
  portfolioId: string;
  orderId: string;
  positionId?: string;           // If part of existing position

  // Trade details
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  totalValue: number;

  // Costs
  commission: number;
  fees: number;
  slippage: number;
  slippageBps: number;
  totalCost: number;
  netAmount: number;             // totalValue ± totalCost

  // Execution
  executionType: "MARKET" | "LIMIT" | "STOP";
  fillType: "FULL" | "PARTIAL";
  liquidity: "TAKER" | "MAKER";

  // Timing
  timestamp: Date;
  orderCreatedAt: Date;
  executionTime: number;         // ms from order to fill

  // Market conditions at execution
  marketConditions: {
    bidPrice: number;
    askPrice: number;
    spread: number;
    spreadBps: number;
    volume: number;
    volatility?: number;
    marketHours: boolean;
  };

  // Strategy context
  source: "MANUAL" | "STRATEGY" | "RISK_MANAGEMENT";
  strategy?: string;
  signal?: {
    action: "BUY" | "SELL";
    confidence: number;
    strength: number;
    reasons: string[];
  };

  // Portfolio state at time of trade
  portfolioSnapshot: {
    balanceBefore: number;
    balanceAfter: number;
    totalValueBefore: number;
    totalValueAfter: number;
    positionCount: number;
  };

  // P&L impact (for closing trades)
  pnlImpact?: {
    realizedPnL: number;
    realizedPnLPercent: number;
    holdingPeriod: number;       // Days
    entryPrice: number;
    exitPrice: number;
    returnOnInvestment: number;
  };

  // Notes
  notes?: string;
  tags: string[];

  // Immutability marker
  readonly: true;
  createdAt: Date;
}
```

### 5. Performance Metrics Schema

```typescript
interface PerformanceMetrics {
  portfolioId: string;
  calculatedAt: Date;
  period: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME";
  startDate: Date;
  endDate: Date;

  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;

  // P&L
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;

  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;

  // Win metrics
  winRate: number;               // %
  avgWin: number;
  avgWinPercent: number;
  largestWin: number;
  largestWinPercent: number;
  avgWinHoldingPeriod: number;   // Days

  // Loss metrics
  avgLoss: number;
  avgLossPercent: number;
  largestLoss: number;
  largestLossPercent: number;
  avgLossHoldingPeriod: number;

  // Risk metrics
  profitFactor: number;          // Gross profit / gross loss
  expectancy: number;            // Expected $ per trade
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;

  // Drawdown analysis
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxDrawdownDuration: number;   // Days
  currentDrawdown: number;
  currentDrawdownPercent: number;

  // Consistency metrics
  consecutiveWins: number;
  consecutiveLosses: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;

  // Equity curve data points
  equityCurve: Array<{
    date: Date;
    balance: number;
    equity: number;
    drawdown: number;
    drawdownPercent: number;
  }>;

  // Monthly returns
  monthlyReturns: Array<{
    month: string;               // YYYY-MM
    return: number;
    returnPercent: number;
  }>;

  // Strategy breakdown
  strategyPerformance: Array<{
    strategy: string;
    trades: number;
    winRate: number;
    totalPnL: number;
    profitFactor: number;
  }>;

  // Symbol breakdown
  symbolPerformance: Array<{
    symbol: string;
    trades: number;
    winRate: number;
    totalPnL: number;
    avgHoldingPeriod: number;
  }>;
}
```

### Schema Validation with Zod

All schemas include Zod validation for runtime type safety:

```typescript
import { z } from "zod";

const PaperPortfolioSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  strategy: z.string().optional(),
  initialBalance: z.number().positive(),
  currentBalance: z.number().nonnegative(),
  totalValue: z.number().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]),
  // ... rest of schema
});
```

---

## Class/Interface Design

### Core Classes

#### 1. PaperTradingEngine

The main orchestrator for paper trading operations.

```typescript
/**
 * PaperTradingEngine - Main paper trading orchestrator
 *
 * Responsibilities:
 * - Coordinate between all paper trading components
 * - Execute trades based on signals
 * - Manage portfolio lifecycle
 * - Integrate with existing strategy and monitoring systems
 */
export class PaperTradingEngine {
  private portfolioManager: PortfolioManager;
  private orderManager: OrderManager;
  private executionSimulator: ExecutionSimulator;
  private tradeJournal: TradeJournal;
  private performanceCalculator: PerformanceCalculator;
  private riskManager: RiskManager;
  private marketDataService: MarketDataService;
  private alertService: AlertService;

  constructor(config: PaperTradingConfig) {
    // Initialize all components
  }

  /**
   * Create a new paper trading portfolio
   */
  async createPortfolio(params: CreatePortfolioParams): Promise<PaperPortfolio>;

  /**
   * Execute a trade based on a signal from strategy
   */
  async executeTrade(
    portfolioId: string,
    signal: Signal,
    options?: TradeOptions
  ): Promise<TradeResult>;

  /**
   * Place a manual order
   */
  async placeOrder(
    portfolioId: string,
    orderParams: OrderParams
  ): Promise<PaperOrder>;

  /**
   * Cancel an existing order
   */
  async cancelOrder(
    portfolioId: string,
    orderId: string
  ): Promise<void>;

  /**
   * Close a position (market order)
   */
  async closePosition(
    portfolioId: string,
    positionId: string,
    reason?: string
  ): Promise<TradeResult>;

  /**
   * Get current portfolio state
   */
  async getPortfolio(portfolioId: string): Promise<PaperPortfolio>;

  /**
   * Get all open positions
   */
  async getPositions(portfolioId: string): Promise<PaperPosition[]>;

  /**
   * Get order history
   */
  async getOrders(
    portfolioId: string,
    filters?: OrderFilters
  ): Promise<PaperOrder[]>;

  /**
   * Get trade history
   */
  async getTradeHistory(
    portfolioId: string,
    filters?: TradeFilters
  ): Promise<TradeJournalEntry[]>;

  /**
   * Calculate and retrieve performance metrics
   */
  async getPerformanceMetrics(
    portfolioId: string,
    period?: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME"
  ): Promise<PerformanceMetrics>;

  /**
   * Update positions with latest market data
   */
  async updatePositions(portfolioId: string): Promise<void>;

  /**
   * Process pending orders (check if limits/stops triggered)
   */
  async processPendingOrders(portfolioId: string): Promise<void>;

  /**
   * Generate performance report
   */
  async generateReport(
    portfolioId: string,
    options?: ReportOptions
  ): Promise<PerformanceReport>;

  /**
   * Export portfolio data for backup
   */
  async exportPortfolio(
    portfolioId: string,
    format: "JSON" | "CSV"
  ): Promise<string>;

  /**
   * Import portfolio from backup
   */
  async importPortfolio(data: string, format: "JSON" | "CSV"): Promise<string>;
}
```

#### 2. PortfolioManager

Manages portfolio state, cash balance, and positions.

```typescript
/**
 * PortfolioManager - Portfolio state management
 *
 * Responsibilities:
 * - Maintain portfolio state
 * - Track cash balance
 * - Manage positions lifecycle
 * - Calculate portfolio metrics
 * - Persist portfolio data
 */
export class PortfolioManager {
  private secureStorage: SecureStorageService;
  private marketDataService: MarketDataService;

  constructor() {
    this.secureStorage = new SecureStorageService();
  }

  async createPortfolio(params: CreatePortfolioParams): Promise<PaperPortfolio>;
  async getPortfolio(portfolioId: string): Promise<PaperPortfolio>;
  async updatePortfolio(portfolio: PaperPortfolio): Promise<void>;
  async deletePortfolio(portfolioId: string): Promise<void>;
  async listPortfolios(): Promise<PaperPortfolio[]>;

  // Cash management
  async updateCashBalance(
    portfolioId: string,
    amount: number,
    reason: string
  ): Promise<number>;

  async getAvailableCash(portfolioId: string): Promise<number>;

  // Position management
  async createPosition(
    portfolioId: string,
    positionData: CreatePositionData
  ): Promise<PaperPosition>;

  async updatePosition(
    portfolioId: string,
    positionId: string,
    updates: Partial<PaperPosition>
  ): Promise<PaperPosition>;

  async closePosition(
    portfolioId: string,
    positionId: string
  ): Promise<PaperPosition>;

  async getPositions(
    portfolioId: string,
    filters?: PositionFilters
  ): Promise<PaperPosition[]>;

  async getPosition(
    portfolioId: string,
    positionId: string
  ): Promise<PaperPosition>;

  // Portfolio calculations
  async calculateTotalValue(portfolioId: string): Promise<number>;
  async calculateUnrealizedPnL(portfolioId: string): Promise<number>;
  async calculateRealizedPnL(portfolioId: string): Promise<number>;

  // Position updates with live market data
  async updatePositionPrices(portfolioId: string): Promise<void>;
  async updatePositionPnL(
    portfolioId: string,
    positionId: string,
    currentPrice: number
  ): Promise<void>;
}
```

#### 3. OrderManager

Handles order creation, validation, lifecycle, and matching.

```typescript
/**
 * OrderManager - Order lifecycle management
 *
 * Responsibilities:
 * - Create and validate orders
 * - Track order status
 * - Process order fills
 * - Handle order cancellations
 * - Check pending order triggers
 */
export class OrderManager {
  private secureStorage: SecureStorageService;
  private portfolioManager: PortfolioManager;
  private executionSimulator: ExecutionSimulator;
  private marketDataService: MarketDataService;

  /**
   * Create a new order
   */
  async createOrder(
    portfolioId: string,
    orderParams: OrderParams
  ): Promise<PaperOrder>;

  /**
   * Validate order against portfolio constraints
   */
  async validateOrder(
    portfolioId: string,
    orderParams: OrderParams
  ): Promise<OrderValidationResult>;

  /**
   * Submit order for execution
   */
  async submitOrder(
    portfolioId: string,
    orderId: string
  ): Promise<PaperOrder>;

  /**
   * Cancel an order
   */
  async cancelOrder(
    portfolioId: string,
    orderId: string,
    reason?: string
  ): Promise<PaperOrder>;

  /**
   * Get order by ID
   */
  async getOrder(
    portfolioId: string,
    orderId: string
  ): Promise<PaperOrder>;

  /**
   * Get orders with filters
   */
  async getOrders(
    portfolioId: string,
    filters?: OrderFilters
  ): Promise<PaperOrder[]>;

  /**
   * Process pending orders (check triggers)
   */
  async processPendingOrders(
    portfolioId: string,
    currentPrices: Map<string, number>
  ): Promise<ProcessedOrderResult>;

  /**
   * Record order fill
   */
  async recordFill(
    portfolioId: string,
    orderId: string,
    fill: OrderFill
  ): Promise<PaperOrder>;

  /**
   * Update order status
   */
  async updateOrderStatus(
    portfolioId: string,
    orderId: string,
    status: OrderStatus,
    reason?: string
  ): Promise<PaperOrder>;

  /**
   * Create linked stop-loss and take-profit orders
   */
  async createBracketOrders(
    portfolioId: string,
    entryOrder: PaperOrder,
    stopLoss: number,
    takeProfit: number
  ): Promise<{
    stopLossOrder: PaperOrder;
    takeProfitOrder: PaperOrder;
  }>;
}
```

#### 4. ExecutionSimulator

Simulates realistic order execution with slippage and costs.

```typescript
/**
 * ExecutionSimulator - Realistic order fill simulation
 *
 * Responsibilities:
 * - Simulate order fills with realistic pricing
 * - Calculate slippage based on order type and market conditions
 * - Apply transaction costs (commissions, fees)
 * - Model partial fills
 * - Simulate market impact
 */
export class ExecutionSimulator {
  private marketDataService: MarketDataService;

  /**
   * Simulate execution of a market order
   */
  async simulateMarketOrder(
    order: PaperOrder,
    portfolio: PaperPortfolio
  ): Promise<ExecutionResult>;

  /**
   * Simulate execution of a limit order
   */
  async simulateLimitOrder(
    order: PaperOrder,
    currentPrice: number,
    portfolio: PaperPortfolio
  ): Promise<ExecutionResult | null>;

  /**
   * Simulate execution of a stop order
   */
  async simulateStopOrder(
    order: PaperOrder,
    currentPrice: number,
    portfolio: PaperPortfolio
  ): Promise<ExecutionResult | null>;

  /**
   * Calculate realistic slippage
   */
  calculateSlippage(
    order: PaperOrder,
    marketData: MarketData,
    settings: PortfolioSettings
  ): number;

  /**
   * Calculate transaction costs
   */
  calculateTransactionCosts(
    order: PaperOrder,
    fillPrice: number,
    fillQuantity: number,
    commissionModel: CommissionModel
  ): {
    commission: number;
    fees: number;
    totalCost: number;
  };

  /**
   * Simulate partial fill (for large orders)
   */
  simulatePartialFill(
    order: PaperOrder,
    marketData: MarketData
  ): {
    filledQuantity: number;
    remainingQuantity: number;
    avgFillPrice: number;
  };

  /**
   * Calculate market impact for large orders
   */
  calculateMarketImpact(
    orderSize: number,
    avgVolume: number,
    impactFactor: number
  ): number;
}
```

#### 5. TradeJournal

Immutable append-only trade history.

```typescript
/**
 * TradeJournal - Immutable trade history
 *
 * Responsibilities:
 * - Record all trades in append-only log
 * - Provide trade history queries
 * - Maintain data integrity
 * - Export trade data for analysis
 */
export class TradeJournal {
  private secureStorage: SecureStorageService;

  /**
   * Record a new trade (append-only)
   */
  async recordTrade(
    portfolioId: string,
    trade: TradeJournalEntry
  ): Promise<void>;

  /**
   * Get trade history
   */
  async getTradeHistory(
    portfolioId: string,
    filters?: TradeFilters
  ): Promise<TradeJournalEntry[]>;

  /**
   * Get trades by symbol
   */
  async getTradesBySymbol(
    portfolioId: string,
    symbol: string
  ): Promise<TradeJournalEntry[]>;

  /**
   * Get trades by date range
   */
  async getTradesByDateRange(
    portfolioId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TradeJournalEntry[]>;

  /**
   * Get trades by strategy
   */
  async getTradesByStrategy(
    portfolioId: string,
    strategy: string
  ): Promise<TradeJournalEntry[]>;

  /**
   * Get trade by ID
   */
  async getTrade(
    portfolioId: string,
    tradeId: string
  ): Promise<TradeJournalEntry | null>;

  /**
   * Export trades to CSV
   */
  async exportToCSV(
    portfolioId: string,
    filters?: TradeFilters
  ): Promise<string>;

  /**
   * Calculate trade statistics
   */
  async calculateTradeStats(
    portfolioId: string,
    filters?: TradeFilters
  ): Promise<TradeStatistics>;
}
```

#### 6. PerformanceCalculator

Calculates comprehensive performance metrics.

```typescript
/**
 * PerformanceCalculator - Performance metrics calculation
 *
 * Responsibilities:
 * - Calculate returns and P&L
 * - Compute risk-adjusted metrics (Sharpe, Sortino, Calmar)
 * - Analyze drawdowns
 * - Generate equity curves
 * - Calculate trade statistics
 */
export class PerformanceCalculator {
  private tradeJournal: TradeJournal;
  private portfolioManager: PortfolioManager;

  /**
   * Calculate all performance metrics
   */
  async calculatePerformance(
    portfolioId: string,
    period?: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME"
  ): Promise<PerformanceMetrics>;

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpeRatio(
    returns: number[],
    riskFreeRate: number
  ): number;

  /**
   * Calculate Sortino ratio
   */
  calculateSortinoRatio(
    returns: number[],
    riskFreeRate: number
  ): number;

  /**
   * Calculate Calmar ratio
   */
  calculateCalmarRatio(
    annualizedReturn: number,
    maxDrawdown: number
  ): number;

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown(equityCurve: EquityPoint[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
    maxDrawdownDuration: number;
  };

  /**
   * Generate equity curve
   */
  async generateEquityCurve(
    portfolioId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EquityPoint[]>;

  /**
   * Calculate monthly returns
   */
  async calculateMonthlyReturns(
    portfolioId: string
  ): Promise<MonthlyReturn[]>;

  /**
   * Calculate strategy-specific performance
   */
  async calculateStrategyPerformance(
    portfolioId: string
  ): Promise<StrategyPerformance[]>;

  /**
   * Calculate symbol-specific performance
   */
  async calculateSymbolPerformance(
    portfolioId: string
  ): Promise<SymbolPerformance[]>;
}
```

#### 7. SecureStorageService

Encrypted data persistence (extends existing SecureConfig pattern).

```typescript
/**
 * SecureStorageService - Encrypted data persistence
 *
 * Responsibilities:
 * - Encrypt/decrypt all trading data
 * - Manage file-based storage
 * - Handle data versioning
 * - Provide backup/restore
 */
export class SecureStorageService {
  private secureConfig: SecureConfig;
  private readonly STORAGE_DIR = "./data/paper-trading";

  /**
   * Save encrypted data
   */
  async save<T>(
    filename: string,
    data: T,
    schema?: z.ZodSchema<T>
  ): Promise<void>;

  /**
   * Load encrypted data
   */
  async load<T>(
    filename: string,
    schema?: z.ZodSchema<T>
  ): Promise<T | null>;

  /**
   * Append to JSONL file (for journal)
   */
  async appendJSONL<T>(
    filename: string,
    entry: T,
    schema?: z.ZodSchema<T>
  ): Promise<void>;

  /**
   * Read JSONL file
   */
  async readJSONL<T>(
    filename: string,
    schema?: z.ZodSchema<T>
  ): Promise<T[]>;

  /**
   * Create backup
   */
  async createBackup(portfolioId: string): Promise<string>;

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath: string): Promise<void>;

  /**
   * Delete portfolio data
   */
  async deletePortfolioData(portfolioId: string): Promise<void>;
}
```

---

## CLI Command Design

### Command Structure

```
stock-analyzer paper-trade <command> [options]

Commands:
  create          Create a new paper trading portfolio
  list            List all paper trading portfolios
  portfolio       Show portfolio details and positions
  trade           Execute a trade based on strategy signal
  order           Place a manual order
  cancel          Cancel a pending order
  close           Close a position
  positions       Show all open positions
  orders          Show order history
  history         Show trade history
  performance     Show performance metrics
  report          Generate detailed performance report
  export          Export portfolio data
  import          Import portfolio data
  monitor         Start real-time portfolio monitoring
  stop-monitor    Stop portfolio monitoring
  delete          Delete a paper trading portfolio
```

### Detailed Command Specifications

#### 1. Create Portfolio

```bash
stock-analyzer paper-trade create [options]

Create a new paper trading portfolio with initial balance and settings.

Options:
  -n, --name <name>              Portfolio name (required)
  -b, --balance <amount>         Initial balance (default: 100000)
  -s, --strategy <strategy>      Associated strategy (optional)
  --max-risk <percent>           Max risk per trade % (default: 1)
  --max-position <percent>       Max position size % (default: 25)
  --stop-loss <multiplier>       Stop loss ATR multiplier (default: 2.0)
  --take-profit <ratio>          Take profit R:R ratio (default: 2.0)
  --commission-type <type>       Commission type: FIXED|PERCENTAGE (default: FIXED)
  --commission-amount <amount>   Commission amount (default: 1.0)
  --slippage-bps <bps>           Slippage in basis points (default: 5)
  --enable-partial-fills         Enable partial fills for large orders
  --market-hours-only            Only trade during market hours
  -d, --description <text>       Portfolio description

Examples:
  # Create basic portfolio with $50,000
  stock-analyzer paper-trade create --name "Test Portfolio" --balance 50000

  # Create conservative portfolio
  stock-analyzer paper-trade create \
    --name "Conservative" \
    --balance 100000 \
    --max-risk 0.5 \
    --stop-loss 1.5 \
    --commission-type PERCENTAGE \
    --commission-amount 0.0001

  # Create portfolio for specific strategy
  stock-analyzer paper-trade create \
    --name "Mean Reversion Test" \
    --strategy MEAN_REVERSION \
    --balance 25000
```

#### 2. Execute Trade (Auto)

```bash
stock-analyzer paper-trade trade [options]

Execute a trade based on strategy signal with automatic position sizing.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  -y, --symbol <symbol>          Stock symbol (required)
  -s, --strategy <strategy>      Strategy to use: MEAN_REVERSION|MOMENTUM (required)
  --force                        Skip confirmation prompt
  --override-risk <percent>      Override max risk for this trade
  --notes <text>                 Add notes to trade

Examples:
  # Analyze AAPL with mean reversion and execute if signal found
  stock-analyzer paper-trade trade \
    --portfolio abc-123 \
    --symbol AAPL \
    --strategy MEAN_REVERSION

  # Execute with custom risk
  stock-analyzer paper-trade trade \
    -p abc-123 \
    -y TSLA \
    -s MOMENTUM \
    --override-risk 2.0 \
    --notes "High conviction trade"
```

#### 3. Place Manual Order

```bash
stock-analyzer paper-trade order [options]

Place a manual order with custom parameters.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  -y, --symbol <symbol>          Stock symbol (required)
  -t, --type <type>              Order type: MARKET|LIMIT|STOP_LOSS|TRAILING_STOP (required)
  -s, --side <side>              Order side: BUY|SELL (required)
  -q, --quantity <qty>           Quantity (required)
  -l, --limit-price <price>      Limit price (for LIMIT orders)
  --stop-price <price>           Stop price (for STOP orders)
  --trailing-amount <amount>     Trailing amount in $ (for TRAILING_STOP)
  --trailing-percent <percent>   Trailing percent (for TRAILING_STOP)
  --time-in-force <tif>          Time in force: GTC|DAY|IOC|FOK (default: GTC)
  --notes <text>                 Order notes
  --tags <tags>                  Comma-separated tags

Examples:
  # Market order to buy 100 shares
  stock-analyzer paper-trade order \
    --portfolio abc-123 \
    --symbol AAPL \
    --type MARKET \
    --side BUY \
    --quantity 100

  # Limit order
  stock-analyzer paper-trade order \
    -p abc-123 \
    -y GOOGL \
    -t LIMIT \
    -s BUY \
    -q 50 \
    -l 2800.00

  # Trailing stop loss
  stock-analyzer paper-trade order \
    -p abc-123 \
    -y TSLA \
    -t TRAILING_STOP \
    -s SELL \
    -q 25 \
    --trailing-percent 5 \
    --notes "Protect profits"
```

#### 4. View Portfolio

```bash
stock-analyzer paper-trade portfolio [options]

Show detailed portfolio information including positions and performance.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --refresh                      Refresh with latest market data
  --json                         Output in JSON format

Output includes:
  - Portfolio summary (balance, value, P&L)
  - Open positions with current P&L
  - Pending orders
  - Performance summary
  - Risk utilization

Example:
  stock-analyzer paper-trade portfolio --portfolio abc-123 --refresh
```

#### 5. View Positions

```bash
stock-analyzer paper-trade positions [options]

Show all open positions with real-time P&L.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --symbol <symbol>              Filter by symbol
  --strategy <strategy>          Filter by strategy
  --sort <field>                 Sort by: pnl|pnl-percent|value|symbol (default: pnl-percent)
  --refresh                      Refresh with latest market data
  --json                         Output in JSON format

Example:
  stock-analyzer paper-trade positions \
    --portfolio abc-123 \
    --sort pnl-percent \
    --refresh
```

#### 6. View Orders

```bash
stock-analyzer paper-trade orders [options]

Show order history with filtering options.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --status <status>              Filter by status: PENDING|FILLED|CANCELLED|REJECTED
  --symbol <symbol>              Filter by symbol
  --type <type>                  Filter by type: MARKET|LIMIT|STOP_LOSS
  --limit <n>                    Limit results (default: 50)
  --json                         Output in JSON format

Example:
  stock-analyzer paper-trade orders \
    --portfolio abc-123 \
    --status PENDING
```

#### 7. View Trade History

```bash
stock-analyzer paper-trade history [options]

Show trade journal with detailed execution history.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --symbol <symbol>              Filter by symbol
  --strategy <strategy>          Filter by strategy
  --from <date>                  Start date (YYYY-MM-DD)
  --to <date>                    End date (YYYY-MM-DD)
  --side <side>                  Filter by side: BUY|SELL
  --limit <n>                    Limit results (default: 100)
  --csv                          Export to CSV
  --json                         Output in JSON format

Examples:
  # Show all trades for AAPL
  stock-analyzer paper-trade history \
    --portfolio abc-123 \
    --symbol AAPL

  # Export last month to CSV
  stock-analyzer paper-trade history \
    --portfolio abc-123 \
    --from 2025-10-01 \
    --to 2025-10-31 \
    --csv > trades.csv
```

#### 8. Performance Report

```bash
stock-analyzer paper-trade performance [options]

Generate comprehensive performance metrics and analysis.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --period <period>              Period: DAILY|WEEKLY|MONTHLY|ALL_TIME (default: ALL_TIME)
  --include-equity-curve         Include equity curve data
  --include-monthly-returns      Include monthly returns breakdown
  --include-strategy-breakdown   Include per-strategy performance
  --include-symbol-breakdown     Include per-symbol performance
  --json                         Output in JSON format
  --export <filename>            Export to file (PDF/HTML/CSV)

Example:
  stock-analyzer paper-trade performance \
    --portfolio abc-123 \
    --period ALL_TIME \
    --include-equity-curve \
    --include-strategy-breakdown
```

#### 9. Close Position

```bash
stock-analyzer paper-trade close [options]

Close an open position with a market order.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --position <id>                Position ID (required)
  --quantity <qty>               Partial close quantity (optional)
  --reason <reason>              Reason for closing
  --force                        Skip confirmation

Examples:
  # Close entire position
  stock-analyzer paper-trade close \
    --portfolio abc-123 \
    --position pos-456

  # Partial close
  stock-analyzer paper-trade close \
    --portfolio abc-123 \
    --position pos-456 \
    --quantity 50 \
    --reason "Take partial profits"
```

#### 10. Cancel Order

```bash
stock-analyzer paper-trade cancel [options]

Cancel a pending order.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --order <id>                   Order ID (required)
  --reason <reason>              Cancellation reason

Example:
  stock-analyzer paper-trade cancel \
    --portfolio abc-123 \
    --order ord-789 \
    --reason "Market conditions changed"
```

#### 11. Monitor Portfolio

```bash
stock-analyzer paper-trade monitor [options]

Start real-time portfolio monitoring with automatic position updates.

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --interval <seconds>           Update interval (default: 60)
  --auto-trade                   Auto-execute strategy signals
  --strategy <strategy>          Strategy for auto-trading
  --stop-loss-check              Check and execute stop losses
  --take-profit-check            Check and execute take profits
  --process-pending              Process pending limit/stop orders

Examples:
  # Monitor with position updates only
  stock-analyzer paper-trade monitor --portfolio abc-123

  # Monitor with auto-trading
  stock-analyzer paper-trade monitor \
    --portfolio abc-123 \
    --auto-trade \
    --strategy MEAN_REVERSION \
    --stop-loss-check \
    --process-pending
```

#### 12. List Portfolios

```bash
stock-analyzer paper-trade list [options]

List all paper trading portfolios.

Options:
  --status <status>              Filter by status: ACTIVE|PAUSED|CLOSED
  --sort <field>                 Sort by: name|value|return|created (default: created)
  --json                         Output in JSON format

Example:
  stock-analyzer paper-trade list --status ACTIVE --sort return
```

#### 13. Delete Portfolio

```bash
stock-analyzer paper-trade delete [options]

Delete a paper trading portfolio (requires confirmation).

Options:
  -p, --portfolio <id>           Portfolio ID (required)
  --force                        Skip confirmation
  --export-first                 Export data before deletion

Example:
  stock-analyzer paper-trade delete \
    --portfolio abc-123 \
    --export-first
```

---

## Order Management System

### Order Types Implementation

#### 1. Market Order

**Execution Logic:**
```typescript
async simulateMarketOrder(order: PaperOrder, portfolio: PaperPortfolio): Promise<ExecutionResult> {
  // Get current market data
  const marketData = await this.marketDataService.getQuote(order.symbol);

  // Determine execution price based on side
  let executionPrice: number;
  if (order.side === "BUY") {
    // Buy at ask price
    executionPrice = marketData.askPrice || marketData.price;
  } else {
    // Sell at bid price
    executionPrice = marketData.bidPrice || marketData.price;
  }

  // Apply slippage
  const slippage = this.calculateSlippage(order, marketData, portfolio.settings);
  if (order.side === "BUY") {
    executionPrice += slippage;
  } else {
    executionPrice -= slippage;
  }

  // Check for partial fill
  let fillQuantity = order.quantity;
  let fillType: "FULL" | "PARTIAL" = "FULL";

  if (portfolio.settings.enablePartialFills) {
    const partialFill = this.simulatePartialFill(order, marketData);
    fillQuantity = partialFill.filledQuantity;
    fillType = partialFill.filledQuantity < order.quantity ? "PARTIAL" : "FULL";
  }

  // Calculate costs
  const costs = this.calculateTransactionCosts(
    order,
    executionPrice,
    fillQuantity,
    portfolio.commissionModel
  );

  return {
    fillPrice: executionPrice,
    fillQuantity,
    fillType,
    commission: costs.commission,
    fees: costs.fees,
    totalCost: costs.totalCost,
    slippage,
    slippageBps: (slippage / executionPrice) * 10000,
    executionTime: Date.now() - order.submittedAt.getTime(),
    liquidity: "TAKER", // Market orders are always takers
  };
}
```

#### 2. Limit Order

**Execution Logic:**
```typescript
async simulateLimitOrder(
  order: PaperOrder,
  currentPrice: number,
  portfolio: PaperPortfolio
): Promise<ExecutionResult | null> {
  // Check if limit price is reached
  const limitPrice = order.limitPrice!;

  let shouldFill = false;
  if (order.side === "BUY") {
    // Buy limit: fill when market price <= limit price
    shouldFill = currentPrice <= limitPrice;
  } else {
    // Sell limit: fill when market price >= limit price
    shouldFill = currentPrice >= limitPrice;
  }

  if (!shouldFill) {
    return null; // Order not triggered
  }

  // Fill at limit price (favorable execution)
  const executionPrice = limitPrice;

  // Limit orders may have minimal or no slippage
  const slippage = this.calculateSlippage(order, { price: currentPrice }, portfolio.settings) * 0.3; // 30% of market order slippage

  const costs = this.calculateTransactionCosts(
    order,
    executionPrice,
    order.quantity,
    portfolio.commissionModel
  );

  return {
    fillPrice: executionPrice,
    fillQuantity: order.quantity,
    fillType: "FULL",
    commission: costs.commission,
    fees: costs.fees,
    totalCost: costs.totalCost,
    slippage,
    slippageBps: (slippage / executionPrice) * 10000,
    executionTime: Date.now() - order.submittedAt.getTime(),
    liquidity: "MAKER", // Limit orders are typically makers
  };
}
```

#### 3. Stop-Loss Order

**Execution Logic:**
```typescript
async simulateStopOrder(
  order: PaperOrder,
  currentPrice: number,
  portfolio: PaperPortfolio
): Promise<ExecutionResult | null> {
  const stopPrice = order.stopPrice!;

  let shouldTrigger = false;
  if (order.side === "BUY") {
    // Buy stop: trigger when price >= stop price
    shouldTrigger = currentPrice >= stopPrice;
  } else {
    // Sell stop: trigger when price <= stop price
    shouldTrigger = currentPrice <= stopPrice;
  }

  if (!shouldTrigger) {
    return null; // Stop not hit
  }

  // Once triggered, becomes market order
  // Execute at current price + slippage
  const marketData = await this.marketDataService.getQuote(order.symbol);

  let executionPrice = currentPrice;
  const slippage = this.calculateSlippage(order, marketData, portfolio.settings);

  // Stop losses often have worse execution than market orders
  const stopSlippageMultiplier = 1.5; // 50% more slippage

  if (order.side === "BUY") {
    executionPrice += slippage * stopSlippageMultiplier;
  } else {
    executionPrice -= slippage * stopSlippageMultiplier;
  }

  const costs = this.calculateTransactionCosts(
    order,
    executionPrice,
    order.quantity,
    portfolio.commissionModel
  );

  return {
    fillPrice: executionPrice,
    fillQuantity: order.quantity,
    fillType: "FULL",
    commission: costs.commission,
    fees: costs.fees,
    totalCost: costs.totalCost,
    slippage: slippage * stopSlippageMultiplier,
    slippageBps: (slippage * stopSlippageMultiplier / executionPrice) * 10000,
    executionTime: Date.now() - order.submittedAt.getTime(),
    liquidity: "TAKER",
  };
}
```

#### 4. Trailing Stop Order

**Execution Logic:**
```typescript
async processTrailingStop(
  order: PaperOrder,
  currentPrice: number,
  portfolio: PaperPortfolio
): Promise<ExecutionResult | null> {
  // Initialize tracking price if not set
  if (!order.metadata?.highWaterMark) {
    order.metadata = {
      ...order.metadata,
      highWaterMark: currentPrice,
    };
    await this.orderManager.updateOrder(portfolio.id, order.id, order);
    return null;
  }

  const highWaterMark = order.metadata.highWaterMark as number;

  // Update high water mark if price improved
  if (order.side === "SELL" && currentPrice > highWaterMark) {
    order.metadata.highWaterMark = currentPrice;
    await this.orderManager.updateOrder(portfolio.id, order.id, order);
  } else if (order.side === "BUY" && currentPrice < highWaterMark) {
    order.metadata.highWaterMark = currentPrice;
    await this.orderManager.updateOrder(portfolio.id, order.id, order);
  }

  // Calculate trailing stop trigger price
  let triggerPrice: number;
  if (order.trailingPercent) {
    const trailingAmount = highWaterMark * (order.trailingPercent / 100);
    triggerPrice = order.side === "SELL"
      ? highWaterMark - trailingAmount
      : highWaterMark + trailingAmount;
  } else {
    triggerPrice = order.side === "SELL"
      ? highWaterMark - order.trailingAmount!
      : highWaterMark + order.trailingAmount!;
  }

  // Check if stop is hit
  const stopHit = order.side === "SELL"
    ? currentPrice <= triggerPrice
    : currentPrice >= triggerPrice;

  if (!stopHit) {
    return null;
  }

  // Execute as market order
  return this.simulateStopOrder(
    { ...order, stopPrice: triggerPrice },
    currentPrice,
    portfolio
  );
}
```

### Order Validation

```typescript
interface OrderValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedCost?: number;
  estimatedTotal?: number;
  availableCash?: number;
}

async validateOrder(
  portfolioId: string,
  orderParams: OrderParams
): Promise<OrderValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get portfolio
  const portfolio = await this.portfolioManager.getPortfolio(portfolioId);

  // Get current price
  const quote = await this.marketDataService.getQuote(orderParams.symbol);
  const estimatedPrice = orderParams.type === "MARKET"
    ? quote.price
    : orderParams.limitPrice || quote.price;

  // Calculate estimated costs
  const estimatedCommission = this.calculateCommission(
    orderParams.quantity * estimatedPrice,
    portfolio.commissionModel
  );

  const estimatedTotal = orderParams.side === "BUY"
    ? (orderParams.quantity * estimatedPrice) + estimatedCommission
    : (orderParams.quantity * estimatedPrice) - estimatedCommission;

  // Validate sufficient funds
  const availableCash = await this.portfolioManager.getAvailableCash(portfolioId);

  if (orderParams.side === "BUY" && estimatedTotal > availableCash) {
    errors.push(`Insufficient funds. Need ${estimatedTotal.toFixed(2)}, have ${availableCash.toFixed(2)}`);
  }

  // Validate position exists for sell orders
  if (orderParams.side === "SELL") {
    const positions = await this.portfolioManager.getPositions(portfolioId, {
      symbol: orderParams.symbol
    });

    const totalQuantity = positions.reduce((sum, pos) => sum + pos.quantity, 0);
    if (totalQuantity < orderParams.quantity) {
      errors.push(`Insufficient shares. Need ${orderParams.quantity}, have ${totalQuantity}`);
    }
  }

  // Validate order parameters
  if (orderParams.type === "LIMIT" && !orderParams.limitPrice) {
    errors.push("Limit price required for LIMIT orders");
  }

  if (orderParams.type === "STOP_LOSS" && !orderParams.stopPrice) {
    errors.push("Stop price required for STOP_LOSS orders");
  }

  if (orderParams.type === "TRAILING_STOP" && !orderParams.trailingAmount && !orderParams.trailingPercent) {
    errors.push("Trailing amount or percent required for TRAILING_STOP orders");
  }

  // Validate quantity
  if (orderParams.quantity <= 0) {
    errors.push("Quantity must be positive");
  }

  if (!Number.isInteger(orderParams.quantity)) {
    errors.push("Quantity must be a whole number");
  }

  // Warnings
  if (orderParams.type === "MARKET" && portfolio.settings.requireMarketHours) {
    const isMarketHours = this.isMarketHours();
    if (!isMarketHours) {
      warnings.push("Market is closed. Order will be queued for next market open.");
    }
  }

  const positionSize = (estimatedTotal / portfolio.totalValue) * 100;
  if (positionSize > portfolio.riskParams.maxPositionSize * 100) {
    warnings.push(`Position size (${positionSize.toFixed(1)}%) exceeds max (${portfolio.riskParams.maxPositionSize * 100}%)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedCost: estimatedCommission,
    estimatedTotal,
    availableCash,
  };
}
```

---

## Position & Portfolio Management

### Position Lifecycle

```typescript
/**
 * Complete position lifecycle management
 */
class PositionLifecycle {

  /**
   * Open new position from order fill
   */
  async openPosition(
    portfolioId: string,
    order: PaperOrder,
    execution: ExecutionResult
  ): Promise<PaperPosition> {

    // Calculate cost basis including fees
    const totalCost = (execution.fillPrice * execution.fillQuantity) + execution.totalCost;
    const costBasis = totalCost / execution.fillQuantity;

    // Create position
    const position: PaperPosition = {
      id: crypto.randomUUID(),
      portfolioId,
      symbol: order.symbol,
      side: order.side === "BUY" ? "LONG" : "SHORT",
      quantity: execution.fillQuantity,
      entryPrice: execution.fillPrice,
      currentPrice: execution.fillPrice,
      marketValue: execution.fillPrice * execution.fillQuantity,
      totalCost,
      costBasis,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      realizedPnL: 0,
      stopLoss: order.linkedOrders?.stopLossOrderId ? await this.getStopLossPrice(order) : undefined,
      takeProfit: order.linkedOrders?.takeProfitOrderId ? await this.getTakeProfitPrice(order) : undefined,
      riskAmount: order.metadata?.riskAmount || 0,
      riskPercentage: order.metadata?.riskPercentage || 0,
      openedAt: new Date(),
      updatedAt: new Date(),
      strategy: order.strategyName || "MANUAL",
      signalConfidence: order.metadata?.signalConfidence,
      entryTradeIds: [order.id],
      exitTradeIds: [],
      holdingPeriod: 0,
      maxUnrealizedProfit: 0,
      maxUnrealizedLoss: 0,
      notes: order.notes,
      tags: order.tags,
    };

    // Save position
    await this.portfolioManager.createPosition(portfolioId, position);

    // Update portfolio cash
    await this.portfolioManager.updateCashBalance(
      portfolioId,
      -totalCost,
      `Position opened: ${order.symbol}`
    );

    return position;
  }

  /**
   * Update position with current market price
   */
  async updatePosition(
    portfolioId: string,
    positionId: string,
    currentPrice: number
  ): Promise<PaperPosition> {

    const position = await this.portfolioManager.getPosition(portfolioId, positionId);

    // Calculate new values
    const marketValue = currentPrice * position.quantity;
    const unrealizedPnL = position.side === "LONG"
      ? marketValue - position.totalCost
      : position.totalCost - marketValue;
    const unrealizedPnLPercent = (unrealizedPnL / position.totalCost) * 100;

    // Track max profit/loss
    const maxUnrealizedProfit = Math.max(position.maxUnrealizedProfit, unrealizedPnL);
    const maxUnrealizedLoss = Math.min(position.maxUnrealizedLoss, unrealizedPnL);

    // Calculate holding period
    const holdingPeriod = Math.floor(
      (Date.now() - position.openedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Update position
    return await this.portfolioManager.updatePosition(portfolioId, positionId, {
      currentPrice,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent,
      maxUnrealizedProfit,
      maxUnrealizedLoss,
      holdingPeriod,
      updatedAt: new Date(),
    });
  }

  /**
   * Close position (full or partial)
   */
  async closePosition(
    portfolioId: string,
    positionId: string,
    closeOrder: PaperOrder,
    execution: ExecutionResult
  ): Promise<{ position: PaperPosition; realized: number }> {

    const position = await this.portfolioManager.getPosition(portfolioId, positionId);

    // Calculate realized P&L
    const closeQuantity = execution.fillQuantity;
    const closeValue = execution.fillPrice * closeQuantity - execution.totalCost;
    const costForClosedShares = position.costBasis * closeQuantity;
    const realizedPnL = position.side === "LONG"
      ? closeValue - costForClosedShares
      : costForClosedShares - closeValue;

    // Update portfolio cash
    await this.portfolioManager.updateCashBalance(
      portfolioId,
      closeValue,
      `Position closed: ${position.symbol}`
    );

    // Full close
    if (closeQuantity >= position.quantity) {
      const closedPosition = await this.portfolioManager.updatePosition(
        portfolioId,
        positionId,
        {
          quantity: 0,
          realizedPnL: position.realizedPnL + realizedPnL,
          closedAt: new Date(),
          exitTradeIds: [...position.exitTradeIds, closeOrder.id],
        }
      );

      return { position: closedPosition, realized: realizedPnL };
    }

    // Partial close
    const updatedPosition = await this.portfolioManager.updatePosition(
      portfolioId,
      positionId,
      {
        quantity: position.quantity - closeQuantity,
        totalCost: position.costBasis * (position.quantity - closeQuantity),
        realizedPnL: position.realizedPnL + realizedPnL,
        exitTradeIds: [...position.exitTradeIds, closeOrder.id],
        updatedAt: new Date(),
      }
    );

    // Recalculate unrealized P&L for remaining shares
    await this.updatePosition(portfolioId, positionId, position.currentPrice);

    return { position: updatedPosition, realized: realizedPnL };
  }
}
```

### Portfolio State Management

```typescript
/**
 * Real-time portfolio state tracking
 */
class PortfolioStateManager {

  /**
   * Calculate complete portfolio state
   */
  async calculatePortfolioState(portfolioId: string): Promise<PortfolioState> {

    const portfolio = await this.portfolioManager.getPortfolio(portfolioId);
    const positions = await this.portfolioManager.getPositions(portfolioId);

    // Update all positions with current prices
    await this.updateAllPositionPrices(portfolioId, positions);

    // Calculate totals
    const totalPositionValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const totalCash = portfolio.currentBalance;
    const totalValue = totalCash + totalPositionValue;
    const unrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalReturn = totalValue - portfolio.initialBalance;
    const totalReturnPercent = (totalReturn / portfolio.initialBalance) * 100;

    // Calculate risk
    const totalRisk = positions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    const riskPercentage = (totalRisk / totalValue) * 100;

    // Get realized P&L from trade journal
    const trades = await this.tradeJournal.getTradeHistory(portfolioId);
    const realizedPnL = trades
      .filter(t => t.pnlImpact)
      .reduce((sum, t) => sum + (t.pnlImpact?.realizedPnL || 0), 0);

    return {
      portfolioId,
      timestamp: new Date(),
      totalValue,
      totalCash,
      totalPositionValue,
      positionCount: positions.length,
      unrealizedPnL,
      realizedPnL,
      totalReturn,
      totalReturnPercent,
      totalRisk,
      riskPercentage,
      positions,
      allocation: this.calculateAllocation(positions, totalValue),
      sectorExposure: this.calculateSectorExposure(positions, totalValue),
    };
  }

  /**
   * Calculate asset allocation
   */
  private calculateAllocation(
    positions: PaperPosition[],
    totalValue: number
  ): AssetAllocation {
    return {
      cash: (totalValue - positions.reduce((s, p) => s + p.marketValue, 0)) / totalValue,
      stocks: positions.reduce((s, p) => s + p.marketValue, 0) / totalValue,
      bySymbol: positions.map(p => ({
        symbol: p.symbol,
        value: p.marketValue,
        percentage: (p.marketValue / totalValue) * 100,
      })),
    };
  }

  /**
   * Calculate sector exposure
   */
  private calculateSectorExposure(
    positions: PaperPosition[],
    totalValue: number
  ): Record<string, number> {
    const sectorMap: Record<string, number> = {};

    for (const position of positions) {
      const sector = position.sector || "UNKNOWN";
      sectorMap[sector] = (sectorMap[sector] || 0) + position.marketValue;
    }

    // Convert to percentages
    const sectorPercentages: Record<string, number> = {};
    for (const [sector, value] of Object.entries(sectorMap)) {
      sectorPercentages[sector] = (value / totalValue) * 100;
    }

    return sectorPercentages;
  }

  /**
   * Update all position prices in batch
   */
  private async updateAllPositionPrices(
    portfolioId: string,
    positions: PaperPosition[]
  ): Promise<void> {

    // Batch fetch quotes
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const quotes = await this.marketDataService.getBatchQuotes(symbols);

    // Update each position
    for (const position of positions) {
      const quote = quotes.get(position.symbol);
      if (quote) {
        await this.portfolioManager.updatePositionPnL(
          portfolioId,
          position.id,
          quote.price
        );
      }
    }
  }
}
```

---

## Order Execution Simulation

### Slippage Models

```typescript
/**
 * Calculate realistic slippage based on order and market conditions
 */
class SlippageCalculator {

  /**
   * Fixed basis points slippage
   */
  calculateFixedBpsSlippage(
    price: number,
    basisPoints: number
  ): number {
    return price * (basisPoints / 10000);
  }

  /**
   * Volume-based slippage (larger orders = more slippage)
   */
  calculateVolumeBased Slippage(
    order: PaperOrder,
    marketData: MarketData,
    impactFactor: number
  ): number {
    // Get average daily volume
    const avgVolume = marketData.avgVolume || 1000000;

    // Calculate order size as % of average volume
    const orderSizePercent = order.quantity / avgVolume;

    // Slippage increases non-linearly with order size
    // Small orders (<0.1% of volume): minimal slippage
    // Large orders (>1% of volume): significant slippage
    let slippageBps: number;

    if (orderSizePercent < 0.001) {
      slippageBps = 2; // 0.02% for tiny orders
    } else if (orderSizePercent < 0.01) {
      slippageBps = 5; // 0.05% for small orders
    } else if (orderSizePercent < 0.1) {
      slippageBps = 10 + (orderSizePercent * 100); // 0.10-1.00%
    } else {
      slippageBps = 20 + (orderSizePercent * 500); // 0.20%+
    }

    // Apply impact factor
    slippageBps *= impactFactor;

    return marketData.price * (slippageBps / 10000);
  }

  /**
   * Spread-based slippage (based on bid-ask spread)
   */
  calculateSpreadBasedSlippage(
    order: PaperOrder,
    marketData: MarketData
  ): number {
    const spread = marketData.askPrice - marketData.bidPrice;

    // Market orders typically cross the spread
    // Use 50-100% of spread as slippage
    const spreadCrossingPercent = order.type === "MARKET" ? 0.8 : 0.4;

    return spread * spreadCrossingPercent;
  }

  /**
   * Volatility-adjusted slippage
   */
  calculateVolatilityAdjustedSlippage(
    baseSlippage: number,
    volatility: number
  ): number {
    // Higher volatility = more slippage
    // volatility is typically 0.1 - 1.0 (10% - 100% annual vol)
    const volatilityMultiplier = 1 + (volatility * 0.5);
    return baseSlippage * volatilityMultiplier;
  }

  /**
   * Main slippage calculation
   */
  calculateSlippage(
    order: PaperOrder,
    marketData: MarketData,
    settings: PortfolioSettings
  ): number {
    let slippage: number;

    switch (settings.slippageModel) {
      case "FIXED_BPS":
        slippage = this.calculateFixedBpsSlippage(
          marketData.price,
          settings.fixedSlippageBps || 5
        );
        break;

      case "VOLUME_BASED":
        slippage = this.calculateVolumeBasedSlippage(
          order,
          marketData,
          settings.marketImpactFactor || 1.0
        );
        break;

      case "SPREAD_BASED":
        slippage = this.calculateSpreadBasedSlippage(order, marketData);
        break;

      default:
        slippage = this.calculateFixedBpsSlippage(marketData.price, 5);
    }

    // Adjust for volatility if available
    if (marketData.volatility) {
      slippage = this.calculateVolatilityAdjustedSlippage(
        slippage,
        marketData.volatility
      );
    }

    // Market orders generally have more slippage than limit orders
    if (order.type === "MARKET") {
      slippage *= 1.2;
    } else if (order.type === "STOP_LOSS") {
      slippage *= 1.5; // Stop losses often get worse execution
    }

    return slippage;
  }
}
```

### Partial Fill Simulation

```typescript
/**
 * Simulate partial fills for large orders
 */
class PartialFillSimulator {

  simulatePartialFill(
    order: PaperOrder,
    marketData: MarketData
  ): PartialFillResult {

    const avgVolume = marketData.avgVolume || 1000000;
    const orderSizePercent = order.quantity / avgVolume;

    // Small orders (<1% of volume): always fill completely
    if (orderSizePercent < 0.01) {
      return {
        filledQuantity: order.quantity,
        remainingQuantity: 0,
        fillRate: 1.0,
        fillReasons: ["Order size within normal market capacity"],
      };
    }

    // Medium orders (1-5% of volume): likely full fill but may be partial
    if (orderSizePercent < 0.05) {
      const fillRate = 0.85 + (Math.random() * 0.15); // 85-100%
      const filledQuantity = Math.floor(order.quantity * fillRate);

      return {
        filledQuantity,
        remainingQuantity: order.quantity - filledQuantity,
        fillRate,
        fillReasons: ["Moderate order size, possible liquidity constraints"],
      };
    }

    // Large orders (5-10% of volume): likely partial fill
    if (orderSizePercent < 0.1) {
      const fillRate = 0.6 + (Math.random() * 0.25); // 60-85%
      const filledQuantity = Math.floor(order.quantity * fillRate);

      return {
        filledQuantity,
        remainingQuantity: order.quantity - filledQuantity,
        fillRate,
        fillReasons: ["Large order relative to market volume"],
      };
    }

    // Very large orders (>10% of volume): significant partial fill
    const fillRate = 0.3 + (Math.random() * 0.3); // 30-60%
    const filledQuantity = Math.floor(order.quantity * fillRate);

    return {
      filledQuantity,
      remainingQuantity: order.quantity - filledQuantity,
      fillRate,
      fillReasons: [
        "Very large order",
        "Significant market impact",
        "Limited liquidity",
      ],
    };
  }
}
```

---

## Transaction Cost Model

### Commission Models

```typescript
/**
 * Commission calculation based on portfolio settings
 */
class CommissionCalculator {

  calculateCommission(
    orderValue: number,
    quantity: number,
    commissionModel: CommissionModel
  ): number {

    let commission: number;

    switch (commissionModel.type) {
      case "FIXED":
        // Fixed fee per trade
        commission = commissionModel.fixedFee || 0;
        break;

      case "PERCENTAGE":
        // Percentage of trade value
        commission = orderValue * (commissionModel.percentageFee || 0);
        break;

      case "TIERED":
        // Tiered based on trade size
        commission = this.calculateTieredCommission(orderValue, quantity);
        break;

      default:
        commission = 0;
    }

    // Apply min/max limits
    if (commissionModel.minFee && commission < commissionModel.minFee) {
      commission = commissionModel.minFee;
    }

    if (commissionModel.maxFee && commission > commissionModel.maxFee) {
      commission = commissionModel.maxFee;
    }

    return commission;
  }

  private calculateTieredCommission(
    orderValue: number,
    quantity: number
  ): number {
    // Example tiered structure (similar to Interactive Brokers)
    if (orderValue < 1000) {
      return Math.max(1.0, quantity * 0.005); // $0.005 per share, $1 min
    } else if (orderValue < 10000) {
      return Math.min(Math.max(1.0, quantity * 0.003), orderValue * 0.005); // $0.003 per share
    } else {
      return Math.min(Math.max(1.0, quantity * 0.001), orderValue * 0.0035); // $0.001 per share
    }
  }
}

/**
 * Additional fees and costs
 */
class TransactionCostCalculator {

  calculateTransactionCosts(
    order: PaperOrder,
    fillPrice: number,
    fillQuantity: number,
    commissionModel: CommissionModel
  ): TransactionCosts {

    const orderValue = fillPrice * fillQuantity;

    // Commission
    const commission = new CommissionCalculator().calculateCommission(
      orderValue,
      fillQuantity,
      commissionModel
    );

    // SEC fees (US stocks only, sell side only)
    let secFee = 0;
    if (order.side === "SELL") {
      secFee = orderValue * 0.0000278; // $27.80 per $1,000,000 (2024 rate)
    }

    // TAF fee (Trading Activity Fee)
    let tafFee = 0;
    if (order.side === "SELL") {
      tafFee = Math.min(fillQuantity * 0.000166, 8.30); // $0.000166 per share, max $8.30
    }

    // FINRA TAF
    const finraTaf = fillQuantity * 0.000166; // Both sides

    // Total fees
    const fees = secFee + tafFee + finraTaf;

    // Total cost
    const totalCost = commission + fees;

    return {
      commission,
      fees,
      secFee,
      tafFee,
      finraTaf,
      totalCost,
      costPerShare: totalCost / fillQuantity,
      costBps: (totalCost / orderValue) * 10000, // Basis points
    };
  }
}
```

### Cost Models by Broker Type

```typescript
/**
 * Pre-configured commission models for different broker types
 */
const BROKER_COMMISSION_MODELS: Record<string, CommissionModel> = {

  // Zero-commission brokers (Robinhood, Webull, etc.)
  ZERO_COMMISSION: {
    type: "FIXED",
    fixedFee: 0,
    minFee: 0,
    maxFee: 0,
  },

  // Traditional brokers (Fidelity, Schwab, TD Ameritrade stock trades)
  TRADITIONAL_ZERO: {
    type: "FIXED",
    fixedFee: 0, // Most now offer $0 stock trades
    minFee: 0,
    maxFee: 0,
  },

  // Interactive Brokers IBKR Lite
  IBKR_LITE: {
    type: "FIXED",
    fixedFee: 0,
    minFee: 0,
    maxFee: 0,
  },

  // Interactive Brokers Pro (tiered pricing)
  IBKR_PRO: {
    type: "TIERED",
    minFee: 0.35,
    maxFee: undefined, // 1% of trade value
  },

  // Legacy per-trade pricing
  LEGACY_FLAT: {
    type: "FIXED",
    fixedFee: 4.95,
    minFee: 4.95,
    maxFee: 4.95,
  },

  // Percentage-based (alternative trading systems)
  PERCENTAGE_BASED: {
    type: "PERCENTAGE",
    percentageFee: 0.0001, // 0.01% = 1 bp
    minFee: 1.0,
    maxFee: 20.0,
  },
};
```

---

## Real-time P&L Calculation

### Position P&L Tracking

```typescript
/**
 * Real-time P&L calculation for positions
 */
class PnLCalculator {

  /**
   * Calculate position P&L
   */
  calculatePositionPnL(
    position: PaperPosition,
    currentPrice: number
  ): PositionPnL {

    const marketValue = position.quantity * currentPrice;

    // Unrealized P&L
    const unrealizedPnL = position.side === "LONG"
      ? marketValue - position.totalCost
      : position.totalCost - marketValue;

    const unrealizedPnLPercent = (unrealizedPnL / position.totalCost) * 100;

    // Return on investment
    const roi = (unrealizedPnL / position.totalCost) * 100;

    // Annualized return
    const holdingPeriodYears = position.holdingPeriod / 365;
    const annualizedReturn = holdingPeriodYears > 0
      ? (Math.pow(1 + (unrealizedPnL / position.totalCost), 1 / holdingPeriodYears) - 1) * 100
      : 0;

    // Distance from entry
    const priceChange = currentPrice - position.entryPrice;
    const priceChangePercent = (priceChange / position.entryPrice) * 100;

    // Stop loss / take profit distances
    const stopLossDistance = position.stopLoss
      ? ((currentPrice - position.stopLoss) / currentPrice) * 100
      : undefined;

    const takeProfitDistance = position.takeProfit
      ? ((position.takeProfit - currentPrice) / currentPrice) * 100
      : undefined;

    // Risk-adjusted metrics
    const riskRewardRatio = position.riskAmount > 0
      ? Math.abs(unrealizedPnL) / position.riskAmount
      : undefined;

    return {
      unrealizedPnL,
      unrealizedPnLPercent,
      marketValue,
      roi,
      annualizedReturn,
      priceChange,
      priceChangePercent,
      stopLossDistance,
      takeProfitDistance,
      riskRewardRatio,
      totalCost: position.totalCost,
      costBasis: position.costBasis,
    };
  }

  /**
   * Calculate portfolio-wide P&L
   */
  calculatePortfolioPnL(
    portfolio: PaperPortfolio,
    positions: PaperPosition[],
    realizedPnL: number
  ): PortfolioPnL {

    // Total unrealized P&L
    const totalUnrealizedPnL = positions.reduce(
      (sum, pos) => sum + pos.unrealizedPnL,
      0
    );

    // Total P&L
    const totalPnL = realizedPnL + totalUnrealizedPnL;

    // Total return
    const totalReturn = portfolio.totalValue - portfolio.initialBalance;
    const totalReturnPercent = (totalReturn / portfolio.initialBalance) * 100;

    // Daily change (would need historical data)
    const dayChange = 0; // Placeholder
    const dayChangePercent = 0; // Placeholder

    // Calculate profit factor (from trade history)
    const profitFactor = this.calculateProfitFactor(portfolio.id);

    return {
      realizedPnL,
      unrealizedPnL: totalUnrealizedPnL,
      totalPnL,
      totalReturn,
      totalReturnPercent,
      dayChange,
      dayChangePercent,
      profitFactor,
      initialBalance: portfolio.initialBalance,
      currentValue: portfolio.totalValue,
    };
  }

  /**
   * Calculate intraday P&L changes
   */
  async calculateIntradayPnL(
    portfolioId: string,
    startOfDay: Date
  ): Promise<IntradayPnL> {

    // Get positions
    const positions = await this.portfolioManager.getPositions(portfolioId);

    // Get start-of-day snapshot
    const sodSnapshot = await this.getPortfolioSnapshot(portfolioId, startOfDay);

    // Current values
    const currentValue = await this.portfolioManager.calculateTotalValue(portfolioId);
    const currentUnrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnL, 0);

    // Changes since start of day
    const valueChange = currentValue - sodSnapshot.totalValue;
    const unrealizedPnLChange = currentUnrealizedPnL - sodSnapshot.unrealizedPnL;

    // Realized P&L for today
    const todayRealizedPnL = await this.getTodayRealizedPnL(portfolioId, startOfDay);

    return {
      startOfDayValue: sodSnapshot.totalValue,
      currentValue,
      valueChange,
      valueChangePercent: (valueChange / sodSnapshot.totalValue) * 100,
      unrealizedPnLChange,
      realizedPnLToday: todayRealizedPnL,
      totalPnLToday: unrealizedPnLChange + todayRealizedPnL,
    };
  }

  private async calculateProfitFactor(portfolioId: string): Promise<number> {
    const trades = await this.tradeJournal.getTradeHistory(portfolioId);

    const grossProfit = trades
      .filter(t => t.pnlImpact && t.pnlImpact.realizedPnL > 0)
      .reduce((sum, t) => sum + (t.pnlImpact?.realizedPnL || 0), 0);

    const grossLoss = Math.abs(
      trades
        .filter(t => t.pnlImpact && t.pnlImpact.realizedPnL < 0)
        .reduce((sum, t) => sum + (t.pnlImpact?.realizedPnL || 0), 0)
    );

    return grossLoss > 0 ? grossProfit / grossLoss : 0;
  }
}
```

### Real-time Updates

```typescript
/**
 * Real-time P&L update service
 */
class RealTimePnLService {
  private updateInterval: NodeJS.Timeout | null = null;
  private subscribers: Map<string, PnLSubscriber[]> = new Map();

  /**
   * Start real-time P&L updates
   */
  startRealTimeUpdates(portfolioId: string, intervalSeconds = 60): void {

    this.updateInterval = setInterval(async () => {
      try {
        await this.updatePortfolioPnL(portfolioId);
      } catch (error) {
        console.error("Real-time P&L update failed:", error);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Stop real-time updates
   */
  stopRealTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update portfolio P&L
   */
  private async updatePortfolioPnL(portfolioId: string): Promise<void> {

    // Get all positions
    const positions = await this.portfolioManager.getPositions(portfolioId);

    if (positions.length === 0) return;

    // Fetch current prices in batch
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const quotes = await this.marketDataService.getBatchQuotes(symbols);

    // Update each position
    const updates: PositionUpdate[] = [];

    for (const position of positions) {
      const quote = quotes.get(position.symbol);
      if (!quote) continue;

      const pnl = new PnLCalculator().calculatePositionPnL(position, quote.price);

      // Update position
      await this.portfolioManager.updatePosition(portfolioId, position.id, {
        currentPrice: quote.price,
        marketValue: pnl.marketValue,
        unrealizedPnL: pnl.unrealizedPnL,
        unrealizedPnLPercent: pnl.unrealizedPnLPercent,
        updatedAt: new Date(),
      });

      updates.push({
        positionId: position.id,
        symbol: position.symbol,
        oldPrice: position.currentPrice,
        newPrice: quote.price,
        pnl,
      });
    }

    // Notify subscribers
    await this.notifySubscribers(portfolioId, updates);

    // Check stop loss / take profit triggers
    await this.checkStopLossAndTakeProfit(portfolioId, positions, quotes);
  }

  /**
   * Subscribe to P&L updates
   */
  subscribe(
    portfolioId: string,
    callback: (updates: PositionUpdate[]) => void
  ): string {
    const subscriberId = crypto.randomUUID();

    if (!this.subscribers.has(portfolioId)) {
      this.subscribers.set(portfolioId, []);
    }

    this.subscribers.get(portfolioId)!.push({
      id: subscriberId,
      callback,
    });

    return subscriberId;
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(portfolioId: string, subscriberId: string): void {
    const subs = this.subscribers.get(portfolioId);
    if (!subs) return;

    const index = subs.findIndex(s => s.id === subscriberId);
    if (index !== -1) {
      subs.splice(index, 1);
    }
  }

  private async notifySubscribers(
    portfolioId: string,
    updates: PositionUpdate[]
  ): Promise<void> {
    const subs = this.subscribers.get(portfolioId);
    if (!subs) return;

    for (const sub of subs) {
      try {
        sub.callback(updates);
      } catch (error) {
        console.error("Subscriber callback error:", error);
      }
    }
  }

  /**
   * Check if stop loss or take profit triggered
   */
  private async checkStopLossAndTakeProfit(
    portfolioId: string,
    positions: PaperPosition[],
    quotes: Map<string, MarketData>
  ): Promise<void> {

    for (const position of positions) {
      const quote = quotes.get(position.symbol);
      if (!quote) continue;

      const currentPrice = quote.price;

      // Check stop loss
      if (position.stopLoss) {
        const stopHit = position.side === "LONG"
          ? currentPrice <= position.stopLoss
          : currentPrice >= position.stopLoss;

        if (stopHit) {
          await this.triggerStopLoss(portfolioId, position, currentPrice);
        }
      }

      // Check take profit
      if (position.takeProfit) {
        const tpHit = position.side === "LONG"
          ? currentPrice >= position.takeProfit
          : currentPrice <= position.takeProfit;

        if (tpHit) {
          await this.triggerTakeProfit(portfolioId, position, currentPrice);
        }
      }
    }
  }
}
```

---

## Trade Journal & History

(Continue with remaining sections...)

The design document is comprehensive but getting very long. Would you like me to:

1. Continue with the remaining sections (Performance Reporting, Risk Limits, Integration, API Endpoints, Security, Code Examples, etc.)
2. Complete it as a full document
3. Or would you prefer I summarize the remaining sections at a higher level?

Let me complete the remaining critical sections to provide a complete design document.

