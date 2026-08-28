/**
 * SECTOR_ROTATION_FROM_PM signal module (M2-05 Plan 11-02 Task 1 — the
 * phase tracer's one signal type).
 *
 * Translates a ticker's PM-derived netScore — already computed by
 * `PmMappingEngine` and persisted on `TickerDaySummary.pmContribution` (see
 * `src/market-intelligence/signal/pm-mapping-engine.ts`) — into a
 * directional, scored candidate. Pure macro-driven: no article/catalyst
 * input, unaffected by the LLM scorer outage.
 *
 * ## Score formula (D-03, CONTEXT.md ### Ranking, verbatim)
 *
 *   ppNorm  = min(1, Σ|movePp × weight| / 10)      // caps at a 10pp-equivalent move
 *   volNorm = totalVolume > 0 ? min(1, log10(totalVolume) / 7) : 0  // caps at $10M volume
 *   score   = ppNorm × volNorm
 *
 * ## Worked example (M2-04's canonical Iran-ceasefire fixture)
 *
 *   rollup.pmContribution.sources = [{ slug: "iran-ceasefire-continues-through",
 *     movePp: -4, direction: "long", weight: 1.0, volume24hr: 2_000_000, ... }]
 *   ppNorm  = min(1, |-4 × 1.0| / 10)        = 0.4
 *   volNorm = min(1, log10(2_000_000) / 7)   = min(1, 6.301 / 7) ≈ 0.90
 *   score   = 0.4 × 0.90                     ≈ 0.36
 *   direction = sign(netScore) = sign(+4)    = "long"
 */

import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import type { RawSignal, SignalContext, SignalTypeModule } from "../types.js";

/** Pure per-type score function, exported standalone for unit testing (D-03). */
export function scoreSectorRotation(rollup: TickerDaySummary): number {
  const sources = rollup.pmContribution.sources;
  if (sources.length === 0) return 0;

  const totalMovePp = sources.reduce((acc, s) => acc + Math.abs(s.movePp * s.weight), 0);
  const totalVolume = sources.reduce((acc, s) => acc + s.volume24hr, 0);

  const ppNorm = Math.min(1, totalMovePp / 10);
  const volNorm = totalVolume > 0 ? Math.min(1, Math.log10(totalVolume) / 7) : 0;

  return ppNorm * volNorm;
}

export class SectorRotationModule implements SignalTypeModule {
  readonly signalType = "SECTOR_ROTATION_FROM_PM" as const;
  readonly mode = "core" as const;

  async generate(ctx: SignalContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    for (const rollup of ctx.rollups) {
      const { netScore, sources } = rollup.pmContribution;
      // A netScore of exactly 0 or an empty sources[] emits no signal —
      // there is nothing directional to trade.
      if (sources.length === 0 || netScore === 0) continue;

      const score = scoreSectorRotation(rollup);
      const direction: "long" | "short" = netScore > 0 ? "long" : "short";

      const topSource = [...sources].sort(
        (a, b) => Math.abs(b.contributedScore) - Math.abs(a.contributedScore),
      )[0];
      if (!topSource) continue;

      const biasWord = direction === "long" ? "bullish" : "bearish";
      const signedMovePp = topSource.movePp > 0 ? `+${topSource.movePp}` : `${topSource.movePp}`;
      const signedNet = netScore > 0 ? `+${netScore.toFixed(2)}` : netScore.toFixed(2);
      const rationale =
        `${topSource.slug} moved ${signedMovePp}pp (vol $${Math.round(topSource.volume24hr).toLocaleString()}), ` +
        `net PM score ${signedNet} → ${biasWord} ${rollup.ticker}`;

      signals.push({
        signalType: "SECTOR_ROTATION_FROM_PM",
        ticker: rollup.ticker,
        score,
        direction,
        rationale,
        entryStyle: "close",
        targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
        timeHorizonDays: 12, // midpoint of CONTEXT's 10-15 day sector-rotation horizon
        sourceArticleIds: [],
        sourcePmMarkets: sources.map((s) => ({
          marketId: s.marketId,
          slug: s.slug,
          movePp: s.movePp,
        })),
      });
    }

    return signals;
  }
}
