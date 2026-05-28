import axios, { type AxiosInstance } from "axios";
import type {
  MarketSnapshot,
  PolymarketMarket,
  PolymarketQueryOptions,
} from "./types.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

export class PolymarketClient {
  private http: AxiosInstance;

  constructor(baseUrl: string = GAMMA_BASE_URL) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
  }

  /**
   * Fetch active markets, normalized to MarketSnapshot.
   * Defaults: active=true, closed=false, limit=100, ordered by 24h volume desc server-side.
   * The server-side order is critical: without it Gamma returns a long-tail
   * default order (meme markets, sports finals) and the actual high-volume
   * macro/geopolitical markets never enter our universe.
   */
  async fetchActiveMarkets(options: PolymarketQueryOptions = {}): Promise<MarketSnapshot[]> {
    const params: Record<string, string | number | boolean> = {
      active: options.active ?? true,
      closed: options.closed ?? false,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      order: "volume24hr",
      ascending: false,
    };

    const { data } = await this.http.get<PolymarketMarket[]>("/markets", { params });

    const normalized = data
      .map((m) => this.normalize(m))
      .filter((m): m is MarketSnapshot => m !== null);

    const minVolume = options.minVolume24hr ?? 0;
    const needle = options.questionContains?.toLowerCase();

    return normalized
      .filter((m) => m.volume24hr >= minVolume)
      .filter((m) => (needle ? m.question.toLowerCase().includes(needle) : true))
      .sort((a, b) => b.volume24hr - a.volume24hr);
  }

  /** Fetch a single market by slug. Returns null if not found. */
  async fetchMarketBySlug(slug: string): Promise<MarketSnapshot | null> {
    const { data } = await this.http.get<PolymarketMarket[]>("/markets", {
      params: { slug },
    });
    if (!data || data.length === 0) return null;
    const first = data[0];
    if (!first) return null;
    return this.normalize(first);
  }

  /**
   * Normalize a raw Polymarket market into our internal snapshot shape.
   * Returns null if the market lacks required fields to be useful.
   */
  private normalize(raw: PolymarketMarket): MarketSnapshot | null {
    const outcomes = this.safeParseJsonArray(raw.outcomes);
    const priceStrings = this.safeParseJsonArray(raw.outcomePrices);
    if (outcomes.length === 0 || priceStrings.length !== outcomes.length) return null;

    const prices = priceStrings.map((p) => Number(p)).filter((p) => Number.isFinite(p));
    if (prices.length !== outcomes.length) return null;

    const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    const yesPrice = yesIdx >= 0 ? (prices[yesIdx] ?? prices[0] ?? 0) : (prices[0] ?? 0);

    const event = raw.events?.[0];

    return {
      id: raw.id,
      slug: raw.slug,
      question: raw.question,
      endDate: raw.endDateIso ?? raw.endDate,
      active: raw.active,
      outcomes,
      prices,
      yesPrice,
      volume24hr: raw.volume24hr ?? 0,
      volume1wk: raw.volume1wk ?? 0,
      liquidity: raw.liquidityNum ?? Number(raw.liquidity ?? 0),
      oneHourPriceChange: raw.oneHourPriceChange ?? 0,
      oneDayPriceChange: raw.oneDayPriceChange ?? 0,
      oneWeekPriceChange: raw.oneWeekPriceChange ?? 0,
      competitive: raw.competitive ?? 0,
      eventSlug: event?.slug,
      eventTitle: event?.title,
      eventContext: event?.eventMetadata?.context_description,
      fetchedAt: new Date().toISOString(),
    };
  }

  private safeParseJsonArray(value: string | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
}
