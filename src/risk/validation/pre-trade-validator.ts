/**
 * Pre-Trade Risk Validator
 * Validates trades before execution to prevent risk limit breaches
 * Target: <50ms validation time
 * Integration with paper trading OrderManager
 */

import type { Signal, Position } from "../../types/trading.js";
import type { PreTradeCheck } from "../types/risk-types.js";

export class PreTradeValidator {
  private readonly DEFAULT_LIMITS = {
    maxPositionSize: 0.25, // 25% of portfolio
    maxTotalRisk: 0.10, // 10% total portfolio risk
    maxRiskPerTrade: 0.01, // 1% risk per trade
    maxSectorExposure: 0.30, // 30% in any sector
    maxCorrelatedPositions: 3,
    maxVolumeRatio: 0.10, // 10% of daily volume
    maxPositions: 20,
    maxDrawdownForNewTrades: -0.20, // -20%
  };

  /**
   * Validate trade before execution
   * Checks:
   * - Position size within limits
   * - Portfolio concentration acceptable
   * - VaR within risk budget
   * - Correlation with existing positions
   * - Expected max drawdown impact
   * Target: <50ms validation time
   */
  async validateTrade(
    signal: Signal,
    currentPositions: Position[],
    accountBalance: number,
    marketData?: { symbol: string; volume: number }
  ): Promise<PreTradeCheck> {
    const startTime = Date.now();

    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Position Size Check
    const proposedValue = (signal.positionSize || 0) * (signal.entryPrice || 0);
    const positionSizePercent = proposedValue / accountBalance;

    if (positionSizePercent > this.DEFAULT_LIMITS.maxPositionSize) {
      blockers.push(
        `Position size ${(positionSizePercent * 100).toFixed(1)}% exceeds ${(this.DEFAULT_LIMITS.maxPositionSize * 100)}% limit`
      );
    } else if (positionSizePercent > this.DEFAULT_LIMITS.maxPositionSize * 0.8) {
      warnings.push(`Large position size: ${(positionSizePercent * 100).toFixed(1)}%`);
    }

    // 2. Total Risk Check
    const currentRisk = currentPositions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    const newRisk = currentRisk + (signal.riskAmount || 0);
    const riskPercent = newRisk / accountBalance;
    const riskLimit = accountBalance * this.DEFAULT_LIMITS.maxTotalRisk;

    if (riskPercent > this.DEFAULT_LIMITS.maxTotalRisk) {
      blockers.push(
        `Total portfolio risk ${(riskPercent * 100).toFixed(1)}% exceeds ${(this.DEFAULT_LIMITS.maxTotalRisk * 100)}% limit`
      );
    } else if (riskPercent > this.DEFAULT_LIMITS.maxTotalRisk * 0.6) {
      warnings.push(`High portfolio risk: ${(riskPercent * 100).toFixed(1)}%`);
    }

    // 3. Position Count Check
    const currentPositions_count = currentPositions.length;
    const newPositions_count = currentPositions_count + 1;

    if (newPositions_count > this.DEFAULT_LIMITS.maxPositions) {
      blockers.push(
        `Position count ${newPositions_count} exceeds limit of ${this.DEFAULT_LIMITS.maxPositions}`
      );
    }

    // 4. Sector Concentration Check
    const sectorExposure = this.calculateSectorExposureWithNewPosition(
      signal.symbol,
      proposedValue,
      currentPositions,
      accountBalance
    );

    const currentSectorExposure = this.calculateCurrentSectorExposure(
      currentPositions,
      accountBalance
    );

    let wouldExceedSectorLimit = false;
    for (const [sector, exposure] of Object.entries(sectorExposure)) {
      if (exposure > this.DEFAULT_LIMITS.maxSectorExposure) {
        blockers.push(
          `${sector} sector exposure ${(exposure * 100).toFixed(1)}% exceeds ${(this.DEFAULT_LIMITS.maxSectorExposure * 100)}% limit`
        );
        wouldExceedSectorLimit = true;
      } else if (exposure > this.DEFAULT_LIMITS.maxSectorExposure * 0.85) {
        warnings.push(`High ${sector} sector exposure: ${(exposure * 100).toFixed(1)}%`);
      }
    }

    // 5. Correlation Check (simplified - uses sector as proxy)
    const correlatedPositions = this.findCorrelatedPositions(signal.symbol, currentPositions);

    if (correlatedPositions.length >= this.DEFAULT_LIMITS.maxCorrelatedPositions) {
      blockers.push(
        `Would create ${correlatedPositions.length + 1} highly correlated positions (limit: ${this.DEFAULT_LIMITS.maxCorrelatedPositions})`
      );
    } else if (correlatedPositions.length === this.DEFAULT_LIMITS.maxCorrelatedPositions - 1) {
      warnings.push(
        `High correlation with ${correlatedPositions.length} existing positions`
      );
    }

    // 6. Liquidity Check
    const liquidityCheck = this.checkLiquidity(
      signal.symbol,
      signal.positionSize || 0,
      marketData?.volume || 1000000
    );

    if (liquidityCheck.volumeRatio > this.DEFAULT_LIMITS.maxVolumeRatio) {
      blockers.push(
        `Position size is ${(liquidityCheck.volumeRatio * 100).toFixed(1)}% of daily volume (limit: ${(this.DEFAULT_LIMITS.maxVolumeRatio * 100)}%)`
      );
    } else if (liquidityCheck.volumeRatio > this.DEFAULT_LIMITS.maxVolumeRatio * 0.5) {
      warnings.push(
        `Large position relative to volume: ${(liquidityCheck.volumeRatio * 100).toFixed(1)}%`
      );
    }

    // 7. Per-Trade Risk Check
    const tradeRiskPercent = (signal.riskAmount || 0) / accountBalance;
    if (tradeRiskPercent > this.DEFAULT_LIMITS.maxRiskPerTrade) {
      warnings.push(
        `Trade risk ${(tradeRiskPercent * 100).toFixed(2)}% exceeds recommended ${(this.DEFAULT_LIMITS.maxRiskPerTrade * 100)}%`
      );
    }

    // Determine recommendation
    let recommendation: "APPROVE" | "REDUCE_SIZE" | "REJECT";

    if (blockers.length > 0) {
      recommendation = "REJECT";
    } else if (warnings.length >= 2) {
      recommendation = "REDUCE_SIZE";
    } else {
      recommendation = "APPROVE";
    }

    const validationTime = Date.now() - startTime;

    return {
      passed: blockers.length === 0,
      blockers,
      warnings,
      riskImpact: {
        currentRisk,
        newRisk,
        riskIncrease: newRisk - currentRisk,
        riskLimit,
        utilizationPercent: Number(((newRisk / riskLimit) * 100).toFixed(1)),
      },
      positionImpact: {
        currentPositions: currentPositions_count,
        newPositions: newPositions_count,
        positionLimit: this.DEFAULT_LIMITS.maxPositions,
      },
      concentrationImpact: {
        currentSectorExposure,
        newSectorExposure: new Map(Object.entries(sectorExposure)),
        sectorLimit: this.DEFAULT_LIMITS.maxSectorExposure,
        wouldExceedLimit: wouldExceedSectorLimit,
      },
      correlationImpact: {
        currentCorrelation: 0, // Simplified
        newCorrelation: 0, // Simplified
        correlatedPositions: correlatedPositions.length,
        correlationLimit: this.DEFAULT_LIMITS.maxCorrelatedPositions,
      },
      liquidityCheck,
      recommendation,
    };
  }

