/**
 * Type definitions for data management
 */

import type { HistoricalDataPoint } from "../types/backtest-types.js";

/**
 * Data source type
 */
export type DataSourceType = "CSV" | "API" | "DATABASE" | "MEMORY";

/**
 * Data source configuration
 */
export interface DataSourceConfig {
  /** Source type */
  type: DataSourceType;
  /** Base path for CSV files */
  basePath?: string;
  /** API endpoint */
  apiEndpoint?: string;
  /** API key */
  apiKey?: string;
  /** Database connection string */
  connectionString?: string;
  /** Additional options */
  options?: Record<string, unknown>;
}

/**
 * Data quality metrics
 */
export interface DataQualityMetrics {
  /** Total number of data points */
  totalPoints: number;
  /** Number of missing data points */
  missingPoints: number;
  /** Percentage of data completeness */
  completeness: number;
  /** Date range start */
  startDate: Date;
  /** Date range end */
  endDate: Date;
  /** Symbols included */
  symbols: string[];
  /** Data gaps (periods with missing data) */
  gaps: DataGap[];
}

/**
 * Represents a gap in the data
 */
export interface DataGap {
  /** Symbol with the gap */
  symbol: string;
  /** Gap start date */
  startDate: Date;
  /** Gap end date */
  endDate: Date;
  /** Number of expected data points */
  expectedPoints: number;
}

/**
 * Data validation result
 */
export interface DataValidationResult {
  /** Whether data is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Quality metrics */
  quality: DataQualityMetrics;
}
