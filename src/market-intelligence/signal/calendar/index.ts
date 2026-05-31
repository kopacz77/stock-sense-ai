/**
 * Calendar layer barrel + orchestrator — M2-04 Plan 10-03
 *
 * `CalendarRefresher.refreshAll(days)` composes all 5 fetchers via
 * Promise.allSettled, dedups by event id, and appends the unified
 * CalendarEvent[] to `data/intel/catalyst-flags-YYYY-MM-DD.jsonl`.
 *
 * Best-effort failure model: a single source failing (FRED key missing,
 * Treasury API hiccup, etc.) contributes 0 events but does NOT clear
 * other sources' contributions. Run daily from the cycle-runner.
 */

import { JsonlStore } from "../../storage/jsonl-store.js";
import type { CalendarEvent } from "../types.js";
import { EiaCalendarGenerator } from "./eia-cron-generator.js";
import { FinnhubEarningsCalendarFetcher } from "./finnhub-earnings-fetcher.js";
import { FredCalendarFetcher } from "./fred-fetcher.js";
import { SeedFileCalendarLoader } from "./seed-file-loader.js";
import { TreasuryAuctionCalendarFetcher } from "./treasury-auction-fetcher.js";

export { EIA_HOLIDAY_SHIFTS, EiaCalendarGenerator } from "./eia-cron-generator.js";
export { FinnhubEarningsCalendarFetcher } from "./finnhub-earnings-fetcher.js";
export { FRED_RELEASE_IDS, FredCalendarFetcher } from "./fred-fetcher.js";
export { SeedFileCalendarLoader } from "./seed-file-loader.js";
export { TreasuryAuctionCalendarFetcher } from "./treasury-auction-fetcher.js";

export interface CalendarRefresherOptions {
  fredApiKey?: string;
  finnhubApiKey: string;
  /** Earnings filter universe — typically watchlist ∪ macro-tickers from the call site. */
  tickerUniverse: string[];
  /** Where to persist the unified catalyst-flags JSONL stream. Default: "./data/intel". */
  dataDir?: string;
  /** Where to read FDA/OPEC seed JSONs from. Default: "./config". */
  configDir?: string;
}

export interface CalendarRefreshResult {
  totalEvents: number;
  bySource: Record<string, number>;
  /** Names of sources that errored (e.g. "fred", "treasury") — these contributed 0 events. */
  failed: string[];
  durationMs: number;
}

/**
 * Orchestrates all 5 calendar fetchers, dedups by event.id, and writes the
 * unified result to `data/intel/catalyst-flags-YYYY-MM-DD.jsonl`.
 *
 * Append-only semantics: the same `eia-petroleum-2026-06-03` will appear
 * N times across N daily refreshes. The rollup builder + digest builder
 * are responsible for deduping by `id` at read time (taking the latest
 * `lastRefinedAt` / `firstSeenAt`).
 */
export class CalendarRefresher {
  private readonly store: JsonlStore<CalendarEvent>;
  private readonly options: CalendarRefresherOptions;

  constructor(options: CalendarRefresherOptions) {
    this.options = options;
    this.store = new JsonlStore<CalendarEvent>(options.dataDir ?? "./data/intel", "catalyst-flags");
  }

  async refreshAll(days = 60): Promise<CalendarRefreshResult> {
    const start = Date.now();
    const failed: string[] = [];
    const collected: CalendarEvent[] = [];

    const sources: Array<{ name: string; run: () => Promise<CalendarEvent[]> }> = [
      {
        name: "fred",
        run: () => new FredCalendarFetcher(this.options.fredApiKey).fetchUpcoming(days),
      },
      {
        name: "finnhub-earnings",
        run: () =>
          new FinnhubEarningsCalendarFetcher(
            this.options.finnhubApiKey,
            this.options.tickerUniverse
          ).fetchUpcoming(days),
      },
      {
        name: "treasury",
        run: () => new TreasuryAuctionCalendarFetcher().fetchUpcoming(days),
      },
      {
        name: "eia",
        run: async () => new EiaCalendarGenerator().generate(days),
      },
      {
        name: "seeds",
        run: () => new SeedFileCalendarLoader({ configDir: this.options.configDir }).loadAll(),
      },
    ];

    const settled = await Promise.allSettled(sources.map((s) => s.run()));
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      const name = sources[i]?.name ?? `source_${i}`;
      if (!s) continue;
      if (s.status === "fulfilled") {
        collected.push(...s.value);
      } else {
        failed.push(name);
        const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
        console.warn(`[CalendarRefresher] ${name} failed: ${reason}`);
      }
    }

    // Dedup by id — later occurrences override earlier (in practice ids are unique across sources).
    const byId = new Map<string, CalendarEvent>();
    for (const e of collected) byId.set(e.id, e);
    const unique = Array.from(byId.values());

    if (unique.length > 0) {
      await this.store.appendMany(unique);
    }

    const bySource: Record<string, number> = {};
    for (const e of unique) {
      const src = e.source.replace(/^calendar:/, "");
      bySource[src] = (bySource[src] ?? 0) + 1;
    }

    return {
      totalEvents: unique.length,
      bySource,
      failed,
      durationMs: Date.now() - start,
    };
  }
}
