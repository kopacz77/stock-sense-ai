/**
 * Stress Testing Framework
 * Tests portfolio resilience under extreme market conditions
 * Historical stress scenarios: 2008 Financial Crisis, 2020 COVID Crash, etc.
 */

import type { Position } from "../../types/trading.js";
import type { StressTest, StressTestResult } from "../types/risk-types.js";

export class StressTester {
  /**
   * Predefined historical stress test scenarios
   */
  private static readonly STRESS_SCENARIOS: Record<string, StressTest> = {
    FINANCIAL_CRISIS_2008: {
      name: "2008 Financial Crisis",
      description: "Global financial crisis with -50% SPY, high volatility",
      marketShock: -0.5,
      volatilityIncrease: 3.0,
      correlationIncrease: 0.85,
      sectorShocks: new Map([
        ["FINANCE", -0.55],
        ["ENERGY", -0.42],
        ["TECH", -0.30],
        ["HEALTHCARE", -0.25],
        ["CONSUMER", -0.35],
      ]),
    },
    COVID_CRASH_2020: {
      name: "2020 COVID-19 Crash",
      description: "-35% SPY in 1 month, sector rotation",
      marketShock: -0.35,
      volatilityIncrease: 2.5,
      correlationIncrease: 0.9,
      sectorShocks: new Map([
        ["TRAVEL", -0.7],
        ["ENERGY", -0.5],
        ["RETAIL", -0.4],
        ["TECH", -0.15],
        ["HEALTHCARE", -0.1],
      ]),
    },
    RATE_HIKE_2022: {
      name: "2022 Rate Hike Selloff",
      description: "-25% SPY, rotation from growth to value",
      marketShock: -0.25,
      volatilityIncrease: 1.8,
      correlationIncrease: 0.7,
      sectorShocks: new Map([
        ["TECH", -0.35],
        ["GROWTH", -0.40],
        ["FINANCE", -0.15],
        ["ENERGY", 0.1],
        ["VALUE", -0.05],
      ]),
    },
    FLASH_CRASH: {
      name: "Flash Crash",
      description: "-10% intraday crash with rapid recovery",
      marketShock: -0.1,
      volatilityIncrease: 5.0,
      correlationIncrease: 0.95,
      sectorShocks: new Map(),
    },
    SECTOR_ROTATION: {
      name: "Sector Rotation Shock",
      description: "Tech -30%, Energy +20% rotation event",
      marketShock: 0,
      volatilityIncrease: 1.2,
      correlationIncrease: 0.3,
      sectorShocks: new Map([
        ["TECH", -0.3],
        ["ENERGY", 0.2],
        ["FINANCE", 0.1],
        ["HEALTHCARE", -0.05],
      ]),
    },
    MODERATE_CORRECTION: {
      name: "Moderate Market Correction",
      description: "-10% market correction",
      marketShock: -0.1,
      volatilityIncrease: 1.5,
      correlationIncrease: 0.6,
      sectorShocks: new Map(),
    },
  };

  /**
   * Get predefined stress scenario by name
   */
  getScenario(scenarioName: string): StressTest {
    const scenario = StressTester.STRESS_SCENARIOS[scenarioName];
    if (!scenario) {
      throw new Error(`Unknown stress scenario: ${scenarioName}`);
    }
    return scenario;
  }

  /**
   * Get all available stress scenarios
   */
  getAllScenarios(): StressTest[] {
    return Object.values(StressTester.STRESS_SCENARIOS);
  }

