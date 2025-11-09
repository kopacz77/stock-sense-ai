# Paper Trading System - Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Example

```bash
npm run paper-trading:example
```

### 3. Use CLI

```bash
# Start trading
stock-analyzer paper start --strategy mean-reversion --capital 10000

# Check status
stock-analyzer paper status

# View portfolio
stock-analyzer paper portfolio

# View performance
stock-analyzer paper performance

# Stop trading
stock-analyzer paper stop
```

---

## Quick Code Example

```typescript
import { PaperTradingEngine } from "./paper-trading/index.js";
import { MeanReversionStrategy } from "./strategies/mean-reversion-strategy.js";
import { FixedBPSSlippageModel } from "./backtesting/execution/slippage-models.js";
import { ZeroCommissionModel } from "./backtesting/execution/commission-models.js";

// 1. Configure
const config = {
  initialCapital: 10000,
  slippageModel: new FixedBPSSlippageModel(5),
  commissionModel: new ZeroCommissionModel(),
  maxPositionSize: 2500,
  maxPositionPercent: 0.25,
  maxPositions: 10,
  maxDailyLoss: 500,
  enforceMarketHours: true,
  dataRefreshInterval: 60000,
};

// 2. Initialize
const engine = new PaperTradingEngine(config);
await engine.initialize();

// 3. Create strategy
const strategy = new MeanReversionStrategy({
  rsiOversold: 30,
  rsiOverbought: 70,
  minConfidence: 60,
});

// 4. Start trading
await engine.start(strategy, ["AAPL", "MSFT", "GOOGL"]);

// 5. Monitor
engine.on("position-closed", ({ trade }) => {
  console.log(`P&L: $${trade.netPnL.toFixed(2)}`);
});
```

---

## Order Types Cheat Sheet

### Market Order
```typescript
createOrder({
  symbol: "AAPL",
  type: "MARKET",
  side: "BUY",
  quantity: 10,
});
```

### Limit Order
```typescript
createOrder({
  symbol: "AAPL",
  type: "LIMIT",
  side: "BUY",
  quantity: 10,
  limitPrice: 150.00,
});
```

### Stop Loss
```typescript
createOrder({
  symbol: "AAPL",
  type: "STOP_LOSS",
  side: "SELL",
  quantity: 10,
  stopPrice: 145.00,
});
```

### Trailing Stop (Percentage)
```typescript
createOrder({
  symbol: "AAPL",
  type: "TRAILING_STOP",
  side: "SELL",
  quantity: 10,
  trailingPercent: 3, // 3% trailing
});
```

---

## API Endpoints

```bash
# Status
curl http://localhost:3000/api/paper/status

# Portfolio
curl http://localhost:3000/api/paper/portfolio

# Orders
curl http://localhost:3000/api/paper/orders

# Trades (last 10)
curl http://localhost:3000/api/paper/trades?limit=10

# Performance
curl http://localhost:3000/api/paper/performance

# Dashboard summary
curl http://localhost:3000/api/paper/dashboard

# Stop trading
curl -X POST http://localhost:3000/api/paper/stop
```

---

## Performance Metrics

| Metric | Description |
|--------|-------------|
| Total Return | Overall profit/loss (%) |
| Sharpe Ratio | Risk-adjusted return |
| Max Drawdown | Largest peak-to-trough decline |
| Win Rate | Percentage of winning trades |
| Profit Factor | Gross profit / Gross loss |
| Expectancy | Average profit per trade |

---

## Risk Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| maxPositionSize | $2500 | Max $ per position |
| maxPositionPercent | 25% | Max % of portfolio |
| maxPositions | 10 | Max concurrent positions |
| maxDailyLoss | $500 | Daily loss limit |
| maxSymbolConcentration | 30% | Max in single symbol |
| maxTotalExposure | 80% | Max portfolio exposure |

---

## File Locations

```
Configuration:
  src/paper-trading/types/paper-trading-types.ts

Main Engine:
  src/paper-trading/engine/paper-trading-engine.ts

CLI:
  src/cli/paper-trading-commands.ts

API:
  src/paper-trading/api/paper-trading-api.ts

Example:
  examples/paper-trading-example.ts

Data Storage:
  data/paper-trading/
    ├── portfolio-state.enc
    ├── orders.enc.jsonl
    ├── trades.enc.jsonl
    └── journal.enc.jsonl
```

---

## Troubleshooting

### Issue: "Insufficient cash"
**Solution:** Reduce position size or increase initial capital

### Issue: "Risk limit breached"
**Solution:** Adjust risk limits in config or reduce position sizes

### Issue: "Market closed"
**Solution:** Set `enforceMarketHours: false` or trade during market hours

### Issue: "Order rejected"
**Solution:** Check risk validator reasons in logs

---

## Next Steps

1. **Customize Strategy**: Edit strategy parameters
2. **Add Symbols**: Expand symbol list
3. **Adjust Risk**: Tune risk limits
4. **Monitor Performance**: Track metrics
5. **Export Data**: Use CSV export for analysis
6. **Build Dashboard**: Use API for web interface

---

## Complete Documentation

See [PAPER_TRADING_SYSTEM.md](./PAPER_TRADING_SYSTEM.md) for comprehensive documentation.
