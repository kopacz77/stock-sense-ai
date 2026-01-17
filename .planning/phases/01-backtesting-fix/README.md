# Phase 1: Backtesting Fix

## Overview

Restore full backtesting functionality via CLI so users can run backtests, optimize parameters, perform walk-forward analysis, and view comprehensive performance reports.

## Requirements Covered

| REQ-ID | Description | Status |
|--------|-------------|--------|
| BACK-01 | User can run backtests via CLI with `backtest run` command | pending |
| BACK-02 | User can optimize strategy parameters via grid search | pending |
| BACK-03 | User can validate strategies with walk-forward analysis | pending |
| BACK-04 | User can view performance reports with 30+ metrics and equity curves | pending |

## Problem Statement

The backtesting module exists in `src/backtesting/` but the CLI commands are disabled due to type mismatches:

```typescript
// src/index.ts (lines 21-22)
// TODO: Fix type mismatches in backtest-commands.ts before enabling
// import { registerBacktestCommands } from "./cli/backtest-commands.js";
```

## Key Files

- `src/index.ts` - CLI entry point (commands disabled)
- `src/cli/backtest-commands.ts` - CLI command definitions
- `src/backtesting/engine/backtest-engine.ts` - Core backtest engine
- `src/backtesting/optimization/grid-search.ts` - Parameter optimization
- `src/backtesting/optimization/walk-forward.ts` - Walk-forward analysis
- `src/backtesting/analytics/performance-metrics.ts` - Metrics calculation
- `src/backtesting/analytics/equity-curve.ts` - Equity curve generation

## Success Criteria

1. `stock-analyzer backtest run --symbol AAPL --strategy rsi --start 2025-01-01 --end 2025-12-01` executes without errors
2. `stock-analyzer backtest optimize --strategy rsi --param-ranges '{"period":[7,14,21]}'` completes grid search
3. `stock-analyzer backtest walk-forward --symbol AAPL --strategy momentum --windows 4` runs validation
4. Performance report shows 30+ metrics including Sharpe ratio, max drawdown, equity curve
5. All backtest CLI commands uncommented and registered

## Plans

Plans will be created in this directory as work progresses.

---

*Phase Status: initialized*
