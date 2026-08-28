/**
 * SENTIMENT_VELOCITY signal module (M2-05 Plan 11-04, Task 2).
 *
 * Gated (D-02): ranks and sizes only when scored-article coverage exists
 * for the trailing 3-day window (`src/strategy/coverage.ts`). When
 * coverage is missing this type declines to run entirely with a stated
 * reason — it never emits an empty candidate list and lets that read as
 * "sentiment didn't move" (that IS the exact failure mode the real
 * 2026-07-27 -> 08-27 scorer outage would have produced, RESEARCH §9
 * Pitfall 6).
 *
 * ## Score formula (D-03, CONTEXT.md ### Ranking, verbatim)
 *
 *   materialityFloor = min(today.totalMateriality, 2.0) / 2.0
 *   score = min(1, |today.weightedSentiment - prior.weightedSentiment| * materialityFloor)
 *
 * ## Worked example
 *
 *   today    = { weightedSentiment: 0.6, totalMateriality: 2.0, articleCount: 4 }
 *   prior    = { weightedSentiment: -0.1 }  (usable — totalMateriality > 0)
 *   delta            = 0.6 - (-0.1)         = 0.7
 *   materialityFloor = min(2.0, 2.0) / 2.0  = 1.0
 *   score            = min(1, 0.7 * 1.0)    = 0.7
 *   direction = sign(delta) = "long"
 *
 * ## Model-mix caveat (RESEARCH §1)
 *
 * The 3-day delta assumes a stable scoring distribution across `today` and
 * `prior`. `ScoredArticle.scorerModel` (e.g. `"qwen/qwen3-14b"`) will
 * differ across days if the operator switches LLM providers mid-corpus
 * (e.g. to DeepSeek's remote API, per STATE.md's open provider decision).
 * This phase keeps the local provider and does not build provider-
 * switching logic — the caveat is recorded here for a future reader of the
 * math, not mitigated in code. `scorerModel` is recorded per record on
 * `ScoredArticle`, so a mixed window stays filterable if this ever matters.
 */

import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import { hasTrailingCoverage } from "../coverage.js";
import { loadRollupsForRange } from "../substrate.js";
import type { RawSignal, SignalContext, SignalTypeModule } from "../types.js";

/** How many trailing days SENTIMENT_VELOCITY's coverage gate requires. */
const GATE_WINDOW_DAYS = 3;
/** Nominal comparison window — "today" vs. "3 days ago". */
const NOMINAL_DELTA_DAYS = 3;
/** Pitfall 6: walk back up to 7 calendar days for a non-empty prior. */
const MAX_WALKBACK_DAYS = 7;
/** History load window — nominal delta (3d) + max walkback (7d) rounded up. */
const HISTORY_LOAD_DAYS = 10;

/** Pure per-type score function (D-03), exported standalone for unit testing. */
export function scoreSentimentVelocity(
  today: TickerDaySummary,
  prior: TickerDaySummary | undefined,
): number {
  if (!prior || today.totalMateriality === 0) return 0;
  const delta = today.weightedSentiment - prior.weightedSentiment;
  const materialityFloor = Math.min(today.totalMateriality, 2.0) / 2.0;
  return Math.min(1, Math.abs(delta) * materialityFloor);
}

/**
 * Walks backward from `targetIso` up to `maxWalkbackDays` calendar days
 * (inclusive of `targetIso` itself) looking for a rollup with
 * `totalMateriality > 0` — i.e. a day the scorer actually ran, not a
 * PM-only outage row. `history` should already be filtered to one ticker.
 * Returns `undefined` when no usable day exists in the window (Pitfall 6).
 */
export function findUsablePrior(
  history: TickerDaySummary[],
  targetIso: string,
  maxWalkbackDays: number,
): TickerDaySummary | undefined {
  const byDate = new Map(history.map((r) => [r.date, r]));
  const targetMs = Date.parse(`${targetIso}T00:00:00.000Z`);

  for (let offset = 0; offset < maxWalkbackDays; offset++) {
    const candidateIso = new Date(targetMs - offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const candidate = candidateIso ? byDate.get(candidateIso) : undefined;
    if (candidate && candidate.totalMateriality > 0) return candidate;
  }

  return undefined;
}

function isoDaysBefore(asOfDate: string, days: number): string {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00.000Z`);
  return new Date(asOfMs - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? asOfDate;
}

export class SentimentVelocityModule implements SignalTypeModule {
  readonly signalType = "SENTIMENT_VELOCITY" as const;
  readonly mode = "gated" as const;

  /**
   * Delegates to `hasTrailingCoverage` and returns its `{ ok, reason }`
   * verbatim. The engine calls this before `generate` and, when `ok` is
   * false, must record the reason in `StrategyRunResult.skippedTypes`
   * instead of calling `generate` at all — `generate` never signals a
   * coverage hole on its own (D-02: never a silent zero-delta).
   */
  async gate(ctx: SignalContext): Promise<{ ok: boolean; reason: string }> {
    const { ok, reason } = await hasTrailingCoverage(
      ctx.intelDataDir,
      ctx.asOfDate,
      GATE_WINDOW_DAYS,
    );
    return { ok, reason };
  }

  async generate(ctx: SignalContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    const startIso = isoDaysBefore(ctx.asOfDate, HISTORY_LOAD_DAYS);
    const historyByDay = await loadRollupsForRange(ctx.intelDataDir, startIso, ctx.asOfDate);
    const allHistory = Array.from(historyByDay.values()).flat();
    const targetIso = isoDaysBefore(ctx.asOfDate, NOMINAL_DELTA_DAYS);

    for (const today of ctx.rollups) {
      const tickerHistory = allHistory.filter((r) => r.ticker === today.ticker);
      const prior = findUsablePrior(tickerHistory, targetIso, MAX_WALKBACK_DAYS);
      const score = scoreSentimentVelocity(today, prior);
      // score === 0 covers: no usable prior, today.totalMateriality === 0,
      // and delta exactly 0 — none of these are tradeable.
      if (!prior || score === 0) continue;

      const delta = today.weightedSentiment - prior.weightedSentiment;
      const direction: "long" | "short" = delta > 0 ? "long" : "short";
      const spanDays = Math.round(
        (Date.parse(`${today.date}T00:00:00.000Z`) - Date.parse(`${prior.date}T00:00:00.000Z`)) /
          (24 * 60 * 60 * 1000),
      );
      const topTheme = today.themes[0];

      const rationale =
        `${today.ticker} sentiment moved ${prior.weightedSentiment.toFixed(2)} -> ` +
        `${today.weightedSentiment.toFixed(2)} over ${spanDays} days (${today.articleCount} ` +
        `articles today${topTheme ? `, theme: ${topTheme}` : ""}) -> score ${score.toFixed(2)} ${direction}`;

      signals.push({
        signalType: "SENTIMENT_VELOCITY",
        ticker: today.ticker,
        score,
        direction,
        rationale,
        entryStyle: "pullback",
        // 2.5x ATR_5 target over the CONTEXT-locked 5-10 day horizon band
        // (RESEARCH §4) — timeHorizonDays is the midpoint, 7, matching
        // SectorRotationModule's rounding-down-of-midpoint convention.
        targetSpec: { kind: "atr", period: 5, multiple: 2.5 },
        timeHorizonDays: 7,
        sourceArticleIds: today.lastScoredArticleId ? [today.lastScoredArticleId] : [],
        sourcePmMarkets: [],
      });
    }

    return signals;
  }
}
