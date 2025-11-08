import type { PortfolioMetrics, Position, RiskParameters, Signal } from "../types/trading.js";

export interface RiskCalculationParams {
  symbol: string;
  entryPrice: number;
  signal: Signal;
  accountBalance: number;
  currentPositions?: Position[];
  atr?: number;
}

export interface RiskCalculationResult {
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskPercentage: number;
  positionValue: number;
  isValid: boolean;
  warnings: string[];
}

export interface PortfolioRiskAssessment {
  valid: boolean;
  totalRisk: number;
  riskPercentage: number;
  warnings: string[];
  recommendations: string[];
  correlationRisk: number;
  sectorConcentration: Record<string, number>;
  maxDrawdownRisk: number;
}

export class RiskManager {
  private readonly DEFAULT_RISK_PARAMS: RiskParameters = {
    maxRiskPerTrade: 0.01, // 1% max risk per trade
    maxPositionSize: 0.25, // 25% max position size
    stopLossMultiplier: 2.0, // 2x ATR for stop loss
    takeProfitRatio: 2.0, // 2:1 reward/risk ratio
    maxCorrelatedPositions: 3,
    maxSectorExposure: 0.3, // 30% max sector exposure
  };

  private riskParams: RiskParameters;

  constructor(riskParams: Partial<RiskParameters> = {}) {
    this.riskParams = { ...this.DEFAULT_RISK_PARAMS, ...riskParams };
  }

  async calculatePosition(params: RiskCalculationParams): Promise<RiskCalculationResult> {
    const { symbol, entryPrice, signal, accountBalance, currentPositions = [], atr } = params;

    const warnings: string[] = [];
    let isValid = true;

    // Calculate ATR if not provided
    const averageTrueRange = atr || (await this.estimateATR(symbol, entryPrice));

    // Calculate stop loss based on ATR and signal direction
    if (signal.action === "HOLD") {
      throw new Error("Cannot calculate position for HOLD signal");
    }
    const stopLoss = this.calculateStopLoss(entryPrice, signal.action, averageTrueRange);

    // Calculate risk per share
    const riskPerShare = Math.abs(entryPrice - stopLoss);

    // Calculate maximum risk amount
    const maxRiskAmount = accountBalance * this.riskParams.maxRiskPerTrade;

    // Calculate position size based on risk
    let positionSize = Math.floor(maxRiskAmount / riskPerShare);

    // Check maximum position size constraint
    const maxPositionValue = accountBalance * this.riskParams.maxPositionSize;
    const proposedPositionValue = positionSize * entryPrice;

    if (proposedPositionValue > maxPositionValue) {
      positionSize = Math.floor(maxPositionValue / entryPrice);
      warnings.push(
        `Position size reduced due to maximum position size limit (${(this.riskParams.maxPositionSize * 100).toFixed(0)}%)`,
      );
    }

    // Calculate actual risk after position size adjustments
    const actualRiskAmount = positionSize * riskPerShare;
    const actualRiskPercentage = actualRiskAmount / accountBalance;

    // Calculate take profit
    const takeProfit = this.calculateTakeProfit(entryPrice, signal.action, riskPerShare);

    // Portfolio-level risk checks
    const portfolioRisk = this.assessPortfolioRisk(currentPositions, accountBalance);
    if (portfolioRisk.riskPercentage > 0.06) {
      // 6% total portfolio risk threshold
      warnings.push(`High portfolio risk: ${(portfolioRisk.riskPercentage * 100).toFixed(1)}%`);
    }

    // Correlation risk check
    const correlatedPositions = this.checkCorrelationRisk(symbol, currentPositions);
    if (correlatedPositions.length >= this.riskParams.maxCorrelatedPositions) {
      warnings.push(`High correlation risk: ${correlatedPositions.length} correlated positions`);
      isValid = false;
    }

    // Sector concentration check
    const sectorExposure = this.calculateSectorExposure(symbol, currentPositions, accountBalance);
    if (sectorExposure.newExposure > this.riskParams.maxSectorExposure) {
      warnings.push(
        `Sector concentration risk: ${(sectorExposure.newExposure * 100).toFixed(1)}% in ${sectorExposure.sector}`,
      );
      isValid = false;
    }

    // Minimum position size check
    if (positionSize < 1) {
      warnings.push("Position size too small - insufficient capital for this trade");
      isValid = false;
    }

    // Risk/reward ratio validation
    const riskRewardRatio = Math.abs(takeProfit - entryPrice) / riskPerShare;
    if (riskRewardRatio < this.riskParams.takeProfitRatio) {
      warnings.push(
        `Poor risk/reward ratio: ${riskRewardRatio.toFixed(2)}:1 (minimum ${this.riskParams.takeProfitRatio}:1)`,
      );
    }

    return {
      positionSize,
      stopLoss: Number(stopLoss.toFixed(2)),
      takeProfit: Number(takeProfit.toFixed(2)),
      riskAmount: Number(actualRiskAmount.toFixed(2)),
      riskPercentage: Number(actualRiskPercentage.toFixed(4)),
      positionValue: Number((positionSize * entryPrice).toFixed(2)),
      isValid,
      warnings,
    };
  }

