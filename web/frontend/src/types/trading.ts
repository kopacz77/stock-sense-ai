/**
 * Core trading types for the Stock Sense AI application
 */

export interface Signal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  strategy: string;
  confidence: number;
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

export interface Opportunity {
  symbol: string;
  signal: Signal;
  currentPrice: number;
  sector?: string;
  marketCap?: number;
  timestamp: Date;
}

export interface MonitoringStats {
  isRunning: boolean;
  uptime: number;
  totalScans: number;
  opportunitiesFound: number;
  alertsSent: number;
  apiCallsToday: number;
  lastScan?: Date;
}

export interface MarketOverview {
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullishSignals: number;
  bearishSignals: number;
  totalAnalyzed: number;
  topSectors: Array<{
    sector: string;
    signalCount: number;
  }>;
}

export interface ChartDataPoint {
  timestamp: Date;
  opportunities: number;
  avgConfidence: number;
}

export interface DashboardUpdate {
  stats: MonitoringStats;
  overview: MarketOverview;
  opportunities: Opportunity[];
  chartData: ChartDataPoint[];
}

export interface MonitoringConfig {
  interval: number;
  sectors: string[];
  trending: boolean;
  confidence: number;
  maxResults: number;
}

export interface DiscoveryConfig {
  type: 'trending' | 'sector';
  target: string;
  config: {
    minConfidence: number;
    maxResults: number;
  };
}

export interface StockQuote {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

export interface AnalysisResult {
  symbol: string;
  quote: StockQuote;
  signal?: Signal;
  indicators?: Record<string, number>;
}
