/**
 * RollupBuilder unit tests — Plan 10-05
 *
 * Tests use `fs.mkdtemp` per case so each test has a clean data dir. Stages
 * synthetic `scored-articles-YYYY-MM-DD.jsonl` and `catalyst-flags-YYYY-MM-DD.jsonl`
 * files, runs `buildForDay`, and asserts on the returned TickerDaySummary[] +
 * persisted output file.
 *
 * Iran worked example (#9) is the canonical end-to-end fixture — proves the
 * full chain materiality-weighting + PM-contribution + catalyst-join produces
 * the expected (weightedSentiment, netScore) pair documented in M2-04 charter.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CatalystFlag, ScoredArticle } from "../types.js";
import type { TickerSignal } from "../pm-mapping-engine.js";
import { RollupBuilder } from "../rollup-builder.js";

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

const TODAY = new Date("2026-05-31T15:00:00Z");
const TODAY_ISO = TODAY.toISOString().split("T")[0]!; // "2026-05-31"

function makeScored(overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  return {
    id: "art-1::NVDA",
    sourceArticleId: "art-1",
    ticker: "NVDA",
    sentiment: 0.7,
    materiality: 0.8,
    themes: ["ai-infra"],
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
    id: "test-cat-1",
    type: "earnings",
    tickers: ["NVDA"],
    expectedDate: "2026-08-21",
    magnitudePrior: 4,
    direction: "uncertain",
    confidence: 0.5,
    source: "calendar:finnhub-earnings",
    firstSeenAt: "2026-05-31T08:00:00Z",
    ...overrides,
  };
}

function makeTickerSignal(overrides: Partial<TickerSignal> = {}): TickerSignal {
  return {
    ticker: "TSLA",
    direction: "long",
    weight: 1.0,
    contributedScore: 3,
    movePp: 3,
    sourceMarketId: "mkt-1",
    sourceSlug: "tsla-rally",
    sourceQuestion: "Will TSLA rally?",
    sourceVolume24hr: 100_000,
    matchedBy: "slugPrefix=tsla",
    ...overrides,
  };
}

async function stageScored(dataDir: string, records: ScoredArticle[]): Promise<void> {
  const file = path.join(dataDir, `scored-articles-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : ""), "utf8");
}

async function stageCatalysts(dataDir: string, records: CatalystFlag[]): Promise<void> {
  const file = path.join(dataDir, `catalyst-flags-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : ""), "utf8");
}

async function readSummaryFile(dataDir: string): Promise<string> {
  const file = path.join(dataDir, `ticker-day-summary-${TODAY_ISO}.jsonl`);
  return await fs.readFile(file, "utf8");
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe("RollupBuilder", () => {
  let tmpDir: string;
  let builder: RollupBuilder;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rollup-builder-"));
    builder = new RollupBuilder({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("1. empty day — no scored, no PM, no catalysts — returns [] and writes empty file", async () => {
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toEqual([]);
    const file = await readSummaryFile(tmpDir);
    expect(file).toBe("");
  });

  it("2. single ticker, single article — weightedSentiment equals article sentiment", async () => {
    await stageScored(tmpDir, [
      makeScored({ ticker: "NVDA", sentiment: 0.7, materiality: 0.8 }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe("NVDA");
    expect(result[0]!.weightedSentiment).toBeCloseTo(0.7, 6);
    expect(result[0]!.totalMateriality).toBeCloseTo(0.8, 6);
    expect(result[0]!.articleCount).toBe(1);
  });

  it("3. materiality-weighting math — 3 articles aggregate to hand-computed value within 0.0001", async () => {
    await stageScored(tmpDir, [
      makeScored({ id: "a::NVDA", sourceArticleId: "a", ticker: "NVDA", sentiment: 0.5, materiality: 0.2 }),
      makeScored({ id: "b::NVDA", sourceArticleId: "b", ticker: "NVDA", sentiment: -0.5, materiality: 0.2 }),
      makeScored({ id: "c::NVDA", sourceArticleId: "c", ticker: "NVDA", sentiment: 0.9, materiality: 0.9 }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    // (0.5×0.2 + -0.5×0.2 + 0.9×0.9) / (0.2+0.2+0.9) = 0.81 / 1.3 ≈ 0.6230769...
    expect(result).toHaveLength(1);
    expect(result[0]!.weightedSentiment).toBeCloseTo(0.6230769, 4);
    expect(result[0]!.totalMateriality).toBeCloseTo(1.3, 6);
    expect(result[0]!.articleCount).toBe(3);
  });

  it("4. zero-materiality articles — weightedSentiment defaults to 0 (no divide-by-zero)", async () => {
    await stageScored(tmpDir, [
      makeScored({ id: "a::NVDA", sourceArticleId: "a", ticker: "NVDA", sentiment: 0.5, materiality: 0 }),
      makeScored({ id: "b::NVDA", sourceArticleId: "b", ticker: "NVDA", sentiment: -0.5, materiality: 0 }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.weightedSentiment).toBe(0);
    expect(result[0]!.totalMateriality).toBe(0);
    expect(result[0]!.articleCount).toBe(2);
  });

  it("5. idempotence — buildForDay twice produces byte-identical file content (excluding builtAt)", async () => {
    await stageScored(tmpDir, [
      makeScored({ ticker: "NVDA", sentiment: 0.4, materiality: 0.6 }),
      makeScored({ id: "x::AMD", sourceArticleId: "x", ticker: "AMD", sentiment: -0.3, materiality: 0.5 }),
    ]);
    await builder.buildForDay(TODAY, []);
    const first = await readSummaryFile(tmpDir);
    await builder.buildForDay(TODAY, []);
    const second = await readSummaryFile(tmpDir);

    // Strip builtAt fields before comparing (only non-deterministic field).
    const stripBuiltAt = (s: string) => s.replace(/"builtAt":"[^"]+"/g, '"builtAt":"X"');
    expect(stripBuiltAt(first)).toBe(stripBuiltAt(second));
  });

  it("6. PM-only ticker — produces rollup row with articleCount=0 and netScore from signals", async () => {
    const pmSignals: TickerSignal[] = [
      makeTickerSignal({ ticker: "TSLA", contributedScore: 2.5, weight: 1.0, movePp: 2.5 }),
      makeTickerSignal({
        ticker: "TSLA",
        contributedScore: 1.5,
        weight: 0.5,
        movePp: 3,
        sourceMarketId: "mkt-2",
        sourceSlug: "tsla-q3-deliveries",
      }),
    ];
    const result = await builder.buildForDay(TODAY, pmSignals);
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe("TSLA");
    expect(result[0]!.articleCount).toBe(0);
    expect(result[0]!.weightedSentiment).toBe(0);
    expect(result[0]!.totalMateriality).toBe(0);
    expect(result[0]!.pmContribution.netScore).toBeCloseTo(4.0, 6);
    expect(result[0]!.pmContribution.sources).toHaveLength(2);
  });

  it("7. catalyst join — single ticker — active catalyst is included, archived catalyst is excluded", async () => {
    await stageScored(tmpDir, [makeScored({ ticker: "NVDA", sentiment: 0.5, materiality: 0.5 })]);
    await stageCatalysts(tmpDir, [
      makeCatalyst({ id: "earnings-NVDA-2026-08-21", tickers: ["NVDA"], expectedDate: "2026-08-21" }),
      makeCatalyst({
        id: "earnings-NVDA-2025-12-01",
        tickers: ["NVDA"],
        expectedDate: "2025-12-01",
        archived: true,
      }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.activeCatalystIds).toEqual(["earnings-NVDA-2026-08-21"]);
  });

  it("8. sector catalyst — affectedSectors join — XLE and USO both pick up the catalyst", async () => {
    await stageScored(tmpDir, [
      makeScored({ id: "a::XLE", sourceArticleId: "a", ticker: "XLE", sentiment: -0.3, materiality: 0.4 }),
      makeScored({ id: "b::USO", sourceArticleId: "b", ticker: "USO", sentiment: -0.4, materiality: 0.5 }),
    ]);
    await stageCatalysts(tmpDir, [
      makeCatalyst({
        id: "opec-2026-06-08",
        type: "opec",
        tickers: [],
        affectedSectors: ["XLE", "USO"],
        expectedDate: "2026-06-08",
      }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toHaveLength(2);
    const xle = result.find((r) => r.ticker === "XLE")!;
    const uso = result.find((r) => r.ticker === "USO")!;
    expect(xle.activeCatalystIds).toEqual(["opec-2026-06-08"]);
    expect(uso.activeCatalystIds).toEqual(["opec-2026-06-08"]);
  });

  it("9. Iran worked example — XLE rollup combines scored article + PM signal + OPEC catalyst", async () => {
    // Article: bearish XLE sentiment (Iran headline broke ceasefire framing); materiality high.
    await stageScored(tmpDir, [
      makeScored({
        id: "iran-art::XLE",
        sourceArticleId: "iran-art",
        ticker: "XLE",
        sentiment: -0.7,
        materiality: 0.85,
        themes: ["geopolitical-conflict", "energy-supply-shock"],
        catalysts: [],
        referencedCalendarEvents: [],
      }),
    ]);
    // OPEC catalyst tomorrow affects XLE.
    await stageCatalysts(tmpDir, [
      makeCatalyst({
        id: "opec-2026-06-01",
        type: "opec",
        tickers: [],
        affectedSectors: ["XLE", "USO"],
        expectedDate: "2026-06-01",
      }),
    ]);
    // PM signal: Iran ceasefire market -4pp, noPp inversion already applied upstream
    //   → contributedScore = -4 × +1 (long) × 1.0 × -1 (noPp) = +4 bullish XLE
    const pmSignals: TickerSignal[] = [
      {
        ticker: "XLE",
        direction: "long",
        weight: 1.0,
        contributedScore: 4,
        movePp: -4,
        sourceMarketId: "iran-mkt-id",
        sourceSlug: "iran-ceasefire-continues-through-june",
        sourceEventSlug: "iran-ceasefire-continues-through",
        sourceQuestion: "Will the Iran ceasefire continue through June?",
        sourceVolume24hr: 6_000_000,
        matchedBy: "eventSlug=iran-ceasefire-continues-through",
      },
    ];

    const result = await builder.buildForDay(TODAY, pmSignals);
    expect(result).toHaveLength(1);
    const xle = result[0]!;
    expect(xle.ticker).toBe("XLE");
    expect(xle.weightedSentiment).toBeCloseTo(-0.7, 6);
    expect(xle.totalMateriality).toBeCloseTo(0.85, 6);
    expect(xle.articleCount).toBe(1);
    expect(xle.pmContribution.netScore).toBe(4);
    expect(xle.pmContribution.sources).toHaveLength(1);
    expect(xle.pmContribution.sources[0]!.movePp).toBe(-4);
    expect(xle.pmContribution.sources[0]!.contributedScore).toBe(4);
    expect(xle.activeCatalystIds).toEqual(["opec-2026-06-01"]);
    expect(xle.themes).toEqual(["energy-supply-shock", "geopolitical-conflict"]);
    expect(xle.lastScoredArticleId).toBe("iran-art");
  });

  it("10. themed-only rows (ticker === \"\") are excluded from the per-ticker rollup", async () => {
    await stageScored(tmpDir, [
      makeScored({ id: "macro::__theme__", sourceArticleId: "macro", ticker: "", sentiment: -0.5, materiality: 0.4 }),
      makeScored({ id: "a::NVDA", sourceArticleId: "a", ticker: "NVDA", sentiment: 0.5, materiality: 0.5 }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe("NVDA");
  });

  it("11. catalyst dedup by id — taking the latest by lastRefinedAt", async () => {
    await stageScored(tmpDir, [makeScored({ ticker: "NVDA", sentiment: 0.5, materiality: 0.5 })]);
    // Two entries with same id but different lastRefinedAt — newer one wins, and it's still active.
    await stageCatalysts(tmpDir, [
      makeCatalyst({
        id: "earnings-NVDA-2026-08-21",
        tickers: ["NVDA"],
        expectedDate: "2026-08-21",
        confidence: 0.3,
        firstSeenAt: "2026-05-31T08:00:00Z",
      }),
      makeCatalyst({
        id: "earnings-NVDA-2026-08-21",
        tickers: ["NVDA"],
        expectedDate: "2026-08-21",
        confidence: 0.7,
        firstSeenAt: "2026-05-31T08:00:00Z",
        lastRefinedAt: "2026-05-31T12:00:00Z",
      }),
    ]);
    const result = await builder.buildForDay(TODAY, []);
    // Just verifies dedup works — RollupBuilder doesn't surface confidence directly, but the
    // active catalyst is included exactly once.
    expect(result).toHaveLength(1);
    expect(result[0]!.activeCatalystIds).toEqual(["earnings-NVDA-2026-08-21"]);
  });

  it("12. PM signal join — multiple signals for one ticker sum into netScore", async () => {
    await stageScored(tmpDir, [makeScored({ ticker: "NVDA", sentiment: 0.5, materiality: 0.5 })]);
    const pmSignals: TickerSignal[] = [
      makeTickerSignal({ ticker: "NVDA", contributedScore: 2.0, movePp: 2 }),
      makeTickerSignal({ ticker: "NVDA", contributedScore: -1.5, movePp: 1.5, sourceMarketId: "mkt-2" }),
      makeTickerSignal({ ticker: "AMD", contributedScore: 5, movePp: 5, sourceMarketId: "mkt-3" }),
    ];
    const result = await builder.buildForDay(TODAY, pmSignals);
    expect(result).toHaveLength(2);
    const nvda = result.find((r) => r.ticker === "NVDA")!;
    const amd = result.find((r) => r.ticker === "AMD")!;
    expect(nvda.pmContribution.netScore).toBeCloseTo(0.5, 6);
    expect(nvda.pmContribution.sources).toHaveLength(2);
    expect(amd.pmContribution.netScore).toBe(5);
    expect(amd.articleCount).toBe(0); // PM-only — no article
  });
});
