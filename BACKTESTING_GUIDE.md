# Backtesting Framework Guide

## Overview

This is a professional-grade, event-driven backtesting framework for quantitative trading strategies. It features realistic order execution, comprehensive performance metrics, and zero look-ahead bias.

## Architecture

### Core Components

1. **Event System** (`src/backtesting/events/`)
   - `event-queue.ts`: Chronologically-ordered event processing
   - Ensures NO look-ahead bias
   - Priority-based event handling

2. **Execution Models** (`src/backtesting/execution/`)
   - `slippage-models.ts`: Four slippage models
     - Fixed BPS
     - Volume-based
     - Spread-based
     - Zero slippage
   - `commission-models.ts`: Four commission models
     - Zero commission (Robinhood, Webull)
     - Fixed per trade
     - Percentage-based
     - Per-share (IBKR Pro)
   - `fill-simulator.ts`: Realistic order fills

3. **Portfolio Management** (`src/backtesting/portfolio/`)
   - `portfolio-tracker.ts`: Position tracking, P&L calculations
   - Cash management
   - Realized/unrealized P&L
   - Equity curve generation

4. **Performance Analytics** (`src/backtesting/analytics/`)
   - `performance-metrics.ts`: Industry-standard metrics
     - 10 core metrics (Total Return, Sharpe, Max DD, Win Rate, etc.)
     - Plus 20+ additional metrics
   - Drawdown analysis
   - Win/loss statistics
   - Transaction cost tracking

5. **Data Management** (`src/backtesting/data/`)
   - `historical-data-manager.ts`: Load from CSV or API
   - Data validation and cleaning
   - Split/dividend adjustments
   - Caching for performance

6. **Backtest Engine** (`src/backtesting/engine/`)
   - `simple-backtest-engine.ts`: Main orchestrator
   - Event-driven architecture
   - Progress tracking

## Quick Start

### Installation

```bash
# Install dependencies (if not already installed)
npm install
```

### Basic Usage

```typescript
import { SimpleBacktestEngine } from "./src/backtesting/engine/simple-backtest-engine.js";
import { SimpleRSIStrategy } from "./src/backtesting/strategies/simple-rsi-strategy.js";
import { HistoricalDataManager } from "./src/backtesting/data/historical-data-manager.js";
import { FixedBPSSlippageModel, ZeroCommissionModel } from "./src/backtesting/execution/slippage-models.js";

// 1. Configure backtest
const config = {
  startDate: new Date("2023-01-01"),
  endDate: new Date("2023-12-31"),
  initialCapital: 10000,
  slippageModel: new FixedBPSSlippageModel(5), // 5 BPS
  commissionModel: new ZeroCommissionModel(),
  fillOnClose: true,
  adjustForSplits: false,
  adjustForDividends: false,
};

// 2. Create strategy
const strategy = new SimpleRSIStrategy({
  rsiPeriod: 14,
  oversoldThreshold: 30,
  overboughtThreshold: 70,
});

// 3. Load data
const dataManager = new HistoricalDataManager();
const bars = await dataManager.loadFromAPI("AAPL");

// 4. Run backtest
const engine = new SimpleBacktestEngine(config, strategy);
const result = await engine.run("AAPL", bars);

// 5. Analyze results
console.log(`Total Return: ${result.metrics.totalReturn.toFixed(2)}%`);
console.log(`Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`);
```

### Running the Example

```bash
# Run the simple RSI backtest example
npm run dev examples/backtest-simple-rsi.ts
```

## Slippage Models

### Fixed BPS Slippage
```typescript
const slippage = new FixedBPSSlippageModel(5); // 5 basis points
```
**Use for:** General purpose, small-cap stocks

### Volume-Based Slippage
```typescript
const slippage = new VolumeBasedSlippageModel(
  5,    // Base BPS
  100   // Scale factor
);
```
**Use for:** Large orders, realistic simulation
**Formula:** slippage = baseBPS + (orderSize / avgVolume) * scaleFactor

### Spread-Based Slippage
```typescript
const slippage = new SpreadBasedSlippageModel(
  5,    // Min spread BPS
  1.0   // Spread multiplier
);
```
**Use for:** Highly accurate simulation with spread data
**Assumes:** Market orders cross the spread

### Zero Slippage
```typescript
const slippage = new NoSlippageModel();
```
**Use for:** Optimistic backtests, limit orders

## Commission Models

### Zero Commission
```typescript
const commission = new ZeroCommissionModel();
```
**Brokers:** Robinhood, Webull, IBKR Lite

