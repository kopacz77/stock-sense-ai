/**
 * Commission Models for Transaction Cost Simulation
 * Models various broker commission structures
 */

import type { CommissionModel, Order } from "../types/backtest-types.js";

/**
 * Zero Commission
 * Use for: modern zero-commission brokers (Robinhood, Webull, etc.)
 */
export class ZeroCommissionModel implements CommissionModel {
  type: "ZERO" = "ZERO";

  calculate(): number {
    return 0;
  }
}

/**
 * Fixed Commission Per Trade
 * Charge a flat fee per trade regardless of size
 * Use for: traditional brokers with flat-fee structure
 *
 * Example: $5 per trade
 */
export class FixedCommissionModel implements CommissionModel {
  type: "FIXED_PER_TRADE" = "FIXED_PER_TRADE";

  constructor(private feePerTrade: number) {
    if (feePerTrade < 0) {
      throw new Error("Commission fee must be non-negative");
    }
  }

  calculate(): number {
    return this.feePerTrade;
  }

  getFeePerTrade(): number {
    return this.feePerTrade;
  }
}

/**
 * Percentage-Based Commission
 * Charge a percentage of trade value
 * Use for: some international brokers, prop trading firms
 *
 * Example: 0.1% of trade value
 */
export class PercentageCommissionModel implements CommissionModel {
  type: "PERCENTAGE" = "PERCENTAGE";

  constructor(
    private percentageBPS: number, // Basis points (e.g., 10 BPS = 0.1%)
    private minCommission: number = 0, // Minimum commission per trade
    private maxCommission?: number // Maximum commission per trade (optional)
  ) {
    if (percentageBPS < 0) {
      throw new Error("Commission percentage must be non-negative");
    }
    if (minCommission < 0) {
      throw new Error("Minimum commission must be non-negative");
    }
    if (maxCommission !== undefined && maxCommission < minCommission) {
      throw new Error("Maximum commission must be >= minimum commission");
    }
  }

  calculate(order: Order, fillPrice: number): number {
    const tradeValue = order.quantity * fillPrice;
    const percentageRate = this.percentageBPS / 10000;
    let commission = tradeValue * percentageRate;

    // Apply minimum
    commission = Math.max(commission, this.minCommission);

    // Apply maximum if specified
    if (this.maxCommission !== undefined) {
      commission = Math.min(commission, this.maxCommission);
    }

    return commission;
  }

  getPercentageBPS(): number {
    return this.percentageBPS;
  }

  getMinCommission(): number {
    return this.minCommission;
  }

  getMaxCommission(): number | undefined {
    return this.maxCommission;
  }
}

/**
 * Per-Share Commission
 * Charge a fee per share traded
 * Use for: professional trading platforms, Interactive Brokers
 *
 * Example: $0.005 per share with $1 minimum
 */
export class PerShareCommissionModel implements CommissionModel {
  type: "PER_SHARE" = "PER_SHARE";

  constructor(
    private feePerShare: number, // Fee per share (e.g., $0.005)
    private minCommission: number = 0, // Minimum commission per trade
    private maxCommission?: number // Maximum commission per trade (optional)
  ) {
    if (feePerShare < 0) {
      throw new Error("Fee per share must be non-negative");
    }
    if (minCommission < 0) {
      throw new Error("Minimum commission must be non-negative");
    }
    if (maxCommission !== undefined && maxCommission < minCommission) {
      throw new Error("Maximum commission must be >= minimum commission");
    }
  }

  calculate(order: Order): number {
    let commission = order.quantity * this.feePerShare;

    // Apply minimum
    commission = Math.max(commission, this.minCommission);

    // Apply maximum if specified
    if (this.maxCommission !== undefined) {
      commission = Math.min(commission, this.maxCommission);
    }

    return commission;
  }

  getFeePerShare(): number {
    return this.feePerShare;
  }

  getMinCommission(): number {
    return this.minCommission;
  }

  getMaxCommission(): number | undefined {
    return this.maxCommission;
  }
}

/**
 * Create a commission model from configuration
 */
export function createCommissionModel(config: {
  type: "ZERO" | "FIXED_PER_TRADE" | "PERCENTAGE" | "PER_SHARE";
  feePerTrade?: number;
  percentageBPS?: number;
  feePerShare?: number;
  minCommission?: number;
  maxCommission?: number;
}): CommissionModel {
  switch (config.type) {
    case "ZERO":
      return new ZeroCommissionModel();

    case "FIXED_PER_TRADE":
      if (config.feePerTrade === undefined) {
        throw new Error("feePerTrade required for FIXED_PER_TRADE commission model");
      }
      return new FixedCommissionModel(config.feePerTrade);

    case "PERCENTAGE":
      if (config.percentageBPS === undefined) {
        throw new Error("percentageBPS required for PERCENTAGE commission model");
      }
      return new PercentageCommissionModel(
        config.percentageBPS,
        config.minCommission,
        config.maxCommission
      );

    case "PER_SHARE":
      if (config.feePerShare === undefined) {
        throw new Error("feePerShare required for PER_SHARE commission model");
      }
      return new PerShareCommissionModel(
        config.feePerShare,
        config.minCommission,
        config.maxCommission
      );

    default:
      throw new Error(`Unknown commission model type: ${config.type}`);
  }
}

/**
 * Common broker commission presets
 */
export const CommissionPresets = {
  // Modern zero-commission brokers
  ROBINHOOD: new ZeroCommissionModel(),
  WEBULL: new ZeroCommissionModel(),

  // Interactive Brokers IBKR Lite (free for stocks)
  IBKR_LITE: new ZeroCommissionModel(),

  // Interactive Brokers IBKR Pro (tiered pricing)
  IBKR_PRO_TIERED: new PerShareCommissionModel(0.005, 1.0, 1.0), // $0.005/share, $1 min/max

  // Traditional brokers (historical)
  TRADITIONAL_DISCOUNT: new FixedCommissionModel(4.95), // $4.95 per trade
  TRADITIONAL_FULL_SERVICE: new FixedCommissionModel(29.95), // $29.95 per trade

  // Percentage-based (some international markets)
  PERCENTAGE_BASED: new PercentageCommissionModel(10, 1.0, 100.0), // 0.1%, $1 min, $100 max
};
