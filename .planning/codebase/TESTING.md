# Stock Sense AI - Testing Documentation

## Overview

Stock Sense AI uses Vitest as its testing framework with V8 for code coverage. The test suite covers backtesting, paper trading, risk management, and data infrastructure components.

---

## Testing Framework

### Vitest Configuration

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.config.ts",
      ],
    },
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["node_modules/", "dist/"],
  },
});
```

### Key Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `globals` | `true` | Global test functions (describe, it, expect) |
| `environment` | `"node"` | Node.js environment (not jsdom) |
| `coverage.provider` | `"v8"` | V8 coverage engine |

---

## Test Commands

### Basic Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage report
pnpm test -- --coverage

# Run specific test file
pnpm test backtesting/engine

# Run specific test by name
pnpm test -- -t "should calculate total return correctly"
```

### Coverage Commands

```bash
# Generate text coverage report
pnpm test -- --coverage

# Generate HTML coverage report
pnpm test -- --coverage --reporter=html

# View HTML report
open coverage/index.html
```

### Module-Specific Tests

```bash
# Backtesting tests
pnpm test backtesting

# Risk management tests
pnpm test risk

# Data infrastructure tests
pnpm test data

# Run by pattern
pnpm test portfolio-tracker
pnpm test performance-metrics
```

---

## Test Directory Structure

```
tests/
├── README.md                     # Test documentation
│
├── backtesting/                  # Backtesting module tests
│   ├── analytics/
│   │   └── performance-metrics.test.ts
│   ├── data/
│   │   └── data-loader.test.ts
│   ├── engine/
│   │   └── backtest-engine.test.ts
│   ├── execution/
│   │   └── fill-simulator.test.ts
│   ├── optimization/
│   │   └── grid-search.test.ts
│   └── portfolio/
│       └── portfolio-tracker.test.ts
│
├── risk/                         # Risk management tests
│   └── metrics/
│       └── var-calculator.test.ts
│
└── utils/                        # Test utilities
    ├── mock-data-provider.ts
    ├── mock-market-data.ts
    ├── test-portfolios.ts
    └── test-strategies.ts
```

### Additional In-Source Tests

```
src/
├── data/__tests__/
│   ├── csv-loader.test.ts
│   ├── data-validator.test.ts
│   └── rate-limiter.test.ts
│
└── risk/__tests__/
    └── performance-benchmarks.test.ts
```

---

## Test Utilities

### Mock Data Provider

**File**: `tests/utils/mock-data-provider.ts`

```typescript
import { MockDataProvider } from "../utils/mock-data-provider.js";

const provider = new MockDataProvider();
provider.addData("AAPL", historicalData);
provider.addData("MSFT", msftData);

// Use in tests
const data = await provider.fetchHistoricalData("AAPL", from, to);
```

### Mock Market Data Generators

**File**: `tests/utils/mock-market-data.ts`

```typescript
import {
  generateTrendingData,
  generateMeanRevertingData,
  generateVolatileData
} from "../utils/mock-market-data.js";

// Generate trending data
const uptrend = generateTrendingData({
  symbol: "AAPL",
  startDate: new Date("2024-01-01"),
  days: 252,
  basePrice: 150,
  trend: "up",          // or "down"
  volatility: 0.02,
});

// Generate mean-reverting data
const sideways = generateMeanRevertingData({
  symbol: "MSFT",
  startDate: new Date("2024-01-01"),
  days: 252,
  basePrice: 300,
  amplitude: 0.1,
});
```

### Test Strategies

**File**: `tests/utils/test-strategies.ts`

```typescript
import {
  AlwaysBuyStrategy,
  AlwaysSellStrategy,
  PriceThresholdStrategy,
  NeverTradeStrategy
} from "../utils/test-strategies.js";

// Strategy that always buys
const alwaysBuy = new AlwaysBuyStrategy();

// Strategy based on price thresholds
const threshold = new PriceThresholdStrategy(buyThreshold, sellThreshold);
```

### Test Portfolios

**File**: `tests/utils/test-portfolios.ts`

```typescript
import {
  createSimplePortfolio,
  createDiversifiedPortfolio,
  createEmptyPortfolio
} from "../utils/test-portfolios.js";

// Simple single-stock portfolio
const simple = createSimplePortfolio("AAPL", 100, 150.00);

// Diversified 10-stock portfolio
const diversified = createDiversifiedPortfolio();

// Empty portfolio with cash only
const empty = createEmptyPortfolio(100000);
```

---

## Test Patterns

### AAA Pattern (Arrange-Act-Assert)

All tests follow the AAA pattern:

