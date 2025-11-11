/**
 * Portfolio Tracker - Tracks Positions, Cash, and P&L
 * Core component for backtesting that maintains portfolio state
 */

import type {
  Fill,
  Position,
  PortfolioSnapshot,
  Trade,
  EquityCurvePoint,
} from "../types/backtest-types.js";

export class PortfolioTracker {
  private cash: number;
  private initialCash: number;
  private positions: Map<string, Position> = new Map();
  private closedTrades: Trade[] = [];
  private equityCurve: EquityCurvePoint[] = [];
  private currentDate: Date;

  // Transaction cost tracking
  private totalCommissions = 0;
  private totalSlippage = 0;

  constructor(initialCapital: number, startDate: Date) {
    if (initialCapital <= 0) {
      throw new Error("Initial capital must be positive");
    }
    this.cash = initialCapital;
    this.initialCash = initialCapital;
    this.currentDate = startDate;
  }

  /**
   * Process a fill (buy or sell)
   */
  processFill(fill: Fill): void {
    if (fill.side === "BUY") {
      this.buyFill(fill);
    } else {
      this.sellFill(fill);
    }

    // Track transaction costs
    this.totalCommissions += fill.commission;
    this.totalSlippage += fill.slippage;
  }

  /**
   * Process a buy fill
   */
  private buyFill(fill: Fill): void {
    const totalCost = fill.quantity * fill.price + fill.commission + fill.slippage;

    // Check if we have enough cash
    if (totalCost > this.cash) {
      throw new Error(
        `Insufficient cash for buy: need $${totalCost.toFixed(2)}, ` +
          `have $${this.cash.toFixed(2)}`
      );
    }

    // Deduct cash
    this.cash -= totalCost;

    // Update or create position
    const existingPosition = this.positions.get(fill.symbol);

    if (existingPosition) {
      // Add to existing position - calculate new average entry price
      const totalShares = existingPosition.quantity + fill.quantity;
      const avgPrice = existingPosition.avgEntryPrice ?? existingPosition.entryPrice ?? fill.price;
      const totalCostBasis =
        existingPosition.quantity * avgPrice +
        fill.quantity * fill.price;

      existingPosition.quantity = totalShares;
      existingPosition.avgEntryPrice = totalCostBasis / totalShares;
      existingPosition.currentPrice = fill.price;
      existingPosition.marketValue = totalShares * fill.price;
      existingPosition.lastUpdateDate = fill.timestamp;

      // Realized P&L stays the same for buys
      // Unrealized P&L updated in updatePositionPrices
    } else {
      // Create new position
      const newPosition: Position = {
        symbol: fill.symbol,
        quantity: fill.quantity,
        entryPrice: fill.price,
        avgEntryPrice: fill.price,
        currentPrice: fill.price,
        marketValue: fill.quantity * fill.price,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        realizedPnL: 0,
        totalPnL: 0,
        entryDate: fill.timestamp,
        lastUpdateDate: fill.timestamp,
        strategyName: fill.strategyName,
      };

      this.positions.set(fill.symbol, newPosition);
    }
  }

  /**
   * Process a sell fill
   */
  private sellFill(fill: Fill): void {
    const position = this.positions.get(fill.symbol);

    if (!position) {
      throw new Error(`Cannot sell ${fill.symbol}: no position exists`);
    }

    if (position.quantity < fill.quantity) {
      throw new Error(
        `Cannot sell ${fill.quantity} shares of ${fill.symbol}: ` +
          `only ${position.quantity} shares held`
      );
    }

    // Calculate proceeds
    const proceeds = fill.quantity * fill.price - fill.commission - fill.slippage;

    // Add to cash
    this.cash += proceeds;

    // Calculate realized P&L for this sale
    const avgPrice = position.avgEntryPrice ?? position.entryPrice ?? 0;
    const costBasis = fill.quantity * avgPrice;
    const realizedPnL = proceeds - costBasis;

    // Update position realized P&L (initialize if undefined)
    if (position.realizedPnL === undefined) {
      position.realizedPnL = 0;
    }
    position.realizedPnL += realizedPnL;

    // Create closed trade record
    const entryDate = position.entryDate ?? position.entryTime ?? fill.timestamp;
    const trade: Trade = {
      id: fill.orderId,
      symbol: fill.symbol,
      entryDate: entryDate,
      exitDate: fill.timestamp,
      entryPrice: avgPrice,
      exitPrice: fill.price,
      quantity: fill.quantity,
      side: "BUY", // We're closing a long position
      pnl: realizedPnL,
      pnlPercent: (realizedPnL / costBasis) * 100,
      commission: fill.commission,
      slippage: fill.slippage,
      totalCost: fill.commission + fill.slippage,
      netPnl: realizedPnL,
      holdingPeriod: this.calculateHoldingPeriod(entryDate, fill.timestamp),
      strategyName: fill.strategyName,
      exitReason: "STRATEGY_EXIT",
    };

    this.closedTrades.push(trade);

    // Update or close position
    if (position.quantity === fill.quantity) {
      // Fully closed
      this.positions.delete(fill.symbol);
    } else {
      // Partial close
      position.quantity -= fill.quantity;
      position.currentPrice = fill.price;
      position.marketValue = position.quantity * fill.price;
      position.lastUpdateDate = fill.timestamp;
    }
  }

