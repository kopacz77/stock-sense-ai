/**
 * materiality-prescreen unit tests.
 *
 * Pure module — no tmpdir needed. `fixture(overrides)` builds a realistic
 * NewsArticle default that individual tests override, mirroring the fixture
 * style of `rollup-backfill.test.ts` without the mkdtemp/afterEach scaffold
 * (nothing here touches the filesystem).
 */
import { describe, expect, it } from "vitest";

import type { NewsArticle } from "../../news/types.js";
import {
  comparePrescreen,
  evaluatePrescreen,
  extractFeedId,
  predictMateriality,
  PRESCREEN_HARD_ADMIT,
  PRESCREEN_SOURCE_WEIGHTS,
  PRESCREEN_TOPIC_KEYWORDS,
  PRESCREEN_TOPIC_WEIGHTS,
  type PrescreenLabelledArticle,
} from "../materiality-prescreen.js";

function fixture(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: "finnhub:1",
    source: "finnhub",
    publisher: "Reuters",
    tickers: [],
    headline: "Generic market update",
    summary: "Nothing special happened.",
    url: "https://example.com/a",
    publishedAt: "2026-07-22T14:00:00Z",
    fetchedAt: "2026-07-22T14:01:00Z",
    category: "markets",
    ...overrides,
  };
}

const WATCHLIST = new Set(["NVDA", "AAPL"]);

describe("predictMateriality", () => {
  it("ranks a watchlist-ticker Finnhub article above a non-watchlist Finnhub article", () => {
    const watchlisted = fixture({ tickers: ["NVDA"] });
    const nonWatchlisted = fixture({ tickers: ["XYZ"] });
    expect(predictMateriality(watchlisted, WATCHLIST)).toBeGreaterThan(
      predictMateriality(nonWatchlisted, WATCHLIST),
    );
  });

  it("ranks a non-watchlist ticker-tagged Finnhub article above a ticker-less Finnhub article", () => {
    const tickered = fixture({ tickers: ["XYZ"] });
    const untickered = fixture({ tickers: [] });
    expect(predictMateriality(tickered, WATCHLIST)).toBeGreaterThan(
      predictMateriality(untickered, WATCHLIST),
    );
  });

  it("ranks marketwatch-top with no topic keyword below any ticker-tagged Finnhub article", () => {
    const marketwatch = fixture({
      id: "rss:marketwatch-top:abc123",
      source: "rss",
      tickers: [],
      headline: "Stocks drift sideways in quiet session",
      summary: "Low volume ahead of the weekend.",
    });
    const tickeredFinnhub = fixture({ tickers: ["XYZ"] });
    expect(predictMateriality(marketwatch, WATCHLIST)).toBeLessThan(
      predictMateriality(tickeredFinnhub, WATCHLIST),
    );
  });

  it("ranks a google-world article with a China keyword above the same feed with no topic keyword", () => {
    const withChina = fixture({
      id: "rss:google-world:def456",
      source: "rss",
      tickers: [],
      headline: "China trade talks resume in Beijing",
      summary: "Officials meet to discuss tariffs.",
    });
    const withoutTopic = fixture({
      id: "rss:google-world:ghi789",
      source: "rss",
      tickers: [],
      headline: "Local elections wrap up quietly",
      summary: "Turnout was average.",
    });
    expect(predictMateriality(withChina, WATCHLIST)).toBeGreaterThan(
      predictMateriality(withoutTopic, WATCHLIST),
    );
  });

  it("demotes a crypto-keyword article strictly below the same article with the keyword removed", () => {
    const withCrypto = fixture({
      headline: "Bitcoin rallies amid ETF speculation",
      summary: "Analysts weigh in on bitcoin momentum.",
    });
    const withoutCrypto = fixture({
      headline: "Rallies amid ETF speculation",
      summary: "Analysts weigh in on momentum.",
    });
    expect(predictMateriality(withCrypto, WATCHLIST)).toBeLessThan(
      predictMateriality(withoutCrypto, WATCHLIST),
    );
  });

  it("stays a pure function of its inputs (no Date.now/fs/network — same input, same output)", () => {
    const article = fixture({ tickers: ["NVDA"] });
    const first = predictMateriality(article, WATCHLIST);
    const second = predictMateriality(article, WATCHLIST);
    expect(first).toBe(second);
  });

  it("keeps PRESCREEN_HARD_ADMIT reachable via keywords only at the cnbc-top + china boundary (T-11-01-02)", () => {
    const cnbcTopChina = fixture({
      id: "rss:cnbc-top:zzz",
      source: "rss",
      tickers: [],
      headline: "China announces new stimulus package",
      summary: "Beijing moves to boost growth.",
    });
    expect(predictMateriality(cnbcTopChina, WATCHLIST)).toBeCloseTo(PRESCREEN_HARD_ADMIT, 5);

    // No other RSS feed + topic combination should reach the bar via keywords alone.
    const googleBusinessChina = fixture({
      id: "rss:google-business:yyy",
      source: "rss",
      tickers: [],
      headline: "China announces new stimulus package",
      summary: "Beijing moves to boost growth.",
    });
    expect(predictMateriality(googleBusinessChina, WATCHLIST)).toBeLessThan(PRESCREEN_HARD_ADMIT);
  });
});

