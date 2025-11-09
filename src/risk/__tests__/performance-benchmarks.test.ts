/**
 * Performance Benchmarks for Risk Management
 * Validates performance requirements:
 * - VaR calculation: <500ms for 10-position portfolio
 * - Monte Carlo simulation: <3s for 10,000 scenarios
 * - Pre-trade validation: <50ms
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Position } from "../../types/trading.js";
import { VaRCalculator } from "../metrics/var-calculator.js";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";
import { PreTradeValidator } from "../validation/pre-trade-validator.js";

describe("Risk Management Performance Benchmarks", () => {
  let mockPositions: Position[];
  let mockHistoricalReturns: Map<string, number[]>;

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

    // Generate mock historical returns (252 trading days)
    mockHistoricalReturns = new Map();
    for (let i = 0; i < 10; i++) {
      const returns: number[] = [];
      for (let day = 0; day < 252; day++) {
        // Generate random returns with mean 0.0005 (0.05%) and std dev 0.02 (2%)
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        returns.push(0.0005 + 0.02 * z0);
      }
      mockHistoricalReturns.set(`STOCK${i}`, returns);
    }
  });

  describe("VaR Calculation Performance", () => {
    it("should calculate Historical VaR in <500ms for 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const startTime = Date.now();

      await calculator.calculateVaR(mockPositions, mockHistoricalReturns, {
        method: "historical",
        confidenceLevel: 0.95,
        timeHorizon: 1,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      console.log(`✓ Historical VaR: ${duration}ms`);
    });

    it("should calculate Parametric VaR in <500ms for 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const startTime = Date.now();

      await calculator.calculateVaR(mockPositions, mockHistoricalReturns, {
        method: "parametric",
        confidenceLevel: 0.95,
        timeHorizon: 1,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      console.log(`✓ Parametric VaR: ${duration}ms`);
    });

    it("should calculate Monte Carlo VaR in <500ms for 10-position portfolio", async () => {
      const calculator = new VaRCalculator();
      const startTime = Date.now();

      await calculator.calculateVaR(mockPositions, mockHistoricalReturns, {
        method: "monte-carlo",
        confidenceLevel: 0.95,
        timeHorizon: 1,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      console.log(`✓ Monte Carlo VaR: ${duration}ms`);
    });
  });

  describe("Monte Carlo Simulation Performance", () => {
    it("should complete 10,000 scenarios in <3s", async () => {
      const simulator = new MonteCarloSimulator();
      const startTime = Date.now();

      const result = await simulator.runSimulation(
        mockPositions,
        100000,
        mockHistoricalReturns,
        {
          simulations: 10000,
          timeHorizon: 30,
          confidenceLevel: 0.95,
          includeCorrelations: false,
          volatilityShocks: false,
        }
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000);
      expect(result.scenarios.length).toBe(10000);
      console.log(`✓ Monte Carlo 10,000 scenarios: ${duration}ms`);
    });

    it("should complete 10,000 scenarios with correlations in <5s", async () => {
      const simulator = new MonteCarloSimulator();
      const startTime = Date.now();

      const result = await simulator.runSimulation(
        mockPositions,
        100000,
        mockHistoricalReturns,
        {
          simulations: 10000,
          timeHorizon: 30,
          confidenceLevel: 0.95,
          includeCorrelations: true,
          volatilityShocks: false,
        }
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
      expect(result.scenarios.length).toBe(10000);
      console.log(`✓ Monte Carlo with correlations: ${duration}ms`);
    });
  });

  describe("Pre-Trade Validation Performance", () => {
    it("should validate trade in <50ms", async () => {
      const validator = new PreTradeValidator();
      const signal = {
        symbol: "AAPL",
        action: "BUY" as const,
        strength: 75,
        strategy: "test",
        indicators: {} as any,
        confidence: 75,
        positionSize: 100,
        entryPrice: 150,
        riskAmount: 100,
        reasons: [],
        timestamp: new Date(),
      };

      const startTime = Date.now();

      await validator.validateTrade(signal, mockPositions, 100000);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);
      console.log(`✓ Pre-trade validation: ${duration}ms`);
    });

    it("should validate 100 trades in <1s", async () => {
      const validator = new PreTradeValidator();
      const signal = {
        symbol: "AAPL",
        action: "BUY" as const,
        strength: 75,
        strategy: "test",
        indicators: {} as any,
        confidence: 75,
        positionSize: 100,
        entryPrice: 150,
        riskAmount: 100,
        reasons: [],
        timestamp: new Date(),
      };

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await validator.validateTrade(signal, mockPositions, 100000);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
      console.log(`✓ 100 validations: ${duration}ms (${(duration / 100).toFixed(2)}ms avg)`);
    });
  });

  describe("Overall System Performance", () => {
    it("should perform complete risk analysis in <5s", async () => {
      const varCalculator = new VaRCalculator();
      const simulator = new MonteCarloSimulator();

      const startTime = Date.now();

      // VaR calculation
      await varCalculator.calculateVaR(mockPositions, mockHistoricalReturns, {
        method: "historical",
        confidenceLevel: 0.95,
        timeHorizon: 1,
      });

      // Monte Carlo simulation
      await simulator.runSimulation(mockPositions, 100000, mockHistoricalReturns, {
        simulations: 5000,
        timeHorizon: 30,
        confidenceLevel: 0.95,
        includeCorrelations: false,
        volatilityShocks: false,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
      console.log(`✓ Complete risk analysis: ${duration}ms`);
    });
  });
});
