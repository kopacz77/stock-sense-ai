/**
 * M2-04 LLM Trade-Signal Layer — shared types.
 *
 * These types define the contract between the per-article scorer, the
 * calendar fetchers, the PM mapping engine, the rollup builder, and the
 * digest builder. M2-05 reads the rollup type as its primary query surface.
 *
 * Single-writer JsonlStore note: all signal streams are written by the
 * scheduler process today. If a second writer is ever introduced, the
 * append-only assumption needs revisiting (see RESEARCH pitfall #7).
 */

import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";

/**
 * Catalyst type union — shared across emerging (LLM-extracted) and
 * scheduled (calendar-seeded) catalyst flags.
 */
export type CatalystType =
  | "earnings"
  | "guidance"
  | "ma"
  | "regulatory"
  | "fda"
  | "fda_pdufa"
  | "macro_print"
  | "fomc"
  | "cpi"
  | "nfp"
  | "pce"
  | "retail_sales"
  | "jolts"
  | "gdp"
  | "ism"
  | "geopolitical"
  | "lawsuit"
  | "product"
  | "opec"
  | "eia_petroleum"
  | "treasury_auction"
  | "other";

export type CatalystDirection = "up" | "down" | "uncertain" | "binary";

/**
 * Output of the per-article scorer, one record per (article × ticker)
 * fan-out. When the article has no ticker_scope, the scorer may emit a
 * single themed row with ticker="" and one or more theme entries.
 *
 * Persisted to `data/intel/scored-articles-YYYY-MM-DD.jsonl`.
 */
export interface ScoredArticle {
  /** Stable composite id: `${articleId}::${ticker || "__theme__"}` for dedup. */
  id: string;
  sourceArticleId: string;
  ticker: string;                                 // "" for ticker-less themed rows
  sentiment: number;                              // [-1.0, +1.0] — bearish/bullish
  materiality: number;                            // [0.0, 1.0]
  themes: string[];                               // canonicalized lowercase-kebab-case
  catalysts: ExtractedCatalyst[];
  /** Calendar event ids the scoring refined (subset of upcoming-events context). */
  referencedCalendarEvents: string[];
  /** Tickers the LLM proposed for an article with no ticker_scope. May be empty. */
  proposedAffectedTickers?: string[];
  /** PM mapping proposals when scoring saw a PM market context (see PmMappingProposal). */
  proposedPmMappings?: PmMappingProposal[];
  scoredAt: string;                               // ISO 8601
  scorerModel: string;                            // e.g. "qwen/qwen3-14b"
  scorerVersion: string;                          // bump when prompt changes
}

/**
 * Catalyst extracted from an article by the per-article scorer.
 * Refines or creates entries in the CatalystFlag stream.
 */
export interface ExtractedCatalyst {
  type: CatalystType;
  expectedDate: string | null;                    // ISO YYYY-MM-DD or null when unknown
  magnitude: 1 | 2 | 3 | 4 | 5;
  direction: CatalystDirection;
  confidence: number;                             // [0,1]
}

/**
 * Unified catalyst flag — same shape for scheduled (calendar-derived)
 * and emerging (article-derived) catalysts. Persisted to
 * `data/intel/catalyst-flags-YYYY-MM-DD.jsonl`. M2-05 queries this.
 */
export interface CatalystFlag {
  /** Stable id for dedup across refreshes. e.g. "fomc-2026-06-18", "earnings-NVDA-2026-08-21", "article-{articleId}-fomc". */
  id: string;
  type: CatalystType;
  /** Single-ticker catalysts use one entry. Macro events use empty array + affectedSectors. */
  tickers: string[];
  /** Sectors/ETFs affected by broad macro events (e.g. ["XLE","USO"] for OPEC). */
  affectedSectors?: string[];
  expectedDate: string;                           // ISO YYYY-MM-DD or full ISO when time matters
  expectedTimeEt?: string;                        // "08:30", "10:30", "14:00" — null when unknown
  magnitudePrior: 1 | 2 | 3 | 4 | 5;
  direction: CatalystDirection;
  confidence: number;                             // grows as scored news refines
  source: `calendar:${string}` | `article:${string}`;
  sourceMeta?: Record<string, unknown>;           // release_id, symbol, source_url, etc.
  firstSeenAt: string;                            // ISO
  lastRefinedAt?: string;
  archived?: boolean;                             // true once expectedDate < today
}

/**
 * Alias for CalendarEvent (kept for naming clarity in calendar fetchers).
 * A CalendarEvent is just a CatalystFlag with `source` starting with "calendar:".
 */
export type CalendarEvent = CatalystFlag;

/**
 * Per-ticker-day rollup — the query surface M2-05 reads.
 * Persisted to `data/intel/ticker-day-summary-YYYY-MM-DD.jsonl`.
 * Idempotent: RollupBuilder rewrites today's file on each cycle.
 */