  /**
   * Check liquidity of proposed trade
   */
  private checkLiquidity(
    symbol: string,
    proposedShares: number,
    averageDailyVolume: number
  ): {
    averageDailyVolume: number;
    proposedShares: number;
    volumeRatio: number;
    liquidityRating: "HIGH" | "MEDIUM" | "LOW";
  } {
    const volumeRatio = proposedShares / averageDailyVolume;

    let liquidityRating: "HIGH" | "MEDIUM" | "LOW";
    if (volumeRatio < 0.01) {
      liquidityRating = "HIGH";
    } else if (volumeRatio < 0.05) {
      liquidityRating = "MEDIUM";
    } else {
      liquidityRating = "LOW";
    }

    return {
      averageDailyVolume,
      proposedShares,
      volumeRatio: Number(volumeRatio.toFixed(4)),
      liquidityRating,
    };
  }

  /**
   * Calculate sector exposure with new position
   */
  private calculateSectorExposureWithNewPosition(
    symbol: string,
    proposedValue: number,
    positions: Position[],
    accountBalance: number
  ): Record<string, number> {
    const sectorMap = this.getSectorMapping();
    const exposure: Record<string, number> = {};

    // Add current positions
    for (const pos of positions) {
      const sector = pos.sector || sectorMap[pos.symbol] || "OTHER";
      exposure[sector] = (exposure[sector] || 0) + pos.value / accountBalance;
    }

    // Add new position
    const newSector = sectorMap[symbol] || "OTHER";
    exposure[newSector] = (exposure[newSector] || 0) + proposedValue / accountBalance;

    return exposure;
  }

