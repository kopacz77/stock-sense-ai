/**
 * Yahoo Finance Data Provider
 * Free provider for historical stock data (no API key required)
 * Uses the unofficial Yahoo Finance API
 */

import axios from 'axios';
import type { HistoricalData } from '../../types/trading.js';

export class YahooFinanceProvider {
  name = 'YahooFinance';
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/AAPL`, {
        params: {
          interval: '1d',
          range: '5d',
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      return response.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.length > 0;
    } catch {
      return false;
    }
  }

  async fetchHistoricalData(
    symbol: string,
    days: number = 100
  ): Promise<HistoricalData[]> {
    // Calculate date range
    const to = Math.floor(Date.now() / 1000);
    const from = to - (days * 24 * 60 * 60);

    const response = await axios.get(`${this.baseUrl}/${symbol.toUpperCase()}`, {
      params: {
        period1: from,
        period2: to,
        interval: '1d',
        events: 'history',
      },
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];

    if (!quote || timestamps.length === 0) {
      throw new Error(`Invalid response from Yahoo Finance for symbol: ${symbol}`);
    }

    const historicalData: HistoricalData[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      // Skip if any value is null (happens on holidays, etc.)
      if (
        quote.open[i] == null ||
        quote.high[i] == null ||
        quote.low[i] == null ||
        quote.close[i] == null ||
        quote.volume[i] == null
      ) {
        continue;
      }

      const date = new Date(timestamps[i] * 1000);
      historicalData.push({
        date: date.toISOString().split('T')[0] ?? '',
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i],
      });
    }

    // Sort by date descending (most recent first)
    return historicalData.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
}