describe("extractFeedId", () => {
  it("parses the rss:<feedId>:<hash> shape", () => {
    expect(extractFeedId("rss:marketwatch-top:abc123")).toBe("marketwatch-top");
  });

  it("returns null for a non-rss-prefixed id", () => {
    expect(extractFeedId("finnhub:998877")).toBeNull();
  });

  it("returns null for a malformed rss id with no hash segment", () => {
    expect(extractFeedId("rss:marketwatch-top")).toBeNull();
  });
});

describe("comparePrescreen", () => {
  it("sorts descending by predictMateriality", () => {
    const high = fixture({ id: "finnhub:1", tickers: ["NVDA"] });
    const low = fixture({ id: "finnhub:2", tickers: [] });
    const sorted = [low, high].sort((a, b) => comparePrescreen(a, b, WATCHLIST));
    expect(sorted[0]!.id).toBe("finnhub:1");
  });

  it("tie-breaks by publishedAt descending when scores are equal", () => {
    const older = fixture({ id: "finnhub:1", tickers: [], publishedAt: "2026-07-20T00:00:00Z" });
    const newer = fixture({ id: "finnhub:2", tickers: [], publishedAt: "2026-07-22T00:00:00Z" });
    const sorted = [older, newer].sort((a, b) => comparePrescreen(a, b, WATCHLIST));
    expect(sorted[0]!.id).toBe("finnhub:2");
  });
});

describe("evaluatePrescreen", () => {
  function row(overrides: Partial<PrescreenLabelledArticle> = {}): PrescreenLabelledArticle {
    return {
      id: "art-1",
      source: "finnhub",
      tickers: ["NVDA"],
      headline: "headline",
      publishedAt: "2026-07-22T00:00:00Z",
      maxMateriality: 0.9,
      score: 0.7,
      ...overrides,
    };
  }

  it("computes retention over the top fraction, tie-broken by publishedAt descending", () => {
    const rows: PrescreenLabelledArticle[] = [
      row({ id: "a", score: 0.9, maxMateriality: 0.8 }), // high, in cut
      row({ id: "b", score: 0.7, maxMateriality: 0.2 }), // low, in cut
      row({ id: "c", score: 0.3, maxMateriality: 0.9 }), // high, out of cut
      row({ id: "d", score: 0.1, maxMateriality: 0.1 }), // low, out of cut
    ];
    const result = evaluatePrescreen(rows, 0.5);
    expect(result.total).toBe(4);
    expect(result.highTotal).toBe(2);
    expect(result.cutoffIndex).toBe(2);
    expect(result.highRetained).toBe(1);
    expect(result.retention).toBeCloseTo(0.5, 5);
  });

  it("defines retention as 1 when there are no high-materiality rows", () => {
    const rows: PrescreenLabelledArticle[] = [
      row({ id: "a", maxMateriality: 0.1 }),
      row({ id: "b", maxMateriality: 0.2 }),
    ];
    const result = evaluatePrescreen(rows, 0.5);
    expect(result.highTotal).toBe(0);
    expect(result.retention).toBe(1);
  });
});

describe("exported constants", () => {
  it("exposes the source, topic keyword, and topic weight tables", () => {
    expect(Object.keys(PRESCREEN_SOURCE_WEIGHTS).length).toBeGreaterThan(0);
    expect(Object.keys(PRESCREEN_TOPIC_KEYWORDS).length).toBe(6);
    expect(Object.keys(PRESCREEN_TOPIC_WEIGHTS).length).toBe(6);
  });
});
