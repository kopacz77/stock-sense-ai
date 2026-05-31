/**
 * Market Data Service - Enhanced with caching and multiple providers
 * Fetches real-time and historical stock data with fallback support
 */

import axios from "axios";
import type { HistoricalData, MarketData } from "../types/trading.js";
import { SecureConfig } from "../config/secure-config.js";
import { AlphaVantageProvider } from "./providers/alpha-vantage-provider.js";
import { FinnhubProvider } from "./providers/finnhub-provider.js";
import { YahooFinanceProvider } from "./providers/yahoo-finance-provider.js";
import { DataCacheManager } from "./cache-manager.js";
import type { OHLCVData } from "./types.js";

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

export interface FullAnalysisData {
  quote: MarketData;
  historical: HistoricalData[];
}

export class MarketDataService {
  private apiKey: string | null = null;
  private baseUrl = "https://www.alphavantage.co/query";

  // Historical data cache (1 hour TTL - data changes daily)
  private cache: Map<string, { data: HistoricalData[]; timestamp: number }> = new Map();
  private cacheDuration = 60 * 60 * 1000; // 1 hour

  // Quote cache (4 hours TTL - derived from historical, rarely needs fresh API call)
  private quoteCache: Map<string, { data: MarketData; timestamp: number }> = new Map();
  private quoteCacheDuration = 4 * 60 * 60 * 1000; // 4 hours

  // API call tracking for rate limit awareness
  private apiCallCount = 0;
  private apiCallResetTime: Date | null = null;
  private readonly DAILY_LIMIT = 25; // Alpha Vantage free tier

  // Enhanced features
  private alphaVantageProvider: AlphaVantageProvider | null = null;
  private finnhubProvider: FinnhubProvider | null = null;
  private yahooFinanceProvider: YahooFinanceProvider;
  private cacheManager: DataCacheManager;
  private initialized = false;

  constructor() {
    this.initializeApiKey();
    this.cacheManager = new DataCacheManager();
    // Yahoo Finance is always available (no API key required)
    this.yahooFinanceProvider = new YahooFinanceProvider();
  }