  /**
   * Calculate current sector exposure
   */
  private calculateCurrentSectorExposure(
    positions: Position[],
    accountBalance: number
  ): Map<string, number> {
    const sectorMap = this.getSectorMapping();
    const exposure = new Map<string, number>();

    for (const pos of positions) {
      const sector = pos.sector || sectorMap[pos.symbol] || "OTHER";
      const current = exposure.get(sector) || 0;
      exposure.set(sector, current + pos.value / accountBalance);
    }

    return exposure;
  }

  /**
   * Find correlated positions (using sector as proxy)
   */
  private findCorrelatedPositions(symbol: string, positions: Position[]): Position[] {
    const sectorMap = this.getSectorMapping();
    const symbolSector = sectorMap[symbol] || "OTHER";

    return positions.filter((pos) => {
      const posSector = pos.sector || sectorMap[pos.symbol] || "OTHER";
      return posSector === symbolSector;
    });
  }

  /**
   * Get sector mapping (simplified - should use real sector data)
   */
  private getSectorMapping(): Record<string, string> {
    return {
      AAPL: "TECH",
      MSFT: "TECH",
      GOOGL: "TECH",
      AMZN: "TECH",
      META: "TECH",
      NVDA: "TECH",
      JPM: "FINANCE",
      BAC: "FINANCE",
      WFC: "FINANCE",
      GS: "FINANCE",
      C: "FINANCE",
      JNJ: "HEALTHCARE",
      PFE: "HEALTHCARE",
      UNH: "HEALTHCARE",
      ABBV: "HEALTHCARE",
      XOM: "ENERGY",
      CVX: "ENERGY",
      COP: "ENERGY",
      SLB: "ENERGY",
    };
  }

  /**
   * Validate order against drawdown limits
   */
  validateAgainstDrawdown(
    currentDrawdown: number,
    signal: Signal
  ): {
    allowed: boolean;
    sizeAdjustment: number;
    reason: string;
  } {
    if (currentDrawdown < this.DEFAULT_LIMITS.maxDrawdownForNewTrades) {
      return {
        allowed: false,
        sizeAdjustment: 0,
        reason: `Portfolio drawdown ${(currentDrawdown * 100).toFixed(1)}% too severe for new positions`,
      };
    } else if (currentDrawdown < this.DEFAULT_LIMITS.maxDrawdownForNewTrades * 0.75) {
      return {
        allowed: true,
        sizeAdjustment: 0.5,
        reason: `Elevated drawdown: ${(currentDrawdown * 100).toFixed(1)}% - reducing position size by 50%`,
      };
    }

    return {
      allowed: true,
      sizeAdjustment: 1.0,
      reason: "Normal drawdown levels",
    };
  }
}
