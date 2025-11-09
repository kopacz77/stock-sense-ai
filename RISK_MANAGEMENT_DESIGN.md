# Risk Management Enhancement Design
## Stock Sense AI - Institutional-Grade Risk Management

**Version:** 2.0
**Date:** November 8, 2025
**Status:** Design Document
**Priority:** High - Competitive Advantage Feature

---

## Executive Summary

This document outlines the enhancement of Stock Sense AI's risk management system from its current competitive advantage baseline to institutional-grade portfolio risk management. The goal is to maintain our edge over competitors (as identified in BENCHMARK_ANALYSIS.md) while adding sophisticated features required for paper trading and professional portfolio management.

### Current Strengths (Already Better Than Most Competitors)
- 1% risk rule with position sizing
- ATR-based stop losses (2x ATR)
- Portfolio correlation analysis
- Sector concentration limits (30% max)
- Risk/reward ratio enforcement (2:1 minimum)
- Emergency halt trading conditions

### Enhancement Goals
- Portfolio-level Value at Risk (VaR) calculations
- Expected Shortfall / Conditional VaR (CVaR)
- Real correlation matrices (not sector-based approximations)
- Kelly Criterion for optimal position sizing
- Monte Carlo simulation for risk scenarios
- Stress testing capabilities
- Risk-adjusted performance metrics (Sharpe, Sortino, Calmar)
- Pre-trade risk checks for paper trading
- Daily/weekly risk reports

---

## Architecture Overview

### Enhanced Class Structure

```
RiskManager (Enhanced)
├── Position Risk Management
│   ├── calculatePosition() [EXISTING - Enhanced]
│   ├── calculateKellyPosition() [NEW]
│   └── optimizePositionSize() [NEW]
│
├── Portfolio Risk Analytics
│   ├── calculateVaR() [NEW]
│   ├── calculateCVaR() [NEW]
│   ├── calculateCorrelationMatrix() [NEW]
│   ├── assessPortfolioRisk() [ENHANCED]
│   └── estimateMaxDrawdown() [ENHANCED]
│
├── Risk-Adjusted Performance
│   ├── calculateSharpeRatio() [NEW]
│   ├── calculateSortinoRatio() [NEW]
│   ├── calculateCalmarRatio() [NEW]
│   ├── calculateInformationRatio() [NEW]
│   └── calculatePortfolioMetrics() [ENHANCED]
│
├── Advanced Risk Models
│   ├── runMonteCarloSimulation() [NEW]
│   ├── performStressTesting() [NEW]
│   ├── calculateBeta() [NEW]
│   └── calculateMaximumDrawdown() [NEW]
│
├── Pre-Trade Risk Checks
│   ├── validateTrade() [NEW]
│   ├── checkPositionLimits() [NEW]
│   ├── checkConcentrationRisk() [NEW]
│   └── checkLiquidityRisk() [NEW]
│
└── Risk Reporting
    ├── generateDailyRiskReport() [NEW]
    ├── generateWeeklyRiskReport() [NEW]
    ├── exportRiskMetrics() [NEW]
    └── getRiskAlerts() [NEW]
```

---

## Detailed Feature Specifications

### 1. Portfolio Value at Risk (VaR)

**Purpose:** Estimate the maximum potential loss over a given time period with a specified confidence level.

**Methods:**
- **Historical VaR:** Uses actual historical returns
- **Parametric VaR:** Assumes normal distribution
- **Monte Carlo VaR:** Simulates thousands of scenarios

**Implementation:**

```typescript
interface VaRCalculation {
  method: 'historical' | 'parametric' | 'monte-carlo';
  confidenceLevel: number; // 95%, 99%
  timeHorizon: number; // days
  portfolioValue: number;
  var: number; // Maximum loss at confidence level
  varPercentage: number; // VaR as % of portfolio
}

interface VaRResult {
  oneDayVaR95: number;
  oneDayVaR99: number;
  tenDayVaR95: number;
  tenDayVaR99: number;
  method: string;
  calculationDate: Date;
  portfolioValue: number;
  interpretation: string;
}

async calculateVaR(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  options: VaRCalculationOptions
): Promise<VaRResult>
```

**Algorithm (Historical VaR):**
1. Calculate portfolio returns for past N days
2. Sort returns from worst to best
3. Find the return at the desired percentile (5th for 95% confidence)
4. VaR = Portfolio Value × |Return at percentile|

**Algorithm (Parametric VaR):**
1. Calculate mean and standard deviation of portfolio returns
2. VaR = Portfolio Value × Z-score × σ × √(time horizon)
3. Z-score: 1.645 for 95%, 2.326 for 99%

**Algorithm (Monte Carlo VaR):**
1. Generate 10,000+ scenarios using historical volatility
2. Calculate portfolio value in each scenario
3. Determine 5th percentile of outcomes for 95% VaR

---

### 2. Conditional Value at Risk (CVaR / Expected Shortfall)

**Purpose:** Estimate the average loss when VaR threshold is exceeded (tail risk).

**Why It Matters:** VaR only tells you the threshold; CVaR tells you how bad it could get beyond that.

**Implementation:**

```typescript
interface CVaRResult {
  cvar95: number; // Average loss beyond 95% VaR
  cvar99: number; // Average loss beyond 99% VaR
  tailRiskRatio: number; // CVaR / VaR (higher = fatter tails)
  expectedShortfall: number;
  interpretation: string;
}

async calculateCVaR(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  confidenceLevel: number
): Promise<CVaRResult>
```

**Algorithm:**
1. Calculate VaR at specified confidence level
2. Find all returns worse than VaR threshold
3. CVaR = Average of those tail returns
4. Tail Risk Ratio = CVaR / VaR (higher = more dangerous)

---

### 3. Real Correlation Matrix

**Purpose:** Calculate actual correlation between assets using historical returns (not sector approximations).

**Current Issue:** Current implementation uses sector mapping as proxy for correlation. This is insufficient for real risk management.

**Implementation:**

```typescript
interface CorrelationMatrix {
  matrix: Map<string, Map<string, number>>; // symbol -> symbol -> correlation
  lastUpdated: Date;
  dataPoints: number;
  avgCorrelation: number;
  highlyCorrelated: Array<{symbol1: string; symbol2: string; correlation: number}>;
}

interface CorrelationAnalysis {
  matrix: CorrelationMatrix;
  portfolioCorrelation: number; // Average correlation of portfolio
  diversificationRatio: number; // 1 = no diversification, higher = better
  clusterAnalysis: CorrelationCluster[];
}

interface CorrelationCluster {
  symbols: string[];
  avgCorrelation: number;
  riskContribution: number;
}

async calculateCorrelationMatrix(
  positions: Position[],
  historicalReturns: Map<string, number[]>,
  lookbackPeriod: number = 90
): Promise<CorrelationMatrix>
```

**Algorithm (Pearson Correlation):**
1. For each pair of assets (i, j):
2. Calculate returns: r_i = (P_t - P_{t-1}) / P_{t-1}
3. Correlation = Cov(r_i, r_j) / (σ_i × σ_j)
4. Store in symmetric matrix

**Diversification Ratio:**
```
DR = (Σ w_i × σ_i) / σ_portfolio

Where:
- w_i = weight of asset i
- σ_i = volatility of asset i
- σ_portfolio = portfolio volatility (accounts for correlations)
- Higher DR = better diversification
```

