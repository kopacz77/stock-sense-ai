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
 * Maximum number of bars to feed to a strategy on each call.
 *
 * MomentumStrategy needs at most longMA + ~50-period MACD lookback;
 * MeanReversionStrategy needs at most ~50-period RSI/MFI/BB lookback.
 * 300 bars (~1.2 years) is comfortably more than any indicator window
 * either strategy uses, while keeping per-call work O(300) rather than
 * O(N) for the full backtest history (8 years × 252 bars ≈ 2010 bars
 * per ticker — passing the full history made every backtest do
 * quadratic work over the equity curve).
 *
 * Trimming here is sound because the underlying technical-indicators
 * library reads only the most-recent N values for any rolling window.
 * Anything older than 300 bars provides no signal information.
 */
const STRATEGY_HISTORY_WINDOW = 300;

/**
 * Convert backtest-engine bars (oldest-first chronological) to the
 * HistoricalData[] format the strategies expect — which is NEWEST-FIRST,
 * trimmed to at most STRATEGY_HISTORY_WINDOW most-recent bars.
 *
 * MomentumStrategy / MeanReversionStrategy both:
 *   - read `historicalData[0].close` as the CURRENT price.
 *   - internally `[...data].reverse()` before feeding the technical-indicators
 *     library (which itself expects oldest-first).
 *
 * If we passed engine-order (oldest-first) directly, the strategy would
 * use the oldest price as "current" and double-reverse the indicator data.
 * The SELL conditions (RSI > overbought etc.) would then fire on 2018
 * prices when 2025 was current, producing zero SELL trades over the
 * 2018-2025 horizon (validated empirically in M2-01 Plan 05 dev).
 *
 * The reverse here makes the boundary contract explicit: engine speaks
 * chronological, strategy speaks newest-first, adapter translates.
 */
function toStrategyHistoricalData(bars: HistoricalDataPoint[]): HistoricalData[] {
  // Take only the most recent STRATEGY_HISTORY_WINDOW bars (caps per-call
  // work; see comment on STRATEGY_HISTORY_WINDOW).
  const startIdx = Math.max(0, bars.length - STRATEGY_HISTORY_WINDOW);
  const slice = bars.length > STRATEGY_HISTORY_WINDOW ? bars.slice(startIdx) : bars;
  const out: HistoricalData[] = new Array(slice.length);
  for (let i = 0; i < slice.length; i++) {
    const point = slice[slice.length - 1 - i]!;
    out[i] = {
      date: point.timestamp.toISOString().split('T')[0] ?? '',
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    };
  }
  return out;
}

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
    const convertedData = toStrategyHistoricalData(historicalData);
    const signal = await this.strategy.analyze(symbol, convertedData);
    return signal;
  }

  async onBar(
    symbol: string,
    _bar: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal | null> {
    const convertedData = toStrategyHistoricalData(historicalData);
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
