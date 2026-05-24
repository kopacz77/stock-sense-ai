/**
 * News types — normalized across providers.
 *
 * Source provider field (e.g. `finnhub`, `polygon`) is preserved so we can
 * deduplicate across providers and audit where alerts came from.
 */

export interface NewsArticle {
  /** Stable id within the source provider. */
  id: string;
  /** Source provider (e.g. "finnhub", "polygon", "newsapi"). */
  source: string;
  /** Original publisher (e.g. "Reuters", "Bloomberg"). */
  publisher?: string;
  /** Tickers this article is tagged against. May be empty for macro stories. */
  tickers: string[];
  headline: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  /** ISO 8601 timestamp when our system ingested the article. */
  fetchedAt: string;
  category?: string;
}

export interface FinnhubCompanyNewsRaw {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}
