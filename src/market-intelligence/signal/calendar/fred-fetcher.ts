/**
 * FRED Calendar Fetcher — M2-04 Plan 10-03
 *
 * Pulls scheduled release dates for the 8 macro prints we care about
 * (FOMC, CPI, NFP, PCE, GDP, Retail Sales, JOLTS, ISM) from the
 * St. Louis Fed FRED API and maps each to a CalendarEvent.
 *
 * Endpoint per release:
 *   GET https://api.stlouisfed.org/fred/release/dates
 *       ?release_id={id}
 *       &api_key={key}
 *       &file_type=json
 *       &include_release_dates_with_no_data=true
 *       &realtime_start=YYYY-MM-DD
 *       &realtime_end=YYYY-MM-DD
 *       &sort_order=asc
 *       &limit=100
 *
 * Graceful degradation:
 *  - If no API key is configured, logs a warning and returns [].
 *  - Each release call is wrapped via Promise.allSettled — one failure
 *    does not abort the rest.
 */

import type { CalendarEvent, CatalystType } from "../types.js";

export interface FredReleaseDescriptor {
  id: number;
  type: CatalystType;
  label: string;
  magnitudePrior: 1 | 2 | 3 | 4 | 5;
  timeEt: string;
}

/**
 * Locked 8-release set per RESEARCH.md "FRED releases we care about".
 * Operator can extend, but these are the load-bearing ones for swing-trading
 * macro context. Time-of-day fields are stable schedule conventions
 * (BLS prints at 08:30 ET, FOMC statement at 14:00 ET, ISM/JOLTS at 10:00 ET).
 */
export const FRED_RELEASE_IDS: FredReleaseDescriptor[] = [
  // Release ids verified against GET /fred/release?release_id=N on 2026-08-27.
  // Earlier table had 21 (H.6 Money Stock) as PCE, 84 (nonexistent) as Retail
  // Sales, 375 (Overnight Bank Funding Rate, daily) as ISM, and 101 (FOMC
  // Press Release — FRED publishes no future schedule for it, so the API pads
  // every calendar day). ISM is not on FRED at all; FOMC comes from
  // config/fomc-schedule-seed.json via SeedFileCalendarLoader instead.
  { id: 10, type: "cpi", label: "CPI", magnitudePrior: 4, timeEt: "08:30" },
  { id: 50, type: "nfp", label: "Employment Situation (NFP)", magnitudePrior: 5, timeEt: "08:30" },
  { id: 54, type: "pce", label: "Personal Income & Outlays (PCE)", magnitudePrior: 4, timeEt: "08:30" },
  { id: 9, type: "retail_sales", label: "Advance Retail Sales", magnitudePrior: 3, timeEt: "08:30" },
  { id: 192, type: "jolts", label: "JOLTS", magnitudePrior: 2, timeEt: "10:00" },
  { id: 53, type: "gdp", label: "GDP", magnitudePrior: 3, timeEt: "08:30" },
];

/**
 * FRED's `include_release_dates_with_no_data=true` is the only way to get a
 * release's *future* schedule — but for a release with no published schedule
 * FRED answers with every calendar day in the realtime window. No macro print
 * fires more than ~3 times in 60 days (GDP: advance/second/third), so anything
 * past this many dates is padding, not a schedule, and is discarded.
 */
export const MAX_RELEASE_DATES_PER_WINDOW = 10;

interface FredReleaseDatesResponse {
  release_dates?: Array<{
    release_id: number;
    release_name?: string;
    date: string; // YYYY-MM-DD
  }>;
  error_code?: number;
  error_message?: string;
}

export class FredCalendarFetcher {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey ?? undefined;
  }

  /**
   * Returns the next `days` worth of scheduled FRED release dates as
   * CalendarEvents. Empty array on missing key.
   */
  async fetchUpcoming(days = 60): Promise<CalendarEvent[]> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      console.warn("[FredCalendarFetcher] FRED_API_KEY not configured — returning [] (graceful degradation)");
      return [];
    }

    const today = new Date();
    const horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const realtime_start = isoDay(today);
    const realtime_end = isoDay(horizon);
    const now = new Date().toISOString();

    const settled = await Promise.allSettled(
      FRED_RELEASE_IDS.map((rd) => this.fetchOne(rd, realtime_start, realtime_end, now))
    );

    const events: CalendarEvent[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (!r) continue;
      if (r.status === "fulfilled") {
        events.push(...r.value);
      } else {
        const label = FRED_RELEASE_IDS[i]?.label ?? `release_${FRED_RELEASE_IDS[i]?.id}`;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.warn(`[FredCalendarFetcher] release "${label}" failed: ${reason}`);
      }
    }

    return events;
  }

  private async fetchOne(
    rd: FredReleaseDescriptor,
    realtime_start: string,
    realtime_end: string,
    now: string
  ): Promise<CalendarEvent[]> {
    const url = new URL("https://api.stlouisfed.org/fred/release/dates");
    url.searchParams.set("release_id", String(rd.id));
    url.searchParams.set("api_key", this.apiKey ?? "");
    url.searchParams.set("file_type", "json");
    url.searchParams.set("include_release_dates_with_no_data", "true");
    url.searchParams.set("realtime_start", realtime_start);
    url.searchParams.set("realtime_end", realtime_end);
    url.searchParams.set("sort_order", "asc");
    url.searchParams.set("limit", "100");

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as FredReleaseDatesResponse;
    if (body.error_code) {
      throw new Error(`FRED error ${body.error_code}: ${body.error_message ?? "unknown"}`);
    }

    const rows = (body.release_dates ?? []).filter((row) =>
      isWithinWindow(row.date, realtime_start, realtime_end),
    );
    if (rows.length > MAX_RELEASE_DATES_PER_WINDOW) {
      console.warn(
        `[FredCalendarFetcher] release ${rd.id} (${rd.label}) returned ${rows.length} dates in ` +
          `${realtime_start}..${realtime_end} — FRED has no schedule for it and padded every day; ignoring.`,
      );
      return [];
    }
    return rows
      .map((row) => ({
        id: `${rd.type}-${row.date}`,
        type: rd.type,
        tickers: [],
        affectedSectors: [],
        expectedDate: row.date,
        expectedTimeEt: rd.timeEt,
        magnitudePrior: rd.magnitudePrior,
        direction: "uncertain" as const,
        confidence: 0.3,
        source: "calendar:fred" as const,
        sourceMeta: {
          release_id: rd.id,
          label: rd.label,
          release_name: row.release_name,
        },
        firstSeenAt: now,
      }));
  }
}

function isoDay(d: Date): string {
  const iso = d.toISOString();
  return iso.split("T")[0] ?? iso;
}

function isWithinWindow(date: string, startInclusive: string, endInclusive: string): boolean {
  return date >= startInclusive && date <= endInclusive;
}
