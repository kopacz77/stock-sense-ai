/**
 * Finnhub Earnings Calendar Fetcher — M2-04 Plan 10-03
 *
 * Pulls upcoming earnings dates for the supplied ticker universe
 * (watchlist + macro-tickers) from Finnhub's /calendar/earnings.
 *
 * Endpoint:
 *   GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&token={key}
 *
 * One request covers the entire window; we then filter client-side
 * to the supplied universe.
 *
 * Response shape (per RESEARCH "Earnings Calendar"):
 *   {
 *     earningsCalendar: [
 *       {
 *         symbol: "NVDA",
 *         date: "2026-08-21",
 *         hour: "amc" | "bmo" | "dmh",   // after-market-close / before-market-open / during-market-hours
 *         epsActual: null,
 *         epsEstimate: 1.23,
 *         revenueActual: null,
 *         revenueEstimate: 30000000000,
 *         year: 2026,
 *         quarter: 2
 *       },
 *       ...
 *     ]
 *   }
 *
 * Graceful degradation:
 *  - Empty/missing api key -> warn + return [].
 *  - Non-2xx response or malformed body -> warn + return [].
 */

import type { CalendarEvent } from "../types.js";

interface FinnhubEarningsRow {
  symbol: string;
  date: string;
  hour?: "amc" | "bmo" | "dmh" | string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  year?: number;
  quarter?: number;
}

interface FinnhubEarningsResponse {
  earningsCalendar?: FinnhubEarningsRow[];
}

export class FinnhubEarningsCalendarFetcher {
  private readonly apiKey: string | undefined;
  private readonly tickerSet: Set<string>;

  constructor(apiKey: string | undefined | null, tickerUniverse: string[]) {
    this.apiKey = apiKey ?? undefined;
    this.tickerSet = new Set(tickerUniverse.map((t) => t.toUpperCase()));
  }

  async fetchUpcoming(days = 60): Promise<CalendarEvent[]> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      console.warn("[FinnhubEarningsCalendarFetcher] FINNHUB_API_KEY not configured — returning [] (graceful degradation)");
      return [];
    }
    if (this.tickerSet.size === 0) {
      // No universe means no filter target; calling with no tickers is a misuse but not fatal.
      return [];
    }

    const today = new Date();
    const horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const from = isoDay(today);
    const to = isoDay(horizon);
    const now = new Date().toISOString();

    const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("token", this.apiKey);

    let body: FinnhubEarningsResponse;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.warn(`[FinnhubEarningsCalendarFetcher] HTTP ${res.status} ${res.statusText} — returning []`);
        return [];
      }
      body = (await res.json()) as FinnhubEarningsResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[FinnhubEarningsCalendarFetcher] fetch failed: ${msg}`);
      return [];
    }

    const rows = body.earningsCalendar ?? [];
    const events: CalendarEvent[] = [];

    for (const row of rows) {
      if (!row.symbol || !row.date) continue;
      const sym = row.symbol.toUpperCase();
      if (!this.tickerSet.has(sym)) continue;
      if (row.date < from || row.date > to) continue;

      events.push({
        id: `earnings-${sym}-${row.date}`,
        type: "earnings",
        tickers: [sym],
        affectedSectors: [],
        expectedDate: row.date,
        expectedTimeEt: mapHourToEt(row.hour),
        magnitudePrior: 4,
        direction: "uncertain",
        confidence: 0.4,
        source: "calendar:finnhub-earnings",
        sourceMeta: {
          hour: row.hour,
          epsEstimate: row.epsEstimate ?? null,
          revenueEstimate: row.revenueEstimate ?? null,
          year: row.year,
          quarter: row.quarter,
        },
        firstSeenAt: now,
      });
    }

    return events;
  }
}

function mapHourToEt(hour: string | undefined): string | undefined {
  switch (hour) {
    case "amc":
      // After-market-close: report typically released 16:00-16:30 ET. Use 16:30 to mark "after close".
      return "16:30";
    case "bmo":
      // Before-market-open: report typically released 06:30-08:00 ET. Use 08:00 as the conservative pre-open mark.
      return "08:00";
    case "dmh":
      // During-market-hours releases are rare and time isn't given — leave undefined.
      return undefined;
    default:
      return undefined;
  }
}

function isoDay(d: Date): string {
  const iso = d.toISOString();
  return iso.split("T")[0] ?? iso;
}
