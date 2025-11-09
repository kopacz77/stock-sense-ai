/**
 * Virtual Portfolio Manager
 * Manages cash, positions, P&L calculation, and portfolio value tracking
 * for paper trading system
 */

import type {
  PaperPosition,
  PaperTrade,
  PortfolioState,
  MarketDataUpdate,
} from "../types/paper-trading-types.js";
import type { Signal } from "../../types/trading.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Portfolio Manager for Paper Trading
 * Tracks virtual cash, positions, and portfolio performance
 */
export class PortfolioManager {
  private cash: number;
  private initialCapital: number;
  private positions: Map<string, PaperPosition> = new Map();
  private closedTrades: PaperTrade[] = [];

  // Historical tracking
  private valueHistory: Array<{ timestamp: Date; value: number }> = [];
  private dailyPnLHistory: Array<{ date: string; pnl: number }> = [];

  // Performance tracking
  private totalCommissions = 0;
  private totalSlippage = 0;
  private peakValue: number;
  private lastUpdate: Date;

  // Risk tracking
  private dailyStartValue: number;
  private dailyPnL = 0;

  constructor(initialCapital: number) {
    if (initialCapital <= 0) {
      throw new Error("Initial capital must be positive");
    }

    this.cash = initialCapital;
    this.initialCapital = initialCapital;
    this.peakValue = initialCapital;
    this.dailyStartValue = initialCapital;
    this.lastUpdate = new Date();
  }

  /**
   * Open a new position
   */
  openPosition(
    symbol: string,
    side: "LONG" | "SHORT",
    entryPrice: number,
    quantity: number,
    commission: number,
    slippage: number,
    signal?: Signal,
    strategyName?: string,
    stopLoss?: number,
    takeProfit?: number
  ): PaperPosition {
    // Calculate total cost
    const totalCost = quantity * entryPrice + commission + slippage;

    // Check sufficient cash for long positions
    if (side === "LONG" && totalCost > this.cash) {
      throw new Error(
        `Insufficient cash: need $${totalCost.toFixed(2)}, have $${this.cash.toFixed(2)}`
      );
    }

    // Deduct cash for long positions
    if (side === "LONG") {
      this.cash -= totalCost;
    } else {
      // For short positions, receive cash (simplified - no margin requirements)
      const proceeds = quantity * entryPrice - commission - slippage;
      this.cash += proceeds;
    }

    // Track costs
    this.totalCommissions += commission;
    this.totalSlippage += slippage;

    // Create position
    const position: PaperPosition = {
      id: uuidv4(),
      symbol,
      side,
      entryPrice,
      entryTime: new Date(),
      quantity,
      currentPrice: entryPrice,
      currentValue: quantity * entryPrice,
      lastUpdate: new Date(),
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      realizedPnL: 0,
      stopLoss,
      takeProfit,
      entryCommission: commission,
      entrySlippage: slippage,
      totalCommissions: commission,
      totalSlippage: slippage,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      mae: 0,
      mfe: 0,
      entrySignal: signal,
      strategyName,
    };

    // Check if we already have a position in this symbol
    const existingPosition = this.positions.get(symbol);
    if (existingPosition) {
      throw new Error(
        `Position already exists for ${symbol}. Close existing position first or use position sizing.`
      );
    }

    this.positions.set(symbol, position);
    this.lastUpdate = new Date();

    return position;
  }

  /**
   * Close a position completely
   */
  closePosition(
    symbol: string,
    exitPrice: number,
    commission: number,
    slippage: number,
    exitReason: PaperTrade["exitReason"],
    exitSignal?: Signal
  ): PaperTrade {
    const position = this.positions.get(symbol);

    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    return this.closePositionPartial(
      symbol,
      position.quantity,
      exitPrice,
      commission,
      slippage,
      exitReason,
      exitSignal
    );
  }

