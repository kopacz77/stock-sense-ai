/**
 * CatalystRefiner unit tests — Plan 10-05
 *
 * Covers:
 *   - Refinement pass: confidence growth from scored-article materiality
 *   - Magnitude max-merge (existing.magnitudePrior never revised down)
 *   - Direction tie-break: higher-materiality article wins (then latest scoredAt)
 *   - Emerging catalyst: scored.catalysts[] produces a new CatalystFlag with article: source
 *   - Archive trigger: catalyst whose expectedDate < (now-1d) gets archived: true
 *   - Unknown referenced event id: silently ignored
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CatalystFlag, ScoredArticle } from "../types.js";
import { CatalystRefiner } from "../catalyst-refiner.js";

const NOW = new Date("2026-05-31T15:00:00Z");

function makeScored(overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  return {
    id: "art-1::NVDA",
    sourceArticleId: "art-1",
    ticker: "NVDA",
    sentiment: 0.5,
    materiality: 0.5,
    themes: [],
    catalysts: [],
    referencedCalendarEvents: [],
    scoredAt: "2026-05-31T14:00:00Z",
    scorerModel: "qwen/qwen3-14b",
    scorerVersion: "v1",
    ...overrides,
  };
}

function makeCatalyst(overrides: Partial<CatalystFlag> = {}): CatalystFlag {
  return {
    id: "fomc-2026-06-18",
    type: "fomc",
    tickers: [],
    affectedSectors: ["SPY", "TLT"],
    expectedDate: "2026-06-18",
    magnitudePrior: 3,
    direction: "uncertain",
    confidence: 0.3,
    source: "calendar:fred",
    firstSeenAt: "2026-05-20T08:00:00Z",
    ...overrides,
  };
}

describe("CatalystRefiner", () => {
  let tmpDir: string;
  let refiner: CatalystRefiner;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "catalyst-refiner-"));
    refiner = new CatalystRefiner({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("1. refinement — scored article with materiality=0.5 referencing FOMC bumps confidence by 0.05", async () => {
    const existing = [makeCatalyst({ confidence: 0.3 })];
    const scored = [
      makeScored({
        materiality: 0.5,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 3, direction: "down", confidence: 0.7 }],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined).toHaveLength(1);
    expect(result.refined[0]!.confidence).toBeCloseTo(0.35, 6);
    expect(result.refined[0]!.lastRefinedAt).toBe(NOW.toISOString());
  });

  it("2. magnitude max-merge — existing=3, article proposes 4 → updated=4", async () => {
    const existing = [makeCatalyst({ magnitudePrior: 3 })];
    const scored = [
      makeScored({
        materiality: 0.5,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 4, direction: "down", confidence: 0.7 }],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined[0]!.magnitudePrior).toBe(4);
  });

  it("2b. magnitude max-merge does NOT revise down — existing=4, article proposes 2 → still 4", async () => {
    const existing = [makeCatalyst({ magnitudePrior: 4 })];
    const scored = [
      makeScored({
        materiality: 0.5,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 2, direction: "down", confidence: 0.7 }],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined[0]!.magnitudePrior).toBe(4);
  });

  it("3. direction tie-break — higher-materiality article's direction wins", async () => {
    const existing = [makeCatalyst({ direction: "uncertain" })];
    const lowMat = makeScored({
      id: "low::SPY",
      sourceArticleId: "low",
      materiality: 0.5,
      referencedCalendarEvents: ["fomc-2026-06-18"],
      catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 3, direction: "up", confidence: 0.5 }],
    });
    const highMat = makeScored({
      id: "high::SPY",
      sourceArticleId: "high",
      materiality: 0.8,
      referencedCalendarEvents: ["fomc-2026-06-18"],
      catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 3, direction: "down", confidence: 0.7 }],
    });
    const result = await refiner.refineFromScored([lowMat, highMat], existing, NOW);
    expect(result.refined).toHaveLength(1);
    expect(result.refined[0]!.direction).toBe("down");
    // confidence bumps by max materiality (best.materiality = 0.8): 0.3 + 0.08 = 0.38
    expect(result.refined[0]!.confidence).toBeCloseTo(0.38, 6);
  });

  it("4. emerging catalyst — scored.catalysts[] creates new CatalystFlag with article: source", async () => {
    const scored = [
      makeScored({
        sourceArticleId: "art-merger-1",
        ticker: "NVDA",
        catalysts: [
          { type: "ma", expectedDate: null, magnitude: 3, direction: "up", confidence: 0.6 },
        ],
      }),
    ];
    const result = await refiner.refineFromScored(scored, [], NOW);
    expect(result.newEmerging).toHaveLength(1);
    const e = result.newEmerging[0]!;
    expect(e.id).toBe("article-art-merger-1-ma-open");
    expect(e.type).toBe("ma");
    expect(e.tickers).toEqual(["NVDA"]);
    expect(e.source).toBe("article:art-merger-1");
    expect(e.archived).toBeUndefined(); // expectedDate = today, NOT yet < (now-1d)
    expect(e.expectedDate).toBe("2026-05-31"); // today's ISO (no expectedDate provided)
    expect(e.magnitudePrior).toBe(3);
    expect(e.direction).toBe("up");
    expect(e.confidence).toBe(0.6);
  });

  it("5. archive trigger — refined catalyst whose expectedDate is yesterday gets archived: true", async () => {
    // expectedDate = 2026-05-29 ; NOW = 2026-05-31 → cutoff = 2026-05-30 → 05-29 < 05-30 → archive.
    // The scored article's catalysts[] is empty here so we only refine the existing entry —
    // no emerging catalyst is spawned (which would also be past-dated and get archived).
    const existing = [makeCatalyst({ expectedDate: "2026-05-29" })];
    const scored = [
      makeScored({
        materiality: 0.5,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined).toHaveLength(1);
    expect(result.refined[0]!.archived).toBe(true);
    expect(result.archived).toBe(1);
  });

  it("6. unknown referenced event id — silently ignored (no throw, no refinement)", async () => {
    const existing = [makeCatalyst()]; // id = fomc-2026-06-18
    const scored = [
      makeScored({
        materiality: 0.5,
        referencedCalendarEvents: ["unknown-event-id"],
        catalysts: [],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined).toHaveLength(0);
  });

  it("7. emerging catalyst with expected date in the past — gets archived in the same pass", async () => {
    const scored = [
      makeScored({
        sourceArticleId: "stale-art",
        ticker: "AAPL",
        catalysts: [
          { type: "lawsuit", expectedDate: "2026-05-29", magnitude: 2, direction: "down", confidence: 0.4 },
        ],
      }),
    ];
    const result = await refiner.refineFromScored(scored, [], NOW);
    expect(result.newEmerging).toHaveLength(1);
    expect(result.newEmerging[0]!.archived).toBe(true);
    expect(result.archived).toBe(1);
  });

  it("8. persists touched entries to today's catalyst-flags JSONL", async () => {
    const existing = [makeCatalyst({ confidence: 0.3 })];
    const scored = [
      makeScored({
        sourceArticleId: "art-fomc-ref",
        materiality: 0.7,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [
          { type: "fomc", expectedDate: "2026-06-18", magnitude: 4, direction: "down", confidence: 0.8 },
          { type: "ma", expectedDate: "2026-07-15", magnitude: 3, direction: "up", confidence: 0.5 },
        ],
      }),
    ];
    await refiner.refineFromScored(scored, existing, NOW);

    const dayIso = NOW.toISOString().split("T")[0]!;
    const file = path.join(tmpDir, `catalyst-flags-${dayIso}.jsonl`);
    const content = await fs.readFile(file, "utf8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    // 1 refined + 1 newEmerging (the ma catalyst — fomc emerging is suppressed by existing id collision? no, id differs)
    // refined id: fomc-2026-06-18 (matches existing)
    // emerging ids: article-art-fomc-ref-fomc-2026-06-18 AND article-art-fomc-ref-ma-2026-07-15
    // The fomc emerging is also a brand-new id (not in existing), so it's added too.
    expect(lines.length).toBe(3);
  });

  it("9. confidence cap — refinement caps at 1.0 (no overshooting)", async () => {
    const existing = [makeCatalyst({ confidence: 0.95 })];
    const scored = [
      makeScored({
        materiality: 1.0,
        referencedCalendarEvents: ["fomc-2026-06-18"],
        catalysts: [{ type: "fomc", expectedDate: "2026-06-18", magnitude: 3, direction: "down", confidence: 0.7 }],
      }),
    ];
    const result = await refiner.refineFromScored(scored, existing, NOW);
    expect(result.refined[0]!.confidence).toBe(1.0); // capped at 1.0 (0.95 + 0.1 = 1.05 → clamped)
  });
});
