# Backtesting Framework

A professional-grade, event-driven backtesting framework for trading strategies built with TypeScript. This framework provides realistic simulation of trading conditions including commission costs, slippage, and comprehensive performance analytics.

## Architecture Overview

The backtesting framework follows an **event-driven architecture** that closely mimics real-world trading conditions and avoids look-ahead bias.

### Core Components

```
src/backtesting/
├── engine/              # Core backtesting engine
│   ├── backtest-engine.ts      # Main orchestrator
│   ├── event-queue.ts          # Priority-based event queue
│   └── strategy-executor.ts    # Strategy execution handler
├── data/                # Data management
│   ├── historical-data-manager.ts  # Data loading & caching
│   ├── data-loader.ts              # Data source interfaces
│   └── types.ts                    # Data-related types
├── execution/           # Order execution simulation
│   ├── fill-simulator.ts       # Order fill simulation
│   ├── slippage-models.ts      # Slippage calculation models
│   └── commission-models.ts    # Commission models
├── portfolio/           # Portfolio management
│   ├── portfolio-tracker.ts    # Position & cash tracking
│   ├── position.ts             # Position class
│   └── trade.ts                # Trade record class
├── analytics/           # Performance analysis
│   ├── performance-metrics.ts  # Metrics calculator
│   └── equity-curve.ts         # Equity curve builder
└── types/               # Type definitions
    └── backtest-types.ts       # All core types
```

## Key Features

### 1. Event-Driven Architecture
- **No Look-Ahead Bias**: Events are processed in strict chronological order
- **Priority Queue**: Ensures correct event processing order (market data → signals → orders → fills)
- **Realistic Timing**: Separates signal generation from order execution

### 2. Comprehensive Execution Simulation

#### Commission Models
- **Zero Commission**: Modern commission-free brokers
- **Fixed Per Trade**: Traditional flat-fee structure
- **Per Share**: Professional platforms (e.g., Interactive Brokers)
- **Percentage**: Based on trade value
- **Pre-configured Presets**: Ready-to-use broker profiles

#### Slippage Models
- **Fixed BPS**: Constant percentage slippage
- **Volume-Based**: Scales with order size vs. market volume
- **Spread-Based**: Uses bid-ask spread estimation
- **No Slippage**: Perfect execution (for optimistic scenarios)

### 3. Portfolio Tracking
- Real-time position tracking
- Cash management
- Unrealized & realized P&L
- Maximum Adverse/Favorable Excursion (MAE/MFE)
- Portfolio snapshots for equity curve generation

### 4. Performance Metrics (30+ Metrics)

**Return Metrics:**
- Total Return, CAGR, Annualized Return
- Daily, Monthly, Yearly returns

**Risk Metrics:**
- Sharpe Ratio, Sortino Ratio, Calmar Ratio
- Volatility, Beta, Alpha
- Maximum Drawdown, Drawdown Duration
- Value at Risk (VaR), Conditional VaR

**Trade Statistics:**
- Win Rate, Profit Factor, Payoff Ratio
- Average Win/Loss, Largest Win/Loss
- Expectancy, Hold Duration
- Consecutive Wins/Losses

**Transaction Costs:**
- Total Commission, Total Slippage
- Cost Impact on Returns

## Usage Examples

### Basic Backtest

