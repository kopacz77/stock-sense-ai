/**
 * Treasury Auction Calendar Fetcher — M2-04 Plan 10-03
 *
 * Pulls upcoming auctions for long-duration Notes (10Y) and Bonds (20Y/30Y)
 * from the TreasuryDirect Fiscal Data API.
 *
 * Endpoint (confirmed live during 10-03 spike, see 10-03-treasury-spike.md):
 *   GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions
 *       ?sort=-auction_date
 *       &page[size]=200
 *       &filter=security_type:in:(Note,Bond)
 *
 * No auth required.
 *
 * Key nuance — reopenings shift `security_term`:
 *   10Y Note (initial)  -> "10-Year"
 *   10Y Note (reopen)   -> "9-Year 10-Month" or "9-Year 11-Month"
 *   20Y Bond (initial)  -> "20-Year"
 *   20Y Bond (reopen)   -> "19-Year 10-Month" or "19-Year 11-Month"
 *   30Y Bond (initial)  -> "30-Year"
 *   30Y Bond (reopen)   -> "29-Year 10-Month" or "29-Year 11-Month"
 *
 * Bills (4W/8W/13W/52W) are intentionally excluded — front-of-curve
 * doesn't materially move TLT/IEF on tail dynamics.
 */

import type { CalendarEvent } from "../types.js";

interface TreasuryUpcomingAuctionRow {
  record_date?: string;
  security_type?: string;
  security_term?: string;
  reopening?: string;
  cusip?: string;
  offering_amt?: string;
  announcemt_date?: string;
  auction_date?: string;
  issue_date?: string;
}

interface TreasuryUpcomingAuctionResponse {
  data?: TreasuryUpcomingAuctionRow[];
  meta?: { count?: number };
}

// Long-duration filters per security_type. See 10-03-treasury-spike.md.
const NOTE_10Y = /^(10-Year|9-Year (10|11)-Month)$/;
const BOND_20Y = /^(20-Year|19-Year (10|11)-Month)$/;
const BOND_30Y = /^(30-Year|29-Year (10|11)-Month)$/;

const TREASURY_AUCTION_TIME_ET = "13:00";

export class TreasuryAuctionCalendarFetcher {
  async fetchUpcoming(days = 60): Promise<CalendarEvent[]> {
    const today = new Date();
    const horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const from = isoDay(today);
    const to = isoDay(horizon);
    const now = new Date().toISOString();

    const url =
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions" +
      "?sort=-auction_date" +
      "&page%5Bsize%5D=200" +
      "&filter=security_type:in:(Note,Bond)";

    let body: TreasuryUpcomingAuctionResponse;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[TreasuryAuctionCalendarFetcher] HTTP ${res.status} ${res.statusText} — returning []`);
        return [];
      }
      body = (await res.json()) as TreasuryUpcomingAuctionResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[TreasuryAuctionCalendarFetcher] fetch failed: ${msg}`);
      return [];
    }

    const rows = body.data ?? [];
    const events: CalendarEvent[] = [];

    for (const row of rows) {
      if (!row.security_type || !row.security_term || !row.auction_date) continue;
      const auctionDate = row.auction_date;
      if (auctionDate < from || auctionDate > to) continue;

      const longDurationKind = classifyLongDuration(row.security_type, row.security_term);
      if (!longDurationKind) continue;

      const termSlug = row.security_term.toLowerCase().replace(/\s+/g, "-");
      events.push({
        id: `treasury-${row.security_type.toLowerCase()}-${termSlug}-${auctionDate}`,
        type: "treasury_auction",
        tickers: [],
        affectedSectors: ["TLT", "IEF"],
        expectedDate: auctionDate,
        expectedTimeEt: TREASURY_AUCTION_TIME_ET,
        magnitudePrior: 2,
        direction: "uncertain",
        confidence: 0.3,
        source: "calendar:treasury",
        sourceMeta: {
          security_type: row.security_type,
          security_term: row.security_term,
          duration_family: longDurationKind,
          reopening: row.reopening,
          cusip: row.cusip,
          issue_date: row.issue_date,
          announcemt_date: row.announcemt_date,
        },
        firstSeenAt: now,
      });
    }

    return events;
  }
}

function classifyLongDuration(securityType: string, securityTerm: string): "10y" | "20y" | "30y" | null {
  if (securityType === "Note" && NOTE_10Y.test(securityTerm)) return "10y";
  if (securityType === "Bond" && BOND_20Y.test(securityTerm)) return "20y";
  if (securityType === "Bond" && BOND_30Y.test(securityTerm)) return "30y";
  return null;
}

function isoDay(d: Date): string {
  const iso = d.toISOString();
  return iso.split("T")[0] ?? iso;
}