### Fixed Per Trade
```typescript
const commission = new FixedCommissionModel(4.95); // $4.95 per trade
```
**Brokers:** Traditional discount brokers

### Percentage-Based
```typescript
const commission = new PercentageCommissionModel(
  10,      // 10 BPS (0.1%)
  1.0,     // $1 minimum
  100.0    // $100 maximum
);
```
**Brokers:** Some international markets

### Per-Share
```typescript
const commission = new PerShareCommissionModel(
  0.005,   // $0.005 per share
  1.0,     // $1 minimum
  1.0      // $1 maximum
);
```
**Brokers:** Interactive Brokers Pro

## Performance Metrics

### Core Metrics (10)

1. **Total Return (%)**: Overall return percentage
2. **Sharpe Ratio**: Risk-adjusted return
3. **Maximum Drawdown (%)**: Largest peak-to-trough decline
4. **Win Rate (%)**: Percentage of winning trades
5. **Average Win/Loss ($)**: Average profit/loss per trade
6. **Profit Factor**: Gross profit / gross loss
7. **Total Trades**: Number of trades executed
8. **CAGR (%)**: Compound annual growth rate
9. **Calmar Ratio**: CAGR / Max Drawdown
10. **Sortino Ratio**: Return / downside deviation

### Additional Metrics

- Volatility (annualized)
- Payoff Ratio (avgWin / avgLoss)
- Expectancy ($ per trade)
- Average holding period
- Max consecutive wins/losses
- Transaction costs breakdown
- And more...

## Creating Custom Strategies

Implement the `BacktestStrategy` interface:

```typescript
import type {
  Bar,
  BacktestStrategy,
  PortfolioSnapshot,
  SignalEvent,
} from "../types/backtest-types.js";

export class MyStrategy implements BacktestStrategy {
  name = "MY_STRATEGY";

  initialize?(config: BacktestConfig): void {
    // Initialize strategy state
  }

  onBar(bar: Bar, portfolio: PortfolioSnapshot): SignalEvent | null {
    // Generate trading signals
    // Return BUY, SELL, or HOLD signal

    if (/* buy condition */) {
      return {
        type: "SIGNAL",
        timestamp: bar.timestamp,
        priority: 2,
        symbol: bar.symbol,
        action: "BUY",
        strength: 80,
        strategyName: this.name,
      };
    }

    return null; // HOLD
  }

  onFill?(fill: Fill): void {
    // Optional: Handle fill notifications
  }

  finalize?(result: BacktestResult): void {
    // Optional: Post-backtest analysis
  }
}
```

## Data Sources

### CSV Files
```typescript
const bars = await dataManager.loadFromCSV("./data/AAPL.csv", "AAPL");
```

CSV format:
```
date,open,high,low,close,volume
2023-01-03,125.07,125.42,124.17,125.07,112117471
2023-01-04,126.89,128.66,125.08,126.36,89113634
...
```

### Alpha Vantage API
```typescript
const source = {
  type: "API",
  apiKey: "YOUR_API_KEY", // Optional, uses config
};
const bars = await dataManager.loadData("AAPL", source);
```

## Preventing Look-Ahead Bias

The framework prevents look-ahead bias through:

1. **Event Queue Ordering**: Events sorted chronologically
2. **Fill Timing**: Fills occur at next bar (if `fillOnClose=false`)
3. **Data Access**: Strategy only sees past/current data
4. **Validation**: `eventQueue.validateChronologicalOrder()`

## Testing

### Unit Tests
```bash
npm test
```

### Integration Test
```bash
npm run dev examples/backtest-simple-rsi.ts
```

## Performance Tips

1. **Use CSV files** for faster repeated backtests
2. **Cache data** with HistoricalDataManager
3. **Limit date ranges** during development
4. **Batch symbol testing** with vectorized operations

## Next Steps (Weeks 5-8)

1. **Parameter Optimization**
   - Grid search
   - Random search
   - Genetic algorithms

2. **Walk-Forward Analysis**
   - In-sample / out-of-sample testing
   - Rolling window optimization

3. **Multi-Asset Backtesting**
   - Portfolio-level strategies
   - Correlation analysis

4. **Advanced Order Types**
   - Limit orders
   - Stop-loss orders
   - Position sizing algorithms

## Support

For issues or questions:
- Check IMPLEMENTATION_ROADMAP.md
- Review examples/ directory
- See type definitions in `types/backtest-types.ts`

## License

MIT
