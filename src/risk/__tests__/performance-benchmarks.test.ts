/**
 * Performance Benchmarks for Risk Management
 *
 * These tests exercise the REAL risk-management API:
 *   - VaRCalculator#calculateVaR(positions, historicalReturns, options)  (instance, async)
 *   - MonteCarloSimulator#runSimulation(positions, accountBalance, returns, config) (instance, async)
 *   - PreTradeValidator#validateTrade(signal, positions, accountBalance)  (instance, async)
 *
 * Intent: verify the risk calculations complete on realistically-sized inputs
 * (10-position portfolio, 252 trading days, up to 10,000 Monte Carlo scenarios)
 * AND return financially valid results.
 *
 * Timing note: wall-clock time is measured for information only. Assertions use
 * GENEROUS ceilings (large multiples of typical runtime) as a smoke check that a
 * calculation does not hang — never an exact/tight deadline — so they will not
 * flake under CI load. The load-bearing assertions are on result CORRECTNESS
 * (non-negative VaR, higher confidence => higher VaR, longer horizon => higher VaR,
 * scenario counts, probabilities in [0, 1]).
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Position, Signal } from "../../types/trading.js";
import type { VaRResult } from "../types/risk-types.js";
import { VaRCalculator } from "../metrics/var-calculator.js";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";
import { PreTradeValidator } from "../validation/pre-trade-validator.js";

// Generous ceilings: large multiples of expected runtime so they never flake,
// while still catching a genuine hang / pathological blow-up.
const VAR_CEILING_MS = 5_000; // typical < 500ms
const MC_CEILING_MS = 30_000; // typical < 3s for 10k scenarios
const MC_CORR_CEILING_MS = 60_000; // correlated path is heavier
const VALIDATION_CEILING_MS = 2_000; // typical < 50ms
const VALIDATION_BATCH_CEILING_MS = 30_000; // 100 validations, typical < 1s
const FULL_ANALYSIS_CEILING_MS = 60_000;

/**
 * Assert a VaRResult is financially valid:
 * - portfolio value positive
 * - all VaR figures non-negative
 * - higher confidence (99%) implies >= VaR than lower confidence (95%)
 * - longer horizon (10-day) implies >= VaR than 1-day (sqrt-of-time scaling)
 */
function expectValidVaR(result: VaRResult, method: VaRResult["method"]): void {
  expect(result).toBeDefined();
  expect(result.method).toBe(method);
  expect(result.portfolioValue).toBeGreaterThan(0);

  expect(result.oneDayVaR95).toBeGreaterThanOrEqual(0);
  expect(result.oneDayVaR99).toBeGreaterThanOrEqual(0);
  expect(result.tenDayVaR95).toBeGreaterThanOrEqual(0);
  expect(result.tenDayVaR99).toBeGreaterThanOrEqual(0);

  expect(Number.isFinite(result.oneDayVaR95)).toBe(true);
  expect(Number.isFinite(result.oneDayVaR99)).toBe(true);

  // Higher confidence level => larger (or equal) loss estimate.
  expect(result.oneDayVaR99).toBeGreaterThanOrEqual(result.oneDayVaR95);
  expect(result.tenDayVaR99).toBeGreaterThanOrEqual(result.tenDayVaR95);

  // Longer horizon => larger (or equal) VaR under sqrt-of-time scaling.
  expect(result.tenDayVaR95).toBeGreaterThanOrEqual(result.oneDayVaR95);
  expect(result.tenDayVaR99).toBeGreaterThanOrEqual(result.oneDayVaR99);

  expect(typeof result.interpretation).toBe("string");
  expect(result.interpretation.length).toBeGreaterThan(0);
}

