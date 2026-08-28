/**
 * Scored-day coverage gate (M2-05 Plan 11-04, Task 1).
 *
 * The single place that answers "did we actually look at the news on these
 * days?" `data/intel/scored-articles-*.jsonl` has real gaps (36 non-
 * contiguous days ending 2026-07-26, nothing 07-27 -> 08-27 until
 * `intel backlog-drain` runs — RESEARCH §0/§9 Pitfall 6). During that gap,
 * `ticker-day-summary-*.jsonl` keeps rebuilding daily (PM-only rows,
 * `articleCount: 0`) — a naive 3-day sentiment delta over that window reads
 * as "sentiment didn't move" when the truth is "we never looked". This
 * module makes that distinction observable so `SENTIMENT_VELOCITY` can gate
 * on it (D-02: never a silent zero-delta).
 *
 * "File absent" (the scorer never ran that day) is distinguished from
 * "file present but zero rows" (it ran and found nothing to score) — only
 * the former is a coverage hole. `fs.access` on `scored-articles-{day}.jsonl`
 * answers this directly; a present-but-empty file still passes `fs.access`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { TickerDaySummary } from "../market-intelligence/signal/types.js";
import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";

/** Per-day coverage facts for one calendar day. */
export interface ScoredDayCoverage {
  day: string; // ISO YYYY-MM-DD
  /** Whether `scored-articles-{day}.jsonl` exists on disk at all. */
  fileExists: boolean;
  /** Rows in `ticker-day-summary-{day}.jsonl` with `articleCount > 0`. */
  rowsWithArticles: number;
  /** Total rows in `ticker-day-summary-{day}.jsonl` for that day. */
  totalRows: number;
}

/**
 * The `days` calendar days strictly before `asOfDate`, oldest first.
 * `trailingDayIsos("2026-06-25", 3)` -> `["2026-06-22", "2026-06-23", "2026-06-24"]`.
 */
export function trailingDayIsos(asOfDate: string, days: number): string[] {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00.000Z`);
  const result: string[] = [];
  for (let offset = days; offset >= 1; offset--) {
    const iso = new Date(asOfMs - offset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    result.push(iso ?? asOfDate);
  }
  return result;
}

/**
 * Per-day coverage facts for each ISO day in `dayIsos`. Reads
 * `scored-articles-{day}.jsonl` (existence only, via `fs.access`) and
 * `ticker-day-summary-{day}.jsonl` (row counts, via `JsonlStore.readDay`) —
 * two independent streams, so a PM-only day (scorer never ran, rollup
 * still rebuilt from Polymarket/catalyst data) is visible as
 * `fileExists: false, totalRows > 0, rowsWithArticles: 0`.
 */
export async function scoredDayCoverage(
  intelDataDir: string,
  dayIsos: string[],
): Promise<ScoredDayCoverage[]> {
  const summaryStore = new JsonlStore<TickerDaySummary>(intelDataDir, "ticker-day-summary");
  const results: ScoredDayCoverage[] = [];

  for (const day of dayIsos) {
    let fileExists = true;
    try {
      await fs.access(path.join(intelDataDir, `scored-articles-${day}.jsonl`));
    } catch {
      fileExists = false;
    }

    const summaryRows = await summaryStore.readDay(new Date(`${day}T00:00:00.000Z`));
    const rowsWithArticles = summaryRows.filter((r) => r.articleCount > 0).length;

    results.push({ day, fileExists, rowsWithArticles, totalRows: summaryRows.length });
  }

  return results;
}

/**
 * `ok: true` only when every day in `trailingDayIsos(asOfDate, days)` has
 * `fileExists: true` AND `rowsWithArticles > 0`. `reason` names the missing
 * days explicitly and points at the remedy (`intel backlog-drain`) — this
 * string is what `SentimentVelocityModule.gate()` returns verbatim, what
 * the 11-05 engine surfaces in `StrategyRunResult.skippedTypes`, and what
 * the CLI prints, so it is the entire user-visible expression of D-02's
 * gate (never a silent zero-delta).
 */
export async function hasTrailingCoverage(
  intelDataDir: string,
  asOfDate: string,
  days: number,
): Promise<{ ok: boolean; reason: string; missingDays: string[] }> {
  const dayIsos = trailingDayIsos(asOfDate, days);
  const coverage = await scoredDayCoverage(intelDataDir, dayIsos);
  const missingDays = coverage
    .filter((c) => !c.fileExists || c.rowsWithArticles === 0)
    .map((c) => c.day);

  if (missingDays.length === 0) {
    return {
      ok: true,
      reason: `Trailing ${days}-day scored-article coverage present for ${dayIsos.join(", ")}.`,
      missingDays: [],
    };
  }

  return {
    ok: false,
    reason:
      `Missing scored-article coverage for ${missingDays.join(", ")} (trailing ${days}-day ` +
      `window: ${dayIsos.join(", ")}). Run "intel backlog-drain" to extend coverage.`,
    missingDays,
  };
}
