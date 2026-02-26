/**
 * Data Integration Types
 * Common data structures for market data providers
 */

export interface OHLCVData {
  date: string; // ISO 8601 format
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: Date;
}

export interface DataProvider {
  name: string;
  fetchQuote(symbol: string): Promise<QuoteData>;
  fetchHistoricalData(symbol: string, from: Date, to: Date): Promise<OHLCVData[]>;
  testConnection(): Promise<boolean>;
}

export interface CacheMetadata {
  symbol: string;
  provider: string;
  from: string;
  to: string;
  dataPoints: number;
  lastUpdated: Date;
  expiresAt: Date;
}

export interface DataValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  gaps: { from: string; to: string }[];
  dataPoints: number;
}

export interface DownloadProgress {
  symbol: string;
  current: number;
  total: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

export type DateRange = {
  from: Date;
  to: Date;
};