describe("Risk Management Performance Benchmarks", () => {
  let mockPositions: Position[];
  let mockHistoricalReturns: Map<string, number[]>;
  let expectedPortfolioValue: number;

  beforeEach(() => {
    // Create 10-position portfolio
    mockPositions = Array.from({ length: 10 }, (_, i) => ({
      symbol: `STOCK${i}`,
      entryPrice: 100 + i * 10,
      currentPrice: 105 + i * 10,
      quantity: 100,
      value: (105 + i * 10) * 100,
      unrealizedPnL: 5 * 100,
      unrealizedPnLPercent: 5,
      entryDate: new Date(),
      strategy: "test",
      riskAmount: 100,
      sector: "TECH",
    }));

    expectedPortfolioValue = mockPositions.reduce((sum, p) => sum + p.value, 0);

    // Generate mock historical returns (252 trading days) via Box-Muller,
    // mean 0.05% and std dev 2% — realistic daily equity return distribution.
    mockHistoricalReturns = new Map();
    for (let i = 0; i < 10; i++) {
      const returns: number[] = [];
      for (let day = 0; day < 252; day++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        returns.push(0.0005 + 0.02 * z0);
      }
      mockHistoricalReturns.set(`STOCK${i}`, returns);
    }
  });

  describe("VaR Calculation Performance", () => {
    it("computes a valid Historical VaR for a 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const start = performance.now();

      const result = await calculator.calculateVaR(
        mockPositions,
        mockHistoricalReturns,
        { method: "historical", confidenceLevel: 0.95, timeHorizon: 1 }
      );

      const duration = performance.now() - start;
      expectValidVaR(result, "historical");
      expect(result.portfolioValue).toBeCloseTo(expectedPortfolioValue, 0);
      expect(duration).toBeLessThan(VAR_CEILING_MS);
    });

    it("computes a valid Parametric VaR for a 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const start = performance.now();

      const result = await calculator.calculateVaR(
        mockPositions,
        mockHistoricalReturns,
        { method: "parametric", confidenceLevel: 0.95, timeHorizon: 1 }
      );

      const duration = performance.now() - start;
      expectValidVaR(result, "parametric");
      expect(result.portfolioValue).toBeCloseTo(expectedPortfolioValue, 0);
      expect(duration).toBeLessThan(VAR_CEILING_MS);
    });

    it("computes a valid Monte Carlo VaR for a 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const start = performance.now();

      const result = await calculator.calculateVaR(
        mockPositions,
        mockHistoricalReturns,
        { method: "monte-carlo", confidenceLevel: 0.95, timeHorizon: 1 }
      );

      const duration = performance.now() - start;
      expectValidVaR(result, "monte-carlo");
      expect(result.portfolioValue).toBeCloseTo(expectedPortfolioValue, 0);
      expect(duration).toBeLessThan(VAR_CEILING_MS);
    });
  });

  describe("Monte Carlo Simulation Performance", () => {
    it("generates 10,000 valid scenarios (independent returns)", async () => {
      const simulator = new MonteCarloSimulator();
      const start = performance.now();

      const result = await simulator.runSimulation(
        mockPositions,
        100_000,
        mockHistoricalReturns,
        {
          simulations: 10_000,
          timeHorizon: 30,
          confidenceLevel: 0.95,
          includeCorrelations: false,
          volatilityShocks: false,
        }
      );

      const duration = performance.now() - start;

      expect(result.scenarios).toHaveLength(10_000);
      // Each scenario should have a finite final value and a bounded drawdown [0, 100]%.
      for (const scenario of result.scenarios) {
        expect(Number.isFinite(scenario.finalValue)).toBe(true);
        expect(scenario.maxDrawdown).toBeGreaterThanOrEqual(0);
        expect(scenario.maxDrawdown).toBeLessThanOrEqual(100);
      }
      // Probabilities are well-formed.
      const s = result.statistics;
      expect(s.probabilityOfProfit).toBeGreaterThanOrEqual(0);
      expect(s.probabilityOfProfit).toBeLessThanOrEqual(1);
      expect(s.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(s.probabilityOfLoss).toBeLessThanOrEqual(1);
      // 5th percentile worst case should not exceed the 95th percentile best case.
      expect(s.worstCase5th).toBeLessThanOrEqual(s.bestCase95th);
      // The simulator reports its own calculation time; it must be non-negative.
      expect(result.calculationTime).toBeGreaterThanOrEqual(0);

      expect(duration).toBeLessThan(MC_CEILING_MS);
    });

    it("generates 10,000 valid scenarios (correlated returns)", async () => {
      const simulator = new MonteCarloSimulator();
      const start = performance.now();

      const result = await simulator.runSimulation(
        mockPositions,
        100_000,
        mockHistoricalReturns,
        {
          simulations: 10_000,
          timeHorizon: 30,
          confidenceLevel: 0.95,
          includeCorrelations: true,
          volatilityShocks: false,
        }
      );

      const duration = performance.now() - start;

      expect(result.scenarios).toHaveLength(10_000);
      const s = result.statistics;
      expect(s.probabilityOfProfit).toBeGreaterThanOrEqual(0);
      expect(s.probabilityOfProfit).toBeLessThanOrEqual(1);
      expect(s.worstCase5th).toBeLessThanOrEqual(s.bestCase95th);

      expect(duration).toBeLessThan(MC_CORR_CEILING_MS);
    });
  });

  describe("Pre-Trade Validation Performance", () => {
    const buildSignal = (): Signal => ({
      symbol: "AAPL",
      action: "BUY",
      strength: 75,
      strategy: "test",
      indicators: {} as never,
      confidence: 75,
      positionSize: 100,
      entryPrice: 150,
      riskAmount: 100,
      reasons: [],
      timestamp: new Date(),
    });

    it("validates a single trade and returns a well-formed check", async () => {
      const validator = new PreTradeValidator();
      const start = performance.now();

      const check = await validator.validateTrade(buildSignal(), mockPositions, 100_000);

      const duration = performance.now() - start;

      expect(typeof check.passed).toBe("boolean");
      expect(["APPROVE", "REDUCE_SIZE", "REJECT"]).toContain(check.recommendation);
      expect(Array.isArray(check.blockers)).toBe(true);
      expect(Array.isArray(check.warnings)).toBe(true);
      // passed must be consistent with the presence of hard blockers.
      expect(check.passed).toBe(check.blockers.length === 0);
      // Risk impact accounting must be internally consistent.
      expect(check.riskImpact.newRisk).toBeGreaterThanOrEqual(check.riskImpact.currentRisk);
      expect(check.positionImpact.newPositions).toBe(
        check.positionImpact.currentPositions + 1
      );

      expect(duration).toBeLessThan(VALIDATION_CEILING_MS);
    });

    it("validates 100 trades, each returning a well-formed check", async () => {
      const validator = new PreTradeValidator();
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        const check = await validator.validateTrade(buildSignal(), mockPositions, 100_000);
        expect(["APPROVE", "REDUCE_SIZE", "REJECT"]).toContain(check.recommendation);
        expect(check.passed).toBe(check.blockers.length === 0);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(VALIDATION_BATCH_CEILING_MS);
    });
  });

  describe("Overall System Performance", () => {
    it("runs a complete VaR + Monte Carlo risk analysis and returns valid results", async () => {
      const varCalculator = new VaRCalculator();
      const simulator = new MonteCarloSimulator();

      const start = performance.now();

      const varResult = await varCalculator.calculateVaR(
        mockPositions,
        mockHistoricalReturns,
        { method: "historical", confidenceLevel: 0.95, timeHorizon: 1 }
      );

      const mcResult = await simulator.runSimulation(
        mockPositions,
        100_000,
        mockHistoricalReturns,
        {
          simulations: 5_000,
          timeHorizon: 30,
          confidenceLevel: 0.95,
          includeCorrelations: false,
          volatilityShocks: false,
        }
      );

      const duration = performance.now() - start;

      expectValidVaR(varResult, "historical");
      expect(mcResult.scenarios).toHaveLength(5_000);
      expect(duration).toBeLessThan(FULL_ANALYSIS_CEILING_MS);
    });
  });
});
