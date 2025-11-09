# Paper Trading System - Quick Reference Guide

**For:** Stock Sense AI Developers
**Date:** November 8, 2025

---

## Quick Start

### 1. Create Your First Portfolio (2 minutes)

```bash
# Create a $100K paper trading portfolio
stock-analyzer paper-trade create \
  --name "My First Portfolio" \
  --balance 100000 \
  --strategy MEAN_REVERSION \
  --max-risk 1 \
  --commission-type FIXED \
  --commission-amount 0
```

### 2. Execute Your First Trade (1 minute)

```bash
# Analyze and trade AAPL using mean reversion
stock-analyzer paper-trade trade \
  --portfolio <portfolio-id> \
  --symbol AAPL \
  --strategy MEAN_REVERSION
```

### 3. Monitor Your Portfolio (1 minute)

```bash
# View portfolio with real-time prices
stock-analyzer paper-trade portfolio \
  --portfolio <portfolio-id> \
  --refresh
```

---

## Essential CLI Commands

```bash
# PORTFOLIO MANAGEMENT
stock-analyzer paper-trade create          # Create new portfolio
stock-analyzer paper-trade list            # List all portfolios
stock-analyzer paper-trade portfolio -p ID # View portfolio details
stock-analyzer paper-trade delete -p ID    # Delete portfolio

# TRADING
stock-analyzer paper-trade trade -p ID -y SYMBOL -s STRATEGY  # Auto trade
stock-analyzer paper-trade order -p ID -y SYMBOL -t MARKET -s BUY -q 100  # Manual order
stock-analyzer paper-trade cancel -p ID --order ORDER_ID      # Cancel order
stock-analyzer paper-trade close -p ID --position POS_ID      # Close position

# MONITORING
stock-analyzer paper-trade positions -p ID --refresh    # View positions
stock-analyzer paper-trade orders -p ID --status PENDING  # View orders
stock-analyzer paper-trade history -p ID --limit 50     # Trade history
stock-analyzer paper-trade monitor -p ID --interval 60  # Real-time monitoring

# PERFORMANCE
stock-analyzer paper-trade performance -p ID            # Performance metrics
stock-analyzer paper-trade report -p ID --export report.pdf  # Generate report
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Stock Sense AI CLI                     │
└─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐            ┌────────▼──────────┐
│ Existing       │            │ Paper Trading     │
│ Systems        │            │ Engine            │
├────────────────┤            ├───────────────────┤
│• Strategies    │◄──────────►│• OrderManager     │
│• RiskManager   │            │• PortfolioManager │
│• Monitoring    │            │• ExecutionSim     │
│• MarketData    │            │• TradeJournal     │
│• Alerts        │            │• Performance      │
└────────────────┘            └───────────────────┘
                                      │
                        ┌─────────────┴──────────────┐
                        │                            │
                ┌───────▼────────┐        ┌─────────▼────────┐
                │ Encrypted      │        │  Web Dashboard   │
                │ Storage        │        │                  │
                │ (Local Files)  │        │• Portfolio View  │
                └────────────────┘        │• Real-time P&L   │
                                          │• Charts          │
                                          └──────────────────┘
```

---

## Core Components

### PaperTradingEngine
**Main orchestrator** - Coordinates all operations

```typescript
await engine.createPortfolio(params);
await engine.executeTrade(portfolioId, signal);
await engine.placeOrder(portfolioId, orderParams);
await engine.getPerformanceMetrics(portfolioId);
```

### PortfolioManager
**Portfolio state** - Cash, positions, calculations

```typescript
await portfolioManager.createPosition(portfolioId, data);
await portfolioManager.updateCashBalance(portfolioId, amount, reason);
await portfolioManager.calculateTotalValue(portfolioId);
```

### OrderManager
**Order lifecycle** - Create, validate, execute, cancel

```typescript
await orderManager.createOrder(portfolioId, orderParams);
await orderManager.validateOrder(portfolioId, orderParams);
await orderManager.processPendingOrders(portfolioId, prices);
```

### ExecutionSimulator
**Realistic fills** - Slippage, costs, partial fills

```typescript
await simulator.simulateMarketOrder(order, portfolio);
await simulator.simulateLimitOrder(order, currentPrice, portfolio);
await simulator.calculateSlippage(order, marketData, settings);
```

### TradeJournal
**Immutable history** - Append-only trade log

```typescript
await journal.recordTrade(portfolioId, trade);
await journal.getTradeHistory(portfolioId, filters);
await journal.exportToCSV(portfolioId);
```

