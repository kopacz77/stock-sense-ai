# Stock Sense AI - Remaining Test Files TODO

**Current Progress:** 11/42 files complete (26%)
**Target:** 80%+ coverage across all Q1 components

---

## Backtesting Tests (3 remaining / 8 total)

**Status:** 5/8 complete (63%)

✅ backtest-engine.test.ts
✅ data-loader.test.ts
✅ fill-simulator.test.ts
✅ portfolio-tracker.test.ts
✅ performance-metrics.test.ts
✅ grid-search.test.ts

❌ **random-search.test.ts** (TODO)
- Random parameter optimization
- Convergence testing
- Result distribution analysis
- Estimated: 200-250 lines, 15-20 tests

❌ **walk-forward.test.ts** (TODO)
- Walk-forward analysis
- In-sample vs out-of-sample
- Rolling window optimization
- Overfitting detection
- Estimated: 250-300 lines, 20-25 tests

❌ **historical-data-manager.test.ts** (TODO)
- Data loading from multiple sources
- Data caching
- Date range handling
- Symbol lookup
- Estimated: 200-250 lines, 15-20 tests

---

## Paper Trading Tests (8 remaining / 8 total) ⚠️ PRIORITY

**Status:** 0/8 complete (0%) - CRITICAL GAP

❌ **portfolio-manager.test.ts** (TODO - HIGH PRIORITY)
- Cash management
- Position tracking
- P&L calculation
- Value tracking
- Portfolio limits
- Estimated: 400-500 lines, 30-35 tests

❌ **order-manager.test.ts** (TODO - HIGH PRIORITY)
- Order creation (5 types)
- Order lifecycle (PENDING → FILLED → CLOSED)
- Order validation
- Order expiration
- Time-in-force handling
- Estimated: 450-500 lines, 35-40 tests

❌ **execution-simulator.test.ts** (TODO - HIGH PRIORITY)
- Realistic order fills
- Market data matching
- Slippage simulation
- Commission calculation
- Fill timing
- Estimated: 350-400 lines, 25-30 tests

❌ **trade-journal.test.ts** (TODO - CRITICAL)
- Append-only writes
- Encryption at rest
- Trade query operations
- Data integrity checks
- Journal compaction
- Estimated: 300-350 lines, 25-30 tests

❌ **performance-calculator.test.ts** (TODO - HIGH PRIORITY)
- All 25+ performance metrics
- Daily/weekly/monthly returns
- Risk-adjusted returns
- Benchmark comparison
- Estimated: 400-450 lines, 30-35 tests

❌ **pre-trade-validator.test.ts** (TODO - CRITICAL)
- All 7 risk checks:
  1. Sufficient cash
  2. Position limits
  3. Concentration limits
  4. Daily loss limits
  5. Max drawdown limits
  6. Volatility limits
  7. Correlation limits
- Estimated: 350-400 lines, 25-30 tests

❌ **encrypted-storage.test.ts** (TODO - CRITICAL)
- Encryption/decryption
- Data integrity verification
- Key management
- File corruption handling
- Estimated: 250-300 lines, 20-25 tests

❌ **paper-trading-engine.test.ts** (TODO)
- End-to-end paper trading
- Integration with strategies
- Real-time updates
- Error handling
- Estimated: 300-350 lines, 25-30 tests

---

## Risk Management Tests (8 remaining / 9 total) ⚠️ PRIORITY

**Status:** 1/9 complete (11%) - CRITICAL GAP

⚠️ **var-calculator.test.ts** (STARTED - FIX REQUIRED)
- Fix import/export issues
- Complete all 3 VaR methods
- All 20 tests need to pass

❌ **cvar-calculator.test.ts** (TODO - CRITICAL)
- Historical CVaR
- Parametric CVaR
- Monte Carlo CVaR
- Confidence levels (95%, 99%)
- Estimated: 300-350 lines, 20-25 tests

❌ **correlation-matrix.test.ts** (TODO)
- Correlation calculation
- Matrix operations
- Caching
- Update frequency
- Estimated: 250-300 lines, 20-25 tests

❌ **kelly-criterion.test.ts** (TODO - CRITICAL)
- Kelly formula calculation
- Position sizing
- Kelly fraction caps
- Warning thresholds
- Estimated: 200-250 lines, 15-20 tests

