/**
 * Pre-Trade Risk Validator
 * Validates orders against risk limits before execution
 * Prevents excessive risk-taking and enforces portfolio constraints
 */

import type {
  RiskValidationResult,
  PaperOrder,
  PortfolioState,
  PaperTradingConfig,
} from "../types/paper-trading-types.js";

/**
 * Pre-Trade Validator
 * Enforces risk limits and portfolio constraints
 */
export class PreTradeValidator {
  constructor(private config: PaperTradingConfig) {}

  /**
   * Validate order before execution
   */
  validateOrder(
    order: PaperOrder,
    portfolio: PortfolioState,
    estimatedFillPrice: number
  ): RiskValidationResult {
    const reasons: string[] = [];
    const limits = {
      positionSize: true,
      positionPercent: true,
      maxPositions: true,
      dailyLoss: true,
      symbolConcentration: true,
      totalExposure: true,
    };

    let allowed = true;

    // Check position size limit (absolute $)
    const positionValue = order.quantity * estimatedFillPrice;

    if (this.config.maxPositionSize > 0 && positionValue > this.config.maxPositionSize) {
      allowed = false;
      limits.positionSize = false;
      reasons.push(
        `Position size $${positionValue.toFixed(2)} exceeds maximum $${this.config.maxPositionSize.toFixed(2)}`
      );
    }

    // Check position size as % of portfolio
    const positionPercent = (positionValue / portfolio.totalValue) * 100;

    if (this.config.maxPositionPercent > 0 && positionPercent > this.config.maxPositionPercent * 100) {
      allowed = false;
      limits.positionPercent = false;
      reasons.push(
        `Position ${positionPercent.toFixed(2)}% exceeds maximum ${(this.config.maxPositionPercent * 100).toFixed(2)}%`
      );
    }

    // Check maximum number of positions
    if (order.side === "BUY" && !portfolio.positions.has(order.symbol)) {
      const futurePositionCount = portfolio.positions.size + 1;

      if (this.config.maxPositions > 0 && futurePositionCount > this.config.maxPositions) {
        allowed = false;
        limits.maxPositions = false;
        reasons.push(
          `Would exceed maximum positions limit (${this.config.maxPositions}). Current: ${portfolio.positions.size}`
        );
      }
    }

    // Check daily loss limit
    const dailyPnL = portfolio.totalPnL; // Simplified - should track daily P&L separately

    if (this.config.maxDailyLoss > 0 && dailyPnL < -this.config.maxDailyLoss) {
      allowed = false;
      limits.dailyLoss = false;
      reasons.push(
        `Daily loss limit reached: -$${Math.abs(dailyPnL).toFixed(2)} exceeds -$${this.config.maxDailyLoss.toFixed(2)}`
      );
    }

    if (
      this.config.maxDailyLossPercent > 0 &&
      (dailyPnL / portfolio.initialCapital) * 100 < -this.config.maxDailyLossPercent * 100
    ) {
      allowed = false;
      limits.dailyLoss = false;
      reasons.push(
        `Daily loss % limit reached: ${((dailyPnL / portfolio.initialCapital) * 100).toFixed(2)}% ` +
          `exceeds ${(this.config.maxDailyLossPercent * 100).toFixed(2)}%`
      );
    }

    // Check symbol concentration (max % in single symbol)
    if (order.side === "BUY") {
      const existingPosition = portfolio.positions.get(order.symbol);
      const currentSymbolValue = existingPosition ? existingPosition.currentValue : 0;
      const futureSymbolValue = currentSymbolValue + positionValue;
      const symbolConcentration = (futureSymbolValue / portfolio.totalValue) * 100;

      if (
        this.config.maxSymbolConcentration > 0 &&
        symbolConcentration > this.config.maxSymbolConcentration * 100
      ) {
        allowed = false;
        limits.symbolConcentration = false;
        reasons.push(
          `Symbol concentration ${symbolConcentration.toFixed(2)}% would exceed maximum ` +
            `${(this.config.maxSymbolConcentration * 100).toFixed(2)}%`
        );
      }
    }

    // Check total portfolio exposure
    if (order.side === "BUY") {
      const currentExposure = portfolio.positionsValue;
      const futureExposure = currentExposure + positionValue;
      const exposurePercent = (futureExposure / portfolio.totalValue) * 100;

      if (
        this.config.maxTotalExposure > 0 &&
        exposurePercent > this.config.maxTotalExposure * 100
      ) {
        allowed = false;
        limits.totalExposure = false;
        reasons.push(
          `Total exposure ${exposurePercent.toFixed(2)}% would exceed maximum ` +
            `${(this.config.maxTotalExposure * 100).toFixed(2)}%`
        );
      }
    }

    // Check sufficient cash for buy orders
    if (order.side === "BUY") {
      const estimatedCost = positionValue * 1.01; // Add 1% buffer for commissions/slippage

      if (estimatedCost > portfolio.cash) {
        allowed = false;
        reasons.push(
          `Insufficient cash: need ~$${estimatedCost.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`
        );
      }
    }

    // All checks passed
    if (allowed) {
      reasons.push("All risk checks passed");
    }

    return {
      allowed,
      reasons,
      limits,
      metadata: {
        positionValue,
        positionPercent,
        estimatedCost: order.side === "BUY" ? positionValue * 1.01 : 0,
      },
    };
  }

