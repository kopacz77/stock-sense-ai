/**
 * EIA Petroleum Cron Generator — M2-04 Plan 10-03
 *
 * Pure-deterministic CalendarEvent generator for the EIA Weekly Petroleum
 * Status Report, released every Wednesday at 10:30 ET — except when the
 * Mon-Tue federal-holiday rule shifts the release to Thursday.
 *
 * No network call. The holiday-shift table is operator-maintained;
 * the EIA publishes the annual schedule at
 *   https://www.eia.gov/petroleum/supply/weekly/schedule.php
 *
 * Default behavior with an empty shift table: every Wednesday in the
 * window at 10:30 ET.
 */

import type { CalendarEvent } from "../types.js";

/**
 * Operator-maintained holiday-shift overrides.
 *
 * Format: { "<original-wednesday-YYYY-MM-DD>": "<shifted-date-YYYY-MM-DD>" }
 *
 * Update annually each December from
 *   https://www.eia.gov/petroleum/supply/weekly/schedule.php
 *
 * Currently empty. The default Wednesday cadence is correct for ~90% of
 * weeks; the override table covers MLK / Presidents / Memorial / July 4
 * weeks where Tuesday is the federal holiday.
 */
export const EIA_HOLIDAY_SHIFTS: Record<string, string> = {
  // Example (commented out until operator confirms 2026 schedule manually):
  // "2026-01-21": "2026-01-22", // MLK week — petroleum report shifts Wed -> Thu
};

const EIA_TIME_ET = "10:30";

export interface EiaCalendarGeneratorOptions {
  /** Optional injection point for unit tests; defaults to EIA_HOLIDAY_SHIFTS. */
  shifts?: Record<string, string>;
  /** Optional clock injection for unit tests; defaults to `new Date()`. */
  now?: Date;
}

export class EiaCalendarGenerator {
  private readonly shifts: Record<string, string>;
  private readonly now: Date;

  constructor(options: EiaCalendarGeneratorOptions = {}) {
    this.shifts = options.shifts ?? EIA_HOLIDAY_SHIFTS;
    this.now = options.now ?? new Date();
  }

  /**
   * Returns CalendarEvents for every EIA petroleum release within the next
   * `days` window (inclusive of today through today + days).
   */
  generate(days = 60): CalendarEvent[] {
    const now = this.now;
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const startDay = startOfUtcDay(now);
    const endDay = startOfUtcDay(horizon);
    const nowIso = now.toISOString();

    const events: CalendarEvent[] = [];
    const seenIds = new Set<string>();

    // Walk forward day by day, emit on Wednesday. Cheaper than computing
    // "first Wednesday after startDay" math and avoids off-by-one risk.
    const cursor = new Date(startDay.getTime());
    while (cursor.getTime() <= endDay.getTime()) {
      if (cursor.getUTCDay() === 3 /* Wednesday */) {
        const wedIso = isoDay(cursor);
        const effective = this.shifts[wedIso] ?? wedIso;

        // After shift the date might fall outside the window. Skip if so.
        if (effective >= isoDay(startDay) && effective <= isoDay(endDay)) {
          const id = `eia-petroleum-${effective}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            events.push({
              id,
              type: "eia_petroleum",
              tickers: [],
              affectedSectors: ["XLE", "USO", "UNG"],
              expectedDate: effective,
              expectedTimeEt: EIA_TIME_ET,
              magnitudePrior: 2,
              direction: "uncertain",
              confidence: 0.5,
              source: "calendar:eia-cron",
              sourceMeta: {
                originalWednesday: wedIso,
                shiftedFromWednesday: effective !== wedIso,
              },
              firstSeenAt: nowIso,
            });
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return events;
  }
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function isoDay(d: Date): string {
  const iso = d.toISOString();
  return iso.split("T")[0] ?? iso;
}
