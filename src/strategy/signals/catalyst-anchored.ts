/**
 * CATALYST_ANCHORED signal module (M2-05 Plan 11-03, Task 2).
 *
 * Pre-positions before a scheduled or emerging catalyst on the M2-04 60-day
 * calendar — the signal type closest to the operator's COVID-era edge of
 * anticipating a known event and positioning before it. Core, ranked and
 * sized alongside SECTOR_ROTATION_FROM_PM in v1 (D-02).
 *
 * ## Score formula (D-03, CONTEXT.md ### Ranking, verbatim)
 *
 *   score = min(1, (magnitudePrior / 5) * confidence)
 *
 * Nothing else — no operator weight, no cross-type normalization (D-04
 * forbids type weights in v1).
 *
 * ## Worked example (a real 2026 FOMC statement day, illustrating the
 * `affectedSectors[]`-only expansion — see `config/fomc-schedule-seed.json`
 * for the raw seed entry; `direction` shown here is the *refined* state
 * after `CatalystRefiner` has updated it from the seed's default
 * "uncertain" based on scored-article evidence, not the seed's own value)
 *
 *   catalyst = { id: "fomc-2026-06-17", type: "fomc", tickers: [],
 *     affectedSectors: ["TLT","IEF","XLF","IWM"], expectedDate: "2026-06-17",
 *     expectedTimeEt: "14:00", magnitudePrior: 5, direction: "binary",
 *     confidence: 0.6, source: "calendar:fomc-seed" }
 *   score            = min(1, (5/5) * 0.6)              = 0.6
 *   catalystTickers  = ["TLT","IEF","XLF","IWM"]          // affectedSectors only, tickers[] empty
 *   direction binary -> 2 legs per ticker (long @0.5, short @0.5) = 8 RawSignals
 *   asOfDate = "2026-06-10" -> daysUntil = 7 -> timeHorizonDays = 8
 *   targetSpec       = { kind: "atr", period: 5, multiple: 3 }    // fomc uses the generic default (3×ATR_5 since 2026-08-30, D-25)
 *   rationale states "scheduled" (source starts with "calendar:")
 */

import { loadActiveCatalysts } from "../../market-intelligence/signal/catalyst-loader.js";
import type { CatalystFlag } from "../../market-intelligence/signal/types.js";
import type { RawSignal, SignalContext, SignalTypeModule, TargetSpec } from "../types.js";

/** Pure per-type score function (D-03), exported standalone for unit testing. */
export function scoreCatalyst(catalyst: CatalystFlag): number {
  return Math.min(1, (catalyst.magnitudePrior / 5) * catalyst.confidence);
}

/**
 * Union of `tickers[]` and `affectedSectors[]`, upper-cased and
 * de-duplicated. A macro event with empty `tickers` and a populated
 * `affectedSectors` (e.g. an FOMC flag -> `["TLT","IEF","XLF","IWM"]`)
 * expands into one candidate per macro-proxy ETF — this is how a Fed
 * decision reaches a tradeable ticker.
 */
export function catalystTickers(catalyst: CatalystFlag): string[] {
  const all = [...catalyst.tickers, ...(catalyst.affectedSectors ?? [])];
  return Array.from(new Set(all.map((t) => t.toUpperCase())));
}

/**
 * Whole-day difference between `expectedDate` and `asOfDate` (date part
 * only — a full ISO timestamp on either side is compared on its date
 * prefix). `daysUntil(sameDay, sameDay) === 0`.
 */
export function daysUntil(expectedDate: string, asOfDate: string): number {
  const expectedDay = expectedDate.split("T")[0] ?? expectedDate;
  const asOfDay = asOfDate.split("T")[0] ?? asOfDate;
  const expectedMs = Date.parse(`${expectedDay}T00:00:00.000Z`);
  const asOfMs = Date.parse(`${asOfDay}T00:00:00.000Z`);
  return Math.round((expectedMs - asOfMs) / (24 * 60 * 60 * 1000));
}

/**
 * Per-`CatalystType` `TargetSpec` table (D-08, RESEARCH §4). `earnings`
 * prefers a supplied average-historical-earnings-move when the catalyst
 * carries one in `sourceMeta.avgHistoricalMove` (no producer populates this
 * today — it is a forward-compatible hook, not a live path — so `earnings`
 * currently always falls back to the generic `3 * ATR_5` in practice — widened from 2× on 2026-08-30 so the gross R:R (3/1.5 = 2.0) clears the 1.5 net cost hurdle, D-25).
 */
function targetSpecForCatalyst(catalyst: CatalystFlag): TargetSpec {
  switch (catalyst.type) {
    case "fda":
    case "fda_pdufa":
      return { kind: "pctOfClose", pct: 0.25 };
    case "treasury_auction":
      return { kind: "atr", period: 5, multiple: 1 };
    case "earnings": {
      const avgMove = catalyst.sourceMeta?.avgHistoricalMove;
      if (typeof avgMove === "number" && Number.isFinite(avgMove)) {
        return { kind: "absoluteMove", move: avgMove };
      }
      return { kind: "atr", period: 5, multiple: 3 };
    }
    default:
      // ma, lawsuit, regulatory, product, guidance, geopolitical, other,
      // fomc, cpi, nfp, pce, gdp, ism, jolts, retail_sales, macro_print,
      // opec, eia_petroleum — the generic default. RESEARCH §0's real
      // distribution shows product/lawsuit/ma dominate the real corpus,
      // not FOMC/FDA, so this default path is the majority case.
      return { kind: "atr", period: 5, multiple: 3 };
  }
}

