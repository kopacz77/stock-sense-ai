/**
 * Data Loader Tests
 * Tests for historical data loading and validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryDataLoader,
  CSVDataLoader,
} from "../../../src/backtesting/data/data-loader.js";
import type { HistoricalDataPoint } from "../../../src/backtesting/types/backtest-types.js";

describe("MemoryDataLoader", () => {
  let loader: MemoryDataLoader;
  let testData: HistoricalDataPoint[];

  beforeEach(() => {
    testData = [
      {
        symbol: "AAPL",
        timestamp: new Date("2024-01-01"),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000000,
      },
      {
        symbol: "AAPL",
        timestamp: new Date("2024-01-02"),
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1100000,
      },
      {
        symbol: "AAPL",
        timestamp: new Date("2024-01-03"),
        open: 105,
        high: 110,
        low: 103,
        close: 108,
        volume: 1200000,
      },
    ];

    loader = new MemoryDataLoader();
    loader.addData("AAPL", testData);
  });

  it("should load data for a symbol", async () => {
    const data = await loader.load(
      "AAPL",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );

    expect(data).toHaveLength(3);
    expect(data[0].symbol).toBe("AAPL");
  });

  it("should filter data by date range", async () => {
    const data = await loader.load(
      "AAPL",
      new Date("2024-01-02"),
      new Date("2024-01-02"),
    );

    expect(data).toHaveLength(1);
    expect(data[0].close).toBe(105);
  });

  it("should return empty array for non-existent symbol", async () => {
    const data = await loader.load(
      "NOTEXIST",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );

    expect(data).toHaveLength(0);
  });

  it("should check if data exists", async () => {
    const exists = await loader.hasData(
      "AAPL",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );

    expect(exists).toBe(true);
  });

  it("should return false for non-existent data", async () => {
    const exists = await loader.hasData(
      "NOTEXIST",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );

    expect(exists).toBe(false);
  });

  it("should validate data correctly", () => {
    const result = loader.validate(testData);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.quality.totalPoints).toBe(3);
    expect(result.quality.symbols).toContain("AAPL");
  });

  it("should detect invalid data", () => {
    const invalidData: HistoricalDataPoint[] = [
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-01"),
        open: -100, // Invalid: negative price
        high: 105,
        low: 95,
        close: 102,
        volume: 1000000,
      },
    ];

    const result = loader.validate(invalidData);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should detect OHLC inconsistencies", () => {
    const invalidData: HistoricalDataPoint[] = [
      {
        symbol: "TEST",
        timestamp: new Date("2024-01-01"),
        open: 100,
        high: 90, // Invalid: high < low
        low: 95,
        close: 92,
        volume: 1000000,
      },
    ];

    const result = loader.validate(invalidData);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should clear all data", () => {
    loader.clear();

    expect(loader.hasData("AAPL", new Date("2024-01-01"), new Date("2024-01-03"))).resolves.toBe(
      false,
    );
  });
});

describe("CSVDataLoader", () => {
  it("should throw error when CSV loading not implemented", async () => {
    const loader = new CSVDataLoader({ type: "CSV", basePath: "/tmp" });

    await expect(
      loader.load("AAPL", new Date("2024-01-01"), new Date("2024-01-03")),
    ).rejects.toThrow();
  });

  it("should require basePath in config", () => {
    expect(() => new CSVDataLoader({ type: "CSV" })).toThrow();
  });

  // These exercise the real (working) validation logic shared with MemoryDataLoader.
  // See the BUG note above: MemoryDataLoader.validate cannot reach this code because
  // it constructs a CSVDataLoader with an empty basePath.
  describe("validate", () => {
    let loader: CSVDataLoader;

    beforeEach(() => {
      loader = new CSVDataLoader({ type: "CSV", basePath: "/tmp" });
    });

    it("should validate correct OHLCV data", () => {
      const validData: HistoricalDataPoint[] = [
        {
          symbol: "AAPL",
          timestamp: new Date("2024-01-01"),
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000000,
        },
        {
          symbol: "AAPL",
          timestamp: new Date("2024-01-02"),
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100000,
        },
      ];

      const result = loader.validate(validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.quality.totalPoints).toBe(2);
      expect(result.quality.symbols).toContain("AAPL");
    });

    it("should reject empty data", () => {
      const result = loader.validate([]);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.quality.totalPoints).toBe(0);
    });

    it("should detect negative prices", () => {
      const invalidData: HistoricalDataPoint[] = [
        {
          symbol: "TEST",
          timestamp: new Date("2024-01-01"),
          open: -100, // Invalid: negative price
          high: 105,
          low: 95,
          close: 102,
          volume: 1000000,
        },
      ];

      const result = loader.validate(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => /positive/.test(e))).toBe(true);
    });

    it("should detect OHLC inconsistency when high < low", () => {
      const invalidData: HistoricalDataPoint[] = [
        {
          symbol: "TEST",
          timestamp: new Date("2024-01-01"),
          open: 100,
          high: 90, // Invalid: high < low
          low: 95,
          close: 92,
          volume: 1000000,
        },
      ];

      const result = loader.validate(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => /high cannot be less than low/.test(e))).toBe(true);
    });

    it("should detect negative volume", () => {
      const invalidData: HistoricalDataPoint[] = [
        {
          symbol: "TEST",
          timestamp: new Date("2024-01-01"),
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: -500, // Invalid: negative volume
        },
      ];

      const result = loader.validate(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => /volume cannot be negative/.test(e))).toBe(true);
    });

    it("should warn (not error) on high below open/close", () => {
      // high >= low so no error, but high < close triggers a warning only
      const data: HistoricalDataPoint[] = [
        {
          symbol: "TEST",
          timestamp: new Date("2024-01-01"),
          open: 100,
          high: 101,
          low: 99,
          close: 105, // close above high -> warning, not error
          volume: 1000,
        },
      ];

      const result = loader.validate(data);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