  /**
   * Close position partially
   */
  closePositionPartial(
    symbol: string,
    quantity: number,
    exitPrice: number,
    commission: number,
    slippage: number,
    exitReason: PaperTrade["exitReason"],
    exitSignal?: Signal
  ): PaperTrade {
    const position = this.positions.get(symbol);

    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    if (quantity > position.quantity) {
      throw new Error(
        `Cannot close ${quantity} shares: only ${position.quantity} shares held`
      );
    }

    // Calculate proceeds/cost
    let grossPnL: number;
    let proceeds: number;

    if (position.side === "LONG") {
      // Long position: selling shares
      proceeds = quantity * exitPrice - commission - slippage;
      grossPnL = quantity * (exitPrice - position.entryPrice);
      this.cash += proceeds;
    } else {
      // Short position: buying back shares
      const buyCost = quantity * exitPrice + commission + slippage;
      grossPnL = quantity * (position.entryPrice - exitPrice);
      this.cash -= buyCost;
    }

    // Track costs
    this.totalCommissions += commission;
    this.totalSlippage += slippage;

    // Calculate metrics
    const netPnL = grossPnL - commission - slippage;
    const returnPercent = (netPnL / (quantity * position.entryPrice)) * 100;

    // Calculate holding duration
    const exitTime = new Date();
    const holdDuration = exitTime.getTime() - position.entryTime.getTime();
    const holdDurationDays = holdDuration / (1000 * 60 * 60 * 24);

    // Calculate R-value (if we have stop loss)
    let rValue = 0;
    if (position.stopLoss) {
      const initialRisk =
        Math.abs(position.entryPrice - position.stopLoss) * quantity;
      rValue = initialRisk > 0 ? netPnL / initialRisk : 0;
    }

    // Create trade record
    const trade: PaperTrade = {
      id: uuidv4(),
      symbol,
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      entrySignal: position.entrySignal,
      exitTime,
      exitPrice,
      exitReason,
      exitSignal,
      quantity,
      grossPnL,
      commission: position.entryCommission + commission,
      slippage: position.entrySlippage + slippage,
      netPnL,
      returnPercent,
      mae: position.mae,
      mfe: position.mfe,
      rValue,
      holdDuration,
      holdDurationDays,
      strategyName: position.strategyName,
    };

    this.closedTrades.push(trade);

    // Update position
    if (quantity === position.quantity) {
      // Full close
      this.positions.delete(symbol);
    } else {
      // Partial close
      position.quantity -= quantity;
      position.realizedPnL += netPnL;
      position.totalCommissions += commission;
      position.totalSlippage += slippage;
      position.currentValue = position.quantity * exitPrice;
      position.lastUpdate = new Date();
    }

    this.lastUpdate = new Date();

    return trade;
  }

  /**
   * Update position prices with current market data
   */
  updatePositionPrices(marketData: Map<string, MarketDataUpdate>): void {
    for (const [symbol, position] of this.positions) {
      const data = marketData.get(symbol);

      if (data) {
        position.currentPrice = data.price;
        position.currentValue = position.quantity * data.price;
        position.lastUpdate = data.timestamp;

        // Update MAE/MFE tracking
        if (data.price > position.highestPrice) {
          position.highestPrice = data.price;
        }
        if (data.price < position.lowestPrice) {
          position.lowestPrice = data.price;
        }

        // Calculate unrealized P&L
        if (position.side === "LONG") {
          position.unrealizedPnL =
            position.quantity * (data.price - position.entryPrice);
        } else {
          // Short position
          position.unrealizedPnL =
            position.quantity * (position.entryPrice - data.price);
        }

        position.unrealizedPnLPercent =
          (position.unrealizedPnL / (position.quantity * position.entryPrice)) *
          100;

        // Update MAE and MFE
        if (position.side === "LONG") {
          position.mae = Math.min(
            position.mae,
            position.quantity * (position.lowestPrice - position.entryPrice)
          );
          position.mfe = Math.max(
            position.mfe,
            position.quantity * (position.highestPrice - position.entryPrice)
          );
        } else {
          // Short position
          position.mae = Math.min(
            position.mae,
            position.quantity * (position.entryPrice - position.highestPrice)
          );
          position.mfe = Math.max(
            position.mfe,
            position.quantity * (position.entryPrice - position.lowestPrice)
          );
        }
      }
    }

    this.lastUpdate = new Date();
    this.recordValueHistory();
  }

  /**
   * Update trailing stop price for a position
   */
  updateTrailingStop(
    symbol: string,
    trailingAmount: number,
    trailingPercent?: number
  ): void {
    const position = this.positions.get(symbol);

    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    if (trailingPercent !== undefined) {
      // Percentage-based trailing stop
      const trailPrice =
        position.side === "LONG"
          ? position.currentPrice * (1 - trailingPercent / 100)
          : position.currentPrice * (1 + trailingPercent / 100);

      if (
        !position.trailingStopPrice ||
        (position.side === "LONG" && trailPrice > position.trailingStopPrice) ||
        (position.side === "SHORT" && trailPrice < position.trailingStopPrice)
      ) {
        position.trailingStopPrice = trailPrice;
      }
    } else {
      // Fixed amount trailing stop
      const trailPrice =
        position.side === "LONG"
          ? position.currentPrice - trailingAmount
          : position.currentPrice + trailingAmount;

      if (
        !position.trailingStopPrice ||
        (position.side === "LONG" && trailPrice > position.trailingStopPrice) ||
        (position.side === "SHORT" && trailPrice < position.trailingStopPrice)
      ) {
        position.trailingStopPrice = trailPrice;
      }
    }
  }

  /**
   * Record value history for drawdown calculation
   */
  private recordValueHistory(): void {
    const currentValue = this.getTotalValue();

    this.valueHistory.push({
      timestamp: new Date(),
      value: currentValue,
    });

    // Keep only last 1000 values
    if (this.valueHistory.length > 1000) {
      this.valueHistory.shift();
    }

    // Update peak value
    if (currentValue > this.peakValue) {
      this.peakValue = currentValue;
    }
  }

  /**
   * Reset daily P&L tracking (call at start of each trading day)
   */
  resetDailyTracking(): void {
    this.dailyStartValue = this.getTotalValue();
    this.dailyPnL = 0;
  }

  /**
   * Get total portfolio value (cash + positions)
   */
  getTotalValue(): number {
    return this.cash + this.getPositionsValue();
  }

