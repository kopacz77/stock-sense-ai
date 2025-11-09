# Paper Trading System Design - Part 2
## Continuation of Design Document

---

## Performance Reporting

### Performance Metrics Engine

```typescript
/**
 * Comprehensive performance reporting system
 */
class PerformanceReporter {

  /**
   * Generate full performance report
   */
  async generateReport(
    portfolioId: string,
    options: ReportOptions = {}
  ): Promise<PerformanceReport> {

    const portfolio = await this.portfolioManager.getPortfolio(portfolioId);
    const trades = await this.tradeJournal.getTradeHistory(portfolioId);
    const positions = await this.portfolioManager.getPositions(portfolioId);

    // Calculate all metrics
    const metrics = await this.calculateAllMetrics(portfolioId, trades, positions);

    // Generate report sections
    const report: PerformanceReport = {
      portfolioId,
      portfolioName: portfolio.name,
      generatedAt: new Date(),
      period: options.period || "ALL_TIME",

      // Summary
      summary: this.generateSummary(portfolio, metrics),

      // Returns
      returns: this.calculateReturns(portfolio, trades),

      // Risk metrics
      risk: this.calculateRiskMetrics(metrics, trades),

      // Trade analysis
      tradeAnalysis: this.analyzeTrades(trades),

      // Win/Loss breakdown
      winLossAnalysis: this.analyzeWinLoss(trades),

      // Strategy performance
      strategyPerformance: this.analyzeByStrategy(trades),

      // Symbol performance
      symbolPerformance: this.analyzeBySymbol(trades),

      // Time-based analysis
      timeAnalysis: this.analyzeByTime(trades),

      // Equity curve
      equityCurve: options.includeEquityCurve
        ? await this.generateEquityCurve(portfolioId)
        : undefined,

      // Monthly returns
      monthlyReturns: options.includeMonthlyReturns
        ? this.calculateMonthlyReturns(trades)
        : undefined,

      // Drawdown analysis
      drawdowns: this.analyzeDrawdowns(metrics.equityCurve || []),

      // Current positions
      currentPositions: positions,

      // Recommendations
      recommendations: this.generateRecommendations(metrics, trades, positions),
    };

    return report;
  }

  /**
   * Generate executive summary
   */
  private generateSummary(
    portfolio: PaperPortfolio,
    metrics: PerformanceMetrics
  ): ReportSummary {

    return {
      initialBalance: portfolio.initialBalance,
      currentValue: portfolio.totalValue,
      totalReturn: metrics.totalReturn,
      totalReturnPercent: metrics.totalReturnPercent,
      annualizedReturn: metrics.annualizedReturn,
      realizedPnL: metrics.realizedPnL,
      unrealizedPnL: metrics.unrealizedPnL,
      totalTrades: metrics.totalTrades,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      sharpeRatio: metrics.sharpeRatio,
      maxDrawdown: metrics.maxDrawdown,
      maxDrawdownPercent: metrics.maxDrawdownPercent,
      tradingPeriod: {
        start: portfolio.createdAt,
        end: new Date(),
        days: Math.floor((Date.now() - portfolio.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      },
    };
  }

  /**
   * Calculate risk metrics
   */
  private calculateRiskMetrics(
    metrics: PerformanceMetrics,
    trades: TradeJournalEntry[]
  ): RiskMetrics {

    // Calculate daily returns
    const dailyReturns = this.calculateDailyReturns(trades);

    // Volatility (standard deviation of returns)
    const volatility = this.calculateStandardDeviation(dailyReturns);
    const annualizedVolatility = volatility * Math.sqrt(252); // 252 trading days

    // Sharpe Ratio
    const riskFreeRate = 0.04; // 4% annual
    const sharpeRatio = this.calculateSharpeRatio(dailyReturns, riskFreeRate);

    // Sortino Ratio (downside deviation only)
    const sortinoRatio = this.calculateSortinoRatio(dailyReturns, riskFreeRate);

    // Calmar Ratio (return / max drawdown)
    const calmarRatio = metrics.maxDrawdown > 0
      ? metrics.annualizedReturn / metrics.maxDrawdownPercent
      : 0;

    // Value at Risk (VaR)
    const var95 = this.calculateVaR(dailyReturns, 0.95);
    const var99 = this.calculateVaR(dailyReturns, 0.99);

    // Maximum consecutive losses
    const maxConsecutiveLosses = this.findMaxConsecutiveLosses(trades);

    return {
      volatility,
      annualizedVolatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown: metrics.maxDrawdown,
      maxDrawdownPercent: metrics.maxDrawdownPercent,
      maxDrawdownDuration: metrics.maxDrawdownDuration,
      var95,
      var99,
      maxConsecutiveLosses,
      averageTrade: metrics.totalReturn / metrics.totalTrades,
      bestTrade: Math.max(...trades.map(t => t.pnlImpact?.realizedPnL || 0)),
      worstTrade: Math.min(...trades.map(t => t.pnlImpact?.realizedPnL || 0)),
    };
  }

  /**
   * Analyze trades
   */
  private analyzeTrades(trades: TradeJournalEntry[]): TradeAnalysis {

    const closingTrades = trades.filter(t => t.pnlImpact);

    return {
      totalTrades: closingTrades.length,
      avgTradeSize: this.average(closingTrades.map(t => t.totalValue)),
      avgHoldingPeriod: this.average(closingTrades.map(t => t.pnlImpact!.holdingPeriod)),
      avgCommission: this.average(trades.map(t => t.commission)),
      avgSlippageBps: this.average(trades.map(t => t.slippageBps)),
      totalCommissions: trades.reduce((sum, t) => sum + t.commission, 0),
      totalSlippage: trades.reduce((sum, t) => sum + t.slippage, 0),
      totalFees: trades.reduce((sum, t) => sum + t.fees, 0),
      avgExecutionTime: this.average(trades.map(t => t.executionTime)),
    };
  }

  /**
   * Win/Loss analysis
   */
  private analyzeWinLoss(trades: TradeJournalEntry[]): WinLossAnalysis {

    const closingTrades = trades.filter(t => t.pnlImpact);
    const winners = closingTrades.filter(t => t.pnlImpact!.realizedPnL > 0);
    const losers = closingTrades.filter(t => t.pnlImpact!.realizedPnL < 0);
    const breakEven = closingTrades.filter(t => t.pnlImpact!.realizedPnL === 0);

    const totalWins = winners.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0));

    return {
      winningTrades: winners.length,
      losingTrades: losers.length,
      breakEvenTrades: breakEven.length,
      winRate: (winners.length / closingTrades.length) * 100,
      lossRate: (losers.length / closingTrades.length) * 100,

      avgWin: winners.length > 0 ? totalWins / winners.length : 0,
      avgWinPercent: this.average(winners.map(t => t.pnlImpact!.realizedPnLPercent)),
      largestWin: Math.max(...winners.map(t => t.pnlImpact!.realizedPnL)),
      largestWinPercent: Math.max(...winners.map(t => t.pnlImpact!.realizedPnLPercent)),

      avgLoss: losers.length > 0 ? totalLosses / losers.length : 0,
      avgLossPercent: this.average(losers.map(t => Math.abs(t.pnlImpact!.realizedPnLPercent))),
      largestLoss: Math.min(...losers.map(t => t.pnlImpact!.realizedPnL)),
      largestLossPercent: Math.min(...losers.map(t => t.pnlImpact!.realizedPnLPercent)),

      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
      expectancy: (totalWins - totalLosses) / closingTrades.length,

      avgWinHoldingPeriod: this.average(winners.map(t => t.pnlImpact!.holdingPeriod)),
      avgLossHoldingPeriod: this.average(losers.map(t => t.pnlImpact!.holdingPeriod)),

      maxConsecutiveWins: this.findMaxConsecutiveWins(closingTrades),
      maxConsecutiveLosses: this.findMaxConsecutiveLosses(closingTrades),
    };
  }

  /**
   * Strategy-specific performance
   */
  private analyzeByStrategy(trades: TradeJournalEntry[]): StrategyPerformance[] {

    const strategies = new Map<string, TradeJournalEntry[]>();

    for (const trade of trades.filter(t => t.pnlImpact)) {
      const strategy = trade.strategy || "MANUAL";
      if (!strategies.has(strategy)) {
        strategies.set(strategy, []);
      }
      strategies.get(strategy)!.push(trade);
    }

    return Array.from(strategies.entries()).map(([strategy, strategyTrades]) => {
      const winners = strategyTrades.filter(t => t.pnlImpact!.realizedPnL > 0);
      const losers = strategyTrades.filter(t => t.pnlImpact!.realizedPnL < 0);

      const totalPnL = strategyTrades.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0);
      const totalWins = winners.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0);
      const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0));

      return {
        strategy,
        totalTrades: strategyTrades.length,
        winningTrades: winners.length,
        losingTrades: losers.length,
        winRate: (winners.length / strategyTrades.length) * 100,
        totalPnL,
        avgPnL: totalPnL / strategyTrades.length,
        profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
        avgHoldingPeriod: this.average(strategyTrades.map(t => t.pnlImpact!.holdingPeriod)),
      };
    });
  }

  /**
   * Symbol-specific performance
   */
  private analyzeBySymbol(trades: TradeJournalEntry[]): SymbolPerformance[] {

    const symbols = new Map<string, TradeJournalEntry[]>();

    for (const trade of trades.filter(t => t.pnlImpact)) {
      if (!symbols.has(trade.symbol)) {
        symbols.set(trade.symbol, []);
      }
      symbols.get(trade.symbol)!.push(trade);
    }

    return Array.from(symbols.entries()).map(([symbol, symbolTrades]) => {
      const winners = symbolTrades.filter(t => t.pnlImpact!.realizedPnL > 0);
      const totalPnL = symbolTrades.reduce((sum, t) => sum + t.pnlImpact!.realizedPnL, 0);

      return {
        symbol,
        totalTrades: symbolTrades.length,
        winningTrades: winners.length,
        winRate: (winners.length / symbolTrades.length) * 100,
        totalPnL,
        avgPnL: totalPnL / symbolTrades.length,
        avgHoldingPeriod: this.average(symbolTrades.map(t => t.pnlImpact!.holdingPeriod)),
        totalCommissions: symbolTrades.reduce((sum, t) => sum + t.commission, 0),
      };
    }).sort((a, b) => b.totalPnL - a.totalPnL); // Sort by P&L descending
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(
    metrics: PerformanceMetrics,
    trades: TradeJournalEntry[],
    positions: PaperPosition[]
  ): string[] {

    const recommendations: string[] = [];

    // Win rate analysis
    if (metrics.winRate < 40) {
      recommendations.push("Low win rate (<40%). Consider reviewing entry criteria and strategy parameters.");
    } else if (metrics.winRate > 65) {
      recommendations.push("High win rate (>65%). You may be taking profits too early. Consider wider profit targets.");
    }

    // Profit factor
    if (metrics.profitFactor < 1.0) {
      recommendations.push("Profit factor below 1.0. Strategy is losing money. Immediate review required.");
    } else if (metrics.profitFactor < 1.5) {
      recommendations.push("Profit factor below 1.5. Consider improving risk/reward ratio or trade selection.");
    }

    // Risk metrics
    if (metrics.sharpeRatio < 1.0) {
      recommendations.push("Sharpe ratio below 1.0. Returns may not justify the risk taken.");
    }

    if (metrics.maxDrawdownPercent > 25) {
      recommendations.push("Maximum drawdown exceeds 25%. Consider stricter position sizing and stop losses.");
    }

    // Trade frequency
    const avgTradesPerMonth = trades.length / (metrics.totalTrades > 0 ? 12 : 1);
    if (avgTradesPerMonth < 2) {
      recommendations.push("Low trading frequency. May miss opportunities. Consider relaxing entry criteria.");
    } else if (avgTradesPerMonth > 20) {
      recommendations.push("High trading frequency. May be overtrading. Ensure each trade has strong conviction.");
    }

    // Holding period
    const closingTrades = trades.filter(t => t.pnlImpact);
    const avgHoldingPeriod = this.average(closingTrades.map(t => t.pnlImpact!.holdingPeriod));

    if (avgHoldingPeriod < 2) {
      recommendations.push("Very short average holding period (<2 days). Transaction costs may erode profits.");
    }

    // Position concentration
    if (positions.length > 0) {
      const maxPositionPercent = Math.max(...positions.map(p => (p.marketValue / p.portfolioId) * 100));
      if (maxPositionPercent > 30) {
        recommendations.push("High position concentration (>30% in single stock). Increase diversification.");
      }
    }

    // Strategy performance variance
    const strategyPerf = this.analyzeByStrategy(trades);
    if (strategyPerf.length > 1) {
      const bestStrategy = strategyPerf.reduce((best, curr) =>
        curr.profitFactor > best.profitFactor ? curr : best
      );
      const worstStrategy = strategyPerf.reduce((worst, curr) =>
        curr.profitFactor < worst.profitFactor ? curr : worst
      );

      if (worstStrategy.profitFactor < 1.0) {
        recommendations.push(`Strategy "${worstStrategy.strategy}" is underperforming. Consider discontinuing or revising.`);
      }

      if (bestStrategy.profitFactor > 2.0) {
        recommendations.push(`Strategy "${bestStrategy.strategy}" shows strong performance. Consider increasing allocation.`);
      }
    }

    return recommendations;
  }

  // Helper methods
  private average(numbers: number[]): number {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  private calculateStandardDeviation(returns: number[]): number {
    const avg = this.average(returns);
    const squaredDiffs = returns.map(r => Math.pow(r - avg, 2));
    const variance = this.average(squaredDiffs);
    return Math.sqrt(variance);
  }

  private calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
    const excessReturns = returns.map(r => r - riskFreeRate / 252); // Daily risk-free rate
    const avgExcessReturn = this.average(excessReturns);
    const stdDev = this.calculateStandardDeviation(excessReturns);
    return stdDev > 0 ? (avgExcessReturn / stdDev) * Math.sqrt(252) : 0;
  }

  private calculateSortinoRatio(returns: number[], riskFreeRate: number): number {
    const excessReturns = returns.map(r => r - riskFreeRate / 252);
    const avgExcessReturn = this.average(excessReturns);
    const downside Returns = excessReturns.filter(r => r < 0);
    const downsideDeviation = this.calculateStandardDeviation(downsideReturns);
    return downsideDeviation > 0 ? (avgExcessReturn / downsideDeviation) * Math.sqrt(252) : 0;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return sorted[index] || 0;
  }
}
```

