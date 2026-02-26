/**
 * Data Infrastructure Module - Index
 * Exports all data management components
 */

// Main Services
export { MarketDataService } from "./market-data-service.js";
export { DataCacheManager } from "./cache-manager.js";
export { CSVLoader } from "./csv-loader.js";
export { DataValidator } from "./data-validator.js";
export { RateLimiter } from "./rate-limiter.js";

// Data Providers
export { AlphaVantageProvider } from "./providers/alpha-vantage-provider.js";
export { FinnhubProvider } from "./providers/finnhub-provider.js";

// Types
export type {
  OHLCVData,
  QuoteData,
  DataProvider,
  CacheMetadata,
  DownloadProgress,
  DataValidationResult,
  DateRange,
} from "./types.js";

export type { CacheConfig } from "./cache-manager.js";
