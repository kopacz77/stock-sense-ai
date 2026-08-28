/**
 * M2-05 substrate reader — the only place `src/strategy/*` modules load
 * M2-04's `TickerDaySummary` rollups from disk. Read-only: never writes
 * into `data/intel/`, which stays M2-04's substrate (D-20).
 */

import { isDrainLocked } from "../market-intelligence/signal/backlog-drain.js";
import type { TickerDaySummary } from "../market-intelligence/signal/types.js";
import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";

/** Read one day's `ticker-day-summary-YYYY-MM-DD.jsonl` rows. */
export async function loadRollupsForDay(
  intelDataDir: string,
  date: Date,
): Promise<TickerDaySummary[]> {
  const store = new JsonlStore<TickerDaySummary>(intelDataDir, "ticker-day-summary");
  return store.readDay(date);
}

/**
 * Load rollups for every day in `[startIso, endIso]` inclusive, keyed by
 * `YYYY-MM-DD`. Not consumed by this plan's tracer path — implemented now
 * so the multi-day read path lives in one place before a later plan's
 * live-window backtest needs it (RESEARCH §10 Wave E).
 */
export async function loadRollupsForRange(
  intelDataDir: string,
  startIso: string,
  endIso: string,
): Promise<Map<string, TickerDaySummary[]>> {
  const store = new JsonlStore<TickerDaySummary>(intelDataDir, "ticker-day-summary");
  const result = new Map<string, TickerDaySummary[]>();
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);

  for (
    const cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const iso = cursor.toISOString().split("T")[0] ?? "";
    result.set(iso, await store.readDay(new Date(cursor)));
  }

  return result;
}

/**
 * True when `date`'s rollup file falls inside the 48h window that
 * `intel backlog-drain` might be actively rewriting (RESEARCH Pitfall 4:
 * a concurrent drain rewrites `ticker-day-summary-*.jsonl` mid-run).
 * Callers should surface this as a warning, not block the read — whatever
 * `loadRollupsForDay` already returned is still whatever was on disk at
 * read time.
 */
export async function isSubstrateHot(intelDataDir: string, date: Date): Promise<boolean> {
  const withinFortyEightHours = Date.now() - date.getTime() < 48 * 60 * 60 * 1000;
  if (!withinFortyEightHours) return false;
  return isDrainLocked(intelDataDir);
}
