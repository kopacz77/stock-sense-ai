/**
 * Entry/target/stop computation — full four-signal-type version (Task 2,
 * generalizing Task 1's SECTOR_ROTATION_FROM_PM-only minimal implementation).
 *
 * The stop always uses ATR_5 regardless of which ATR period the target
 * used (CONTEXT.md ### Position Management — "uniform across types, keep
 * losses small"). ATR-derived stops and ATR-derived targets are both
 * clamped (RESEARCH Pitfall 5 — low-priced stocks can otherwise produce
 * absurd multi-dollar stops/targets on a $3 ticker); `pctOfClose` and
 * `absoluteMove` targets are deliberate fixed distances (FDA binary moves,
 * earnings average-historical-move) and are never clamped.
 */

import type { CatalystType } from "../market-intelligence/signal/types.js";
import type { TargetSpec } from "./types.js";

export const ATR_STOP_MULTIPLE = 1.5;
export const MAX_STOP_DISTANCE_PCT = 0.05;
export const MAX_ATR_TARGET_DISTANCE_PCT = 0.15;
export const PULLBACK_ATR_MULTIPLE = 0.5;
export const PULLBACK_FLOOR_PCT = 0.01;

export interface LevelInputs {
  close: number;
  direction: "long" | "short";
  atrByPeriod: Record<3 | 5 | 10, number>;
  entryStyle: "close" | "pullback";
  targetSpec: TargetSpec;
}

export interface ComputedLevels {
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  /** The period the TARGET used. The stop always uses ATR_5 regardless. */
  atrPeriodUsed: 3 | 5 | 10;
  atrValue: number;
}

/** Single shared rounding helper so the CLI and the decision log never disagree by a float epsilon. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLevels(inputs: LevelInputs): ComputedLevels {
  const { close, direction, atrByPeriod, entryStyle, targetSpec } = inputs;

  // RawSignal.direction is typed "long" | "short" only at compile time — a
  // caller mapping a CatalystDirection ("uncertain" | "binary") is
  // responsible for skipping "uncertain" and splitting "binary" into two
  // "long"/"short" signals BEFORE this function ever sees them. This guard
  // defends against an unvalidated value reaching here at runtime (e.g.
  // deserialized JSON that bypassed the type system).
  if (direction !== "long" && direction !== "short") {
    throw new Error(`computeLevels: unexpected direction "${direction as string}"`);
  }

  const dirSign = direction === "long" ? 1 : -1;
  const atr5 = atrByPeriod[5];

  const entryPrice =
    entryStyle === "close"
      ? close
      : direction === "long"
        ? Math.max(close - PULLBACK_ATR_MULTIPLE * atr5, close * (1 - PULLBACK_FLOOR_PCT))
        : Math.min(close + PULLBACK_ATR_MULTIPLE * atr5, close * (1 + PULLBACK_FLOOR_PCT));

  const rawStop = entryPrice - ATR_STOP_MULTIPLE * atr5 * dirSign;
  const stopPrice =
    direction === "long"
      ? Math.max(rawStop, entryPrice * (1 - MAX_STOP_DISTANCE_PCT))
      : Math.min(rawStop, entryPrice * (1 + MAX_STOP_DISTANCE_PCT));

  let targetPrice: number;
  let atrPeriodUsed: 3 | 5 | 10;
  let atrValue: number;

  if (targetSpec.kind === "atr") {
    atrPeriodUsed = targetSpec.period;
    atrValue = atrByPeriod[targetSpec.period];
    const rawTarget = entryPrice + targetSpec.multiple * atrValue * dirSign;
    targetPrice =
      direction === "long"
        ? Math.min(rawTarget, entryPrice * (1 + MAX_ATR_TARGET_DISTANCE_PCT))
        : Math.max(rawTarget, entryPrice * (1 - MAX_ATR_TARGET_DISTANCE_PCT));
  } else if (targetSpec.kind === "pctOfClose") {
    // Deliberate fixed distance (e.g. FDA binary decision) — not clamped.
    atrPeriodUsed = 5;
    atrValue = atr5;
    targetPrice = entryPrice + targetSpec.pct * close * dirSign;
  } else {
    // Deliberate fixed distance (e.g. earnings average-historical-move) — not clamped.
    atrPeriodUsed = 5;
    atrValue = atr5;
    targetPrice = entryPrice + targetSpec.move * dirSign;
  }

  return {
    entryPrice: round2(entryPrice),
    targetPrice: round2(targetPrice),
    stopPrice: round2(stopPrice),
    atrPeriodUsed,
    atrValue,
  };
}

/**
 * Per-CatalystType target table (RESEARCH §4, CONTEXT.md ### Position
 * Management). `dirSign` is the caller-resolved +1/-1 (from
 * `catalyst.direction`), not a `"long"|"short"` string — CATALYST_ANCHORED
 * resolves direction from `CatalystDirection`, which has extra states
 * ("uncertain"/"binary") this function does not need to know about.
 */
export function targetPriceForCatalyst(
  catalystType: CatalystType,
  close: number,
  dirSign: 1 | -1,
  atrByPeriod: Record<3 | 5 | 10, number>,
  avgHistoricalEarningsMove?: number,
): number {
  const atr5 = atrByPeriod[5];

  switch (catalystType) {
    case "fda":
    case "fda_pdufa":
      return round2(close + 0.25 * close * dirSign);
    case "earnings":
      return round2(close + (avgHistoricalEarningsMove ?? 2 * atr5) * dirSign);
    case "treasury_auction":
      return round2(close + 1 * atr5 * dirSign);
    default:
      // ma, lawsuit, regulatory, product, guidance, geopolitical, other,
      // fomc, cpi, nfp, pce, gdp, ism, jolts, retail_sales, macro_print,
      // opec, eia_petroleum — the generic default (§0's real distribution
      // shows product/lawsuit/ma dominate, not FOMC/FDA).
      return round2(close + 2 * atr5 * dirSign);
  }
}
