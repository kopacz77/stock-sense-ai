import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
import type {
  ConfirmedAlert,
  DivergenceAlert,
  IntelligenceAlert,
} from "../alerts/types.js";

export interface CorrelatorOptions {
  /** Minimum 1h Polymarket move (in pp) to consider a market "moved". Default 3. */
  minMovePp?: number;
  /** Minimum keyword overlap for headline ↔ market match (number of tokens). Default 2. */
  minKeywordOverlap?: number;
  /** Maximum article age (minutes) when correlating against a market move. Default 60. */
  articleAgeMinutes?: number;
  /** Minimum 24h volume for a market to be worth alerting on. Default 5000. */
  minMarketVolume24hr?: number;
}

/**
 * Rule-based correlator (v1).
 *
 * Inputs:
 *  - recent Polymarket snapshots
 *  - recent news articles
 *
 * Output:
 *  - HEADLINE_PM_CONFIRMED for markets that moved AND have a topically-aligned article
 *  - HEADLINE_PM_DIVERGENCE for markets that moved with no related article found
 *
 * This is intentionally dumb. The LLM layer (M2-04) replaces keyword matching
 * with semantic mapping and richer rationale.
 */
export class HeadlinePmCorrelator {
  private readonly minMovePp: number;
  private readonly minKeywordOverlap: number;
  private readonly articleAgeMs: number;
  private readonly minMarketVolume24hr: number;

  constructor(options: CorrelatorOptions = {}) {
    this.minMovePp = options.minMovePp ?? 3;
    this.minKeywordOverlap = options.minKeywordOverlap ?? 2;
    this.articleAgeMs = (options.articleAgeMinutes ?? 60) * 60 * 1000;
    this.minMarketVolume24hr = options.minMarketVolume24hr ?? 5000;
  }

  correlate(markets: MarketSnapshot[], articles: NewsArticle[]): IntelligenceAlert[] {
    const now = Date.now();
    const recentArticles = articles.filter(
      (a) => now - Date.parse(a.publishedAt) <= this.articleAgeMs,
    );

    const interestingMarkets = markets.filter(
      (m) =>
        Math.abs(m.oneHourPriceChange ?? 0) * 100 >= this.minMovePp &&
        m.volume24hr >= this.minMarketVolume24hr,
    );

    const alerts: IntelligenceAlert[] = [];

    for (const market of interestingMarkets) {
      const marketKeywords = this.tokenize(market.question);
      const matches = recentArticles
        .map((article) => ({
          article,
          overlap: this.overlapScore(marketKeywords, this.tokenize(article.headline)),
        }))
        .filter((m) => m.overlap >= this.minKeywordOverlap)
        .sort((a, b) => b.overlap - a.overlap);

      const pmMovePp = (market.oneHourPriceChange ?? 0) * 100;

      if (matches.length > 0) {
        const best = matches[0];
        if (!best) continue;
        const confirmed: ConfirmedAlert = {
          kind: "HEADLINE_PM_CONFIRMED",
          article: best.article,
          market,
          pmMovePp,
          rationale: this.buildConfirmedRationale(market, best.article, pmMovePp),
          createdAt: new Date().toISOString(),
        };
        alerts.push(confirmed);
      } else {
        const divergence: DivergenceAlert = {
          kind: "HEADLINE_PM_DIVERGENCE",
          market,
          pmMovePp,
          windowDescription: `${this.articleAgeMs / 60_000} min`,
          rationale: this.buildDivergenceRationale(market, pmMovePp),
          createdAt: new Date().toISOString(),
        };
        alerts.push(divergence);
      }
    }

    return alerts;
  }

  private buildConfirmedRationale(
    market: MarketSnapshot,
    article: NewsArticle,
    pmMovePp: number,
  ): string {
    const direction = pmMovePp >= 0 ? "up" : "down";
    return (
      `Market moved ${direction} ${Math.abs(pmMovePp).toFixed(1)} pp in the last hour ` +
      `while "${this.truncate(article.headline, 80)}" published ` +
      `${this.minutesAgo(article.publishedAt)} min ago covers a related topic. ` +
      `Worth confirming whether the headline is the cause or coincidence.`
    );
  }

  private buildDivergenceRationale(market: MarketSnapshot, pmMovePp: number): string {
    const direction = pmMovePp >= 0 ? "up" : "down";
    return (
      `Polymarket moved ${direction} ${Math.abs(pmMovePp).toFixed(1)} pp in the last hour ` +
      `with no matching headline in our news feed. ` +
      `Potential smart-money positioning ahead of public news — dig deeper.`
    );
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
    );
  }

  private overlapScore(a: Set<string>, b: Set<string>): number {
    let count = 0;
    for (const t of a) if (b.has(t)) count++;
    return count;
  }

  private truncate(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  }

  private minutesAgo(iso: string): number {
    return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  }
}

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "before",
  "below",
  "between",
  "could",
  "during",
  "early",
  "first",
  "from",
  "have",
  "into",
  "more",
  "most",
  "other",
  "over",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "they",
  "this",
  "those",
  "through",
  "under",
  "until",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
  "year",
  "years",
  "today",
  "stock",
  "stocks",
  "market",
  "markets",
  "shares",
  "trading",
]);
