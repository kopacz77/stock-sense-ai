/**
 * FADE_OVERSHOOT signal module (M2-05 Plan 11-04, Task 3).
 *
 * Shadow-only in v1 (D-02): computes counter-trend overshoot candidates and
 * writes them to the decision log with `mode: "shadow"`, but never enters
 * the top-5 ranking and never receives a size. This is CONTEXT's "expert
 * mode" framing — the operator asked to see counter-trend ideas, so the
 * system surfaces them, but refuses to let a fade idea consume real risk
 * in v1 while evidence accumulates for a v2 promotion decision.
 *
 * This module deliberately has NO IMPORT from `sizing.ts` — `mode: "shadow"`
 * plus zero code path to a dollar size are two of the three independent
 * barriers (11-05's engine forcing `suggestedSizeUsd: null` for shadow
 * candidates is the third) that keep a counter-trend idea from reaching a
 * real position (threat T-11-04-03).
 *
 * ## Score formula (D-03, CONTEXT.md ### Ranking, verbatim)
 *
 *   magnitude    = min(1, |overshootPp| / 15)          // caps at 15pp
 *   recencyDecay = max(0.3, 1.0 - 0.7 * (hoursSinceOvershoot / 24))  // floors at 0.3
 *   score        = magnitude * recencyDecay
 *
 * ## Worked example
 *
 *   overshootPp = 15, hoursSinceOvershoot = 0
 *   magnitude    = min(1, 15/15)       = 1
 *   recencyDecay = max(0.3, 1.0 - 0)   = 1.0
 *   score        = 1
 *   direction = OPPOSITE of overshoot sign — a positive overshoot -> "short"
 */

import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import { loadRollupsForRange } from "../substrate.js";
import type { RawSignal, SignalContext, SignalTypeModule } from "../types.js";

const MAGNITUDE_CAP_PP = 15;
const RECENCY_FLOOR = 0.3;
const RECENCY_DECAY_HOURS = 24;
const RECENCY_DECAY_RATE = 0.7;
const MIN_TRAILING_DAYS = 3;
const TRAILING_WINDOW_DAYS = 7;
const MAX_HOURS_SINCE_OVERSHOOT = 48;

/** Pure per-type score function (D-03), exported standalone for unit testing. */
export function scoreFadeOvershoot(overshootPp: number, hoursSinceOvershoot: number): number {
  const magnitude = Math.min(1, Math.abs(overshootPp) / MAGNITUDE_CAP_PP);
  const recencyDecay = Math.max(
    RECENCY_FLOOR,
    1.0 - RECENCY_DECAY_RATE * (hoursSinceOvershoot / RECENCY_DECAY_HOURS),
  );
  return magnitude * recencyDecay;
}

function signOf(direction: "long" | "short"): 1 | -1 {
  return direction === "long" ? 1 : -1;
}

/**
 * The signed twin of the aggregate magnitude `scoreSectorRotation` uses:
 * `sum(movePp * signOf(direction) * weight)` over `pmContribution.sources`
 * for one day's rollup.
 */
function signedPmMove(rollup: TickerDaySummary): number {
  return rollup.pmContribution.sources.reduce(
    (acc, s) => acc + s.movePp * signOf(s.direction) * s.weight,
    0,
  );
}

/**
 * Today's signed aggregate PM move minus the mean of the same measure over
 * `trailing` (the days strictly before today, most recent first or in any
 * order — only the values matter). Returns 0 when fewer than 3 trailing
 * days are available — an overshoot needs a baseline, and inventing one
 * from fewer than 3 points would be a fabricated signal.
 */
export function computeOvershootPp(today: TickerDaySummary, trailing: TickerDaySummary[]): number {
  if (trailing.length < MIN_TRAILING_DAYS) return 0;
  const todayMeasure = signedPmMove(today);
  const trailingMean = trailing.reduce((acc, r) => acc + signedPmMove(r), 0) / trailing.length;
  return todayMeasure - trailingMean;
}

function hoursSinceBuilt(now: Date, builtAt: string): number {
  const hours = (now.getTime() - Date.parse(builtAt)) / (60 * 60 * 1000);
  return Math.max(0, Math.min(MAX_HOURS_SINCE_OVERSHOOT, hours));
}

export interface FadeOvershootModuleOptions {
  /** Injectable clock — defaults to the real clock. Tests and the
   * live-window backtest inject a deterministic one so `hoursSinceOvershoot`
   * (and therefore `score`) is reproducible on replay. */
  now?: () => Date;
}

export class FadeOvershootModule implements SignalTypeModule {
  readonly signalType = "FADE_OVERSHOOT" as const;
  readonly mode = "shadow" as const;

  private readonly now: () => Date;

  constructor(options: FadeOvershootModuleOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async generate(ctx: SignalContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    const asOfMs = Date.parse(`${ctx.asOfDate}T00:00:00.000Z`);
    const dayBeforeIso =
      new Date(asOfMs - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? ctx.asOfDate;
    const startIso =
      new Date(asOfMs - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ??
      ctx.asOfDate;
    const historyByDay = await loadRollupsForRange(ctx.intelDataDir, startIso, dayBeforeIso);
    const trailingAll = Array.from(historyByDay.values()).flat();

    for (const today of ctx.rollups) {
      if (today.pmContribution.sources.length === 0) continue;

      const trailing = trailingAll.filter((r) => r.ticker === today.ticker);
      const overshootPp = computeOvershootPp(today, trailing);
      if (overshootPp === 0) continue;

      const hoursSinceOvershoot = hoursSinceBuilt(this.now(), today.builtAt);
      const score = scoreFadeOvershoot(overshootPp, hoursSinceOvershoot);
      if (score === 0) continue;

      // Counter-trend: the emitted direction is the OPPOSITE of the
      // overshoot sign — a positive overshoot (moved too far up) emits a
      // "short" fade candidate.
      const direction: "long" | "short" = overshootPp > 0 ? "short" : "long";

      const topSource = [...today.pmContribution.sources].sort(
        (a, b) => Math.abs(b.contributedScore) - Math.abs(a.contributedScore),
      )[0];
      const marketLabel = topSource?.slug ?? "PM aggregate";
      const signedOvershoot =
        overshootPp > 0 ? `+${overshootPp.toFixed(2)}` : overshootPp.toFixed(2);

      const overshootClause = `${today.ticker} overshot ${signedOvershoot}pp against its 7-day PM mean (driven by ${marketLabel}), ${hoursSinceOvershoot.toFixed(1)}h since the reading -> score ${score.toFixed(2)} ${direction}.`;
      const shadowClause =
        "SHADOW MODE: v1 counter-trend evidence-accumulation observation only — never ranked, sized, or traded until v2 promotes FADE_OVERSHOOT to core.";
      const rationale = `${overshootClause} ${shadowClause}`;

      signals.push({
        signalType: "FADE_OVERSHOOT",
        ticker: today.ticker,
        score,
        direction,
        rationale,
        entryStyle: "close",
        targetSpec: { kind: "atr", period: 3, multiple: 1.5 },
        timeHorizonDays: 3,
        // No sizeModifier set — sizing is the engine's job, and 11-05
        // forces suggestedSizeUsd: null for every shadow candidate.
        sourceArticleIds: [],
        sourcePmMarkets: today.pmContribution.sources.map((s) => ({
          marketId: s.marketId,
          slug: s.slug,
          movePp: s.movePp,
        })),
      });
    }

    return signals;
  }
}
