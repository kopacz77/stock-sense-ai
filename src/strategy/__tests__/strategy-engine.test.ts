/**
 * StrategyEngine registry / mode-enforcement tests (M2-05 Plan 11-05, Task 1).
 *
 * Covers every `<behavior>` bullet from Task 1 using stub `SignalTypeModule`
 * implementations for deterministic scores, plus one case that swaps in the
 * real `FadeOvershootModule` to prove the shadow path with a genuine module.
 * `describe("ranking")` (Task 2) covers `resolveTickerCollisions`/
 * `rankCandidates` directly, as pure functions.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { OHLCVData } from "../../data/types.js";
import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import { DEFAULT_STRATEGY_CONFIG } from "../config.js";
import type { StrategyConfig } from "../config.js";
import { defaultSignalModules } from "../signals/index.js";
import { FadeOvershootModule } from "../signals/fade-overshoot.js";
import {
  SignalModeMismatchError,
  StrategyEngine,
  assertModulesMatchConfig,
} from "../strategy-engine.js";
import type { MarketDataSource, VixSource } from "../strategy-engine.js";
import type {
  RawSignal,
  SignalContext,
  SignalMode,
  SignalType,
  SignalTypeModule,
  StrategyCandidate,
} from "../types.js";
import type { VixQuote } from "../vix-provider.js";

let intelDataDir: string;
let strategyDataDir: string;

beforeEach(async () => {
  intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-engine-intel-"));
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-engine-strategy-"));
});

afterEach(async () => {
  await fs.rm(intelDataDir, { recursive: true, force: true });
  await fs.rm(strategyDataDir, { recursive: true, force: true });
});

function rollup(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: "2026-06-25",
    ticker: "XLE",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

async function writeRollupFixture(date: string, rows: TickerDaySummary[]): Promise<void> {
  await fs.writeFile(
    path.join(intelDataDir, `ticker-day-summary-${date}.jsonl`),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8",
  );
}

/** Deterministic 120-bar OHLCV series ending on `asOfDate`, returned newest-first (mirrors Yahoo). */
function stubBars(asOfDate: Date, days = 120): OHLCVData[] {
  const bars: OHLCVData[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(asOfDate.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const close = 91 + i * 0.05;
    bars.push({
      date: d.toISOString().split("T")[0] ?? "",
      open: close - 0.2,
      high: close + 1.0,
      low: close - 1.0,
      close,
      volume: 1_000_000,
    });
  }
  return bars.reverse();
}

class StubMarketData implements MarketDataSource {
  async fetchHistoricalData(
    _symbol: string,
    _from: Date,
    to: Date = new Date(),
  ): Promise<OHLCVData[]> {
    return stubBars(to);
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

/** Duck-typed `SignalTypeModule` (matches the codebase's structural-interface convention). */
function makeModule(opts: {
  signalType: SignalType;
  mode: SignalMode;
  signals?: RawSignal[];
  gate?: (ctx: SignalContext) => Promise<{ ok: boolean; reason: string }>;
  throwError?: Error;
}): SignalTypeModule {
  const mod: SignalTypeModule = {
    signalType: opts.signalType,
    mode: opts.mode,
    async generate(_ctx: SignalContext): Promise<RawSignal[]> {
      if (opts.throwError) throw opts.throwError;
      return opts.signals ?? [];
    },
  };
  if (opts.gate) {
    (mod as { gate?: typeof opts.gate }).gate = opts.gate;
  }
  return mod;
}

function baseConfig(overrides: Partial<StrategyConfig> = {}): StrategyConfig {
  return { ...DEFAULT_STRATEGY_CONFIG, ...overrides };
}

describe("defaultSignalModules", () => {
  it("returns all four v1 modules with modes matching DEFAULT_STRATEGY_CONFIG.signalModes", () => {
    const modules = defaultSignalModules();
    expect(modules).toHaveLength(4);
    const bySignalType = new Map(modules.map((m) => [m.signalType, m.mode]));
    expect(bySignalType.get("CATALYST_ANCHORED")).toBe("core");
    expect(bySignalType.get("SECTOR_ROTATION_FROM_PM")).toBe("core");
    expect(bySignalType.get("SENTIMENT_VELOCITY")).toBe("gated");
    expect(bySignalType.get("FADE_OVERSHOOT")).toBe("shadow");
    // assertModulesMatchConfig must not throw against the real default config.
    expect(() =>
      assertModulesMatchConfig(modules, DEFAULT_STRATEGY_CONFIG.signalModes),
    ).not.toThrow();
  });
});

describe("StrategyEngine — mode enforcement", () => {
  it("throws SignalModeMismatchError at construction naming the offending type", () => {
    const mismatched = makeModule({ signalType: "CATALYST_ANCHORED", mode: "core" });
    const config = baseConfig({ signalModes: { ...DEFAULT_STRATEGY_CONFIG.signalModes, CATALYST_ANCHORED: "shadow" } });

    expect(
      () =>
        new StrategyEngine({
          intelDataDir,
          strategyDataDir,
          modules: [mismatched],
          config,
          vixProvider: new StubVixProvider(),
          marketData: new StubMarketData(),
        }),
    ).toThrow(SignalModeMismatchError);
    expect(
      () =>
        new StrategyEngine({
          intelDataDir,
          strategyDataDir,
          modules: [mismatched],
          config,
          vixProvider: new StubVixProvider(),
          marketData: new StubMarketData(),
        }),
    ).toThrow(/CATALYST_ANCHORED/);
  });

  it("does not throw when every module's mode matches config.signalModes", () => {
    const module = makeModule({ signalType: "CATALYST_ANCHORED", mode: "core" });
    const config = baseConfig();
    expect(
      () =>
        new StrategyEngine({
          intelDataDir,
          strategyDataDir,
          modules: [module],
          config,
          vixProvider: new StubVixProvider(),
          marketData: new StubMarketData(),
        }),
    ).not.toThrow();
  });
});

describe("StrategyEngine — gates", () => {
  const asOfDate = new Date("2026-06-25T00:00:00.000Z");

  it("a failed gate excludes the module and records exactly one skippedTypes entry with the gate's reason verbatim", async () => {
    await writeRollupFixture("2026-06-25", [rollup()]);
    const gatedModule = makeModule({
      signalType: "SENTIMENT_VELOCITY",
      mode: "gated",
      signals: [makeRaw({ signalType: "SENTIMENT_VELOCITY", ticker: "XLE", score: 0.9, direction: "long" })],
      gate: async () => ({ ok: false, reason: "Missing scored-article coverage for 2026-06-22." }),
    });

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules: [gatedModule],
      config: baseConfig(),
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(asOfDate);
    expect(result.ranked).toEqual([]);
    expect(result.skippedTypes).toEqual([
      { signalType: "SENTIMENT_VELOCITY", reason: "Missing scored-article coverage for 2026-06-22." },
    ]);
  });

  it("a passing gate behaves identically to a core module", async () => {
    await writeRollupFixture("2026-06-25", [rollup()]);
    const gatedModule = makeModule({
      signalType: "SENTIMENT_VELOCITY",
      mode: "gated",
      signals: [makeRaw({ signalType: "SENTIMENT_VELOCITY", ticker: "XLE", score: 0.9, direction: "long" })],
      gate: async () => ({ ok: true, reason: "coverage present" }),
    });

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules: [gatedModule],
      config: baseConfig(),
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(asOfDate);
    expect(result.skippedTypes).toEqual([]);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.ticker).toBe("XLE");
    expect(result.ranked[0]?.suggestedSizeUsd).not.toBeNull();
  });
});

describe("StrategyEngine — shadow mode", () => {
  const asOfDate = new Date("2026-06-25T00:00:00.000Z");

  it("a shadow module's signals become mode:shadow candidates with suggestedSizeUsd:null, never in ranked/subThreshold, even at score 0.95", async () => {
    await writeRollupFixture("2026-06-25", [rollup({ ticker: "MSTR" }), rollup({ ticker: "NVDA" })]);

    const shadowModule = makeModule({
      signalType: "FADE_OVERSHOOT",
      mode: "shadow",
      signals: [makeRaw({ signalType: "FADE_OVERSHOOT", ticker: "MSTR", score: 0.95, direction: "short" })],
    });
    const coreModule = makeModule({
      signalType: "CATALYST_ANCHORED",
      mode: "core",
      signals: [makeRaw({ signalType: "CATALYST_ANCHORED", ticker: "NVDA", score: 0.41, direction: "long" })],
    });

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules: [shadowModule, coreModule],
      config: baseConfig(),
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(asOfDate);

    // The shadow candidate (0.95) never displaces the core candidate (0.41).
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.ticker).toBe("NVDA");
    expect(result.ranked.some((c) => c.ticker === "MSTR")).toBe(false);
    expect(result.subThreshold.some((c) => c.ticker === "MSTR")).toBe(false);

    expect(result.shadow).toHaveLength(1);
    expect(result.shadow[0]?.ticker).toBe("MSTR");
    expect(result.shadow[0]?.mode).toBe("shadow");
    expect(result.shadow[0]?.suggestedSizeUsd).toBeNull();
  });

  it("proves the shadow path with a genuine FadeOvershootModule instance", async () => {
    const clockDate = new Date("2026-06-25T12:00:00.000Z");

    // 3 trailing days with a stable signed PM move (mean=1) then a large
    // today overshoot (13) so computeOvershootPp is well above zero.
    for (const [date, movePp] of [
      ["2026-06-22", 1],
      ["2026-06-23", 1],
      ["2026-06-24", 1],
    ] as const) {
      await writeRollupFixture(date, [
        rollup({
          date,
          ticker: "XLE",
          builtAt: `${date}T12:00:00.000Z`,
          pmContribution: {
            netScore: movePp,
            sources: [
              {
                marketId: "m",
                slug: "trailing",
                movePp,
                direction: "long",
                weight: 1,
                contributedScore: movePp,
                volume24hr: 100_000,
              },
            ],
          },
        }),
      ]);
    }
    await writeRollupFixture("2026-06-25", [
      rollup({
        date: "2026-06-25",
        ticker: "XLE",
        builtAt: clockDate.toISOString(),
        pmContribution: {
          netScore: 13,
          sources: [
            {
              marketId: "m",
              slug: "today-overshoot",
              movePp: 13,
              direction: "long",
              weight: 1,
              contributedScore: 13,
              volume24hr: 500_000,
            },
          ],
        },
      }),
    ]);

    const coreModule = makeModule({
      signalType: "CATALYST_ANCHORED",
      mode: "core",
      signals: [makeRaw({ signalType: "CATALYST_ANCHORED", ticker: "NVDA", score: 0.41, direction: "long" })],
    });
    const fadeOvershoot = new FadeOvershootModule({ now: () => clockDate });

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules: [coreModule, fadeOvershoot],
      config: baseConfig(),
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(new Date("2026-06-25T00:00:00.000Z"));

    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.ticker).toBe("NVDA");
    expect(result.shadow).toHaveLength(1);
    expect(result.shadow[0]?.ticker).toBe("XLE");
    expect(result.shadow[0]?.signalType).toBe("FADE_OVERSHOOT");
    expect(result.shadow[0]?.suggestedSizeUsd).toBeNull();
    // The real module's score (overshoot=12, recencyDecay=1.0 -> 0.8) is
    // higher than the core candidate's 0.41, and STILL doesn't rank.
    expect(result.shadow[0]?.score).toBeGreaterThan(0.41);
  });
});

