# Phase 1 Research: Backtesting Fix

## 1. Current State

### Backtest Commands (`src/cli/backtest-commands.ts`)
The CLI module exists and is well-structured with:
- **Lines 1-52**: Imports and StrategyAdapter class (converts trading strategies to backtest strategies)
- **Lines 53-155**: `backtest run` command implementation
- **Lines 160-249**: `backtest compare` command for strategy comparison
- Display functions for results

### Backtest Engine (`src/backtesting/engine/backtest-engine.ts`)
Full event-driven architecture:
- Constructor taking BacktestConfig, BacktestStrategy, DataProvider
- Main `run()` method returning Promise<BacktestResult>
- Event processing loop for MARKET_DATA, SIGNAL, ORDER, FILL events
- Portfolio tracking and equity curve generation
- Performance calculation via PerformanceMetricsCalculator

### Simple Backtest Engine (`src/backtesting/engine/simple-backtest-engine.ts`)
Streamlined implementation:
- Single `run()` method: `async run(symbol: string, bars: Bar[]): Promise<BacktestResult>`
- Takes symbol and historical bars directly
- Simpler than BacktestEngine but fully functional

### Type Definitions (`src/backtesting/types/backtest-types.ts`)
Complete type system:
- **BacktestConfig interface**: Complete configuration structure
- **BacktestResult interface**: Result with metrics, trades, equity curve
- **BacktestStrategy interface**: Strategy contract with `generateSignal()`, `onBar()`, etc.
- **PerformanceMetrics**: 20+ metrics including Sharpe, Sortino, Calmar, max drawdown
- **Trade interface**: Complete trade record structure

### Supporting Infrastructure
All components present:
- HistoricalDataManager, PortfolioTracker, FillSimulator
- PerformanceMetricsCalculator (80+ metrics capability)
- GridSearchOptimizer and WalkForwardAnalyzer

---

## 2. Root Cause Analysis

### Why Commands Are Commented Out
Location: `src/index.ts` (lines 21-22, 1030-1031)

The TODO states: "Fix type mismatches in backtest-commands.ts before enabling"

**Finding: No actual type mismatches exist in current code.**

Evidence:
1. StrategyAdapter properly implements BacktestStrategy interface
2. SimpleBacktestEngine usage is correct with proper types
3. Import chain validates correctly

**Actual root cause**: The comment persists from an earlier development phase. Code has been refactored but comment was never removed.

---

## 3. Type Issues Found

### Minor Issues (Recommended Fixes)

1. **StrategyAdapter.generateSignal()** (lines 34-42):
   ```typescript
   async generateSignal(
     symbol: string,
     currentData: any,        // Should be HistoricalDataPoint
     historicalData: any[]
   ): Promise<any> {          // Should return Signal
   ```

2. **BacktestEngine vs SimpleBacktestEngine**:
   - BacktestEngine.run(): `async run(): Promise<BacktestResult>` (no params)
   - SimpleBacktestEngine.run(): `async run(symbol, bars): Promise<BacktestResult>`
   - CLI uses SimpleBacktestEngine correctly

3. **DataProvider missing**:
   - BacktestEngine requires DataProvider in constructor
   - SimpleBacktestEngine bypasses this (doesn't need DataProvider)

---

## 4. Dependencies

### Data Dependencies ✓
- MarketDataService provides historical data
- Returns HistoricalData[] compatible with Bar[]

### Strategy Dependencies ✓
- MeanReversionStrategy and MomentumStrategy return Signal type
- StrategyAdapter bridges strategy → backtest strategy

### Configuration Dependencies ✓
- All BacktestConfig requirements satisfied
- Commission and slippage models available

### External Service Dependencies ✓
- MarketDataService integrated
- Technical indicators present in strategies

---

## 5. Solution Approach

### Priority 1: Enable Commands (Minimal Change)
1. Uncomment import in `src/index.ts` line 22
2. Uncomment registration in `src/index.ts` line 1031
3. Remove outdated TODO comment

This will work immediately with SimpleBacktestEngine path.

### Priority 2: Fix Type Annotations
- Add proper types to StrategyAdapter's `generateSignal()`
- Replace `any` with actual types

### Priority 3: Full BacktestEngine Support (Optional)
- Create MarketDataProvider wrapper implementing DataProvider
- Would enable grid search and walk-forward analysis via BacktestEngine

---

## 6. Files Requiring Changes

| File | Change | Priority |
|------|--------|----------|
| `src/index.ts` | Uncomment lines 21-22, 1030-1031 | P1 |
| `src/cli/backtest-commands.ts` | Fix StrategyAdapter types | P2 |
| `src/backtesting/` | Create DataProvider wrapper | P3 |

---

## 7. Key Takeaway

**The backtest commands are safe to enable immediately.** The "type mismatches" mentioned in the TODO no longer exist. The infrastructure is complete and ready for use.

Verification steps after enabling:
1. `pnpm build` should pass
2. `stock-analyzer backtest run --symbol AAPL --strategy momentum` should execute
3. `stock-analyzer backtest compare --symbol MSFT` should run comparisons

---

*Research completed: 2026-01-16*
