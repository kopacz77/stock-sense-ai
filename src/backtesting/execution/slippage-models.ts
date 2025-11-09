/**
 * Slippage Models for Realistic Order Execution
 * Slippage = difference between expected price and actual fill price
 */

import type { Bar, Order, SlippageModel } from "../types/backtest-types.js";

/**
 * No slippage - assumes perfect execution at quoted price
 * Use for: liquid stocks, limit orders, or optimistic backtests
 */
export class NoSlippageModel implements SlippageModel {
  type: "NONE" = "NONE";

  calculate(): number {
    return 0;
  }
}

/**
 * Fixed Basis Points Slippage
 * Applies a constant percentage slippage to all orders
 * Use for: general purpose, small-cap stocks
 *
 * Example: 5 BPS = 0.05% slippage
 * Buy at $100 -> actual fill at $100.05
 * Sell at $100 -> actual fill at $99.95
 */
export class FixedBPSSlippageModel implements SlippageModel {
  type: "FIXED_BPS" = "FIXED_BPS";

  constructor(private basisPoints: number) {
    if (basisPoints < 0) {
      throw new Error("Basis points must be non-negative");
    }
  }

  calculate(order: Order): number {
    // Convert BPS to decimal (5 BPS = 0.0005)
    const slippageRate = this.basisPoints / 10000;

    // Buy orders: pay MORE (positive slippage)
    // Sell orders: receive LESS (negative slippage affects proceeds)
    return order.side === "BUY" ? slippageRate : -slippageRate;
  }

  getBasisPoints(): number {
    return this.basisPoints;
  }
}

/**
 * Volume-Based Slippage
 * Slippage increases with order size relative to average volume
 * Use for: realistic simulation, large orders
 *
 * Formula: slippage = baseSlippage + (orderSize / avgVolume) * scaleFactor
 */
export class VolumeBasedSlippageModel implements SlippageModel {
  type: "VOLUME_BASED" = "VOLUME_BASED";

  constructor(
    private baseBPS: number, // Base slippage in basis points
    private scaleFactor: number = 100 // How much order size impacts slippage
  ) {
    if (baseBPS < 0) {
      throw new Error("Base basis points must be non-negative");
    }
    if (scaleFactor < 0) {
      throw new Error("Scale factor must be non-negative");
    }
  }

  calculate(order: Order, bar: Bar, avgVolume?: number): number {
    if (!avgVolume || avgVolume === 0) {
      // Fallback to base slippage if no volume data
      return this.baseBPS / 10000 * (order.side === "BUY" ? 1 : -1);
    }

    // Calculate order size as percentage of average volume
    const volumeRatio = order.quantity / avgVolume;

    // Calculate additional slippage based on order size
    const additionalBPS = volumeRatio * this.scaleFactor;

    // Total slippage in BPS
    const totalBPS = this.baseBPS + additionalBPS;

    // Convert to decimal and apply direction
    const slippageRate = totalBPS / 10000;

    return order.side === "BUY" ? slippageRate : -slippageRate;
  }

  getBaseBPS(): number {
    return this.baseBPS;
  }

  getScaleFactor(): number {
    return this.scaleFactor;
  }
}

/**
 * Spread-Based Slippage
 * Slippage based on bid-ask spread
 * Use for: highly accurate simulation when spread data available
 *
 * Assumes market orders cross the spread:
 * - Buy: pay the ask (half spread above mid)
 * - Sell: receive the bid (half spread below mid)
 */
export class SpreadBasedSlippageModel implements SlippageModel {
  type: "SPREAD_BASED" = "SPREAD_BASED";

  constructor(
    private minSpreadBPS: number = 5, // Minimum spread in BPS
    private spreadMultiplier: number = 1.0 // Multiplier for spread estimate
  ) {
    if (minSpreadBPS < 0) {
      throw new Error("Minimum spread must be non-negative");
    }
  }

  calculate(order: Order, bar: Bar, avgVolume?: number, spread?: number): number {
    let estimatedSpread: number;

    if (spread !== undefined && spread > 0) {
      // Use provided spread
      estimatedSpread = spread;
    } else {
      // Estimate spread from bar data
      // Simple heuristic: spread correlates with price volatility
      const barRange = bar.high - bar.low;
      const midPrice = (bar.high + bar.low) / 2;
      const estimatedSpreadPercent = (barRange / midPrice) * 0.5; // 50% of bar range

      // Convert to BPS
      estimatedSpread = Math.max(
        this.minSpreadBPS / 10000,
        estimatedSpreadPercent
      );
    }

    // Apply multiplier
    estimatedSpread *= this.spreadMultiplier;

    // Market orders pay half the spread
    const halfSpread = estimatedSpread / 2;

    // Buy: pay MORE, Sell: receive LESS
    return order.side === "BUY" ? halfSpread : -halfSpread;
  }

  getMinSpreadBPS(): number {
    return this.minSpreadBPS;
  }

  getSpreadMultiplier(): number {
    return this.spreadMultiplier;
  }
}

/**
 * Create a slippage model from configuration
 */
export function createSlippageModel(config: {
  type: "NONE" | "FIXED_BPS" | "VOLUME_BASED" | "SPREAD_BASED";
  basisPoints?: number;
  scaleFactor?: number;
  minSpreadBPS?: number;
  spreadMultiplier?: number;
}): SlippageModel {
  switch (config.type) {
    case "NONE":
      return new NoSlippageModel();

    case "FIXED_BPS":
      if (config.basisPoints === undefined) {
        throw new Error("basisPoints required for FIXED_BPS slippage model");
      }
      return new FixedBPSSlippageModel(config.basisPoints);

    case "VOLUME_BASED":
      if (config.basisPoints === undefined) {
        throw new Error("basisPoints required for VOLUME_BASED slippage model");
      }
      return new VolumeBasedSlippageModel(
        config.basisPoints,
        config.scaleFactor
      );

    case "SPREAD_BASED":
      return new SpreadBasedSlippageModel(
        config.minSpreadBPS,
        config.spreadMultiplier
      );

    default:
      throw new Error(`Unknown slippage model type: ${config.type}`);
  }
}
