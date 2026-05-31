import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MarketSnapshot } from "../../polymarket/types.js";
import type { PmMapping, PmMappingProposal } from "../types.js";
import { PmMappingEngine } from "../pm-mapping-engine.js";

/* ----- test fixtures ----- */

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    id: "mkt-1",
    slug: "default-slug",
    question: "Default question?",
    active: true,
    outcomes: ["Yes", "No"],
    prices: [0.5, 0.5],
    yesPrice: 0.5,
    volume24hr: 1_000_000,
    volume1wk: 5_000_000,
    liquidity: 100_000,
    oneHourPriceChange: 0,
    oneDayPriceChange: 0,
    oneWeekPriceChange: 0,
    competitive: 0.5,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

const SEED_MAPPINGS: PmMapping[] = [
  // Iran ceasefire — noPp inversion, 5 tickers (4 long, 1 short)
  {
    match: {
      eventSlug: "iran-ceasefire-continues-through",
      slugPrefix: null,
      questionContains: null,
    },
    tickers: [
      { ticker: "XLE", direction: "long", weight: 1.0 },
      { ticker: "USO", direction: "long", weight: 1.0 },
      { ticker: "LMT", direction: "long", weight: 0.6 },
      { ticker: "RTX", direction: "long", weight: 0.6 },
      { ticker: "JETS", direction: "short", weight: 0.5 },
    ],
    interpretation: "noPp",
    rationale: "test seed",
  },
  // Bitcoin — slugPrefix match, yesPp
  {
    match: {
      eventSlug: null,
      slugPrefix: "will-bitcoin-reach-",
      questionContains: null,
    },
    tickers: [
      { ticker: "COIN", direction: "long", weight: 0.8 },
      { ticker: "MSTR", direction: "long", weight: 1.0 },
      { ticker: "IBIT", direction: "long", weight: 1.0 },
    ],
    interpretation: "yesPp",
    rationale: "test seed",
  },
  // Fed — multi-field match (slugPrefix + questionContains), yesPp
  {
    match: {
      eventSlug: null,
      slugPrefix: "fed-decision-in-",
      questionContains: "rate cut",
    },
    tickers: [
      { ticker: "TLT", direction: "long", weight: 1.0 },
      { ticker: "IEF", direction: "long", weight: 0.7 },
      { ticker: "XLF", direction: "short", weight: 0.5 },
      { ticker: "IWM", direction: "long", weight: 0.6 },
    ],
    interpretation: "yesPp",
    rationale: "test seed",
  },
];

async function writeConfig(
  configPath: string,
  mappings: PmMapping[],
): Promise<void> {
  const payload = {
    version: 1,
    lastUpdated: "2026-05-31",
    mappings,
    proposed: [],
  };
  await fs.writeFile(configPath, JSON.stringify(payload, null, 2), "utf8");
}

/* ----- fixture lifecycle ----- */

let tmpDir: string;
let configPath: string;
let dataDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-mapping-engine-"));
  configPath = path.join(tmpDir, "pm-market-mappings.json");
  dataDir = path.join(tmpDir, "intel");
  await writeConfig(configPath, SEED_MAPPINGS);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/* ----- tests ----- */

