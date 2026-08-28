import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TickerDaySummary } from "../../../market-intelligence/signal/types.js";
import type { SignalContext } from "../../types.js";
import {
  findUsablePrior,
  scoreSentimentVelocity,
  SentimentVelocityModule,
} from "../sentiment-velocity.js";

function rollup(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: "2026-06-25",
    ticker: "NVDA",
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

// A real fixture modelled on the 2026-07-27 -> 08-27 PM-only outage rows:
// articleCount 0, totalMateriality 0, but pmContribution still populated
// (the rollup rebuilds from PM/catalyst data even when the scorer is down).
function outageRow(date: string, ticker = "NVDA"): TickerDaySummary {
  return rollup({
    date,
    ticker,
    articleCount: 0,
    totalMateriality: 0,
    weightedSentiment: 0,
    pmContribution: {
      netScore: 2,
      sources: [
        {
          marketId: "m1",
          slug: "some-pm-market",
          movePp: 2,
          direction: "long",
          weight: 1,
          contributedScore: 2,
          volume24hr: 500_000,
        },
      ],
    },
  });
}

function baseConfig() {
  return {
    version: 1,
    lastUpdated: "2026-08-27",
    addedBy: "manual-2026-08-27",
    assumedEquity: 7500,
    scoreFloor: 0.4,
    maxCandidatesPerDay: 5,
    subThresholdCount: 3,
    maxSimultaneousPositions: 4,
    vixThresholds: { calmBelow: 15, stressedAbove: 25 },
    regimeSizePct: { calm: 0.25, elevated: 0.125, stressed: 0.0625 },
    typeSizeModifier: { FADE_OVERSHOOT: 0.5 },
    signalModes: {
      CATALYST_ANCHORED: "core" as const,
      SECTOR_ROTATION_FROM_PM: "core" as const,
      SENTIMENT_VELOCITY: "gated" as const,
      FADE_OVERSHOOT: "shadow" as const,
    },
    intelDataDir: "./data/intel",
    strategyDataDir: "./data/strategy",
  };
}

function ctx(rollups: TickerDaySummary[], intelDataDir: string, asOfDate = "2026-06-25"): SignalContext {
  return { asOfDate, rollups, intelDataDir, config: { ...baseConfig(), intelDataDir } };
}

describe("scoreSentimentVelocity", () => {
  it("is 0 when prior is undefined", () => {
    expect(scoreSentimentVelocity(rollup({ totalMateriality: 2.0 }), undefined)).toBe(0);
  });

  it("is 0 when today.totalMateriality is 0", () => {
    const today = rollup({ totalMateriality: 0, weightedSentiment: 0.6 });
    const prior = rollup({ weightedSentiment: -0.1, totalMateriality: 1 });
    expect(scoreSentimentVelocity(today, prior)).toBe(0);
  });

  it("matches the D-03 formula: delta 0.7, materialityFloor 1.0 -> 0.7", () => {
    const today = rollup({ weightedSentiment: 0.6, totalMateriality: 2.0 });
    const prior = rollup({ weightedSentiment: -0.1 });
    expect(scoreSentimentVelocity(today, prior)).toBeCloseTo(0.7, 10);
  });

  it("materialityFloor halves the same delta at totalMateriality 1.0", () => {
    const today = rollup({ weightedSentiment: 0.6, totalMateriality: 1.0 });
    const prior = rollup({ weightedSentiment: -0.1 });
    expect(scoreSentimentVelocity(today, prior)).toBeCloseTo(0.35, 10);
  });

  it("clamps at 1", () => {
    const today = rollup({ weightedSentiment: 1.0, totalMateriality: 5.0 });
    const prior = rollup({ weightedSentiment: -1.0 });
    expect(scoreSentimentVelocity(today, prior)).toBe(1);
  });
});

describe("findUsablePrior", () => {
  it("finds a materiality > 0 row at the target date", () => {
    const history = [rollup({ date: "2026-06-22", totalMateriality: 1.5 })];
    const found = findUsablePrior(history, "2026-06-22", 7);
    expect(found?.date).toBe("2026-06-22");
  });

  it("walks backward through unusable days to find a usable one within the window", () => {
    const history = [
      outageRow("2026-06-22"), // totalMateriality 0 — unusable
      outageRow("2026-06-21"), // totalMateriality 0 — unusable
      rollup({ date: "2026-06-20", totalMateriality: 0.8 }), // usable
    ];
    const found = findUsablePrior(history, "2026-06-22", 7);
    expect(found?.date).toBe("2026-06-20");
  });

  it("returns undefined when no usable day exists in the window", () => {
    const history = [outageRow("2026-06-22"), outageRow("2026-06-21")];
    expect(findUsablePrior(history, "2026-06-22", 2)).toBeUndefined();
  });

  it("treats a totalMateriality: 0 PM-only row (real outage shape) as unusable, not a zero-sentiment reading", () => {
    const history = [outageRow("2026-06-22")];
    expect(findUsablePrior(history, "2026-06-22", 1)).toBeUndefined();
  });
});

describe("SentimentVelocityModule", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentiment-velocity-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("has mode 'gated' (literal) and implements gate", () => {
    const mod = new SentimentVelocityModule();
    expect(mod.mode).toBe("gated");
    expect(typeof mod.gate).toBe("function");
  });

  async function writeScoredArticlesFile(day: string): Promise<void> {
    await fs.writeFile(
      path.join(dataDir, `scored-articles-${day}.jsonl`),
      `${JSON.stringify({ id: "a1" })}\n`,
      "utf8",
    );
  }

  async function writeSummaryFile(day: string, rows: TickerDaySummary[]): Promise<void> {
    const lines = rows.map((r) => JSON.stringify(r)).join("\n");
    await fs.writeFile(
      path.join(dataDir, `ticker-day-summary-${day}.jsonl`),
      rows.length > 0 ? `${lines}\n` : "",
      "utf8",
    );
  }

  it("gate() returns ok: false with a reason naming missing days for an uncovered window", async () => {
    const mod = new SentimentVelocityModule();
    const result = await mod.gate(ctx([], dataDir, "2026-06-25"));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("2026-06-22");
    expect(result.reason).toContain("2026-06-23");
    expect(result.reason).toContain("2026-06-24");
  });

  it("gate() returns ok: true when the trailing 3-day window is fully scored", async () => {
    for (const day of ["2026-06-22", "2026-06-23", "2026-06-24"]) {
      await writeScoredArticlesFile(day);
      await writeSummaryFile(day, [rollup({ date: day, articleCount: 2, totalMateriality: 1 })]);
    }

    const mod = new SentimentVelocityModule();
    const result = await mod.gate(ctx([], dataDir, "2026-06-25"));
    expect(result.ok).toBe(true);
  });

  it("generate() is never relied upon to signal a coverage hole — it produces signals from whatever data is present regardless of gate() state", async () => {
    // Note: dataDir has NO scored-articles files at all (gate() would say
    // ok: false here) but the prior day's rollup IS present with real
    // materiality, so generate() — which does not consult gate() itself —
    // still finds a usable prior and emits. The engine, not generate(),
    // is responsible for calling gate() first and skipping generate()
    // entirely on a coverage hole.
    await writeSummaryFile("2026-06-22", [
      rollup({ date: "2026-06-22", ticker: "NVDA", weightedSentiment: -0.1, totalMateriality: 1.5 }),
    ]);

    const mod = new SentimentVelocityModule();
    const today = rollup({
      date: "2026-06-25",
      ticker: "NVDA",
      weightedSentiment: 0.6,
      totalMateriality: 2.0,
      articleCount: 4,
    });

    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.score).toBeCloseTo(0.7, 10);
  });

  it("emits direction 'long' for a positive delta and 'short' for a negative delta", async () => {
    await writeSummaryFile("2026-06-22", [
      rollup({ date: "2026-06-22", ticker: "NVDA", weightedSentiment: -0.1, totalMateriality: 1 }),
      rollup({ date: "2026-06-22", ticker: "TSLA", weightedSentiment: 0.5, totalMateriality: 1 }),
    ]);

    const mod = new SentimentVelocityModule();
    const rollups = [
      rollup({ date: "2026-06-25", ticker: "NVDA", weightedSentiment: 0.6, totalMateriality: 2.0 }),
      rollup({ date: "2026-06-25", ticker: "TSLA", weightedSentiment: -0.2, totalMateriality: 2.0 }),
    ];
    const signals = await mod.generate(ctx(rollups, dataDir, "2026-06-25"));

    const nvda = signals.find((s) => s.ticker === "NVDA");
    const tsla = signals.find((s) => s.ticker === "TSLA");
    expect(nvda?.direction).toBe("long");
    expect(tsla?.direction).toBe("short");
  });

  it("emits nothing when the delta is exactly 0", async () => {
    await writeSummaryFile("2026-06-22", [
      rollup({ date: "2026-06-22", ticker: "NVDA", weightedSentiment: 0.3, totalMateriality: 1 }),
    ]);

    const mod = new SentimentVelocityModule();
    const today = rollup({
      date: "2026-06-25",
      ticker: "NVDA",
      weightedSentiment: 0.3,
      totalMateriality: 2.0,
    });
    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(0);
  });

  it("emits the CONTEXT-locked levels/horizon fields (pullback entry, 2.5x ATR_5 target, 7-day horizon)", async () => {
    await writeSummaryFile("2026-06-22", [
      rollup({ date: "2026-06-22", ticker: "NVDA", weightedSentiment: -0.1, totalMateriality: 1 }),
    ]);

    const mod = new SentimentVelocityModule();
    const today = rollup({
      date: "2026-06-25",
      ticker: "NVDA",
      weightedSentiment: 0.6,
      totalMateriality: 2.0,
      articleCount: 4,
      lastScoredArticleId: "article-123",
    });
    const [signal] = await mod.generate(ctx([today], dataDir, "2026-06-25"));

    expect(signal?.entryStyle).toBe("pullback");
    expect(signal?.targetSpec).toEqual({ kind: "atr", period: 5, multiple: 2.5 });
    expect(signal?.timeHorizonDays).toBe(7);
    expect(signal?.sourceArticleIds).toEqual(["article-123"]);
  });

  it("skips a totalMateriality: 0 PM-only prior (real outage shape) rather than producing a fabricated delta", async () => {
    // Prior day is present but is exactly the real outage shape — no
    // usable prior exists within the walk-back window, so no signal.
    const store = outageRow("2026-06-22", "NVDA");
    await fs.writeFile(
      path.join(dataDir, "ticker-day-summary-2026-06-22.jsonl"),
      `${JSON.stringify(store)}\n`,
      "utf8",
    );

    const mod = new SentimentVelocityModule();
    const today = rollup({
      date: "2026-06-25",
      ticker: "NVDA",
      weightedSentiment: 0.6,
      totalMateriality: 2.0,
    });
    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(0);
  });
});