export interface TickerDaySummary {
  /** ISO YYYY-MM-DD (ET trading day). */
  date: string;
  ticker: string;
  /** Materiality-weighted mean sentiment over the day's scored articles. */
  weightedSentiment: number;                      // [-1,+1]
  /** Sum of materiality across the day's scored articles for this ticker. */
  totalMateriality: number;
  /** Article count contributing to this rollup. */
  articleCount: number;
  /** Union of themes from contributing articles (canonicalized). */
  themes: string[];
  /** Active catalysts for this ticker (CatalystFlag ids — not archived, expectedDate >= today). */
  activeCatalystIds: string[];
  /** PM-derived contributions for this ticker (signed pp aggregated by direction × weight). */
  pmContribution: {
    /** Net signed score: sum over matched markets of (movePp × directionSign × weight). */
    netScore: number;
    /** Constituent markets that contributed. */
    sources: Array<{
      marketId: string;
      eventSlug?: string;
      slug: string;
      movePp: number;
      direction: "long" | "short";
      weight: number;
      contributedScore: number;                   // movePp × signOf(direction) × weight
      volume24hr: number;
    }>;
  };
  /** Most recent scored article id contributing to this rollup (for traceability). */
  lastScoredArticleId?: string;
  builtAt: string;                                // ISO
}

/**
 * Theme candidate proposed by the LLM, awaiting weekly operator review.
 * Persisted to `data/intel/themes-proposed-YYYY-MM-DD.jsonl`, one row per
 * (theme × article × ticker).
 */
export interface ThemeCandidate {
  /** Canonical form (lowercase-kebab-case) of what the LLM emitted. */
  theme: string;
  /** Raw string before canonicalization (for drift analysis). */
  rawTheme: string;
  sourceArticleId: string;
  ticker: string;
  proposedAt: string;                             // ISO
}

/**
 * PM-to-ticker mapping entry. Loaded from `config/pm-market-mappings.json`.
 */
export interface PmMapping {
  match: {
    eventSlug: string | null;
    /**
     * Case-insensitive prefix on `eventSlug`. Polymarket appends volatile
     * suffixes to event slugs within a family (e.g. `iran-full-airspace-closure-byptptpt-20260625195253028`),
     * so exact `eventSlug` equality misses the whole family. Combine with
     * `questionContains` to split opposite-meaning markets that share a stem
     * (e.g. Fed "decrease" vs "increase").
     */
    eventSlugPrefix?: string | null;
    slugPrefix: string | null;
    questionContains: string | null;
  };
  tickers: Array<{
    ticker: string;
    direction: "long" | "short";
    weight: number;
  }>;
  /** "yesPp" = pass yes-price change through; "noPp" = invert (signal lives in the "No" outcome). */
  interpretation: "yesPp" | "noPp";
  rationale?: string;
  addedBy?: string;
  addedAt?: string;
}

/**
 * PM mapping proposal — LLM-proposed ticker affiliations for a market that
 * didn't match any mapping in the table. Persisted to
 * `data/intel/pm-mappings-proposed-YYYY-MM-DD.jsonl`.
 */
export interface PmMappingProposal {
  marketId: string;
  slug: string;
  eventSlug?: string;
  question: string;
  proposedTickers: Array<{
    ticker: string;
    direction: "long" | "short";
    confidence: number;                           // [0,1]
  }>;
  interpretationSuggestion: "yesPp" | "noPp";
  proposedAt: string;                             // ISO
  sourceArticleId?: string;
}

/**
 * Top-of-window digest payload — DigestBuilder produces, TelegramService renders.
 */
export interface DigestPayload {
  flavor: "MORNING" | "MIDDAY" | "CLOSE";
  builtAt: string;                                // ISO
  topStories: Array<{
    articleId: string;
    headline: string;
    publisher: string;
    tickers: string[];
    sentiment: number;
    materiality: number;
    rationale: string;
    url: string;
  }>;
  upcomingCalendar: Array<{
    eventId: string;
    type: CatalystType;
    label: string;                                // human-readable headline
    expectedDate: string;
    expectedTimeEt?: string;
    magnitudePrior: number;
    affectedTickers: string[];
  }>;
  pmMovers?: Array<{                              // MIDDAY/CLOSE only
    marketId: string;
    question: string;
    movePp: number;
    volume24hr: number;
  }>;
  /**
   * Scorer health — always present so the digest doubles as a heartbeat for
   * the LLM layer (the scheduler keeps sending digests when LM Studio is down).
   */
  scorerHealth?: ScorerHealth;
}

export interface ScorerHealth {
  /** Entries in score-backlog.jsonl. */
  backlogSize: number;
  /** Age in hours of the oldest backlog entry, or null when empty. */
  oldestBacklogAgeHours: number | null;
  /** scoredAt of the most recent ScoredArticle on disk, or null if none. */
  lastScoredAt: string | null;
  /** True when the backlog is empty or scoring has succeeded within the last 24h. */
  healthy: boolean;
}

/**
 * Score backlog entry — one record per (article × tickerScope-as-stringified)
 * that failed to score because the LLM was unreachable.
 * Persisted to `data/intel/score-backlog.jsonl` (single rolling file, not date-rotated).
 */
export interface ScoreBacklogEntry {
  enqueuedAt: string;                             // ISO
  attempts: number;
  lastErrorMessage?: string;
  /** Full snapshot of the article so we don't depend on the news stream surviving. */
  article: NewsArticle;
  /** Snapshot of the PM context the article was paired with at score-time. May be empty. */
  pmContext: MarketSnapshot[];
}
