/**
 * Risk Reporter
 * Generates daily and weekly risk reports
 * Export to PDF/HTML/JSON
 */

import type { Position } from "../../types/trading.js";
import type {
  DailyRiskReport,
  WeeklyRiskReport,
  RiskAlert,
  VaRResult,
  CVaRResult,
  CorrelationAnalysis,
  SharpeRatioResult,
  MaxDrawdownResult,
  StressTestResult,
  MonteCarloResult,
} from "../types/risk-types.js";
import { VaRCalculator } from "../metrics/var-calculator.js";
import { CVaRCalculator } from "../metrics/cvar-calculator.js";
import { CorrelationMatrixCalculator } from "../correlation/correlation-matrix.js";

export class RiskReporter {
  private varCalculator: VaRCalculator;
  private cvarCalculator: CVaRCalculator;
  private correlationCalculator: CorrelationMatrixCalculator;

  constructor() {
    this.varCalculator = new VaRCalculator();
    this.cvarCalculator = new CVaRCalculator();
    this.correlationCalculator = new CorrelationMatrixCalculator();
  }

  /**
   * Generate Daily Risk Report
   */
  async generateDailyRiskReport(
    positions: Position[],
    accountBalance: number,
    historicalData: Map<string, number[]>,
    options?: {
      prevDayValue?: number;
      sharpeRatio?: number;
      maxDrawdown?: number;
      currentDrawdown?: number;
    }
  ): Promise<DailyRiskReport> {
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const dayChange = options?.prevDayValue ? totalValue - options.prevDayValue : 0;
    const dayChangePercent = options?.prevDayValue
      ? (dayChange / options.prevDayValue) * 100
      : 0;

    // Calculate VaR and CVaR
    const var95 = await this.varCalculator.calculateVaR(positions, historicalData, {
      method: "historical",
      confidenceLevel: 0.95,
      timeHorizon: 1,
    });

    const cvar95 = await this.cvarCalculator.calculateCVaR(
      positions,
      historicalData,
      0.95,
      "historical"
    );

    // Calculate correlations
    const correlationAnalysis = await this.correlationCalculator.analyzeCorrelations(
      positions,
      historicalData
    );

    // Calculate total risk
    const totalRisk = positions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    const totalRiskPercent = (totalRisk / accountBalance) * 100;

    // Calculate sector exposure
    const sectorExposure = this.calculateSectorExposure(positions, totalValue);

    // Top concentrations
    const topConcentrations = positions
      .map((pos) => ({
        symbol: pos.symbol,
        percent: Number(((pos.value / totalValue) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);

    // Generate alerts
    const alerts = this.generateAlerts(
      positions,
      accountBalance,
      var95,
      cvar95,
      sectorExposure,
      totalRiskPercent
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      positions,
      alerts,
      correlationAnalysis,
      sectorExposure
    );

    return {
      date: new Date(),
      portfolio: {
        totalValue: Number(totalValue.toFixed(2)),
        dayChange: Number(dayChange.toFixed(2)),
        dayChangePercent: Number(dayChangePercent.toFixed(2)),
        positions: positions.length,
      },
      riskMetrics: {
        totalRisk: Number(totalRisk.toFixed(2)),
        totalRiskPercent: Number(totalRiskPercent.toFixed(2)),
        var95: var95.oneDayVaR95,
        cvar95: cvar95.cvar95,
        sharpeRatio: options?.sharpeRatio || 0,
        maxDrawdown: options?.maxDrawdown || 0,
        currentDrawdown: options?.currentDrawdown || 0,
      },
      exposures: {
        sectorExposure,
        topConcentrations,
      },
      correlations: {
        avgCorrelation: correlationAnalysis.portfolioCorrelation,
        diversificationRatio: correlationAnalysis.diversificationRatio,
        highlyCorrelatedPairs: correlationAnalysis.matrix.highlyCorrelated,
      },
      alerts,
      recommendations,
    };
  }

  /**
   * Generate Weekly Risk Report
   */
  async generateWeeklyRiskReport(
    positions: Position[],
    accountBalance: number,
    historicalData: Map<string, number[]>,
    weeklyReturns: number[],
    trades: Array<{ pnl: number; date: Date }>,
    stressTestResults: StressTestResult[],
    monteCarloProjection: {
      oneWeekProjection: MonteCarloResult;
      fourWeekProjection: MonteCarloResult;
    }
  ): Promise<WeeklyRiskReport> {
    const dailyReport = await this.generateDailyRiskReport(positions, accountBalance, historicalData);

    // Calculate week summary
    const weekReturn = weeklyReturns.reduce((sum, r) => sum + r, 0);
    const weekReturnPercent = (weekReturn / accountBalance) * 100;

    const weekVolatility = this.calculateVolatility(weeklyReturns);

    const dailyReturns = weeklyReturns.map((_, i, arr) => {
      if (i === 0) return 0;
      const curr = arr[i] ?? 0;
      const prev = arr[i - 1] ?? 1;
      return prev !== 0 ? (curr - prev) / prev : 0;
    });

    const bestDay = dailyReturns.reduce(
      (max, r, i) => (r > max.return ? { date: new Date(), return: r } : max),
      { date: new Date(), return: -Infinity }
    );

    const worstDay = dailyReturns.reduce(
      (min, r, i) => (r < min.return ? { date: new Date(), return: r } : min),
      { date: new Date(), return: Infinity }
    );

    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

    // Calculate performance metrics
    const sharpeRatio = this.calculateSharpeRatio(weeklyReturns);
    const sortinoRatio = this.calculateSortinoRatio(weeklyReturns);
    const calmarRatio = this.calculateCalmarRatio(weeklyReturns);

    return {
      ...dailyReport,
      weekSummary: {
        weekReturn: Number(weekReturn.toFixed(2)),
        weekReturnPercent: Number(weekReturnPercent.toFixed(2)),
        weekVolatility: Number(weekVolatility.toFixed(4)),
        bestDay,
        worstDay,
        tradesExecuted: trades.length,
        winRate: Number(winRate.toFixed(3)),
      },
      performanceMetrics: {
        sharpeRatio,
        sortinoRatio,
        calmarRatio,
        informationRatio: 0, // Requires benchmark data
      },
      stressTestResults,
      monteCarloProjection,
    };
  }

  /**
   * Calculate sector exposure
   */
  private calculateSectorExposure(positions: Position[], totalValue: number): Map<string, number> {
    const sectorExposure = new Map<string, number>();

    for (const pos of positions) {
      const sector = pos.sector || "OTHER";
      const exposure = sectorExposure.get(sector) || 0;
      sectorExposure.set(sector, exposure + pos.value / totalValue);
    }

    return sectorExposure;
  }

  /**
   * Generate risk alerts
   */
  private generateAlerts(
    positions: Position[],
    accountBalance: number,
    var95: VaRResult,
    cvar95: CVaRResult,
    sectorExposure: Map<string, number>,
    totalRiskPercent: number
  ): RiskAlert[] {
    const alerts: RiskAlert[] = [];

    // Total risk alert
    if (totalRiskPercent > 10) {
      alerts.push({
        severity: "CRITICAL",
        category: "VAR_BREACH",
        message: `Total portfolio risk ${totalRiskPercent.toFixed(1)}% exceeds 10% threshold`,
        timestamp: new Date(),
        actionRequired: true,
        suggestedAction: "Reduce position sizes or close riskiest positions",
      });
    } else if (totalRiskPercent > 6) {
      alerts.push({
        severity: "HIGH",
        category: "VAR_BREACH",
        message: `Elevated portfolio risk: ${totalRiskPercent.toFixed(1)}%`,
        timestamp: new Date(),
        actionRequired: false,
        suggestedAction: "Monitor closely and avoid new high-risk positions",
      });
    }

    // Sector concentration alerts
    for (const [sector, exposure] of sectorExposure.entries()) {
      if (exposure > 0.3) {
        const symbols = positions
          .filter((p) => (p.sector || "OTHER") === sector)
          .map((p) => p.symbol);

        alerts.push({
          severity: "HIGH",
          category: "CONCENTRATION",
          message: `${sector} sector exposure at ${(exposure * 100).toFixed(1)}% (limit: 30%)`,
          timestamp: new Date(),
          actionRequired: true,
          suggestedAction: `Reduce one or more positions in ${sector} sector`,
          relatedPositions: symbols,
        });
      }
    }

    // Tail risk alert
    if (cvar95.tailRiskRatio > 1.5) {
      alerts.push({
        severity: "MEDIUM",
        category: "VAR_BREACH",
        message: `High tail risk detected (ratio: ${cvar95.tailRiskRatio.toFixed(2)})`,
        timestamp: new Date(),
        actionRequired: false,
        suggestedAction: "Consider tail risk hedging strategies",
      });
    }

    return alerts;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    positions: Position[],
    alerts: RiskAlert[],
    correlationAnalysis: CorrelationAnalysis,
    sectorExposure: Map<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // Based on alerts
    if (alerts.filter((a) => a.severity === "CRITICAL").length > 0) {
      recommendations.push("URGENT: Address critical risk alerts immediately");
    }

    // Diversification
    if (correlationAnalysis.portfolioCorrelation > 0.7) {
      recommendations.push("High portfolio correlation - consider adding uncorrelated assets");
    }

    if (correlationAnalysis.diversificationRatio < 1.3) {
      recommendations.push(
        "Low diversification ratio - portfolio could benefit from more diverse holdings"
      );
    }

    // Position count
    if (positions.length < 5) {
      recommendations.push("Add more positions for better diversification (currently < 5)");
    } else if (positions.length > 15) {
      recommendations.push(
        "Consider consolidating positions - may be over-diversified (currently > 15)"
      );
    }

    // Sector balance
    const maxSectorExposure = Math.max(...Array.from(sectorExposure.values()));
    if (maxSectorExposure > 0.4) {
      recommendations.push(
        `High concentration in single sector (${(maxSectorExposure * 100).toFixed(1)}%) - diversify across sectors`
      );
    }

    return recommendations;
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate Sharpe Ratio (simplified)
   */
  private calculateSharpeRatio(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = this.calculateVolatility(returns);
    return stdDev > 0 ? (mean * Math.sqrt(252)) / (stdDev * Math.sqrt(252)) : 0;
  }

  /**
   * Calculate Sortino Ratio (simplified)
   */
  private calculateSortinoRatio(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const downsideReturns = returns.filter((r) => r < 0);
    const downsideDeviation =
      downsideReturns.length > 0 ? this.calculateVolatility(downsideReturns) : 0;
    return downsideDeviation > 0 ? (mean * Math.sqrt(252)) / (downsideDeviation * Math.sqrt(252)) : 0;
  }

  /**
   * Calculate Calmar Ratio (simplified)
   */
  private calculateCalmarRatio(returns: number[]): number {
    const annualizedReturn = (returns.reduce((sum, r) => sum + r, 0) / returns.length) * 252;
    const maxDrawdown = this.calculateMaxDrawdown(returns);
    return maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(returns: number[]): number {
    let maxDrawdown = 0;
    let peak = 0;
    let value = 1;

    for (const r of returns) {
      value *= 1 + r;
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Export report to JSON
   */
  exportToJSON(report: DailyRiskReport | WeeklyRiskReport): string {
    return JSON.stringify(report, this.mapReplacer, 2);
  }

  /**
   * Map replacer for JSON.stringify
   */
  private mapReplacer(key: string, value: any): any {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  }
}
