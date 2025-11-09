/**
 * Kelly Criterion Position Sizing
 * Optimizes position size to maximize long-term growth while managing risk
 * Formula: f* = (p × b - q) / b
 * where p = win probability, q = loss probability, b = win/loss ratio
 */

import type { StrategyPerformance } from "../../types/trading.js";
import type { KellyCalculation } from "../types/risk-types.js";

export class KellyCriterion {
  /**
   * Calculate optimal position size using Kelly Criterion
   * Full Kelly: f* = (p × b - q) / b
   * Fractional Kelly (recommend 25% of full Kelly for safety)
   * Dynamic sizing based on strategy performance
   */
  calculateKellyPosition(
    strategy: string,
    accountBalance: number,
    historicalPerformance: StrategyPerformance,
    fraction: number = 0.25 // Default to Quarter-Kelly for safety
  ): KellyCalculation {
    const { winRate, avgWin, avgLoss, totalTrades } = historicalPerformance;

    // Validate input
    if (totalTrades < 30) {
      return this.insufficientDataResult(accountBalance);
    }

    if (winRate <= 0 || winRate >= 1) {
      return this.invalidWinRateResult(accountBalance);
    }

    const lossRate = 1 - winRate;

    // Kelly Formula: f* = (p × b - q) / b
    // where:
    // p = win rate
    // q = loss rate (1 - p)
    // b = win/loss ratio (avgWin / |avgLoss|)

    const b = Math.abs(avgWin / avgLoss);
    const kellyPercent = (winRate * b - lossRate) / b;

    // Check if strategy has negative expectancy
    if (kellyPercent <= 0) {
      return this.negativeExpectancyResult(accountBalance, winRate, avgWin, avgLoss);
    }

    // Apply safety caps
    // Never exceed 25% of capital (hard limit)
    const cappedKellyPercent = Math.min(kellyPercent, 0.25);

    // Calculate position sizes
    const fullKellySize = accountBalance * cappedKellyPercent;
    const fractionKellySize = accountBalance * cappedKellyPercent * fraction;

    // Calculate expected value
    const expectedValue = winRate * avgWin + lossRate * avgLoss;

    // Calculate risk of ruin (simplified)
    const riskOfRuin = this.calculateRiskOfRuin(winRate, lossRate, avgWin, avgLoss, accountBalance);

    // Determine recommendation based on Kelly %
    let recommendation: "FULL_KELLY" | "HALF_KELLY" | "QUARTER_KELLY" | "TOO_RISKY";

    if (kellyPercent > 0.25) {
      recommendation = "TOO_RISKY"; // Strategy may be overfitted
    } else if (kellyPercent > 0.15) {
      recommendation = "QUARTER_KELLY"; // Very aggressive, use quarter
    } else if (kellyPercent > 0.08) {
      recommendation = "HALF_KELLY"; // Moderately aggressive, use half
    } else {
      recommendation = "FULL_KELLY"; // Conservative enough for full Kelly
    }

    return {
      optimalPositionSize: Number(fullKellySize.toFixed(2)),
      conservativePositionSize: Number(fractionKellySize.toFixed(2)),
      kellyPercentage: Number((kellyPercent * 100).toFixed(2)),
      fractionUsed: fraction,
      winRate,
      avgWin,
      avgLoss,
      expectedValue: Number(expectedValue.toFixed(2)),
      riskOfRuin: Number(riskOfRuin.toFixed(6)),
      recommendation,
    };
  }

  /**
   * Compare Kelly Criterion with existing 1% rule
   * Provides analysis of which method is more appropriate
   */
  compareWithFixedRisk(
    accountBalance: number,
    kellyResult: KellyCalculation,
    fixedRiskPercent: number = 0.01
  ): {
    kellySize: number;
    fixedRiskSize: number;
    difference: number;
    differencePercent: number;
    recommendation: string;
    analysis: string[];
  } {
    const fixedRiskSize = accountBalance * fixedRiskPercent;
    const kellySize = kellyResult.conservativePositionSize;
    const difference = kellySize - fixedRiskSize;
    const differencePercent = (difference / fixedRiskSize) * 100;

    const analysis: string[] = [];

    // Analyze the comparison
    if (kellyResult.recommendation === "TOO_RISKY") {
      analysis.push("Kelly Criterion suggests strategy is too risky or overfitted");
      analysis.push("Recommend using fixed 1% risk rule instead");
      analysis.push("Strategy may need refinement before increasing position sizes");
    } else if (Math.abs(differencePercent) < 20) {
      analysis.push("Kelly and Fixed Risk methods suggest similar position sizes");
      analysis.push("Both methods are appropriate for this strategy");
    } else if (kellySize > fixedRiskSize) {
      analysis.push(`Kelly suggests ${differencePercent.toFixed(1)}% larger positions`);
      analysis.push("Strategy has strong positive expectancy");
      analysis.push("Consider gradually increasing position size if track record continues");
    } else {
      analysis.push(`Kelly suggests ${Math.abs(differencePercent).toFixed(1)}% smaller positions`);
      analysis.push("Strategy has moderate win rate or win/loss ratio");
      analysis.push("Fixed 1% rule may be too aggressive for this strategy");
    }

    // Expected value analysis
    if (kellyResult.expectedValue > 0) {
      analysis.push(
        `Positive expected value: $${kellyResult.expectedValue.toFixed(2)} per trade`
      );
    }

    // Risk of ruin analysis
    if (kellyResult.riskOfRuin > 0.01) {
      analysis.push(
        `Risk of ruin: ${(kellyResult.riskOfRuin * 100).toFixed(3)}% - Consider reducing position size`
      );
    }

    const recommendation =
      kellyResult.recommendation === "TOO_RISKY"
        ? "Use Fixed 1% Risk"
        : kellySize > fixedRiskSize
          ? `Use ${kellyResult.recommendation} Kelly`
          : "Use Fixed 1% Risk or Quarter Kelly (whichever is smaller)";

    return {
      kellySize: Number(kellySize.toFixed(2)),
      fixedRiskSize: Number(fixedRiskSize.toFixed(2)),
      difference: Number(difference.toFixed(2)),
      differencePercent: Number(differencePercent.toFixed(2)),
      recommendation,
      analysis,
    };
  }

