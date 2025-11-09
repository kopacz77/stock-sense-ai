/**
 * Risk Alerter
 * Real-time alerts via Telegram/Email for risk events
 * Alert severity levels: INFO, WARNING, CRITICAL
 * Integration with existing AlertService
 */

import type { Position } from "../../types/trading.js";
import type { RiskAlert, VaRResult, CorrelationAnalysis } from "../types/risk-types.js";

export interface RiskAlertConfig {
  varBreachEnabled: boolean;
  concentrationEnabled: boolean;
  correlationEnabled: boolean;
  drawdownEnabled: boolean;
  kellyCriterionEnabled: boolean;

  // Thresholds
  varBreachThreshold: number; // % of VaR
  concentrationThreshold: number; // % of portfolio in sector
  correlationThreshold: number; // correlation coefficient
  drawdownThreshold: number; // % drawdown

  // Alert channels
  telegramEnabled: boolean;
  emailEnabled: boolean;
  consoleEnabled: boolean;
}

export class RiskAlerter {
  private readonly DEFAULT_CONFIG: RiskAlertConfig = {
    varBreachEnabled: true,
    concentrationEnabled: true,
    correlationEnabled: true,
    drawdownEnabled: true,
    kellyCriterionEnabled: true,

    varBreachThreshold: 1.0, // Alert if actual loss > VaR
    concentrationThreshold: 0.30, // Alert if sector > 30%
    correlationThreshold: 0.7, // Alert if correlation > 0.7
    drawdownThreshold: 0.15, // Alert if drawdown > 15%

    telegramEnabled: true,
    emailEnabled: false,
    consoleEnabled: true,
  };

  private config: RiskAlertConfig;
  private alertHistory: RiskAlert[] = [];

