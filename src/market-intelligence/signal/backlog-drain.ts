/**
 * Backlog drain — catch-up scoring for articles queued in `score-backlog.jsonl`
 * while the LLM was unreachable.
 *
 * Two things distinguish this from `ScoreBacklog.drain` alone:
 *
 *   1. **Records land in the article's publish day.** `JsonlStore.appendMany`
 *      writes to today's file; back-scoring a month of news that way would
 *      dump every old article into today's rollup. `persistDrainedRecords`
 *      buckets by `article.publishedAt` (UTC day) and the touched days' rollups
 *      are rebuilt afterwards so `ticker-day-summary` rows built while the
 *      scorer was down (articleCount: 0) get their articles back.
 *
 *   2. **A lock file.** `intel backlog-drain` and the scheduler's in-cycle
 *      drain both rewrite the backlog file whole; running both at once loses
 *      entries. The CLI holds `score-backlog.lock` for the duration and the
 *      cycle-runner skips its drain while a fresh lock exists.
 *
 * Used by `intel backlog-drain` (loop until empty/max/failure) and by the
 * cycle-runner (one bounded batch per cycle).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NewsArticle } from "../news/types.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { ArticleScorer, ScoringContext } from "./article-scorer.js";
import { PmMappingEngine } from "./pm-mapping-engine.js";
import { RollupBuilder } from "./rollup-builder.js";
import { rebuildRollupForDay } from "./rollup-backfill.js";
import { ScoreBacklog } from "./score-backlog.js";
import type { ScoredArticle } from "./types.js";

export const DRAIN_LOCK_FILE = "score-backlog.lock";
/** A lock older than this is treated as abandoned (crashed process). */
export const DRAIN_LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export interface DrainBacklogOptions {
  dataDir?: string;
  scorer: ArticleScorer;
  context: ScoringContext;
  /** Stop after this many successfully scored articles. Default: unbounded. */
  max?: number;
  /** Entries per `ScoreBacklog.drain` call. Default 50. */
  batchSize?: number;
  /** Rebuild ticker-day-summary for touched days when done. Default true. */
  rebuildRollups?: boolean;
  /** Stop between batches when aborted (current batch always completes). */
  signal?: AbortSignal;
  /** Progress callback after each batch. */
  onBatch?: (batch: { scored: number; remaining: number; totalScored: number; ms: number }) => void;
}

export interface DrainBacklogResult {
  scored: number;
  remaining: number;
  stoppedBecause: "empty" | "max" | "failure" | "aborted";
  lastError?: string;
  touchedDays: string[];
  rollupsRebuilt: string[];
  rollupsFailed: Array<{ date: string; error: string }>;
}

/** Subset of DrainResult that persistence needs. */
export interface DrainedBatch {
  scoredRecords: ScoredArticle[];
  scoredArticles: NewsArticle[];
}

/**
 * Write drained records into the scored-articles file for their article's
 * publish day. Returns the distinct days (YYYY-MM-DD, UTC) that were written.
 */
export async function persistDrainedRecords(
  dataDir: string,
  batch: DrainedBatch,
): Promise<string[]> {
  if (batch.scoredRecords.length === 0) return [];
  const store = new JsonlStore<ScoredArticle>(dataDir, "scored-articles");
  const publishedById = new Map(batch.scoredArticles.map((a) => [a.id, a.publishedAt]));

  const byDay = new Map<string, ScoredArticle[]>();
  for (const rec of batch.scoredRecords) {
    const published = publishedById.get(rec.sourceArticleId);
    const ts = published !== undefined ? Date.parse(published) : Number.NaN;
    // Fall back to scoredAt (≈ now) if the publish timestamp is unusable.
    const date = Number.isFinite(ts) ? new Date(ts) : new Date(rec.scoredAt);
    const day = date.toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(rec);
    byDay.set(day, list);
  }

  for (const [day, records] of byDay) {
    await store.appendManyOn(records, new Date(`${day}T12:00:00.000Z`));
  }
  return Array.from(byDay.keys());
}

/** True if a drain lock exists and is younger than `staleMs`. */
export async function isDrainLocked(
  dataDir: string,
  staleMs = DRAIN_LOCK_STALE_MS,
): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(dataDir, DRAIN_LOCK_FILE), "utf8");
    const acquired = Date.parse((JSON.parse(raw) as { acquiredAt?: string }).acquiredAt ?? "");
    if (!Number.isFinite(acquired)) return false;
    return Date.now() - acquired < staleMs;
  } catch {
    return false;
  }
}

async function acquireLock(dataDir: string): Promise<() => Promise<void>> {
  if (await isDrainLocked(dataDir)) {
    throw new Error(
      `[backlog-drain] another drain holds ${DRAIN_LOCK_FILE} (stale after ${DRAIN_LOCK_STALE_MS / 60000} min)`,
    );
  }
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, DRAIN_LOCK_FILE);
  await fs.writeFile(
    file,
    JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
    "utf8",
  );
  return async () => {
    await fs.rm(file, { force: true });
  };
}

/**
 * Drain the backlog in batches until it is empty, `max` articles have been
 * scored, or a batch hits a failure (LLM down again — no point continuing).
 * Holds the drain lock for the duration.
 */
export async function drainBacklog(options: DrainBacklogOptions): Promise<DrainBacklogResult> {
  const dataDir = options.dataDir ?? "./data/intel";
  const batchSize = Math.max(1, options.batchSize ?? 50);
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const release = await acquireLock(dataDir);

  const backlog = new ScoreBacklog({ dataDir });
  const touched = new Set<string>();
  let totalScored = 0;
  let remaining = await backlog.size();
  let stoppedBecause: DrainBacklogResult["stoppedBecause"] = "empty";
  let lastError: string | undefined;

  try {
    while (remaining > 0 && totalScored < max) {
      const n = Math.min(batchSize, max - totalScored);
      const t0 = Date.now();
      const batch = await backlog.drain(options.scorer, options.context, n);
      for (const day of await persistDrainedRecords(dataDir, batch)) touched.add(day);
      totalScored += batch.scored;
      remaining = batch.remaining;
      options.onBatch?.({
        scored: batch.scored,
        remaining,
        totalScored,
        ms: Date.now() - t0,
      });
      if (batch.failed > 0) {
        stoppedBecause = "failure";
        lastError = batch.lastError;
        break;
      }
      if (options.signal?.aborted) {
        stoppedBecause = "aborted";
        break;
      }
    }
    if (stoppedBecause === "empty" && remaining > 0) stoppedBecause = "max";

    const rollupsRebuilt: string[] = [];
    const rollupsFailed: DrainBacklogResult["rollupsFailed"] = [];
    if (options.rebuildRollups !== false && touched.size > 0) {
      const engine = new PmMappingEngine({ dataDir });
      const builder = new RollupBuilder({ dataDir });
      for (const day of Array.from(touched).sort()) {
        try {
          await rebuildRollupForDay(dataDir, day, engine, builder);
          rollupsRebuilt.push(day);
        } catch (err) {
          rollupsFailed.push({ date: day, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    const result: DrainBacklogResult = {
      scored: totalScored,
      remaining,
      stoppedBecause,
      touchedDays: Array.from(touched),
      rollupsRebuilt,
      rollupsFailed,
    };
    if (lastError !== undefined) result.lastError = lastError;
    return result;
  } finally {
    await release();
  }
}

/** Remove the drain lock (used by the CLI's SIGINT handler when forced out mid-batch). */
export async function releaseDrainLock(dataDir: string): Promise<void> {
  await fs.rm(path.join(dataDir, DRAIN_LOCK_FILE), { force: true });
}
