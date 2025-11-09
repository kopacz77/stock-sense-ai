/**
 * Execution Simulator for Paper Trading
 * Simulates realistic order fills with slippage and commissions
 * Enforces market hours and implements partial fills
 */

import type {
  PaperOrder,
  MarketDataUpdate,
  PaperTradingConfig,
} from "../types/paper-trading-types.js";
import type {
  CommissionModel,
  SlippageModel,
  Order,
  Bar,
} from "../../backtesting/types/backtest-types.js";

/**
 * Fill Result
 */
export interface FillResult {
  canFill: boolean;
  fillPrice: number;
  fillQuantity: number;
  commission: number;
  slippage: number;
  slippageAmount: number;
  reason?: string;
}

/**
 * Execution Simulator
 * Handles realistic order execution simulation
 */
export class ExecutionSimulator {
  constructor(
    private config: PaperTradingConfig,
    private slippageModel: SlippageModel,
    private commissionModel: CommissionModel
  ) {}

  /**
   * Simulate order execution
   */
  simulateExecution(
    order: PaperOrder,
    marketData: MarketDataUpdate,
    avgVolume?: number
  ): FillResult {
    // Check market hours if enforced
    if (this.config.enforceMarketHours && !this.isMarketOpen(marketData.timestamp)) {
      return {
        canFill: false,
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        slippageAmount: 0,
        reason: "Market closed",
      };
    }

    // Determine fill price based on order type
    const fillPrice = this.calculateFillPrice(order, marketData);

    if (fillPrice === 0) {
      return {
        canFill: false,
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        slippageAmount: 0,
        reason: "Order conditions not met",
      };
    }

    // Calculate fill quantity (partial fills if enabled)
    const fillQuantity = this.calculateFillQuantity(
      order,
      marketData,
      avgVolume
    );

    if (fillQuantity === 0) {
      return {
        canFill: false,
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        slippageAmount: 0,
        reason: "Insufficient liquidity for fill",
      };
    }

    // Calculate slippage
    const slippageRate = this.calculateSlippage(
      order,
      marketData,
      avgVolume,
      fillQuantity
    );

    // Apply slippage to fill price
    const slippageAmount = fillPrice * Math.abs(slippageRate);
    const adjustedFillPrice =
      order.side === "BUY"
        ? fillPrice * (1 + Math.abs(slippageRate))
        : fillPrice * (1 - Math.abs(slippageRate));

    // Check if slippage exceeds maximum allowed
    if (this.config.maxSlippageBPS > 0) {
      const slippageBPS = Math.abs(slippageRate) * 10000;
      if (slippageBPS > this.config.maxSlippageBPS) {
        return {
          canFill: false,
          fillPrice: 0,
          fillQuantity: 0,
          commission: 0,
          slippage: 0,
          slippageAmount: 0,
          reason: `Slippage ${slippageBPS.toFixed(2)} BPS exceeds maximum ${this.config.maxSlippageBPS} BPS`,
        };
      }
    }

    // Calculate commission
    const commission = this.calculateCommission(order, adjustedFillPrice, fillQuantity);

    // Calculate total slippage cost
    const slippageCost = slippageAmount * fillQuantity;

    return {
      canFill: true,
      fillPrice: adjustedFillPrice,
      fillQuantity,
      commission,
      slippage: slippageCost,
      slippageAmount,
      reason: "Filled",
    };
  }

  /**
   * Calculate fill price based on order type
   */
  private calculateFillPrice(
    order: PaperOrder,
    marketData: MarketDataUpdate
  ): number {
    switch (order.type) {
      case "MARKET":
        // Market orders fill at current market price
        return marketData.price;

      case "LIMIT":
        // Limit orders fill at limit price or better
        if (!order.limitPrice) return 0;
        if (order.side === "BUY") {
          // Buy limit: fill if market price <= limit price
          return marketData.price <= order.limitPrice ? marketData.price : 0;
        } else {
          // Sell limit: fill if market price >= limit price
          return marketData.price >= order.limitPrice ? marketData.price : 0;
        }

      case "STOP_LOSS":
        // Stop loss orders fill at market price once stop is triggered
        if (!order.stopPrice) return 0;
        if (order.side === "BUY") {
          return marketData.price >= order.stopPrice ? marketData.price : 0;
        } else {
          return marketData.price <= order.stopPrice ? marketData.price : 0;
        }

      case "TAKE_PROFIT":
        // Take profit fills at limit price once reached
        if (!order.limitPrice) return 0;
        if (order.side === "BUY") {
          return marketData.price <= order.limitPrice ? marketData.price : 0;
        } else {
          return marketData.price >= order.limitPrice ? marketData.price : 0;
        }

      case "TRAILING_STOP":
        // Trailing stop fills at market price when triggered
        if (!order.stopPrice) return 0;
        if (order.side === "BUY") {
          return marketData.price >= order.stopPrice ? marketData.price : 0;
        } else {
          return marketData.price <= order.stopPrice ? marketData.price : 0;
        }

      default:
        return 0;
    }
  }

