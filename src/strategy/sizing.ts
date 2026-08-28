/**
 * VIX-regime position sizing (D-06, D-07).
 *
 * Task 1 (this file's origin) ships the single formula every signal type
 * uses. Task 2 adds `TYPE_SIZE_MODIFIER`/`grossExposureMultiple` for the
 * full four-type table; the `suggestSizeUsd` signature here is stable.
 */

import type { StrategyConfig } from "./config.js";
import type { SignalType, VixRegime } from "./types.js";

/**
 * `Math.floor(equity × regimeSizePct[regime] × typeSizeModifier[signalType])`.
 * FADE_OVERSHOOT is configured at 50% (D-07) — present and usable even
 * though v1 never sizes a shadow candidate.
 */
export function suggestSizeUsd(
  regime: VixRegime,
  signalType: SignalType,
  equity: number,
  config: StrategyConfig,
): number {
  const regimePct = config.regimeSizePct[regime];
  const typeModifier = config.typeSizeModifier[signalType] ?? 1;
  return Math.floor(equity * regimePct * typeModifier);
}
