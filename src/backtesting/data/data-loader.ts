/**
 * Data loader for loading historical market data from various sources
 */

import type { HistoricalDataPoint } from "../types/backtest-types.js";
import type { DataSourceConfig, DataValidationResult } from "./types.js";

/**
 * Base data loader interface
 */
export interface DataLoader {
  /** Load data for a symbol within a date range */
  load(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalDataPoint[]>;
  /** Check if data exists */
  hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean>;
  /** Validate loaded data */
  validate(data: HistoricalDataPoint[]): DataValidationResult;
}

/**
 * CSV data loader implementation
 */
export class CSVDataLoader implements DataLoader {
  private basePath: string;

  /**
   * Create a new CSV data loader
   * @param config Data source configuration
   */
  constructor(config: DataSourceConfig) {
    if (!config.basePath) {
      throw new Error("CSV data loader requires basePath in config");
    }
    this.basePath = config.basePath;
  }

  /**
   * Load historical data from CSV file
   * @param symbol Trading symbol
   * @param startDate Start date
   * @param endDate End date
   * @returns Array of historical data points
   */
  async load(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalDataPoint[]> {
    // This is a placeholder - actual implementation would read CSV files
    // For now, return empty array to prevent errors
    throw new Error(
      `CSV data loading not yet implemented. Symbol: ${symbol}, Range: ${startDate.toISOString()} - ${endDate.toISOString()}`,
    );
  }

  /**
   * Check if data exists for the given parameters
   * @param symbol Trading symbol
   * @param startDate Start date
   * @param endDate End date
   * @returns True if data exists
   */
  async hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean> {
    // Placeholder implementation
    return false;
  }

  /**
   * Validate data quality
   * @param data Data to validate
   * @returns Validation result
   */
  validate(data: HistoricalDataPoint[]): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if data is empty
    if (data.length === 0) {
      errors.push("No data points provided");
      return {
        isValid: false,
        errors,
        warnings,
        quality: {
          totalPoints: 0,
          missingPoints: 0,
          completeness: 0,
          startDate: new Date(),
          endDate: new Date(),
          symbols: [],
          gaps: [],
        },
      };
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Validate data points
    for (let i = 0; i < sortedData.length; i++) {
      const point = sortedData[i];
      if (!point) continue;

      // Validate prices
      if (point.open <= 0 || point.high <= 0 || point.low <= 0 || point.close <= 0) {
        errors.push(`Invalid price at index ${i}: prices must be positive`);
      }

      // Validate OHLC relationship
      if (point.high < point.low) {
        errors.push(`Invalid OHLC at index ${i}: high cannot be less than low`);
      }
      if (point.high < point.open || point.high < point.close) {
        warnings.push(`Invalid high at index ${i}: high should be >= open and close`);
      }
      if (point.low > point.open || point.low > point.close) {
        warnings.push(`Invalid low at index ${i}: low should be <= open and close`);
      }

      // Validate volume
      if (point.volume < 0) {
        errors.push(`Invalid volume at index ${i}: volume cannot be negative`);
      }
    }

    // Calculate quality metrics
    const symbols = [...new Set(data.map((d) => d.symbol))];
    const firstPoint = sortedData[0];
    const lastPoint = sortedData[sortedData.length - 1];
    const quality = {
      totalPoints: data.length,
      missingPoints: 0,
      completeness: 100,
      startDate: firstPoint?.timestamp ?? new Date(),
      endDate: lastPoint?.timestamp ?? new Date(),
      symbols,
      gaps: [],
    };

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      quality,
    };
  }
}

/**
 * In-memory data loader for testing
 */
export class MemoryDataLoader implements DataLoader {
  private data: Map<string, HistoricalDataPoint[]>;

  /**
   * Create a new memory data loader
   * @param initialData Optional initial data
   */
  constructor(initialData?: Map<string, HistoricalDataPoint[]>) {
    this.data = initialData || new Map();
  }

  /**
   * Add data to the in-memory store
   * @param symbol Symbol
   * @param data Data points
   */
  addData(symbol: string, data: HistoricalDataPoint[]): void {
    this.data.set(symbol, data);
  }

  /**
   * Load data from memory
   * @param symbol Trading symbol
   * @param startDate Start date
   * @param endDate End date
   * @returns Array of historical data points
   */
  async load(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalDataPoint[]> {
    const symbolData = this.data.get(symbol) || [];

    // Filter by date range
    return symbolData.filter((point) => {
      return point.timestamp >= startDate && point.timestamp <= endDate;
    });
  }

  /**
   * Check if data exists
   * @param symbol Trading symbol
   * @param startDate Start date
   * @param endDate End date
   * @returns True if data exists
   */
  async hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean> {
    const data = await this.load(symbol, startDate, endDate);
    return data.length > 0;
  }

  /**
   * Validate data
   * @param data Data to validate
   * @returns Validation result
   */
  validate(data: HistoricalDataPoint[]): DataValidationResult {
    const loader = new CSVDataLoader({ type: "CSV", basePath: "" });
    return loader.validate(data);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
  }
}
