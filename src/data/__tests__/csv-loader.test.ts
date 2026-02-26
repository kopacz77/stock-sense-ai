/**
 * CSV Loader Tests
 */

import { describe, it, expect } from 'vitest';
import { CSVLoader } from '../csv-loader';

describe('CSVLoader', () => {
  const validCSV = `Date,Open,High,Low,Close,Volume
2024-01-01,100.00,105.00,99.00,103.00,1000000
2024-01-02,103.00,108.00,102.00,107.00,1200000`;

  it('should parse valid CSV with header', () => {
    const data = CSVLoader.parseCSV(validCSV);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      date: '2024-01-01',
      open: 100,
      high: 105,
      low: 99,
      close: 103,
      volume: 1000000,
    });
  });

  it('should detect comma separator', () => {
    const data = CSVLoader.parseCSV(validCSV);
    expect(data).toHaveLength(2);
  });

  it('should detect semicolon separator', () => {
    const csv = validCSV.replace(/,/g, ';');
    const data = CSVLoader.parseCSV(csv, { separator: 'auto' });
    expect(data).toHaveLength(2);
  });

  it('should parse CSV with different date formats', () => {
    const csv = `Date,Open,High,Low,Close,Volume
01/01/2024,100.00,105.00,99.00,103.00,1000000
01/02/2024,103.00,108.00,102.00,107.00,1200000`;

    const data = CSVLoader.parseCSV(csv);
    expect(data).toHaveLength(2);
  });

  it('should handle quoted values', () => {
    const csv = `Date,Open,High,Low,Close,Volume
"2024-01-01","100.00","105.00","99.00","103.00","1000000"`;

    const data = CSVLoader.parseCSV(csv);
    expect(data).toHaveLength(1);
    expect(data[0].open).toBe(100);
  });

  it('should export to CSV format', () => {
    const data = [
      {
        date: '2024-01-01',
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000000,
      },
    ];

    const csv = CSVLoader.toCSV(data);
    expect(csv).toContain('Date,Open,High,Low,Close,Volume');
    expect(csv).toContain('2024-01-01,100,105,99,103,1000000');
  });

  it('should throw on empty CSV', () => {
    expect(() => CSVLoader.parseCSV('')).toThrow('CSV file is empty');
  });

  it('should throw on missing required columns', () => {
    const csv = `Date,Price
2024-01-01,100`;

    expect(() => CSVLoader.parseCSV(csv)).toThrow('Unable to detect required columns');
  });

  it('should detect columns from various header formats', () => {
    const csv = `d,o,h,l,c,v
2024-01-01,100,105,99,103,1000000`;

    const data = CSVLoader.parseCSV(csv);
    expect(data).toHaveLength(1);
  });
});