### PerformanceCalculator
**Analytics** - Returns, risk metrics, reports

```typescript
await calculator.calculatePerformance(portfolioId, "ALL_TIME");
await calculator.generateEquityCurve(portfolioId);
await calculator.calculateSharpeRatio(returns, riskFreeRate);
```

---

## Data Schemas (Simplified)

### PaperPortfolio
```typescript
{
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number;
  totalValue: number;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  riskParams: RiskParameters;
  commissionModel: CommissionModel;
  stats: PortfolioStatistics;
}
```

### PaperOrder
```typescript
{
  id: string;
  portfolioId: string;
  symbol: string;
  type: "MARKET" | "LIMIT" | "STOP_LOSS" | "TRAILING_STOP";
  side: "BUY" | "SELL";
  quantity: number;
  status: "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";
  fills: OrderFill[];
}
```

### PaperPosition
```typescript
{
  id: string;
  portfolioId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  stopLoss?: number;
  takeProfit?: number;
  strategy: string;
}
```

### TradeJournalEntry
```typescript
{
  id: string;
  portfolioId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission: number;
  slippage: number;
  pnlImpact?: PnLImpact;  // For closing trades
  timestamp: Date;
  readonly: true;  // Immutable
}
```

---

## Order Types Reference

### Market Order
- **Execution:** Immediate at current market price
- **Slippage:** Moderate (bid-ask spread + impact)
- **Use Case:** Need immediate fill, price is acceptable
- **Example:**
  ```bash
  stock-analyzer paper-trade order -p ID -y AAPL -t MARKET -s BUY -q 100
  ```

### Limit Order
- **Execution:** Only at specified price or better
- **Slippage:** Minimal (favorable price)
- **Use Case:** Patient entry, want specific price
- **Example:**
  ```bash
  stock-analyzer paper-trade order -p ID -y AAPL -t LIMIT -s BUY -q 100 -l 150.00
  ```

### Stop-Loss Order
- **Execution:** Becomes market order when stop price hit
- **Slippage:** Higher (emergency exit)
- **Use Case:** Risk management, protect against losses
- **Example:**
  ```bash
  stock-analyzer paper-trade order -p ID -y AAPL -t STOP_LOSS -s SELL -q 100 --stop-price 145.00
  ```

### Trailing Stop
- **Execution:** Stop price follows market by % or $
- **Slippage:** Higher (emergency exit)
- **Use Case:** Lock in profits while allowing upside
- **Example:**
  ```bash
  stock-analyzer paper-trade order -p ID -y AAPL -t TRAILING_STOP -s SELL -q 100 --trailing-percent 5
  ```

---

## Slippage Models

### Fixed Basis Points
- **Default:** 5 bps (0.05%)
- **Simple and predictable**
- **Best for:** Conservative estimates
```typescript
slippageModel: "FIXED_BPS",
fixedSlippageBps: 5
```

### Volume-Based
- **Adjusts based on order size vs daily volume**
- **Small orders (<0.1% volume): 2-5 bps**
- **Large orders (>1% volume): 10-50 bps**
- **Best for:** Realistic simulation
```typescript
slippageModel: "VOLUME_BASED",
marketImpactFactor: 1.0
```

### Spread-Based
- **Uses actual bid-ask spread**
- **Most realistic for liquid stocks**
- **Best for:** High-accuracy backtesting
```typescript
slippageModel: "SPREAD_BASED"
```

---

## Commission Models

### Zero Commission (Default)
```typescript
commissionModel: {
  type: "FIXED",
  fixedFee: 0
}
```

### Fixed Per Trade
```typescript
commissionModel: {
  type: "FIXED",
  fixedFee: 1.00  // $1 per trade
}
```

### Percentage-Based
```typescript
commissionModel: {
  type: "PERCENTAGE",
  percentageFee: 0.0001,  // 0.01% = 1 bp
  minFee: 1.00,
  maxFee: 20.00
}
```

### Tiered (Interactive Brokers Style)
```typescript
commissionModel: {
  type: "TIERED"
  // $0.005/share, $1 min
  // Calculated automatically
}
```

---

## Risk Parameters

### Default Settings
```typescript
riskParams: {
  maxRiskPerTrade: 0.01,        // 1% of portfolio
  maxPositionSize: 0.25,        // 25% max position
  stopLossMultiplier: 2.0,      // 2x ATR
  takeProfitRatio: 2.0,         // 2:1 R:R
  maxCorrelatedPositions: 3,
  maxSectorExposure: 0.30       // 30% max per sector
}
```

