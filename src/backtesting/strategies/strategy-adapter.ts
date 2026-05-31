/**
 * Reusable adapter that wraps MomentumStrategy/MeanReversionStrategy
 * (which expose .analyze()) into the BacktestStrategy interface
 * (generateSignal, onBar, initialize, cleanup).
 *
 * NOTE: This intentionally bypasses src/strategies/strategy-registry.ts —
 * the registry's momentum defaultParams have broken keys (emaPeriod,
 * rsiPeriod, ... instead of shortMA, longMA, ...). Fixing the registry
 * is out of scope for M2-01.
 */

import { MeanReversionStrategy } from '../../strategies/mean-reversion-strategy.js';
import { MomentumStrategy } from '../../strategies/momentum-strategy.js';
import type { BacktestStrategy, HistoricalDataPoint } from '../types/backtest-types.js';
import type { HistoricalData, Signal } from '../../types/trading.js';

/**
 * Strategy adapter to convert trading strategies to backtest strategies
 */
export class StrategyAdapter implements BacktestStrategy {
  constructor(
    private strategy: MeanReversionStrategy | MomentumStrategy,
    private strategyName: string
  ) {}

  getName(): string {
    return this.strategyName;
  }

  async generateSignal(
    symbol: string,
    _currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    // Convert HistoricalDataPoint[] to HistoricalData[] for strategy
    const convertedData: HistoricalData[] = historicalData.map(point => ({
      date: point.timestamp.toISOString().split('T')[0] ?? '',
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }));

    const signal = await this.strategy.analyze(symbol, convertedData);
    return signal;
  }

  async onBar(
    symbol: string,
    _bar: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal | null> {
    // Convert to HistoricalData format expected by strategies
    const convertedData: HistoricalData[] = historicalData.map(point => ({
      date: point.timestamp.toISOString().split('T')[0] ?? '',
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }));

    const signal = await this.strategy.analyze(symbol, convertedData);
    return signal.action === 'HOLD' ? null : signal;
  }

  async initialize(): Promise<void> {
    // No initialization needed for these strategies
  }

  async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Create a strategy factory function for optimization
 * Returns a function that creates BacktestStrategy instances from parameter sets
 */
export function createStrategyFactory(
  strategyName: string
): (params: Record<string, unknown>) => BacktestStrategy {
  return (params: Record<string, unknown>): BacktestStrategy => {
    let strategy;
    if (strategyName === 'mean-reversion') {
      strategy = new MeanReversionStrategy({
        rsiOversold: (params.rsiOversold as number) ?? 30,
        rsiOverbought: (params.rsiOverbought as number) ?? 70,
        mfiOversold: (params.mfiOversold as number) ?? 20,
        mfiOverbought: (params.mfiOverbought as number) ?? 80,
        bbStdDev: (params.bbStdDev as number) ?? 2,
        minConfidence: (params.minConfidence as number) ?? 60,
        volumeThreshold: (params.volumeThreshold as number) ?? 1.2,
        maxHoldingPeriod: (params.maxHoldingPeriod as number) ?? 30,
      });
    } else {
      strategy = new MomentumStrategy({
        shortMA: (params.shortMA as number) ?? 20,
        longMA: (params.longMA as number) ?? 50,
        macdFast: (params.macdFast as number) ?? 12,
        macdSlow: (params.macdSlow as number) ?? 26,
        macdSignal: (params.macdSignal as number) ?? 9,
        trendStrength: (params.trendStrength as number) ?? 0.02,
        minConfidence: (params.minConfidence as number) ?? 65,
        volumeThreshold: (params.volumeThreshold as number) ?? 1.5,
      });
    }
    return new StrategyAdapter(strategy, strategyName);
  };
}
