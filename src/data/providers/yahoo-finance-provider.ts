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

    return this.parseChartResponse(symbol, response.data?.chart?.result?.[0]);
  }

  /**
   * Fetch historical daily bars for an arbitrary date range.
   * Use this for backtest data fetching (e.g. 8 years of bars for the M2-01 universe).
   * The legacy `fetchHistoricalData(symbol, days)` is kept for compatibility with the
   * existing analyzer / quote-derivation paths.
   */
  async fetchHistoricalDataRange(
    symbol: string,
    from: Date,
    to: Date
  ): Promise<HistoricalData[]> {
    const period1 = Math.floor(from.getTime() / 1000);
    const period2 = Math.floor(to.getTime() / 1000);

    const response = await axios.get(`${this.baseUrl}/${symbol.toUpperCase()}`, {
      params: {
        period1,
        period2,
        interval: '1d',
        events: 'history',
      },
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return this.parseChartResponse(symbol, response.data?.chart?.result?.[0]);
  }

  /**
   * Parse the Yahoo chart endpoint response into HistoricalData[] sorted newest-first.
   * Shared by both the days-based and date-range fetch paths.
   */
  private parseChartResponse(
    symbol: string,
    result: unknown
  ): HistoricalData[] {
    if (!result) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    const r = result as {
      timestamp?: number[];
      indicators?: { quote?: Array<{
        open: Array<number | null>;
        high: Array<number | null>;
        low: Array<number | null>;
        close: Array<number | null>;
        volume: Array<number | null>;
      }> };
    };

    const timestamps = r.timestamp ?? [];
    const quote = r.indicators?.quote?.[0];

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

      const ts = timestamps[i];
      if (ts == null) continue;
      const date = new Date(ts * 1000);
      historicalData.push({
        date: date.toISOString().split('T')[0] ?? '',
        open: quote.open[i] as number,
        high: quote.high[i] as number,
        low: quote.low[i] as number,
        close: quote.close[i] as number,
        volume: quote.volume[i] as number,
      });
    }

    // Sort by date descending (most recent first)
    return historicalData.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
}
