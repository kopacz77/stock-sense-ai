/**
 * VIX regime provider — the only place `src/strategy/*` reads volatility
 * regime. Cached per calendar day (`data/strategy/vix-cache.json`) so
 * `strategy run` doesn't re-fetch Yahoo on every invocation for the same
 * `asOfDate`.
 *
 * Calls `YahooFinanceProvider.fetchHistoricalDataRange("^VIX", from, to)`
 * directly — no new provider, no new credential (RESEARCH §2). Never
 * defaults to `"calm"` on failure (RESEARCH Pitfall 2): a down VIX feed
 * must never silently oversize a position.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { YahooFinanceProvider } from "../data/providers/yahoo-finance-provider.js";
import type { VixRegime } from "./types.js";

export interface VixQuote {
  date: string; // ISO YYYY-MM-DD — the asOfDate this quote was resolved for
  close: number;
  regime: VixRegime;
  source: "live" | "cache" | "fallback";
  fetchedAt: string; // ISO 8601
}

/**
 * Classify a VIX close into a regime. Both bounds are exclusive on the
 * "calm"/"stressed" side — a close exactly AT `calmBelow` or `stressedAbove`
 * lands in `"elevated"` (so the default 15/25 thresholds both count as
 * elevated, not a boundary flip-flop).
 */
export function classifyRegime(
  vixClose: number,
  thresholds: { calmBelow: number; stressedAbove: number },
): VixRegime {
  if (vixClose < thresholds.calmBelow) return "calm";
  if (vixClose > thresholds.stressedAbove) return "stressed";
  return "elevated";
}

export interface VixProviderOptions {
  strategyDataDir?: string;
  thresholds?: { calmBelow: number; stressedAbove: number };
  provider?: YahooFinanceProvider;
}

const DEFAULT_THRESHOLDS = { calmBelow: 15, stressedAbove: 25 };
/** Conservative fallback close used only when there is no cache to fall back to either. */
const FALLBACK_VIX_CLOSE = 20;

export class VixProvider {
  private readonly strategyDataDir: string;
  private readonly thresholds: { calmBelow: number; stressedAbove: number };
  private readonly provider: YahooFinanceProvider;

  constructor(options: VixProviderOptions = {}) {
    this.strategyDataDir = options.strategyDataDir ?? "./data/strategy";
    this.thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
    this.provider = options.provider ?? new YahooFinanceProvider();
  }

  /**
   * Resolve the VIX quote for `asOfDate`. Cache-first; on a cache miss,
   * fetches a 7-day trailing window and takes the newest bar whose date is
   * `<= asOfDate`. On any fetch failure, falls back to the last-known
   * cached close (or `FALLBACK_VIX_CLOSE`) classified as `"elevated"` —
   * NEVER `"calm"` — and logs one `console.warn` naming the failure.
   */
  async getForDate(asOfDate: Date): Promise<VixQuote> {
    const dateKey = asOfDate.toISOString().split("T")[0] ?? "";
    const cache = await this.readCache();

    const cached = cache[dateKey];
    if (cached) {
      return { ...cached, source: "cache" };
    }

    try {
      const from = new Date(asOfDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const bars = await this.provider.fetchHistoricalDataRange("^VIX", from, asOfDate);

      // Yahoo's parseChartResponse returns bars NEWEST-first (documented at
      // yahoo-finance-provider.ts:88). Sort ascending explicitly so "take
      // the newest bar <= asOfDate" below reads left-to-right correctly —
      // same doc-comment discipline as strategy-adapter.ts's bar-order note.
      const ascending = [...bars].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const usable = ascending.filter((b) => Date.parse(b.date) <= asOfDate.getTime());
      const latest = usable[usable.length - 1];

      if (!latest || !Number.isFinite(latest.close) || latest.close <= 0) {
        throw new Error(`no usable ^VIX bar for ${dateKey}`);
      }

      const quote: VixQuote = {
        date: dateKey,
        close: latest.close,
        regime: classifyRegime(latest.close, this.thresholds),
        source: "live",
        fetchedAt: new Date().toISOString(),
      };

      cache[dateKey] = quote;
      await this.writeCache(cache);

      return quote;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[strategy/vix-provider] ^VIX fetch failed for ${dateKey}: ${message}`);

      const lastKnown = this.lastKnownClose(cache);
      const fallbackClose = lastKnown ?? FALLBACK_VIX_CLOSE;

      return {
        date: dateKey,
        close: fallbackClose,
        regime: "elevated",
        source: "fallback",
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  private lastKnownClose(cache: Record<string, VixQuote>): number | null {
    const dates = Object.keys(cache).sort();
    const lastDate = dates[dates.length - 1];
    return lastDate ? (cache[lastDate]?.close ?? null) : null;
  }

  private cacheFile(): string {
    return path.join(this.strategyDataDir, "vix-cache.json");
  }

  private async readCache(): Promise<Record<string, VixQuote>> {
    try {
      const raw = await fs.readFile(this.cacheFile(), "utf8");
      return JSON.parse(raw) as Record<string, VixQuote>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  /** Atomic temp-rename write, same pattern as `RollupBuilder.writeSummary`. */
  private async writeCache(cache: Record<string, VixQuote>): Promise<void> {
    await fs.mkdir(this.strategyDataDir, { recursive: true });
    const filePath = this.cacheFile();
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
    await fs.rename(tmp, filePath);
  }
}
