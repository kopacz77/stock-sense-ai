/**
 * The signal-module registry (M2-05 Plan 11-05, Task 1).
 *
 * `defaultSignalModules()` is the ONE place a v2 signal type gets added —
 * `StrategyEngine` defaults to this array, and every consumer that wants the
 * real four-type v1 set (the CLI, the live-window backtest) should call this
 * rather than constructing modules by hand.
 */

import type { SignalTypeModule } from "../types.js";
import { CatalystAnchoredModule } from "./catalyst-anchored.js";
import { FadeOvershootModule } from "./fade-overshoot.js";
import { SectorRotationModule } from "./sector-rotation.js";
import { SentimentVelocityModule } from "./sentiment-velocity.js";

export { CatalystAnchoredModule } from "./catalyst-anchored.js";
export { FadeOvershootModule } from "./fade-overshoot.js";
export { SectorRotationModule } from "./sector-rotation.js";
export { SentimentVelocityModule } from "./sentiment-velocity.js";

export interface DefaultSignalModulesOptions {
  /**
   * Injectable clock, forwarded to `FadeOvershootModule` so
   * `hoursSinceOvershoot` (and therefore its score) is reproducible on
   * backtest replay. Every other v1 module is clock-free.
   */
  now?: () => Date;
}

/**
 * The four v1 signal types, in the order `StrategyEngine` iterates them.
 * Their declared `mode`s (`CatalystAnchoredModule`/`SectorRotationModule` ->
 * `"core"`, `SentimentVelocityModule` -> `"gated"`, `FadeOvershootModule` ->
 * `"shadow"`) must match `config/strategy-config.json`'s `signalModes` —
 * `StrategyEngine` asserts this at construction and on every run so the
 * config file and this registry can never silently disagree.
 */
export function defaultSignalModules(
  options: DefaultSignalModulesOptions = {},
): SignalTypeModule[] {
  return [
    new CatalystAnchoredModule(),
    new SectorRotationModule(),
    new SentimentVelocityModule(),
    new FadeOvershootModule({ now: options.now }),
  ];
}