```typescript
it("should calculate total return correctly", () => {
  // Arrange
  const equityCurve = createTestEquityCurve();
  const initialCapital = 100000;

  // Act
  const metrics = PerformanceMetricsCalculator.calculate(equityCurve, initialCapital);

  // Assert
  expect(metrics.totalReturn).toBeCloseTo(20, 2);
});
```

### Async Testing

```typescript
it("should fetch historical data", async () => {
  // Arrange
  const provider = new MockDataProvider();
  provider.addData("AAPL", mockData);

  // Act
  const result = await provider.fetchHistoricalData("AAPL", from, to);

  // Assert
  expect(result).toHaveLength(252);
  expect(result[0].close).toBeGreaterThan(0);
});
```

### Error Testing

```typescript
it("should throw error for insufficient cash", () => {
  // Arrange
  const tracker = new PortfolioTracker(1000); // Low starting cash
  const largeBuyOrder = createLargeBuyOrder(100000);

  // Act & Assert
  expect(() => {
    tracker.processFill(largeBuyOrder);
  }).toThrow("Insufficient cash");
});

// Async error testing
it("should reject invalid symbol", async () => {
  await expect(service.getHistoricalData("INVALID"))
    .rejects
    .toThrow("No data found");
});
```

### Parameterized Tests

```typescript
describe.each([
  { input: 100, expected: 10 },
  { input: 200, expected: 20 },
  { input: 0, expected: 0 },
])("calculateReturn($input)", ({ input, expected }) => {
  it(`should return ${expected}`, () => {
    expect(calculateReturn(input, 1000)).toBe(expected);
  });
});
```

### Setup and Teardown

```typescript
describe("PortfolioTracker", () => {
  let tracker: PortfolioTracker;
  let mockService: MockDataProvider;

  beforeAll(() => {
    // Run once before all tests in this describe block
  });

  beforeEach(() => {
    // Run before each test
    tracker = new PortfolioTracker(100000);
    mockService = new MockDataProvider();
  });

  afterEach(() => {
    // Run after each test
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Run once after all tests in this describe block
  });
});
```

---

## Mocking

### Mocking Modules

```typescript
import { vi } from "vitest";

// Mock entire module
vi.mock("fs/promises");

// Mock specific functions
vi.mock("../../src/data/providers/alpha-vantage-provider.js", () => ({
  AlphaVantageProvider: vi.fn().mockImplementation(() => ({
    fetchHistoricalData: vi.fn().mockResolvedValue(mockData),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));
```

### Mocking Functions

```typescript
import { vi } from "vitest";

// Create mock function
const mockFetch = vi.fn();

// Set return value
mockFetch.mockReturnValue(42);
mockFetch.mockReturnValueOnce(1).mockReturnValueOnce(2);

// Mock resolved promise
mockFetch.mockResolvedValue({ data: [] });
mockFetch.mockRejectedValue(new Error("API Error"));

// Verify calls
expect(mockFetch).toHaveBeenCalled();
expect(mockFetch).toHaveBeenCalledTimes(2);
expect(mockFetch).toHaveBeenCalledWith("AAPL", expect.any(Date));
```

### Spying on Methods

```typescript
import { vi } from "vitest";

it("should call cache before API", async () => {
  const service = new MarketDataService();
  const cacheSpy = vi.spyOn(service, "getCacheStats");

  await service.getHistoricalData("AAPL");

  expect(cacheSpy).toHaveBeenCalled();
});
```

### Mock Timers

```typescript
import { vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("should update after interval", () => {
  const callback = vi.fn();
  setInterval(callback, 1000);

  vi.advanceTimersByTime(5000);

  expect(callback).toHaveBeenCalledTimes(5);
});
```

---

## Coverage Requirements

### Target Coverage

| Priority | Target | Components |
|----------|--------|------------|
| Critical | 100% | Order execution, P&L calculations, risk validation, VaR |
| High | 90% | Performance metrics, order lifecycle, position tracking |
| Standard | 70% | Data fetching, caching, reporting |
| Lower | 50% | CLI commands, web endpoints, logging |

### Critical Path Files

Files requiring 100% coverage:

| File | Module | Purpose |
|------|--------|---------|
| `fill-simulator.ts` | backtesting/execution | Order execution logic |
| `portfolio-tracker.ts` | backtesting/portfolio | P&L calculations |
| `pre-trade-validator.ts` | risk/validation | Risk validation |
| `var-calculator.ts` | risk/metrics | Value at Risk |
| `trade-journal.ts` | paper-trading/journal | Trade journaling |

### Running Coverage

```bash
# Run with coverage
pnpm test -- --coverage

# Check specific file coverage
pnpm test fill-simulator -- --coverage

# Generate detailed HTML report
pnpm test -- --coverage --coverage.reporter=html
```

---

## Test Categories

### Unit Tests (60% of suite)

Test individual functions and classes in isolation:

```typescript
// tests/backtesting/portfolio/portfolio-tracker.test.ts
describe("PortfolioTracker", () => {
  it("should track cash after buy order", () => {
    const tracker = new PortfolioTracker(100000);
    const fill = createBuyFill("AAPL", 100, 150);

    tracker.processFill(fill);

    expect(tracker.getCash()).toBe(85000); // 100000 - (100 * 150)
  });
});
```

### Integration Tests (30% of suite)

Test component interactions:

```typescript
// tests/integration/backtest-to-optimization.test.ts
describe("Backtest to Optimization Integration", () => {
  it("should run full optimization workflow", async () => {
    // Setup data
    const dataLoader = new DataLoader(mockProvider);
    const data = await dataLoader.load("AAPL", from, to);

    // Run optimization
    const optimizer = new GridSearchOptimizer(engine);
    const results = await optimizer.optimize(parameterSpace);

    // Verify results
    expect(results.bestParameters).toBeDefined();
    expect(results.performance.sharpeRatio).toBeGreaterThan(0);
  });
});
```

### Performance Tests (10% of suite)

Verify performance targets:

```typescript
// tests/performance/backtesting-performance.test.ts
describe("Backtesting Performance", () => {
  it("should backtest 1 year in under 30 seconds", async () => {
    const start = Date.now();

    await engine.run(yearOfData, strategy);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(30000);
  });

  it("should optimize 100 combinations in under 5 minutes", async () => {
    const start = Date.now();

    await optimizer.optimize(hundredCombinations);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(300000);
  });
});
```

---

## Edge Cases

Every test file should include edge case testing:

```typescript
describe("edge cases", () => {
  it("should handle empty input", () => {
    expect(() => calculator.calculate([])).toThrow("No data provided");
  });

  it("should handle zero values", () => {
    const result = calculator.calculate([0, 0, 0]);
    expect(result.mean).toBe(0);
  });

  it("should handle negative values", () => {
    const result = calculator.calculate([-10, -20, -30]);
    expect(result.mean).toBe(-20);
  });

  it("should handle very large values", () => {
    const result = calculator.calculate([Number.MAX_SAFE_INTEGER]);
    expect(result.mean).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("should handle single element", () => {
    const result = calculator.calculate([42]);
    expect(result.mean).toBe(42);
  });

  it("should handle boundary conditions", () => {
    // Test at exactly the threshold
    const result = calculator.calculate([100]);
    expect(result.threshold).toBe(true);
  });
});
```

---

## Debugging Tests

### Verbose Output

```bash
pnpm test -- --reporter=verbose
```

### Single Test Debugging

```bash
# Run single test with debug output
pnpm test -- -t "should calculate total return" --reporter=verbose

# Use Node inspector
node --inspect-brk ./node_modules/.bin/vitest
```

### Console Logging

```typescript
it("should calculate correctly", () => {
  const result = calculate();
  console.log("Debug - Result:", JSON.stringify(result, null, 2));
  expect(result).toBe(expected);
});
```

### Test-Only Code

```typescript
// Add debug helpers in tests only
const debugTracker = {
  ...tracker,
  _debugGetInternalState: () => tracker['internalState'],
};
```

---

## Current Test Status

As of the README documentation:

```
Test Files Created:  7 / 42  (17%)
Test Utilities:      4 / 4   (100%)
Coverage:           ~30%     (Target: 80%)

By Category:
- Test Utils:       4/4    (100%)
- Backtesting:      5/8    (63%)
- Paper Trading:    0/8    (0%)
- Risk:             1/9    (11%)
- Data:             0/7    (0%)
- Integration:      0/6    (0%)
- Performance:      0/4    (0%)
```

### Existing Test Files

| File | Status | Coverage |
|------|--------|----------|
| `tests/backtesting/engine/backtest-engine.test.ts` | Exists | Partial |
| `tests/backtesting/data/data-loader.test.ts` | Exists | Partial |
| `tests/backtesting/execution/fill-simulator.test.ts` | Exists | Partial |
| `tests/backtesting/portfolio/portfolio-tracker.test.ts` | Exists | Partial |
| `tests/backtesting/analytics/performance-metrics.test.ts` | Exists | Partial |
| `tests/backtesting/optimization/grid-search.test.ts` | Exists | Partial |
| `tests/risk/metrics/var-calculator.test.ts` | Exists | Started |
| `src/data/__tests__/csv-loader.test.ts` | Exists | Unknown |
| `src/data/__tests__/data-validator.test.ts` | Exists | Unknown |
| `src/data/__tests__/rate-limiter.test.ts` | Exists | Unknown |

---

## CI Integration

### GitHub Actions (Recommended)

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test -- --coverage
      - name: Check Coverage Threshold
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
