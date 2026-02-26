/**
 * Finnhub Data Provider
 * Backup data source for stock quotes and historical data
 */

import axios from 'axios';
import type { DataProvider, OHLCVData, QuoteData } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';

export class FinnhubProvider implements DataProvider {
  name = 'Finnhub';
  private apiKey: string;
  private rateLimiter: RateLimiter;
  private baseUrl = 'https://finnhub.io/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Finnhub free tier: 60 calls/min, 30 calls/sec (we'll be conservative)
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 30,
      requestsPerDay: 10000, // Conservative daily limit
      name: 'Finnhub',
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          symbol: 'AAPL',
          token: this.apiKey,
        },
        timeout: 10000,
      });

      return !!response.data.c; // Check if current price exists
    } catch (error) {
      return false;
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData> {
    await this.rateLimiter.waitForAvailability();

    const response = await axios.get(`${this.baseUrl}/quote`, {
      params: {
        symbol: symbol.toUpperCase(),
        token: this.apiKey,
      },
      timeout: 30000,
    });

    const data = response.data;

    if (!data.c || data.c === 0) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    const price = data.c; // current price
    const previousClose = data.pc; // previous close
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePercent,
      high: data.h, // high price of the day
      low: data.l, // low price of the day
      open: data.o, // open price of the day
      previousClose,
      volume: 0, // Finnhub quote doesn't include volume
      timestamp: new Date(data.t * 1000), // Unix timestamp
    };
  }

  async fetchHistoricalData(
    symbol: string,
    from: Date,
    to: Date
  ): Promise<OHLCVData[]> {
    await this.rateLimiter.waitForAvailability();

    const fromTimestamp = Math.floor(from.getTime() / 1000);
    const toTimestamp = Math.floor(to.getTime() / 1000);

    const response = await axios.get(`${this.baseUrl}/stock/candle`, {
      params: {
        symbol: symbol.toUpperCase(),
        resolution: 'D', // Daily resolution
        from: fromTimestamp,
        to: toTimestamp,
        token: this.apiKey,
      },
      timeout: 60000,
    });

    const data = response.data;

    if (data.s === 'no_data') {
      throw new Error(`No historical data found for symbol: ${symbol}`);
    }

    if (!data.c || data.c.length === 0) {
      throw new Error(`Invalid response from Finnhub for symbol: ${symbol}`);
    }

    const ohlcv: OHLCVData[] = [];

    for (let i = 0; i < data.c.length; i++) {
      const date = new Date(data.t[i] * 1000);
      ohlcv.push({
        date: date.toISOString().split('T')[0] ?? '',
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i],
      });
    }

    return ohlcv.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  getRemainingRequests(): { perMinute: number; perDay: number } {
    return this.rateLimiter.getRemainingRequests();
  }
}