  /**
   * Get total value of all positions
   */
  getPositionsValue(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.currentValue;
    }
    return total;
  }

  /**
   * Get total unrealized P&L
   */
  getUnrealizedPnL(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.unrealizedPnL;
    }
    return total;
  }

  /**
   * Get total realized P&L from closed trades
   */
  getRealizedPnL(): number {
    return this.closedTrades.reduce((sum, trade) => sum + trade.netPnL, 0);
  }

  /**
   * Get total P&L (realized + unrealized)
   */
  getTotalPnL(): number {
    return this.getRealizedPnL() + this.getUnrealizedPnL();
  }

  /**
   * Get daily P&L
   */
  getDailyPnL(): number {
    return this.getTotalValue() - this.dailyStartValue;
  }

  /**
   * Get current drawdown
   */
  getCurrentDrawdown(): number {
    const currentValue = this.getTotalValue();
    return ((currentValue - this.peakValue) / this.peakValue) * 100;
  }

  /**
   * Get maximum drawdown
   */
  getMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = this.initialCapital;

    for (const point of this.valueHistory) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = ((point.value - peak) / peak) * 100;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Get position for symbol
   */
  getPosition(symbol: string): PaperPosition | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Get all positions
   */
  getAllPositions(): Map<string, PaperPosition> {
    return new Map(this.positions);
  }

  /**
   * Has position in symbol
   */
  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  /**
   * Get number of open positions
   */
  getPositionCount(): number {
    return this.positions.size;
  }

  /**
   * Get all closed trades
   */
  getClosedTrades(): PaperTrade[] {
    return [...this.closedTrades];
  }

  /**
   * Get winning trades
   */
  getWinningTrades(): PaperTrade[] {
    return this.closedTrades.filter((t) => t.netPnL > 0);
  }

  /**
   * Get losing trades
   */
  getLosingTrades(): PaperTrade[] {
    return this.closedTrades.filter((t) => t.netPnL < 0);
  }

  /**
   * Get win rate
   */
  getWinRate(): number {
    if (this.closedTrades.length === 0) return 0;
    return (this.getWinningTrades().length / this.closedTrades.length) * 100;
  }

  /**
   * Get portfolio state snapshot
   */
  getState(): PortfolioState {
    return {
      cash: this.cash,
      totalValue: this.getTotalValue(),
      positionsValue: this.getPositionsValue(),
      positions: new Map(this.positions),
      openOrders: new Map(), // Managed by OrderManager
      totalUnrealizedPnL: this.getUnrealizedPnL(),
      totalRealizedPnL: this.getRealizedPnL(),
      totalPnL: this.getTotalPnL(),
      initialCapital: this.initialCapital,
      totalReturn: this.getTotalValue() - this.initialCapital,
      totalReturnPercent:
        ((this.getTotalValue() - this.initialCapital) / this.initialCapital) *
        100,
      portfolioRisk: 0, // Calculated by RiskValidator
      maxDrawdown: this.getMaxDrawdown(),
      currentDrawdown: this.getCurrentDrawdown(),
      totalTrades: this.closedTrades.length,
      winningTrades: this.getWinningTrades().length,
      losingTrades: this.getLosingTrades().length,
      winRate: this.getWinRate(),
      totalCommissions: this.totalCommissions,
      totalSlippage: this.totalSlippage,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Get cash balance
   */
  getCash(): number {
    return this.cash;
  }

  /**
   * Get initial capital
   */
  getInitialCapital(): number {
    return this.initialCapital;
  }

  /**
   * Add cash (for testing or additional capital injection)
   */
  addCash(amount: number): void {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }
    this.cash += amount;
    this.lastUpdate = new Date();
  }

  /**
   * Get total commissions paid
   */
  getTotalCommissions(): number {
    return this.totalCommissions;
  }

  /**
   * Get total slippage paid
   */
  getTotalSlippage(): number {
    return this.totalSlippage;
  }

  /**
   * Get value history
   */
  getValueHistory(): Array<{ timestamp: Date; value: number }> {
    return [...this.valueHistory];
  }

  /**
   * Reset portfolio (USE WITH CAUTION)
   */
  reset(newInitialCapital?: number): void {
    this.cash = newInitialCapital ?? this.initialCapital;
    this.initialCapital = newInitialCapital ?? this.initialCapital;
    this.positions.clear();
    this.closedTrades = [];
    this.valueHistory = [];
    this.dailyPnLHistory = [];
    this.totalCommissions = 0;
    this.totalSlippage = 0;
    this.peakValue = this.initialCapital;
    this.dailyStartValue = this.initialCapital;
    this.dailyPnL = 0;
    this.lastUpdate = new Date();
  }

  /**
   * Load state from saved data
   */
  loadState(state: PortfolioState): void {
    this.cash = state.cash;
    this.initialCapital = state.initialCapital;
    this.positions = state.positions;
    this.totalCommissions = state.totalCommissions;
    this.totalSlippage = state.totalSlippage;
    this.lastUpdate = state.lastUpdate;

    // Recalculate derived values
    this.peakValue = state.totalValue;
    this.dailyStartValue = state.totalValue;
  }
}