  /**
   * Update prices for all positions (call this on each bar)
   */
  updatePositionPrices(prices: Map<string, number>, currentDate: Date): void {
    this.currentDate = currentDate;

    for (const [symbol, position] of this.positions) {
      const currentPrice = prices.get(symbol);

      if (currentPrice !== undefined) {
        position.currentPrice = currentPrice;
        position.marketValue = position.quantity * currentPrice;

        // Calculate unrealized P&L
        const avgPrice = position.avgEntryPrice ?? position.entryPrice ?? currentPrice;
        const costBasis = position.quantity * avgPrice;
        const marketValue = position.marketValue;
        position.unrealizedPnL = marketValue - costBasis;
        position.unrealizedPnLPercent = (position.unrealizedPnL / costBasis) * 100;

        // Total P&L = realized + unrealized
        const realized = position.realizedPnL ?? 0;
        position.totalPnL = realized + position.unrealizedPnL;

        position.lastUpdateDate = currentDate;
      }
    }

    // Record equity curve point
    this.recordEquityCurvePoint(currentDate);
  }

  /**
   * Record an equity curve point
   */
  private recordEquityCurvePoint(date: Date): void {
    const equity = this.getEquity();
    const marketValue = this.getMarketValue();
    const returns = this.calculateDailyReturn();
    const cumulativeReturns = ((equity - this.initialCash) / this.initialCash) * 100;
    const dailyReturn = returns;
    const drawdown = 0; // Will be calculated by analytics

    const point: EquityCurvePoint = {
      timestamp: date,
      date,
      equity,
      cash: this.cash,
      positionsValue: marketValue,
      marketValue,
      returns,
      cumulativeReturn: cumulativeReturns / 100, // Convert to decimal
      cumulativeReturns,
      dailyReturn,
      drawdown,
    };

    this.equityCurve.push(point);
  }

  /**
   * Calculate daily return
   */
  private calculateDailyReturn(): number {
    if (this.equityCurve.length === 0) {
      return 0;
    }

    const previousEquity = this.equityCurve[this.equityCurve.length - 1]?.equity ?? this.initialCash;
    const currentEquity = this.getEquity();

    return ((currentEquity - previousEquity) / previousEquity) * 100;
  }

  /**
   * Get current portfolio snapshot
   */
  getSnapshot(): PortfolioSnapshot {
    return {
      timestamp: this.currentDate,
      cash: this.cash,
      equity: this.getEquity(),
      positions: new Map(this.positions),
      totalValue: this.getEquity(),
      leverage: this.getLeverage(),
      marginUsed: this.getMarginUsed(),
    };
  }

  /**
   * Get total equity (cash + market value of positions)
   */
  getEquity(): number {
    return this.cash + this.getMarketValue();
  }

  /**
   * Get total market value of all positions
   */
  getMarketValue(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.marketValue ?? 0;
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
    return this.closedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  }

  /**
   * Get total P&L (realized + unrealized)
   */
  getTotalPnL(): number {
    return this.getRealizedPnL() + this.getUnrealizedPnL();
  }

  /**
   * Get current leverage (market value / equity)
   */
  getLeverage(): number {
    const equity = this.getEquity();
    if (equity === 0) return 0;
    return this.getMarketValue() / equity;
  }

  /**
   * Get margin used (for margin accounts)
   */
  getMarginUsed(): number {
    // Simplified: assume no margin trading for now
    return 0;
  }

  /**
   * Get all positions
   */
  getPositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  /**
   * Get position for a symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Check if we have a position in a symbol
   */
  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  /**
   * Get all closed trades
   */
  getClosedTrades(): Trade[] {
    return [...this.closedTrades];
  }

  /**
   * Get equity curve
   */
  getEquityCurve(): EquityCurvePoint[] {
    return [...this.equityCurve];
  }

  /**
   * Get total transaction costs
   */
  getTransactionCosts(): { commissions: number; slippage: number; total: number } {
    return {
      commissions: this.totalCommissions,
      slippage: this.totalSlippage,
      total: this.totalCommissions + this.totalSlippage,
    };
  }

  /**
   * Calculate holding period in days
   */
  private calculateHoldingPeriod(entryDate: Date, exitDate: Date): number {
    const diffMs = exitDate.getTime() - entryDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
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
    return this.initialCash;
  }

  /**
   * Reset portfolio to initial state
   */
  reset(initialCapital?: number): void {
    if (initialCapital !== undefined) {
      this.initialCash = initialCapital;
    }
    this.cash = this.initialCash;
    this.positions.clear();
    this.closedTrades = [];
    this.equityCurve = [];
    this.totalCommissions = 0;
    this.totalSlippage = 0;
  }
}
