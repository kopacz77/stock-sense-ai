/**
 * Enhanced Risk Management Types
 * Stock Sense AI - Institutional-Grade Risk Management
 */

import type { Position } from "../../types/trading.js";

// ============================================================================
// Value at Risk (VaR) Types
// ============================================================================

export type VaRMethod = "historical" | "parametric" | "monte-carlo";

export interface VaRCalculationOptions {
  method: VaRMethod;
  confidenceLevel: number; // 0.95, 0.99
  timeHorizon: number; // days
  lookbackPeriod?: number; // days for historical data
}

export interface VaRResult {
  oneDayVaR95: number;
  oneDayVaR99: number;
  tenDayVaR95: number;
  tenDayVaR99: number;
  method: VaRMethod;
  calculationDate: Date;
  portfolioValue: number;
  interpretation: string;
}

// ============================================================================
// Conditional VaR (CVaR / Expected Shortfall) Types
// ============================================================================

export interface CVaRResult {
  cvar95: number; // Average loss beyond 95% VaR
  cvar99: number; // Average loss beyond 99% VaR
  tailRiskRatio: number; // CVaR / VaR (higher = fatter tails)
  expectedShortfall: number;
  interpretation: string;
}

// ============================================================================
// Correlation Matrix Types
// ============================================================================

export interface CorrelationMatrix {
  matrix: Map<string, Map<string, number>>; // symbol -> symbol -> correlation
  lastUpdated: Date;
  dataPoints: number;
  avgCorrelation: number;
  highlyCorrelated: Array<{ symbol1: string; symbol2: string; correlation: number }>;
}

export interface CorrelationAnalysis {
  matrix: CorrelationMatrix;
  portfolioCorrelation: number; // Average correlation of portfolio
  diversificationRatio: number; // 1 = no diversification, higher = better
  clusterAnalysis: CorrelationCluster[];
}

export interface CorrelationCluster {
  symbols: string[];
  avgCorrelation: number;
  riskContribution: number;
}

// ============================================================================
// Kelly Criterion Types
// ============================================================================

export interface KellyCalculation {
  optimalPositionSize: number; // Full Kelly
  conservativePositionSize: number; // Fractional Kelly
  kellyPercentage: number; // Kelly %
  fractionUsed: number; // Fraction of Kelly (0.25, 0.5, 1.0)
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectedValue: number;
  riskOfRuin: number; // Probability of losing all capital
  recommendation: "FULL_KELLY" | "HALF_KELLY" | "QUARTER_KELLY" | "TOO_RISKY";
}

// ============================================================================
// Monte Carlo Simulation Types
// ============================================================================

export interface MonteCarloConfig {
  simulations: number; // 10,000+
  timeHorizon: number; // days
  confidenceLevel: number; // 95%
  includeCorrelations: boolean;
  volatilityShocks: boolean; // Simulate market crashes
}

export interface MonteCarloResult {
  scenarios: PortfolioScenario[];
  statistics: {
    expectedReturn: number;
    expectedReturnPercent: number;
    medianReturn: number;
    worstCase5th: number; // 5th percentile
    bestCase95th: number; // 95th percentile
    probabilityOfProfit: number;
    probabilityOfLoss: number;
    probabilityOfLoss10Percent: number;
    probabilityOfLoss20Percent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
  };
  distribution: {
    bins: number[];
    frequencies: number[];
  };
  calculationTime: number; // milliseconds
}

export interface PortfolioScenario {
  scenarioId: number;
  finalValue: number;
  returnPercent: number;
  maxDrawdown: number;
  path: number[]; // Daily portfolio values
}

// ============================================================================
// Stress Testing Types
// ============================================================================

export interface StressTest {
  name: string;
  description: string;
  marketShock: number; // % market decline
  volatilityIncrease: number; // multiplier
  correlationIncrease: number; // all correlations -> 1
  sectorShocks: Map<string, number>; // sector-specific shocks
}

export interface StressTestResult {
  testName: string;
  portfolioImpact: {
    initialValue: number;
    stressedValue: number;
    loss: number;
    lossPercent: number;
    survivable: boolean; // Above minimum capital
  };
  positionImpacts: Array<{
    symbol: string;
    initialValue: number;
    stressedValue: number;
    lossPercent: number;
  }>;
  riskMetrics: {
    stressedVaR: number;
    stressedCVaR: number;
    stressedSharpe: number;
  };
  recommendations: string[];
}

// ============================================================================
// Pre-Trade Validation Types
// ============================================================================

