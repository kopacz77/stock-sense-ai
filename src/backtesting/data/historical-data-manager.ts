/**
 * Historical Data Manager
 * Loads and manages historical price data for backtesting
 * Supports CSV files and API sources (Alpha Vantage)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Bar, BarAdjusted } from "../types/backtest-types.js";
import { MarketDataService } from "../../data/market-data-service.js";
import type { HistoricalData } from "../../types/trading.js";

export interface DataSource {
  type: "CSV" | "API";
  path?: string; // For CSV
  apiKey?: string; // For API
}

export class HistoricalDataManager {
  private marketDataService: MarketDataService;
  private cache: Map<string, Bar[]> = new Map();

  constructor() {
    this.marketDataService = new MarketDataService();
  }

  /**
   * Load data from CSV file
   * Expected CSV format: date,open,high,low,close,volume
   */
  async loadFromCSV(filePath: string, symbol: string): Promise<Bar[]> {
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const lines = fileContent.trim().split("\n");

      if (lines.length === 0) {
        throw new Error("CSV file is empty");
      }

      // Parse header
      const header = lines[0]?.toLowerCase().split(",") ?? [];
      const dateIdx = header.indexOf("date");
      const openIdx = header.indexOf("open");
      const highIdx = header.indexOf("high");
      const lowIdx = header.indexOf("low");
      const closeIdx = header.indexOf("close");
      const volumeIdx = header.indexOf("volume");

      if (dateIdx === -1 || openIdx === -1 || highIdx === -1 ||
          lowIdx === -1 || closeIdx === -1 || volumeIdx === -1) {
        throw new Error(
          "CSV must contain columns: date,open,high,low,close,volume"
        );
      }

      // Parse data rows
      const bars: Bar[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === "") continue;

        const cols = line.split(",");

        const bar: Bar = {
          timestamp: new Date(cols[dateIdx] ?? ""),
          open: parseFloat(cols[openIdx] ?? "0"),
          high: parseFloat(cols[highIdx] ?? "0"),
          low: parseFloat(cols[lowIdx] ?? "0"),
          close: parseFloat(cols[closeIdx] ?? "0"),
          volume: parseFloat(cols[volumeIdx] ?? "0"),
          symbol,
        };

        // Validate bar data
        if (this.isValidBar(bar)) {
          bars.push(bar);
        } else {
          console.warn(`Invalid bar data on line ${i + 1}, skipping`);
        }
      }

      // Sort by date ascending
      bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Cache the data
      this.cache.set(symbol, bars);

      return bars;
    } catch (error) {
      throw new Error(
        `Failed to load CSV file ${filePath}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Load data from Alpha Vantage API
   */
  async loadFromAPI(
    symbol: string,
    apiKey?: string
  ): Promise<Bar[]> {
    try {
      if (apiKey) {
        this.marketDataService.setApiKey(apiKey);
      }

      const historicalData = await this.marketDataService.getHistoricalData(symbol);

      const bars: Bar[] = historicalData.map((data) => ({
        timestamp: new Date(data.date),
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        symbol,
      }));

      // Sort by date ascending
      bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Cache the data
      this.cache.set(symbol, bars);

      return bars;
    } catch (error) {
      throw new Error(
        `Failed to load data from API for ${symbol}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Load data from source (auto-detects type)
   */
  async loadData(symbol: string, source: DataSource): Promise<Bar[]> {
    // Check cache first
    const cached = this.cache.get(symbol);
    if (cached) {
      return cached;
    }

    if (source.type === "CSV") {
      if (!source.path) {
        throw new Error("CSV source requires path");
      }
      return this.loadFromCSV(source.path, symbol);
    } else if (source.type === "API") {
      return this.loadFromAPI(symbol, source.apiKey);
    } else {
      throw new Error(`Unsupported data source type: ${source.type}`);
    }
  }

  /**
   * Filter bars by date range
   */
  filterByDateRange(bars: Bar[], startDate: Date, endDate: Date): Bar[] {
    return bars.filter(
      (bar) => bar.timestamp >= startDate && bar.timestamp <= endDate
    );
  }

  /**
   * Validate bar data
   */
  private isValidBar(bar: Bar): boolean {
    return (
      !isNaN(bar.timestamp.getTime()) &&
      !isNaN(bar.open) &&
      !isNaN(bar.high) &&
      !isNaN(bar.low) &&
      !isNaN(bar.close) &&
      !isNaN(bar.volume) &&
      bar.open > 0 &&
      bar.high > 0 &&
      bar.low > 0 &&
      bar.close > 0 &&
      bar.volume >= 0 &&
      bar.high >= bar.low &&
      bar.high >= bar.open &&
      bar.high >= bar.close &&
      bar.low <= bar.open &&
      bar.low <= bar.close
    );
  }

  /**
   * Clean data - remove invalid bars, fill missing data
   */
  cleanData(bars: Bar[]): Bar[] {
    const cleaned: Bar[] = [];

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!bar) continue;

      if (this.isValidBar(bar)) {
        cleaned.push(bar);
      } else {
        // Try to fix common issues
        const fixed = this.fixBar(bar, bars[i - 1]);
        if (fixed && this.isValidBar(fixed)) {
          cleaned.push(fixed);
          console.warn(`Fixed invalid bar for ${bar.symbol} on ${bar.timestamp.toISOString()}`);
        } else {
          console.warn(`Removed invalid bar for ${bar.symbol} on ${bar.timestamp.toISOString()}`);
        }
      }
    }

    return cleaned;
  }

  /**
   * Attempt to fix invalid bar using previous bar's data
   */
  private fixBar(bar: Bar, previousBar?: Bar): Bar | null {
    if (!previousBar) return null;

    const fixed = { ...bar };

    // Fix OHLC relationships
    if (fixed.high < fixed.low) {
      [fixed.high, fixed.low] = [fixed.low, fixed.high];
    }

    if (fixed.high < fixed.open) fixed.high = fixed.open;
    if (fixed.high < fixed.close) fixed.high = fixed.close;
    if (fixed.low > fixed.open) fixed.low = fixed.open;
    if (fixed.low > fixed.close) fixed.low = fixed.close;

    // Fill missing values with previous bar
    if (fixed.open <= 0) fixed.open = previousBar.close;
    if (fixed.high <= 0) fixed.high = previousBar.high;
    if (fixed.low <= 0) fixed.low = previousBar.low;
    if (fixed.close <= 0) fixed.close = previousBar.close;

    return fixed;
  }

  /**
   * Adjust for stock splits
   */
  adjustForSplits(bars: Bar[], splits: Array<{ date: Date; ratio: number }>): BarAdjusted[] {
    const adjusted: BarAdjusted[] = bars.map((bar) => ({
      ...bar,
      adjustedClose: bar.close,
      splitCoefficient: 1,
    }));

    // Apply splits in chronological order
    for (const split of splits) {
      for (let i = 0; i < adjusted.length; i++) {
        const bar = adjusted[i];
        if (bar && bar.timestamp < split.date) {
          // Adjust prices before split
          bar.open /= split.ratio;
          bar.high /= split.ratio;
          bar.low /= split.ratio;
          bar.close /= split.ratio;
          if (bar.adjustedClose !== undefined) {
            bar.adjustedClose /= split.ratio;
          }
          bar.volume *= split.ratio;
          bar.splitCoefficient = (bar.splitCoefficient ?? 1) * split.ratio;
        }
      }
    }

    return adjusted;
  }

  /**
   * Adjust for dividends
   */
  adjustForDividends(bars: Bar[], dividends: Array<{ date: Date; amount: number }>): BarAdjusted[] {
    const adjusted: BarAdjusted[] = bars.map((bar) => ({
      ...bar,
      adjustedClose: bar.close,
    }));

    // Apply dividends in reverse chronological order
    for (const dividend of dividends.sort((a, b) => b.date.getTime() - a.date.getTime())) {
      let cumulativeAdjustment = 1;

      for (let i = adjusted.length - 1; i >= 0; i--) {
        const bar = adjusted[i];
        if (bar && bar.timestamp < dividend.date) {
          const adjustmentFactor = 1 - dividend.amount / bar.close;
          cumulativeAdjustment *= adjustmentFactor;

          if (bar.adjustedClose !== undefined) {
            bar.adjustedClose *= cumulativeAdjustment;
          }
          bar.dividendAmount = (bar.dividendAmount ?? 0) + dividend.amount;
        }
      }
    }

    return adjusted;
  }

  /**
   * Calculate average volume over a period
   */
  calculateAverageVolume(bars: Bar[], lookbackDays: number = 20): number {
    if (bars.length === 0) return 0;

    const recentBars = bars.slice(-lookbackDays);
    const totalVolume = recentBars.reduce((sum, bar) => sum + bar.volume, 0);

    return totalVolume / recentBars.length;
  }

  /**
   * Get cached data
   */
  getCached(symbol: string): Bar[] | undefined {
    return this.cache.get(symbol);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Save data to CSV file
   */
  async saveToCSV(bars: Bar[], filePath: string): Promise<void> {
    const header = "date,open,high,low,close,volume";
    const rows = bars.map((bar) => {
      const date = bar.timestamp.toISOString().split("T")[0];
      return `${date},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}`;
    });

    const csv = [header, ...rows].join("\n");

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, csv, "utf-8");
  }
}
