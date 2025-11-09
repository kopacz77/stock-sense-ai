/**
 * Strategy Registry
 * Centralized registry for all trading strategies
 * Allows dynamic strategy loading and configuration
 */

import { MeanReversionStrategy } from './mean-reversion-strategy.js';
import { MomentumStrategy } from './momentum-strategy.js';
import type { Signal } from '../types/trading.js';
import type { HistoricalData } from '../types/trading.js';

/**
 * Strategy interface
 */
export interface Strategy {
  analyze(symbol: string, data: HistoricalData[]): Promise<Signal>;
  getName(): string;
  getDescription(): string;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  name: string;
  description: string;
  factory: (params?: any) => Strategy;
  defaultParams: any;
}

/**
 * Strategy Registry
 */
export class StrategyRegistry {
  private static instance: StrategyRegistry;
  private strategies: Map<string, StrategyConfig> = new Map();

  private constructor() {
    this.registerDefaultStrategies();
  }

  static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }

  /**
   * Register default strategies
   */
  private registerDefaultStrategies(): void {
    // Mean Reversion Strategy
    this.register({
      name: 'mean-reversion',
      description: 'Mean reversion strategy using RSI, MFI, and Bollinger Bands',
      defaultParams: {
        rsiOversold: 30,
        rsiOverbought: 70,
        mfiOversold: 20,
        mfiOverbought: 80,
        bbStdDev: 2,
        minConfidence: 60,
        volumeThreshold: 1.2,
        maxHoldingPeriod: 30,
      },
      factory: (params?: any) => {
        const config = { ...this.strategies.get('mean-reversion')?.defaultParams, ...params };
        return new MeanReversionStrategy(config);
      },
    });

    // Momentum Strategy
    this.register({
      name: 'momentum',
      description: 'Momentum strategy using EMA, MACD, and volume confirmation',
      defaultParams: {
        emaPeriod: 20,
        rsiPeriod: 14,
        macdFastPeriod: 12,
        macdSlowPeriod: 26,
        macdSignalPeriod: 9,
        minTrendStrength: 60,
        minConfidence: 65,
        volumeConfirmation: true,
        maxHoldingPeriod: 60,
      },
      factory: (params?: any) => {
        const config = { ...this.strategies.get('momentum')?.defaultParams, ...params };
        return new MomentumStrategy(config);
      },
    });
  }

  /**
   * Register a new strategy
   */
  register(config: StrategyConfig): void {
    this.strategies.set(config.name, config);
  }

  /**
   * Get a strategy by name
   */
  getStrategy(name: string, params?: any): Strategy {
    const config = this.strategies.get(name);
    if (!config) {
      throw new Error(`Strategy '${name}' not found. Available: ${this.listStrategies().join(', ')}`);
    }
    return config.factory(params);
  }

  /**
   * Check if a strategy exists
   */
  hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * List all available strategies
   */
  listStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get strategy info
   */
  getStrategyInfo(name: string): StrategyConfig | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all strategy info
   */
  getAllStrategyInfo(): StrategyConfig[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Unregister a strategy
   */
  unregister(name: string): boolean {
    return this.strategies.delete(name);
  }
}

/**
 * Helper function to get a strategy
 */
export function getStrategy(name: string, params?: any): Strategy {
  return StrategyRegistry.getInstance().getStrategy(name, params);
}

/**
 * Helper function to list strategies
 */
export function listStrategies(): string[] {
  return StrategyRegistry.getInstance().listStrategies();
}