  constructor(config?: Partial<RiskAlertConfig>) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  /**
   * Check for VaR breach
   * Alert if actual loss exceeds VaR threshold
   */
  checkVaRBreach(
    actualLoss: number,
    var95: VaRResult,
    portfolioValue: number
  ): RiskAlert | null {
    if (!this.config.varBreachEnabled) return null;

    const lossPercent = (actualLoss / portfolioValue) * 100;
    const varPercent = (var95.oneDayVaR95 / portfolioValue) * 100;

    if (actualLoss > var95.oneDayVaR95 * this.config.varBreachThreshold) {
      const alert: RiskAlert = {
        severity: "HIGH",
        category: "VAR_BREACH",
        message: `VaR breach detected: Actual loss $${actualLoss.toFixed(2)} (${lossPercent.toFixed(2)}%) exceeds VaR $${var95.oneDayVaR95.toFixed(2)} (${varPercent.toFixed(2)}%)`,
        timestamp: new Date(),
        actionRequired: true,
        suggestedAction:
          "Review risk management strategy. VaR should be breached <5% of days. Consider reducing position sizes.",
      };

      this.recordAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check for concentration risk
   * Alert if sector exposure exceeds threshold
   */
  checkConcentrationRisk(
    positions: Position[],
    accountBalance: number
  ): RiskAlert[] {
    if (!this.config.concentrationEnabled) return [];

    const alerts: RiskAlert[] = [];
    const sectorExposure = this.calculateSectorExposure(positions, accountBalance);

    for (const [sector, exposure] of Object.entries(sectorExposure)) {
      if (exposure > this.config.concentrationThreshold) {
        const symbols = positions
          .filter((p) => (p.sector || this.inferSector(p.symbol)) === sector)
          .map((p) => p.symbol);

        const alert: RiskAlert = {
          severity: exposure > 0.4 ? "CRITICAL" : "HIGH",
          category: "CONCENTRATION",
          message: `High ${sector} sector concentration: ${(exposure * 100).toFixed(1)}% (threshold: ${(this.config.concentrationThreshold * 100)}%)`,
          timestamp: new Date(),
          actionRequired: true,
          suggestedAction: `Reduce exposure in ${sector} sector by closing or trimming positions`,
          relatedPositions: symbols,
        };

        this.recordAlert(alert);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  /**
   * Check for high correlation risk
   * Alert if too many highly correlated positions
   */
  checkCorrelationRisk(
    correlationAnalysis: CorrelationAnalysis,
    maxCorrelatedPositions: number = 3
  ): RiskAlert[] {
    if (!this.config.correlationEnabled) return [];

    const alerts: RiskAlert[] = [];

    // Check highly correlated pairs
    const highlyCorrelated = correlationAnalysis.matrix.highlyCorrelated.filter(
      (pair) => pair.correlation > this.config.correlationThreshold
    );

    if (highlyCorrelated.length > 0) {
      for (const pair of highlyCorrelated.slice(0, 3)) {
        // Top 3
        const alert: RiskAlert = {
          severity: pair.correlation > 0.85 ? "HIGH" : "MEDIUM",
          category: "CORRELATION",
          message: `High correlation detected: ${pair.symbol1} ↔ ${pair.symbol2} (${(pair.correlation * 100).toFixed(1)}%)`,
          timestamp: new Date(),
          actionRequired: false,
          suggestedAction: "Consider reducing position in one of these correlated assets",
          relatedPositions: [pair.symbol1, pair.symbol2],
        };

        this.recordAlert(alert);
        alerts.push(alert);
      }
    }

    // Check portfolio correlation
    if (correlationAnalysis.portfolioCorrelation > 0.7) {
      const alert: RiskAlert = {
        severity: "MEDIUM",
        category: "CORRELATION",
        message: `High portfolio correlation: ${(correlationAnalysis.portfolioCorrelation * 100).toFixed(1)}%`,
        timestamp: new Date(),
        actionRequired: false,
        suggestedAction: "Add uncorrelated assets to improve diversification",
      };

      this.recordAlert(alert);
      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Check for drawdown alert
   * Alert if drawdown exceeds threshold
   */
  checkDrawdownAlert(
    currentDrawdown: number,
    maxDrawdown: number
  ): RiskAlert | null {
    if (!this.config.drawdownEnabled) return null;

    if (Math.abs(currentDrawdown) > this.config.drawdownThreshold) {
      const alert: RiskAlert = {
        severity: Math.abs(currentDrawdown) > 0.20 ? "CRITICAL" : "HIGH",
        category: "DRAWDOWN",
        message: `Portfolio drawdown: ${(currentDrawdown * 100).toFixed(2)}% (threshold: ${(this.config.drawdownThreshold * 100)}%)`,
        timestamp: new Date(),
        actionRequired: true,
        suggestedAction:
          Math.abs(currentDrawdown) > 0.20
            ? "CRITICAL: Consider halting new positions and reviewing all open trades"
            : "Monitor closely. Consider reducing position sizes or closing losing positions",
      };

      this.recordAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check for Kelly Criterion change
   * Alert if Kelly recommendation changes significantly
   */
  checkKellyCriterionChange(
    previousKelly: number,
    currentKelly: number,
    strategyName: string
  ): RiskAlert | null {
    if (!this.config.kellyCriterionEnabled) return null;

    const changePercent = Math.abs((currentKelly - previousKelly) / previousKelly) * 100;

    if (changePercent > 30) {
      // 30% change threshold
      const alert: RiskAlert = {
        severity: "MEDIUM",
        category: "KELLY_CHANGE",
        message: `Kelly Criterion for ${strategyName} changed ${changePercent.toFixed(1)}% (${previousKelly.toFixed(2)}% → ${currentKelly.toFixed(2)}%)`,
        timestamp: new Date(),
        actionRequired: false,
        suggestedAction:
          currentKelly < previousKelly
            ? "Strategy performance declining - consider reducing position sizes"
            : "Strategy performance improving - may increase position sizes cautiously",
      };

      this.recordAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check position size alert
   * Alert if single position becomes too large
   */
  checkPositionSizeAlert(
    positions: Position[],
    accountBalance: number,
    maxPositionSize: number = 0.25
  ): RiskAlert[] {
    const alerts: RiskAlert[] = [];

    for (const position of positions) {
      const sizePercent = position.value / accountBalance;

      if (sizePercent > maxPositionSize) {
        const alert: RiskAlert = {
          severity: sizePercent > 0.35 ? "CRITICAL" : "HIGH",
          category: "POSITION_SIZE",
          message: `${position.symbol} position size ${(sizePercent * 100).toFixed(1)}% exceeds ${(maxPositionSize * 100)}% limit`,
          timestamp: new Date(),
          actionRequired: true,
          suggestedAction: `Reduce ${position.symbol} position to stay within risk limits`,
          relatedPositions: [position.symbol],
        };

        this.recordAlert(alert);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  /**
   * Check liquidity alert
   * Alert if position is too large relative to daily volume
   */
  checkLiquidityAlert(
    symbol: string,
    positionSize: number,
    averageDailyVolume: number
  ): RiskAlert | null {
    const volumeRatio = positionSize / averageDailyVolume;

    if (volumeRatio > 0.10) {
      const alert: RiskAlert = {
        severity: volumeRatio > 0.20 ? "CRITICAL" : "HIGH",
        category: "LIQUIDITY",
        message: `${symbol} position is ${(volumeRatio * 100).toFixed(1)}% of daily volume (limit: 10%)`,
        timestamp: new Date(),
        actionRequired: true,
        suggestedAction: `Reduce ${symbol} position size - may be difficult to exit quickly`,
        relatedPositions: [symbol],
      };

      this.recordAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(hours: number = 24): RiskAlert[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.alertHistory.filter((alert) => alert.timestamp > cutoffTime);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: RiskAlert["severity"]): RiskAlert[] {
    return this.alertHistory.filter((alert) => alert.severity === severity);
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Record alert to history
   */
  private recordAlert(alert: RiskAlert): void {
    this.alertHistory.push(alert);

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    // Log to console if enabled
    if (this.config.consoleEnabled) {
      this.logAlertToConsole(alert);
    }
  }

  /**
   * Log alert to console
   */
  private logAlertToConsole(alert: RiskAlert): void {
    const severityEmoji = {
      CRITICAL: "🚨",
      HIGH: "⚠️",
      MEDIUM: "⚡",
      LOW: "ℹ️",
    };

    console.log(
      `${severityEmoji[alert.severity]} [${alert.severity}] ${alert.category}: ${alert.message}`
    );
    if (alert.suggestedAction) {
      console.log(`   → ${alert.suggestedAction}`);
    }
  }

  /**
   * Calculate sector exposure
   */
  private calculateSectorExposure(
    positions: Position[],
    accountBalance: number
  ): Record<string, number> {
    const sectorExposure: Record<string, number> = {};

    for (const pos of positions) {
      const sector = pos.sector || this.inferSector(pos.symbol);
      sectorExposure[sector] = (sectorExposure[sector] || 0) + pos.value / accountBalance;
    }

    return sectorExposure;
  }

  /**
   * Infer sector from symbol
   */
  private inferSector(symbol: string): string {
    const sectorMapping: Record<string, string> = {
      AAPL: "TECH",
      MSFT: "TECH",
      GOOGL: "TECH",
      AMZN: "TECH",
      META: "TECH",
      JPM: "FINANCE",
      BAC: "FINANCE",
      WFC: "FINANCE",
      GS: "FINANCE",
      JNJ: "HEALTHCARE",
      PFE: "HEALTHCARE",
      UNH: "HEALTHCARE",
      XOM: "ENERGY",
      CVX: "ENERGY",
      COP: "ENERGY",
    };

    return sectorMapping[symbol] || "OTHER";
  }
}