  /**
   * Calculate dynamic Kelly position size based on recent performance
   * Adjusts Kelly percentage based on recent win rate vs. historical
   */
  calculateDynamicKelly(
    accountBalance: number,
    historicalPerformance: StrategyPerformance,
    recentTrades: Array<{ pnl: number }>,
    recentPeriod: number = 20
  ): KellyCalculation {
    if (recentTrades.length < recentPeriod) {
      return this.calculateKellyPosition("dynamic", accountBalance, historicalPerformance);
    }

    // Calculate recent win rate
    const recentWins = recentTrades.slice(-recentPeriod).filter((t) => t.pnl > 0).length;
    const recentWinRate = recentWins / recentPeriod;

    // Adjust Kelly based on recent vs. historical performance
    const performanceRatio = recentWinRate / historicalPerformance.winRate;

    // If recent performance is significantly worse, reduce position size
    let adjustmentFactor = 1.0;

    if (performanceRatio < 0.7) {
      adjustmentFactor = 0.5; // Reduce to half Kelly
    } else if (performanceRatio < 0.85) {
      adjustmentFactor = 0.75; // Reduce to 3/4 Kelly
    } else if (performanceRatio > 1.3) {
      adjustmentFactor = 1.0; // Don't increase even if recent performance is good
    }

    const baseKelly = this.calculateKellyPosition("dynamic", accountBalance, historicalPerformance);

    return {
      ...baseKelly,
      optimalPositionSize: Number((baseKelly.optimalPositionSize * adjustmentFactor).toFixed(2)),
      conservativePositionSize: Number(
        (baseKelly.conservativePositionSize * adjustmentFactor).toFixed(2)
      ),
    };
  }

  /**
   * Calculate risk of ruin (probability of losing all capital)
   * RoR = ((1 - Win Rate) / (1 + Win Rate))^(Capital / Avg Position Size)
   */
  private calculateRiskOfRuin(
    winRate: number,
    lossRate: number,
    avgWin: number,
    avgLoss: number,
    capital: number
  ): number {
    // Simplified risk of ruin calculation
    // RoR = (q/p)^(C/A)
    // where q = loss rate, p = win rate, C = capital, A = average position

    if (winRate >= lossRate && avgWin >= Math.abs(avgLoss)) {
      return 0; // Positive expectancy with good win rate = very low risk of ruin
    }

    const ratio = lossRate / winRate;
    const avgPosition = Math.max(Math.abs(avgWin), Math.abs(avgLoss));
    const exponent = capital / avgPosition;

    // Simplified formula (capped at 1.0)
    const ror = Math.min(Math.pow(ratio, exponent), 1.0);

    return ror;
  }

  /**
   * Result for insufficient data
   */
  private insufficientDataResult(accountBalance: number): KellyCalculation {
    return {
      optimalPositionSize: 0,
      conservativePositionSize: 0,
      kellyPercentage: 0,
      fractionUsed: 0.25,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      expectedValue: 0,
      riskOfRuin: 1.0,
      recommendation: "TOO_RISKY",
    };
  }

  /**
   * Result for invalid win rate
   */
  private invalidWinRateResult(accountBalance: number): KellyCalculation {
    return {
      optimalPositionSize: 0,
      conservativePositionSize: 0,
      kellyPercentage: 0,
      fractionUsed: 0.25,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      expectedValue: 0,
      riskOfRuin: 1.0,
      recommendation: "TOO_RISKY",
    };
  }

  /**
   * Result for negative expectancy
   */
  private negativeExpectancyResult(
    accountBalance: number,
    winRate: number,
    avgWin: number,
    avgLoss: number
  ): KellyCalculation {
    const expectedValue = winRate * avgWin + (1 - winRate) * avgLoss;

    return {
      optimalPositionSize: 0,
      conservativePositionSize: 0,
      kellyPercentage: 0,
      fractionUsed: 0.25,
      winRate,
      avgWin,
      avgLoss,
      expectedValue: Number(expectedValue.toFixed(2)),
      riskOfRuin: 1.0,
      recommendation: "TOO_RISKY",
    };
  }
}
