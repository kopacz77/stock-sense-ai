/**
 * M2-05 article-intake materiality pre-screen (D-16).
 *
 * This module decides *what to score first*, never *what a score is*. It is
 * a pure, synchronous ranking function that runs before the LLM scorer sees
 * an article — the scorer (`article-scorer.ts`) remains the only thing that
 * produces sentiment/materiality. The pre-screen only reorders the intake
 * queue that feeds the existing 500/day soft cap in `cycle-runner.ts`.
 *
 * Why: only ~7% of LLM-scored articles are high-materiality (>=0.5), and 73%
 * of that high-materiality mass comes from ticker-tagged Finnhub (US-company)
 * news vs. 26% from macro RSS. Scoring in arrival order wastes LLM budget on
 * low-yield feeds (marketwatch-top, google-world, crypto keywords) ahead of
 * high-yield ones. See `.planning/phases/11-ai-strategy/11-CONTEXT.md`
 * "Article intake thrift" for the full evidence and acceptance bar.
 *
 * Must stay pure and synchronous (no `Date.now()`, no `fs`, no network, no
 * LLM call) so the scheduler can call it once per article per cycle with no
 * added latency or side effects.
 */

import type { NewsArticle } from "../news/types.js";

/**
 * Topic buckets used for the additive keyword bonus, ordered by measured
 * hit-rate in the 2026-06-02 -> 07-26 corpus (China 12%, earnings 10%,
 * Fed/rates 9%, oil 7%, war/geo 6%, crypto 2% and demoted).
 */
export type PrescreenTopic = "china" | "earnings" | "war_geo" | "fed_rates" | "oil" | "crypto";

/**
 * Source-tier weights. Finnhub tiers are keyed by watchlist-ticker presence;
 * RSS tiers are keyed by `rss:<feedId>` (feed id extracted via
 * `extractFeedId`). `unknown` covers any source/feed this table doesn't
 * recognize.
 *
 * Values derived from the CONTEXT.md evidence that 73% of high-materiality
 * mass is ticker-tagged Finnhub US-company news and macro RSS supplies 26%.
 */
export const PRESCREEN_SOURCE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  "finnhub:watchlist": 0.7,
  "finnhub:tickered": 0.55,
  "finnhub:untickered": 0.3,
  "rss:cnbc-top": 0.25,
  "rss:google-business": 0.22,
  "rss:google-world": 0.12,
  "rss:cnbc-markets": 0.1,
  "rss:marketwatch-top": 0.08,
  unknown: 0.15,
});

/** Keyword lists matched case-insensitively against `${headline} ${summary ?? ""}`. */
export const PRESCREEN_TOPIC_KEYWORDS: Readonly<Record<PrescreenTopic, readonly string[]>> =
  Object.freeze({
    china: ["china", "chinese", "beijing", "xi jinping", "yuan", "taiwan", "shenzhen", "hong kong"],
    earnings: [
      "earnings",
      "quarterly results",
      "guidance",
      "eps",
      "revenue beat",
      "revenue miss",
      "profit warning",
    ],
    fed_rates: [
      "fed",
      "federal reserve",
      "powell",
      "rate cut",
      "rate hike",
      "interest rate",
      "fomc",
      "cpi",
      "inflation",
      "nonfarm",
      "jobs report",
    ],
    oil: ["oil", "crude", "opec", "brent", "wti", "barrel", "refinery"],
    war_geo: [
      "war",
      "strike",
      "missile",
      "ceasefire",
      "invasion",
      "sanction",
      "tariff",
      "blockade",
      "airspace",
      "hormuz",
      "iran",
      "israel",
      "ukraine",
      "russia",
    ],
    crypto: ["bitcoin", "ethereum", "crypto", "altcoin", "stablecoin", "memecoin"],
  });

/**
 * Additive bonus per matched topic bucket. `crypto` is negative by design —
 * a demotion, not a bonus (crypto keywords have the lowest hit-rate, 2%, in
 * the measured corpus).
 */
export const PRESCREEN_TOPIC_WEIGHTS: Readonly<Record<PrescreenTopic, number>> = Object.freeze({
  china: 0.3,
  earnings: 0.25,
  fed_rates: 0.22,
  oil: 0.18,
  war_geo: 0.2,
  crypto: -0.1,
});

/**
 * Rank score at/above which an article is admitted for scoring even after
 * the daily soft cap is hit — the ticker-tagged-Finnhub tier
 * (`finnhub:tickered` = 0.55). Preserves the old "watchlist ticker always
 * gets scored" behavior of `isPriorityArticle` while dropping the "any macro
 * keyword anywhere" escape hatch that let low-yield feeds bypass the cap.
 *
 * Boundary note (T-11-01-02): the best RSS source weight (`rss:cnbc-top`
 * 0.25) plus the best topic bonus (`china` 0.30) sums to exactly 0.55 — a
 * cnbc-top China headline is the only RSS combination that can reach this
 * bar via keywords alone. See `materiality-prescreen.test.ts` for the
 * boundary assertion.
 */
export const PRESCREEN_HARD_ADMIT = 0.55;

