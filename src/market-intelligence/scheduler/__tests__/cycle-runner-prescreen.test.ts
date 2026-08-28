/**
 * cycle-runner D-16 pre-screen wiring tests.
 *
 * cycle-runner.ts's scoring step now sorts intake with `comparePrescreen`
 * and admits past the daily soft cap only at/above `PRESCREEN_HARD_ADMIT`
 * (replacing the `isPriorityArticle` boolean hook). These tests exercise
 * that logic directly against the exported pre-screen primitives — per
 * 11-01-PLAN.md Task 3 step 5, the admission guard is a one-line
 * comparison (`predictMateriality(article, watchlist) >= PRESCREEN_HARD_ADMIT`),
 * so it is replicated here rather than booting a full `runCycle`.
 */

import { describe, it, expect } from "vitest";

import type { NewsArticle } from "../../news/types.js";
import {
  comparePrescreen,
  predictMateriality,
  PRESCREEN_HARD_ADMIT,
} from "../../signal/materiality-prescreen.js";

function fixture(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: "finnhub:1",
    source: "finnhub",
    publisher: "Reuters",
    tickers: [],
    headline: "Generic market update",
    summary: "Nothing special happened.",
    url: "https://example.com/a",
    publishedAt: "2026-08-27T14:00:00Z",
    fetchedAt: "2026-08-27T14:01:00Z",
    category: "markets",
    ...overrides,
  };
}

const WATCHLIST = new Set(["NVDA"]);

/**
 * Mirrors cycle-runner.ts's soft-cap admission guard exactly:
 * `if (runningCount >= cap) { if (prescreenScore < PRESCREEN_HARD_ADMIT) continue; }`
 */
function isAdmittedPastCap(article: NewsArticle, watchlist: Set<string>): boolean {
  return predictMateriality(article, watchlist) >= PRESCREEN_HARD_ADMIT;
}

describe("cycle-runner D-16 pre-screen wiring", () => {
  it("comparePrescreen ranks a watchlist-ticker Finnhub article ahead of a topic-less marketwatch-top RSS article", () => {
    const watchlistFinnhub = fixture({ id: "finnhub:2", tickers: ["NVDA"] });
    const marketwatchNoTopic = fixture({
      id: "rss:marketwatch-top:abc",
      source: "rss",
      tickers: [],
      headline: "Stocks drift sideways in quiet session",
      summary: "Low volume ahead of the weekend.",
    });
    const mixed = [marketwatchNoTopic, watchlistFinnhub];
    mixed.sort((a, b) => comparePrescreen(a, b, WATCHLIST));
    expect(mixed[0]!.id).toBe("finnhub:2");
  });

  it("admits an article past the cap only at/above PRESCREEN_HARD_ADMIT — a watchlist ticker plus a strong topic match clears the bar, a topic-less low-tier feed does not", () => {
    // finnhub:watchlist (0.20) + china (0.35) = 0.55 = PRESCREEN_HARD_ADMIT.
    const watchlistWithCatalyst = fixture({
      id: "finnhub:3",
      tickers: ["NVDA"],
      headline: "NVDA supply chain shift as China trade talks resume",
      summary: "Analysts weigh in.",
    });
    expect(predictMateriality(watchlistWithCatalyst, WATCHLIST)).toBeGreaterThanOrEqual(
      PRESCREEN_HARD_ADMIT,
    );
    expect(isAdmittedPastCap(watchlistWithCatalyst, WATCHLIST)).toBe(true);

    const lowTierNoTopic = fixture({
      id: "rss:marketwatch-top:def",
      source: "rss",
      tickers: [],
      headline: "Stocks drift sideways in quiet session",
      summary: "Low volume ahead of the weekend.",
    });
    expect(predictMateriality(lowTierNoTopic, WATCHLIST)).toBeLessThan(PRESCREEN_HARD_ADMIT);
    expect(isAdmittedPastCap(lowTierNoTopic, WATCHLIST)).toBe(false);
  });

  it("does not mutate or delete skipped articles — they remain in the caller's array, auditable in news-*.jsonl", () => {
    const admitted = fixture({
      id: "finnhub:4",
      tickers: ["NVDA"],
      headline: "NVDA China trade talks resume",
    });
    const skipped = fixture({
      id: "rss:marketwatch-top:ghi",
      source: "rss",
      tickers: [],
      headline: "Stocks drift sideways in quiet session",
    });
    const before = JSON.parse(JSON.stringify([admitted, skipped])) as NewsArticle[];

    // Simulate the cap-admission pass: filter into admitted/skipped buckets
    // without ever writing to the source objects.
    const cap = 0; // pretend the cap is already exhausted
    let runningCount = cap;
    const scoredThisCycle: NewsArticle[] = [];
    for (const article of [admitted, skipped]) {
      if (runningCount >= cap && !isAdmittedPastCap(article, WATCHLIST)) continue;
      scoredThisCycle.push(article);
      runningCount += 1;
    }

    expect(scoredThisCycle.map((a) => a.id)).toEqual(["finnhub:4"]);
    // The raw articles — including the skipped one — are byte-identical to
    // their pre-pass state; the pre-screen never deletes or edits intake.
    expect([admitted, skipped]).toEqual(before);
  });
});
