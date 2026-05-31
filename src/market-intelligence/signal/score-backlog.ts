/**
 * ScoreBacklog — persistent queue for articles that failed to score because
 * LM Studio was unreachable.
 *
 * Lifecycle:
 *   1. Cycle-runner (Plan 06 / 10-06) calls `ArticleScorer.scoreArticle(...)`.
 *   2. On throw, cycle-runner calls `backlog.enqueue(article, pmContext, err.message)`.
 *   3. After scoring fresh arrivals in the next cycle, cycle-runner calls
 *      `backlog.drain(scorer, ctx, 50)` to chip away at backlog without
 *      starving fresh-article scoring.
 *
 * Storage: single rolling file at `data/intel/score-backlog.jsonl` (NOT
 * date-rotated — entries leave when scored). Atomic writes via temp-file
 * rename so a process kill mid-drain doesn't leave a half-written backlog.
 *
 * Drain semantics:
 *   - Sort oldest-first by enqueuedAt before draining (FIFO).
 *   - Cap per cycle at `maxN` (default 50). A recovered LLM might face 100s of
 *     queued articles; chipping away gradually keeps fresh-cycle scoring
 *     responsive.
 *   - STOP on first failure within a drain cycle. Rationale: an LLM that's
 *     still down on call N+1 is overwhelmingly likely down on call N+2 too;
 *     burning the remaining `maxN - 1` budget on guaranteed failures is
 *     wasteful. Bail and let the next cycle retry the slice.
 *   - On success: entry removed from backlog.
 *   - On failure: entry kept, attempts++, lastErrorMessage updated.
 *
 * Dedup: enqueue checks for an existing entry with the same `article.id` —
 * if present, bumps attempts + updates lastErrorMessage but preserves
 * enqueuedAt (so the FIFO age tracking stays meaningful).
 *
 * Concurrency: single-process safe (one scheduler today). The in-memory
 * `cache` field assumes there is no second writer; if we ever split scoring
 * into a worker process, the cache invalidation strategy needs revisiting.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
import type { ScoreBacklogEntry, ScoredArticle } from "./types.js";
import type { ArticleScorer, ScoringContext } from "./article-scorer.js";

export interface ScoreBacklogOptions {
  /** Directory containing the backlog file. Default ./data/intel */
  dataDir?: string;
  /** Filename. Default "score-backlog.jsonl" */
  filename?: string;
}

export interface DrainResult {
  /** Articles successfully scored and removed from the backlog. */
  scored: number;
  /** Articles that failed this drain pass (kept in backlog). Always 0 or 1 — drain bails on first failure. */
  failed: number;
  /** Backlog size after the drain. */
  remaining: number;
  /** Age in ms of the oldest remaining entry, or null if backlog is empty. */
  oldestAgeMs: number | null;
  /** All ScoredArticle records produced across all successful drains this pass. */
  scoredRecords: ScoredArticle[];
}

export class ScoreBacklog {
  private readonly file: string;
  /** In-memory cache. Populated on first load; invalidated by writeAll. */
  private cache: ScoreBacklogEntry[] | null = null;

  constructor(options: ScoreBacklogOptions = {}) {
    const dir = options.dataDir ?? "./data/intel";
    const name = options.filename ?? "score-backlog.jsonl";
    this.file = path.resolve(path.join(dir, name));
  }

  /**
   * Add an article to the backlog. If an entry with the same article.id
   * already exists, dedup by bumping attempts and updating lastErrorMessage —
   * the original enqueuedAt is preserved so the age tracking stays meaningful.
   */
  async enqueue(
    article: NewsArticle,
    pmContext: MarketSnapshot[],
    errorMessage?: string,
  ): Promise<void> {
    const entries = await this.load();
    const existing = entries.find((e) => e.article.id === article.id);
    if (existing) {
      existing.attempts += 1;
      if (errorMessage !== undefined) existing.lastErrorMessage = errorMessage;
    } else {
      entries.push({
        enqueuedAt: new Date().toISOString(),
        attempts: 1,
        lastErrorMessage: errorMessage,
        article,
        pmContext,
      });
    }
    await this.writeAll(entries);
  }

  /**
   * Process up to `maxN` entries oldest-first. Successful scores remove the
   * entry from the backlog. On the first failure within a drain cycle, STOP
   * and leave the remaining slice in the backlog for the next cycle.
   */
  async drain(
    scorer: ArticleScorer,
    context: ScoringContext,
    maxN = 50,
  ): Promise<DrainResult> {
    const entries = await this.load();
    entries.sort((a, b) => Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt));

    const slice = entries.slice(0, maxN);
    // Entries beyond maxN remain regardless of outcome.
    const remaining: ScoreBacklogEntry[] = entries.slice(maxN);
    const scoredRecords: ScoredArticle[] = [];
    let scored = 0;
    let failed = 0;

    for (let i = 0; i < slice.length; i++) {
      const entry = slice[i];
      if (!entry) continue;
      try {
        const ctx: ScoringContext = { ...context, pmContext: entry.pmContext };
        const records = await scorer.scoreArticle(entry.article, ctx);
        scoredRecords.push(...records);
        scored += 1;
      } catch (err) {
        failed += 1;
        entry.attempts += 1;
        entry.lastErrorMessage = err instanceof Error ? err.message : String(err);
        // Push the failed entry + everything we haven't processed yet back into remaining.
        remaining.push(...slice.slice(i));
        // Bail — LLM likely still down for subsequent calls; don't waste the budget.
        break;
      }
    }

    await this.writeAll(remaining);
    const oldestAgeMs = this.computeOldestAgeMs(remaining);
    return { scored, failed, remaining: remaining.length, oldestAgeMs, scoredRecords };
  }

  /** Current backlog size. */
  async size(): Promise<number> {
    const entries = await this.load();
    return entries.length;
  }

  /** Age in ms of the oldest backlog entry, or null if empty. */
  async oldestAgeMs(): Promise<number | null> {
    const entries = await this.load();
    return this.computeOldestAgeMs(entries);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internal
  // ───────────────────────────────────────────────────────────────────────

  /** Read all entries from disk (or cache). Returns [] if file doesn't exist. */
  private async load(): Promise<ScoreBacklogEntry[]> {
    if (this.cache !== null) {
      // Return a shallow copy so callers can mutate freely without affecting cache.
      return this.cache.map((e) => ({ ...e }));
    }
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const parsed = lines.map((l) => JSON.parse(l) as ScoreBacklogEntry);
      this.cache = parsed;
      return parsed.map((e) => ({ ...e }));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = [];
        return [];
      }
      throw err;
    }
  }

  /** Atomic write: write to temp file, then rename. Updates cache. */
  private async writeAll(entries: ScoreBacklogEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const body =
      entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, this.file);
    this.cache = entries.map((e) => ({ ...e }));
  }

  private computeOldestAgeMs(entries: ScoreBacklogEntry[]): number | null {
    if (entries.length === 0) return null;
    let oldestMs = Number.POSITIVE_INFINITY;
    for (const e of entries) {
      const ms = Date.parse(e.enqueuedAt);
      if (Number.isFinite(ms) && ms < oldestMs) oldestMs = ms;
    }
    if (!Number.isFinite(oldestMs)) return null;
    return Date.now() - oldestMs;
  }
}