---

### 4. Kelly Criterion Position Sizing

**Purpose:** Optimize position size to maximize long-term growth while managing risk.

**Formula:**
```
Kelly % = (Win Rate × Avg Win - Loss Rate × Avg Loss) / Avg Win

Conservative Kelly = Kelly % / 2  // Half-Kelly for safety
```

**Implementation:**

```typescript
interface KellyCalculation {
  optimalPositionSize: number; // Full Kelly
  conservativePositionSize: number; // Half Kelly
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectedValue: number;
  riskOfRuin: number; // Probability of losing all capital
  recommendation: 'FULL_KELLY' | 'HALF_KELLY' | 'QUARTER_KELLY' | 'TOO_RISKY';
}

calculateKellyPosition(
  strategy: string,
  accountBalance: number,
  historicalPerformance: StrategyPerformance
): KellyCalculation
```

**Risk of Ruin Calculation:**
```
RoR = ((1 - Win Rate) / (1 + Win Rate))^(Capital / Avg Position Size)
```

**Safety Features:**
- Never exceed 25% of capital (hard limit)
- Use Half-Kelly by default (more conservative)
- Require minimum 30 trades for reliable calculation
- Flag if Kelly > 20% (strategy may be overfitted)

---

### 5. Monte Carlo Simulation

**Purpose:** Simulate thousands of possible portfolio outcomes to understand risk distribution.

**Use Cases:**
- Stress testing new positions
- Portfolio rebalancing decisions
- Risk scenario analysis
- Drawdown probability estimation

**Implementation:**

```typescript
interface MonteCarloConfig {
  simulations: number; // 10,000+
  timeHorizon: number; // days
  confidenceLevel: number; // 95%
  includeCorrelations: boolean;
  volatilityShocks: boolean; // Simulate market crashes
}

interface MonteCarloResult {
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
}

interface PortfolioScenario {
  scenarioId: number;
  finalValue: number;
  returnPercent: number;
  maxDrawdown: number;
  path: number[]; // Daily portfolio values
}

async runMonteCarloSimulation(
  positions: Position[],
  accountBalance: number,
  config: MonteCarloConfig
): Promise<MonteCarloResult>
```

**Algorithm:**
1. Calculate historical volatility and correlations for each asset
2. Generate correlated random returns using Cholesky decomposition
3. For each simulation:
   - Start with current portfolio
   - Simulate daily returns for each asset
   - Track portfolio value over time
   - Record final value and max drawdown
4. Aggregate results into statistics

**Volatility Shock Scenarios:**
- Normal market: Use historical volatility
- Stressed market: 2x historical volatility
- Crash scenario: 3x volatility + negative drift

---

### 6. Stress Testing

**Purpose:** Test portfolio resilience under extreme market conditions.

**Scenarios:**
- 2008 Financial Crisis
- 2020 COVID Crash
- Black Monday 1987
- Custom scenarios

**Implementation:**

```typescript
interface StressTest {
  name: string;
  description: string;
  marketShock: number; // % market decline
  volatilityIncrease: number; // multiplier
  correlationIncrease: number; // all correlations -> 1
  sectorShocks: Map<string, number>; // sector-specific shocks
}

interface StressTestResult {
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

async performStressTest(
  positions: Position[],
  accountBalance: number,
  scenario: StressTest
): Promise<StressTestResult>
```

**Predefined Scenarios:**

```typescript
const STRESS_SCENARIOS: Record<string, StressTest> = {
  FINANCIAL_CRISIS_2008: {
    name: '2008 Financial Crisis',
    marketShock: -0.38, // -38% market
    volatilityIncrease: 3.0,
    correlationIncrease: 0.85, // Most stocks moved together
    sectorShocks: new Map([
      ['FINANCE', -0.55],
      ['ENERGY', -0.42],
      ['TECH', -0.30]
    ])
  },
  COVID_CRASH_2020: {
    name: 'COVID-19 Crash',
    marketShock: -0.34,
    volatilityIncrease: 2.5,
    correlationIncrease: 0.90,
    sectorShocks: new Map([
      ['TRAVEL', -0.70],
      ['ENERGY', -0.50],
      ['TECH', -0.15] // Tech held up better
    ])
  },
  BLACK_MONDAY_1987: {
    name: 'Black Monday 1987',
    marketShock: -0.22, // -22% in one day
    volatilityIncrease: 5.0,
    correlationIncrease: 0.95,
    sectorShocks: new Map()
  },
  MODERATE_CORRECTION: {
    name: 'Moderate Market Correction',
    marketShock: -0.10,
    volatilityIncrease: 1.5,
    correlationIncrease: 0.60,
    sectorShocks: new Map()
  },
  SECTOR_ROTATION: {
    name: 'Sector Rotation Shock',
    marketShock: 0,
    volatilityIncrease: 1.2,
    correlationIncrease: 0.30,
    sectorShocks: new Map([
      ['TECH', -0.15],
      ['ENERGY', 0.20],
      ['FINANCE', 0.10]
    ])
  }
};
```

---

### 7. Risk-Adjusted Performance Metrics

**Purpose:** Measure returns relative to risk taken.

#### 7.1 Sharpe Ratio

```typescript
interface SharpeRatioResult {
  sharpeRatio: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  riskFreeRate: number;
  interpretation: string; // "Excellent" | "Good" | "Fair" | "Poor"
}

calculateSharpeRatio(
  portfolioReturns: number[],
  riskFreeRate: number = 0.04 // 4% T-bill rate
): SharpeRatioResult
```

**Formula:**
```
Sharpe Ratio = (R_p - R_f) / σ_p

Where:
- R_p = Portfolio return (annualized)
- R_f = Risk-free rate (annualized)
- σ_p = Portfolio volatility (annualized)

Interpretation:
> 3.0: Excellent
> 2.0: Very Good
> 1.0: Good
> 0.5: Fair
< 0.5: Poor
```

#### 7.2 Sortino Ratio

**Purpose:** Like Sharpe, but only penalizes downside volatility.

```typescript
interface SortinoRatioResult {
  sortinoRatio: number;
  downsideDeviation: number;
  targetReturn: number;
  interpretation: string;
}

calculateSortinoRatio(
  portfolioReturns: number[],
  targetReturn: number = 0, // MAR (Minimum Acceptable Return)
  riskFreeRate: number = 0.04
): SortinoRatioResult
```

**Formula:**
```
Sortino Ratio = (R_p - R_f) / σ_downside

Where:
- σ_downside = Standard deviation of negative returns only
- Better than Sharpe for skewed return distributions
```

#### 7.3 Calmar Ratio

**Purpose:** Return per unit of maximum drawdown.

```typescript
interface CalmarRatioResult {
  calmarRatio: number;
  annualizedReturn: number;
  maxDrawdown: number;
  interpretation: string;
}

calculateCalmarRatio(
  portfolioReturns: number[],
  portfolioValues: number[]
): CalmarRatioResult
```

**Formula:**
```
Calmar Ratio = Annualized Return / Maximum Drawdown

Interpretation:
> 3.0: Excellent
> 2.0: Good
> 1.0: Acceptable
< 1.0: Poor (too much drawdown for return)
```

#### 7.4 Information Ratio

