/**
 * StabilityTest — M2-04 success criterion 6 acceptance gate.
 *
 * Re-scores a frozen N-day window of articles via the configured ArticleScorer
 * and compares per-article sentiment deltas + per-(date × ticker) rollup deltas
 * against the baseline scores already on disk. Pass/fail thresholds are
 * configurable; defaults come from RESEARCH ("≥95% of articles within 0.15
 * sentiment delta AND ≥95% of rollups within 0.08 delta").
 *
 * Why this matters: the M2-04 LLM scoring layer feeds M2-05's strategy engine.
 * If sentiment drifts >0.15 between identical calls, downstream strategies
 * inherit noise that masquerades as signal. The stability test catches model-
 * level non-determinism BEFORE it pollutes a live cycle.
 *
 * Re-scoring respects the scorer's sequential gate (Plan 10-02), so this
 * runs serialized through the same LM Studio call surface as production.
 *
 * Note: this module computes weighted-sentiment-per-bucket inline rather than
 * delegating to RollupBuilder.buildForDay. Building the rollup writes to disk
 * (atomic temp-rename) and would race with whatever process owns the daily
 * file — a stability test should be read-only against the data dir.
 */

import type { ArticleScorer, ScoringContext } from "./article-scorer.js";
import type { ScoredArticle } from "./types.js";
import type { NewsArticle } from "../news/types.js";
import { JsonlStore } from "../storage/jsonl-store.js";

export interface StabilityTestOptions {
  /** Window size in days (inclusive: today - (days-1) ... today). Default 7. */
  days: number;
  scorer: ArticleScorer;
  context: ScoringContext;
  /** Default "./data/intel". */
  dataDir?: string;
  /** Per-article sentiment-delta P95 threshold for PASS. Default 0.15. */
  articleP95Threshold?: number;
  /** Per-rollup-row sentiment-delta P95 threshold for PASS. Default 0.08. */
  rollupP95Threshold?: number;
  /**
   * Optional progress callback: called after each article re-score with (done, total).
   * Useful for CLI spinner updates.
   */
  onProgress?: (done: number, total: number) => void;
}

export interface StabilityTestReport {
  windowDays: number;
  articlesEvaluated: number;
  rollupRowsEvaluated: number;
  /** Sorted ascending; useful for downstream histogram rendering. */
  articleSentDeltas: number[];
  /** Sorted ascending. */
  rollupSentDeltas: number[];
  articleP50: number;
  articleP95: number;
  rollupP50: number;
  rollupP95: number;
  articleThreshold: number;
  rollupThreshold: number;
  passed: boolean;
  /** Human-readable verdict line — what the CLI prints to stdout. */
  reason: string;
  durationMs: number;
}

/**
 * Re-score the last `days` of articles and compare to baseline scores.
 *
 * 1. Load baseline ScoredArticle rows from `scored-articles-*.jsonl` for the window.
 * 2. De-dup by sourceArticleId (we re-score each NewsArticle once, not per fan-out).
 * 3. Load the matching NewsArticle objects from `news-*.jsonl`.
 * 4. Re-score sequentially through the configured ArticleScorer.
 * 5. Compute per-article sentiment deltas (matched on sourceArticleId × ticker).
 * 6. Compute per-(date × ticker) rollup deltas from materiality-weighted means.
 * 7. Compute P50/P95 percentiles; pass if both P95s are within thresholds.
 */