/** "scheduled" for a `calendar:`-sourced flag, "emerging" for `article:`. */
function provenanceWord(source: CatalystFlag["source"]): "scheduled" | "emerging" {
  return source.startsWith("calendar:") ? "scheduled" : "emerging";
}

function rationaleFor(catalyst: CatalystFlag, direction: "long" | "short", score: number): string {
  return (
    `${catalyst.type} catalyst (${provenanceWord(catalyst.source)}, ${catalyst.source}) ` +
    `expected ${catalyst.expectedDate}, magnitude ${catalyst.magnitudePrior}/5, ` +
    `confidence ${catalyst.confidence.toFixed(2)} -> score ${score.toFixed(2)} ${direction}`
  );
}

/** One (ticker × direction) leg before same-type collision dedup. */
interface PendingSignal {
  raw: RawSignal;
  /** `${ticker}|${direction}` — the within-type collision key. */
  key: string;
}

export class CatalystAnchoredModule implements SignalTypeModule {
  readonly signalType = "CATALYST_ANCHORED" as const;
  readonly mode = "core" as const;

  async generate(ctx: SignalContext): Promise<RawSignal[]> {
    const catalysts = await loadActiveCatalysts(ctx.intelDataDir, ctx.asOfDate);
    const pending: PendingSignal[] = [];

    for (const catalyst of catalysts) {
      // "uncertain" is a real refined state (the default for a freshly
      // seeded scheduled event before any article has weighed in) — it
      // means the direction genuinely isn't known yet, so nothing is
      // tradeable. "binary" is the opposite: direction IS known to be
      // one of two outcomes, just not which — that's the two-leg case.
      if (catalyst.direction === "uncertain") continue;

      const tickers = catalystTickers(catalyst);
      if (tickers.length === 0) continue;

      const score = scoreCatalyst(catalyst);
      const timeHorizonDays = daysUntil(catalyst.expectedDate, ctx.asOfDate) + 1;
      const targetSpec = targetSpecForCatalyst(catalyst);

      const legs: Array<{ direction: "long" | "short"; sizeModifier: number }> =
        catalyst.direction === "binary"
          ? [
              { direction: "long", sizeModifier: 0.5 },
              { direction: "short", sizeModifier: 0.5 },
            ]
          : [
              {
                direction: catalyst.direction === "up" ? "long" : "short",
                sizeModifier: 1,
              },
            ];

      for (const ticker of tickers) {
        for (const leg of legs) {
          const raw: RawSignal = {
            signalType: "CATALYST_ANCHORED",
            ticker,
            score,
            direction: leg.direction,
            rationale: rationaleFor(catalyst, leg.direction, score),
            entryStyle: "close", // a catalyst play must be in before the event — never waits for a pullback
            targetSpec,
            timeHorizonDays,
            sizeModifier: leg.sizeModifier,
            sourceArticleIds: [],
            sourcePmMarkets: [],
            sourceCatalystId: catalyst.id,
          };
          pending.push({ raw, key: `${ticker}|${leg.direction}` });
        }
      }
    }

    return dedupeSameTypeCollisions(pending);
  }
}

/**
 * Within-type same-(ticker,direction) collision dedup — two different
 * catalysts both pointing the same ticker the same direction (e.g. two
 * separate `product` rumors both bullish NVDA). Cross-*type* collisions
 * (a CATALYST_ANCHORED candidate vs. a SECTOR_ROTATION_FROM_PM candidate
 * on the same ticker) are the engine's job in 11-05; this function only
 * ever sees CATALYST_ANCHORED's own output.
 *
 * Keeps the higher score; on an exact score tie, the nearer expectedDate
 * (encoded as the smaller `timeHorizonDays` — horizon grows monotonically
 * with distance from `asOfDate` for a fixed `asOfDate`). The dropped
 * catalyst's id is appended to the kept signal's rationale so no evidence
 * disappears.
 */
function dedupeSameTypeCollisions(pending: PendingSignal[]): RawSignal[] {
  const byKey = new Map<string, PendingSignal>();

  for (const candidate of pending) {
    const existing = byKey.get(candidate.key);
    if (!existing) {
      byKey.set(candidate.key, candidate);
      continue;
    }

    const existingWins =
      existing.raw.score > candidate.raw.score ||
      (existing.raw.score === candidate.raw.score &&
        existing.raw.timeHorizonDays <= candidate.raw.timeHorizonDays);

    const winner = existingWins ? existing : candidate;
    const loser = existingWins ? candidate : existing;

    byKey.set(candidate.key, {
      key: candidate.key,
      raw: {
        ...winner.raw,
        rationale: `${winner.raw.rationale} (also matched by ${loser.raw.sourceCatalystId ?? "unknown"}, dropped as lower/tied-and-farther)`,
      },
    });
  }

  return Array.from(byKey.values()).map((c) => c.raw);
}
