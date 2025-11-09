/**
 * Paper Trading System - Main Export
 * Complete virtual trading system with encryption, risk management, and performance tracking
 */

// Core Engine
export { PaperTradingEngine } from "./engine/paper-trading-engine.js";

// Components
export { PortfolioManager } from "./portfolio/portfolio-manager.js";
export { OrderManager } from "./orders/order-manager.js";
export { ExecutionSimulator } from "./execution/execution-simulator.js";
export { TradeJournal } from "./journal/trade-journal.js";
export { PerformanceCalculator } from "./performance/performance-calculator.js";
export { PreTradeValidator } from "./risk/pre-trade-validator.js";
export { EncryptedStorage } from "./storage/encrypted-storage.js";

// API
export { PaperTradingAPI } from "./api/paper-trading-api.js";

// Types
export type {
  PaperTradingConfig,
  PaperOrder,
  PaperPosition,
  PaperTrade,
  PortfolioState,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,
  ExitReason,
  TradeJournalEntry,
  PerformanceSnapshot,
  RiskValidationResult,
  MarketDataUpdate,
  EngineStatus,
  PaperTradingEvent,
  StorageConfig,
} from "./types/paper-trading-types.js";

export type { FillResult } from "./execution/execution-simulator.js";
export type { JournalQueryOptions } from "./journal/trade-journal.js";