**Purpose:** Risk-adjusted return relative to a benchmark (S&P 500).

```typescript
interface InformationRatioResult {
  informationRatio: number;
  activeReturn: number; // Portfolio return - Benchmark return
  trackingError: number; // Volatility of active return
  interpretation: string;
}

calculateInformationRatio(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): InformationRatioResult
```

**Formula:**
```
Information Ratio = (R_p - R_b) / σ_(R_p - R_b)

Where:
- R_b = Benchmark return
- σ_(R_p - R_b) = Tracking error

Interpretation:
> 0.5: Good active management
> 1.0: Excellent
< 0: Underperforming benchmark
```

#### 7.5 Maximum Drawdown

```typescript
interface MaxDrawdownResult {
  maxDrawdown: number; // Maximum peak-to-trough decline
  maxDrawdownPercent: number;
  drawdownStart: Date;
  drawdownBottom: Date;
  drawdownRecovery: Date | null; // null if not recovered
  durationDays: number;
  currentDrawdown: number;
  currentDrawdownPercent: number;
}

calculateMaximumDrawdown(
  portfolioValues: Array<{date: Date; value: number}>
): MaxDrawdownResult
```

**Algorithm:**
1. Track running maximum (peak)
2. For each point, calculate drawdown = (current - peak) / peak
3. Record worst drawdown and its dates
4. Track recovery date when value exceeds previous peak

---

### 8. Pre-Trade Risk Checks for Paper Trading

**Purpose:** Validate trades before execution to prevent risk limit breaches.

```typescript
interface PreTradeCheck {
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
    liquidityRating: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  recommendation: 'APPROVE' | 'REDUCE_SIZE' | 'REJECT';
}

async validateTrade(
  signal: Signal,
  currentPositions: Position[],
  accountBalance: number,
  marketData: MarketDataService
): Promise<PreTradeCheck>
```

**Validation Rules:**

1. **Position Size Limit**
   - Max 25% of portfolio in single position
   - Blocker if exceeded

2. **Total Risk Limit**
   - Max 10% total portfolio risk
   - Max 1% risk per trade
   - Blocker if total portfolio risk > 10%
   - Warning if > 6%

3. **Sector Concentration**
   - Max 30% in any sector
   - Blocker if exceeded

4. **Correlation Limit**
   - Max 3 highly correlated positions (r > 0.7)
   - Warning if 3, blocker if > 3

5. **Liquidity Check**
   - Position should be < 10% of average daily volume
   - Warning if 5-10%, blocker if > 10%

6. **Drawdown Check**
   - If current drawdown > 15%, reduce position sizing by 50%
   - If drawdown > 20%, halt new positions

7. **Daily Loss Limit**
   - If daily loss > 3%, halt new positions
   - Emergency circuit breaker

---

### 9. Risk Reports and Alerts

#### 9.1 Daily Risk Report

```typescript
interface DailyRiskReport {
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
    topConcentrations: Array<{symbol: string; percent: number}>;
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

async generateDailyRiskReport(
  positions: Position[],
  accountBalance: number,
  historicalData: Map<string, HistoricalData[]>
): Promise<DailyRiskReport>
```

#### 9.2 Weekly Risk Report

```typescript
interface WeeklyRiskReport extends DailyRiskReport {
  weekSummary: {
    weekReturn: number;
    weekReturnPercent: number;
    weekVolatility: number;
    bestDay: {date: Date; return: number};
    worstDay: {date: Date; return: number};
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
```

#### 9.3 Risk Alerts

```typescript
interface RiskAlert {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'CONCENTRATION' | 'CORRELATION' | 'DRAWDOWN' | 'VAR_BREACH' | 'POSITION_SIZE' | 'LIQUIDITY';
  message: string;
  timestamp: Date;
  actionRequired: boolean;
  suggestedAction?: string;
  relatedPositions?: string[];
}

// Example alerts:
const alerts: RiskAlert[] = [
  {
    severity: 'CRITICAL',
    category: 'DRAWDOWN',
    message: 'Portfolio drawdown exceeded 15% threshold',
    timestamp: new Date(),
    actionRequired: true,
    suggestedAction: 'Consider reducing position sizes or closing losing positions',
    relatedPositions: ['AAPL', 'MSFT']
  },
  {
    severity: 'HIGH',
    category: 'CONCENTRATION',
    message: 'TECH sector exposure at 35% (limit: 30%)',
    timestamp: new Date(),
    actionRequired: true,
    suggestedAction: 'Close or reduce one TECH position',
    relatedPositions: ['AAPL', 'MSFT', 'GOOGL']
  },
  {
    severity: 'MEDIUM',
    category: 'VAR_BREACH',
    message: '1-day VaR breached (actual loss: $1,200, VaR: $1,000)',
    timestamp: new Date(),
    actionRequired: false,
    suggestedAction: 'Monitor closely; VaR breaches should be <5% of days'
  }
];
```

---

## Integration with Paper Trading System

### Paper Trading Architecture

```
PaperTradingEngine
├── Account Management
│   ├── accountBalance: number
│   ├── cash: number
│   ├── positions: Position[]
│   └── tradingHistory: Trade[]
│
├── Order Execution
│   ├── submitOrder(signal, quantity)
│   ├── executeOrder(order) -> uses RiskManager.validateTrade()
│   ├── updatePositions()
│   └── calculatePnL()
│
├── Risk Integration
│   ├── preTradeRiskCheck() -> RiskManager.validateTrade()
│   ├── postTradeRiskUpdate() -> RiskManager.assessPortfolioRisk()
│   ├── dailyRiskReport() -> RiskManager.generateDailyRiskReport()
│   └── emergencyStopCheck() -> RiskManager.shouldHaltTrading()
│
└── Performance Tracking
    ├── trackReturns()
    ├── updateMetrics() -> RiskManager.calculatePortfolioMetrics()
    └── generateReport()
```

### Pre-Trade Integration Flow

```typescript
async function executePaperTrade(signal: Signal): Promise<TradeResult> {
  // 1. Pre-trade risk check
  const riskCheck = await riskManager.validateTrade(
    signal,
    paperTradingEngine.getPositions(),
    paperTradingEngine.getAccountBalance(),
    marketDataService
  );

  // 2. Handle blockers
  if (!riskCheck.passed) {
    return {
      status: 'REJECTED',
      reason: riskCheck.blockers.join(', '),
      riskCheck
    };
  }

  // 3. Log warnings
  if (riskCheck.warnings.length > 0) {
    await alertService.sendAlert({
      type: 'RISK_WARNING',
      message: `Trade warnings for ${signal.symbol}`,
      warnings: riskCheck.warnings,
      priority: 'MEDIUM'
    });
  }

  // 4. Adjust position size if recommended
  let quantity = signal.positionSize;
  if (riskCheck.recommendation === 'REDUCE_SIZE') {
    quantity = Math.floor(quantity * 0.5);
  }

  // 5. Execute trade
  const trade = await paperTradingEngine.submitOrder({
    symbol: signal.symbol,
    action: signal.action,
    quantity,
    orderType: 'MARKET',
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit
  });

  // 6. Post-trade risk assessment
  const updatedRisk = await riskManager.assessPortfolioRisk(
    paperTradingEngine.getPositions(),
    paperTradingEngine.getAccountBalance()
  );

  // 7. Check if emergency stop needed
  const haltCheck = await riskManager.shouldHaltTrading(
    await riskManager.calculatePortfolioMetrics(
      paperTradingEngine.getPositions(),
      paperTradingEngine.getAccountBalance()
    )
  );

  if (haltCheck.halt) {
    await paperTradingEngine.haltTrading(haltCheck.reason);
    await alertService.sendAlert({
      type: 'CRITICAL',
      message: `TRADING HALTED: ${haltCheck.reason}`,
      priority: 'CRITICAL'
    });
  }

  return {
    status: 'EXECUTED',
    trade,
    riskCheck,
    updatedRisk
  };
}
```