describe("PmMappingEngine", () => {
  it("matches eventSlug with noPp inversion (Iran ceasefire canonical case)", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });
    const snapshot = makeSnapshot({
      id: "iran-mkt",
      slug: "iran-ceasefire-continues-through-2026-q3",
      eventSlug: "iran-ceasefire-continues-through",
      question: "Will the Iran ceasefire hold through Q3 2026?",
      oneHourPriceChange: -0.04, // -4pp
    });

    const result = await engine.mapMarket(snapshot);
    expect("tickerSignals" in result).toBe(true);
    if (!("tickerSignals" in result)) return; // type narrow for TS

    expect(result.tickerSignals).toHaveLength(5);

    const xle = result.tickerSignals.find((s) => s.ticker === "XLE");
    expect(xle).toBeDefined();
    // movePp=-4, dirSign=+1 (long), weight=1.0, interpSign=-1 (noPp) → +4
    expect(xle?.contributedScore).toBeCloseTo(4, 10);
    expect(xle?.movePp).toBeCloseTo(-4, 10);
    expect(xle?.matchedBy).toBe(
      "eventSlug=iran-ceasefire-continues-through",
    );

    const uso = result.tickerSignals.find((s) => s.ticker === "USO");
    expect(uso?.contributedScore).toBeCloseTo(4, 10);

    const lmt = result.tickerSignals.find((s) => s.ticker === "LMT");
    // -4 × +1 × 0.6 × -1 = +2.4
    expect(lmt?.contributedScore).toBeCloseTo(2.4, 10);

    const rtx = result.tickerSignals.find((s) => s.ticker === "RTX");
    expect(rtx?.contributedScore).toBeCloseTo(2.4, 10);

    const jets = result.tickerSignals.find((s) => s.ticker === "JETS");
    expect(jets).toBeDefined();
    // movePp=-4, dirSign=-1 (short), weight=0.5, interpSign=-1 (noPp)
    // -4 × -1 × 0.5 × -1 = -2 (bearish JETS — war risk back hits airlines)
    expect(jets?.contributedScore).toBeCloseTo(-2, 10);
  });

  it("matches slugPrefix with yesPp pass-through (Bitcoin case)", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });
    const snapshot = makeSnapshot({
      id: "btc-mkt",
      slug: "will-bitcoin-reach-100k-by-q3",
      eventSlug: "bitcoin-price-targets",
      question: "Will Bitcoin reach $100k by Q3?",
      oneHourPriceChange: 0.03, // +3pp
    });

    const result = await engine.mapMarket(snapshot);
    expect("tickerSignals" in result).toBe(true);
    if (!("tickerSignals" in result)) return;

    expect(result.tickerSignals).toHaveLength(3);

    const coin = result.tickerSignals.find((s) => s.ticker === "COIN");
    // +3 × +1 × 0.8 × +1 = +2.4
    expect(coin?.contributedScore).toBeCloseTo(2.4, 10);
    expect(coin?.matchedBy).toBe("slugPrefix=will-bitcoin-reach-");

    const mstr = result.tickerSignals.find((s) => s.ticker === "MSTR");
    expect(mstr?.contributedScore).toBeCloseTo(3, 10);

    const ibit = result.tickerSignals.find((s) => s.ticker === "IBIT");
    expect(ibit?.contributedScore).toBeCloseTo(3, 10);
  });

  it("requires ALL multi-field criteria to match (Fed slugPrefix + questionContains)", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });

    // Both fields match → fires
    const fullMatch = makeSnapshot({
      id: "fed-1",
      slug: "fed-decision-in-june",
      question: "Will the Fed announce a rate cut in June?",
      oneHourPriceChange: 0.02, // +2pp
    });
    const r1 = await engine.mapMarket(fullMatch);
    expect("tickerSignals" in r1).toBe(true);
    if (!("tickerSignals" in r1)) return;
    expect(r1.tickerSignals).toHaveLength(4);

    const tlt = r1.tickerSignals.find((s) => s.ticker === "TLT");
    // +2 × +1 × 1.0 × +1 = +2
    expect(tlt?.contributedScore).toBeCloseTo(2, 10);
    const xlf = r1.tickerSignals.find((s) => s.ticker === "XLF");
    // +2 × -1 × 0.5 × +1 = -1
    expect(xlf?.contributedScore).toBeCloseTo(-1, 10);
    expect(tlt?.matchedBy).toBe(
      'slugPrefix=fed-decision-in-&questionContains="rate cut"',
    );

    // slugPrefix matches, but question doesn't contain "rate cut" → no match
    const slugOnly = makeSnapshot({
      id: "fed-2",
      slug: "fed-decision-in-july",
      question: "Will the Fed hold rates steady in July?",
      oneHourPriceChange: 0.02,
    });
    const r2 = await engine.mapMarket(slugOnly);
    expect("unmatched" in r2).toBe(true);

    // questionContains matches, but slug doesn't have prefix → no match
    const questionOnly = makeSnapshot({
      id: "fed-3",
      slug: "ecb-rate-cut-2026",
      question: "Will the ECB announce a rate cut in June?",
      oneHourPriceChange: 0.02,
    });
    const r3 = await engine.mapMarket(questionOnly);
    expect("unmatched" in r3).toBe(true);
  });

  it("returns unmatched and persists a PmMappingProposal when no mapping fires", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });
    const snapshot = makeSnapshot({
      id: "weather-mkt",
      slug: "will-it-rain-in-boston",
      eventSlug: "boston-weather-2026",
      question: "Will it rain in Boston?",
      oneHourPriceChange: 0.01,
    });

    const single = await engine.mapMarket(snapshot);
    expect("unmatched" in single).toBe(true);

    const batch = await engine.mapMarkets([snapshot]);
    expect(batch.tickerSignals).toHaveLength(0);
    expect(batch.excludedCount).toBe(0);
    expect(batch.proposals).toHaveLength(1);

    const proposal = batch.proposals[0];
    expect(proposal.marketId).toBe("weather-mkt");
    expect(proposal.slug).toBe("will-it-rain-in-boston");
    expect(proposal.eventSlug).toBe("boston-weather-2026");
    expect(proposal.question).toBe("Will it rain in Boston?");
    expect(proposal.proposedTickers).toEqual([]);
    expect(proposal.interpretationSuggestion).toBe("yesPp");

    // Verify the proposal was persisted to the JSONL stream.
    const files = await fs.readdir(dataDir);
    const proposalFiles = files.filter((f) =>
      f.startsWith("pm-mappings-proposed-"),
    );
    expect(proposalFiles).toHaveLength(1);

    const content = await fs.readFile(
      path.join(dataDir, proposalFiles[0]),
      "utf8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    const persisted = JSON.parse(lines[0]) as PmMappingProposal;
    expect(persisted.marketId).toBe("weather-mkt");
  });

  it("bypasses sports/entertainment markets via EXCLUSION_KEYWORDS — no signal, no proposal", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });
    const snapshot = makeSnapshot({
      id: "iran-fifa",
      slug: "iran-fifa-world-cup-2026",
      // Mentions "iran" (would match if the question alone drove matching) but also "fifa".
      question: "Will Iran win FIFA World Cup?",
      oneHourPriceChange: 0.05,
    });

    const single = await engine.mapMarket(snapshot);
    expect("excluded" in single).toBe(true);

    const batch = await engine.mapMarkets([snapshot]);
    expect(batch.tickerSignals).toHaveLength(0);
    expect(batch.proposals).toHaveLength(0);
    expect(batch.excludedCount).toBe(1);

    // Verify nothing was written to the proposal store.
    const exists = await fs
      .stat(dataDir)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      const files = await fs.readdir(dataDir);
      const proposalFiles = files.filter((f) =>
        f.startsWith("pm-mappings-proposed-"),
      );
      expect(proposalFiles).toHaveLength(0);
    }
  });

  it("refuses to fire an all-null catch-all mapping rule", async () => {
    const dangerous: PmMapping = {
      match: { eventSlug: null, slugPrefix: null, questionContains: null },
      tickers: [{ ticker: "SPY", direction: "long", weight: 1.0 }],
      interpretation: "yesPp",
    };
    await writeConfig(configPath, [dangerous]);
    const engine = new PmMappingEngine({ configPath, dataDir });

    const snapshot = makeSnapshot({
      id: "anything",
      slug: "anything-at-all",
      eventSlug: "any-event",
      question: "Some random question?",
      oneHourPriceChange: 0.1,
    });

    const result = await engine.mapMarket(snapshot);
    expect("unmatched" in result).toBe(true);
  });

  it("applies all matching mappings when multiple rules hit one market", async () => {
    const overlapping: PmMapping[] = [
      // Rule A: matches on eventSlug
      {
        match: {
          eventSlug: "overlap-event",
          slugPrefix: null,
          questionContains: null,
        },
        tickers: [{ ticker: "AAA", direction: "long", weight: 1.0 }],
        interpretation: "yesPp",
      },
      // Rule B: matches on slugPrefix (same market)
      {
        match: {
          eventSlug: null,
          slugPrefix: "overlap-slug-",
          questionContains: null,
        },
        tickers: [{ ticker: "BBB", direction: "long", weight: 0.5 }],
        interpretation: "yesPp",
      },
      // Rule C: matches on questionContains (same market) — same ticker AAA, will stack
      {
        match: {
          eventSlug: null,
          slugPrefix: null,
          questionContains: "shared phrase",
        },
        tickers: [{ ticker: "AAA", direction: "long", weight: 0.3 }],
        interpretation: "yesPp",
      },
    ];
    await writeConfig(configPath, overlapping);
    const engine = new PmMappingEngine({ configPath, dataDir });

    const snapshot = makeSnapshot({
      id: "overlap-mkt",
      slug: "overlap-slug-q3",
      eventSlug: "overlap-event",
      question: "A shared phrase question here",
      oneHourPriceChange: 0.02, // +2pp
    });

    const result = await engine.mapMarket(snapshot);
    expect("tickerSignals" in result).toBe(true);
    if (!("tickerSignals" in result)) return;

    // 3 rules fire, 1 ticker per rule → 3 signals (AAA appears twice from rules A and C).
    expect(result.tickerSignals).toHaveLength(3);

    const aaaSignals = result.tickerSignals.filter((s) => s.ticker === "AAA");
    expect(aaaSignals).toHaveLength(2);
    // Both AAA contributions stack (rollup builder in Plan 05 sums them downstream).
    // Rule A weight 1.0 → +2; Rule C weight 0.3 → +0.6
    const aaaSum = aaaSignals.reduce((acc, s) => acc + s.contributedScore, 0);
    expect(aaaSum).toBeCloseTo(2.6, 10);

    const bbb = result.tickerSignals.find((s) => s.ticker === "BBB");
    expect(bbb?.contributedScore).toBeCloseTo(1, 10); // +2 × 0.5
  });

  it("caches mappings in memory; invalidateCache forces reload from disk", async () => {
    const engine = new PmMappingEngine({ configPath, dataDir });

    const snapshot = makeSnapshot({
      id: "cached-mkt",
      slug: "will-bitcoin-reach-150k",
      question: "Will Bitcoin reach $150k?",
      oneHourPriceChange: 0.01,
    });

    const r1 = await engine.mapMarket(snapshot);
    expect("tickerSignals" in r1).toBe(true);
    if (!("tickerSignals" in r1)) return;
    expect(r1.tickerSignals).toHaveLength(3); // COIN/MSTR/IBIT

    // Mutate config on disk: remove the bitcoin mapping entirely.
    const onlyIran = SEED_MAPPINGS.filter(
      (m) => m.match.eventSlug === "iran-ceasefire-continues-through",
    );
    await writeConfig(configPath, onlyIran);

    // Without invalidation, the engine still serves the cached 3 mappings.
    const r2 = await engine.mapMarket(snapshot);
    expect("tickerSignals" in r2).toBe(true);
    if (!("tickerSignals" in r2)) return;
    expect(r2.tickerSignals).toHaveLength(3);

    // After invalidation, the reload picks up the new (smaller) config.
    engine.invalidateCache();
    const r3 = await engine.mapMarket(snapshot);
    expect("unmatched" in r3).toBe(true);
    expect(await engine.mappingCount()).toBe(1);
  });
});
