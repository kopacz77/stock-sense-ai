import type { MarketSnapshot } from "./types.js";

/**
 * Curated keyword sets that mark a Polymarket market as trade-relevant.
 *
 * Why curated lists rather than ML categorization: deterministic, debuggable,
 * cheap, and easy for the operator to extend when a new theme emerges (e.g.
 * a new geopolitical flashpoint). The LLM correlator (M2-04) provides the
 * semantic depth; this is just universe narrowing.
 */
export const RELEVANT_TOPIC_KEYWORDS: Record<string, string[]> = {
  macro: [
    "fed",
    "federal reserve",
    "powell",
    "rate cut",
    "rate hike",
    "interest rate",
    "inflation",
    "cpi",
    "ppi",
    "jobs report",
    "unemployment",
    "nonfarm",
    "recession",
    "gdp",
    "yield curve",
  ],
  policy: [
    "trump",
    "biden",
    "harris",
    "tariff",
    "sanction",
    "trade war",
    "regulation",
    "tax bill",
    "tax cut",
    "shutdown",
    "debt ceiling",
    "congress",
    "executive order",
  ],
  geopolitics: [
    "china",
    "russia",
    "putin",
    "xi jinping",
    "iran",
    "israel",
    "gaza",
    "ukraine",
    "taiwan",
    "north korea",
    "ceasefire",
    "war",
    "invasion",
  ],
  crypto: [
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "crypto",
    "stablecoin",
    "etf approval",
  ],
  markets: [
    "s&p 500",
    "sp500",
    "nasdaq",
    "dow jones",
    "stock market",
    "bull market",
    "bear market",
    "all-time high",
    "all time high",
    "vix",
    "circuit breaker",
  ],
  ai: [
    "openai",
    "anthropic",
    "claude",
    "chatgpt",
    "agi",
    "ai bubble",
    "ai stock",
    "nvidia",
    "deepseek",
    "gemini",
    "llama",
  ],
  elections: [
    "election",
    "primary",
    "midterm",
    "senate",
    "house race",
    "governor race",
    "presidential",
  ],
};

export const DEFAULT_TOPICS = Object.keys(RELEVANT_TOPIC_KEYWORDS);

/**
 * Exclusion keywords: markets whose question OR event title contains any of
 * these are filtered out even if a topic keyword matches. Catches sports
 * and entertainment markets that incidentally mention "iran" (FIFA), "fed"
 * (a team called Federation), "rate" (Oscar rate), etc.
 */
export const EXCLUSION_KEYWORDS: string[] = [
  // Sports
  "fifa",
  "world cup",
  "nba",
  "nfl",
  "nhl",
  "mlb",
  "super bowl",
  "uefa",
  "champions league",
  "olympics",
  "olympic",
  "soccer",
  "basketball",
  "football",
  "baseball",
  "hockey",
  "tennis",
  "golf",
  "boxing",
  "ufc",
  "f1",
  "formula 1",
  "ipl",
  "cricket",
  "marathon",
  // Entertainment
  "oscars",
  "grammy",
  "emmy",
  "album",
  "song",
  "movie",
  "tv show",
  "celebrity",
  "billboard",
];

export interface RelevanceFilterOptions {
  /** Which topic groups to include. Default: all. */
  topics?: string[];
  /** Additional ad-hoc keywords on top of the topic groups. */
  extraKeywords?: string[];
  /**
   * If true, also search event title + event context (not just the market question).
   * Default false because Polymarket event contexts are long narrative
   * descriptions that produce too many false positives.
   */
  searchEventContext?: boolean;
}

function buildKeywordRegex(keywords: string[]): RegExp {
  // Word-boundary match. Escape regex specials in each keyword, allow internal
  // whitespace as flexible whitespace, and require word boundaries on outer ends.
  const parts = keywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  // Word boundaries via lookarounds so phrases with non-word chars (e.g. "s&p 500") still work.
  return new RegExp(`(?:^|[^a-z0-9])(?:${parts.join("|")})(?:$|[^a-z0-9])`, "i");
}

/** Returns markets whose question (and optionally event context) matches at least one keyword. */
export function filterRelevantMarkets(
  markets: MarketSnapshot[],
  options: RelevanceFilterOptions = {},
): MarketSnapshot[] {
  const topics = options.topics?.length ? options.topics : DEFAULT_TOPICS;
  const searchContext = options.searchEventContext ?? false;

  const keywords: string[] = [];
  for (const topic of topics) {
    const list = RELEVANT_TOPIC_KEYWORDS[topic];
    if (list) keywords.push(...list);
  }
  if (options.extraKeywords) keywords.push(...options.extraKeywords);

  if (keywords.length === 0) return [];

  const regex = buildKeywordRegex(keywords);
  const exclusionRegex = buildKeywordRegex(EXCLUSION_KEYWORDS);

  return markets.filter((m) => {
    // Drop sports/entertainment markets even if they incidentally match a topic keyword.
    if (exclusionRegex.test(m.question)) return false;
    if (m.eventTitle && exclusionRegex.test(m.eventTitle)) return false;

    if (regex.test(m.question)) return true;
    if (!searchContext) return false;
    if (m.eventTitle && regex.test(m.eventTitle)) return true;
    if (m.eventContext && regex.test(m.eventContext)) return true;
    return false;
  });
}

/** Reverse lookup: given a market, which topic(s) it matched. Useful for alert metadata. */
export function topicsForMarket(market: MarketSnapshot): string[] {
  const matched: string[] = [];
  for (const [topic, keywords] of Object.entries(RELEVANT_TOPIC_KEYWORDS)) {
    const regex = buildKeywordRegex(keywords);
    if (regex.test(market.question)) {
      matched.push(topic);
    }
  }
  return matched;
}
