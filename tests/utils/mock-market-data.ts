/**
 * Mock Market Data Generators
 * Generate test market data with various patterns
 */

import type { HistoricalDataPoint } from "../../src/backtesting/types/backtest-types.js";

export interface MockDataOptions {
  symbol: string;
  startDate: Date;
  days: number;
  basePrice: number;
  volatility?: number; // Daily volatility as percentage
  trend?: 'up' | 'down' | 'sideways';
  volume?: number;
}

/**
 * Generate trending market data
 */
export function generateTrendingData(options: MockDataOptions): HistoricalDataPoint[] {
  const {
    symbol,
    startDate,
    days,
    basePrice,
    volatility = 1.5, // 1.5% daily volatility
    trend = 'up',
    volume = 1000000
  } = options;

  const data: HistoricalDataPoint[] = [];
  let currentPrice = basePrice;
  const dailyTrend = trend === 'up' ? 0.003 : trend === 'down' ? -0.003 : 0; // 0.3% daily

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Add trend and random volatility
    const randomChange = (Math.random() - 0.5) * 2 * (volatility / 100);
    currentPrice = currentPrice * (1 + dailyTrend + randomChange);

    // Generate OHLC
    const dayVolatility = currentPrice * (volatility / 100);
    const open = currentPrice * (1 + (Math.random() - 0.5) * 0.005);
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * dayVolatility;
    const low = Math.min(open, close) - Math.random() * dayVolatility;

    data.push({
      symbol,
      timestamp: date,
      open,
      high,
      low,
      close,
      volume: Math.floor(volume * (0.8 + Math.random() * 0.4))
    });
  }

  return data;
}

/**
 * Generate mean-reverting market data
 */
export function generateMeanRevertingData(options: MockDataOptions): HistoricalDataPoint[] {
  const {
    symbol,
    startDate,
    days,
    basePrice,
    volatility = 2.0,
    volume = 1000000
  } = options;

  const data: HistoricalDataPoint[] = [];
  let currentPrice = basePrice;
  const meanPrice = basePrice;
  const reversionSpeed = 0.1; // How fast it reverts to mean

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Mean reversion: pull toward mean price
    const meanReversionForce = (meanPrice - currentPrice) / currentPrice * reversionSpeed;
    const randomChange = (Math.random() - 0.5) * 2 * (volatility / 100);
    currentPrice = currentPrice * (1 + meanReversionForce + randomChange);

    // Generate OHLC
    const dayVolatility = currentPrice * (volatility / 100);
    const open = currentPrice * (1 + (Math.random() - 0.5) * 0.005);
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * dayVolatility;
    const low = Math.min(open, close) - Math.random() * dayVolatility;

    data.push({
      symbol,
      timestamp: date,
      open,
      high,
      low,
      close,
      volume: Math.floor(volume * (0.8 + Math.random() * 0.4))
    });
  }

  return data;
}

/**
 * Generate data with specific pattern (e.g., for testing strategy signals)
 */
export function generatePatternData(
  symbol: string,
  startDate: Date,
  prices: number[],
  volume = 1000000
): HistoricalDataPoint[] {
  return prices.map((price, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const volatility = price * 0.01;
    const open = price * (1 + (Math.random() - 0.5) * 0.003);
    const close = price;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;

    return {
      symbol,
      timestamp: date,
      open,
      high,
      low,
      close,
      volume: Math.floor(volume * (0.9 + Math.random() * 0.2))
    };
  });
}

/**
 * Generate simple linear data (for testing)
 */
export function generateSimpleData(
  symbol: string,
  startDate: Date,
  days: number,
  startPrice: number,
  endPrice: number
): HistoricalDataPoint[] {
  const data: HistoricalDataPoint[] = [];
  const priceChange = (endPrice - startPrice) / days;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const price = startPrice + priceChange * i;

    data.push({
      symbol,
      timestamp: date,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1000000
    });
  }

  return data;
}

/**
 * Generate data with volatility spike
 */
export function generateVolatilitySpike(
  symbol: string,
  startDate: Date,
  days: number,
  basePrice: number,
  spikeDay: number,
  spikeMultiplier: number = 3
): HistoricalDataPoint[] {
  const data: HistoricalDataPoint[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const volatility = i === spikeDay ? 5.0 * spikeMultiplier : 1.0;
    const randomChange = (Math.random() - 0.5) * 2 * (volatility / 100);
    currentPrice = currentPrice * (1 + randomChange);

    const dayVolatility = currentPrice * (volatility / 100);
    const open = currentPrice * (1 + (Math.random() - 0.5) * 0.005);
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * dayVolatility;
    const low = Math.min(open, close) - Math.random() * dayVolatility;

    data.push({
      symbol,
      timestamp: date,
      open,
      high,
      low,
      close,
      volume: i === spikeDay ? 5000000 : 1000000
    });
  }

  return data;
}
