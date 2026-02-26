/**
 * Alpha Vantage Data Provider
 * Fetches stock quotes and historical data from Alpha Vantage API
 */

import axios from 'axios';
import type { DataProvider, OHLCVData, QuoteData } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';

export class AlphaVantageProvider implements DataProvider {
  name = 'Alpha Vantage';
  private apiKey: string;
  private rateLimiter: RateLimiter;
  private baseUrl = 'https://www.alphavantage.co/query';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Alpha Vantage free tier: 5 calls/min, 500 calls/day
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 5,
      requestsPerDay: 500,
      name: 'Alpha Vantage',
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: 'AAPL',
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      return !!response.data['Global Quote'];
    } catch (error) {
      return false;
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData> {
    await this.rateLimiter.waitForAvailability();

    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey,
      },
      timeout: 30000,
    });

    const quote = response.data['Global Quote'];

    if (!quote || Object.keys(quote).length === 0) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      previousClose: parseFloat(quote['08. previous close']),
      volume: parseInt(quote['06. volume']),
      timestamp: new Date(quote['07. latest trading day']),
    };
  }

  async fetchHistoricalData(
    symbol: string,
    from: Date,
    to: Date
  ): Promise<OHLCVData[]> {
    await this.rateLimiter.waitForAvailability();

    // Determine if we need full or compact output
    const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const outputSize = daysDiff > 100 ? 'full' : 'compact';

    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: symbol.toUpperCase(),
        outputsize: outputSize,
        apikey: this.apiKey,
      },
      timeout: 60000, // 60 second timeout for large datasets
    });

    const timeSeries = response.data['Time Series (Daily)'];

    if (!timeSeries) {
      // Check for error message
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }
      if (response.data['Note']) {
        throw new Error(
          'Alpha Vantage API rate limit exceeded. Please wait a minute and try again.'
        );
      }
      throw new Error(`No historical data found for symbol: ${symbol}`);
    }

    const data: OHLCVData[] = [];

    for (const [date, values] of Object.entries(timeSeries)) {
      const dataDate = new Date(date);

      // Filter by date range
      if (dataDate >= from && dataDate <= to) {
        data.push({
          date,
          open: parseFloat((values as any)['1. open']),
          high: parseFloat((values as any)['2. high']),
          low: parseFloat((values as any)['3. low']),
          close: parseFloat((values as any)['4. close']),
          adjustedClose: parseFloat((values as any)['5. adjusted close']),
          volume: parseInt((values as any)['6. volume']),
        });
      }
    }

    // Sort by date ascending
    return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Fetch intraday data (for future use)
   */
  async fetchIntradayData(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '60min' = '5min'
  ): Promise<OHLCVData[]> {
    await this.rateLimiter.waitForAvailability();

    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'TIME_SERIES_INTRADAY',
        symbol: symbol.toUpperCase(),
        interval,
        outputsize: 'compact',
        apikey: this.apiKey,
      },
      timeout: 30000,
    });

    const timeSeries = response.data[`Time Series (${interval})`];

    if (!timeSeries) {
      throw new Error(`No intraday data found for symbol: ${symbol}`);
    }

    const data: OHLCVData[] = [];

    for (const [datetime, values] of Object.entries(timeSeries)) {
      data.push({
        date: datetime,
        open: parseFloat((values as any)['1. open']),
        high: parseFloat((values as any)['2. high']),
        low: parseFloat((values as any)['3. low']),
        close: parseFloat((values as any)['4. close']),
        volume: parseInt((values as any)['5. volume']),
      });
    }

    return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  getRemainingRequests(): { perMinute: number; perDay: number } {
    return this.rateLimiter.getRemainingRequests();
  }
}
