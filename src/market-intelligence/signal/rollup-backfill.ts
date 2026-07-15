/**
 * RollupBackfill — self-healing recovery for silently-dropped rollups.
 *
 * The cycle-runner builds only *today's* rollup (step 3.9) and wraps it in a
 * log-and-continue catch. If that build throws (transient fs/parse error), the
 * day's `ticker-day-summary-YYYY-MM-DD.jsonl` is never written and no later
 * cycle revisits a prior day — the day is lost despite its `scored-articles`
 * file persisting. This module detects those gaps and rebuilds them.
 *
 * Rebuild is deterministic: `RollupBuilder.buildForDay` reads the persisted
 * `scored-articles` + `catalyst-flags`, and PM signals are re-derived from the
 * persisted `polymarket-snapshots` file for the day via `PmMappingEngine.mapMarket`
 * (which, unlike `mapMarkets`, does NOT persist proposals — no side effects).
 *
 * Idempotent: a day that already has a rollup file is skipped, so this is safe
 * to call every cycle.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { MarketSnapshot } from "../polymarket/types.js";
import { PmMappingEngine, type TickerSignal } from "./pm-mapping-engine.js";
import { RollupBuilder } from "./rollup-builder.js";

export interface RollupBackfillOptions {
  /** Default "./data/intel". */
  dataDir?: string;
  /**
   * Only rebuild missing days whose date is >= (today − lookbackDays).
   * Omit to consider every missing day on disk. The cycle self-heal passes a
   * small window (e.g. 7) so we don't rescan the entire history each cycle.
   */
  lookbackDays?: number;
  /** Injectable "today" for deterministic tests. Default: new Date(). */
  now?: Date;
  /** Override the PM mapping config path (mainly for tests). Default: engine default. */
  pmConfigPath?: string;
}

export interface RollupBackfillResult {
  /** ISO dates whose rollup was (re)built this run. */
  rebuilt: string[];
  /** ISO dates that already had a rollup file (no action). */
  skipped: string[];
  /** ISO dates that were missing but errored during rebuild. */
  failed: Array<{ date: string; error: string }>;
}

/**
 * Detect days with a `scored-articles-*.jsonl` file but no matching
 * `ticker-day-summary-*.jsonl` file, and rebuild each one.
 */
export async function backfillMissingRollups(
  options: RollupBackfillOptions = {},
): Promise<RollupBackfillResult> {
  const dataDir = options.dataDir ?? "./data/intel";
  const now = options.now ?? new Date();

  const files = await fs.readdir(dataDir).catch(() => [] as string[]);

  const scoredDates = files
    .map((f) => /^scored-articles-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)?.[1])
    .filter((d): d is string => d !== undefined)
    .sort();
  const rollupDates = new Set(
    files
      .map((f) => /^ticker-day-summary-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)?.[1])
      .filter((d): d is string => d !== undefined),
  );

  let cutoffIso: string | null = null;
  if (options.lookbackDays !== undefined) {
    const cutoff = new Date(now.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);
    cutoffIso = cutoff.toISOString().split("T")[0]!;
  }

  const result: RollupBackfillResult = { rebuilt: [], skipped: [], failed: [] };
  const engine = new PmMappingEngine(
    options.pmConfigPath !== undefined
      ? { dataDir, configPath: options.pmConfigPath }
      : { dataDir },
  );
  const builder = new RollupBuilder({ dataDir });

  for (const date of scoredDates) {
    if (rollupDates.has(date)) {
      result.skipped.push(date);
      continue;
    }
    if (cutoffIso !== null && date < cutoffIso) continue;
    try {
      const pmSignals = await loadPmSignalsForDay(dataDir, date, engine);
      await builder.buildForDay(new Date(`${date}T12:00:00.000Z`), pmSignals);
      result.rebuilt.push(date);
    } catch (err) {
      result.failed.push({
        date,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Re-derive the day's PM ticker signals from the persisted snapshots file.
 * Uses `mapMarket` (no proposal persistence). Missing snapshots file → [].
 */
async function loadPmSignalsForDay(
  dataDir: string,
  date: string,
  engine: PmMappingEngine,
): Promise<TickerSignal[]> {
  const file = path.join(dataDir, `polymarket-snapshots-${date}.jsonl`);
  const raw = await fs.readFile(file, "utf8").catch(() => "");
  const signals: TickerSignal[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let snap: MarketSnapshot;
    try {
      snap = JSON.parse(trimmed) as MarketSnapshot;
    } catch {
      continue;
    }
    const r = await engine.mapMarket(snap);
    if ("tickerSignals" in r) signals.push(...r.tickerSignals);
  }
  return signals;
}
