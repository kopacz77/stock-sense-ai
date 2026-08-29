/**
 * Live-window backtest runner tests (M2-05 Plan 11-06, Task 1).
 *
 * `simulateCandidate` is exercised as a pure function against synthetic
 * bars. `runLiveWindow` is exercised against synthetic bars + stub
 * `SignalTypeModule`s (network-free, deterministic), plus one
 * `describe.skipIf(!existsSync("./data/intel"))` block against the real
 * substrate on this tree.
 */
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { OHLCVData } from "../../../data/types.js";
import type { TickerDaySummary } from "../../../market-intelligence/signal/types.js";
import { DEFAULT_STRATEGY_CONFIG } from "../../config.js";
import type { StrategyConfig } from "../../config.js";
import type { MarketDataSource, VixSource } from "../../strategy-engine.js";
import type {
  RawSignal,
  SignalContext,
  SignalMode,
  SignalType,
  SignalTypeModule,
  StrategyCandidate,
} from "../../types.js";
import type { VixQuote } from "../../vix-provider.js";
import {
  LIVE_WINDOW_LABEL,
  THIN_SAMPLE_TRADE_THRESHOLD,
  runLiveWindow,
  simulateCandidate,
} from "../live-window-runner.js";

// ---------------------------------------------------------------------------
// simulateCandidate — pure-function tests against synthetic bars
// ---------------------------------------------------------------------------

function candidate(overrides: Partial<StrategyCandidate> = {}): StrategyCandidate {
  return {
    signalType: "SECTOR_ROTATION_FROM_PM",
    ticker: "XLE",
    score: 0.8,
    direction: "long",
    rationale: "test",
    entryStyle: "close",
    targetSpec: { kind: "atr", period: 5, multiple: 2 },
    timeHorizonDays: 5,
    sourceArticleIds: [],
    sourcePmMarkets: [],
    candidateId: "2026-06-01-SECTOR_ROTATION_FROM_PM-XLE-abcd1234",
    generatedAt: "2026-06-01T12:00:00.000Z",
    asOfDate: "2026-06-01",
    mode: "ranked",
    vixRegime: "elevated",
    vixCloseAtGeneration: 18,
    vixSource: "live",
    suggestedEntry: 100,
    suggestedTarget: 110,
    suggestedStop: 95,
    suggestedSizeUsd: 1000,
    atrPeriodUsed: 5,
    atrValue: 2,
    costEvaluation: null,
    ...overrides,
  };
}