  private calculateStopLoss(entryPrice: number, action: "BUY" | "SELL", atr: number): number {
    const stopDistance = atr * this.riskParams.stopLossMultiplier;

    if (action === "BUY") {
      return entryPrice - stopDistance;
    } else {
      return entryPrice + stopDistance;
    }
  }

  private calculateTakeProfit(
    entryPrice: number,
    action: "BUY" | "SELL",
    riskPerShare: number,
  ): number {
    const profitDistance = riskPerShare * this.riskParams.takeProfitRatio;

    if (action === "BUY") {
      return entryPrice + profitDistance;
    } else {
      return entryPrice - profitDistance;
    }
  }

  private async estimateATR(symbol: string, currentPrice: number): Promise<number> {
    // Simplified ATR estimation based on price
    // In production, this would use historical data
    return currentPrice * 0.02; // Assume 2% of price as ATR
  }

  validatePortfolioRisk(positions: Position[], accountBalance: number): PortfolioRiskAssessment {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let totalRisk = 0;

    // Calculate total risk
    positions.forEach((position) => {
      totalRisk += position.riskAmount;
    });

    const riskPercentage = totalRisk / accountBalance;

    // Check correlation risk
    const correlationGroups = this.groupByCorrelation(positions);
    let correlationRisk = 0;
    for (const group of correlationGroups) {
      if (group.length > this.riskParams.maxCorrelatedPositions) {
        correlationRisk += group.length - this.riskParams.maxCorrelatedPositions;
        warnings.push(`High correlation risk: ${group.length} positions in correlated assets`);
      }
    }

    // Check sector concentration
    const sectorExposure = this.calculateSectorExposureFromPositions(positions, accountBalance);
    for (const [sector, exposure] of Object.entries(sectorExposure)) {
      if (exposure > this.riskParams.maxSectorExposure) {
        warnings.push(`Sector concentration: ${(exposure * 100).toFixed(1)}% in ${sector}`);
      }
    }

    // Check total portfolio risk
    if (riskPercentage > 0.06) {
      warnings.push(`Total portfolio risk high: ${(riskPercentage * 100).toFixed(1)}%`);
    }

    // Generate recommendations
    if (correlationRisk > 0) {
      recommendations.push("Diversify holdings to reduce correlation risk");
    }

    if (Object.values(sectorExposure).some((exp) => exp > 0.25)) {
      recommendations.push("Consider sector diversification");
    }

    if (riskPercentage > 0.05) {
      recommendations.push("Reduce position sizes to lower overall portfolio risk");
    }

    if (positions.length < 5) {
      recommendations.push("Consider adding more positions for better diversification");
    }

    // Calculate maximum drawdown risk
    const maxDrawdownRisk = this.estimateMaxDrawdownRisk(positions);

    return {
      valid: warnings.length === 0,
      totalRisk: Number(totalRisk.toFixed(2)),
      riskPercentage: Number(riskPercentage.toFixed(4)),
      warnings,
      recommendations,
      correlationRisk,
      sectorConcentration: sectorExposure,
      maxDrawdownRisk,
    };
  }

