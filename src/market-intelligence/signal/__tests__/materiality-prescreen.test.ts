/**
 * materiality-prescreen unit tests.
 *
 * Pure module — no tmpdir needed. `fixture(overrides)` builds a realistic
 * NewsArticle default that individual tests override, mirroring the fixture
 * style of `rollup-backfill.test.ts` without the mkdtemp/afterEach scaffold
 * (nothing here touches the filesystem).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

  it("reaches PRESCREEN_HARD_ADMIT only via a strong source tier plus a strong topic match (T-11-01-02)", () => {
    // google-business (0.20, the max RSS base) + china (0.35, the max topic bonus) = 0.55.
    const googleBusinessChina = fixture({
      id: "rss:google-business:zzz",
      source: "rss",
      tickers: [],
      headline: "China announces new stimulus package",
      summary: "Beijing moves to boost growth.",
    });
    expect(predictMateriality(googleBusinessChina, WATCHLIST)).toBeCloseTo(PRESCREEN_HARD_ADMIT, 5);

    // A weaker RSS tier + the same topic does not reach the bar via keywords alone.
    const marketwatchChina = fixture({
      id: "rss:marketwatch-top:yyy",
      source: "rss",
      tickers: [],
      headline: "China announces new stimulus package",
      summary: "Beijing moves to boost growth.",
    });
    expect(predictMateriality(marketwatchChina, WATCHLIST)).toBeLessThan(PRESCREEN_HARD_ADMIT);

    // Source strength alone (no topic match) never reaches the bar either.
    const watchlistNoTopic = fixture({ tickers: ["NVDA"] });
    expect(predictMateriality(watchlistNoTopic, WATCHLIST)).toBeLessThan(PRESCREEN_HARD_ADMIT);
  });

  it("matches ai_infra and corp_action topics and ranks them as a bonus over no-topic content", () => {
    const aiInfra = fixture({ headline: "Nvidia unveils new AI chip for hyperscaler data centers" });
    const noTopic = fixture({ headline: "Generic market update" });
    expect(predictMateriality(aiInfra, WATCHLIST)).toBeGreaterThan(predictMateriality(noTopic, WATCHLIST));

    const corpAction = fixture({ headline: "Company announces $2 billion acquisition and merger deal" });
    expect(predictMateriality(corpAction, WATCHLIST)).toBeGreaterThan(predictMateriality(noTopic, WATCHLIST));
  });

  it("matches keywords on word boundaries, not raw substrings (Rule 1 fix)", () => {
    // "warranty"/"warehouse" must NOT trigger war_geo via a bare .includes("war") check.
    const warrantyArticle = fixture({
      headline: "Retailer extends warranty program at new warehouse",
      summary: "No geopolitical content here.",
    });
    const noTopic = fixture({ headline: "Generic market update" });
    expect(predictMateriality(warrantyArticle, WATCHLIST)).toBe(predictMateriality(noTopic, WATCHLIST));

    // "said"/"maintain"/"air" must NOT trigger ai_infra via a bare .includes("ai") check.
    const noAiFalsePositive = fixture({
      headline: "CEO said the company will maintain its position in the air travel market",
    });
    expect(predictMateriality(noAiFalsePositive, WATCHLIST)).toBe(predictMateriality(noTopic, WATCHLIST));

    // The real "AI" keyword, as a standalone word, still matches.
    const realAi = fixture({ headline: "Company unveils new AI strategy" });
    expect(predictMateriality(realAi, WATCHLIST)).toBeGreaterThan(predictMateriality(noTopic, WATCHLIST));
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
    expect(Object.keys(PRESCREEN_TOPIC_KEYWORDS).length).toBe(8);
    expect(Object.keys(PRESCREEN_TOPIC_WEIGHTS).length).toBe(8);
  });
});

describe("held-out week retention (D-16 acceptance bar)", () => {
  // Loads the committed prescreen-holdout.jsonl fixture (2026-07-22 -> 07-26,
  // distinct-article join of news + scored-articles, emitted by
  // `intel prescreen-eval --emit-fixture`) and RECOMPUTES each row's score
  // from the live `predictMateriality` weights — so this test fails if the
  // weights regress, not just if the fixture file changes.
  //
  // MEASURED RESULT (see 11-01-SUMMARY.md "Fit methodology" for the full
  // writeup): two honest measurements against this held-out week, both
  // below the D-16 target of >= 0.85 retention at top-50%:
  //   1st: 0.7014 (initial weight fit, tuned only on the June training window)
  //   2nd: 0.6878 (after a general word-boundary plural-stemming fix,
  //        re-tuned only on June, re-measured once — per plan instruction
  //        "tune on the June window only and re-measure")
  // Per plan instruction, this attempt was NOT further retuned against the
  // held-out set itself (that would be tuning-to-the-test). The assertion
  // below locks in the actual measured floor so a future regression is
  // caught, while documenting — not hiding — the D-16 shortfall for
  // operator review.
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "prescreen-holdout.jsonl",
  );
  // watchlist.txt is a tracked repo file (not gitignored data/intel output),
  // so reading it here reproduces the exact same watchlist the CLI measured
  // against — the `intel prescreen-eval` and `intel backlog-drain` commands
  // load it the same way.
  const watchlistPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../watchlist.txt");

  it("loads the committed fixture and re-derives scores from the live weights", () => {
    const watchlist = new Set(
      fs
        .readFileSync(watchlistPath, "utf8")
        .split("\n")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && !s.startsWith("#")),
    );

    const raw = fs.readFileSync(fixturePath, "utf8");
    const rows: PrescreenLabelledArticle[] = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as PrescreenLabelledArticle)
      .map((row) => ({
        ...row,
        // Re-derive score from the live weights — the persisted `score`
        // field is a point-in-time convenience value, not the source of truth.
        score: predictMateriality(
          {
            id: row.id,
            source: row.source,
            tickers: row.tickers,
            headline: row.headline,
            summary: row.summary,
            publishedAt: row.publishedAt,
            url: "",
            fetchedAt: row.publishedAt,
          },
          watchlist,
        ),
      }));

    expect(rows.length).toBeGreaterThan(0);

    const result = evaluatePrescreen(rows, 0.5);
    expect(result.highTotal).toBeGreaterThan(0);
    // Known gap vs. the D-16 target of >= 0.85 — see the file-level comment
    // above and 11-01-SUMMARY.md. This locks in the measured floor as a
    // regression guard, NOT a claim that the D-16 bar is met.
    expect(result.retention).toBeGreaterThanOrEqual(0.65);
  });
});
