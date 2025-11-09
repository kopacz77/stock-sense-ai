/**
 * Test Portfolio Data
 * Sample portfolios for testing risk management and portfolio operations
 */

import type { Position } from "../../src/backtesting/types/backtest-types.js";

/**
 * Create a simple 3-stock portfolio
 */
export function createSimplePortfolio(): Map<string, Position> {
  const positions = new Map<string, Position>();

  positions.set("AAPL", {
    symbol: "AAPL",
    quantity: 100,
    avgEntryPrice: 150.00,
    currentPrice: 160.00,
    marketValue: 16000,
    unrealizedPnL: 1000,
    unrealizedPnLPercent: 6.67,
    realizedPnL: 0,
    totalPnL: 1000,
    entryDate: new Date("2024-01-01"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST_STRATEGY"
  });

  positions.set("GOOGL", {
    symbol: "GOOGL",
    quantity: 50,
    avgEntryPrice: 140.00,
    currentPrice: 135.00,
    marketValue: 6750,
    unrealizedPnL: -250,
    unrealizedPnLPercent: -3.57,
    realizedPnL: 0,
    totalPnL: -250,
    entryDate: new Date("2024-01-02"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST_STRATEGY"
  });

  positions.set("MSFT", {
    symbol: "MSFT",
    quantity: 75,
    avgEntryPrice: 380.00,
    currentPrice: 390.00,
    marketValue: 29250,
    unrealizedPnL: 750,
    unrealizedPnLPercent: 2.63,
    realizedPnL: 0,
    totalPnL: 750,
    entryDate: new Date("2024-01-03"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST_STRATEGY"
  });

  return positions;
}

/**
 * Create a large diversified portfolio (10 stocks)
 */
export function createDiversifiedPortfolio(): Map<string, Position> {
  const positions = new Map<string, Position>();

  const stocks = [
    { symbol: "AAPL", qty: 100, entry: 150, current: 160 },
    { symbol: "GOOGL", qty: 50, entry: 140, current: 145 },
    { symbol: "MSFT", qty: 75, entry: 380, current: 390 },
    { symbol: "AMZN", qty: 30, entry: 170, current: 165 },
    { symbol: "TSLA", qty: 40, entry: 250, current: 260 },
    { symbol: "META", qty: 60, entry: 350, current: 360 },
    { symbol: "NVDA", qty: 25, entry: 480, current: 500 },
    { symbol: "JPM", qty: 80, entry: 155, current: 160 },
    { symbol: "V", qty: 55, entry: 240, current: 245 },
    { symbol: "WMT", qty: 90, entry: 160, current: 165 }
  ];

  stocks.forEach(stock => {
    const marketValue = stock.qty * stock.current;
    const costBasis = stock.qty * stock.entry;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPercent = (unrealizedPnL / costBasis) * 100;

    positions.set(stock.symbol, {
      symbol: stock.symbol,
      quantity: stock.qty,
      avgEntryPrice: stock.entry,
      currentPrice: stock.current,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent,
      realizedPnL: 0,
      totalPnL: unrealizedPnL,
      entryDate: new Date("2024-01-01"),
      lastUpdateDate: new Date("2024-01-10"),
      strategyName: "DIVERSIFIED"
    });
  });

  return positions;
}

/**
 * Create historical returns for testing (20 days)
 */
export function createHistoricalReturns(symbols: string[]): Map<string, number[]> {
  const returns = new Map<string, number[]>();

  symbols.forEach(symbol => {
    const symbolReturns = [];
    for (let i = 0; i < 20; i++) {
      // Generate random returns between -3% and +3%
      symbolReturns.push((Math.random() - 0.5) * 6);
    }
    returns.set(symbol, symbolReturns);
  });

  return returns;
}

/**
 * Create correlated returns for testing
 */
export function createCorrelatedReturns(
  primaryReturns: number[],
  correlation: number
): number[] {
  const correlatedReturns: number[] = [];

  for (let i = 0; i < primaryReturns.length; i++) {
    const primaryReturn = primaryReturns[i] || 0;
    const randomReturn = (Math.random() - 0.5) * 6;

    // Mix primary and random based on correlation
    const correlatedReturn = primaryReturn * correlation + randomReturn * (1 - correlation);
    correlatedReturns.push(correlatedReturn);
  }

  return correlatedReturns;
}

/**
 * Create portfolio with specific total value
 */
export function createPortfolioWithValue(totalValue: number): Map<string, Position> {
  const positions = new Map<string, Position>();
  const valuePerStock = totalValue / 3;

  positions.set("AAPL", {
    symbol: "AAPL",
    quantity: Math.floor(valuePerStock / 150),
    avgEntryPrice: 150.00,
    currentPrice: 150.00,
    marketValue: valuePerStock,
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    realizedPnL: 0,
    totalPnL: 0,
    entryDate: new Date("2024-01-01"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST"
  });

  positions.set("GOOGL", {
    symbol: "GOOGL",
    quantity: Math.floor(valuePerStock / 140),
    avgEntryPrice: 140.00,
    currentPrice: 140.00,
    marketValue: valuePerStock,
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    realizedPnL: 0,
    totalPnL: 0,
    entryDate: new Date("2024-01-01"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST"
  });

  positions.set("MSFT", {
    symbol: "MSFT",
    quantity: Math.floor(valuePerStock / 380),
    avgEntryPrice: 380.00,
    currentPrice: 380.00,
    marketValue: valuePerStock,
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    realizedPnL: 0,
    totalPnL: 0,
    entryDate: new Date("2024-01-01"),
    lastUpdateDate: new Date("2024-01-10"),
    strategyName: "TEST"
  });

  return positions;
}