❌ **monte-carlo.test.ts** (TODO - CRITICAL)
- 10,000+ scenario generation
- Return distributions
- Correlation handling
- Performance (must be <3s)
- Estimated: 350-400 lines, 25-30 tests

❌ **stress-tester.test.ts** (TODO)
- All 6 stress scenarios:
  1. 2008 Financial Crisis
  2. COVID-19 Crash
  3. Tech Bubble Burst
  4. Flash Crash
  5. Rising Rates
  6. Commodity Spike
- Portfolio impact analysis
- Estimated: 300-350 lines, 25-30 tests

❌ **pre-trade-validator.test.ts** (TODO - Integration)
- Integration of all risk checks
- Validation flow
- Error messaging
- Estimated: 250-300 lines, 20-25 tests

❌ **risk-reporter.test.ts** (TODO)
- Report generation
- Daily/weekly/monthly reports
- Alert thresholds
- Estimated: 200-250 lines, 15-20 tests

❌ **risk-alerter.test.ts** (TODO)
- Alert triggering
- Severity levels
- Notification delivery
- Estimated: 200-250 lines, 15-20 tests

---

## Data Infrastructure Tests (7 remaining / 7 total)

**Status:** 0/7 complete (0%)

❌ **market-data-service.test.ts** (TODO)
- Data fetching
- Multi-provider support
- Caching layer
- Fallback handling
- Estimated: 300-350 lines, 25-30 tests

❌ **csv-loader.test.ts** (TODO)
- CSV parsing
- Format detection
- Column mapping
- Validation
- Estimated: 250-300 lines, 20-25 tests

❌ **cache-manager.test.ts** (TODO)
- Cache storage
- Cache retrieval
- Expiration handling
- Cache invalidation
- Estimated: 200-250 lines, 15-20 tests

❌ **alpha-vantage-provider.test.ts** (TODO)
- API integration (mocked)
- Response parsing
- Error handling
- Rate limiting
- Estimated: 200-250 lines, 15-20 tests

❌ **finnhub-provider.test.ts** (TODO)
- API integration (mocked)
- Response parsing
- Error handling
- Rate limiting
- Estimated: 200-250 lines, 15-20 tests

❌ **rate-limiter.test.ts** (TODO)
- Rate limit enforcement
- Wait time calculation
- Limit reset
- Multi-provider support
- Estimated: 200-250 lines, 15-20 tests

❌ **data-validator.test.ts** (TODO)
- OHLC validation
- Gap detection
- Anomaly detection
- Data quality scoring
- Estimated: 250-300 lines, 20-25 tests

---

## Integration Tests (6 remaining / 6 total)

**Status:** 0/6 complete (0%)

❌ **backtest-to-optimization.test.ts** (TODO)
- Optimize strategy parameters
- Run backtest with optimized params
- Verify improvement
- Estimated: 200-250 lines, 10-15 tests

❌ **paper-trading-with-risk.test.ts** (TODO)
- Risk checks block invalid trades
- Valid trades execute
- Risk alerts trigger
- Estimated: 250-300 lines, 15-20 tests

❌ **data-to-backtest.test.ts** (TODO)
- Fetch historical data
- Load into backtest engine
- Run strategy
- Verify results
- Estimated: 200-250 lines, 10-15 tests

❌ **strategy-integration.test.ts** (TODO)
- All strategies work with backtest
- All strategies work with paper trading
- Strategy switching
- Estimated: 250-300 lines, 15-20 tests

❌ **cli-commands.test.ts** (TODO)
- All CLI commands execute
- Proper error handling
- Output validation
- Estimated: 300-350 lines, 20-25 tests

❌ **end-to-end-workflow.test.ts** (TODO)
- Download data → Backtest → Optimize → Paper trade
- Full user workflow
- Error recovery
- Estimated: 300-350 lines, 20-25 tests

---

## Performance Tests (4 remaining / 4 total)

**Status:** 0/4 complete (0%)

❌ **backtesting-performance.test.ts** (TODO)
- Target: Backtest 1 year in <30 seconds
- Target: Backtest 5 years in <2 minutes
- Memory usage tracking
- Estimated: 150-200 lines, 8-10 tests