/** One bar per calendar day starting the day after `asOfIso`, `close` supplied per-day by `closes`. */
function barsFrom(asOfIso: string, closes: number[]): OHLCVData[] {
  const start = new Date(`${asOfIso}T00:00:00.000Z`);
  return closes.map((close, i) => {
    const d = new Date(start.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    return {
      date: d.toISOString().split("T")[0] ?? "",
      open: close,
      high: close + 3,
      low: close - 3,
      close,
      volume: 1_000_000,
    };
  });
}

describe("simulateCandidate", () => {
  it("long candidate: target hit before stop -> TAKE_PROFIT with positive pnl", () => {
    const c = candidate({ direction: "long", suggestedEntry: 100, suggestedTarget: 110, suggestedStop: 95 });
    // Day 1 drifts up toward target (high touches 111 on day 3), never dips to 95.
    const bars = barsFrom(c.asOfDate, [102, 105, 111]);
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 });
    expect(trade).not.toBeNull();
    expect(trade?.exitReason).toBe("TAKE_PROFIT");
    expect(trade?.pnl).toBeGreaterThan(0);
  });

  it("a single bar spanning both stop and target resolves to the stop (pessimistic assumption)", () => {
    const c = candidate({ direction: "long", suggestedEntry: 100, suggestedTarget: 110, suggestedStop: 95 });
    // First forward bar's low/high range (close±3 by construction) doesn't
    // span both — use explicit bars instead of barsFrom's fixed ±3 range.
    const bars: OHLCVData[] = [
      { date: "2026-06-02", open: 100, high: 112, low: 93, close: 100, volume: 1_000_000 },
    ];
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 });
    expect(trade?.exitReason).toBe("STOP_LOSS");
  });

  it("no bar touches either level -> TIME_LIMIT exit at the close of the final horizon bar", () => {
    const c = candidate({
      direction: "long",
      suggestedEntry: 100,
      suggestedTarget: 110,
      suggestedStop: 95,
      timeHorizonDays: 3,
    });
    const bars = barsFrom(c.asOfDate, [100.5, 101, 101.5, 102, 103]); // flat, never touches 110 or 95
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 });
    expect(trade?.exitReason).toBe("TIME_LIMIT");
    // Horizon is 3 bars — exit must be at the 3rd forward bar (close 101.5), not bar 5.
    expect(trade?.exitPrice).toBeCloseTo(101.5, 5);
  });

  it("short candidate profits when the exit price is below the entry", () => {
    const c = candidate({ direction: "short", suggestedEntry: 100, suggestedTarget: 90, suggestedStop: 105 });
    const bars: OHLCVData[] = [
      { date: "2026-06-02", open: 98, high: 99, low: 89, close: 90, volume: 1_000_000 },
    ];
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 });
    expect(trade?.exitReason).toBe("TAKE_PROFIT");
    expect(trade?.pnl).toBeGreaterThan(0);
  });

  it("applies slippage on both sides at the configured rate and reports it on the Trade", () => {
    const c = candidate({ direction: "long", suggestedEntry: 100, suggestedTarget: 110, suggestedStop: 95 });
    const bars = barsFrom(c.asOfDate, [100.5, 101, 101.5, 102, 103]);
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0.0005, commissionPerTrade: 0 });
    expect(trade).not.toBeNull();
    // Entry fill worse (higher) than raw suggestedEntry for a long.
    expect(trade?.entryPrice).toBeGreaterThan(100);
    expect(trade?.slippage).toBeGreaterThan(0);
    expect(trade?.commission).toBe(0);
  });

  it("quantity = floor(suggestedSizeUsd / suggestedEntry); a size under one share returns null", () => {
    const c = candidate({ suggestedEntry: 100, suggestedSizeUsd: 950 });
    const bars = barsFrom(c.asOfDate, [100, 100, 100, 100, 100]);
    const trade = simulateCandidate(c, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 });
    expect(trade?.quantity).toBe(9);

    const tooSmall = candidate({ suggestedEntry: 100, suggestedSizeUsd: 50 });
    expect(simulateCandidate(tooSmall, bars, { slippagePctPerSide: 0, commissionPerTrade: 0 })).toBeNull();
  });

  it("suggestedSizeUsd === null (sub-threshold or shadow) returns null and never reaches the equity curve", () => {
    const c = candidate({ suggestedSizeUsd: null, mode: "shadow" });
    const bars = barsFrom(c.asOfDate, [100, 100, 100, 100, 100]);
    expect(simulateCandidate(c, bars, { slippagePctPerSide: 0.0005, commissionPerTrade: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runLiveWindow — synthetic-substrate integration tests (network-free)
// ---------------------------------------------------------------------------

function rollup(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: "2026-06-01",
    ticker: "XLE",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

async function writeRollupFixture(dir: string, date: string, rows: TickerDaySummary[]): Promise<void> {
  await fs.writeFile(
    path.join(dir, `ticker-day-summary-${date}.jsonl`),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8",
  );
}

function makeRaw(
  overrides: Partial<RawSignal> & Pick<RawSignal, "signalType" | "ticker" | "score" | "direction">,
): RawSignal {
  return {
    rationale: "stub rationale",
    entryStyle: "close",
    targetSpec: { kind: "atr", period: 5, multiple: 2 },
    timeHorizonDays: 5,
    sourceArticleIds: [],
    sourcePmMarkets: [],
    ...overrides,
  };
}

/** Emits `signals[dateIso]` (if any) on each `generate()` call — deterministic, day-keyed candidates. */
function makeDayKeyedModule(opts: {
  signalType: SignalType;
  mode: SignalMode;
  signals: Record<string, RawSignal[]>;
}): SignalTypeModule {
  return {
    signalType: opts.signalType,
    mode: opts.mode,
    async generate(ctx: SignalContext): Promise<RawSignal[]> {
      return opts.signals[ctx.asOfDate] ?? [];
    },
  };
}

/** Ascending bars, one per calendar day starting the day after `fromIso`, flat price (never hits stop/target). */
function flatBars(fromIso: string, days: number, price = 100): OHLCVData[] {
  const start = new Date(`${fromIso}T00:00:00.000Z`);
  const bars: OHLCVData[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    bars.push({
      date: d.toISOString().split("T")[0] ?? "",
      open: price,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1_000_000,
    });
  }
  return bars;
}

class StubMarketData implements MarketDataSource {
  async fetchHistoricalData(_symbol: string, from: Date, to: Date = new Date()): Promise<OHLCVData[]> {
    const fromIso = from.toISOString().split("T")[0] ?? "";
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    return flatBars(fromIso, days);
  }
}

class StubVixProvider implements VixSource {
  async getForDate(date: Date): Promise<VixQuote> {
    return {
      date: date.toISOString().split("T")[0] ?? "",
      close: 18,
      regime: "elevated",
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  }
}

let intelDataDir: string;

async function writeContinuousRollups(startIso: string, endIso: string): Promise<void> {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const iso = cursor.toISOString().split("T")[0] ?? "";
    await writeRollupFixture(intelDataDir, iso, [rollup({ date: iso })]);
  }
}

/**
 * Plan 11-09 (D-23): every non-shadow candidate now runs through the
 * after-tax/after-fees net hurdle before it can be admitted as a real
 * position. The shipped default `costs.minRewardRisk` (1.5) combined with
 * this file's default `makeRaw`/`levels.ts` fixtures (2x ATR target ÷ 1.5x
 * ATR stop = a 1.333 gross reward:risk) would otherwise cost-demote every
 * candidate here — none of which are testing the cost model. Neutralizes
 * the hurdle the same way `strategy-engine.test.ts`'s `baseConfig()` does.
 */
function relaxedCostsConfig(): StrategyConfig {
  return {
    ...DEFAULT_STRATEGY_CONFIG,
    costs: {
      ...DEFAULT_STRATEGY_CONFIG.costs,
      spreadSlippageBps: 0,
      fxSpreadBps: 0,
      minRewardRisk: 0.01,
    },
  };
}

describe("runLiveWindow", () => {
  it("never imports regime-segmenter", async () => {
    const raw = await fs.readFile(
      path.join(process.cwd(), "src/strategy/backtest/live-window-runner.ts"),
      "utf8",
    );
    expect(/^\s*import[^;]*regime-segmenter/m.test(raw)).toBe(false);
  });

  it("caps concurrency at maxSimultaneousPositions (4) — extra same-window candidates are counted but not traded", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-12";
      await writeContinuousRollups(startIso, endIso);

      // 2 tickers/day on 06-01, 06-02, 06-03 = 6 candidates total. Each has
      // a 5-bar time horizon on flat (never-touch) bars, so it resolves via
      // TIME_LIMIT ~5 calendar days after its own day. By 06-03, the 4
      // positions opened on 06-01/06-02 are all still open (cap reached),
      // so 06-03's 2 candidates must be counted but never traded.
      const signals: Record<string, RawSignal[]> = {
        "2026-06-01": [
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "AAA", score: 0.9, direction: "long" }),
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "BBB", score: 0.8, direction: "long" }),
        ],
        "2026-06-02": [
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "CCC", score: 0.9, direction: "long" }),
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "DDD", score: 0.8, direction: "long" }),
        ],
        "2026-06-03": [
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "EEE", score: 0.9, direction: "long" }),
          makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "FFF", score: 0.8, direction: "long" }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new StubMarketData(),
        vixProvider: new StubVixProvider(),
        config: relaxedCostsConfig(),
      });

      const perType = report.perType.SECTOR_ROTATION_FROM_PM;
      expect(perType.candidateCount).toBe(6); // all 6 counted
      expect(perType.tradeCount).toBe(4); // only 4 ever opened — EEE/FFF blocked by the concurrency cap
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("records a day with no ticker-day-summary file in skippedDays rather than a silent flat return", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      // 06-01 and 06-03 have rollup files; 06-02 deliberately does not.
      await writeRollupFixture(intelDataDir, "2026-06-01", [rollup({ date: "2026-06-01" })]);
      await writeRollupFixture(intelDataDir, "2026-06-03", [rollup({ date: "2026-06-03" })]);

      const module = makeDayKeyedModule({
        signalType: "SECTOR_ROTATION_FROM_PM",
        mode: "core",
        signals: {},
      });

      const report = await runLiveWindow({
        startIso: "2026-06-01",
        endIso: "2026-06-03",
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        modules: [module],
        marketData: new StubMarketData(),
        vixProvider: new StubVixProvider(),
      });

      expect(report.skippedDays).toHaveLength(1);
      expect(report.skippedDays[0]?.date).toBe("2026-06-02");
      expect(report.skippedDays[0]?.reason).toContain("ticker-day-summary");
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("produces a well-formed report labelled LIVE_WINDOW_LABEL with finite metrics when a position moves across days", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-08";
      await writeContinuousRollups(startIso, endIso);

      const signals: Record<string, RawSignal[]> = {
        "2026-06-01": [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "AAA",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 4,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      // Moving (non-flat) prices so the equity curve has real day-to-day variance.
      class MovingMarketData implements MarketDataSource {
        async fetchHistoricalData(_symbol: string, from: Date, to: Date): Promise<OHLCVData[]> {
          const fromIso = from.toISOString().split("T")[0] ?? "";
          const start = new Date(`${fromIso}T00:00:00.000Z`);
          const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
          const bars: OHLCVData[] = [];
          for (let i = 0; i < days; i++) {
            const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            const close = 100 + i * 1.5;
            bars.push({
              date: d.toISOString().split("T")[0] ?? "",
              open: close,
              high: close + 0.5,
              low: close - 0.5,
              close,
              volume: 1_000_000,
            });
          }
          return bars;
        }
      }

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new MovingMarketData(),
        vixProvider: new StubVixProvider(),
        config: relaxedCostsConfig(),
      });

      expect(report.label).toBe(LIVE_WINDOW_LABEL);
      expect(Array.isArray(report.skippedDays)).toBe(true);
      expect(report.combined.tradeCount).toBe(1);
      expect(Number.isFinite(report.combined.metrics.sharpeRatio)).toBe(true);
      expect(report.combined.metrics.volatility).toBeGreaterThan(0);
      expect(report.combined.thinSample).toBe(true); // 1 trade << THIN_SAMPLE_TRADE_THRESHOLD
      expect(THIN_SAMPLE_TRADE_THRESHOLD).toBe(20);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 11-09 (D-24): gross vs after-cost, tax on the loss-offset bucket, and
// the disallowed-loss rule.
// ---------------------------------------------------------------------------

describe("runLiveWindow — gross vs after-cost + tax + disallowed loss (Plan 11-09)", () => {
  function relaxedConfig(overrides: Partial<StrategyConfig["costs"]> = {}): StrategyConfig {
    return {
      ...DEFAULT_STRATEGY_CONFIG,
      costs: {
        ...DEFAULT_STRATEGY_CONFIG.costs,
        fxSpreadBps: 0,
        minRewardRisk: 0.01, // isolate these tests from the ranking gate — they test cost/tax accounting, not the hurdle
        ...overrides,
      },
    };
  }

  /**
   * Flat at 100 before `turnIso` (small, stable ATR for the lookback), then
   * moves `jumpPerDay` × days-since-turn in `directionAfterTurn` — a jump
   * that reliably blows through a 2x-ATR target or a 1.5x-ATR stop within a
   * day or two, giving deterministic win/loss control per test.
   */
  class ControlledMarketData implements MarketDataSource {
    constructor(
      private readonly turnIso: string,
      private readonly directionAfterTurn: 1 | -1,
      private readonly jumpPerDay = 3,
    ) {}
    async fetchHistoricalData(
      _symbol: string,
      from: Date,
      to: Date = new Date(),
    ): Promise<OHLCVData[]> {
      const turnMs = Date.parse(`${this.turnIso}T00:00:00.000Z`);
      const bars: OHLCVData[] = [];
      for (
        let cursor = new Date(from);
        cursor.getTime() <= to.getTime();
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const iso = cursor.toISOString().split("T")[0] ?? "";
        const daysAfterTurn = Math.round((cursor.getTime() - turnMs) / (24 * 60 * 60 * 1000));
        const close =
          daysAfterTurn > 0 ? 100 + this.directionAfterTurn * this.jumpPerDay * daysAfterTurn : 100;
        bars.push({
          date: iso,
          open: close,
          high: close + 0.5,
          low: close - 0.5,
          close,
          volume: 1_000_000,
        });
      }
      return bars;
    }
  }

  it("gross P&L is >= after-cost P&L, and gross/after-cost trade counts match, with non-zero commissions+slippage", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-10";
      await writeContinuousRollups(startIso, endIso);
      const signals: Record<string, RawSignal[]> = {
        [startIso]: [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 5,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new ControlledMarketData(startIso, 1),
        vixProvider: new StubVixProvider(),
        config: relaxedConfig({ perTradeFeeUsd: 5, spreadSlippageBps: 10, marginalRatePct: null }),
      });

      const combined = report.combined;
      expect(combined.tradeCount).toBeGreaterThan(0);
      // Same number of gross trades as after-cost trades (identical entry/
      // exit dates by construction — both computed via simulateCandidate
      // over the SAME candidate/bars, differing only in the costs argument,
      // which the exit-trigger logic never reads).
      expect(combined.grossMetrics.totalTrades).toBe(combined.tradeCount);
      expect(combined.grossMetrics.totalReturnDollar).toBeGreaterThanOrEqual(
        combined.metrics.totalReturnDollar,
      );
      // marginalRatePct: null -> zero tax; the only gap is commissions+slippage.
      expect(combined.costImpact.totalTaxUsd).toBe(0);
      expect(combined.costImpact.taxRateKnown).toBe(false);
      const gap = combined.grossMetrics.totalReturnDollar - combined.metrics.totalReturnDollar;
      expect(gap).toBeCloseTo(
        combined.costImpact.totalCommissions + combined.costImpact.totalSlippage,
        0,
      );
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("adding the gross path does not increase the number of engine replays", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-05"; // 5 usable days
      await writeContinuousRollups(startIso, endIso);
      let generateCallCount = 0;
      const module: SignalTypeModule = {
        signalType: "SECTOR_ROTATION_FROM_PM",
        mode: "core",
        async generate() {
          generateCallCount++;
          return [];
        },
      };

      await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        modules: [module],
        marketData: new StubMarketData(),
        vixProvider: new StubVixProvider(),
        config: relaxedConfig(),
      });

      // One requested type -> one isolated pass + one combined pass (same
      // single type) = 2 passes x 5 days = 10 calls. The gross path is pure
      // arithmetic over cached bars inside runPass — it never calls
      // generateCandidates a second time. If it did, this would be 20.
      expect(generateCallCount).toBe(10);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("a winning trade's after-cost P&L is reduced by the effective tax rate on the taxable portion", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-10";
      await writeContinuousRollups(startIso, endIso);
      const signals: Record<string, RawSignal[]> = {
        [startIso]: [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 5,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new ControlledMarketData(startIso, 1), // price rises -> TAKE_PROFIT
        vixProvider: new StubVixProvider(),
        config: relaxedConfig({
          perTradeFeeUsd: 0,
          spreadSlippageBps: 0,
          jurisdiction: "ON-CA",
          marginalRatePct: 40,
          capitalGainsInclusionPct: null, // use the ON-CA profile's own 50%
        }),
      });

      const combined = report.combined;
      expect(combined.tradeCount).toBeGreaterThan(0);
      expect(combined.metrics.totalReturnDollar).toBeGreaterThan(0); // a real win
      expect(combined.costImpact.taxRateKnown).toBe(true);
      expect(combined.costImpact.totalTaxUsd).toBeGreaterThan(0);
      // effectiveTaxRate = 0.40 * 0.50 = 0.20; with zero commission/slippage
      // the gross P&L IS the pre-tax after-cost P&L.
      const grossPnl = combined.grossMetrics.totalReturnDollar;
      expect(combined.costImpact.totalTaxUsd).toBeCloseTo(grossPnl * 0.2, 0);
      expect(combined.costImpact.effectiveTaxRatePct).toBeCloseTo(20, 1);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("a losing trade carries no tax benefit line of its own — totalTaxUsd stays 0", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-10";
      await writeContinuousRollups(startIso, endIso);
      const signals: Record<string, RawSignal[]> = {
        [startIso]: [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 5,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new ControlledMarketData(startIso, -1), // price falls -> STOP_LOSS
        vixProvider: new StubVixProvider(),
        config: relaxedConfig({
          perTradeFeeUsd: 0,
          spreadSlippageBps: 0,
          jurisdiction: "ON-CA",
          marginalRatePct: 40,
        }),
      });

      const combined = report.combined;
      expect(combined.tradeCount).toBeGreaterThan(0);
      expect(combined.metrics.totalReturnDollar).toBeLessThan(0); // a real loss
      expect(combined.costImpact.totalTaxUsd).toBe(0);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("a loss followed by a re-entry on the same ticker INSIDE the loss window is excluded from the offset bucket and counted in disallowedLossUsd", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-06-20";
      await writeContinuousRollups(startIso, endIso);
      const signals: Record<string, RawSignal[]> = {
        "2026-06-01": [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 3,
          }),
        ],
        "2026-06-08": [
          // Well inside the real ON-CA superficial-loss 30-day window,
          // safely after the first position's ~day-2 stop-loss close.
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 3,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new ControlledMarketData(startIso, -1), // both entries lose
        vixProvider: new StubVixProvider(),
        config: relaxedConfig({ perTradeFeeUsd: 0, spreadSlippageBps: 0, marginalRatePct: null }),
      });

      expect(report.combined.costImpact.disallowedLossUsd).toBeGreaterThan(0);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  });

  it("the identical sequence with the re-entry OUTSIDE the loss window leaves the bucket intact and disallowedLossUsd at 0", async () => {
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-intel-"));
    try {
      const startIso = "2026-06-01";
      const endIso = "2026-08-01"; // wide enough to place a re-entry >30 days after the first close
      await writeContinuousRollups(startIso, endIso);
      const signals: Record<string, RawSignal[]> = {
        "2026-06-01": [
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 3,
          }),
        ],
        "2026-07-15": [
          // 44 days after the first close (~06-03) — outside the real
          // ON-CA 30-day superficial-loss window.
          makeRaw({
            signalType: "SECTOR_ROTATION_FROM_PM",
            ticker: "XLE",
            score: 0.9,
            direction: "long",
            timeHorizonDays: 3,
          }),
        ],
      };
      const module = makeDayKeyedModule({ signalType: "SECTOR_ROTATION_FROM_PM", mode: "core", signals });

      const report = await runLiveWindow({
        startIso,
        endIso,
        types: ["SECTOR_ROTATION_FROM_PM"],
        intelDataDir,
        initialCapital: 100_000,
        modules: [module],
        marketData: new ControlledMarketData(startIso, -1),
        vixProvider: new StubVixProvider(),
        config: relaxedConfig({ perTradeFeeUsd: 0, spreadSlippageBps: 0, marginalRatePct: null }),
      });

      expect(report.combined.costImpact.disallowedLossUsd).toBe(0);
    } finally {
      await fs.rm(intelDataDir, { recursive: true, force: true });
    }
  }, 20_000);
});

// ---------------------------------------------------------------------------
// Real-substrate smoke — only runs when ./data/intel exists on this tree.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync("./data/intel"))("runLiveWindow — real substrate smoke", () => {
  it("completes a 10-day real-substrate window end to end and reports a well-formed result", async () => {
    const report = await runLiveWindow({
      startIso: "2026-06-01",
      endIso: "2026-06-10",
      types: ["SECTOR_ROTATION_FROM_PM"],
      intelDataDir: "./data/intel",
    });

    expect(report.label).toBe(LIVE_WINDOW_LABEL);
    expect(Array.isArray(report.skippedDays)).toBe(true);
    expect(report.window).toEqual({ startIso: "2026-06-01", endIso: "2026-06-10" });
    const perType = report.perType.SECTOR_ROTATION_FROM_PM;
    expect(perType).toBeDefined();
    // Either a finite Sharpe, or an explicit zero-trade report — never NaN/undefined.
    expect(Number.isFinite(perType.metrics.sharpeRatio)).toBe(true);
    expect(Number.isFinite(report.combined.metrics.sharpeRatio)).toBe(true);
  }, 120_000);
});