```typescript
import {
  BacktestEngine,
  HistoricalDataManager,
  MemoryDataLoader,
  type BacktestConfig,
  type BacktestStrategy,
} from './backtesting';

// 1. Define your strategy
class MyStrategy implements BacktestStrategy {
  getName() { return 'MY_STRATEGY'; }

  async generateSignal(symbol, currentData, historicalData) {
    // Your strategy logic here
    if (/* buy condition */) {
      return {
        symbol,
        action: 'BUY',
        strength: 80,
        strategy: 'MY_STRATEGY',
        confidence: 75,
        reasons: ['RSI oversold', 'Price below MA'],
        timestamp: currentData.timestamp,
        entryPrice: currentData.close,
      };
    }

    return { /* ... HOLD signal */ };
  }
}

// 2. Prepare historical data
const dataLoader = new MemoryDataLoader();
dataLoader.addData('AAPL', historicalData);
const dataManager = new HistoricalDataManager(dataLoader);

// 3. Configure backtest
const config: BacktestConfig = {
  id: 'backtest-001',
  name: 'My Strategy Backtest',
  symbols: ['AAPL'],
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-12-31'),
  initialCapital: 100000,
  strategy: {
    name: 'MY_STRATEGY',
    parameters: {},
  },
  commission: {
    type: 'FIXED',
    fixedFee: 1.0,
  },
  slippage: {
    type: 'FIXED_BPS',
    basisPoints: 5,
  },
};

// 4. Run backtest
const engine = new BacktestEngine(config, new MyStrategy(), dataManager);
const result = await engine.run();

// 5. Analyze results
console.log(`Total Return: ${result.metrics.totalReturn.toFixed(2)}%`);
console.log(`Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: ${(result.metrics.maxDrawdown * 100).toFixed(2)}%`);
console.log(`Win Rate: ${result.metrics.winRate.toFixed(2)}%`);
console.log(`Total Trades: ${result.metrics.totalTrades}`);
```

### Using Commission Presets

```typescript
import { CommissionPresets } from './backtesting';

// Use Interactive Brokers Pro pricing
config.commission = CommissionPresets.IBKR_PRO_TIERED;

// Or zero commission
config.commission = CommissionPresets.ROBINHOOD;
```

### Advanced Slippage Configuration

```typescript
import { VolumeBasedSlippageModel } from './backtesting';

// Slippage that scales with order size
const slippageModel = new VolumeBasedSlippageModel(
  5,    // Base slippage: 5 BPS
  100   // Scale factor: larger orders pay more slippage
);
```

## Type System

The framework is fully typed with comprehensive TypeScript interfaces:

```typescript
interface BacktestConfig {
  id: string;
  name: string;
  symbols: string[];
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategy: { name: string; parameters: Record<string, unknown> };
  commission: CommissionConfig;
  slippage: SlippageConfig;
  riskManagement?: RiskManagementConfig;
}

interface BacktestResult {
  config: BacktestConfig;
  timestamp: Date;
  executionTimeMs: number;
  metrics: PerformanceMetrics;
  equityCurve: EquityCurvePoint[];
  trades: Trade[];
  portfolioSnapshots: PortfolioSnapshot[];
  errors: BacktestError[];
  statistics: BacktestStatistics;
}
```

## Testing

The framework includes comprehensive test coverage:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific test
pnpm test backtest-engine.test.ts
```

Test files are located in `/tests/backtesting/`.

## Integration Points

### Existing Project Integration

The backtesting framework integrates seamlessly with existing components:

1. **Strategies**: Implements `BacktestStrategy` interface
   - Compatible with `MeanReversionStrategy`, `MomentumStrategy`
   - Uses existing `Signal` type from `src/types/trading.ts`

2. **Risk Management**: Can use `RiskManager` from `src/analysis/risk-manager.ts`
   - Position sizing
   - Stop loss / Take profit levels

3. **Technical Indicators**: Uses `TechnicalIndicators` from `src/analysis/technical-indicators.ts`
   - RSI, MACD, Bollinger Bands, etc.

## Performance Considerations

- **Event Queue**: O(log n) insert, O(1) peek
- **Data Caching**: LRU cache with configurable TTL
- **Memory Efficient**: Streaming architecture for large datasets
- **Target**: 1 year of daily data in <30 seconds

## Next Steps (Weeks 5-8)

1. **Parameter Optimization**
   - Grid search implementation
   - Random search
   - Genetic algorithm optimization
   - Walk-forward analysis

2. **Advanced Analytics**
   - Monte Carlo simulation
   - Scenario analysis
   - Stress testing
   - Correlation analysis

3. **Data Sources**
   - CSV file loader implementation
   - API integration (Alpha Vantage, Yahoo Finance)
   - Database connector

4. **Reporting**
   - HTML report generation
   - Chart visualization
   - Trade journal export
   - Performance comparison

## Contributing

When extending the framework:

1. Maintain **zero look-ahead bias**
2. Add **comprehensive JSDoc comments**
3. Include **unit tests** for new features
4. Follow **existing TypeScript patterns**
5. Run **biome linter** before committing

## License

MIT License - Part of Stock Sense AI project