❌ **optimization-performance.test.ts** (TODO)
- Target: 100 combinations in <5 minutes
- Target: 1000 combinations in <30 minutes
- Parallel optimization
- Estimated: 150-200 lines, 8-10 tests

❌ **risk-performance.test.ts** (TODO)
- Target: VaR calculation in <500ms
- Target: Monte Carlo 10K scenarios in <3s
- Target: Correlation matrix in <200ms
- Estimated: 150-200 lines, 8-10 tests

❌ **data-caching-performance.test.ts** (TODO)
- Cache hit rate >90%
- Cache lookup <10ms
- Data load speedup >10x
- Estimated: 150-200 lines, 8-10 tests

---

## Summary

### Files Remaining: 31 / 42 total

**By Priority:**

**CRITICAL (Must have for Q1):**
- [ ] trade-journal.test.ts (data integrity)
- [ ] encrypted-storage.test.ts (data security)
- [ ] pre-trade-validator.test.ts (risk management)
- [ ] var-calculator.test.ts (fix existing)
- [ ] cvar-calculator.test.ts (risk metrics)
- [ ] kelly-criterion.test.ts (position sizing)
- [ ] monte-carlo.test.ts (risk simulation)
- [ ] portfolio-manager.test.ts (paper trading core)
- [ ] order-manager.test.ts (paper trading core)

**HIGH PRIORITY (Important for Q1):**
- [ ] execution-simulator.test.ts
- [ ] performance-calculator.test.ts
- [ ] paper-trading-engine.test.ts
- [ ] stress-tester.test.ts
- [ ] market-data-service.test.ts
- [ ] backtest-to-optimization.test.ts
- [ ] paper-trading-with-risk.test.ts

**MEDIUM PRIORITY (Nice to have):**
- [ ] All remaining backtesting tests (3)
- [ ] All remaining risk tests (3)
- [ ] All remaining data tests (7)
- [ ] All remaining integration tests (4)
- [ ] All performance tests (4)

### Estimated Effort

**Total Remaining:**
- Lines of code: ~8,000-9,500
- Test cases: ~550-650
- Time estimate: 3-4 weeks (1 developer full-time)

**Phase Breakdown:**
1. Fix existing failures: 2 days
2. Critical tests: 1 week
3. High priority tests: 1 week
4. Medium priority tests: 1 week
5. Integration & performance: 3-4 days

---

## Quick Start Guide for Next Developer

### To Continue Testing:

1. **Fix Existing Tests First** (2 days)
   ```bash
   # Fix VaR calculator
   vim src/risk/metrics/var-calculator.ts
   pnpm test var-calculator

   # Fix performance metrics
   vim src/backtesting/analytics/performance-metrics.ts
   pnpm test performance-metrics

   # Fix grid search
   pnpm test grid-search
   ```

2. **Start with Critical Tests** (1 week)
   ```bash
   # Create paper trading core tests
   touch tests/paper-trading/portfolio/portfolio-manager.test.ts
   touch tests/paper-trading/orders/order-manager.test.ts
   touch tests/paper-trading/journal/trade-journal.test.ts

   # Create risk core tests
   touch tests/risk/metrics/cvar-calculator.test.ts
   touch tests/risk/position-sizing/kelly-criterion.test.ts
   touch tests/risk/simulation/monte-carlo.test.ts
   ```

3. **Use Existing Utilities**
   ```typescript
   import { MockDataProvider } from "../../utils/mock-data-provider.js";
   import { generateTrendingData } from "../../utils/mock-market-data.js";
   import { PriceThresholdStrategy } from "../../utils/test-strategies.js";
   import { createSimplePortfolio } from "../../utils/test-portfolios.js";
   ```

4. **Follow Patterns from Existing Tests**
   - See fill-simulator.test.ts for order execution patterns
   - See portfolio-tracker.test.ts for P&L calculation patterns
   - See performance-metrics.test.ts for metrics calculation patterns

5. **Run Tests Continuously**
   ```bash
   pnpm test:watch  # Watch mode during development
   pnpm test -- --coverage  # Check coverage
   ```

---

**Last Updated:** November 8, 2025
**Status:** 26% Complete (11/42 files)
**Next Milestone:** Fix failures + complete critical tests (40% → 60%)
