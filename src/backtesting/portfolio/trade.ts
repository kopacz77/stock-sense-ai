/**
 * Trade class representing a completed trade
 */

import type { Fill, Position, Trade as ITrade } from "../types/backtest-types.js";

/**
 * Represents a completed trade (entry and exit)
 */
export class Trade implements ITrade {
  id: string;
  symbol: string;
  type: "LONG" | "SHORT";
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  exitTime: Date;
  exitPrice: number;
  exitReason: "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "END_OF_BACKTEST";
  grossPnL: number;
  commission: number;
  slippage: number;
  netPnL: number;
  returnPct: number;
  mae: number;
  mfe: number;
  holdDuration: number;
  entrySignal?: import("../types/backtest-types.js").Signal;
  exitSignal?: import("../types/backtest-types.js").Signal;
  metadata?: Record<string, unknown>;

  /**
   * Create a new trade from entry and exit fills
   * @param position The position being closed
   * @param exitFill The exit fill
   * @param exitReason Reason for exit
   */
  constructor(
    position: Position,
    exitFill: Fill,
    exitReason: "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "END_OF_BACKTEST",
  ) {
    this.id = `trade_${Date.now()}_${position.symbol}`;
    this.symbol = position.symbol;
    this.type = position.type;
    this.entryTime = position.entryTime;
    this.entryPrice = position.entryPrice;
    this.quantity = position.quantity;
    this.exitTime = exitFill.timestamp;
    this.exitPrice = exitFill.price;
    this.exitReason = exitReason;

    // Calculate gross PnL (before costs)
    if (this.type === "LONG") {
      this.grossPnL = (this.exitPrice - this.entryPrice) * this.quantity;
    } else {
      // SHORT
      this.grossPnL = (this.entryPrice - this.exitPrice) * this.quantity;
    }

    // Total costs (commission + slippage on both entry and exit)
    this.commission = position.entryCommission + exitFill.commission;
    this.slippage = position.entrySlippage + exitFill.slippage;

    // Net PnL (after all costs)
    this.netPnL = this.grossPnL - this.commission - this.slippage;

    // Return percentage (based on capital invested)
    const investedCapital = this.entryPrice * this.quantity;
    this.returnPct = (this.netPnL / investedCapital) * 100;

    // Maximum Adverse/Favorable Excursion
    this.mae = position.currentMae;
    this.mfe = position.currentMfe;

    // Hold duration in days
    this.holdDuration =
      (this.exitTime.getTime() - this.entryTime.getTime()) / (1000 * 60 * 60 * 24);

    // Store signals
    this.entrySignal = position.entrySignal;
  }

  /**
   * Check if this was a winning trade
   * @returns True if netPnL > 0
   */
  isWinner(): boolean {
    return this.netPnL > 0;
  }

  /**
   * Check if this was a losing trade
   * @returns True if netPnL < 0
   */
  isLoser(): boolean {
    return this.netPnL < 0;
  }

  /**
   * Get trade details as a plain object
   * @returns Trade interface object
   */
  toInterface(): ITrade {
    return {
      id: this.id,
      symbol: this.symbol,
      type: this.type,
      entryTime: this.entryTime,
      entryPrice: this.entryPrice,
      quantity: this.quantity,
      exitTime: this.exitTime,
      exitPrice: this.exitPrice,
      exitReason: this.exitReason,
      grossPnL: this.grossPnL,
      commission: this.commission,
      slippage: this.slippage,
      netPnL: this.netPnL,
      returnPct: this.returnPct,
      mae: this.mae,
      mfe: this.mfe,
      holdDuration: this.holdDuration,
      entrySignal: this.entrySignal,
      exitSignal: this.exitSignal,
      metadata: this.metadata,
    };
  }
}