  /**
   * Calculate fill quantity (supports partial fills)
   */
  private calculateFillQuantity(
    order: PaperOrder,
    marketData: MarketDataUpdate,
    avgVolume?: number
  ): number {
    const remainingQuantity = order.remainingQuantity;

    if (!this.config.partialFills || !avgVolume || avgVolume === 0) {
      // Full fill
      return remainingQuantity;
    }

    // Estimate fillable quantity based on volume
    // Assume we can fill up to 1% of average volume per order
    const maxFillQuantity = Math.floor(avgVolume * 0.01);

    if (maxFillQuantity >= remainingQuantity) {
      // Can fill entire order
      return remainingQuantity;
    } else {
      // Partial fill
      return Math.max(1, maxFillQuantity); // At least 1 share
    }
  }

  /**
   * Calculate slippage for order
   */
  private calculateSlippage(
    order: PaperOrder,
    marketData: MarketDataUpdate,
    avgVolume?: number,
    fillQuantity?: number
  ): number {
    // Convert PaperOrder to backtesting Order format
    const backtestOrder: Order = {
      id: order.id,
      symbol: order.symbol,
      type: "MARKET", // Simplified
      side: order.side,
      quantity: fillQuantity ?? order.quantity,
      createdAt: order.createdAt,
    };

    // Convert MarketDataUpdate to Bar format
    const bar: Bar = {
      symbol: marketData.symbol,
      timestamp: marketData.timestamp,
      open: marketData.open,
      high: marketData.high,
      low: marketData.low,
      close: marketData.price,
      volume: marketData.volume,
    };

    // Calculate slippage using the configured model
    return this.slippageModel.calculate(backtestOrder, bar, avgVolume);
  }

  /**
   * Calculate commission for order
   */
  private calculateCommission(
    order: PaperOrder,
    fillPrice: number,
    fillQuantity: number
  ): number {
    // Convert to backtesting Order format
    const backtestOrder: Order = {
      id: order.id,
      symbol: order.symbol,
      type: "MARKET",
      side: order.side,
      quantity: fillQuantity,
      createdAt: order.createdAt,
    };

    return this.commissionModel.calculate(backtestOrder, fillPrice);
  }

  /**
   * Check if market is open
   */
  private isMarketOpen(timestamp: Date): boolean {
    // Convert to ET timezone (simplified - using UTC offset)
    // In production, use a proper timezone library
    const hour = timestamp.getHours();
    const minute = timestamp.getMinutes();
    const day = timestamp.getDay();

    // Check if weekend
    if (day === 0 || day === 6) {
      return false;
    }

    // Market hours: 9:30 AM - 4:00 PM ET (simplified to UTC)
    // This is a simplification - in production, use proper timezone handling
    const openMinutes = this.config.marketOpenHour * 60 + this.config.marketOpenMinute;
    const closeMinutes = this.config.marketCloseHour * 60 + this.config.marketCloseMinute;
    const currentMinutes = hour * 60 + minute;

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }

  /**
   * Get next market open time
   */
  getNextMarketOpen(currentTime: Date): Date {
    const nextOpen = new Date(currentTime);

    // If weekend, move to Monday
    const day = nextOpen.getDay();
    if (day === 0) {
      // Sunday
      nextOpen.setDate(nextOpen.getDate() + 1);
    } else if (day === 6) {
      // Saturday
      nextOpen.setDate(nextOpen.getDate() + 2);
    }

    // Set to market open time
    nextOpen.setHours(this.config.marketOpenHour);
    nextOpen.setMinutes(this.config.marketOpenMinute);
    nextOpen.setSeconds(0);
    nextOpen.setMilliseconds(0);

    // If we're past market open today, move to next day
    if (nextOpen <= currentTime) {
      nextOpen.setDate(nextOpen.getDate() + 1);

      // Skip weekend
      const newDay = nextOpen.getDay();
      if (newDay === 0) {
        nextOpen.setDate(nextOpen.getDate() + 1);
      } else if (newDay === 6) {
        nextOpen.setDate(nextOpen.getDate() + 2);
      }
    }

    return nextOpen;
  }

  /**
   * Get next market close time
   */
  getNextMarketClose(currentTime: Date): Date {
    const nextClose = new Date(currentTime);

    // Set to market close time
    nextClose.setHours(this.config.marketCloseHour);
    nextClose.setMinutes(this.config.marketCloseMinute);
    nextClose.setSeconds(0);
    nextClose.setMilliseconds(0);

    // If we're past market close today, move to next day
    if (nextClose <= currentTime) {
      nextClose.setDate(nextClose.getDate() + 1);

      // Skip weekend
      const day = nextClose.getDay();
      if (day === 0) {
        nextClose.setDate(nextClose.getDate() + 1);
      } else if (day === 6) {
        nextClose.setDate(nextClose.getDate() + 2);
      }
    }

    return nextClose;
  }

  /**
   * Calculate realistic fill timing
   * Returns delay in milliseconds
   */
  calculateFillDelay(order: PaperOrder): number {
    switch (order.type) {
      case "MARKET":
        // Market orders fill almost immediately
        return 100; // 100ms

      case "LIMIT":
      case "STOP_LOSS":
      case "TAKE_PROFIT":
        // Limit/stop orders may take slightly longer
        return 200; // 200ms

      case "TRAILING_STOP":
        // Trailing stops take a bit longer to process
        return 300; // 300ms

      default:
        return 100;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PaperTradingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update slippage model
   */
  updateSlippageModel(model: SlippageModel): void {
    this.slippageModel = model;
  }

  /**
   * Update commission model
   */
  updateCommissionModel(model: CommissionModel): void {
    this.commissionModel = model;
  }
}
