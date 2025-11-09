/**
 * Position class representing an open trading position
 */

import type { Fill, Position as IPosition, Signal } from "../types/backtest-types.js";

/**
 * Represents an open position in the portfolio
 */
export class Position implements IPosition {
  id: string;
  symbol: string;
  type: "LONG" | "SHORT";
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  entryCommission: number;
  entrySlippage: number;
  entrySignal?: Signal;
  currentMae: number;
  currentMfe: number;
  value: number;

  /**
   * Create a new position from a fill
   * @param fill The fill that created this position
   */
  constructor(fill: Fill) {
    this.id = `pos_${fill.orderId}`;
    this.symbol = fill.symbol;
    this.type = fill.side === "BUY" ? "LONG" : "SHORT";
    this.entryTime = fill.timestamp;
    this.entryPrice = fill.price;
    this.quantity = fill.quantity;
    this.currentPrice = fill.price;
    this.unrealizedPnL = 0;
    this.entryCommission = fill.commission;
    this.entrySlippage = fill.slippage;
    this.currentMae = 0; // Maximum Adverse Excursion
    this.currentMfe = 0; // Maximum Favorable Excursion
    this.value = this.quantity * this.currentPrice;
  }

  /**
   * Update the position with current market price
   * @param price Current market price
   */
  updatePrice(price: number): void {
    this.currentPrice = price;
    this.value = this.quantity * price;

    // Calculate unrealized PnL
    if (this.type === "LONG") {
      this.unrealizedPnL = (price - this.entryPrice) * this.quantity;
    } else {
      // SHORT
      this.unrealizedPnL = (this.entryPrice - price) * this.quantity;
    }

    // Account for entry costs in unrealized PnL
    this.unrealizedPnL -= this.entryCommission + this.entrySlippage;

    // Update MAE and MFE
    if (this.unrealizedPnL < this.currentMae) {
      this.currentMae = this.unrealizedPnL;
    }
    if (this.unrealizedPnL > this.currentMfe) {
      this.currentMfe = this.unrealizedPnL;
    }
  }

  /**
   * Check if stop loss is hit
   * @param low Low price of the bar
   * @returns True if stop loss is hit
   */
  isStopLossHit(low: number, high: number): boolean {
    if (!this.stopLoss) return false;

    if (this.type === "LONG") {
      return low <= this.stopLoss;
    } else {
      // SHORT
      return high >= this.stopLoss;
    }
  }

  /**
   * Check if take profit is hit
   * @param low Low price of the bar
   * @param high High price of the bar
   * @returns True if take profit is hit
   */
  isTakeProfitHit(low: number, high: number): boolean {
    if (!this.takeProfit) return false;

    if (this.type === "LONG") {
      return high >= this.takeProfit;
    } else {
      // SHORT
      return low <= this.takeProfit;
    }
  }

  /**
   * Get position details as a plain object
   * @returns Position interface object
   */
  toInterface(): IPosition {
    return {
      id: this.id,
      symbol: this.symbol,
      type: this.type,
      entryTime: this.entryTime,
      entryPrice: this.entryPrice,
      quantity: this.quantity,
      currentPrice: this.currentPrice,
      unrealizedPnL: this.unrealizedPnL,
      stopLoss: this.stopLoss,
      takeProfit: this.takeProfit,
      entryCommission: this.entryCommission,
      entrySlippage: this.entrySlippage,
      entrySignal: this.entrySignal,
      currentMae: this.currentMae,
      currentMfe: this.currentMfe,
      value: this.value,
    };
  }
}
