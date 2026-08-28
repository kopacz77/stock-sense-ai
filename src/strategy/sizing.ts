/**
 * VIX-regime position sizing (D-06, D-07) — full four-signal-type version
 * (Task 2, generalizing Task 1's single-formula minimal implementation).
 */

import type { StrategyConfig } from "./config.js";
import type { SignalType, VixRegime } from "./types.js";

/**
 * Named fallback used when `config/strategy-config.json`'s
 * `typeSizeModifier` doesn't list a type — the config file only needs to
 * carry overrides (today just `FADE_OVERSHOOT: 0.5`); every other type
 * falls back to this table's `1`.
 */
export const TYPE_SIZE_MODIFIER: Record<SignalType, number> = {
  CATALYST_ANCHORED: 1,
  SENTIMENT_VELOCITY: 1,
  SECTOR_ROTATION_FROM_PM: 1,
  FADE_OVERSHOOT: 0.5,
};

/** `config.regimeSizePct[regime]` — calm 25% / elevated 12.5% / stressed 6.25% by default. */
export function regimeSizePct(regime: VixRegime, config: StrategyConfig): number {
  return config.regimeSizePct[regime];
}

/**
 * `Math.floor(equity × regimeSizePct(regime) × typeModifier × signalSizeModifier)`.
 *
 * `signalSizeModifier` is `RawSignal.sizeModifier` (defaults to 1) — lets a
 * `binary`-direction catalyst halve each of its two opposite-direction legs
 * on top of the type modifier, without a second sizing rule.
 *
 * `equity` comes from `config.assumedEquity` — the M2-02 (Alpaca paper
 * integration) fallback until a real broker-balance field replaces it.
 */
export function suggestSizeUsd(
  regime: VixRegime,
  signalType: SignalType,
  equity: number,
  config: StrategyConfig,
  signalSizeModifier = 1,
): number {
  const pct = regimeSizePct(regime, config);
  const typeModifier = config.typeSizeModifier[signalType] ?? TYPE_SIZE_MODIFIER[signalType];
  return Math.floor(equity * pct * typeModifier * signalSizeModifier);
}

/** `maxSimultaneousPositions × regimeSizePct(regime)` — total portfolio exposure at full position count. */
export function grossExposureMultiple(regime: VixRegime, config: StrategyConfig): number {
  return config.maxSimultaneousPositions * regimeSizePct(regime, config);
}