export interface PreTradeCheck {
  passed: boolean;
  blockers: string[]; // Hard failures (trade rejected)
  warnings: string[]; // Soft warnings (trade allowed)
  riskImpact: {
    currentRisk: number;
    newRisk: number;
    riskIncrease: number;
    riskLimit: number;
    utilizationPercent: number;
  };
  positionImpact: {
    currentPositions: number;
    newPositions: number;
    positionLimit: number;
  };
  concentrationImpact: {
    currentSectorExposure: Map<string, number>;
    newSectorExposure: Map<string, number>;
    sectorLimit: number;
    wouldExceedLimit: boolean;
  };
  correlationImpact: {
    currentCorrelation: number;
    newCorrelation: number;
    correlatedPositions: number;
    correlationLimit: number;
  };
  liquidityCheck: {
    averageDailyVolume: number;
    proposedShares: number;
    volumeRatio: number; // Should be < 0.10 (10% of daily volume)
    liquidityRating: "HIGH" | "MEDIUM" | "LOW";
  };
  recommendation: "APPROVE" | "REDUCE_SIZE" | "REJECT";
}

// ============================================================================
// Risk-Adjusted Performance Metrics Types
// ============================================================================

export interface SharpeRatioResult {
  sharpeRatio: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  riskFreeRate: number;
  interpretation: string; // "Excellent" | "Good" | "Fair" | "Poor"
}

export interface SortinoRatioResult {
  sortinoRatio: number;
  downsideDeviation: number;
  targetReturn: number;
  interpretation: string;
}

export interface CalmarRatioResult {
  calmarRatio: number;
  annualizedReturn: number;
  maxDrawdown: number;
  interpretation: string;
}

export interface InformationRatioResult {
  informationRatio: number;
  activeReturn: number; // Portfolio return - Benchmark return
  trackingError: number; // Volatility of active return
  interpretation: string;
}

export interface MaxDrawdownResult {
  maxDrawdown: number; // Maximum peak-to-trough decline
  maxDrawdownPercent: number;
  drawdownStart: Date;
  drawdownBottom: Date;
  drawdownRecovery: Date | null; // null if not recovered
  durationDays: number;
  currentDrawdown: number;
  currentDrawdownPercent: number;
}

// ============================================================================
// Risk Reporting Types
// ============================================================================

export interface DailyRiskReport {
  date: Date;
  portfolio: {
    totalValue: number;
    dayChange: number;
    dayChangePercent: number;
    positions: number;
  };
  riskMetrics: {
    totalRisk: number;
    totalRiskPercent: number;
    var95: number;
    cvar95: number;
    sharpeRatio: number;
    maxDrawdown: number;
    currentDrawdown: number;
  };
  exposures: {
    sectorExposure: Map<string, number>;
    topConcentrations: Array<{ symbol: string; percent: number }>;
  };
  correlations: {
    avgCorrelation: number;
    diversificationRatio: number;
    highlyCorrelatedPairs: Array<{
      symbol1: string;
      symbol2: string;
      correlation: number;
    }>;
  };
  alerts: RiskAlert[];
  recommendations: string[];
}

export interface WeeklyRiskReport extends DailyRiskReport {
  weekSummary: {
    weekReturn: number;
    weekReturnPercent: number;
    weekVolatility: number;
    bestDay: { date: Date; return: number };
    worstDay: { date: Date; return: number };
    tradesExecuted: number;
    winRate: number;
  };
  performanceMetrics: {
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    informationRatio: number;
  };
  stressTestResults: StressTestResult[];
  monteCarloProjection: {
    oneWeekProjection: MonteCarloResult;
    fourWeekProjection: MonteCarloResult;
  };
}

export interface RiskAlert {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category:
    | "CONCENTRATION"
    | "CORRELATION"
    | "DRAWDOWN"
    | "VAR_BREACH"
    | "POSITION_SIZE"
    | "LIQUIDITY"
    | "KELLY_CHANGE";
  message: string;
  timestamp: Date;
  actionRequired: boolean;
  suggestedAction?: string;
  relatedPositions?: string[];
}

// ============================================================================
// Historical Data Types
// ============================================================================

export interface HistoricalDataPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  returns?: number; // Daily return
  logReturns?: number; // Log return
}

export interface ReturnsMatrix {
  symbols: string[];
  returns: Map<string, number[]>; // symbol -> array of returns
  dates: Date[];
  period: number; // number of days
}

// ============================================================================
// Position Sizing Types
// ============================================================================

export interface PositionSizingResult {
  method: "FIXED_RISK" | "KELLY" | "VOLATILITY" | "EQUAL_WEIGHT";
  positionSize: number; // number of shares
  positionValue: number; // dollar value
  percentOfPortfolio: number;
  reasoning: string[];
  riskAmount: number;
}

// ============================================================================
// Portfolio Risk Analytics Types
// ============================================================================

export interface PortfolioRiskAnalytics {
  var: VaRResult;
  cvar: CVaRResult;
  correlation: CorrelationAnalysis;
  sharpe: SharpeRatioResult;
  sortino: SortinoRatioResult;
  calmar: CalmarRatioResult;
  maxDrawdown: MaxDrawdownResult;
  stressTests: StressTestResult[];
  monteCarloProjection: MonteCarloResult;
}
