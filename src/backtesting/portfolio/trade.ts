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
  type?: "LONG" | "SHORT";
  entryTime?: Date;
  entryPrice: number;
  quantity: number;
  exitTime?: Date;
  exitPrice: number;
  exitReason: "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "END_OF_BACKTEST" | "STRATEGY_EXIT";
  grossPnL?: number;
  commission: number;
  slippage: number;
  netPnL?: number;
  pnl: number; // Alias for netPnL
  returnPct?: number;
  pnlPercent: number; // Alias for returnPct
  mae?: number;
  mfe?: number;
  holdDuration?: number;
  holdingPeriod: number; // Alias for holdDuration
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
    exitReason: "SIGNAL" | "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "END_OF_BACKTEST" | "STRATEGY_EXIT",
  ) {
    this.id = `trade_${Date.now()}_${position.symbol}`;
    this.symbol = position.symbol;
    this.type = position.type ?? "LONG";
    this.entryTime = position.entryTime ?? position.entryDate ?? exitFill.timestamp;
    this.entryPrice = position.entryPrice ?? position.avgEntryPrice ?? 0;
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
    this.commission = (position.entryCommission ?? 0) + exitFill.commission;
    this.slippage = (position.entrySlippage ?? 0) + exitFill.slippage;

    // Net PnL (after all costs)
    this.netPnL = this.grossPnL - this.commission - this.slippage;
    this.pnl = this.netPnL; // Alias

    // Return percentage (based on capital invested)
    const investedCapital = this.entryPrice * this.quantity;
    this.returnPct = (this.netPnL / investedCapital) * 100;
    this.pnlPercent = this.returnPct; // Alias

    // Maximum Adverse/Favorable Excursion
    this.mae = position.currentMae ?? 0;
    this.mfe = position.currentMfe ?? 0;

    // Hold duration in days
    this.holdDuration =
      (this.exitTime.getTime() - this.entryTime.getTime()) / (1000 * 60 * 60 * 24);
    this.holdingPeriod = this.holdDuration; // Alias

    // Store signals
    this.entrySignal = position.entrySignal;
  }

  /**
   * Check if this was a winning trade
   * @returns True if netPnL > 0
   */
  isWinner(): boolean {
    return (this.netPnL ?? 0) > 0;
  }

  /**
   * Check if this was a losing trade
   * @returns True if netPnL < 0
   */
  isLoser(): boolean {
    return (this.netPnL ?? 0) < 0;
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
      pnl: this.pnl,
      returnPct: this.returnPct,
      pnlPercent: this.pnlPercent,
      mae: this.mae,
      mfe: this.mfe,
      holdDuration: this.holdDuration,
      holdingPeriod: this.holdingPeriod,
      entrySignal: this.entrySignal,
      exitSignal: this.exitSignal,
      metadata: this.metadata,
    };
  }
}