export async function runStabilityTest(
  options: StabilityTestOptions,
): Promise<StabilityTestReport> {
  const start = Date.now();
  const dataDir = options.dataDir ?? "./data/intel";
  const days = options.days;

  // 1) Collect baseline ScoredArticle rows for the window.
  const baselines: ScoredArticle[] = await loadScoredWindow(dataDir, days);
  if (baselines.length === 0) {
    return emptyReport(options, start, "No scored articles in window — cannot evaluate stability");
  }

  // 2) De-dup to unique source articles (one re-score per NewsArticle).
  const articleByArticleId = new Map<string, ScoredArticle>();
  for (const s of baselines) {
    if (!articleByArticleId.has(s.sourceArticleId)) {
      articleByArticleId.set(s.sourceArticleId, s);
    }
  }

  // 3) Load NewsArticle objects for each source article id.
  const articles = await loadNewsArticlesByIds(
    dataDir,
    Array.from(articleByArticleId.keys()),
    Math.max(days, 14),
  );

  if (articles.length === 0) {
    return emptyReport(
      options,
      start,
      "No source NewsArticles found for baseline scored rows — cannot re-score",
    );
  }

  // 4) Re-score sequentially. Skip articles that error on re-score so they don't
  //    skew the test as false 0-deltas.
  const reruns: ScoredArticle[] = [];
  let done = 0;
  for (const article of articles) {
    try {
      const records = await options.scorer.scoreArticle(article, options.context);
      reruns.push(...records);
    } catch (err) {
      console.warn(
        `[stability-test] skip ${article.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
    done += 1;
    options.onProgress?.(done, articles.length);
  }

  // 5) Per-article deltas: match baseline and rerun by sourceArticleId × ticker.
  const articleSentDeltas: number[] = [];
  const baselineByKey = new Map<string, ScoredArticle>(
    baselines.map((s) => [`${s.sourceArticleId}::${s.ticker}`, s]),
  );
  for (const r of reruns) {
    const key = `${r.sourceArticleId}::${r.ticker}`;
    const b = baselineByKey.get(key);
    if (!b) continue;
    articleSentDeltas.push(Math.abs(r.sentiment - b.sentiment));
  }
  articleSentDeltas.sort((a, b) => a - b);

  // 6) Per-(date × ticker) rollup deltas — compute weighted sentiment per bucket
  //    inline (don't delegate to RollupBuilder; that writes to disk).
  const dateOf = (s: ScoredArticle) => s.scoredAt.split("T")[0] ?? "";
  const rollupBaseline = computeWeightedSentByBucket(baselines, dateOf);
  const rollupRerun = computeWeightedSentByBucket(reruns, dateOf);
  const rollupSentDeltas: number[] = [];
  for (const [bucket, baseW] of rollupBaseline) {
    const rerunW = rollupRerun.get(bucket);
    if (rerunW === undefined) continue;
    rollupSentDeltas.push(Math.abs(rerunW - baseW));
  }
  rollupSentDeltas.sort((a, b) => a - b);

  // 7) Percentiles + pass/fail.
  const articleP50 = percentile(articleSentDeltas, 50);
  const articleP95 = percentile(articleSentDeltas, 95);
  const rollupP50 = percentile(rollupSentDeltas, 50);
  const rollupP95 = percentile(rollupSentDeltas, 95);
  const articleThreshold = options.articleP95Threshold ?? 0.15;
  const rollupThreshold = options.rollupP95Threshold ?? 0.08;
  const articleOk = articleP95 <= articleThreshold;
  const rollupOk = rollupP95 <= rollupThreshold;
  const passed = articleOk && rollupOk;

  let reason: string;
  if (passed) {
    reason = `PASS: article P95 ${articleP95.toFixed(3)} <= ${articleThreshold} AND rollup P95 ${rollupP95.toFixed(3)} <= ${rollupThreshold}`;
  } else {
    const parts: string[] = [];
    if (!articleOk) parts.push(`article P95 ${articleP95.toFixed(3)} > ${articleThreshold}`);
    if (!rollupOk) parts.push(`rollup P95 ${rollupP95.toFixed(3)} > ${rollupThreshold}`);
    reason = `FAIL: ${parts.join(" AND ")}`;
  }

  return {
    windowDays: days,
    articlesEvaluated: articles.length,
    rollupRowsEvaluated: rollupSentDeltas.length,
    articleSentDeltas,
    rollupSentDeltas,
    articleP50,
    articleP95,
    rollupP50,
    rollupP95,
    articleThreshold,
    rollupThreshold,
    passed,
    reason,
    durationMs: Date.now() - start,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Group scored rows by `${bucketKey(s)}::${ticker}`, compute the
 * materiality-weighted mean sentiment per bucket.
 *
 *   weightedSent = Σ(sentiment_i × materiality_i) / Σ(materiality_i)
 *
 * When Σ(materiality_i) == 0 → returns 0 for that bucket (matches RollupBuilder).
 * Empty-ticker rows (themed-only) are skipped because they don't belong in
 * per-ticker rollup math.
 */
export function computeWeightedSentByBucket(
  rows: ScoredArticle[],
  bucketKey: (s: ScoredArticle) => string,
): Map<string, number> {
  const grouped = new Map<string, { num: number; den: number }>();
  for (const s of rows) {
    if (!s.ticker) continue;
    const k = `${bucketKey(s)}::${s.ticker}`;
    const cur = grouped.get(k) ?? { num: 0, den: 0 };
    cur.num += s.sentiment * s.materiality;
    cur.den += s.materiality;
    grouped.set(k, cur);
  }
  const out = new Map<string, number>();
  for (const [k, { num, den }] of grouped) {
    out.set(k, den === 0 ? 0 : num / den);
  }
  return out;
}

/**
 * Linear-interpolated percentile over an already-sorted (ascending) array.
 *
 *   rank = (p/100) × (n - 1)
 *   result = sorted[floor(rank)] + frac × (sorted[ceil(rank)] - sorted[floor(rank)])
 *
 * Returns 0 on empty input. p=50 over [0.1, 0.2, 0.3, 0.4, 0.5] -> 0.3.
 * p=95 over the same -> rank=3.8 -> 0.4 + 0.8 × (0.5 - 0.4) = 0.48.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo] ?? 0;
  const frac = rank - lo;
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? 0;
  return loVal + frac * (hiVal - loVal);
}

async function loadScoredWindow(dataDir: string, days: number): Promise<ScoredArticle[]> {
  const store = new JsonlStore<ScoredArticle>(dataDir, "scored-articles");
  const out: ScoredArticle[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const rows = await store.readDay(d);
    out.push(...rows);
  }
  return out;
}

/**
 * Scan recent news-*.jsonl files for any article whose id is in `ids`.
 * Stops early when all requested ids have been found. Defaults to a 14-day
 * lookback (matches our news rotation cadence in practice).
 */
async function loadNewsArticlesByIds(
  dataDir: string,
  ids: string[],
  maxLookbackDays: number,
): Promise<NewsArticle[]> {
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  const store = new JsonlStore<NewsArticle>(dataDir, "news");
  const out: NewsArticle[] = [];
  for (let i = 0; i < maxLookbackDays; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const rows = await store.readDay(d);
    for (const a of rows) {
      if (idSet.has(a.id)) {
        out.push(a);
        idSet.delete(a.id);
        if (idSet.size === 0) return out;
      }
    }
  }
  return out;
}

function emptyReport(
  options: StabilityTestOptions,
  start: number,
  reason: string,
): StabilityTestReport {
  return {
    windowDays: options.days,
    articlesEvaluated: 0,
    rollupRowsEvaluated: 0,
    articleSentDeltas: [],
    rollupSentDeltas: [],
    articleP50: 0,
    articleP95: 0,
    rollupP50: 0,
    rollupP95: 0,
    articleThreshold: options.articleP95Threshold ?? 0.15,
    rollupThreshold: options.rollupP95Threshold ?? 0.08,
    passed: false,
    reason,
    durationMs: Date.now() - start,
  };
}