### Automatic Stop-Loss Monitoring

```typescript
class StopLossMonitor {
  private checkInterval: NodeJS.Timeout;

  start() {
    // Check every 1 minute during market hours
    this.checkInterval = setInterval(async () => {
      await this.checkStopLosses();
    }, 60000);
  }

  private async checkStopLosses() {
    const positions = paperTradingEngine.getPositions();

    for (const position of positions) {
      const currentPrice = await marketDataService.getCurrentPrice(position.symbol);

      // Check stop loss
      if (position.stopLoss) {
        const shouldTrigger =
          (position.quantity > 0 && currentPrice <= position.stopLoss) || // Long position
          (position.quantity < 0 && currentPrice >= position.stopLoss);   // Short position

        if (shouldTrigger) {
          await this.triggerStopLoss(position, currentPrice);
        }
      }

      // Check take profit
      if (position.takeProfit) {
        const shouldTrigger =
          (position.quantity > 0 && currentPrice >= position.takeProfit) || // Long position
          (position.quantity < 0 && currentPrice <= position.takeProfit);   // Short position

        if (shouldTrigger) {
          await this.triggerTakeProfit(position, currentPrice);
        }
      }

      // Trailing stop (optional enhancement)
      if (position.trailingStop) {
        await this.updateTrailingStop(position, currentPrice);
      }
    }
  }

  private async triggerStopLoss(position: Position, currentPrice: number) {
    console.log(`STOP LOSS TRIGGERED: ${position.symbol} at $${currentPrice}`);

    await paperTradingEngine.submitOrder({
      symbol: position.symbol,
      action: position.quantity > 0 ? 'SELL' : 'BUY',
      quantity: Math.abs(position.quantity),
      orderType: 'MARKET',
      reason: 'STOP_LOSS'
    });

    await alertService.sendAlert({
      type: 'POSITION_UPDATE',
      message: `Stop loss triggered: ${position.symbol}`,
      position,
      price: currentPrice,
      priority: 'HIGH'
    });
  }
}
```

---

## CLI Command Enhancements

### New Risk Management Commands

```bash
# Risk analysis
stock-analyzer risk analyze                    # Current portfolio risk analysis
stock-analyzer risk var                        # VaR calculations
stock-analyzer risk stress                     # Run stress tests
stock-analyzer risk monte-carlo                # Monte Carlo simulation
stock-analyzer risk correlation                # Correlation matrix

# Risk reports
stock-analyzer risk report daily               # Daily risk report
stock-analyzer risk report weekly              # Weekly risk report
stock-analyzer risk export [format]            # Export metrics (json, csv, pdf)

# Risk limits
stock-analyzer risk limits show                # Show current risk limits
stock-analyzer risk limits set                 # Configure risk limits
stock-analyzer risk limits test                # Test trade against limits

# Performance metrics
stock-analyzer performance sharpe              # Sharpe ratio
stock-analyzer performance sortino             # Sortino ratio
stock-analyzer performance calmar              # Calmar ratio
stock-analyzer performance summary             # All metrics
```

### Example Command Outputs

#### `stock-analyzer risk analyze`

```
Portfolio Risk Analysis
=======================

Portfolio Overview:
  Total Value: $105,420.50
  Positions: 8
  Day Change: +$1,245.30 (+1.19%)

Risk Metrics:
  Total Risk: $4,215.20 (4.0% of portfolio) ✓
  1-Day VaR (95%): $2,108.40 (2.0%)
  1-Day VaR (99%): $3,162.60 (3.0%)
  CVaR (95%): $2,845.32 (2.7%)
  Max Drawdown: -$8,234.12 (-7.6%)
  Current Drawdown: -$1,234.00 (-1.2%)

Performance Metrics:
  Sharpe Ratio: 2.34 (Very Good)
  Sortino Ratio: 3.12 (Excellent)
  Calmar Ratio: 1.89 (Good)

Sector Exposure:
  TECHNOLOGY: 28.5% ✓
  HEALTHCARE: 22.0% ✓
  FINANCE: 18.5% ✓
  ENERGY: 15.0% ✓
  CONSUMER: 16.0% ✓

Correlation Analysis:
  Average Correlation: 0.42 (Moderate diversification)
  Diversification Ratio: 1.68 (Good)
  Highly Correlated Pairs:
    • AAPL ↔ MSFT: 0.78
    • JPM ↔ BAC: 0.82

Alerts: None ✓
Status: All risk limits within acceptable ranges
```

#### `stock-analyzer risk stress`

```
Stress Test Results
===================

Test: 2008 Financial Crisis (-38% market crash)
  Portfolio Impact: -$32,450.50 (-30.8%)
  Survivable: Yes ✓
  Position Impacts:
    • JPM: -$5,234.00 (-55%)
    • AAPL: -$3,456.00 (-30%)
    • XOM: -$4,123.00 (-42%)
  Recommendations:
    ⚠ Reduce FINANCE sector exposure
    ⚠ Consider adding uncorrelated assets
    ✓ Current drawdown manageable

Test: COVID-19 Crash (-34% market)
  Portfolio Impact: -$28,123.40 (-26.7%)
  Survivable: Yes ✓

Test: Moderate Correction (-10% market)
  Portfolio Impact: -$9,234.00 (-8.8%)
  Survivable: Yes ✓

Overall Assessment:
  ✓ Portfolio can withstand moderate corrections
  ⚠ Would suffer significant losses in major crisis
  💡 Consider hedging strategies for tail risk
```

#### `stock-analyzer risk monte-carlo`

```
Monte Carlo Simulation Results
==============================

Configuration:
  Simulations: 10,000
  Time Horizon: 30 days
  Confidence Level: 95%

Statistics:
  Expected Return: +$2,450.30 (+2.3%)
  Median Return: +$2,123.00 (+2.0%)

  Best Case (95th percentile): +$8,456.00 (+8.0%)
  Worst Case (5th percentile): -$6,234.00 (-5.9%)

  Probability of Profit: 68.4%
  Probability of Loss > 10%: 4.2%
  Probability of Loss > 20%: 0.8%

  Max Drawdown: -$12,345.00 (-11.7%)

Distribution:
  [-10% to -5%]: ▓▓░░░░░░░░ 8.2%
  [ -5% to  0%]: ▓▓▓▓▓░░░░░ 23.4%
  [  0% to +5%]: ▓▓▓▓▓▓▓▓░░ 36.8%
  [ +5% to +10%]: ▓▓▓▓▓░░░░░ 24.3%
  [+10% to +15%]: ▓▓░░░░░░░░ 6.1%
  [+15% to +20%]: ▓░░░░░░░░░ 1.2%

Interpretation:
  ✓ Positive expected return
  ✓ Low probability of severe loss
  ⚠ Maximum drawdown could reach 11.7%
  💡 Consider position sizing to limit drawdown
```

