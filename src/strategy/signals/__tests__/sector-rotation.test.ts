import { describe, expect, it } from "vitest";

import type { TickerDaySummary } from "../../../market-intelligence/signal/types.js";
import type { SignalContext } from "../../types.js";
import { scoreSectorRotation, SectorRotationModule } from "../sector-rotation.js";

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

function ctx(rollups: TickerDaySummary[]): SignalContext {
  return {
    asOfDate: "2026-06-25",
    rollups,
    intelDataDir: "./data/intel",
    config: {
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
        CATALYST_ANCHORED: "core",
        SECTOR_ROTATION_FROM_PM: "core",
        SENTIMENT_VELOCITY: "gated",
        FADE_OVERSHOOT: "shadow",
      },
      intelDataDir: "./data/intel",
      strategyDataDir: "./data/strategy",
    },
  };
}

describe("scoreSectorRotation", () => {
  it("matches the D-03 formula on the Iran-ceasefire worked example", () => {
    const r = rollup({
      pmContribution: {
        netScore: 9.6,
        sources: [
          {
            marketId: "m1",
            slug: "iran-ceasefire-continues-through",
            movePp: 12,
            direction: "long",
            weight: 0.8,
            contributedScore: 9.6,
            volume24hr: 2_000_000,
          },
        ],
      },
    });

    const ppNorm = Math.min(1, Math.abs(12 * 0.8) / 10);
    const volNorm = Math.min(1, Math.log10(2_000_000) / 7);
    expect(scoreSectorRotation(r)).toBeCloseTo(ppNorm * volNorm, 10);
  });

  it("returns 0 for an empty sources array", () => {
    expect(scoreSectorRotation(rollup())).toBe(0);
  });

  it("caps ppNorm and volNorm at 1", () => {
    const r = rollup({
      pmContribution: {
        netScore: 50,
        sources: [
          {
            marketId: "m1",
            slug: "extreme-move",
            movePp: 50,
            direction: "long",
            weight: 1,
            contributedScore: 50,
            volume24hr: 1_000_000_000,
          },
        ],
      },
    });
    expect(scoreSectorRotation(r)).toBe(1);
  });
});

describe("SectorRotationModule", () => {
  it("emits a long candidate for a positive netScore", async () => {
    const mod = new SectorRotationModule();
    const r = rollup({
      pmContribution: {
        netScore: 9.6,
        sources: [
          {
            marketId: "m1",
            slug: "iran-ceasefire-continues-through",
            movePp: 12,
            direction: "long",
            weight: 0.8,
            contributedScore: 9.6,
            volume24hr: 2_000_000,
          },
        ],
      },
    });

    const signals = await mod.generate(ctx([r]));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.direction).toBe("long");
    expect(signals[0]?.ticker).toBe("XLE");
    expect(signals[0]?.targetSpec).toEqual({ kind: "atr", period: 10, multiple: 2.0 });
    expect(signals[0]?.rationale).toContain("iran-ceasefire-continues-through");
  });

  it("emits a short candidate for a negative netScore", async () => {
    const mod = new SectorRotationModule();
    const r = rollup({
      ticker: "USO",
      pmContribution: {
        netScore: -3,
        sources: [
          {
            marketId: "m2",
            slug: "oil-glut-market",
            movePp: -3,
            direction: "short",
            weight: 1,
            contributedScore: -3,
            volume24hr: 500_000,
          },
        ],
      },
    });

    const signals = await mod.generate(ctx([r]));
    expect(signals[0]?.direction).toBe("short");
  });

  it("skips a rollup with netScore === 0 even when sources exist (a wash)", async () => {
    const mod = new SectorRotationModule();
    const r = rollup({
      pmContribution: {
        netScore: 0,
        sources: [
          {
            marketId: "m1",
            slug: "wash",
            movePp: 4,
            direction: "long",
            weight: 0.5,
            contributedScore: 2,
            volume24hr: 100_000,
          },
          {
            marketId: "m2",
            slug: "counter-wash",
            movePp: -4,
            direction: "short",
            weight: 0.5,
            contributedScore: -2,
            volume24hr: 100_000,
          },
        ],
      },
    });

    const signals = await mod.generate(ctx([r]));
    expect(signals).toHaveLength(0);
  });

  it("skips a rollup with an empty sources array", async () => {
    const mod = new SectorRotationModule();
    const signals = await mod.generate(ctx([rollup()]));
    expect(signals).toHaveLength(0);
  });
});