  private async initializeApiKey(): Promise<void> {
    try {
      const config = SecureConfig.getInstance();
      if (config.isConfigured()) {
        this.apiKey = config.get<string>("apis.alphaVantage");

        // Initialize enhanced providers from SecureConfig
        try {
          if (this.apiKey) {
            this.alphaVantageProvider = new AlphaVantageProvider(this.apiKey);
          }
        } catch {
          // Ignore, will use legacy implementation
        }

        try {
          const finnhubKey = config.get<string>("apis.finnhub");
          if (finnhubKey) {
            this.finnhubProvider = new FinnhubProvider(finnhubKey);
          }
        } catch {
          // Finnhub is optional
        }
      } else {
        // Config not configured, try environment variables directly
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || null;
      }
    } catch {
      // Fallback to environment variables
      this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || null;
    }

    // Always try to initialize providers from environment variables as fallback
    // This ensures env vars work even when SecureConfig is used
    if (!this.alphaVantageProvider && this.apiKey) {
      try {
        this.alphaVantageProvider = new AlphaVantageProvider(this.apiKey);
      } catch {
        // Ignore
      }
    }
    if (!this.finnhubProvider) {
      const finnhubEnvKey = process.env.FINNHUB_API_KEY;
      if (finnhubEnvKey) {
        try {
          this.finnhubProvider = new FinnhubProvider(finnhubEnvKey);
          console.info("Finnhub provider initialized from environment variable");
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Initialize enhanced features (optional, for new functionality)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Re-initialize providers now that config is available
      await this.initializeApiKey();
      await this.cacheManager.initialize();
      this.initialized = true;

      // Verify API key is available
      if (!this.apiKey) {
        console.warn("Warning: Alpha Vantage API key not available after initialization");
      }
    } catch (error) {
      console.warn("Failed to initialize enhanced features:", error);
      // Still try to set API key from environment
      this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || null;
    }
  }

  /**
   * Set API key manually
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  // Track if we've hit Alpha Vantage rate limit today
  private alphaVantageRateLimited = false;
  private alphaVantageRateLimitResetTime: Date | null = null;

  /**
   * Fetch historical daily data with automatic failover
   * Tries Alpha Vantage first, falls back to Finnhub on rate limit
   */
  async getHistoricalData(
    symbol: string,
    outputSize: "compact" | "full" = "full"
  ): Promise<HistoricalData[]> {
    // Check cache first (regardless of provider)
    const cacheKey = `${symbol}_${outputSize}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    // Check if Alpha Vantage rate limit has reset (next day)
    if (this.alphaVantageRateLimited && this.alphaVantageRateLimitResetTime) {
      if (new Date() > this.alphaVantageRateLimitResetTime) {
        this.alphaVantageRateLimited = false;
        this.alphaVantageRateLimitResetTime = null;
        console.info("Alpha Vantage rate limit reset, re-enabling as primary provider");
      }
    }

    // Try Alpha Vantage first (if not rate limited and key available)
    if (!this.alphaVantageRateLimited && this.apiKey) {
      try {
        const data = await this.fetchFromAlphaVantage(symbol, outputSize);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Check if it's a rate limit error
        if (errorMessage.includes("rate limit")) {
          console.warn("Alpha Vantage rate limit hit, switching to Finnhub fallback");
          this.alphaVantageRateLimited = true;
          // Reset at midnight UTC tomorrow
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(0, 0, 0, 0);
          this.alphaVantageRateLimitResetTime = tomorrow;
        } else {
          // Non-rate-limit error, try Finnhub anyway
          console.warn(`Alpha Vantage error for ${symbol}: ${errorMessage}, trying Finnhub`);
        }
      }
    }

    // Fallback to Finnhub (for historical candles - requires paid tier)
    if (this.finnhubProvider) {
      try {
        const data = await this.fetchFromFinnhub(symbol);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (finnhubError) {
        const finnhubMessage = finnhubError instanceof Error ? finnhubError.message : "Unknown error";
        console.warn(`Finnhub failed for ${symbol}: ${finnhubMessage}, trying Yahoo Finance`);
      }
    }

    // Ultimate fallback: Yahoo Finance (free, no API key needed)
    try {
      console.info(`Using Yahoo Finance for ${symbol}`);
      const data = await this.yahooFinanceProvider.fetchHistoricalData(symbol, 100);
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (yahooError) {
      const yahooMessage = yahooError instanceof Error ? yahooError.message : "Unknown error";
      throw new Error(`All providers failed for ${symbol}. Yahoo Finance: ${yahooMessage}`);
    }
  }

  /**
   * Fetch from Alpha Vantage (internal)
   */
  private async fetchFromAlphaVantage(
    symbol: string,
    outputSize: "compact" | "full"
  ): Promise<HistoricalData[]> {
    const response = await axios.get<AlphaVantageResponse>(this.baseUrl, {
      params: {
        function: "TIME_SERIES_DAILY",
        symbol,
        outputsize: outputSize,
        apikey: this.apiKey,
      },
      timeout: 10000,
    });

    // Check for rate limit message
    const responseData = response.data as unknown as Record<string, unknown>;
    if (responseData.Information) {
      throw new Error("Alpha Vantage rate limit exceeded. Free tier allows 25 requests/day.");
    }

    const timeSeries = response.data["Time Series (Daily)"];
    if (!timeSeries) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    return Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseFloat(values["5. volume"]),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Fetch from Finnhub (internal) - converts to HistoricalData format
   */
  private async fetchFromFinnhub(symbol: string): Promise<HistoricalData[]> {
    if (!this.finnhubProvider) {
      throw new Error("Finnhub provider not configured");
    }

    // Fetch last 100 days of data
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 100);

    const ohlcvData = await this.finnhubProvider.fetchHistoricalData(symbol, from, to);

    // Convert OHLCVData to HistoricalData format
    return ohlcvData
      .map((d) => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Fetch current quote data (Legacy)
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
   * Derive quote from historical data - NO API CALL NEEDED
   * This is the key optimization: we get all data from TIME_SERIES_DAILY
   */
  private deriveQuoteFromHistorical(symbol: string, historical: HistoricalData[]): MarketData {
    const latest = historical[0];
    const previous = historical[1];
    if (!latest || !previous) {
      throw new Error(`Insufficient historical data for ${symbol}`);
    }

    const change = latest.close - previous.close;
    const changePercent = (change / previous.close) * 100;

    return {
      symbol,
      timestamp: new Date(latest.date),
      price: latest.close,
      change,
      changePercent,
      high: latest.high,
      low: latest.low,
      open: latest.open,
      previousClose: previous.close,
      volume: latest.volume,
    };
  }

  /**
   * Get full analysis data (quote + historical)
   * OPTIMIZED: Uses only TIME_SERIES_DAILY - derives quote from historical data
   * This means 1 API call gets us EVERYTHING we need!
   */
  async getFullAnalysisData(symbol: string): Promise<FullAnalysisData> {
    // Get historical data (uses TIME_SERIES_DAILY which is cached for 1 hour)
    const historical = await this.getHistoricalData(symbol, "compact");

    // Check quote cache first
    const upperSymbol = symbol.toUpperCase();
    const cachedQuote = this.quoteCache.get(upperSymbol);
    if (cachedQuote && Date.now() - cachedQuote.timestamp < this.quoteCacheDuration) {
      return { quote: cachedQuote.data, historical };
    }

    // Derive quote from historical data - NO ADDITIONAL API CALL
    const quote = this.deriveQuoteFromHistorical(upperSymbol, historical);

    // Cache the derived quote
    this.quoteCache.set(upperSymbol, { data: quote, timestamp: Date.now() });

    return { quote, historical };
  }

  /**
   * Health check for API connectivity
   */
  async healthCheck(): Promise<{ alphaVantage: boolean; finnhub: boolean; errors: string[] }> {
    const result = {
      alphaVantage: false,
      finnhub: false,
      errors: [] as string[],
    };

    // Test Alpha Vantage
    if (this.alphaVantageProvider) {
      try {
        result.alphaVantage = await this.alphaVantageProvider.testConnection();
      } catch (error) {
        result.errors.push(`Alpha Vantage: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (this.apiKey) {
      // Fallback to legacy test
      try {
        await this.getCurrentQuote("AAPL");
        result.alphaVantage = true;
      } catch (error) {
        result.errors.push(`Alpha Vantage: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Test Finnhub
    if (this.finnhubProvider) {
      try {
        result.finnhub = await this.finnhubProvider.testConnection();
      } catch (error) {
        result.errors.push(`Finnhub: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    legacyCache: number;
    enhancedCache?: any;
  }> {
    const stats: any = {
      legacyCache: this.cache.size,
    };

    if (this.initialized) {
      try {
        stats.enhancedCache = await this.cacheManager.getStats();
      } catch (error) {
        // Enhanced cache not available
      }
    }

    return stats;
  }

  /**
   * Get cache manager (for enhanced features)
   */
  getCacheManager(): DataCacheManager {
    return this.cacheManager;
  }

  /**
   * Fetch historical data with enhanced caching (New)
   *
   * Provider chain: cache -> Alpha Vantage -> Finnhub -> Yahoo Finance.
   * Yahoo is the always-available final fallback (no API key, no daily quota),
   * which is what lets the M2-01 universe prefetch (35 tickers x 8 years)
   * complete without burning the Alpha Vantage 25-req/day free-tier limit.
   */
  async fetchHistoricalData(
    symbol: string,
    from: Date,
    to: Date = new Date()
  ): Promise<OHLCVData[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check enhanced cache
    const cached = await this.cacheManager.getHistoricalData(symbol, from, to);
    if (cached) {
      return cached;
    }

    // Try Alpha Vantage provider
    if (this.alphaVantageProvider) {
      try {
        const data = await this.alphaVantageProvider.fetchHistoricalData(symbol, from, to);
        await this.cacheManager.setHistoricalData(symbol, from, to, data, 'alpha-vantage');
        return data;
      } catch (error) {
        console.warn('Alpha Vantage failed, trying Finnhub...', error);
      }
    }

    // Fallback to Finnhub
    if (this.finnhubProvider) {
      try {
        const data = await this.finnhubProvider.fetchHistoricalData(symbol, from, to);
        await this.cacheManager.setHistoricalData(symbol, from, to, data, 'finnhub');
        return data;
      } catch (error) {
        console.warn('Finnhub failed, falling back to Yahoo Finance...', error);
      }
    }

    // Ultimate fallback: Yahoo Finance (free, no API key, no daily quota)
    try {
      console.info(`Falling back to Yahoo Finance for ${symbol} (${from.toISOString().split('T')[0]} -> ${to.toISOString().split('T')[0]})`);
      const yahooData = await this.yahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to);

      // HistoricalData and OHLCVData are structurally identical (date/open/high/low/close/volume).
      // Map explicitly to keep the type contract clean and to drop any extra fields.
      const data: OHLCVData[] = yahooData.map((d) => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));

      await this.cacheManager.setHistoricalData(symbol, from, to, data, 'yahoo');
      return data;
    } catch (yahooError) {
      const yahooMessage = yahooError instanceof Error ? yahooError.message : 'Unknown error';
      throw new Error(
        `Failed to fetch ${symbol} from ${from.toISOString()} to ${to.toISOString()}: ` +
        `all providers (Alpha Vantage, Finnhub, Yahoo) failed. Last error: ${yahooMessage}`
      );
    }
  }

  /**
   * Batch download (New)
   */
  async batchDownload(
    symbols: string[],
    from: Date,
    to: Date,
    onProgress?: (progress: any) => void
  ): Promise<Map<string, OHLCVData[]>> {
    const results = new Map<string, OHLCVData[]>();

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      if (!symbol) continue;

      if (onProgress) {
        onProgress({
          symbol,
          current: i + 1,
          total: symbols.length,
          status: 'downloading',
        });
      }

      try {
        const data = await this.fetchHistoricalData(symbol, from, to);
        results.set(symbol, data);

        if (onProgress) {
          onProgress({
            symbol,
            current: i + 1,
            total: symbols.length,
            status: 'complete',
          });
        }
      } catch (error) {
        if (onProgress) {
          onProgress({
            symbol,
            current: i + 1,
            total: symbols.length,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return results;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.quoteCache.clear();
  }

  /**
   * Get API usage stats for monitoring
   */
  getApiUsageStats(): { callCount: number; dailyLimit: number; cacheStats: { historical: number; quotes: number } } {
    return {
      callCount: this.apiCallCount,
      dailyLimit: this.DAILY_LIMIT,
      cacheStats: {
        historical: this.cache.size,
        quotes: this.quoteCache.size,
      },
    };
  }
}
