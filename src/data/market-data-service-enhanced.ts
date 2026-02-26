/**
 * Market Data Service - Alpha Vantage API Integration
 * Fetches real-time and historical stock data
 */

import axios from "axios";
import type { HistoricalData, MarketData } from "../types/trading.js";
import { SecureConfig } from "../config/secure-config.js";

export interface AlphaVantageTimeSeriesDaily {
  [date: string]: {
    "1. open": string;
    "2. high": string;
    "3. low": string;
    "4. close": string;
    "5. volume": string;
  };
}

export interface AlphaVantageResponse {
  "Meta Data": {
    "1. Information": string;
    "2. Symbol": string;
    "3. Last Refreshed": string;
    "4. Output Size": string;
    "5. Time Zone": string;
  };
  "Time Series (Daily)": AlphaVantageTimeSeriesDaily;
}

export class MarketDataService {
  private apiKey: string | null = null;
  private baseUrl = "https://www.alphavantage.co/query";
  private cache: Map<string, { data: HistoricalData[]; timestamp: number }> = new Map();
  private cacheDuration = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.initializeApiKey();
  }

  private async initializeApiKey(): Promise<void> {
    try {
      const config = SecureConfig.getInstance();
      if (config.isConfigured()) {
        this.apiKey = config.get<string>("apis.alphaVantage");
      }
    } catch (error) {
      console.warn("Alpha Vantage API key not configured");
    }
  }

  /**
   * Set API key manually
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Fetch historical daily data from Alpha Vantage
   */
  async getHistoricalData(
    symbol: string,
    outputSize: "compact" | "full" = "full"
  ): Promise<HistoricalData[]> {
    if (!this.apiKey) {
      throw new Error("Alpha Vantage API key not configured");
    }

    // Check cache
    const cacheKey = `${symbol}_${outputSize}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await axios.get<AlphaVantageResponse>(this.baseUrl, {
        params: {
          function: "TIME_SERIES_DAILY",
          symbol,
          outputsize: outputSize,
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      const timeSeries = response.data["Time Series (Daily)"];
      if (!timeSeries) {
        throw new Error(`No data found for symbol: ${symbol}`);
      }

      const historicalData: HistoricalData[] = Object.entries(timeSeries)
        .map(([date, values]) => ({
          date,
          open: parseFloat(values["1. open"]),
          high: parseFloat(values["2. high"]),
          low: parseFloat(values["3. low"]),
          close: parseFloat(values["4. close"]),
          volume: parseFloat(values["5. volume"]),
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Cache the result
      this.cache.set(cacheKey, { data: historicalData, timestamp: Date.now() });

      return historicalData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch data for ${symbol}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch current quote data
   */
  async getCurrentQuote(symbol: string): Promise<MarketData> {
    if (!this.apiKey) {
      throw new Error("Alpha Vantage API key not configured");
    }

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          function: "GLOBAL_QUOTE",
          symbol,
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      const quote = response.data["Global Quote"];
      if (!quote) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      return {
        symbol,
        timestamp: new Date(),
        price: parseFloat(quote["05. price"]),
        change: parseFloat(quote["09. change"]),
        changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
        high: parseFloat(quote["03. high"]),
        low: parseFloat(quote["04. low"]),
        open: parseFloat(quote["02. open"]),
        previousClose: parseFloat(quote["08. previous close"]),
        volume: parseFloat(quote["06. volume"]),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
