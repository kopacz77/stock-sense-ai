# Stock Sense AI - Test Suite Documentation

## Overview

This document describes the comprehensive test suite for Stock Sense AI's Q1 components: backtesting, paper trading, risk management, and data infrastructure.

**Target:** 80%+ test coverage
**Status:** In Progress
**Framework:** Vitest with V8 coverage provider

---

## Test Organization

### Directory Structure

```
tests/
├── backtesting/           # Backtesting framework tests
│   ├── engine/           # Core engine tests
│   ├── data/             # Data loading & validation
│   ├── execution/        # Order fill simulation
│   ├── portfolio/        # Portfolio tracking & P&L
│   ├── analytics/        # Performance metrics
│   └── optimization/     # Parameter optimization
├── paper-trading/        # Paper trading system tests
│   ├── engine/           # Paper trading engine
│   ├── portfolio/        # Virtual portfolio management
│   ├── orders/           # Order lifecycle
│   ├── execution/        # Execution simulation
│   ├── journal/          # Trade journaling
│   ├── performance/      # Performance calculation
│   ├── risk/             # Pre-trade validation
│   └── storage/          # Encrypted storage
├── risk/                 # Risk management tests
│   ├── metrics/          # VaR, CVaR calculations
│   ├── correlation/      # Correlation matrix
│   ├── position-sizing/  # Kelly Criterion
│   ├── simulation/       # Monte Carlo
│   ├── stress/           # Stress testing
│   ├── validation/       # Pre-trade checks
│   ├── reporting/        # Risk reports
│   └── alerts/           # Risk alerts
├── data/                 # Data infrastructure tests
│   ├── providers/        # API provider tests
│   ├── cache-manager.test.ts
│   ├── csv-loader.test.ts
│   ├── data-validator.test.ts
│   ├── market-data-service.test.ts
│   └── rate-limiter.test.ts
├── integration/          # Integration tests
│   ├── backtest-to-optimization.test.ts
│   ├── paper-trading-with-risk.test.ts
│   ├── data-to-backtest.test.ts
│   ├── strategy-integration.test.ts
│   ├── cli-commands.test.ts
│   └── end-to-end-workflow.test.ts
├── performance/          # Performance benchmarks
│   ├── backtesting-performance.test.ts
│   ├── optimization-performance.test.ts
│   ├── risk-performance.test.ts
│   └── data-caching-performance.test.ts
└── utils/                # Test utilities & mocks
    ├── mock-data-provider.ts
    ├── mock-market-data.ts
    ├── test-strategies.ts
    └── test-portfolios.ts
```

---

## Test Commands

### Basic Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test backtesting/engine

# Run specific test suite
pnpm test portfolio-tracker
```

### Coverage Analysis

```bash
# Run with coverage report
pnpm test -- --coverage

# Generate HTML coverage report
pnpm test -- --coverage --reporter=html

# View coverage in browser
open coverage/index.html
```

### Specific Test Modules

```bash
# Backtesting tests only
pnpm test backtesting

# Paper trading tests only
pnpm test paper-trading

# Risk management tests only
pnpm test risk

# Data infrastructure tests only
pnpm test data

# Integration tests only
pnpm test integration