---

## Implementation Roadmap

### Phase 1: Core Risk Metrics (Week 1-2)
- [ ] Implement VaR calculation (historical, parametric, Monte Carlo)
- [ ] Implement CVaR calculation
- [ ] Implement real correlation matrix using historical returns
- [ ] Implement Maximum Drawdown calculation
- [ ] Add enhanced types to `src/types/trading.ts`

### Phase 2: Performance Metrics (Week 2-3)
- [ ] Implement Sharpe Ratio
- [ ] Implement Sortino Ratio
- [ ] Implement Calmar Ratio
- [ ] Implement Information Ratio
- [ ] Enhance `calculatePortfolioMetrics()` method

### Phase 3: Advanced Models (Week 3-4)
- [ ] Implement Kelly Criterion position sizing
- [ ] Implement Monte Carlo simulation
- [ ] Implement stress testing framework
- [ ] Add predefined stress test scenarios
- [ ] Beta calculation for market exposure

### Phase 4: Pre-Trade Integration (Week 4-5)
- [ ] Build `validateTrade()` comprehensive check
- [ ] Implement liquidity checking
- [ ] Build position limit enforcement
- [ ] Create trade recommendation engine
- [ ] Integration tests for pre-trade checks

### Phase 5: Risk Reports (Week 5-6)
- [ ] Build daily risk report generator
- [ ] Build weekly risk report generator
- [ ] Implement risk alert system
- [ ] Create export functionality (JSON, CSV)
- [ ] Email/Telegram risk report delivery

### Phase 6: CLI Integration (Week 6-7)
- [ ] Add `stock-analyzer risk` command group
- [ ] Add `stock-analyzer performance` command group
- [ ] Create formatted table outputs
- [ ] Add visualization (ASCII charts)
- [ ] Update help documentation

### Phase 7: Paper Trading Integration (Week 7-8)
- [ ] Build PaperTradingEngine class
- [ ] Integrate pre-trade risk checks
- [ ] Implement automatic stop-loss monitoring
- [ ] Build position tracking system
- [ ] Add paper trading CLI commands

### Phase 8: Testing & Documentation (Week 8-9)
- [ ] Unit tests for all risk calculations
- [ ] Integration tests for paper trading
- [ ] Stress test validation
- [ ] Update README with risk management features
- [ ] Create tutorial documentation

### Phase 9: Polish & Optimization (Week 9-10)
- [ ] Performance optimization for Monte Carlo
- [ ] Caching for correlation matrices
- [ ] Historical data management
- [ ] Error handling improvements
- [ ] Production readiness review

---

## Code Examples

### Example 1: Enhanced RiskManager with VaR

```typescript
// src/analysis/enhanced-risk-manager.ts

export class EnhancedRiskManager extends RiskManager {
  /**
   * Calculate Value at Risk using historical method
   */
  async calculateHistoricalVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number = 0.95,
    timeHorizon: number = 1
  ): Promise<VaRResult> {
    const portfolioValues: number[] = [];
    const numDays = historicalReturns.values().next().value.length;

    // Calculate portfolio returns for each day
    for (let day = 0; day < numDays; day++) {
      let portfolioReturn = 0;
      let totalWeight = 0;

      for (const position of positions) {
        const returns = historicalReturns.get(position.symbol);
        if (returns && returns[day] !== undefined) {
          const weight = position.value / totalWeight;
          portfolioReturn += weight * returns[day];
          totalWeight += position.value;
        }
      }

      portfolioValues.push(portfolioReturn);
    }

    // Sort returns and find percentile
    const sortedReturns = [...portfolioValues].sort((a, b) => a - b);
    const percentileIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const varReturn = sortedReturns[percentileIndex];

    const currentValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const var95 = Math.abs(currentValue * varReturn * Math.sqrt(timeHorizon));

    // Calculate VaR for different scenarios
    const oneDayVaR95 = Math.abs(currentValue * sortedReturns[Math.floor(0.05 * sortedReturns.length)]);
    const oneDayVaR99 = Math.abs(currentValue * sortedReturns[Math.floor(0.01 * sortedReturns.length)]);
    const tenDayVaR95 = oneDayVaR95 * Math.sqrt(10);
    const tenDayVaR99 = oneDayVaR99 * Math.sqrt(10);

    return {
      oneDayVaR95: Number(oneDayVaR95.toFixed(2)),
      oneDayVaR99: Number(oneDayVaR99.toFixed(2)),
      tenDayVaR95: Number(tenDayVaR95.toFixed(2)),
      tenDayVaR99: Number(tenDayVaR99.toFixed(2)),
      method: 'historical',
      calculationDate: new Date(),
      portfolioValue: currentValue,
      interpretation: `There is a ${confidenceLevel * 100}% confidence that losses will not exceed $${oneDayVaR95.toFixed(2)} in one day.`
    };
  }

  /**
   * Calculate Conditional VaR (Expected Shortfall)
   */
  async calculateCVaR(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    confidenceLevel: number = 0.95
  ): Promise<CVaRResult> {
    // First get VaR
    const varResult = await this.calculateHistoricalVaR(positions, historicalReturns, confidenceLevel);

    // Calculate portfolio returns
    const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);

    // CVaR is the average of returns worse than VaR threshold
    const varThreshold = varResult.oneDayVaR95 / positions.reduce((sum, p) => sum + p.value, 0);
    const tailReturns = sortedReturns.filter(r => r <= -varThreshold);
    const cvar = Math.abs(tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length);

    const portfolioValue = positions.reduce((sum, pos) => sum + pos.value, 0);
    const cvar95 = cvar * portfolioValue;
    const cvar99 = cvar * portfolioValue * 1.3; // Approximation for 99%

    const tailRiskRatio = cvar95 / varResult.oneDayVaR95;

    return {
      cvar95: Number(cvar95.toFixed(2)),
      cvar99: Number(cvar99.toFixed(2)),
      tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
      expectedShortfall: Number(cvar95.toFixed(2)),
      interpretation: tailRiskRatio > 1.5
        ? 'High tail risk - losses could be significantly worse than VaR suggests'
        : 'Normal tail risk distribution'
    };
  }

  /**
   * Calculate real correlation matrix from historical returns
   */
  async calculateCorrelationMatrix(
    positions: Position[],
    historicalReturns: Map<string, number[]>,
    lookbackPeriod: number = 90
  ): Promise<CorrelationMatrix> {
    const matrix = new Map<string, Map<string, number>>();
    const symbols = positions.map(p => p.symbol);
    let totalCorrelation = 0;
    let pairCount = 0;
    const highlyCorrelated: Array<{symbol1: string; symbol2: string; correlation: number}> = [];

    // Calculate correlation for each pair
    for (let i = 0; i < symbols.length; i++) {
      const symbol1 = symbols[i];
      const returns1 = historicalReturns.get(symbol1)?.slice(-lookbackPeriod);

      if (!returns1) continue;
      if (!matrix.has(symbol1)) {
        matrix.set(symbol1, new Map());
      }

      for (let j = 0; j < symbols.length; j++) {
        const symbol2 = symbols[j];
        const returns2 = historicalReturns.get(symbol2)?.slice(-lookbackPeriod);

        if (!returns2) continue;

        const correlation = this.calculatePearsonCorrelation(returns1, returns2);
        matrix.get(symbol1)!.set(symbol2, correlation);

        if (i < j) { // Only count each pair once
          totalCorrelation += correlation;
          pairCount++;

          if (correlation > 0.7 && i !== j) {
            highlyCorrelated.push({ symbol1, symbol2, correlation });
          }
        }
      }
    }

    return {
      matrix,
      lastUpdated: new Date(),
      dataPoints: lookbackPeriod,
      avgCorrelation: pairCount > 0 ? totalCorrelation / pairCount : 0,
      highlyCorrelated: highlyCorrelated.sort((a, b) => b.correlation - a.correlation)
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate Sharpe Ratio
   */
  calculateSharpeRatio(
    portfolioReturns: number[],
    riskFreeRate: number = 0.04
  ): SharpeRatioResult {
    // Annualize returns (assuming daily returns)
    const avgReturn = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const annualizedReturn = avgReturn * 252; // 252 trading days

    // Calculate volatility
    const variance = portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / portfolioReturns.length;
    const annualizedVolatility = Math.sqrt(variance) * Math.sqrt(252);

    // Sharpe ratio
    const sharpeRatio = (annualizedReturn - riskFreeRate) / annualizedVolatility;

    let interpretation: string;
    if (sharpeRatio > 3.0) interpretation = 'Excellent';
    else if (sharpeRatio > 2.0) interpretation = 'Very Good';
    else if (sharpeRatio > 1.0) interpretation = 'Good';
    else if (sharpeRatio > 0.5) interpretation = 'Fair';
    else interpretation = 'Poor';

    return {
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      annualizedReturn: Number((annualizedReturn * 100).toFixed(2)),
      annualizedVolatility: Number((annualizedVolatility * 100).toFixed(2)),
      riskFreeRate,
      interpretation
    };
  }

  /**
   * Calculate Kelly Criterion position size
   */
  calculateKellyPosition(
    strategy: string,
    accountBalance: number,
    historicalPerformance: StrategyPerformance
  ): KellyCalculation {
    const { winRate, avgWin, avgLoss } = historicalPerformance;
    const lossRate = 1 - winRate;

    // Kelly Formula: (p * b - q) / b
    // where p = win rate, q = loss rate, b = avg win / avg loss
    const b = Math.abs(avgWin / avgLoss);
    const kellyPercent = (winRate * b - lossRate) / b;

    // Conservative Kelly (Half-Kelly)
    const conservativeKelly = kellyPercent / 2;

    // Calculate position sizes
    const fullKellySize = accountBalance * Math.max(0, Math.min(kellyPercent, 0.25));
    const halfKellySize = accountBalance * Math.max(0, Math.min(conservativeKelly, 0.25));

    // Calculate risk of ruin
    const riskOfRuin = Math.pow((lossRate) / (winRate), accountBalance / avgWin);

    // Recommendation
    let recommendation: 'FULL_KELLY' | 'HALF_KELLY' | 'QUARTER_KELLY' | 'TOO_RISKY';
    if (kellyPercent > 0.20) recommendation = 'TOO_RISKY';
    else if (kellyPercent > 0.10) recommendation = 'QUARTER_KELLY';
    else if (kellyPercent > 0.05) recommendation = 'HALF_KELLY';
    else recommendation = 'FULL_KELLY';

    return {
      optimalPositionSize: Number(fullKellySize.toFixed(2)),
      conservativePositionSize: Number(halfKellySize.toFixed(2)),
      winRate,
      avgWin,
      avgLoss,
      expectedValue: winRate * avgWin - lossRate * Math.abs(avgLoss),
      riskOfRuin: Number(riskOfRuin.toFixed(6)),
      recommendation
    };
  }

  private calculatePortfolioReturns(
    positions: Position[],
    historicalReturns: Map<string, number[]>
  ): number[] {
    const portfolioReturns: number[] = [];
    const numDays = historicalReturns.values().next().value?.length || 0;
    const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

    for (let day = 0; day < numDays; day++) {
      let dayReturn = 0;

      for (const position of positions) {
        const returns = historicalReturns.get(position.symbol);
        if (returns && returns[day] !== undefined) {
          const weight = position.value / totalValue;
          dayReturn += weight * returns[day];
        }
      }

      portfolioReturns.push(dayReturn);
    }

    return portfolioReturns;
  }
}
```