  /**
   * Perform stress test on portfolio
   * Apply scenarios to current portfolio
   * Calculate impact on portfolio value
   * Identify vulnerabilities
   */
  async performStressTest(
    positions: Position[],
    accountBalance: number,
    scenario: StressTest,
    historicalReturns?: Map<string, number[]>
  ): Promise<StressTestResult> {
    const initialValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    // Apply stress to each position
    const positionImpacts = positions.map((position) => {
      const sectorShock = this.getSectorShock(position, scenario);
      const marketShock = scenario.marketShock;

      // Combined shock: sector-specific + market-wide
      const combinedShock = sectorShock !== null ? sectorShock : marketShock;

      const stressedValue = position.value * (1 + combinedShock);
      const lossPercent = (combinedShock * 100);

      return {
        symbol: position.symbol,
        initialValue: position.value,
        stressedValue: Number(stressedValue.toFixed(2)),
        lossPercent: Number(lossPercent.toFixed(2)),
      };
    });

    // Calculate stressed portfolio value
    const stressedValue = positionImpacts.reduce((sum, impact) => sum + impact.stressedValue, 0);
    const loss = initialValue - stressedValue;
    const lossPercent = (loss / initialValue) * 100;

    // Check if portfolio would survive (arbitrary threshold: -50%)
    const survivable = lossPercent < 50;

    // Calculate stressed risk metrics (if historical data available)
    let stressedVaR = 0;
    let stressedCVaR = 0;
    let stressedSharpe = 0;

    if (historicalReturns) {
      // Adjust returns for stress scenario
      const stressedReturns = this.applyStressToReturns(historicalReturns, scenario);

      // Calculate stressed VaR (simplified)
      const portfolioReturns = this.calculatePortfolioReturns(
        positions,
        stressedReturns,
        initialValue
      );
      if (portfolioReturns.length > 0) {
        const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
        const var95Index = Math.floor(sortedReturns.length * 0.05);
        stressedVaR = Math.abs(initialValue * (sortedReturns[var95Index] ?? 0));

        // Stressed CVaR
        const tailReturns = sortedReturns.slice(0, var95Index);
        const cvarReturn =
          tailReturns.length > 0
            ? tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length
            : (sortedReturns[0] ?? 0);
        stressedCVaR = Math.abs(initialValue * cvarReturn);

        // Stressed Sharpe (simplified)
        const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
        const variance =
          portfolioReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
          portfolioReturns.length;
        const stdDev = Math.sqrt(variance);
        stressedSharpe = stdDev > 0 ? (mean * 252) / (stdDev * Math.sqrt(252)) : 0;
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      positions,
      positionImpacts,
      lossPercent,
      scenario
    );

    return {
      testName: scenario.name,
      portfolioImpact: {
        initialValue: Number(initialValue.toFixed(2)),
        stressedValue: Number(stressedValue.toFixed(2)),
        loss: Number(loss.toFixed(2)),
        lossPercent: Number(lossPercent.toFixed(2)),
        survivable,
      },
      positionImpacts,
      riskMetrics: {
        stressedVaR: Number(stressedVaR.toFixed(2)),
        stressedCVaR: Number(stressedCVaR.toFixed(2)),
        stressedSharpe: Number(stressedSharpe.toFixed(2)),
      },
      recommendations,
    };
  }

  /**
   * Run all predefined stress tests
   */
  async runAllStressTests(
    positions: Position[],
    accountBalance: number,
    historicalReturns?: Map<string, number[]>
  ): Promise<StressTestResult[]> {
    const results: StressTestResult[] = [];

    for (const scenario of this.getAllScenarios()) {
      const result = await this.performStressTest(
        positions,
        accountBalance,
        scenario,
        historicalReturns
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Get sector-specific shock for a position
   */
  private getSectorShock(position: Position, scenario: StressTest): number | null {
    // Get sector from position (if available)
    const sector = position.sector || this.inferSector(position.symbol);

    if (sector && scenario.sectorShocks.has(sector)) {
      return scenario.sectorShocks.get(sector)!;
    }

    return null;
  }

  /**
   * Infer sector from symbol (simplified - should use real sector data)
   */
  private inferSector(symbol: string): string {
    const sectorMapping: Record<string, string> = {
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
      WMT: "RETAIL",
      TGT: "RETAIL",
      COST: "RETAIL",
    };

    return sectorMapping[symbol] || "OTHER";
  }

  /**
   * Apply stress scenario to historical returns
   */
  private applyStressToReturns(
    historicalReturns: Map<string, number[]>,
    scenario: StressTest
  ): Map<string, number[]> {
    const stressedReturns = new Map<string, number[]>();

    for (const [symbol, returns] of historicalReturns.entries()) {
      const sector = this.inferSector(symbol);
      const sectorShock = scenario.sectorShocks.get(sector) || scenario.marketShock;

      // Apply volatility increase and mean shift
      const adjustedReturns = returns.map((r) => {
        const stressedReturn = r * scenario.volatilityIncrease + sectorShock / 252; // Daily shock
        return stressedReturn;
      });

      stressedReturns.set(symbol, adjustedReturns);
    }

    return stressedReturns;
  }

  /**
   * Calculate portfolio returns
   */
  private calculatePortfolioReturns(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    portfolioValue: number
  ): number[] {
    const portfolioReturns: number[] = [];

    // Find minimum length
    let minLength = Infinity;
    for (const position of positions) {
      const returns = historicalReturns.get(position.symbol);
      if (returns && returns.length < minLength) {
        minLength = returns.length;
      }
    }

    if (minLength === Infinity || minLength === 0) return [];

    // Calculate portfolio return for each day
    for (let day = 0; day < minLength; day++) {
      let dayReturn = 0;

      for (const position of positions) {
        const returns = historicalReturns.get(position.symbol);
        if (returns && returns[day] !== undefined) {
          const weight = position.value / portfolioValue;
          dayReturn += weight * (returns[day] ?? 0);
        }
      }

      portfolioReturns.push(dayReturn);
    }

    return portfolioReturns;
  }

  /**
   * Generate recommendations based on stress test results
   */
  private generateRecommendations(
    positions: Position[],
    positionImpacts: Array<{ symbol: string; lossPercent: number }>,
    totalLossPercent: number,
    scenario: StressTest
  ): string[] {
    const recommendations: string[] = [];

    // Overall portfolio assessment
    if (totalLossPercent > 40) {
      recommendations.push(
        "CRITICAL: Portfolio would suffer severe losses in this scenario - consider significant diversification"
      );
    } else if (totalLossPercent > 25) {
      recommendations.push(
        "WARNING: Portfolio would experience major losses - review concentration risk"
      );
    } else if (totalLossPercent > 15) {
      recommendations.push(
        "MODERATE: Portfolio would face meaningful losses - acceptable for growth-oriented strategy"
      );
    } else {
      recommendations.push(
        "RESILIENT: Portfolio shows good stress resilience for this scenario"
      );
    }

    // Identify worst-hit positions
    const worstPositions = positionImpacts
      .filter((impact) => impact.lossPercent < -20)
      .sort((a, b) => a.lossPercent - b.lossPercent)
      .slice(0, 3);

    if (worstPositions.length > 0) {
      const symbols = worstPositions.map((p) => p.symbol).join(", ");
      recommendations.push(`Positions most vulnerable in this scenario: ${symbols}`);
    }

    // Sector-specific recommendations
    const sectorExposure = this.calculateSectorExposure(positions);
    for (const [sector, shock] of scenario.sectorShocks.entries()) {
      const exposure = sectorExposure.get(sector) || 0;
      if (exposure > 0.25 && shock < -0.2) {
        recommendations.push(
          `Reduce ${sector} sector exposure (currently ${(exposure * 100).toFixed(1)}%) - highly vulnerable in this scenario`
        );
      }
    }

    // Diversification recommendation
    if (positions.length < 5) {
      recommendations.push(
        "Consider adding more positions for better diversification and stress resilience"
      );
    }

    // Hedging recommendation for severe scenarios
    if (scenario.marketShock < -0.3) {
      recommendations.push(
        "Consider tail risk hedging strategies (puts, inverse ETFs) for extreme crash scenarios"
      );
    }

    return recommendations;
  }

  /**
   * Calculate sector exposure
   */
  private calculateSectorExposure(positions: Position[]): Map<string, number> {
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const sectorExposure = new Map<string, number>();

    for (const position of positions) {
      const sector = position.sector || this.inferSector(position.symbol);
      const exposure = sectorExposure.get(sector) || 0;
      sectorExposure.set(sector, exposure + position.value / totalValue);
    }

    return sectorExposure;
  }

  /**
   * Create custom stress scenario
   */
  createCustomScenario(
    name: string,
    description: string,
    marketShock: number,
    volatilityIncrease: number,
    sectorShocks: Record<string, number>
  ): StressTest {
    return {
      name,
      description,
      marketShock,
      volatilityIncrease,
      correlationIncrease: 0.7, // Default
      sectorShocks: new Map(Object.entries(sectorShocks)),
    };
  }
}