---

## Risk Limits Enforcement

### Integration with Existing RiskManager

```typescript
/**
 * Paper trading risk enforcement
 * Extends existing RiskManager functionality
 */
class PaperTradingRiskEnforcement {

  private riskManager: RiskManager;
  private portfolioManager: PortfolioManager;
  private alertService: AlertService;

  /**
   * Validate trade against all risk limits
   */
  async validateTradeRisk(
    portfolioId: string,
    signal: Signal
  ): Promise<RiskValidationResult> {

    const portfolio = await this.portfolioManager.getPortfolio(portfolioId);
    const positions = await this.portfolioManager.getPositions(portfolioId);
    const currentPrice = signal.entryPrice || 0;

    // Use existing RiskManager.calculatePosition
    const riskCalc = await this.riskManager.calculatePosition({
      symbol: signal.symbol,
      entryPrice: currentPrice,
      signal,
      accountBalance: portfolio.currentBalance,
      currentPositions: positions,
      atr: signal.indicators?.atr,
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if risk calculation is valid
    if (!riskCalc.isValid) {
      errors.push(...riskCalc.warnings);
    }

    // Portfolio-level risk check
    const portfolioRisk = this.riskManager.validatePortfolioRisk(positions, portfolio.currentBalance);

    if (!portfolioRisk.valid) {
      errors.push(...portfolioRisk.warnings);
    }

    // Trading halt check
    const portfolioMetrics = this.riskManager.calculatePortfolioMetrics(positions, portfolio.currentBalance);
    const haltCheck = this.riskManager.shouldHaltTrading(portfolioMetrics);

    if (haltCheck.halt) {
      errors.push(`TRADING HALTED: ${haltCheck.reason}`);
    }

    // Custom paper trading limits
    const paperTradeChecks = await this.checkPaperTradingLimits(portfolio, signal, riskCalc);
    errors.push(...paperTradeChecks.errors);
    warnings.push(...paperTradeChecks.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      riskCalculation: riskCalc,
      portfolioRisk,
      canTrade: errors.length === 0 && !haltCheck.halt,
    };
  }

  /**
   * Additional paper trading specific limits
   */
  private async checkPaperTradingLimits(
    portfolio: PaperPortfolio,
    signal: Signal,
    riskCalc: RiskCalculationResult
  ): Promise<{ errors: string[]; warnings: string[] }> {

    const errors: string[] = [];
    const warnings: string[] = [];

    // Max trades per day limit
    const todayTrades = await this.getTodayTradeCount(portfolio.id);
    const maxTradesPerDay = portfolio.settings?.maxTradesPerDay || 10;

    if (todayTrades >= maxTradesPerDay) {
      errors.push(`Daily trade limit reached (${maxTradesPerDay} trades)`);
    }

    // Minimum signal confidence
    const minConfidence = portfolio.riskParams?.minSignalConfidence || 60;
    if (signal.confidence < minConfidence) {
      errors.push(`Signal confidence (${signal.confidence}%) below minimum (${minConfidence}%)`);
    }

    // Minimum account balance
    const minBalance = portfolio.initialBalance * 0.5; // Don't trade if lost 50%
    if (portfolio.currentBalance < minBalance) {
      errors.push(`Account balance too low. Below 50% of initial balance.`);
    }

    // Cooldown period after loss
    const lastTrade = await this.getLastTrade(portfolio.id);
    if (lastTrade && lastTrade.pnlImpact && lastTrade.pnlImpact.realizedPnL < 0) {
      const cooldownHours = portfolio.settings?.lossCooldownHours || 0;
      const hoursSinceLastTrade = (Date.now() - lastTrade.timestamp.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastTrade < cooldownHours) {
        warnings.push(`Cooldown period active. Wait ${(cooldownHours - hoursSinceLastTrade).toFixed(1)} more hours.`);
      }
    }

    // Symbol exposure limit
    const symbolPositions = await this.getSymbolPositions(portfolio.id, signal.symbol);
    const symbolExposure = symbolPositions.reduce((sum, p) => sum + p.marketValue, 0);
    const maxSymbolExposure = portfolio.totalValue * 0.15; // Max 15% per symbol

    if (symbolExposure + riskCalc.positionValue > maxSymbolExposure) {
      warnings.push(`Symbol exposure would exceed 15% limit`);
    }

    return { errors, warnings };
  }

  /**
   * Monitor and enforce risk limits continuously
   */
  async enforceRiskLimits(portfolioId: string): Promise<RiskEnforcementActions> {

    const portfolio = await this.portfolioManager.getPortfolio(portfolioId);
    const positions = await this.portfolioManager.getPositions(portfolioId);
    const actions: RiskEnforcementActions = {
      stopLosses: [],
      positionsReduced: [],
      tradingHalted: false,
      alerts: [],
    };

    // Check each position for stop loss trigger
    for (const position of positions) {
      if (position.stopLoss) {
        const currentPrice = position.currentPrice;
        const stopHit = position.side === "LONG"
          ? currentPrice <= position.stopLoss
          : currentPrice >= position.stopLoss;

        if (stopHit) {
          // Trigger stop loss
          await this.triggerStopLoss(portfolioId, position);
          actions.stopLosses.push(position.id);
          actions.alerts.push({
            type: "STOP_LOSS_TRIGGERED",
            symbol: position.symbol,
            message: `Stop loss triggered for ${position.symbol} at ${currentPrice}`,
          });
        }
      }
    }

    // Check portfolio-level risk
    const portfolioMetrics = this.riskManager.calculatePortfolioMetrics(positions, portfolio.currentBalance);
    const haltCheck = this.riskManager.shouldHaltTrading(portfolioMetrics);

    if (haltCheck.halt) {
      actions.tradingHalted = true;
      actions.alerts.push({
        type: "TRADING_HALTED",
        message: haltCheck.reason!,
      });

      // Send high-priority alert
      await this.alertService.sendAlert({
        type: "RISK_WARNING",
        message: `Paper trading halted for portfolio "${portfolio.name}": ${haltCheck.reason}`,
        priority: "HIGH",
      });
    }

    // Check for excessive position sizes
    const portfolioValue = portfolio.totalValue;
    for (const position of positions) {
      const positionPercent = (position.marketValue / portfolioValue) * 100;
      const maxPositionPercent = portfolio.riskParams.maxPositionSize * 100;

      if (positionPercent > maxPositionPercent * 1.2) { // 20% over limit
        // Reduce position
        actions.positionsReduced.push({
          positionId: position.id,
          symbol: position.symbol,
          reason: `Position size (${positionPercent.toFixed(1)}%) exceeds limit`,
        });

        actions.alerts.push({
          type: "POSITION_OVERSIZED",
          symbol: position.symbol,
          message: `Position ${position.symbol} exceeds size limit (${positionPercent.toFixed(1)}%)`,
        });
      }
    }

    return actions;
  }
}
```