### Example 2: Pre-Trade Risk Check

```typescript
// src/analysis/pre-trade-validator.ts

export class PreTradeValidator {
  constructor(
    private riskManager: EnhancedRiskManager,
    private marketData: MarketDataService
  ) {}

  async validateTrade(
    signal: Signal,
    currentPositions: Position[],
    accountBalance: number
  ): Promise<PreTradeCheck> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Position Size Check
    const proposedValue = signal.positionSize! * (signal.entryPrice || 0);
    const positionSizePercent = proposedValue / accountBalance;

    if (positionSizePercent > 0.25) {
      blockers.push(`Position size ${(positionSizePercent * 100).toFixed(1)}% exceeds 25% limit`);
    } else if (positionSizePercent > 0.20) {
      warnings.push(`Large position size: ${(positionSizePercent * 100).toFixed(1)}%`);
    }

    // 2. Total Risk Check
    const currentRisk = currentPositions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    const newRisk = currentRisk + (signal.riskAmount || 0);
    const riskPercent = newRisk / accountBalance;

    if (riskPercent > 0.10) {
      blockers.push(`Total portfolio risk ${(riskPercent * 100).toFixed(1)}% exceeds 10% limit`);
    } else if (riskPercent > 0.06) {
      warnings.push(`High portfolio risk: ${(riskPercent * 100).toFixed(1)}%`);
    }

    // 3. Sector Concentration Check
    const sectorExposure = this.calculateSectorExposureWithNewPosition(
      signal.symbol,
      proposedValue,
      currentPositions,
      accountBalance
    );

    for (const [sector, exposure] of Object.entries(sectorExposure)) {
      if (exposure > 0.30) {
        blockers.push(`${sector} sector exposure ${(exposure * 100).toFixed(1)}% exceeds 30% limit`);
      } else if (exposure > 0.25) {
        warnings.push(`High ${sector} sector exposure: ${(exposure * 100).toFixed(1)}%`);
      }
    }

    // 4. Correlation Check
    const correlatedPositions = await this.findCorrelatedPositions(
      signal.symbol,
      currentPositions
    );

    if (correlatedPositions.length >= 3) {
      blockers.push(`Would create ${correlatedPositions.length + 1} highly correlated positions (limit: 3)`);
    } else if (correlatedPositions.length === 2) {
      warnings.push(`High correlation with ${correlatedPositions.length} existing positions`);
    }

    // 5. Liquidity Check
    const liquidityCheck = await this.checkLiquidity(signal.symbol, signal.positionSize!);

    if (liquidityCheck.volumeRatio > 0.10) {
      blockers.push(`Position size is ${(liquidityCheck.volumeRatio * 100).toFixed(1)}% of daily volume (limit: 10%)`);
    } else if (liquidityCheck.volumeRatio > 0.05) {
      warnings.push(`Large position relative to volume: ${(liquidityCheck.volumeRatio * 100).toFixed(1)}%`);
    }

    // 6. Drawdown Check
    const portfolioMetrics = await this.riskManager.calculatePortfolioMetrics(currentPositions, accountBalance);
    const currentDrawdown = portfolioMetrics.maxDrawdown || 0;

    if (currentDrawdown < -0.20) {
      blockers.push(`Portfolio drawdown ${(currentDrawdown * 100).toFixed(1)}% too severe for new positions`);
    } else if (currentDrawdown < -0.15) {
      warnings.push(`Elevated drawdown: ${(currentDrawdown * 100).toFixed(1)}% - consider reducing position size`);
    }

    // Determine recommendation
    let recommendation: 'APPROVE' | 'REDUCE_SIZE' | 'REJECT';
    if (blockers.length > 0) {
      recommendation = 'REJECT';
    } else if (warnings.length >= 2) {
      recommendation = 'REDUCE_SIZE';
    } else {
      recommendation = 'APPROVE';
    }

    return {
      passed: blockers.length === 0,
      blockers,
      warnings,
      riskImpact: {
        currentRisk,
        newRisk,
        riskIncrease: newRisk - currentRisk,
        riskLimit: accountBalance * 0.10,
        utilizationPercent: (newRisk / (accountBalance * 0.10)) * 100
      },
      positionImpact: {
        currentPositions: currentPositions.length,
        newPositions: currentPositions.length + 1,
        positionLimit: 20 // Example limit
      },
      concentrationImpact: {
        currentSectorExposure: this.calculateCurrentSectorExposure(currentPositions, accountBalance),
        newSectorExposure: sectorExposure,
        sectorLimit: 0.30,
        wouldExceedLimit: Object.values(sectorExposure).some(e => e > 0.30)
      },
      correlationImpact: {
        currentCorrelation: 0, // Calculate from correlation matrix
        newCorrelation: 0, // Calculate with new position
        correlatedPositions: correlatedPositions.length,
        correlationLimit: 3
      },
      liquidityCheck,
      recommendation
    };
  }

  private async checkLiquidity(symbol: string, proposedShares: number): Promise<any> {
    const marketData = await this.marketData.getQuote(symbol);
    const averageDailyVolume = marketData.volume; // Simplified - should use 30-day average

    const volumeRatio = proposedShares / averageDailyVolume;

    let liquidityRating: 'HIGH' | 'MEDIUM' | 'LOW';
    if (volumeRatio < 0.01) liquidityRating = 'HIGH';
    else if (volumeRatio < 0.05) liquidityRating = 'MEDIUM';
    else liquidityRating = 'LOW';

    return {
      averageDailyVolume,
      proposedShares,
      volumeRatio: Number(volumeRatio.toFixed(4)),
      liquidityRating
    };
  }

  private calculateSectorExposureWithNewPosition(
    symbol: string,
    proposedValue: number,
    positions: Position[],
    accountBalance: number
  ): Record<string, number> {
    // Simplified - should use real sector data
    const sectorMap: Record<string, string> = {
      AAPL: 'TECH', MSFT: 'TECH', GOOGL: 'TECH',
      JPM: 'FINANCE', BAC: 'FINANCE',
      JNJ: 'HEALTHCARE', PFE: 'HEALTHCARE'
    };

    const exposure: Record<string, number> = {};

    // Add current positions
    for (const pos of positions) {
      const sector = sectorMap[pos.symbol] || 'OTHER';
      exposure[sector] = (exposure[sector] || 0) + (pos.value / accountBalance);
    }

    // Add new position
    const newSector = sectorMap[symbol] || 'OTHER';
    exposure[newSector] = (exposure[newSector] || 0) + (proposedValue / accountBalance);

    return exposure;
  }

  private calculateCurrentSectorExposure(
    positions: Position[],
    accountBalance: number
  ): Map<string, number> {
    const sectorMap: Record<string, string> = {
      AAPL: 'TECH', MSFT: 'TECH', GOOGL: 'TECH',
      JPM: 'FINANCE', BAC: 'FINANCE',
      JNJ: 'HEALTHCARE', PFE: 'HEALTHCARE'
    };

    const exposure = new Map<string, number>();

    for (const pos of positions) {
      const sector = sectorMap[pos.symbol] || 'OTHER';
      const current = exposure.get(sector) || 0;
      exposure.set(sector, current + (pos.value / accountBalance));
    }

    return exposure;
  }

  private async findCorrelatedPositions(
    symbol: string,
    positions: Position[]
  ): Promise<Position[]> {
    // Simplified - should use real correlation data
    const correlationThreshold = 0.7;

    // For now, use sector as proxy (will be replaced with real correlation)
    const sectorMap: Record<string, string> = {
      AAPL: 'TECH', MSFT: 'TECH', GOOGL: 'TECH',
      JPM: 'FINANCE', BAC: 'FINANCE',
      JNJ: 'HEALTHCARE', PFE: 'HEALTHCARE'
    };

    const symbolSector = sectorMap[symbol] || 'OTHER';

    return positions.filter(pos => {
      const posSector = sectorMap[pos.symbol] || 'OTHER';
      return posSector === symbolSector;
    });
  }
}
```