describe("StrategyEngine — persistence", () => {
  it("persists every candidate — ranked, sub-threshold, and shadow alike — to candidates-YYYY-MM-DD.jsonl", async () => {
    const asOfDate = new Date("2026-06-25T00:00:00.000Z");
    await writeRollupFixture("2026-06-25", [
      rollup({ ticker: "AAA" }),
      rollup({ ticker: "BBB" }),
      rollup({ ticker: "CCC" }),
    ]);

    const modules = [
      makeModule({
        signalType: "CATALYST_ANCHORED",
        mode: "core",
        signals: [makeRaw({ signalType: "CATALYST_ANCHORED", ticker: "AAA", score: 0.9, direction: "long" })],
      }),
      makeModule({
        signalType: "SECTOR_ROTATION_FROM_PM",
        mode: "core",
        signals: [makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "BBB", score: 0.1, direction: "short" })],
      }),
      makeModule({
        signalType: "FADE_OVERSHOOT",
        mode: "shadow",
        signals: [makeRaw({ signalType: "FADE_OVERSHOOT", ticker: "CCC", score: 0.5, direction: "long" })],
      }),
    ];

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules,
      config: baseConfig(),
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    await engine.generateCandidates(asOfDate);

    const candidatesFile = path.join(strategyDataDir, "candidates-2026-06-25.jsonl");
    const raw = await fs.readFile(candidatesFile, "utf8");
    const rows = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as StrategyCandidate);

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.ticker === "AAA")?.mode).toBe("ranked");
    expect(rows.find((r) => r.ticker === "BBB")?.mode).toBe("sub-threshold");
    expect(rows.find((r) => r.ticker === "CCC")?.mode).toBe("shadow");
  });
});