  /**
   * Validate position size for new order
   */
  validatePositionSize(
    orderValue: number,
    portfolioValue: number
  ): { allowed: boolean; reason?: string } {
    if (this.config.maxPositionSize > 0 && orderValue > this.config.maxPositionSize) {
      return {
        allowed: false,
        reason: `Position size $${orderValue.toFixed(2)} exceeds maximum $${this.config.maxPositionSize.toFixed(2)}`,
      };
    }

    const positionPercent = (orderValue / portfolioValue) * 100;

    if (this.config.maxPositionPercent > 0 && positionPercent > this.config.maxPositionPercent * 100) {
      return {
        allowed: false,
        reason: `Position ${positionPercent.toFixed(2)}% exceeds maximum ${(this.config.maxPositionPercent * 100).toFixed(2)}%`,
      };
    }

    return { allowed: true };
  }

  /**
   * Calculate maximum allowed position size
   */
  calculateMaxPositionSize(portfolioValue: number): number {
    const limits: number[] = [];

    if (this.config.maxPositionSize > 0) {
      limits.push(this.config.maxPositionSize);
    }

    if (this.config.maxPositionPercent > 0) {
      limits.push(portfolioValue * this.config.maxPositionPercent);
    }

    if (limits.length === 0) {
      return portfolioValue; // No limit
    }

    return Math.min(...limits);
  }

  /**
   * Calculate optimal position size based on risk
   * Uses a simplified Kelly Criterion approach
   */
  calculateOptimalPositionSize(
    portfolioValue: number,
    winRate: number,
    avgWinPercent: number,
    avgLossPercent: number
  ): number {
    if (winRate === 0 || avgWinPercent === 0 || avgLossPercent === 0) {
      // Default to conservative sizing
      return portfolioValue * 0.05; // 5%
    }

    // Kelly Criterion: f = (bp - q) / b
    // where p = win rate, q = loss rate, b = win/loss ratio
    const p = winRate / 100;
    const q = 1 - p;
    const b = Math.abs(avgWinPercent / avgLossPercent);

    let kellyFraction = (b * p - q) / b;

    // Cap Kelly at 25% for safety (fractional Kelly)
    kellyFraction = Math.min(kellyFraction * 0.5, 0.25); // Half Kelly, max 25%

    // Ensure positive
    kellyFraction = Math.max(kellyFraction, 0.01); // Min 1%

    const positionSize = portfolioValue * kellyFraction;

    // Apply max limits
    const maxAllowed = this.calculateMaxPositionSize(portfolioValue);

    return Math.min(positionSize, maxAllowed);
  }

  /**
   * Check if portfolio is within risk limits
   */
  checkPortfolioRiskLimits(portfolio: PortfolioState): {
    withinLimits: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let withinLimits = true;

    // Check daily loss
    const dailyPnL = portfolio.totalPnL;

    if (this.config.maxDailyLoss > 0 && dailyPnL < -this.config.maxDailyLoss) {
      withinLimits = false;
      warnings.push(`Daily loss limit breached: -$${Math.abs(dailyPnL).toFixed(2)}`);
    }

    // Check max drawdown
    if (portfolio.currentDrawdown < -20) {
      // 20% drawdown warning
      warnings.push(`Significant drawdown: ${portfolio.currentDrawdown.toFixed(2)}%`);
    }

    // Check position concentration
    for (const [symbol, position] of portfolio.positions) {
      const concentration = (position.currentValue / portfolio.totalValue) * 100;

      if (
        this.config.maxSymbolConcentration > 0 &&
        concentration > this.config.maxSymbolConcentration * 100
      ) {
        withinLimits = false;
        warnings.push(
          `${symbol} concentration ${concentration.toFixed(2)}% exceeds limit ` +
            `${(this.config.maxSymbolConcentration * 100).toFixed(2)}%`
        );
      }
    }

    // Check total exposure
    const exposurePercent = (portfolio.positionsValue / portfolio.totalValue) * 100;

    if (
      this.config.maxTotalExposure > 0 &&
      exposurePercent > this.config.maxTotalExposure * 100
    ) {
      withinLimits = false;
      warnings.push(
        `Total exposure ${exposurePercent.toFixed(2)}% exceeds limit ` +
          `${(this.config.maxTotalExposure * 100).toFixed(2)}%`
      );
    }

    if (warnings.length === 0) {
      warnings.push("All risk limits OK");
    }

    return { withinLimits, warnings };
  }

  /**
   * Suggest position size based on ATR and risk per trade
   * @param atr Average True Range
   * @param stopLossATRMultiplier Stop loss multiplier (e.g., 2x ATR)
   * @param riskPerTrade Risk per trade as decimal (e.g., 0.01 = 1%)
   */
  calculateATRPositionSize(
    portfolioValue: number,
    price: number,
    atr: number,
    stopLossATRMultiplier: number,
    riskPerTrade: number
  ): number {
    // Calculate stop loss distance
    const stopLossDistance = atr * stopLossATRMultiplier;

    // Calculate risk amount
    const riskAmount = portfolioValue * riskPerTrade;

    // Calculate position size
    const shares = Math.floor(riskAmount / stopLossDistance);

    // Calculate position value
    const positionValue = shares * price;

    // Apply max limits
    const maxAllowed = this.calculateMaxPositionSize(portfolioValue);

    return Math.min(positionValue, maxAllowed);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PaperTradingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current limits
   */
  getLimits(): {
    maxPositionSize: number;
    maxPositionPercent: number;
    maxPositions: number;
    maxDailyLoss: number;
    maxDailyLossPercent: number;
    maxSymbolConcentration: number;
    maxTotalExposure: number;
  } {
    return {
      maxPositionSize: this.config.maxPositionSize,
      maxPositionPercent: this.config.maxPositionPercent,
      maxPositions: this.config.maxPositions,
      maxDailyLoss: this.config.maxDailyLoss,
      maxDailyLossPercent: this.config.maxDailyLossPercent,
      maxSymbolConcentration: this.config.maxSymbolConcentration,
      maxTotalExposure: this.config.maxTotalExposure,
    };
  }
}