---

## Integration with Existing Systems

### Strategy Integration

```typescript
/**
 * Integrate paper trading with existing strategies
 */
class StrategyPaperTradingIntegration {

  private paperTradingEngine: PaperTradingEngine;
  private meanReversionStrategy: MeanReversionStrategy;
  private momentumStrategy: MomentumStrategy;
  private marketDataService: MarketDataService;

  /**
   * Execute auto-trading based on strategy signals
   */
  async executeStrategySignal(
    portfolioId: string,
    symbol: string,
    strategyName: "MEAN_REVERSION" | "MOMENTUM"
  ): Promise<TradeResult | null> {

    // Get historical data
    const historicalData = await this.marketDataService.getHistoricalData(symbol, 100);

    // Analyze with strategy
    let signal: Signal;

    if (strategyName === "MEAN_REVERSION") {
      signal = await this.meanReversionStrategy.analyze(symbol, historicalData);
    } else {
      signal = await this.momentumStrategy.analyze(symbol, historicalData);
    }

    // Only trade on BUY/SELL signals (not HOLD)
    if (signal.action === "HOLD") {
      return null;
    }

    // Execute trade via paper trading engine
    const result = await this.paperTradingEngine.executeTrade(portfolioId, signal, {
      autoCalculatePositionSize: true,
      createBracketOrders: true,
    });

    return result;
  }
}
```

