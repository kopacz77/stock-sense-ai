/**
 * DigestBuilder unit tests — Plan 10-06
 *
 * Each test stages a clean tmpdir, writes synthetic JSONL fixtures, calls
 * `build()` on the relevant flavor, and asserts on the returned DigestPayload.
 *
 * The Markdown renderer is covered by a focused smoke test that exercises
 * title differentiation and a balanced-formatting check.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { NewsArticle } from "../../news/types.js";
import type { MarketSnapshot } from "../../polymarket/types.js";
import type { CatalystFlag, ScoredArticle } from "../../signal/types.js";

import {
  DigestBuilder,
  digestTitle,
  renderDigestMarkdown,
} from "../digest-builder.js";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-31T16:30:00Z"); // 12:30 ET, picks MIDDAY in scheduler
const TODAY_ISO = NOW.toISOString().split("T")[0]!;

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
    scoredAt: NOW.toISOString(),
    scorerModel: "qwen/qwen3-14b",
    scorerVersion: "v1",
    ...overrides,
  };
}

function makeArticle(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: "art-1",
    source: "finnhub",
    publisher: "Reuters",
    tickers: ["NVDA"],
    headline: "NVDA beats earnings",
    url: "https://example.com/nvda",
    publishedAt: NOW.toISOString(),
    fetchedAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeCatalyst(overrides: Partial<CatalystFlag> = {}): CatalystFlag {
  return {
    id: "earnings-NVDA-2026-06-01",
    type: "earnings",
    tickers: ["NVDA"],
    expectedDate: "2026-06-01",
    magnitudePrior: 4,
    direction: "uncertain",
    confidence: 0.5,
    source: "calendar:finnhub-earnings",
    firstSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    id: "mkt-1",
    slug: "iran-ceasefire",
    question: "Will the Iran ceasefire hold through June?",
    active: true,
    outcomes: ["Yes", "No"],
    prices: [0.55, 0.45],
    yesPrice: 0.55,
    volume24hr: 500_000,
    volume1wk: 1_000_000,
    liquidity: 100_000,
    oneHourPriceChange: -0.04, // -4pp
    oneDayPriceChange: -0.06,
    oneWeekPriceChange: -0.1,
    competitive: 0.9,
    fetchedAt: NOW.toISOString(),
    ...overrides,
  };
}

async function stageScored(dataDir: string, records: ScoredArticle[]): Promise<void> {
  if (records.length === 0) return;
  const file = path.join(dataDir, `scored-articles-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

async function stageNews(dataDir: string, records: NewsArticle[]): Promise<void> {
  if (records.length === 0) return;
  const file = path.join(dataDir, `news-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

async function stageCatalysts(dataDir: string, records: CatalystFlag[]): Promise<void> {
  if (records.length === 0) return;
  const file = path.join(dataDir, `catalyst-flags-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

async function stageSnapshots(
  dataDir: string,
  records: MarketSnapshot[],
): Promise<void> {
  if (records.length === 0) return;
  const file = path.join(dataDir, `polymarket-snapshots-${TODAY_ISO}.jsonl`);
  await fs.writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

// ───────────────────────────────────────────────────────────────────────────
// Suite
// ───────────────────────────────────────────────────────────────────────────

describe("DigestBuilder", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "digest-builder-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns empty payload when no inputs are staged", async () => {
    const builder = new DigestBuilder({ dataDir });
    const payload = await builder.build("MORNING", NOW);

    expect(payload.flavor).toBe("MORNING");
    expect(payload.topStories).toEqual([]);
    expect(payload.upcomingCalendar).toEqual([]);
    // MORNING flavor never returns pmMovers
    expect(payload.pmMovers).toBeUndefined();
    expect(payload.builtAt).toBe(NOW.toISOString());
  });

  it("picks top stories by materiality DESC then |sentiment| DESC, deduped by sourceArticleId", async () => {
    // 5 scored rows: art-1 has two ticker fan-outs (NVDA, AMD) with different materiality;
    // art-2 has one row with lower materiality; art-3 has highest materiality.
    const scored: ScoredArticle[] = [
      makeScored({ id: "art-1::NVDA", sourceArticleId: "art-1", ticker: "NVDA", materiality: 0.6, sentiment: 0.3 }),
      makeScored({ id: "art-1::AMD", sourceArticleId: "art-1", ticker: "AMD", materiality: 0.8, sentiment: 0.7 }),
      makeScored({ id: "art-2::TSLA", sourceArticleId: "art-2", ticker: "TSLA", materiality: 0.5, sentiment: -0.4 }),
      makeScored({ id: "art-3::SPY", sourceArticleId: "art-3", ticker: "SPY", materiality: 0.9, sentiment: 0.2 }),
      makeScored({ id: "art-4::AAPL", sourceArticleId: "art-4", ticker: "AAPL", materiality: 0.3, sentiment: 0.1 }),
    ];
    const news: NewsArticle[] = [
      makeArticle({ id: "art-1", headline: "Chip demand soars", tickers: ["NVDA", "AMD"] }),
      makeArticle({ id: "art-2", headline: "Tesla recall", tickers: ["TSLA"], url: "https://example.com/tsla" }),
      makeArticle({ id: "art-3", headline: "Fed signals pause", tickers: ["SPY"], url: "https://example.com/fed" }),
      makeArticle({ id: "art-4", headline: "Minor news", tickers: ["AAPL"] }),
    ];
    await stageScored(dataDir, scored);
    await stageNews(dataDir, news);

    const builder = new DigestBuilder({ dataDir });
    const payload = await builder.build("MIDDAY", NOW);

    // Top 2 stories: art-3 (mat=0.9), then art-1 (mat=0.8 via AMD row)
    expect(payload.topStories).toHaveLength(2);
    expect(payload.topStories[0]?.articleId).toBe("art-3");
    expect(payload.topStories[0]?.headline).toBe("Fed signals pause");
    expect(payload.topStories[1]?.articleId).toBe("art-1");
    expect(payload.topStories[1]?.headline).toBe("Chip demand soars");
    // art-1's join should reflect the source-news tickers (both NVDA + AMD), not just the fan-out row
    expect(payload.topStories[1]?.tickers).toEqual(["NVDA", "AMD"]);
    expect(payload.topStories[1]?.materiality).toBeCloseTo(0.8);
  });

  it("filters calendar to next 24h, drops archived and past events", async () => {
    const future12h = new Date(NOW.getTime() + 12 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    const future3d = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;

    const catalysts: CatalystFlag[] = [
      makeCatalyst({ id: "in-window", expectedDate: future12h }),
      makeCatalyst({ id: "too-far", expectedDate: future3d }),
      makeCatalyst({ id: "archived", expectedDate: yesterday, archived: true }),
    ];
    await stageCatalysts(dataDir, catalysts);

    const builder = new DigestBuilder({ dataDir });
    const payload = await builder.build("MORNING", NOW);

    expect(payload.upcomingCalendar).toHaveLength(1);
    expect(payload.upcomingCalendar[0]?.eventId).toBe("in-window");
  });

  it("MORNING omits pmMovers; MIDDAY returns top movers ranked by |movePp| × log10(vol)", async () => {
    const snapshots: MarketSnapshot[] = [
      // small move, high vol — moderate score
      makeSnapshot({ id: "m-small", slug: "btc-100k", oneHourPriceChange: -0.02, volume24hr: 5_000_000, question: "BTC 100k?" }),
      // big move, modest vol — highest score
      makeSnapshot({ id: "m-big", slug: "iran-ceasefire", oneHourPriceChange: -0.06, volume24hr: 800_000, question: "Iran ceasefire?" }),
      // big move, tiny vol — middle
      makeSnapshot({ id: "m-tiny-vol", slug: "obscure", oneHourPriceChange: 0.08, volume24hr: 5_000, question: "Obscure?" }),
    ];
    await stageSnapshots(dataDir, snapshots);

    const builder = new DigestBuilder({ dataDir });

    const morning = await builder.build("MORNING", NOW);
    expect(morning.pmMovers).toBeUndefined();

    const midday = await builder.build("MIDDAY", NOW);
    expect(midday.pmMovers).toHaveLength(2);
    // 0.06 × log10(800_001) ≈ 0.06 × 5.90 = 0.354
    // 0.02 × log10(5_000_001) ≈ 0.02 × 6.70 = 0.134
    // 0.08 × log10(5_001)     ≈ 0.08 × 3.70 = 0.296
    // Order: m-big > m-tiny-vol > m-small  → top 2 = [m-big, m-tiny-vol]
    expect(midday.pmMovers?.[0]?.marketId).toBe("m-big");
    expect(midday.pmMovers?.[1]?.marketId).toBe("m-tiny-vol");
    // movePp is reported in percentage points: -0.06 -> -6.0pp
    expect(midday.pmMovers?.[0]?.movePp).toBeCloseTo(-6.0, 4);
  });

  it("top story without a news join shows fallback headline but still renders", async () => {
    // Stage a scored row whose sourceArticleId has no matching news entry.
    const scored = [makeScored({ id: "orphan::SPY", sourceArticleId: "orphan", ticker: "SPY" })];
    await stageScored(dataDir, scored);
    // No news file written.

    const builder = new DigestBuilder({ dataDir });
    const payload = await builder.build("CLOSE", NOW);

    expect(payload.topStories).toHaveLength(1);
    expect(payload.topStories[0]?.headline).toBe("(headline missing)");
    expect(payload.topStories[0]?.publisher).toBe("(unknown)");
    // Falls back to scored row's ticker since news meta absent.
    expect(payload.topStories[0]?.tickers).toEqual(["SPY"]);
    expect(payload.topStories[0]?.url).toBe("");
  });

  it("renderDigestMarkdown produces flavor-specific title and balanced asterisks", async () => {
    // Stage a small payload via builder to keep this an end-to-end smoke.
    const scored = [makeScored({ materiality: 0.9, sentiment: -0.5 })];
    await stageScored(dataDir, scored);
    await stageNews(dataDir, [makeArticle()]);

    const builder = new DigestBuilder({ dataDir });
    const morning = renderDigestMarkdown(await builder.build("MORNING", NOW));
    const midday = renderDigestMarkdown(await builder.build("MIDDAY", NOW));
    const close = renderDigestMarkdown(await builder.build("CLOSE", NOW));

    expect(morning).toContain(digestTitle("MORNING"));
    expect(midday).toContain(digestTitle("MIDDAY"));
    expect(close).toContain(digestTitle("CLOSE"));

    // Balanced asterisks (every *...* pair closes — count is even).
    for (const md of [morning, midday, close]) {
      const stars = (md.match(/\*/g) ?? []).length;
      expect(stars % 2).toBe(0);
    }

    // No literal "EVENING" in any rendered body (regression guard).
    expect(morning).not.toContain("EVENING");
    expect(midday).not.toContain("EVENING");
    expect(close).not.toContain("EVENING");
  });
});