# Performance tests only
pnpm test performance
```

---

## Test Categories

### 1. Unit Tests (60% of tests)

**Backtesting Unit Tests:**
- ✅ `backtest-engine.test.ts` - Core engine execution, event processing
- ✅ `data-loader.test.ts` - Historical data loading, validation
- ✅ `fill-simulator.test.ts` - All order types, slippage, commission (CRITICAL)
- ✅ `portfolio-tracker.test.ts` - Position tracking, P&L calculation (CRITICAL)
- ✅ `performance-metrics.test.ts` - All 30+ metric calculations (CRITICAL)
- ✅ `grid-search.test.ts` - Parameter optimization
- ⚠️ `random-search.test.ts` - Random optimization (TODO)
- ⚠️ `walk-forward.test.ts` - Walk-forward analysis (TODO)

**Paper Trading Unit Tests:**
- ⚠️ `portfolio-manager.test.ts` - Cash, positions, limits (TODO)
- ⚠️ `order-manager.test.ts` - All 5 order types, lifecycle (TODO)
- ⚠️ `execution-simulator.test.ts` - Realistic fills (TODO)
- ⚠️ `trade-journal.test.ts` - Append-only, encryption (TODO)
- ⚠️ `performance-calculator.test.ts` - 25+ metrics (TODO)
- ⚠️ `pre-trade-validator.test.ts` - All 7 risk checks (TODO)
- ⚠️ `encrypted-storage.test.ts` - Encryption, integrity (TODO)
- ⚠️ `paper-trading-engine.test.ts` - End-to-end (TODO)

**Risk Management Unit Tests:**
- ⚠️ `var-calculator.test.ts` - Historical, Parametric, Monte Carlo VaR (CRITICAL - Started)
- ⚠️ `cvar-calculator.test.ts` - Conditional VaR (TODO)
- ⚠️ `correlation-matrix.test.ts` - Correlation calculations (TODO)
- ⚠️ `kelly-criterion.test.ts` - Position sizing (TODO)
- ⚠️ `monte-carlo.test.ts` - Simulation accuracy (TODO)
- ⚠️ `stress-tester.test.ts` - Scenario testing (TODO)
- ⚠️ `pre-trade-validator.test.ts` - Risk validation (TODO)
- ⚠️ `risk-reporter.test.ts` - Report generation (TODO)
- ⚠️ `risk-alerter.test.ts` - Alert triggering (TODO)

**Data Infrastructure Unit Tests:**
- ⚠️ `market-data-service.test.ts` - Fetching, caching (TODO)
- ⚠️ `csv-loader.test.ts` - CSV parsing, validation (TODO)
- ⚠️ `cache-manager.test.ts` - Storage, expiration (TODO)
- ⚠️ `alpha-vantage-provider.test.ts` - API mocking (TODO)
- ⚠️ `finnhub-provider.test.ts` - API mocking (TODO)
- ⚠️ `rate-limiter.test.ts` - Rate limiting logic (TODO)
- ⚠️ `data-validator.test.ts` - OHLC validation (TODO)

### 2. Integration Tests (30% of tests)

- ⚠️ `backtest-to-optimization.test.ts` - Full optimization workflow
- ⚠️ `paper-trading-with-risk.test.ts` - Risk checks blocking trades
- ⚠️ `data-to-backtest.test.ts` - Data fetching → backtesting
- ⚠️ `strategy-integration.test.ts` - All strategies work
- ⚠️ `cli-commands.test.ts` - CLI command execution
- ⚠️ `end-to-end-workflow.test.ts` - Download → optimize → trade

### 3. Performance Tests (10% of tests)

- ⚠️ `backtesting-performance.test.ts` - Speed targets: <30s for 1yr
- ⚠️ `optimization-performance.test.ts` - 100 combos in <5min
- ⚠️ `risk-performance.test.ts` - VaR <500ms, MC <3s
- ⚠️ `data-caching-performance.test.ts` - Cache effectiveness

---

## Test Utilities

### Mock Data Provider

```typescript
import { MockDataProvider } from "../utils/mock-data-provider.js";

const provider = new MockDataProvider();
provider.addData("AAPL", historicalData);
```

### Mock Market Data Generators

```typescript
import { generateTrendingData, generateMeanRevertingData } from "../utils/mock-market-data.js";

const uptrend = generateTrendingData({
  symbol: "AAPL",
  startDate: new Date("2024-01-01"),
  days: 252,
  basePrice: 150,
  trend: "up"
});
```

### Test Strategies

```typescript
import { AlwaysBuyStrategy, PriceThresholdStrategy } from "../utils/test-strategies.js";

const strategy = new PriceThresholdStrategy(buyThreshold, sellThreshold);
```

### Test Portfolios

```typescript
import { createSimplePortfolio, createDiversifiedPortfolio } from "../utils/test-portfolios.js";

const portfolio = createDiversifiedPortfolio(); // 10 stocks
```

---

## Test Quality Standards

### Arrange-Act-Assert Pattern

All tests follow AAA pattern:

```typescript
it("should calculate total return correctly", () => {
  // Arrange
  const equityCurve = createTestEquityCurve();
  const initialCapital = 100000;

  // Act
  const metrics = PerformanceMetricsCalculator.calculate(equityCurve, ...);

  // Assert
  expect(metrics.totalReturn).toBeCloseTo(20, 2);
});
```

### Test Naming Convention

- Descriptive test names: "should calculate X when Y"
- Group related tests with `describe` blocks
- Use `beforeEach` for setup, `afterEach` for cleanup

### Mocking External Dependencies

```typescript
// Mock file system
vi.mock("fs/promises");