### Conservative Settings
```typescript
riskParams: {
  maxRiskPerTrade: 0.005,       // 0.5%
  maxPositionSize: 0.15,        // 15%
  stopLossMultiplier: 1.5,      // 1.5x ATR
  takeProfitRatio: 3.0,         // 3:1 R:R
  maxCorrelatedPositions: 2,
  maxSectorExposure: 0.20       // 20%
}
```

### Aggressive Settings
```typescript
riskParams: {
  maxRiskPerTrade: 0.02,        // 2%
  maxPositionSize: 0.40,        // 40%
  stopLossMultiplier: 2.5,      // 2.5x ATR
  takeProfitRatio: 1.5,         // 1.5:1 R:R
  maxCorrelatedPositions: 5,
  maxSectorExposure: 0.40       // 40%
}
```

---

## Performance Metrics

### Returns
- **Total Return:** $ and % since inception
- **Annualized Return:** Extrapolated yearly return
- **Monthly Returns:** Month-by-month breakdown
- **Realized P&L:** Closed positions
- **Unrealized P&L:** Open positions

### Risk Metrics
- **Sharpe Ratio:** Risk-adjusted returns (>1.0 good, >2.0 excellent)
- **Sortino Ratio:** Downside-adjusted returns
- **Calmar Ratio:** Return / max drawdown
- **Maximum Drawdown:** Worst peak-to-trough decline
- **Volatility:** Standard deviation of returns

### Trade Statistics
- **Total Trades:** Number of closed positions
- **Win Rate:** % of profitable trades
- **Profit Factor:** Gross profit / gross loss (>1.5 good)
- **Expectancy:** Average $ per trade
- **Avg Win / Avg Loss:** Win/loss size comparison

---

## Web Dashboard API

### REST Endpoints
```
GET    /api/paper-trade/portfolios                  # List portfolios
POST   /api/paper-trade/portfolios                  # Create portfolio
GET    /api/paper-trade/portfolios/:id              # Get portfolio
PUT    /api/paper-trade/portfolios/:id              # Update portfolio
DELETE /api/paper-trade/portfolios/:id              # Delete portfolio

POST   /api/paper-trade/portfolios/:id/orders       # Place order
GET    /api/paper-trade/portfolios/:id/orders       # Get orders
DELETE /api/paper-trade/portfolios/:id/orders/:oid  # Cancel order

GET    /api/paper-trade/portfolios/:id/positions    # Get positions
POST   /api/paper-trade/portfolios/:id/positions/:pid/close  # Close position

GET    /api/paper-trade/portfolios/:id/trades       # Trade history
GET    /api/paper-trade/portfolios/:id/performance  # Performance metrics
```

### WebSocket Events
```javascript
// Client -> Server
socket.emit('subscribe:portfolio', portfolioId);
socket.emit('order:place', orderData);

// Server -> Client
socket.on('portfolio:state', (state) => { ... });
socket.on('portfolio:update', (update) => { ... });
socket.on('pnl:update', (updates) => { ... });
socket.on('order:placed', (order) => { ... });
```

---

## Security Checklist

- [x] All data encrypted with AES-256-CBC
- [x] Encryption keys stored in OS keychain
- [x] File permissions set to 0600 (owner only)
- [x] No cloud storage (100% local)
- [x] Trade journal is append-only (immutable)
- [x] Backups created before deletions
- [x] Risk disclaimers displayed
- [x] Trading halt mechanisms active
- [x] Complete audit trail maintained

---

## Integration Points

### Existing Systems Used
- **SecureConfig:** Encryption keys, secure storage
- **RiskManager:** Position sizing, risk validation
- **MarketDataService:** Price quotes, historical data
- **AlertService:** Trade notifications, risk alerts
- **MeanReversionStrategy:** Signal generation
- **MomentumStrategy:** Signal generation
- **MonitoringService:** Auto-discovery, scanning
- **TechnicalIndicators:** ATR, RSI, MACD calculations

### No Breaking Changes
- All existing functionality remains unchanged
- Paper trading is completely optional
- Uses same configuration and API keys
- Extends existing types and interfaces

---

## Common Workflows

### 1. Test Strategy on Historical Data
```bash
# Create portfolio
PORTFOLIO_ID=$(stock-analyzer paper-trade create \
  --name "Backtest Q4 2025" \
  --balance 100000 \
  --strategy MEAN_REVERSION | grep 'ID:' | cut -d' ' -f2)

# Run strategy on multiple symbols
for symbol in AAPL MSFT GOOGL AMZN; do
  stock-analyzer paper-trade trade \
    --portfolio $PORTFOLIO_ID \
    --symbol $symbol \
    --strategy MEAN_REVERSION \
    --force
done

# Generate report
stock-analyzer paper-trade performance --portfolio $PORTFOLIO_ID
```

