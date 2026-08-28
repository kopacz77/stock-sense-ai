/**
 * Entry/target/stop computation.
 *
 * Task 1 (this file's origin) ships only what SECTOR_ROTATION_FROM_PM
 * needs: `entryStyle: "close"` and an `{ kind: "atr" }` target. Task 2
 * generalizes this to all four signal types (pullback entries, the
 * per-catalyst target table, and the Pitfall-5 clamps) — the
 * `LevelInputs`/`ComputedLevels` shape here is stable and will not change,
 * only the internals grow.
 */

import type { TargetSpec } from "./types.js";

export const ATR_STOP_MULTIPLE = 1.5;

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

export function computeLevels(inputs: LevelInputs): ComputedLevels {
  const { close, direction, atrByPeriod, targetSpec } = inputs;
  const dirSign = direction === "long" ? 1 : -1;

  // Task 1 only wires entryStyle "close" (SECTOR_ROTATION_FROM_PM's style);
  // "pullback" entries are Task 2's SENTIMENT_VELOCITY/CATALYST concern —
  // `inputs.entryStyle` is intentionally not read yet.
  const entryPrice = close;

  const atr5 = atrByPeriod[5];
  const stopPrice = entryPrice - ATR_STOP_MULTIPLE * atr5 * dirSign;

  let targetPrice: number;
  let atrPeriodUsed: 3 | 5 | 10;
  let atrValue: number;

  if (targetSpec.kind === "atr") {
    atrPeriodUsed = targetSpec.period;
    atrValue = atrByPeriod[targetSpec.period];
    targetPrice = entryPrice + targetSpec.multiple * atrValue * dirSign;
  } else if (targetSpec.kind === "pctOfClose") {
    atrPeriodUsed = 5;
    atrValue = atr5;
    targetPrice = entryPrice + targetSpec.pct * close * dirSign;
  } else {
    atrPeriodUsed = 5;
    atrValue = atr5;
    targetPrice = entryPrice + targetSpec.move * dirSign;
  }

  return { entryPrice, targetPrice, stopPrice, atrPeriodUsed, atrValue };
}
