/**
 * DataProvider adapter for MarketDataService
 * Bridges the backtesting framework with the market data infrastructure
 */

import type { DataProvider, HistoricalDataPoint } from '../types/backtest-types.js';
import { MarketDataService } from '../../data/market-data-service.js';

export class MarketDataProvider implements DataProvider {
  private marketDataService: MarketDataService;
  private dataCache: Map<string, HistoricalDataPoint[]> = new Map();

  constructor(marketDataService?: MarketDataService) {
    this.marketDataService = marketDataService ?? new MarketDataService();
  }

  async initialize(): Promise<void> {
    await this.marketDataService.initialize();
  }

  async loadData(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<HistoricalDataPoint[]> {
    const cacheKey = `${symbol}_${startDate.toISOString()}_${endDate.toISOString()}`;

    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!;
    }

    const ohlcvData = await this.marketDataService.fetchHistoricalData(symbol, startDate, endDate);

    // Convert OHLCVData to HistoricalDataPoint
    const data: HistoricalDataPoint[] = ohlcvData.map(d => ({
      symbol: symbol.toUpperCase(),
      timestamp: new Date(d.date),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));

    // Sort by timestamp ascending (oldest first)
    data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    this.dataCache.set(cacheKey, data);
    return data;
  }

  async hasData(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    try {
      const data = await this.loadData(symbol, startDate, endDate);
      return data.length > 0;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.dataCache.clear();
  }
}