### Monitoring System Integration

```typescript
/**
 * Integrate with existing MonitoringService
 */
class PaperTradingMonitoring {

  private monitoringService: MonitoringService;
  private paperTradingEngine: PaperTradingEngine;

  /**
   * Auto-trade on monitoring discoveries
   */
  async enableAutoTrading(
    portfolioId: string,
    config: AutoTradingConfig
  ): Promise<void> {

    // Subscribe to monitoring discoveries
    this.monitoringService.onOpportunityDiscovered(async (opportunity) => {

      // Check if signal meets criteria
      if (opportunity.signal.confidence < config.minConfidence) {
        return;
      }

      if (config.strategiesFilter && !config.strategiesFilter.includes(opportunity.signal.strategy)) {
        return;
      }

      // Execute trade
      try {
        await this.paperTradingEngine.executeTrade(portfolioId, opportunity.signal);
      } catch (error) {
        console.error("Auto-trade failed:", error);
      }
    });
  }
}
```

---

## API Endpoints for Web Dashboard

### REST API Endpoints

```typescript
/**
 * Express REST API for paper trading
 */
class PaperTradingAPI {

  setupRoutes(app: Express): void {

    // Portfolios
    app.post("/api/paper-trade/portfolios", this.createPortfolio.bind(this));
    app.get("/api/paper-trade/portfolios", this.listPortfolios.bind(this));
    app.get("/api/paper-trade/portfolios/:id", this.getPortfolio.bind(this));
    app.put("/api/paper-trade/portfolios/:id", this.updatePortfolio.bind(this));
    app.delete("/api/paper-trade/portfolios/:id", this.deletePortfolio.bind(this));

    // Orders
    app.post("/api/paper-trade/portfolios/:id/orders", this.placeOrder.bind(this));
    app.get("/api/paper-trade/portfolios/:id/orders", this.getOrders.bind(this));
    app.delete("/api/paper-trade/portfolios/:id/orders/:orderId", this.cancelOrder.bind(this));

    // Positions
    app.get("/api/paper-trade/portfolios/:id/positions", this.getPositions.bind(this));
    app.post("/api/paper-trade/portfolios/:id/positions/:positionId/close", this.closePosition.bind(this));

    // Trades
    app.get("/api/paper-trade/portfolios/:id/trades", this.getTradeHistory.bind(this));

    // Performance
    app.get("/api/paper-trade/portfolios/:id/performance", this.getPerformance.bind(this));
    app.get("/api/paper-trade/portfolios/:id/reports", this.generateReport.bind(this));

    // Real-time
    app.get("/api/paper-trade/portfolios/:id/live-updates", this.subscribeLiveUpdates.bind(this));
  }

  /**
   * Create portfolio endpoint
   */
  private async createPortfolio(req: Request, res: Response): Promise<void> {
    try {
      const portfolio = await this.paperTradingEngine.createPortfolio(req.body);
      res.status(201).json(portfolio);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Place order endpoint
   */
  private async placeOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const order = await this.paperTradingEngine.placeOrder(id, req.body);
      res.status(201).json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get real-time position updates (SSE)
   */
  private async subscribeLiveUpdates(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Subscribe to P&L updates
    const subscriptionId = this.realTimePnLService.subscribe(id, (updates) => {
      res.write(`data: ${JSON.stringify(updates)}\n\n`);
    });

    // Cleanup on disconnect
    req.on("close", () => {
      this.realTimePnLService.unsubscribe(id, subscriptionId);
    });
  }
}
```

