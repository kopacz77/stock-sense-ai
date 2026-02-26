/**
 * Data Validator
 * Validates OHLCV data for gaps, anomalies, and quality issues
 */

import type { OHLCVData, DataValidationResult } from './types.js';

export class DataValidator {
  /**
   * Validate OHLCV data for quality and completeness
   */
  static validate(data: OHLCVData[], options?: {
    checkGaps?: boolean;
    checkAnomalies?: boolean;
    allowWeekends?: boolean;
  }): DataValidationResult {
    const opts = {
      checkGaps: true,
      checkAnomalies: true,
      allowWeekends: true,
      ...options,
    };

    const result: DataValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      gaps: [],
      dataPoints: data.length,
    };

    if (data.length === 0) {
      result.valid = false;
      result.errors.push('No data points provided');
      return result;
    }

    // Sort data by date
    const sortedData = [...data].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Validate each data point
    for (let i = 0; i < sortedData.length; i++) {
      const point = sortedData[i];
      if (!point) continue;

      const pointErrors = this.validateDataPoint(point, i);

      if (pointErrors.length > 0) {
        result.errors.push(...pointErrors);
        result.valid = false;
      }

      // Check for anomalies
      if (opts.checkAnomalies && i > 0) {
        const prevPoint = sortedData[i - 1];
        if (prevPoint) {
          const anomalies = this.detectAnomalies(prevPoint, point);
          if (anomalies.length > 0) {
            result.warnings.push(...anomalies);
          }
        }
      }
    }

    // Check for date gaps
    if (opts.checkGaps && sortedData.length > 1) {
      const gaps = this.detectGaps(sortedData, opts.allowWeekends);
      result.gaps = gaps;

      if (gaps.length > 0) {
        result.warnings.push(`Found ${gaps.length} date gap(s) in the data`);
      }
    }

    return result;
  }

  /**
   * Validate a single OHLCV data point
   */
  private static validateDataPoint(point: OHLCVData, index: number): string[] {
    const errors: string[] = [];

    // Check for required fields
    if (!point.date) {
      errors.push(`Row ${index}: Missing date`);
    } else {
      const date = new Date(point.date);
      if (isNaN(date.getTime())) {
        errors.push(`Row ${index}: Invalid date format: ${point.date}`);
      }
    }

    // Check for valid numbers
    const numericFields = ['open', 'high', 'low', 'close', 'volume'] as const;
    for (const field of numericFields) {
      if (typeof point[field] !== 'number' || isNaN(point[field])) {
        errors.push(`Row ${index}: Invalid ${field} value: ${point[field]}`);
      } else if (point[field] < 0) {
        errors.push(`Row ${index}: Negative ${field} value: ${point[field]}`);
      }
    }

    // Validate OHLC relationships
    if (
      typeof point.high === 'number' &&
      typeof point.low === 'number' &&
      typeof point.open === 'number' &&
      typeof point.close === 'number'
    ) {
      if (point.high < point.low) {
        errors.push(`Row ${index}: High (${point.high}) is less than Low (${point.low})`);
      }
      if (point.open > point.high || point.open < point.low) {
        errors.push(`Row ${index}: Open (${point.open}) is outside High/Low range`);
      }
      if (point.close > point.high || point.close < point.low) {
        errors.push(`Row ${index}: Close (${point.close}) is outside High/Low range`);
      }
    }

    return errors;
  }

  /**
   * Detect price anomalies (e.g., massive price swings)
   */
  private static detectAnomalies(prev: OHLCVData, current: OHLCVData): string[] {
    const warnings: string[] = [];

    // Check for extreme price changes (>50% in one day)
    const priceChange = Math.abs(current.close - prev.close) / prev.close;
    if (priceChange > 0.5) {
      warnings.push(
        `${current.date}: Extreme price change detected: ${(priceChange * 100).toFixed(2)}%`
      );
    }

    // Check for zero volume
    if (current.volume === 0) {
      warnings.push(`${current.date}: Zero volume detected`);
    }

    // Check for volume spikes (>10x average)
    const volumeRatio = current.volume / prev.volume;
    if (volumeRatio > 10) {
      warnings.push(
        `${current.date}: Extreme volume spike detected: ${volumeRatio.toFixed(2)}x`
      );
    }

    return warnings;
  }

  /**
   * Detect gaps in date sequence
   */
  private static detectGaps(
    data: OHLCVData[],
    allowWeekends: boolean
  ): { from: string; to: string }[] {
    const gaps: { from: string; to: string }[] = [];

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (!prev || !curr) continue;

      const prevDate = new Date(prev.date);
      const currDate = new Date(curr.date);

      const daysDiff = this.getBusinessDaysDiff(prevDate, currDate, allowWeekends);

      // If more than 1 business day gap
      if (daysDiff > 1) {
        gaps.push({
          from: prev.date,
          to: curr.date,
        });
      }
    }

    return gaps;
  }

  /**
   * Calculate business days difference between two dates
   */
  private static getBusinessDaysDiff(
    date1: Date,
    date2: Date,
    allowWeekends: boolean
  ): number {
    if (allowWeekends) {
      // Just count calendar days
      const diff = Math.abs(date2.getTime() - date1.getTime());
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    // Count business days (excluding weekends)
    let count = 0;
    const current = new Date(date1);

    while (current < date2) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  /**
   * Fill gaps with forward-filled data (simple approach)
   */
  static fillGaps(data: OHLCVData[]): OHLCVData[] {
    if (data.length === 0) return [];

    const sortedData = [...data].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const firstItem = sortedData[0];
    if (!firstItem) return [];

    const filled: OHLCVData[] = [firstItem];

    for (let i = 1; i < sortedData.length; i++) {
      const lastFilled = filled[filled.length - 1];
      const currItem = sortedData[i];
      if (!lastFilled || !currItem) continue;

      const prevDate = new Date(lastFilled.date);
      const currDate = new Date(currItem.date);

      // Fill missing dates with forward-filled data
      const current = new Date(prevDate);
      current.setDate(current.getDate() + 1);

      while (current < currDate) {
        const prev = filled[filled.length - 1];
        if (!prev) break;

        filled.push({
          date: current.toISOString().split('T')[0] ?? '',
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close,
          volume: 0,
        });
        current.setDate(current.getDate() + 1);
      }

      filled.push(currItem);
    }

    return filled;
  }
}
