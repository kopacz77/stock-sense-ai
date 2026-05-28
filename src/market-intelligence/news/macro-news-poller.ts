import Parser from "rss-parser";
import type { NewsArticle } from "./types.js";

export interface MacroFeed {
  /** Stable id used to namespace the article id. */
  id: string;
  /** Publisher label saved on each article (shown in alerts). */
  publisher: string;
  /** Logical category passed through to the LLM correlator. */
  category: string;
  url: string;
}

export const DEFAULT_MACRO_FEEDS: MacroFeed[] = [
  {
    id: "cnbc-top",
    publisher: "CNBC",
    category: "macro",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  },
  {
    id: "cnbc-markets",
    publisher: "CNBC",
    category: "markets",
    url: "https://www.cnbc.com/id/15839069/device/rss/rss.html",
  },
  {
    id: "google-business",
    publisher: "Google News",
    category: "markets",
    url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  },
  {
    id: "google-world",
    publisher: "Google News",
    category: "geopolitics",
    url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  },
  {
    id: "marketwatch-top",
    publisher: "MarketWatch",
    category: "markets",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
  },
];

export interface MacroNewsPollerOptions {
  feeds?: MacroFeed[];
  lookbackHours?: number;
  timeoutMs?: number;
}

/**
 * Polls macro/geopolitical RSS feeds. Companion to NewsPoller (which is
 * ticker-scoped via Finnhub). Together they give the LLM correlator both
 * company-specific signal and policy/geopolitical context — required for
 * trades like "Iran ceasefire breaks → long XLE" where the headline never
 * mentions a ticker.
 */
export class MacroNewsPoller {
  private parser: Parser;
  private feeds: MacroFeed[];
  private lookbackHours: number;

  constructor(options: MacroNewsPollerOptions = {}) {
    this.feeds = options.feeds ?? DEFAULT_MACRO_FEEDS;
    this.lookbackHours = options.lookbackHours ?? 12;
    this.parser = new Parser({
      timeout: options.timeoutMs ?? 10_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StockSenseBot/1.0)",
      },
    });
  }

  async fetchAll(): Promise<NewsArticle[]> {
    const results = await Promise.allSettled(
      this.feeds.map((feed) => this.fetchFeed(feed)),
    );
    const articles: NewsArticle[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") articles.push(...r.value);
    }
    return this.dedupe(articles);
  }

  private async fetchFeed(feed: MacroFeed): Promise<NewsArticle[]> {
    let parsed;
    try {
      parsed = await this.parser.parseURL(feed.url);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.warn(`[macro-news] ${feed.id} failed: ${reason}`);
      return [];
    }

    const cutoff = Date.now() - this.lookbackHours * 60 * 60 * 1000;
    const out: NewsArticle[] = [];
    for (const item of parsed.items ?? []) {
      const url = item.link?.trim();
      const headline = item.title?.trim();
      if (!url || !headline) continue;

      const publishedMs = item.isoDate
        ? Date.parse(item.isoDate)
        : item.pubDate
          ? Date.parse(item.pubDate)
          : NaN;
      if (Number.isFinite(publishedMs) && publishedMs < cutoff) continue;

      out.push({
        id: `rss:${feed.id}:${stableId(item.guid ?? url)}`,
        source: "rss",
        publisher: feed.publisher,
        tickers: [],
        headline,
        summary: item.contentSnippet?.trim(),
        url,
        publishedAt: Number.isFinite(publishedMs)
          ? new Date(publishedMs).toISOString()
          : new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        category: feed.category,
      });
    }
    return out;
  }

  /**
   * Dedupe across feeds. Google News + CNBC frequently republish the same
   * underlying story; we key on a normalized URL so the LLM doesn't see
   * the same headline five times.
   */
  private dedupe(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Map<string, NewsArticle>();
    for (const a of articles) {
      const key = normalizeUrl(a.url);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, a);
      } else if (Date.parse(a.publishedAt) > Date.parse(existing.publishedAt)) {
        seen.set(key, a);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
  }
}

function stableId(input: string): string {
  // Lightweight non-crypto hash. Sufficient for in-process dedup keys.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Strip tracking params that vary across syndications.
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src$)/i.test(p)) {
        u.searchParams.delete(p);
      }
    }
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}