---

## Data Requirements

### Historical Data Storage

```typescript
// src/data/historical-data-manager.ts

interface HistoricalDataPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  returns?: number; // Daily return
}

class HistoricalDataManager {
  private cache: Map<string, HistoricalDataPoint[]> = new Map();

  /**
   * Get historical data with returns calculated
   */
  async getHistoricalData(
    symbol: string,
    period: number = 252 // 1 year of trading days
  ): Promise<HistoricalDataPoint[]> {
    // Check cache first
    if (this.cache.has(symbol)) {
      const cached = this.cache.get(symbol)!;
      if (cached.length >= period) {
        return cached.slice(-period);
      }
    }

    // Fetch from API
    const data = await this.fetchFromAPI(symbol, period);

    // Calculate returns
    for (let i = 1; i < data.length; i++) {
      data[i].returns = (data[i].close - data[i - 1].close) / data[i - 1].close;
    }

    // Cache it
    this.cache.set(symbol, data);

    return data;
  }

  /**
   * Get returns for multiple symbols (for correlation calculation)
   */
  async getReturnsMatrix(
    symbols: string[],
    period: number = 90
  ): Promise<Map<string, number[]>> {
    const returnsMap = new Map<string, number[]>();

    for (const symbol of symbols) {
      const data = await this.getHistoricalData(symbol, period);
      const returns = data.map(d => d.returns || 0).filter(r => r !== 0);
      returnsMap.set(symbol, returns);
    }

    return returnsMap;
  }

  private async fetchFromAPI(symbol: string, period: number): Promise<HistoricalDataPoint[]> {
    // Implementation depends on data source (Alpha Vantage, etc.)
    throw new Error('Not implemented');
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/risk-manager.test.ts

describe('EnhancedRiskManager', () => {
  describe('VaR Calculation', () => {
    it('should calculate 95% VaR correctly', async () => {
      const positions = mockPositions();
      const returns = mockHistoricalReturns();

      const var95 = await riskManager.calculateHistoricalVaR(positions, returns, 0.95);

      expect(var95.oneDayVaR95).toBeGreaterThan(0);
      expect(var95.oneDayVaR99).toBeGreaterThan(var95.oneDayVaR95);
      expect(var95.method).toBe('historical');
    });

    it('should scale VaR correctly for time horizon', async () => {
      const positions = mockPositions();
      const returns = mockHistoricalReturns();

      const var1day = await riskManager.calculateHistoricalVaR(positions, returns, 0.95, 1);
      const var10day = await riskManager.calculateHistoricalVaR(positions, returns, 0.95, 10);

      // 10-day VaR should be approximately sqrt(10) times 1-day VaR
      const expectedRatio = Math.sqrt(10);
      const actualRatio = var10day.tenDayVaR95 / var1day.oneDayVaR95;

      expect(actualRatio).toBeCloseTo(expectedRatio, 1);
    });
  });

  describe('Correlation Matrix', () => {
    it('should calculate correlation matrix correctly', async () => {
      const positions = mockPositions();
      const returns = mockHistoricalReturns();

      const matrix = await riskManager.calculateCorrelationMatrix(positions, returns);

      expect(matrix.matrix.size).toBe(positions.length);

      // Correlation with self should be 1.0
      for (const pos of positions) {
        expect(matrix.matrix.get(pos.symbol)!.get(pos.symbol)).toBeCloseTo(1.0);
      }

      // Matrix should be symmetric
      for (const pos1 of positions) {
        for (const pos2 of positions) {
          const corr12 = matrix.matrix.get(pos1.symbol)!.get(pos2.symbol);
          const corr21 = matrix.matrix.get(pos2.symbol)!.get(pos1.symbol);
          expect(corr12).toBeCloseTo(corr21);
        }
      }
    });
  });

  describe('Kelly Criterion', () => {
    it('should recommend conservative sizing for risky strategies', () => {
      const performance: StrategyPerformance = {
        winRate: 0.55,
        avgWin: 100,
        avgLoss: -100,
        // ... other fields
      };

      const kelly = riskManager.calculateKellyPosition('test', 100000, performance);

      expect(kelly.recommendation).toBe('HALF_KELLY');
      expect(kelly.conservativePositionSize).toBeLessThan(kelly.optimalPositionSize);
    });

    it('should reject strategies with negative expectancy', () => {
      const performance: StrategyPerformance = {
        winRate: 0.40,
        avgWin: 100,
        avgLoss: -100,
        // ... other fields
      };

      const kelly = riskManager.calculateKellyPosition('test', 100000, performance);

      expect(kelly.optimalPositionSize).toBe(0);
      expect(kelly.recommendation).toBe('TOO_RISKY');
    });
  });

  describe('Pre-Trade Validation', () => {
    it('should reject trades exceeding position size limit', async () => {
      const signal = mockSignal({ positionSize: 1000, entryPrice: 150 }); // $150k position
      const positions = mockPositions();
      const balance = 100000;

      const check = await validator.validateTrade(signal, positions, balance);

      expect(check.passed).toBe(false);
      expect(check.blockers).toContain(expect.stringContaining('position size'));
    });

    it('should warn about high sector concentration', async () => {
      const signal = mockTechStockSignal();
      const positions = mockTechHeavyPortfolio(); // 25% in TECH
      const balance = 100000;

      const check = await validator.validateTrade(signal, positions, balance);

      expect(check.warnings).toContain(expect.stringContaining('TECH'));
    });
  });
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Caching Correlation Matrices**
   - Calculate once per day, cache results
   - Update incrementally when positions change
   - TTL: 24 hours

2. **Monte Carlo Parallelization**
   - Run simulations in batches
   - Use worker threads for CPU-intensive calculations
   - Target: <5 seconds for 10,000 simulations

3. **Historical Data Management**
   - Keep rolling 1-year window in memory
   - Lazy load older data on demand
   - Compress data for storage

4. **VaR Calculation Optimization**
   - Pre-calculate for common confidence levels
   - Use incremental updates when positions change slightly
   - Cache results for 1 hour

---

## Security & Privacy

All risk management features maintain Stock Sense AI's security standards:

- **Encrypted Storage**: All portfolio data encrypted at rest
- **No Cloud Dependencies**: All calculations local
- **Secure Reports**: Risk reports encrypted before email delivery
- **Audit Trail**: Log all risk limit breaches
- **No Telemetry**: Risk metrics never sent externally

---

## Competitive Advantage Maintained

### Features No Competitor Has (All Together)
1. Real-time VaR and CVaR calculations
2. Automatic pre-trade risk checks
3. Kelly Criterion position sizing
4. Monte Carlo portfolio simulation
5. Comprehensive stress testing
6. Integration with encrypted local storage
7. TypeScript-native implementation
8. CLI-first risk management
9. Automatic stop-loss monitoring
10. Daily risk reports via Telegram

### Benchmark vs. Competitors

| Feature | Stock Sense AI | Freqtrade | Lean | Backtesting.py |
|---------|---------------|-----------|------|----------------|
| VaR Calculation | ✅ (All methods) | ❌ | ✅ (Basic) | ❌ |
| CVaR / Expected Shortfall | ✅ | ❌ | ✅ | ❌ |
| Real Correlation Matrix | ✅ | ❌ | ✅ | ❌ |
| Kelly Criterion | ✅ | ❌ | ❌ | ❌ |
| Monte Carlo Simulation | ✅ | ❌ | ✅ | ✅ |
| Stress Testing | ✅ | ❌ | ✅ | ❌ |
| Sharpe/Sortino/Calmar | ✅ | ✅ | ✅ | ✅ |
| Pre-Trade Risk Checks | ✅ | ✅ (Basic) | ✅ | ❌ |
| Automatic Stop-Loss | ✅ | ✅ | ✅ | ❌ |
| Risk Reports | ✅ | ❌ | ✅ (Cloud) | ❌ |
| **Local-First** | ✅ | ✅ | ❌ (Cloud) | N/A |
| **Encrypted Storage** | ✅ | ❌ | ❌ | N/A |
| **TypeScript Native** | ✅ | ❌ | ❌ | ❌ |

**Result**: Stock Sense AI will have **institutional-grade risk management** unavailable in any open-source TypeScript trading platform.

---

## Conclusion

This design transforms Stock Sense AI's risk management from "competitive advantage" to "institutional-grade" while maintaining our unique strengths:

1. **Security-first architecture** (encrypted, local-first)
2. **TypeScript-native** (modern, type-safe)
3. **CLI-first UX** (power user focused)
4. **No cloud dependencies** (privacy-focused)

The enhanced risk management system provides:
- Portfolio-level risk analytics (VaR, CVaR, correlation)
- Advanced position sizing (Kelly Criterion)
- Scenario analysis (Monte Carlo, stress tests)
- Risk-adjusted performance (Sharpe, Sortino, Calmar)
- Pre-trade risk checks for paper trading
- Automatic stop-loss and risk monitoring
- Comprehensive risk reporting

**Implementation Timeline**: 8-10 weeks
**Testing Timeline**: 2 weeks
**Total**: ~12 weeks to production-ready institutional-grade risk management

**Next Steps**:
1. Review and approve design
2. Begin Phase 1 implementation (Core Risk Metrics)
3. Set up test data and fixtures
4. Create integration test suite
5. Document API for developers

---

**Document Version**: 2.0
**Last Updated**: November 8, 2025
**Status**: Ready for Implementation
**Approval Required**: Yes
