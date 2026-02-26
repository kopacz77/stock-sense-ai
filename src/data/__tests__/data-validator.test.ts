/**
 * Data Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { DataValidator } from '../data-validator';
import type { OHLCVData } from '../types';

describe('DataValidator', () => {
  const validData: OHLCVData[] = [
    {
      date: '2024-01-01',
      open: 100,
      high: 105,
      low: 99,
      close: 103,
      volume: 1000000,
    },
    {
      date: '2024-01-02',
      open: 103,
      high: 108,
      low: 102,
      close: 107,
      volume: 1200000,
    },
  ];

  it('should validate correct data', () => {
    const result = DataValidator.validate(validData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing date', () => {
    const data = [{ ...validData[0], date: '' }];
    const result = DataValidator.validate(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing date'))).toBe(true);
  });

  it('should detect invalid OHLC relationships', () => {
    const data = [
      {
        date: '2024-01-01',
        open: 100,
        high: 95, // High < Low is invalid
        low: 99,
        close: 103,
        volume: 1000000,
      },
    ];
    const result = DataValidator.validate(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('High'))).toBe(true);
  });

  it('should detect extreme price changes', () => {
    const data = [
      validData[0],
      {
        date: '2024-01-02',
        open: 200, // 100% increase
        high: 205,
        low: 199,
        close: 203,
        volume: 1000000,
      },
    ];
    const result = DataValidator.validate(data);
    expect(result.warnings.some((w) => w.includes('Extreme price change'))).toBe(true);
  });

  it('should detect date gaps', () => {
    const data = [
      validData[0],
      {
        date: '2024-01-05', // Gap of 3 days
        open: 103,
        high: 108,
        low: 102,
        close: 107,
        volume: 1200000,
      },
    ];
    const result = DataValidator.validate(data, { checkGaps: true });
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('should fill gaps in data', () => {
    const data = [
      validData[0],
      {
        date: '2024-01-03', // Gap of 1 day
        open: 103,
        high: 108,
        low: 102,
        close: 107,
        volume: 1200000,
      },
    ];

    const filled = DataValidator.fillGaps(data);
    expect(filled.length).toBeGreaterThan(data.length);
  });
});