### WebSocket API for Real-time Updates

```typescript
/**
 * Socket.IO events for real-time paper trading
 */
class PaperTradingSocketAPI {

  setupSocketHandlers(io: SocketIOServer): void {

    io.on("connection", (socket) => {

      // Subscribe to portfolio updates
      socket.on("subscribe:portfolio", async (portfolioId: string) => {
        socket.join(`portfolio:${portfolioId}`);

        // Send initial state
        const state = await this.getPortfolioState(portfolioId);
        socket.emit("portfolio:state", state);

        // Start real-time updates
        this.startRealtimeUpdates(portfolioId, socket);
      });

      // Unsubscribe
      socket.on("unsubscribe:portfolio", (portfolioId: string) => {
        socket.leave(`portfolio:${portfolioId}`);
      });

      // Place order
      socket.on("order:place", async (data) => {
        try {
          const order = await this.paperTradingEngine.placeOrder(data.portfolioId, data.orderParams);
          socket.emit("order:placed", order);

          // Broadcast to portfolio room
          io.to(`portfolio:${data.portfolioId}`).emit("portfolio:order", order);
        } catch (error) {
          socket.emit("order:error", { error: error.message });
        }
      });

      // Real-time P&L updates
      socket.on("subscribe:pnl", (portfolioId: string) => {
        const subId = this.realTimePnLService.subscribe(portfolioId, (updates) => {
          socket.emit("pnl:update", updates);
        });

        socket.on("disconnect", () => {
          this.realTimePnLService.unsubscribe(portfolioId, subId);
        });
      });
    });
  }

  private async startRealtimeUpdates(portfolioId: string, socket: any): Promise<void> {
    const interval = setInterval(async () => {
      try {
        const state = await this.getPortfolioState(portfolioId);
        socket.emit("portfolio:update", state);
      } catch (error) {
        console.error("Real-time update failed:", error);
      }
    }, 30000); // Update every 30 seconds

    socket.on("disconnect", () => {
      clearInterval(interval);
    });
  }
}
```

---

## Persistence Strategy

### Encrypted Storage Implementation

```typescript
/**
 * Secure encrypted storage for paper trading data
 * Extends existing SecureConfig pattern
 */
class SecureStorageService {

  private secureConfig: SecureConfig;
  private readonly STORAGE_DIR = "./data/paper-trading";
  private encryptionKey: string = "";

  async initialize(): Promise<void> {
    await this.secureConfig.initialize();

    // Create storage directory
    await fs.mkdir(this.STORAGE_DIR, { recursive: true });
    await fs.mkdir(`${this.STORAGE_DIR}/backups`, { recursive: true });

    // Get or create encryption key (reuse from SecureConfig)
    this.encryptionKey = await this.getEncryptionKey();
  }

  /**
   * Save encrypted data to file
   */
  async save<T>(filename: string, data: T, schema?: z.ZodSchema<T>): Promise<void> {

    // Validate if schema provided
    if (schema) {
      schema.parse(data);
    }

    // Serialize
    const json = JSON.stringify(data, null, 2);

    // Encrypt (using same method as SecureConfig)
    const encrypted = this.encrypt(json);

    // Write to file
    const filepath = path.join(this.STORAGE_DIR, `${filename}.encrypted`);
    await fs.writeFile(filepath, encrypted, "utf8");
  }

  /**
   * Load encrypted data from file
   */
  async load<T>(filename: string, schema?: z.ZodSchema<T>): Promise<T | null> {

    const filepath = path.join(this.STORAGE_DIR, `${filename}.encrypted`);

    try {
      // Read file
      const encrypted = await fs.readFile(filepath, "utf8");

      // Decrypt
      const json = this.decrypt(encrypted);

      // Parse
      const data = JSON.parse(json);

      // Validate if schema provided
      if (schema) {
        return schema.parse(data);
      }

      return data;

    } catch (error) {
      if (error.code === "ENOENT") {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Append to JSONL file (for journal)
   */
  async appendJSONL<T>(filename: string, entry: T, schema?: z.ZodSchema<T>): Promise<void> {

    // Validate
    if (schema) {
      schema.parse(entry);
    }

    // Serialize entry
    const line = JSON.stringify(entry) + "\n";

    // Encrypt the line
    const encryptedLine = this.encryptLine(line);

    // Append to file
    const filepath = path.join(this.STORAGE_DIR, `${filename}.jsonl.encrypted`);
    await fs.appendFile(filepath, encryptedLine + "\n", "utf8");
  }

  /**
   * Read JSONL file
   */
  async readJSONL<T>(filename: string, schema?: z.ZodSchema<T>): Promise<T[]> {

    const filepath = path.join(this.STORAGE_DIR, `${filename}.jsonl.encrypted`);

    try {
      const content = await fs.readFile(filepath, "utf8");
      const lines = content.trim().split("\n");

      const entries: T[] = [];
      for (const encryptedLine of lines) {
        if (!encryptedLine.trim()) continue;

        const line = this.decryptLine(encryptedLine);
        const entry = JSON.parse(line);

        if (schema) {
          entries.push(schema.parse(entry));
        } else {
          entries.push(entry);
        }
      }

      return entries;

    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Create backup
   */
  async createBackup(portfolioId: string): Promise<string> {

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(this.STORAGE_DIR, "backups", `${portfolioId}_${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });

    // Copy all portfolio files
    const files = [
      `portfolio_${portfolioId}`,
      `positions_${portfolioId}`,
      `orders_${portfolioId}`,
      `trades_${portfolioId}`,
      `performance_${portfolioId}`,
    ];

    for (const file of files) {
      try {
        const src = path.join(this.STORAGE_DIR, `${file}.encrypted`);
        const dest = path.join(backupDir, `${file}.encrypted`);
        await fs.copyFile(src, dest);
      } catch (error) {
        // File may not exist, skip
      }
    }

    return backupDir;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath: string): Promise<void> {

    const files = await fs.readdir(backupPath);

    for (const file of files) {
      if (file.endsWith(".encrypted")) {
        const src = path.join(backupPath, file);
        const dest = path.join(this.STORAGE_DIR, file);
        await fs.copyFile(src, dest);
      }
    }
  }

  // Encryption methods (same as SecureConfig)
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(this.encryptionKey, "hex"),
      iv
    );

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return `${iv.toString("hex")}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");

    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(this.encryptionKey, "hex"),
      iv
    );

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  private encryptLine(line: string): string {
    return this.encrypt(line);
  }

  private decryptLine(encryptedLine: string): string {
    return this.decrypt(encryptedLine);
  }

  private async getEncryptionKey(): Promise<string> {
    // Reuse key from SecureConfig
    // Implementation would integrate with existing keychain/file storage
    return ""; // Placeholder
  }
}
```