// Mock API calls
vi.mock("../../src/data/providers/alpha-vantage-provider.js");
```

### Edge Case Testing

Every test file must include edge cases:
- Empty input
- Zero values
- Negative values
- Very large values
- Boundary conditions

### Error Testing

```typescript
it("should throw error for insufficient cash", () => {
  expect(() => {
    tracker.processFill(largeBuyOrder);
  }).toThrow("Insufficient cash");
});
```

---

## Coverage Requirements

### Overall Target: 80%+

**Critical Paths - 100% Coverage Required:**
1. Order execution logic (`fill-simulator.ts`)
2. P&L calculations (`portfolio-tracker.ts`)
3. Risk validation (`pre-trade-validator.ts`)
4. VaR calculations (`var-calculator.ts`)
5. Trade journaling (`trade-journal.ts`)

**High Priority - 90% Coverage:**
- Performance metrics calculations
- Order lifecycle management
- Position tracking
- Data validation

**Standard Priority - 70% Coverage:**
- Data fetching
- Caching logic
- Reporting
- Alerts

**Lower Priority - 50% Coverage:**
- CLI commands
- Web server endpoints
- Logging utilities

---

## Running Specific Test Suites

### Critical Path Tests

```bash
# Test order execution (100% required)
pnpm test fill-simulator

# Test P&L calculations (100% required)
pnpm test portfolio-tracker

# Test performance metrics (100% required)
pnpm test performance-metrics

# Test VaR calculations (100% required)
pnpm test var-calculator
```

### Performance Benchmarks

```bash
# Run performance tests (separate suite)
pnpm test performance

# Check if targets met:
# - Backtest 1yr: <30s
# - Optimize 100 combos: <5min
# - VaR calculation: <500ms
# - Monte Carlo 10K: <3s
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test -- --coverage
      - run: pnpm test performance
      - name: Check Coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit

pnpm test --run
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

---

## Debugging Tests

### Verbose Output

```bash
pnpm test -- --reporter=verbose
```

### Run Single Test

```bash
pnpm test -- -t "should calculate total return correctly"
```

### Debug Mode

```bash
# Use Node inspector
node --inspect-brk ./node_modules/.bin/vitest
```

### Console Logging in Tests

```typescript
it("should calculate correctly", () => {
  const result = calculate();
  console.log("Result:", result); // Will show in test output
  expect(result).toBe(expected);
});
```

---

## Known Issues & TODO

### Failing Tests (To Fix)

1. **Performance Metrics Tests** - Empty trade array causing issues
   - Fix: Ensure metrics handle empty arrays gracefully

2. **VaR Calculator Tests** - Import path issues
   - Fix: Check VaRCalculator implementation exports

3. **Grid Search Tests** - Empty results array
   - Fix: Mock backtest engine properly

### Missing Test Files (High Priority)

1. ⚠️ Paper Trading Tests (8 files) - Critical for Q1
2. ⚠️ Risk Management Tests (8 more files) - Critical for Q1
3. ⚠️ Data Infrastructure Tests (7 files) - Medium priority
4. ⚠️ Integration Tests (6 files) - High priority
5. ⚠️ Performance Tests (4 files) - Medium priority

---

## Test Metrics Dashboard

### Current Status (As of Nov 8, 2025)

```
Test Files Created:  7 / 42  (17%)
Test Utilities:      4 / 4   (100%)
Coverage:           ~30%     (Target: 80%)

By Category:
✅ Test Utils:       4/4    (100%)
⚠️  Backtesting:     5/8    (63%)
❌ Paper Trading:   0/8    (0%)
⚠️  Risk:            1/9    (11%)
❌ Data:            0/7    (0%)
❌ Integration:     0/6    (0%)
❌ Performance:     0/4    (0%)
```

### Next Steps

1. **Complete Backtesting Tests** (3 more files)
   - random-search.test.ts
   - walk-forward.test.ts
   - historical-data-manager.test.ts

2. **Create Paper Trading Tests** (8 files)
   - Start with portfolio-manager.test.ts (CRITICAL)
   - Then order-manager.test.ts (CRITICAL)

3. **Complete Risk Tests** (8 more files)
   - Complete var-calculator.test.ts
   - Add cvar-calculator.test.ts
   - Add kelly-criterion.test.ts (CRITICAL)

4. **Run Full Coverage Analysis**
   - Identify gaps
   - Prioritize critical paths

---

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow naming convention: `*.test.ts`
3. Import test utilities from `../utils/`
4. Use AAA pattern
5. Test happy path + edge cases + errors
6. Run tests: `pnpm test <filename>`
7. Check coverage: `pnpm test -- --coverage`

### Test Review Checklist

- [ ] Descriptive test names
- [ ] AAA pattern followed
- [ ] Edge cases covered
- [ ] Error cases tested
- [ ] Mocks properly used
- [ ] No hardcoded values
- [ ] Tests are fast (<100ms each)
- [ ] Tests are deterministic (no randomness)
- [ ] Coverage increased

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Test Coverage Goals](https://martinfowler.com/bliki/TestCoverage.html)

---

**Last Updated:** November 8, 2025
**Maintained By:** QA Expert Agent
**Status:** 🟡 In Progress (17% Complete)
