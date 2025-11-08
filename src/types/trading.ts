import type { TechnicalIndicatorResults } from "../analysis/technical-indicators.js";

export interface Signal {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  strength: number; // 0-100
  strategy: string;
  indicators: TechnicalIndicatorResults;
  confidence: number; // 0-100
  stopLoss?: number;
  takeProfit?: number;
  positionSize?: number;
  reasons: string[];
  timestamp: Date;
  entryPrice?: number;
  riskAmount?: number;
}

export interface Position {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  value: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  stopLoss?: number;
  takeProfit?: number;
  entryDate: Date;
  strategy: string;
  riskAmount: number;
  sector?: string;
}

export interface MarketData {
  symbol: string;
  timestamp: Date;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
}

export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  parameters: Record<string, any>;
  minConfidence: number;
  maxPositions: number;
}

export interface RiskParameters {
  maxRiskPerTrade: number; // Percentage (0.01 = 1%)
  maxPositionSize: number; // Percentage of portfolio (0.25 = 25%)
  stopLossMultiplier: number; // ATR multiplier for stop loss
  takeProfitRatio: number; // Risk:Reward ratio (2 = 2:1)
  maxCorrelatedPositions: number;
  maxSectorExposure: number; // Percentage (0.3 = 30%)
}

export interface PortfolioMetrics {
  totalValue: number;
  totalCash: number;
  totalPositions: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  totalRisk: number;
  riskPercentage: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  winRate?: number;
  avgWin?: number;
  avgLoss?: number;
  profitFactor?: number;
}

export interface AlertConfig {
  type: "STRONG_SIGNAL" | "RISK_WARNING" | "POSITION_UPDATE" | "MARKET_MOVE";
  symbol?: string;
  threshold?: number;
  enabled: boolean;
}

export interface TradeExecution {
  signal: Signal;
  executionPrice: number;
  executionTime: Date;
  quantity: number;
  fees: number;
  slippage: number;
  status: "PENDING" | "FILLED" | "PARTIAL" | "REJECTED" | "CANCELLED";
  orderId?: string;
}

export interface StrategyPerformance {
  name: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  calmarRatio: number;
  trades: TradeExecution[];
}

export interface ScanResult {
  symbol: string;
  signals: Signal[];
  score: number;
  rank: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  sector?: string;
  addedDate: Date;
  notes?: string;
  alertsEnabled: boolean;
}