const POSITIVE_TOPICS: readonly Exclude<PrescreenTopic, "crypto">[] = [
  "china",
  "earnings",
  "fed_rates",
  "oil",
  "war_geo",
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const UNKNOWN_SOURCE_WEIGHT = PRESCREEN_SOURCE_WEIGHTS.unknown as number;

function sourceWeight(article: NewsArticle, watchlist: Set<string>): number {
  if (article.source === "finnhub") {
    const hasWatchlistTicker = article.tickers.some((t) => watchlist.has(t.toUpperCase()));
    if (hasWatchlistTicker) return PRESCREEN_SOURCE_WEIGHTS["finnhub:watchlist"] as number;
    if (article.tickers.length > 0) return PRESCREEN_SOURCE_WEIGHTS["finnhub:tickered"] as number;
    return PRESCREEN_SOURCE_WEIGHTS["finnhub:untickered"] as number;
  }
  if (article.source === "rss") {
    const feedId = extractFeedId(article.id);
    const key = feedId ? `rss:${feedId}` : null;
    if (key !== null && key in PRESCREEN_SOURCE_WEIGHTS) {
      return PRESCREEN_SOURCE_WEIGHTS[key] as number;
    }
    return UNKNOWN_SOURCE_WEIGHT;
  }
  return UNKNOWN_SOURCE_WEIGHT;
}

function topicBonus(article: NewsArticle): number {
  const hay = `${article.headline} ${article.summary ?? ""}`.toLowerCase();
  let bonus = 0;
  for (const topic of POSITIVE_TOPICS) {
    if (PRESCREEN_TOPIC_KEYWORDS[topic].some((kw) => hay.includes(kw))) {
      bonus = Math.max(bonus, PRESCREEN_TOPIC_WEIGHTS[topic]);
    }
  }
  if (PRESCREEN_TOPIC_KEYWORDS.crypto.some((kw) => hay.includes(kw))) {
    bonus += PRESCREEN_TOPIC_WEIGHTS.crypto;
  }
  return bonus;
}

/**
 * Predicted P(materiality >= 0.5) proxy in [0,1]. Pure, synchronous — reads
 * only `NewsArticle` fields already present on disk (source, tickers,
 * headline, summary, id for feed extraction). Never calls the LLM and never
 * writes a sentiment/materiality value; it only ranks intake.
 */
export function predictMateriality(article: NewsArticle, watchlist: Set<string>): number {
  return clamp01(sourceWeight(article, watchlist) + topicBonus(article));
}

/**
 * Extract the macro-RSS feed id from an article id of the shape
 * `rss:<feedId>:<hash>` (produced by `MacroNewsPoller`). Returns `null` for
 * any id that is not `rss:`-prefixed (e.g. `finnhub:998877`) or is
 * malformed. Deliberately does not read `article.publisher` — the id prefix
 * is the stable key.
 */
export function extractFeedId(articleId: string): string | null {
  if (!articleId.startsWith("rss:")) return null;
  const rest = articleId.slice(4);
  const sepIdx = rest.indexOf(":");
  if (sepIdx <= 0) return null;
  return rest.slice(0, sepIdx);
}

/**
 * Stable comparator: descending `predictMateriality`, tie-broken by
 * `publishedAt` descending — identical tie-break semantics to the
 * `isPriorityArticle` sort it replaces at the `cycle-runner.ts` call site.
 */
export function comparePrescreen(a: NewsArticle, b: NewsArticle, watchlist: Set<string>): number {
  const sa = predictMateriality(a, watchlist);
  const sb = predictMateriality(b, watchlist);
  if (sa !== sb) return sb - sa;
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

/**
 * One row of the held-out evaluation corpus: a distinct news article joined
 * with its ground-truth label (max `materiality` across all
 * `ScoredArticle` rows for that `sourceArticleId`) and its pre-screen
 * `score` (computed by the caller via `predictMateriality`, since this type
 * carries no watchlist context of its own). This is exactly the row shape
 * `intel prescreen-eval --emit-fixture` persists, one per line, to
 * `__tests__/fixtures/prescreen-holdout.jsonl`.
 */
export interface PrescreenLabelledArticle {
  id: string;
  source: string;
  publisher?: string;
  category?: string;
  tickers: string[];
  headline: string;
  summary?: string;
  publishedAt: string;
  maxMateriality: number;
  /** Pre-screen score for this row; recomputed at eval/test time from the live weights. */
  score: number;
}

/** Result of `evaluatePrescreen` — the D-16 acceptance metric. */
export interface PrescreenEvalResult {
  total: number;
  highTotal: number;
  cutoffIndex: number;
  highRetained: number;
  retention: number;
}

/**
 * Offline retention metric: sort `rows` by `score` descending (tie-break
 * `publishedAt` descending), take the top `topFraction` of the window, and
 * report how many of the high-materiality rows (`maxMateriality >= 0.5`)
 * fall inside that cut. `retention = highRetained / highTotal`; when there
 * are no high-materiality rows in the window, `retention` is defined as 1
 * (nothing to lose).
 *
 * Kept separate from `predictMateriality` so the metric can be recomputed
 * over any labelled corpus without re-deriving scores.
 */
export function evaluatePrescreen(
  rows: PrescreenLabelledArticle[],
  topFraction: number,
): PrescreenEvalResult {
  const sorted = [...rows].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  const total = sorted.length;
  const highTotal = sorted.filter((r) => r.maxMateriality >= 0.5).length;
  const cutoffIndex = Math.ceil(total * topFraction);
  const highRetained = sorted.slice(0, cutoffIndex).filter((r) => r.maxMateriality >= 0.5).length;
  const retention = highTotal === 0 ? 1 : highRetained / highTotal;
  return { total, highTotal, cutoffIndex, highRetained, retention };
}