describe("StrategyEngine — module failure isolation", () => {
  it("a module throwing inside generate() produces a skippedTypes entry naming the error and leaves the other three types' candidates intact", async () => {
    const asOfDate = new Date("2026-06-25T00:00:00.000Z");
    await writeRollupFixture("2026-06-25", [
      rollup({ ticker: "AAA" }),
      rollup({ ticker: "BBB" }),
      rollup({ ticker: "CCC" }),
    ]);

    const config = baseConfig({
      signalModes: {
        CATALYST_ANCHORED: "core",
        SECTOR_ROTATION_FROM_PM: "core",
        SENTIMENT_VELOCITY: "core",
        FADE_OVERSHOOT: "core",
      },
    });

    const modules = [
      makeModule({
        signalType: "CATALYST_ANCHORED",
        mode: "core",
        signals: [makeRaw({ signalType: "CATALYST_ANCHORED", ticker: "AAA", score: 0.6, direction: "long" })],
      }),
      makeModule({
        signalType: "SECTOR_ROTATION_FROM_PM",
        mode: "core",
        signals: [makeRaw({ signalType: "SECTOR_ROTATION_FROM_PM", ticker: "BBB", score: 0.6, direction: "long" })],
      }),
      makeModule({ signalType: "SENTIMENT_VELOCITY", mode: "core", throwError: new Error("boom") }),
      makeModule({
        signalType: "FADE_OVERSHOOT",
        mode: "core",
        signals: [makeRaw({ signalType: "FADE_OVERSHOOT", ticker: "CCC", score: 0.6, direction: "long" })],
      }),
    ];

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      modules,
      config,
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(asOfDate);

    expect(result.skippedTypes).toHaveLength(1);
    expect(result.skippedTypes[0]?.signalType).toBe("SENTIMENT_VELOCITY");
    expect(result.skippedTypes[0]?.reason).toContain("boom");

    expect(result.ranked).toHaveLength(3);
    expect(result.ranked.map((c) => c.ticker).sort()).toEqual(["AAA", "BBB", "CCC"]);
  });
});