### 2. Monitor Portfolio with Auto-Trading
```bash
# Create portfolio
PORTFOLIO_ID="..."

# Start monitoring with auto-trade
stock-analyzer paper-trade monitor \
  --portfolio $PORTFOLIO_ID \
  --auto-trade \
  --strategy MEAN_REVERSION \
  --stop-loss-check \
  --process-pending
```

### 3. Compare Strategies
```bash
# Create two portfolios
PORT_MR=$(stock-analyzer paper-trade create --name "Mean Reversion" ...)
PORT_MOM=$(stock-analyzer paper-trade create --name "Momentum" ...)

# Trade same symbols with different strategies
stock-analyzer paper-trade trade -p $PORT_MR -y AAPL -s MEAN_REVERSION
stock-analyzer paper-trade trade -p $PORT_MOM -y AAPL -s MOMENTUM

# Compare performance
stock-analyzer paper-trade performance -p $PORT_MR > mr_performance.txt
stock-analyzer paper-trade performance -p $PORT_MOM > mom_performance.txt
```

---

## Troubleshooting

### "Insufficient funds" error
- Check available cash: `stock-analyzer paper-trade portfolio -p ID`
- Position may be too large - reduce quantity or increase balance
- Remember commissions/slippage reduce available cash

### Order not filling (limit/stop orders)
- Check current price vs order price
- Limit buy: market must drop to limit price
- Stop sell: market must drop to stop price
- Use `--type MARKET` for immediate fill

### "Trading halted" message
- Portfolio risk exceeded limits
- Check: `stock-analyzer paper-trade performance -p ID`
- Possible causes: >10% portfolio risk, >15% drawdown, >5% daily loss
- Close some positions to reduce risk

### Slippage seems too high
- Check slippage model in portfolio settings
- Volume-based slippage increases with order size
- Try: `--slippage-model FIXED_BPS --fixed-slippage-bps 3`

### Performance metrics showing NaN
- Need at least one closed trade for most metrics
- Open positions show unrealized P&L only
- Close a position to see realized metrics

---

## Best Practices

### Portfolio Setup
1. Start with $100K virtual balance (realistic)
2. Use zero commissions for strategy testing
3. Enable slippage (realistic simulation)
4. Set conservative risk limits initially
5. Name portfolios descriptively

### Trading
1. Let strategies auto-size positions (don't override)
2. Only trade signals >70% confidence
3. Always use stop losses
4. Review risk before each trade
5. Don't overtrade (max 2-3 trades/day)

### Risk Management
1. Never risk >2% per trade
2. Keep position sizes under 25%
3. Limit sector exposure to 30%
4. Monitor drawdowns closely
5. Stop trading if down >10%

### Performance Analysis
1. Wait for 20+ trades before evaluating
2. Look at profit factor, not just win rate
3. Compare against buy-and-hold
4. Review losing trades for patterns
5. Generate monthly reports

### Strategy Validation
1. Test on 100+ historical signals
2. Compare multiple time periods
3. Test in different market conditions
4. Validate with walk-forward analysis
5. Never curve-fit parameters

---

## File Locations

```
data/paper-trading/
  ├── portfolio_{id}.encrypted          # Portfolio state
  ├── positions_{id}.encrypted          # Current positions
  ├── orders_{id}.encrypted             # All orders
  ├── trades_{id}.jsonl.encrypted       # Trade journal (append-only)
  ├── performance_{id}.encrypted        # Calculated metrics
  └── backups/
      └── {id}_{timestamp}/             # Backup snapshots
```

---

## Support & Resources

### Documentation
- Full Design: `/PAPER_TRADING_SYSTEM_DESIGN.md`
- Part 2: `/PAPER_TRADING_SYSTEM_DESIGN_PART2.md`
- This Guide: `/PAPER_TRADING_QUICK_REFERENCE.md`

### Code Examples
- See Part 2 "Code Examples" section
- Look in `tests/paper-trading/` for more examples

### Getting Help
1. Check this quick reference first
2. Review error messages carefully
3. Use `--help` on any command
4. Check portfolio status: `stock-analyzer paper-trade portfolio -p ID`
5. Review trade history: `stock-analyzer paper-trade history -p ID`

---

**Quick Reference Version 1.0**
**Last Updated:** November 8, 2025
