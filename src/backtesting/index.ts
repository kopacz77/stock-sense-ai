/**
 * Backtesting Framework - Main Export File
 * Provides a comprehensive event-driven backtesting system for trading strategies
 */

// Core Engine
export { BacktestEngine } from "./engine/backtest-engine.js";
export { EventQueue } from "./engine/event-queue.js";
export { StrategyExecutor } from "./engine/strategy-executor.js";

// Data Management
export { HistoricalDataManager } from "./data/historical-data-manager.js";
export { CSVDataLoader, MemoryDataLoader, type DataLoader } from "./data/data-loader.js";
export type {
  DataSourceConfig,
  DataQualityMetrics,
  DataValidationResult,
  DataGap,
} from "./data/types.js";

// Execution Simulation
export { FillSimulator, type FillSimulatorConfig } from "./execution/fill-simulator.js";
export {
  ZeroCommissionModel,
  FixedCommissionModel,
  PercentageCommissionModel,
  PerShareCommissionModel,
  createCommissionModel,
  CommissionPresets,
} from "./execution/commission-models.js";
export {
  NoSlippageModel,
  FixedBPSSlippageModel,
  VolumeBasedSlippageModel,
  SpreadBasedSlippageModel,
  createSlippageModel,
} from "./execution/slippage-models.js";

// Portfolio Tracking
export { PortfolioTracker } from "./portfolio/portfolio-tracker.js";
export { Position } from "./portfolio/position.js";
export { Trade } from "./portfolio/trade.js";

// Analytics
export { PerformanceMetricsCalculator } from "./analytics/performance-metrics.js";
export { EquityCurveBuilder } from "./analytics/equity-curve.js";

// Type Definitions
export type {
  // Core Types
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  BacktestError,
  BacktestStatistics,
  // Data Types
  HistoricalDataPoint,
  Bar,
  DataProvider,
  // Event Types
  BacktestEvent,
  BacktestEventType,
  MarketDataEvent,
  SignalEvent,
  OrderEvent,
  FillEvent,
  // Order/Fill Types
  Order,
  Fill,
  // Position/Trade Types
  Position as IPosition,
  Trade as ITrade,
  // Portfolio Types
  PortfolioSnapshot,
  EquityCurvePoint,
  // Performance Types
  PerformanceMetrics,
  // Models
  CommissionModel,
  SlippageModel,
} from "./types/backtest-types.js";