---

## Security & Compliance

### Security Considerations

```markdown
## Security Architecture

### Data Protection
1. **Encryption at Rest**
   - All portfolio data encrypted with AES-256-CBC
   - Encryption keys stored in OS keychain (macOS/Windows/Linux)
   - Fallback to obfuscated file storage for systems without keychain
   - Same encryption pattern as existing SecureConfig

2. **No Cloud Storage**
   - All data remains local (consistent with Stock Sense AI architecture)
   - No external API calls for trading (simulated execution only)
   - Market data from existing secure APIs (Alpha Vantage, Finnhub)

3. **Access Control**
   - Portfolio data isolated by portfolio ID
   - No multi-user support (single-user CLI tool)
   - File permissions set to 0600 (owner read/write only)

### Compliance Considerations

1. **Regulatory Disclaimers**
   ```
   IMPORTANT DISCLAIMER:
   This is a PAPER TRADING SYSTEM for educational and testing purposes only.
   - No real money is involved
   - No actual securities are traded
   - Past performance does not guarantee future results
   - This is not financial advice
   - Consult a licensed financial advisor before real trading
   ```

2. **Data Retention**
   - Trade journal is append-only (immutable audit trail)
   - Backups created before portfolio deletion
   - Option to export all data before deletion
   - No automatic data deletion

3. **Risk Warnings**
   - Display risk warnings before each trade
   - Require confirmation for high-risk trades
   - Alert on excessive losses
   - Trading halt mechanisms

4. **Audit Trail**
   - Complete trade history with timestamps
   - All order modifications logged
   - Portfolio state snapshots
   - Performance calculation audit trail
```

---

## Code Examples

### Example 1: Creating a Portfolio and Executing First Trade

```typescript
import { PaperTradingEngine } from "./paper-trading/engine";
import { MeanReversionStrategy } from "./strategies/mean-reversion-strategy";
import { MarketDataService } from "./data/market-data-service";

async function example1(): Promise<void> {

  // Initialize paper trading engine
  const engine = new PaperTradingEngine({
    storageDir: "./data/paper-trading",
  });

  await engine.initialize();

  // Create portfolio
  const portfolio = await engine.createPortfolio({
    name: "Mean Reversion Test",
    initialBalance: 100000,
    strategy: "MEAN_REVERSION",
    riskParams: {
      maxRiskPerTrade: 0.01, // 1%
      maxPositionSize: 0.20, // 20%
      stopLossMultiplier: 2.0,
      takeProfitRatio: 2.0,
      maxCorrelatedPositions: 3,
      maxSectorExposure: 0.30,
    },
    commissionModel: {
      type: "FIXED",
      fixedFee: 0, // Zero commission
    },
    settings: {
      enableSlippage: true,
      slippageModel: "FIXED_BPS",
      fixedSlippageBps: 5,
      enablePartialFills: true,
      marketImpactFactor: 1.0,
      requireMarketHours: false,
    },
  });

  console.log(`Portfolio created: ${portfolio.id}`);
  console.log(`Initial balance: $${portfolio.initialBalance.toLocaleString()}`);

  // Analyze AAPL with mean reversion strategy
  const marketData = new MarketDataService();
  const historicalData = await marketData.getHistoricalData("AAPL", 100);

  const strategy = new MeanReversionStrategy({
    rsiOversold: 30,
    rsiOverbought: 70,
    mfiOversold: 20,
    mfiOverbought: 80,
    bbStdDev: 2,
    minConfidence: 70,
    volumeThreshold: 1.2,
    maxHoldingPeriod: 30,
  });

  const signal = await strategy.analyze("AAPL", historicalData);

  console.log(`Signal: ${signal.action} (confidence: ${signal.confidence}%)`);

  if (signal.action === "BUY" && signal.confidence >= 70) {

    // Execute trade with auto position sizing
    const result = await engine.executeTrade(portfolio.id, signal, {
      autoCalculatePositionSize: true,
      createBracketOrders: true, // Auto create stop loss & take profit
    });

    console.log("\nTrade executed:");
    console.log(`- Symbol: ${result.order.symbol}`);
    console.log(`- Quantity: ${result.order.quantity}`);
    console.log(`- Entry Price: $${result.execution.fillPrice}`);
    console.log(`- Stop Loss: $${result.position.stopLoss}`);
    console.log(`- Take Profit: $${result.position.takeProfit}`);
    console.log(`- Commission: $${result.execution.commission}`);
    console.log(`- Slippage: ${result.execution.slippageBps} bps`);
    console.log(`- Position Value: $${result.position.marketValue.toLocaleString()}`);
    console.log(`- Risk Amount: $${result.position.riskAmount}`);
  }
}
```

### Example 2: Monitoring Portfolio with Real-time Updates

```typescript
async function example2_monitoring(): Promise<void> {

  const engine = new PaperTradingEngine();
  await engine.initialize();

  const portfolioId = "your-portfolio-id";

  // Subscribe to real-time P&L updates
  const realTimePnL = new RealTimePnLService();

  const subscriptionId = realTimePnL.subscribe(portfolioId, (updates) => {
    console.log("\nPosition Updates:");

    for (const update of updates) {
      console.log(`${update.symbol}: ${update.oldPrice} -> ${update.newPrice}`);
      console.log(`  P&L: $${update.pnl.unrealizedPnL.toFixed(2)} (${update.pnl.unrealizedPnLPercent.toFixed(2)}%)`);

      if (update.pnl.stopLossDistance !== undefined) {
        console.log(`  Stop Loss Distance: ${update.pnl.stopLossDistance.toFixed(2)}%`);
      }
    }
  });

  // Start real-time updates every 60 seconds
  realTimePnL.startRealTimeUpdates(portfolioId, 60);

  // Monitor for 10 minutes then stop
  setTimeout(() => {
    realTimePnL.stopRealTimeUpdates();
    realTimePnL.unsubscribe(portfolioId, subscriptionId);
    console.log("Monitoring stopped");
  }, 600000); // 10 minutes
}
```

