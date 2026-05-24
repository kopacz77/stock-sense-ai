import axios, { type AxiosInstance } from "axios";
import type { FinnhubCompanyNewsRaw, NewsArticle } from "./types.js";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export interface NewsPollerOptions {
  /** Finnhub API key (required for company-news). */
  finnhubApiKey: string;
  /** How far back to look on each poll, in hours. Default 24. */
  lookbackHours?: number;
}

/**
 * Polls per-ticker headlines from Finnhub's /company-news endpoint.
 *
 * Free tier: 60 calls/min. Each ticker = 1 call. For a 10-ticker watchlist
 * polled every 15 min that's 40 calls/hour, well within budget.
 */
export class NewsPoller {
  private http: AxiosInstance;
  private apiKey: string;
  private lookbackHours: number;

  constructor(options: NewsPollerOptions) {
    this.apiKey = options.finnhubApiKey;
    this.lookbackHours = options.lookbackHours ?? 24;
    this.http = axios.create({
      baseURL: FINNHUB_BASE_URL,
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
  }

  /**
   * Fetch headlines for a single ticker. Returns articles published within
   * the lookback window, normalized to NewsArticle.
   */
  async fetchCompanyNews(ticker: string): Promise<NewsArticle[]> {
    const to = new Date();
    const from = new Date(to.getTime() - this.lookbackHours * 60 * 60 * 1000);
    const params = {
      symbol: ticker.toUpperCase(),
      from: this.formatDate(from),
      to: this.formatDate(to),
      token: this.apiKey,
    };

    const { data } = await this.http.get<FinnhubCompanyNewsRaw[]>("/company-news", { params });
    if (!Array.isArray(data)) return [];

    const cutoff = from.getTime();
    return data
      .filter((a) => a.datetime * 1000 >= cutoff)
      .map((a) => this.normalize(a, ticker));
  }

  /**
   * Fetch headlines for many tickers. Sequential to respect rate limits
   * (Finnhub free is 60/min — 10 tickers = ~10s, well-paced).
   */
  async fetchWatchlistNews(tickers: string[]): Promise<NewsArticle[]> {
    const all: NewsArticle[] = [];
    for (const ticker of tickers) {
      try {
        const articles = await this.fetchCompanyNews(ticker);
        all.push(...articles);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown";
        console.warn(`[news-poller] failed for ${ticker}: ${reason}`);
      }
    }
    return this.dedupe(all);
  }

  private normalize(raw: FinnhubCompanyNewsRaw, ticker: string): NewsArticle {
    const related = (raw.related ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const tickers = related.length > 0 ? related : [ticker.toUpperCase()];
    return {
      id: `finnhub:${raw.id}`,
      source: "finnhub",
      publisher: raw.source,
      tickers,
      headline: raw.headline,
      summary: raw.summary,
      url: raw.url,
      imageUrl: raw.image || undefined,
      publishedAt: new Date(raw.datetime * 1000).toISOString(),
      fetchedAt: new Date().toISOString(),
      category: raw.category,
    };
  }

  /** Deduplicate by article id; same headline can appear under multiple tickers. */
  private dedupe(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Map<string, NewsArticle>();
    for (const a of articles) {
      const existing = seen.get(a.id);
      if (!existing) {
        seen.set(a.id, a);
      } else {
        // Merge ticker tags
        const merged = new Set([...existing.tickers, ...a.tickers]);
        existing.tickers = Array.from(merged);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
  }

  private formatDate(d: Date): string {
    const iso = d.toISOString();
    const datePart = iso.split("T")[0];
    return datePart ?? iso;
  }
}
