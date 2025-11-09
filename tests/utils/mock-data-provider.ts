/**
 * Mock Data Provider for Testing
 * Provides in-memory market data for unit and integration tests
 */

import type { HistoricalDataPoint, DataProvider } from "../../src/backtesting/types/backtest-types.js";

export class MockDataProvider implements DataProvider {
  private data: Map<string, HistoricalDataPoint[]> = new Map();
  private avgVolume: Map<string, number> = new Map();

  /**
   * Add test data for a symbol
   */
  addData(symbol: string, dataPoints: HistoricalDataPoint[]): void {
    this.data.set(symbol, dataPoints);

    // Calculate average volume
    if (dataPoints.length > 0) {
      const avgVol = dataPoints.reduce((sum, d) => sum + d.volume, 0) / dataPoints.length;
      this.avgVolume.set(symbol, avgVol);
    }
  }

  /**
   * Get historical data for a symbol
   */
  async getHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<HistoricalDataPoint[]> {
    const symbolData = this.data.get(symbol) || [];

    return symbolData.filter(d =>
      d.timestamp >= startDate && d.timestamp <= endDate
    );
  }

  /**
   * Get average volume for a symbol
   */
  async getAverageVolume(symbol: string, days: number): Promise<number> {
    return this.avgVolume.get(symbol) || 1000000;
  }

  /**
   * Check if data is available
   */
  async hasData(symbol: string, startDate: Date, endDate: Date): Promise<boolean> {
    const data = await this.getHistoricalData(symbol, startDate, endDate);
    return data.length > 0;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
    this.avgVolume.clear();
  }
}