### Example 3: Performance Report Generation

```typescript
async function example3_performance(): Promise<void> {

  const engine = new PaperTradingEngine();
  await engine.initialize();

  const portfolioId = "your-portfolio-id";

  // Generate comprehensive performance report
  const report = await engine.generateReport(portfolioId, {
    period: "ALL_TIME",
    includeEquityCurve: true,
    includeMonthlyReturns: true,
    includeStrategyBreakdown: true,
    includeSymbolBreakdown: true,
  });

  console.log("=== PERFORMANCE REPORT ===\n");

  // Summary
  console.log("SUMMARY:");
  console.log(`Initial Balance: $${report.summary.initialBalance.toLocaleString()}`);
  console.log(`Current Value: $${report.summary.currentValue.toLocaleString()}`);
  console.log(`Total Return: $${report.summary.totalReturn.toLocaleString()} (${report.summary.totalReturnPercent.toFixed(2)}%)`);
  console.log(`Annualized Return: ${report.summary.annualizedReturn.toFixed(2)}%`);
  console.log(`Total Trades: ${report.summary.totalTrades}`);
  console.log(`Win Rate: ${report.summary.winRate.toFixed(2)}%`);
  console.log(`Profit Factor: ${report.summary.profitFactor.toFixed(2)}`);
  console.log(`Sharpe Ratio: ${report.summary.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${report.summary.maxDrawdownPercent.toFixed(2)}%`);

  // Win/Loss Analysis
  console.log("\nWIN/LOSS ANALYSIS:");
  console.log(`Winning Trades: ${report.winLossAnalysis.winningTrades} (${report.winLossAnalysis.winRate.toFixed(2)}%)`);
  console.log(`Losing Trades: ${report.winLossAnalysis.losingTrades} (${report.winLossAnalysis.lossRate.toFixed(2)}%)`);
  console.log(`Avg Win: $${report.winLossAnalysis.avgWin.toFixed(2)} (${report.winLossAnalysis.avgWinPercent.toFixed(2)}%)`);
  console.log(`Avg Loss: $${report.winLossAnalysis.avgLoss.toFixed(2)} (${report.winLossAnalysis.avgLossPercent.toFixed(2)}%)`);
  console.log(`Largest Win: $${report.winLossAnalysis.largestWin.toFixed(2)}`);
  console.log(`Largest Loss: $${report.winLossAnalysis.largestLoss.toFixed(2)}`);

  // Strategy Performance
  console.log("\nSTRATEGY PERFORMANCE:");
  for (const strategy of report.strategyPerformance) {
    console.log(`\n${strategy.strategy}:`);
    console.log(`  Trades: ${strategy.totalTrades}`);
    console.log(`  Win Rate: ${strategy.winRate.toFixed(2)}%`);
    console.log(`  Total P&L: $${strategy.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${strategy.profitFactor.toFixed(2)}`);
  }

  // Recommendations
  console.log("\nRECOMMENDATIONS:");
  for (const rec of report.recommendations) {
    console.log(`- ${rec}`);
  }

  // Export to file
  await fs.writeFile(
    `performance_report_${portfolioId}_${new Date().toISOString()}.json`,
    JSON.stringify(report, null, 2)
  );
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/paper-trading/execution-simulator.test.ts

import { describe, it, expect } from "vitest";
import { ExecutionSimulator } from "../src/paper-trading/execution-simulator";

describe("ExecutionSimulator", () => {

  describe("Market Order Execution", () => {

    it("should execute market buy order with slippage", async () => {
      const simulator = new ExecutionSimulator();

      const order: PaperOrder = {
        type: "MARKET",
        side: "BUY",
        symbol: "AAPL",
        quantity: 100,
        // ...other fields
      };

      const marketData: MarketData = {
        symbol: "AAPL",
        price: 150.00,
        bidPrice: 149.98,
        askPrice: 150.02,
        volume: 1000000,
      };

      const result = await simulator.simulateMarketOrder(order, mockPortfolio);

      expect(result.fillPrice).toBeGreaterThan(marketData.price);
      expect(result.fillQuantity).toBe(100);
      expect(result.slippage).toBeGreaterThan(0);
      expect(result.commission).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Slippage Calculation", () => {

    it("should calculate volume-based slippage correctly", () => {
      const calculator = new SlippageCalculator();

      const largeOrder: PaperOrder = {
        quantity: 10000, // 1% of volume
        // ...
      };

      const marketData: MarketData = {
        price: 100,
        avgVolume: 1000000,
      };

      const slippage = calculator.calculateVolumeBasedSlippage(
        largeOrder,
        marketData,
        1.0
      );

      expect(slippage).toBeGreaterThan(0);
      expect(slippage / marketData.price).toBeGreaterThan(0.0005); // > 5 bps
    });
  });
});
```

### Integration Tests

```typescript
// tests/paper-trading/integration.test.ts

describe("Paper Trading Integration", () => {

  it("should execute complete trade lifecycle", async () => {
    const engine = new PaperTradingEngine();
    await engine.initialize();

    // Create portfolio
    const portfolio = await engine.createPortfolio({
      name: "Test Portfolio",
      initialBalance: 100000,
    });

    // Create signal
    const signal: Signal = {
      symbol: "AAPL",
      action: "BUY",
      strength: 80,
      confidence: 85,
      strategy: "TEST",
      entryPrice: 150.00,
      // ...
    };

    // Execute trade
    const result = await engine.executeTrade(portfolio.id, signal);

    expect(result.order.status).toBe("FILLED");
    expect(result.position).toBeDefined();
    expect(result.position.quantity).toBeGreaterThan(0);

    // Verify cash updated
    const updatedPortfolio = await engine.getPortfolio(portfolio.id);
    expect(updatedPortfolio.currentBalance).toBeLessThan(portfolio.initialBalance);

    // Close position
    await engine.closePosition(portfolio.id, result.position.id);

    // Verify position closed
    const closedPosition = await engine.getPosition(portfolio.id, result.position.id);
    expect(closedPosition.quantity).toBe(0);
    expect(closedPosition.closedAt).toBeDefined();
  });
});
```

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)

**Deliverables:**
- [ ] SecureStorageService with encrypted persistence
- [ ] PaperPortfolio schema and PortfolioManager
- [ ] PaperOrder schema and OrderManager (basic)
- [ ] PaperPosition schema and position lifecycle
- [ ] TradeJournal with append-only JSONL storage
- [ ] Basic CLI commands: create, list, portfolio

**Testing:**
- Unit tests for all core classes
- Encryption/decryption validation
- Data persistence validation

### Phase 2: Order Execution & Simulation (Week 3)

**Deliverables:**
- [ ] ExecutionSimulator with all order types
- [ ] SlippageCalculator with multiple models
- [ ] CommissionCalculator with tiered pricing
- [ ] Market order execution
- [ ] Limit order execution
- [ ] Stop-loss order execution
- [ ] CLI commands: trade, order, cancel

**Testing:**
- Order execution simulations
- Slippage calculation accuracy
- Commission calculation tests
- Integration tests for order lifecycle

### Phase 3: Risk Management & Integration (Week 4)

**Deliverables:**
- [ ] PaperTradingRiskEnforcement
- [ ] Integration with existing RiskManager
- [ ] Integration with MeanReversionStrategy
- [ ] Integration with MomentumStrategy
- [ ] Auto-trading based on signals
- [ ] Risk limit enforcement
- [ ] CLI commands: close, positions, stop-monitor

**Testing:**
- Risk calculation validation
- Strategy integration tests
- Stop-loss trigger tests
- Position sizing accuracy

### Phase 4: Performance & Reporting (Week 5)

**Deliverables:**
- [ ] PerformanceCalculator with all metrics
- [ ] PerformanceReporter with comprehensive reports
- [ ] Equity curve generation
- [ ] Drawdown analysis
- [ ] Strategy/symbol performance breakdown
- [ ] CLI commands: performance, history, report

**Testing:**
- Performance metric calculations
- Report generation accuracy
- Historical analysis validation

### Phase 5: Real-time Updates & Monitoring (Week 6)

**Deliverables:**
- [ ] RealTimePnLService with subscriptions
- [ ] Portfolio state monitoring
- [ ] Stop-loss/take-profit monitoring
- [ ] Integration with MonitoringService
- [ ] CLI commands: monitor
- [ ] Background processing

**Testing:**
- Real-time update accuracy
- Subscription management
- Position price updates
- Stop-loss trigger validation

### Phase 6: Web Dashboard Integration (Week 7)

**Deliverables:**
- [ ] REST API endpoints
- [ ] WebSocket/Socket.IO real-time API
- [ ] Dashboard UI components
- [ ] Portfolio visualization
- [ ] Trade execution UI
- [ ] Performance charts
- [ ] Position management UI

**Testing:**
- API endpoint tests
- WebSocket communication tests
- UI integration tests
- E2E dashboard tests

### Phase 7: Advanced Features (Week 8)

**Deliverables:**
- [ ] Trailing stop orders
- [ ] Bracket orders (entry + stop + target)
- [ ] Partial fill simulation
- [ ] Market impact modeling
- [ ] Export/import functionality
- [ ] Backup/restore system
- [ ] Data migration tools

**Testing:**
- Advanced order type tests
- Import/export validation
- Backup/restore tests

### Phase 8: Documentation & Polish (Week 9)

**Deliverables:**
- [ ] Complete API documentation
- [ ] User guide and tutorials
- [ ] Code examples and recipes
- [ ] Video tutorials
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Logging enhancements

**Testing:**
- End-to-end testing
- Performance benchmarks
- Security audit
- User acceptance testing

---

## Success Metrics

### Technical Metrics

- **Test Coverage:** >85%
- **Performance:** Order execution <100ms, Position updates <500ms
- **Reliability:** 99.9% uptime for monitoring service
- **Security:** All data encrypted, no security vulnerabilities

### User Experience Metrics

- **Ease of Use:** New portfolio setup <2 minutes
- **Accuracy:** Order simulation within 0.1% of real-world execution
- **Transparency:** Complete audit trail for all trades
- **Confidence:** Users feel safe testing strategies before live trading

### Business Metrics

- **Adoption:** >100 paper trading portfolios created in first month
- **Engagement:** Average 50+ trades per portfolio
- **Retention:** >80% of users continue using after first week
- **Conversion:** 30% of users consider live trading after paper trading success

---

## Future Enhancements

### Advanced Order Types
- One-Cancels-Other (OCO) orders
- Good-Till-Date (GTD) orders
- Iceberg orders (display quantity)
- VWAP/TWAP algorithmic orders

### Enhanced Analytics
- Monte Carlo simulation
- Walk-forward analysis
- Strategy optimization
- Machine learning integration for fill simulation

### Multi-Asset Support
- Options trading simulation
- Futures contracts
- Forex pairs
- Cryptocurrency

### Social Features
- Strategy leaderboard
- Share performance publicly
- Copy trading (simulate following other portfolios)
- Community strategy library

### Live Trading Integration
- Alpaca API integration (paper trading mode)
- Interactive Brokers connection
- Transition from paper to live with one click
- Hybrid mode (some positions paper, some live)

---

## Conclusion

This paper trading system design provides Stock Sense AI with a comprehensive, secure, and realistic trading simulation platform. The system leverages the existing security architecture, integrates seamlessly with current strategies and monitoring systems, and provides users with confidence in their trading strategies before risking real capital.

**Key Strengths:**

1. **Security First:** AES-256 encryption, OS keychain integration, local-first
2. **Realistic Simulation:** Slippage, commissions, partial fills, market impact
3. **Comprehensive:** Complete order types, risk management, performance analytics
4. **Integrated:** Seamless connection with existing strategies and monitoring
5. **Extensible:** Clear architecture for future enhancements

The phased implementation roadmap ensures steady progress with continuous testing and validation. Upon completion, Stock Sense AI will offer one of the most sophisticated paper trading systems in the TypeScript ecosystem, filling a critical gap identified in the benchmark analysis.

---

**Document End**
**Total Design Pages:** ~80 pages
**Estimated Implementation Time:** 9 weeks (1 developer full-time)
**Lines of Code Estimate:** ~8,000-10,000 LOC
