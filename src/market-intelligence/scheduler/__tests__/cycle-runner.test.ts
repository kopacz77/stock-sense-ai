/**
 * cycle-runner unit tests.
 *
 * Covers stampCorrelator: every CONFIRMED/DIVERGENCE alert a cycle emits must
 * carry the correlator path that produced it, so the rule-based fallbacks (32%
 * of live cycles on 2026-07-24) can be filtered out of the M2-05 corpus. The
 * IntelligenceAlerter persists alerts verbatim, so the field reaches
 * alerts-fired once stamped here.
 */

import { describe, it, expect } from "vitest";
import type { ConfirmedAlert, DivergenceAlert } from "../../alerts/types.js";
import type { MarketSnapshot } from "../../polymarket/types.js";
import type { NewsArticle } from "../../news/types.js";
import { stampCorrelator } from "../cycle-runner.js";

const market: MarketSnapshot = {
  id: "mkt-1",
  slug: "will-x-happen",
  question: "Will X happen?",
  active: true,
  outcomes: ["Yes", "No"],
  prices: [0.6, 0.4],
  yesPrice: 0.6,
  volume24hr: 100_000,
  volume1wk: 500_000,
  liquidity: 50_000,
  oneHourPriceChange: 0.05,
  oneDayPriceChange: 0.1,
  oneWeekPriceChange: 0.1,
  competitive: 0.5,
  fetchedAt: "2026-07-24T14:00:00Z",
};

const article: NewsArticle = {
  id: "art-1",
  source: "finnhub",
  publisher: "Reuters",
  tickers: ["NVDA"],
  headline: "Something happened",
  summary: "Body.",
  url: "https://example.com/1",
  publishedAt: "2026-07-24T13:55:00Z",
  fetchedAt: "2026-07-24T13:56:00Z",
};

const confirmed: ConfirmedAlert = {
  kind: "HEADLINE_PM_CONFIRMED",
  article,
  market,
  pmMovePp: 5,
  rationale: "explains it",
  createdAt: "2026-07-24T14:00:00Z",
};

const divergence: DivergenceAlert = {
  kind: "HEADLINE_PM_DIVERGENCE",
  market,
  pmMovePp: -8,
  windowDescription: "90 min",
  rationale: "no news",
  createdAt: "2026-07-24T14:00:00Z",
};

describe("stampCorrelator", () => {
  it("labels every alert with the correlator path that produced it", () => {
    const stamped = stampCorrelator([confirmed, divergence], "rule-based");

    expect(stamped).toHaveLength(2);
    expect(stamped[0]?.correlator).toBe("rule-based");
    expect(stamped[1]?.correlator).toBe("rule-based");
  });

  it("preserves all other alert fields", () => {
    const [stamped] = stampCorrelator([confirmed], "llm");

    expect(stamped).toMatchObject({
      kind: "HEADLINE_PM_CONFIRMED",
      pmMovePp: 5,
      rationale: "explains it",
      correlator: "llm",
    });
    expect(stamped?.kind === "HEADLINE_PM_CONFIRMED" && stamped.article.id).toBe("art-1");
  });

  it("does not mutate the input alerts", () => {
    stampCorrelator([confirmed], "llm");
    expect(confirmed.correlator).toBeUndefined();
  });
});
