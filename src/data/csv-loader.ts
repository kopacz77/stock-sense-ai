/**
 * CSV Data Loader
 * Loads OHLCV data from CSV files with auto-detection
 */

import * as fs from 'node:fs/promises';
import type { OHLCVData } from './types.js';
import { DataValidator } from './data-validator.js';

export interface CSVParseOptions {
  separator?: ',' | ';' | '\t' | 'auto';
  hasHeader?: boolean;
  dateFormat?: 'auto' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
  columns?: {
    date?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  };
}

export class CSVLoader {
  /**
   * Load OHLCV data from CSV file
   */
  static async loadFromFile(
    filePath: string,
    options?: CSVParseOptions
  ): Promise<OHLCVData[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseCSV(content, options);
  }

  /**
   * Parse CSV content into OHLCV data
   */
  static parseCSV(content: string, options?: CSVParseOptions): OHLCVData[] {
    const opts: Required<CSVParseOptions> = {
      separator: options?.separator || 'auto',
      hasHeader: options?.hasHeader ?? true,
      dateFormat: options?.dateFormat || 'auto',
      columns: options?.columns || {},
    };

    // Split into lines
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Auto-detect separator
    if (opts.separator === 'auto') {
      const firstLine = lines[0] ?? '';
      opts.separator = this.detectSeparator(firstLine);
    }

    // Parse header to detect columns
    let startRow = 0;
    if (opts.hasHeader) {
      const firstLine = lines[0] ?? '';
      const header = this.parseLine(firstLine, opts.separator);
      opts.columns = this.detectColumns(header);
      startRow = 1;
    } else {
      // Assume standard order: Date, Open, High, Low, Close, Volume
      opts.columns = {
        date: 0,
        open: 1,
        high: 2,
        low: 3,
        close: 4,
        volume: 5,
      };
    }

    // Parse data rows
    const data: OHLCVData[] = [];
    const errors: string[] = [];

    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      try {
        const row = this.parseLine(line, opts.separator);
        const ohlcv = this.parseRow(row, opts, i);

        if (ohlcv) {
          data.push(ohlcv);
        }
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }
    }

    if (data.length === 0) {
      throw new Error(
        'No valid data rows found in CSV. ' +
        (errors.length > 0 ? `Errors: ${errors.slice(0, 5).join(', ')}` : '')
      );
    }

    // Validate data
    const validation = DataValidator.validate(data);
    if (!validation.valid) {
      throw new Error(
        `CSV data validation failed: ${validation.errors.slice(0, 5).join(', ')}`
      );
    }

    if (validation.warnings.length > 0) {
      console.warn('CSV data warnings:', validation.warnings.slice(0, 10));
    }

    return data;
  }

  /**
   * Export OHLCV data to CSV
   */
  static async exportToFile(
    filePath: string,
    data: OHLCVData[],
    options?: { separator?: ',' | ';' | '\t' }
  ): Promise<void> {
    const separator = options?.separator || ',';
    const csv = this.toCSV(data, separator);
    await fs.writeFile(filePath, csv, 'utf-8');
  }

  /**
   * Convert OHLCV data to CSV string
   */
  static toCSV(data: OHLCVData[], separator: string = ','): string {
    const header = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'].join(separator);
    const rows = data.map((d) =>
      [d.date, d.open, d.high, d.low, d.close, d.volume].join(separator)
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Detect separator character
   */
  private static detectSeparator(line: string): ',' | ';' | '\t' {
    const separators = [',', ';', '\t'] as const;
    const counts = separators.map((sep) => ({
      sep,
      count: line.split(sep).length,
    }));

    // Return separator with most occurrences
    counts.sort((a, b) => b.count - a.count);
    return counts[0]?.sep ?? ',';
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private static parseLine(line: string, separator: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Detect column indices from header
   */
  private static detectColumns(header: string[]): {
    date?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  } {
    const columns: any = {};

    const normalizedHeader = header.map((h) => h.toLowerCase().trim());

    for (let i = 0; i < normalizedHeader.length; i++) {
      const col = normalizedHeader[i];
      if (!col) continue;

      if (col.includes('date') || col.includes('time') || col === 'd') {
        columns.date = i;
      } else if (col.includes('open') || col === 'o') {
        columns.open = i;
      } else if (col.includes('high') || col === 'h') {
        columns.high = i;
      } else if (col.includes('low') || col === 'l') {
        columns.low = i;
      } else if (col.includes('close') || col === 'c') {
        columns.close = i;
      } else if (col.includes('volume') || col.includes('vol') || col === 'v') {
        columns.volume = i;
      }
    }

    // Validate required columns
    if (
      columns.date === undefined ||
      columns.open === undefined ||
      columns.high === undefined ||
      columns.low === undefined ||
      columns.close === undefined ||
      columns.volume === undefined
    ) {
      throw new Error(
        'Unable to detect required columns (Date, Open, High, Low, Close, Volume) from header'
      );
    }

    return columns;
  }

  /**
   * Parse a data row into OHLCV
   */
  private static parseRow(
    row: string[],
    options: Required<CSVParseOptions>,
    rowIndex: number
  ): OHLCVData | null {
    const { columns } = options;

    if (!columns.date || !columns.open || !columns.high || !columns.low || !columns.close || !columns.volume) {
      throw new Error('Column indices not properly defined');
    }

    // Parse date
    const dateStr = row[columns.date];
    if (!dateStr) {
      throw new Error('Missing date value');
    }

    const date = this.parseDate(dateStr, options.dateFormat);

    // Parse numeric values
    const open = this.parseNumber(row[columns.open] ?? '', 'open');
    const high = this.parseNumber(row[columns.high] ?? '', 'high');
    const low = this.parseNumber(row[columns.low] ?? '', 'low');
    const close = this.parseNumber(row[columns.close] ?? '', 'close');
    const volume = this.parseNumber(row[columns.volume] ?? '', 'volume');

    return {
      date: date.toISOString().split('T')[0] ?? '',
      open,
      high,
      low,
      close,
      volume,
    };
  }

  /**
   * Parse date with auto-detection
   */
  private static parseDate(dateStr: string, format: string): Date {
    // Try ISO format first
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try common formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
      /^(\d{4})(\d{2})(\d{2})$/, // YYYYMMDD
    ];

    for (const regex of formats) {
      const match = dateStr.match(regex);
      if (match) {
        const [, p1, p2, p3] = match;

        if (!p1 || !p2 || !p3) continue;

        // Determine which format
        if (p1.length === 4) {
          // Year is first
          date = new Date(`${p1}-${p2}-${p3}`);
        } else if (p3.length === 4) {
          // Year is last
          // Try both MM/DD and DD/MM
          date = new Date(`${p3}-${p1}-${p2}`);
          if (isNaN(date.getTime())) {
            date = new Date(`${p3}-${p2}-${p1}`);
          }
        }

        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    throw new Error(`Unable to parse date: ${dateStr}`);
  }

  /**
   * Parse numeric value
   */
  private static parseNumber(value: string, field: string): number {
    if (!value) {
      throw new Error(`Missing ${field} value`);
    }

    // Remove common formatting
    const cleaned = value.replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);

    if (isNaN(num)) {
      throw new Error(`Invalid ${field} value: ${value}`);
    }

    return num;
  }
}
