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
  successfullyAnalyzed: number;
  topSectors: Array<{
    sector: string;
    signalCount: number;
  }>;
  analyzedSymbols: string[];
  skippedSymbols: string[];
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

// Technical Indicators types
export interface MarketRegime {
  type: 'BULLISH_TREND' | 'BEARISH_TREND' | 'SIDEWAYS' | 'VOLATILE';
  strength: number;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  trendStrength: number;
  confidence: number;
}

export interface TechnicalIndicators {
  rsi: number;
  mfi: number;
  macd: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  sma: {
    short: number;
    medium: number;
    long: number;
  };
  ema: {
    short: number;
    long: number;
  };
  atr: number;
  stochastic: {
    k: number;
    d: number;
  };
  cci: number;
  williamsR: number;
  volumeProfile: {
    averageVolume: number;
    volumeRatio: number;
    volumeTrend: 'increasing' | 'decreasing' | 'stable';
  };
  marketRegime: MarketRegime;
}

export interface TechnicalIndicatorData {
  symbol: string;
  timestamp: string;
  indicators: TechnicalIndicators;
  interpretation: {
    bullishSignals: string[];
    bearishSignals: string[];
    neutralSignals: string[];
  };
  currentPrice: number;
  priceChange: number;
}

// System Settings types
export interface SystemSettings {
  monitoring: {
    isRunning: boolean;
    interval: number;
    lastScan: string | null;
    totalScans: number;
  };
  dataProviders: {
    alphaVantage: boolean;
    finnhub: boolean;
    errors: string[];
  };
  features: {
    technicalIndicators: boolean;
    rsi: boolean;
    macd: boolean;
    bollingerBands: boolean;
    movingAverages: boolean;
    volumeProfile: boolean;
    marketRegime: boolean;
    stochastic: boolean;
    cci: boolean;
    williamsR: boolean;
    atr: boolean;
  };
  riskMetrics: {
    varEnabled: boolean;
    cvarEnabled: boolean;
    volatilityAnalysis: boolean;
  };
}
