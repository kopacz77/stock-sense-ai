/**
 * RollupBuilder — M2-04 Plan 10-05
 *
 * Builds the per-ticker-day rollup that becomes M2-05's primary query surface.
 *
 * Inputs (read from disk):
 *   - `data/intel/scored-articles-YYYY-MM-DD.jsonl` (today's scored articles)
 *   - `data/intel/catalyst-flags-*.jsonl` (all catalyst-flag files; events span 60d forward)
 *
 * Inputs (passed in-memory):
 *   - `pmSignals: TickerSignal[]` from PmMappingEngine.mapMarkets()
 *
 * Output:
 *   - `data/intel/ticker-day-summary-YYYY-MM-DD.jsonl` (one row per ticker)
 *   - Returns TickerDaySummary[] for callers that want to consume in-memory.
 *
 * Aggregation:
 *   - weightedSentiment = Σ(sentiment_i × materiality_i) / Σ(materiality_i)
 *     A single high-materiality article correctly dominates a wash of low-materiality routine PR.
 *     When Σ(materiality_i) == 0 (all zero or no articles), returns 0 — no divide-by-zero.
 *   - totalMateriality + articleCount — aggregate counts for transparency.
 *   - themes — sorted-unique union across contributing articles.
 *   - activeCatalystIds — catalysts where ticker ∈ tickers OR ticker ∈ affectedSectors,
 *     filtered to !archived AND expectedDate >= today.
 *   - pmContribution.netScore — sum of contributedScore for all pmSignals filtered to this ticker.
 *     PmMappingEngine has already applied noPp inversion, so signs are final at this layer.
 *
 * Idempotence:
 *   Writing is atomic temp-rename, so reruns produce byte-identical files for the same input.
 *   Tickers are sorted alphabetically; arrays inside each row (themes, activeCatalystIds)
 *   are sorted deterministically; lastScoredArticleId selection ties on scoredAt newest-first.
 *   builtAt is the only non-deterministic field — it's expected to change on rerun.
 *
 * Themed-only rows: ScoredArticle rows with `ticker === ""` are themed metadata for
 * articles without ticker scope. They are NOT included in this rollup (per-ticker
 * query surface). M2-05 may later read scored-articles directly for theme-level queries.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadActiveCatalysts as loadActiveCatalystsShared } from "./catalyst-loader.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type {
  CatalystFlag,
  ScoredArticle,
  TickerDaySummary,
} from "./types.js";
import type { TickerSignal } from "./pm-mapping-engine.js";

export interface RollupBuilderOptions {
  /** Default "./data/intel". */
  dataDir?: string;
}

export class RollupBuilder {
  private readonly dataDir: string;
  private readonly scoredStore: JsonlStore<ScoredArticle>;

  constructor(options: RollupBuilderOptions = {}) {
    this.dataDir = options.dataDir ?? "./data/intel";
    this.scoredStore = new JsonlStore<ScoredArticle>(this.dataDir, "scored-articles");
  }

  /**
   * Build the rollup for `date` (defaults to today's UTC date). Atomic-rewrites
   * the day's `ticker-day-summary-YYYY-MM-DD.jsonl` file.
   *
   * @param date the trading day (UTC) to build for
   * @param pmSignals PM-derived ticker contributions for this day (from PmMappingEngine)
   */
  async buildForDay(
    date: Date = new Date(),
    pmSignals: TickerSignal[] = [],
  ): Promise<TickerDaySummary[]> {
    const dayIso = date.toISOString().split("T")[0]!;
    const scored = await this.scoredStore.readDay(date);
    const activeCatalysts = await this.loadActiveCatalysts(dayIso);

    // Group scored articles by ticker — skip empty ticker (themed rows; not in this rollup).
    const byTicker = new Map<string, ScoredArticle[]>();
    for (const s of scored) {
      if (!s.ticker) continue;
      const arr = byTicker.get(s.ticker) ?? [];
      arr.push(s);
      byTicker.set(s.ticker, arr);
    }

    // Also fold in tickers that have ONLY pmSignals (no article today) — they still get a rollup row.
    for (const sig of pmSignals) {
      if (!byTicker.has(sig.ticker)) byTicker.set(sig.ticker, []);
    }

    const builtAt = new Date().toISOString();
    const summaries: TickerDaySummary[] = [];

    for (const [ticker, articles] of byTicker) {
      const totalMateriality = articles.reduce((acc, a) => acc + a.materiality, 0);
      const weightedSentiment =
        totalMateriality === 0
          ? 0
          : articles.reduce((acc, a) => acc + a.sentiment * a.materiality, 0) / totalMateriality;
      const themes = Array.from(
        new Set(articles.flatMap((a) => a.themes ?? [])),
      ).sort();

      const activeCatalystIds = activeCatalysts
        .filter(
          (c) =>
            (c.tickers ?? []).includes(ticker) ||
            (c.affectedSectors ?? []).includes(ticker),
        )
        .map((c) => c.id)
        .sort();

      const tickerPmSignals = pmSignals.filter((s) => s.ticker === ticker);
      const netScore = tickerPmSignals.reduce((acc, s) => acc + s.contributedScore, 0);

      const lastScoredArticleId =
        articles.length === 0
          ? undefined
          : articles
              .slice()
              .sort((a, b) => Date.parse(b.scoredAt) - Date.parse(a.scoredAt))[0]?.sourceArticleId;

      const summary: TickerDaySummary = {
        date: dayIso,
        ticker,
        weightedSentiment,
        totalMateriality,
        articleCount: articles.length,
        themes,
        activeCatalystIds,
        pmContribution: {
          netScore,
          sources: tickerPmSignals.map((s) => ({
            marketId: s.sourceMarketId,
            eventSlug: s.sourceEventSlug,
            slug: s.sourceSlug,
            movePp: s.movePp,
            direction: s.direction,
            weight: s.weight,
            contributedScore: s.contributedScore,
            volume24hr: s.sourceVolume24hr,
          })),
        },
        builtAt,
      };
      if (lastScoredArticleId !== undefined) {
        summary.lastScoredArticleId = lastScoredArticleId;
      }
      summaries.push(summary);
    }

    summaries.sort((a, b) => a.ticker.localeCompare(b.ticker));
    await this.writeSummary(date, summaries);
    return summaries;
  }

  /**
   * Thin wrapper over the shared `catalyst-loader.ts` scan/dedup/filter —
   * kept so no external caller needs to change. See `loadActiveCatalysts`
   * in `./catalyst-loader.js` for the implementation.
   */
  private async loadActiveCatalysts(dayIso: string): Promise<CatalystFlag[]> {
    return loadActiveCatalystsShared(this.dataDir, dayIso);
  }

  /** Overwrite the day's summary file with atomic temp-rename (idempotent rebuild). */
  private async writeSummary(date: Date, summaries: TickerDaySummary[]): Promise<void> {
    const dayIso = date.toISOString().split("T")[0]!;
    const filePath = path.join(this.dataDir, `ticker-day-summary-${dayIso}.jsonl`);
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    const body =
      summaries.map((s) => JSON.stringify(s)).join("\n") + (summaries.length > 0 ? "\n" : "");
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, filePath);
  }
}
