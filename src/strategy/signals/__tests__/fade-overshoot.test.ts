import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TickerDaySummary } from "../../../market-intelligence/signal/types.js";
import type { SignalContext } from "../../types.js";
import { computeOvershootPp, FadeOvershootModule, scoreFadeOvershoot } from "../fade-overshoot.js";

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

function pmRollup(
  date: string,
  ticker: string,
  movePp: number,
  weight = 1,
  direction: "long" | "short" = "long",
  builtAt?: string,
): TickerDaySummary {
  return rollup({
    date,
    ticker,
    builtAt: builtAt ?? `${date}T12:00:00.000Z`,
    pmContribution: {
      netScore: movePp * weight * (direction === "long" ? 1 : -1),
      sources: [
        {
          marketId: `m-${date}`,
          slug: `market-${date}`,
          movePp,
          direction,
          weight,
          contributedScore: movePp * weight * (direction === "long" ? 1 : -1),
          volume24hr: 1_000_000,
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

describe("scoreFadeOvershoot", () => {
  it("scoreFadeOvershoot(15, 0) is 1", () => {
    expect(scoreFadeOvershoot(15, 0)).toBe(1);
  });

  it("scoreFadeOvershoot(15, 24) is within 1e-9 of 0.3", () => {
    expect(scoreFadeOvershoot(15, 24)).toBeCloseTo(0.3, 9);
  });

  it("scoreFadeOvershoot(15, 72) is also 0.3 (floor, not further decay)", () => {
    expect(scoreFadeOvershoot(15, 72)).toBeCloseTo(0.3, 9);
  });

  it("scoreFadeOvershoot(7.5, 0) is 0.5", () => {
    expect(scoreFadeOvershoot(7.5, 0)).toBeCloseTo(0.5, 10);
  });

  it("scoreFadeOvershoot(30, 0) is 1 (magnitude clamps at 15pp)", () => {
    expect(scoreFadeOvershoot(30, 0)).toBe(1);
  });

  it("recencyDecay never drops below 0.3 for hours well beyond 24", () => {
    expect(scoreFadeOvershoot(15, 1000)).toBeCloseTo(0.3, 9);
  });
});

describe("computeOvershootPp", () => {
  it("returns today's signed aggregate PM move minus the trailing mean", () => {
    const today = pmRollup("2026-06-25", "XLE", 10);
    const trailing = [
      pmRollup("2026-06-22", "XLE", 2),
      pmRollup("2026-06-23", "XLE", 2),
      pmRollup("2026-06-24", "XLE", 2),
    ];
    // today measure = 10, trailing mean = 2 -> overshoot = 8
    expect(computeOvershootPp(today, trailing)).toBeCloseTo(8, 10);
  });

  it("returns 0 when fewer than 3 trailing days are available", () => {
    const today = pmRollup("2026-06-25", "XLE", 10);
    const trailing = [pmRollup("2026-06-23", "XLE", 2), pmRollup("2026-06-24", "XLE", 2)];
    expect(computeOvershootPp(today, trailing)).toBe(0);
  });

  it("returns 0 for an empty trailing array", () => {
    const today = pmRollup("2026-06-25", "XLE", 10);
    expect(computeOvershootPp(today, [])).toBe(0);
  });
});

describe("FadeOvershootModule", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fade-overshoot-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function writeSummaryFile(day: string, rows: TickerDaySummary[]): Promise<void> {
    const lines = rows.map((r) => JSON.stringify(r)).join("\n");
    await fs.writeFile(
      path.join(dataDir, `ticker-day-summary-${day}.jsonl`),
      rows.length > 0 ? `${lines}\n` : "",
      "utf8",
    );
  }

  it("has mode 'shadow' (literal)", () => {
    const mod = new FadeOvershootModule();
    expect(mod.mode).toBe("shadow");
  });

  it("emits direction 'short' for a positive overshoot (counter-trend inversion)", async () => {
    await writeSummaryFile("2026-06-22", [pmRollup("2026-06-22", "XLE", 2)]);
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "XLE", 2)]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "XLE", 2)]);

    const clock = () => new Date("2026-06-25T12:00:00.000Z");
    const mod = new FadeOvershootModule({ now: clock });
    const today = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-25T12:00:00.000Z");

    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.direction).toBe("short");
  });

  it("emits direction 'long' for a negative overshoot", async () => {
    await writeSummaryFile("2026-06-22", [pmRollup("2026-06-22", "USO", 2, 1, "short")]);
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "USO", 2, 1, "short")]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "USO", 2, 1, "short")]);

    const clock = () => new Date("2026-06-25T12:00:00.000Z");
    const mod = new FadeOvershootModule({ now: clock });
    const today = pmRollup("2026-06-25", "USO", 10, 1, "short", "2026-06-25T12:00:00.000Z");

    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.direction).toBe("long");
  });

  it("never sets sizeModifier and carries no dollar size", async () => {
    await writeSummaryFile("2026-06-22", [pmRollup("2026-06-22", "XLE", 2)]);
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "XLE", 2)]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "XLE", 2)]);

    const mod = new FadeOvershootModule({ now: () => new Date("2026-06-25T12:00:00.000Z") });
    const today = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-25T12:00:00.000Z");

    const [signal] = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signal?.sizeModifier).toBeUndefined();
    expect(signal).not.toHaveProperty("suggestedSizeUsd");
  });

  it("emits the CONTEXT-locked levels/horizon fields (close entry, 1.5x ATR_3 target, 3-day horizon)", async () => {
    await writeSummaryFile("2026-06-22", [pmRollup("2026-06-22", "XLE", 2)]);
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "XLE", 2)]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "XLE", 2)]);

    const mod = new FadeOvershootModule({ now: () => new Date("2026-06-25T12:00:00.000Z") });
    const today = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-25T12:00:00.000Z");

    const [signal] = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signal?.entryStyle).toBe("close");
    expect(signal?.targetSpec).toEqual({ kind: "atr", period: 3, multiple: 1.5 });
    expect(signal?.timeHorizonDays).toBe(3);
  });

  it("hoursSinceOvershoot is deterministic under an injected clock, derived from builtAt, clamped to [0, 48]", async () => {
    await writeSummaryFile("2026-06-22", [pmRollup("2026-06-22", "XLE", 2)]);
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "XLE", 2)]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "XLE", 2)]);

    // builtAt is 10h before the injected "now" -> hoursSinceOvershoot should be 10.
    const today = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-25T02:00:00.000Z");
    const mod = new FadeOvershootModule({ now: () => new Date("2026-06-25T12:00:00.000Z") });
    const [signal] = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    // magnitude = min(1, 8/15); recencyDecay = max(0.3, 1 - 0.7*(10/24))
    const expectedMagnitude = Math.min(1, 8 / 15);
    const expectedDecay = Math.max(0.3, 1 - 0.7 * (10 / 24));
    expect(signal?.score).toBeCloseTo(expectedMagnitude * expectedDecay, 10);

    // A builtAt far in the past (100h before "now") clamps hoursSinceOvershoot at 48.
    const staleToday = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-21T08:00:00.000Z");
    const [staleSignal] = await mod.generate(ctx([staleToday], dataDir, "2026-06-25"));
    const clampedDecay = Math.max(0.3, 1 - 0.7 * (48 / 24));
    expect(staleSignal?.score).toBeCloseTo(expectedMagnitude * clampedDecay, 10);
  });

  it("emits nothing when fewer than 3 trailing days are available", async () => {
    await writeSummaryFile("2026-06-23", [pmRollup("2026-06-23", "XLE", 2)]);
    await writeSummaryFile("2026-06-24", [pmRollup("2026-06-24", "XLE", 2)]);

    const mod = new FadeOvershootModule({ now: () => new Date("2026-06-25T12:00:00.000Z") });
    const today = pmRollup("2026-06-25", "XLE", 10, 1, "long", "2026-06-25T12:00:00.000Z");

    const signals = await mod.generate(ctx([today], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(0);
  });

  it("skips a rollup with an empty pmContribution.sources array", async () => {
    const mod = new FadeOvershootModule({ now: () => new Date("2026-06-25T12:00:00.000Z") });
    const signals = await mod.generate(ctx([rollup()], dataDir, "2026-06-25"));
    expect(signals).toHaveLength(0);
  });
});

describe("module has no import from sizing.ts", () => {
  it("import-scoped grep gate", async () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = await fs.readFile(path.resolve(dir, "../fade-overshoot.ts"), "utf8");
    expect(/^\s*import[^;]*sizing\.js/m.test(content)).toBe(false);
  });
});
