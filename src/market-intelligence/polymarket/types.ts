/**
 * Polymarket Gamma API types.
 *
 * Source: https://docs.polymarket.com (Gamma is the markets metadata API,
 * CLOB is the orderbook API). Gamma is free + unauthenticated for reads.
 */

export interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  description?: string;
  endDate?: string;
  endDateIso?: string;
  startDate?: string;
  active: boolean;
  closed: boolean;
  archived?: boolean;

  /** JSON-string array like '["Yes", "No"]' as returned by the API. */
  outcomes: string;
  /** JSON-string array like '["0.535", "0.465"]' aligned with outcomes. */
  outcomePrices: string;

  volume?: string;
  volumeNum?: number;
  volume24hr?: number;
  volume1wk?: number;
  liquidity?: string;
  liquidityNum?: number;

  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  spread?: number;

  oneHourPriceChange?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;

  /** Polymarket "competitive" score [0,1]; higher = more two-sided activity. */
  competitive?: number;

  events?: PolymarketEvent[];
}

export interface PolymarketEvent {
  id: string;
  ticker?: string;
  slug: string;
  title: string;
  description?: string;
  endDate?: string;
  active: boolean;
  closed: boolean;
  volume?: number;
  liquidity?: number;
  competitive?: number;
  eventMetadata?: {
    context_description?: string;
    context_updated_at?: string;
  };
}

/**
 * Normalized market snapshot — the shape we store and reason about.
 * Drops raw JSON-string fields in favor of parsed primitives.
 */
export interface MarketSnapshot {
  id: string;
  slug: string;
  question: string;
  endDate?: string;
  active: boolean;
  outcomes: string[];
  prices: number[];
  /** Convenience: yesPrice when outcomes are ["Yes", "No"], else first outcome price. */
  yesPrice: number;
  volume24hr: number;
  volume1wk: number;
  liquidity: number;
  oneHourPriceChange: number;
  oneDayPriceChange: number;
  oneWeekPriceChange: number;
  competitive: number;
  eventSlug?: string;
  eventTitle?: string;
  eventContext?: string;
  fetchedAt: string;
}

export interface PolymarketQueryOptions {
  active?: boolean;
  closed?: boolean;
  limit?: number;
  offset?: number;
  /** Minimum 24h volume to filter noise. */
  minVolume24hr?: number;
  /** Optional substring filter on market question (case-insensitive). */
  questionContains?: string;
}
