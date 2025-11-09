/**
 * Fill Simulator - Simulates Order Execution
 * Converts orders into fills with realistic slippage and commissions
 */

import type {
  Bar,
  CommissionModel,
  Fill,
  Order,
  SlippageModel,
} from "../types/backtest-types.js";
import { v4 as uuidv4 } from "uuid";

export interface FillSimulatorConfig {
  slippageModel: SlippageModel;
  commissionModel: CommissionModel;
  fillOnClose: boolean; // true = fill at close, false = fill at next open
  rejectPartialFills: boolean; // Reject orders larger than available volume
  maxOrderSizePercent?: number; // Max order size as % of bar volume (e.g., 0.1 = 10%)
}

export class FillSimulator {
  constructor(private config: FillSimulatorConfig) {}

  /**
   * Simulate filling a market order
   * @param order The order to fill
   * @param bar The current bar (for close fills) or next bar (for open fills)
   * @param avgVolume Average daily volume (for volume-based slippage)
   * @returns Fill object or null if order cannot be filled
   */
  simulateMarketOrderFill(
    order: Order,
    bar: Bar,
    avgVolume?: number
  ): Fill | null {
    // Validate order can be filled
    if (this.config.rejectPartialFills && this.config.maxOrderSizePercent) {
      const maxQuantity = bar.volume * this.config.maxOrderSizePercent;
      if (order.quantity > maxQuantity) {
        console.warn(
          `Order ${order.id} rejected: quantity ${order.quantity} ` +
            `exceeds ${this.config.maxOrderSizePercent * 100}% of bar volume ${bar.volume}`
        );
        return null;
      }
    }

    // Determine fill price (base price before slippage)
    const basePrice = this.config.fillOnClose ? bar.close : bar.open;

    // Calculate slippage
    const slippagePercent = this.config.slippageModel.calculate(
      order,
      bar,
      avgVolume
    );
    const slippageDollar = basePrice * Math.abs(slippagePercent);

    // Apply slippage to get actual fill price
    // Buy: pay more (add slippage)
    // Sell: receive less (subtract slippage)
    const fillPrice =
      order.side === "BUY"
        ? basePrice * (1 + slippagePercent)
        : basePrice * (1 - Math.abs(slippagePercent));

    // Calculate commission
    const commission = this.config.commissionModel.calculate(order, fillPrice);

    // Create fill
    const fill: Fill = {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      commission,
      slippage: slippageDollar * order.quantity, // Total slippage cost
      timestamp: bar.timestamp,
      strategyName: order.strategyName,
    };

    return fill;
  }

  /**
   * Simulate filling a limit order
   * @param order The limit order to fill
   * @param bar The current bar
   * @returns Fill object or null if limit price not reached
   */
  simulateLimitOrderFill(order: Order, bar: Bar): Fill | null {
    if (!order.limitPrice) {
      throw new Error("Limit order must have limitPrice specified");
    }

    // Check if limit price was reached during the bar
    let canFill = false;
    let fillPrice = order.limitPrice;

    if (order.side === "BUY") {
      // Buy limit: fill if bar low <= limit price
      if (bar.low <= order.limitPrice) {
        canFill = true;
        // Conservative assumption: fill at limit price or worse
        fillPrice = Math.min(order.limitPrice, bar.close);
      }
    } else {
      // Sell limit: fill if bar high >= limit price
      if (bar.high >= order.limitPrice) {
        canFill = true;
        // Conservative assumption: fill at limit price or worse
        fillPrice = Math.max(order.limitPrice, bar.close);
      }
    }

    if (!canFill) {
      return null;
    }

    // Limit orders have minimal slippage (already specified price)
    const commission = this.config.commissionModel.calculate(order, fillPrice);

    const fill: Fill = {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      commission,
      slippage: 0, // Limit orders don't have slippage in the traditional sense
      timestamp: bar.timestamp,
      strategyName: order.strategyName,
    };

    return fill;
  }

  /**
   * Simulate filling a stop order
   * @param order The stop order to fill
   * @param bar The current bar
   * @param avgVolume Average daily volume
   * @returns Fill object or null if stop price not reached
   */
  simulateStopOrderFill(
    order: Order,
    bar: Bar,
    avgVolume?: number
  ): Fill | null {
    if (!order.stopPrice) {
      throw new Error("Stop order must have stopPrice specified");
    }

    // Check if stop price was reached during the bar
    let stopTriggered = false;

    if (order.side === "BUY") {
      // Buy stop: triggered if bar high >= stop price
      if (bar.high >= order.stopPrice) {
        stopTriggered = true;
      }
    } else {
      // Sell stop: triggered if bar low <= stop price
      if (bar.low <= order.stopPrice) {
        stopTriggered = true;
      }
    }

    if (!stopTriggered) {
      return null;
    }

    // Once stop is triggered, it becomes a market order
    // Fill at the worse of stop price or close (conservative)
    const basePrice =
      order.side === "BUY"
        ? Math.max(order.stopPrice, bar.close)
        : Math.min(order.stopPrice, bar.close);

    // Calculate slippage (stops typically have higher slippage)
    const slippagePercent = this.config.slippageModel.calculate(
      order,
      bar,
      avgVolume
    );
    const slippageDollar = basePrice * Math.abs(slippagePercent);

    const fillPrice =
      order.side === "BUY"
        ? basePrice * (1 + slippagePercent)
        : basePrice * (1 - Math.abs(slippagePercent));

    const commission = this.config.commissionModel.calculate(order, fillPrice);

    const fill: Fill = {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      commission,
      slippage: slippageDollar * order.quantity,
      timestamp: bar.timestamp,
      strategyName: order.strategyName,
    };

    return fill;
  }

  /**
   * Simulate filling an order (auto-detects order type)
   */
  simulateFill(order: Order, bar: Bar, avgVolume?: number): Fill | null {
    switch (order.type) {
      case "MARKET":
        return this.simulateMarketOrderFill(order, bar, avgVolume);
      case "LIMIT":
        return this.simulateLimitOrderFill(order, bar);
      case "STOP":
        return this.simulateStopOrderFill(order, bar, avgVolume);
      case "STOP_LIMIT":
        // Stop-limit orders are complex - simplified implementation
        // First check if stop is triggered, then check limit
        const stopFill = this.simulateStopOrderFill(order, bar, avgVolume);
        if (stopFill) {
          // If stop triggered, check if we can fill at limit price
          return this.simulateLimitOrderFill(order, bar);
        }
        return null;
      default:
        throw new Error(`Unsupported order type: ${order.type}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FillSimulatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FillSimulatorConfig {
    return { ...this.config };
  }
}