  private assessPortfolioRisk(
    positions: Position[],
    accountBalance: number,
  ): { riskPercentage: number } {
    const totalRisk = positions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    return { riskPercentage: totalRisk / accountBalance };
  }

  private checkCorrelationRisk(symbol: string, positions: Position[]): Position[] {
    // Simplified correlation check - in production, use actual correlation data
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

    const symbolSector = sectorMapping[symbol] || "OTHER";
    return positions.filter((pos) => sectorMapping[pos.symbol] === symbolSector);
  }

  private calculateSectorExposure(
    symbol: string,
    positions: Position[],
    accountBalance: number,
  ): { sector: string; currentExposure: number; newExposure: number } {
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

    const sector = sectorMapping[symbol] || "OTHER";
    const currentSectorValue = positions
      .filter((pos) => sectorMapping[pos.symbol] === sector)
      .reduce((sum, pos) => sum + pos.value, 0);

    const currentExposure = currentSectorValue / accountBalance;
    // Assume new position will be ~5% of account (estimated)
    const newExposure = currentExposure + 0.05;

    return { sector, currentExposure, newExposure };
  }

  private calculateSectorExposureFromPositions(
    positions: Position[],
    accountBalance: number,
  ): Record<string, number> {
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

    const sectorExposure: Record<string, number> = {};

    for (const position of positions) {
      const sector = sectorMapping[position.symbol] || "OTHER";
      if (!sectorExposure[sector]) {
        sectorExposure[sector] = 0;
      }
      sectorExposure[sector] += position.value / accountBalance;
    }

    return sectorExposure;
  }

  private groupByCorrelation(positions: Position[]): Position[][] {
    // Simplified grouping by sector - in production, use actual correlation matrix
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

    const groups: Record<string, Position[]> = {};

    for (const position of positions) {
      const sector = sectorMapping[position.symbol] || "OTHER";
      if (!groups[sector]) {
        groups[sector] = [];
      }
      groups[sector].push(position);
    }

    return Object.values(groups);
  }

  private estimateMaxDrawdownRisk(positions: Position[]): number {
    // Estimate potential maximum drawdown based on position volatility
    let totalDrawdownRisk = 0;

    for (const position of positions) {
      // Assume worst-case scenario of 20% drawdown per position
      const positionDrawdownRisk = position.value * 0.2;
      totalDrawdownRisk += positionDrawdownRisk;
    }

    return Number(totalDrawdownRisk.toFixed(2));
  }

  calculatePortfolioMetrics(positions: Position[], accountBalance: number): PortfolioMetrics {
    const totalPositionValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const totalCash = accountBalance - totalPositionValue;
    const unrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalRisk = positions.reduce((sum, pos) => sum + pos.riskAmount, 0);

    return {
      totalValue: accountBalance,
      totalCash,
      totalPositions: positions.length,
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(((unrealizedPnL / accountBalance) * 100).toFixed(2)),
      dayChange: 0, // Would need historical data to calculate
      dayChangePercent: 0,
      totalRisk: Number(totalRisk.toFixed(2)),
      riskPercentage: Number(((totalRisk / accountBalance) * 100).toFixed(2)),
    };
  }

  updateRiskParameters(newParams: Partial<RiskParameters>): void {
    this.riskParams = { ...this.riskParams, ...newParams };
  }

  getRiskParameters(): RiskParameters {
    return { ...this.riskParams };
  }

  // Emergency risk controls
  shouldHaltTrading(portfolioMetrics: PortfolioMetrics): { halt: boolean; reason?: string } {
    // Halt trading if portfolio risk exceeds 10%
    if (portfolioMetrics.riskPercentage > 10) {
      return { halt: true, reason: "Portfolio risk exceeds 10% threshold" };
    }

    // Halt trading if unrealized losses exceed 15%
    if (portfolioMetrics.unrealizedPnLPercent < -15) {
      return { halt: true, reason: "Unrealized losses exceed 15% threshold" };
    }

    // Halt trading if day change exceeds 5%
    if (Math.abs(portfolioMetrics.dayChangePercent) > 5) {
      return { halt: true, reason: "Daily portfolio change exceeds 5% threshold" };
    }

    return { halt: false };
  }
}
