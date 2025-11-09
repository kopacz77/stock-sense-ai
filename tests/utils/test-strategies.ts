/**
 * Test Strategies for Unit Tests
 * Simple strategies with predictable behavior for testing
 */

import type {
  BacktestStrategy,
  HistoricalDataPoint,
  Signal
} from "../../src/backtesting/types/backtest-types.js";

/**
 * Always Buy Strategy - Buys on first bar, holds forever
 */
export class AlwaysBuyStrategy implements BacktestStrategy {
  private hasPosition = false;

  getName(): string {
    return "ALWAYS_BUY";
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    if (!this.hasPosition) {
      this.hasPosition = true;
      return {
        symbol,
        action: "BUY",
        strength: 100,
        strategy: this.getName(),
        indicators: {} as any,
        confidence: 100,
        reasons: ["Initial buy"],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.getName(),
      indicators: {} as any,
      confidence: 100,
      reasons: ["Holding position"],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close
    };
  }

  reset(): void {
    this.hasPosition = false;
  }
}

/**
 * Buy and Sell Strategy - Buys on day 1, sells on day 3
 */
export class BuyAndSellStrategy implements BacktestStrategy {
  private dayCount = 0;
  private hasPosition = false;

  getName(): string {
    return "BUY_AND_SELL";
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    this.dayCount++;

    if (this.dayCount === 1) {
      this.hasPosition = true;
      return {
        symbol,
        action: "BUY",
        strength: 100,
        strategy: this.getName(),
        indicators: {} as any,
        confidence: 100,
        reasons: ["Day 1 buy"],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    if (this.dayCount === 3 && this.hasPosition) {
      this.hasPosition = false;
      return {
        symbol,
        action: "SELL",
        strength: 100,
        strategy: this.getName(),
        indicators: {} as any,
        confidence: 100,
        reasons: ["Day 3 sell"],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.getName(),
      indicators: {} as any,
      confidence: 100,
      reasons: ["Waiting"],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close
    };
  }

  reset(): void {
    this.dayCount = 0;
    this.hasPosition = false;
  }
}

/**
 * Price Threshold Strategy - Buys below threshold, sells above
 */
export class PriceThresholdStrategy implements BacktestStrategy {
  constructor(
    private buyThreshold: number,
    private sellThreshold: number
  ) {}

  getName(): string {
    return "PRICE_THRESHOLD";
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    if (currentData.close < this.buyThreshold) {
      return {
        symbol,
        action: "BUY",
        strength: 100,
        strategy: this.getName(),
        indicators: { price: currentData.close, threshold: this.buyThreshold } as any,
        confidence: 100,
        reasons: [`Price ${currentData.close} below buy threshold ${this.buyThreshold}`],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    if (currentData.close > this.sellThreshold) {
      return {
        symbol,
        action: "SELL",
        strength: 100,
        strategy: this.getName(),
        indicators: { price: currentData.close, threshold: this.sellThreshold } as any,
        confidence: 100,
        reasons: [`Price ${currentData.close} above sell threshold ${this.sellThreshold}`],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.getName(),
      indicators: { price: currentData.close } as any,
      confidence: 100,
      reasons: ["Price within thresholds"],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close
    };
  }

  reset(): void {
    // No state to reset
  }
}

/**
 * Never Trade Strategy - Always returns HOLD
 */
export class NeverTradeStrategy implements BacktestStrategy {
  getName(): string {
    return "NEVER_TRADE";
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.getName(),
      indicators: {} as any,
      confidence: 100,
      reasons: ["Never trades"],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close
    };
  }

  reset(): void {
    // No state to reset
  }
}

/**
 * Pattern Strategy - Trades based on day of week
 */
export class DayOfWeekStrategy implements BacktestStrategy {
  constructor(private buyDay: number, private sellDay: number) {}

  getName(): string {
    return "DAY_OF_WEEK";
  }

  async generateSignal(
    symbol: string,
    currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    const dayOfWeek = currentData.timestamp.getDay();

    if (dayOfWeek === this.buyDay) {
      return {
        symbol,
        action: "BUY",
        strength: 100,
        strategy: this.getName(),
        indicators: { dayOfWeek } as any,
        confidence: 100,
        reasons: [`Buy day: ${dayOfWeek}`],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    if (dayOfWeek === this.sellDay) {
      return {
        symbol,
        action: "SELL",
        strength: 100,
        strategy: this.getName(),
        indicators: { dayOfWeek } as any,
        confidence: 100,
        reasons: [`Sell day: ${dayOfWeek}`],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close
      };
    }

    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: this.getName(),
      indicators: { dayOfWeek } as any,
      confidence: 100,
      reasons: [`Waiting for trigger day`],
      timestamp: currentData.timestamp,
      entryPrice: currentData.close
    };
  }

  reset(): void {
    // No state to reset
  }
}
