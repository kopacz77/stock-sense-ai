/**
 * Strategy engine configuration.
 *
 * `StrategyConfig` mirrors `config/strategy-config.json` exactly.
 * `loadStrategyConfig` reads the on-disk file, shallow-merges it over
 * `DEFAULT_STRATEGY_CONFIG`, and validates the values that would otherwise
 * silently corrupt sizing/ranking math if malformed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Jurisdiction, SignalMode, SignalType, VixRegime } from "./types.js";

/**
 * After-tax/after-fees net-hurdle cost model config (Plan 11-09, D-23/D-24).
 * `marginalRatePct` and `capitalGainsInclusionPct` both default to `null` —
 * the shipped configuration applies NO tax haircut at all; the engine never
 * guesses the operator's tax bracket. See `src/strategy/costs.ts` for how
 * this combines with the active `config/tax-profiles.json` profile.
 */
export interface CostsConfig {
  jurisdiction: Jurisdiction;
  /** Operator-set combined marginal tax rate (percent), never inferred. `null` = no tax haircut applied. */
  marginalRatePct: number | null;
  /** Optional override of the active profile's dated inclusion rate (percent). `null` = use the profile's own value. */
  capitalGainsInclusionPct: number | null;
  /** Per-trade commission in USD (round-trip = 2x this). */
  perTradeFeeUsd: number;
  /** Spread/slippage in basis points, applied per side (2x round-trip). */
  spreadSlippageBps: number;
  /** FX conversion spread in basis points, applied only when the active profile's `fxApplies` is true (round-trip). */
  fxSpreadBps: number;
  /** Minimum after-tax-reward ÷ pre-tax-risk a candidate must clear to rank. */
  minRewardRisk: number;
  /** Opt-in toggle for the US Net Investment Income Tax leg — never inferred from any other field. */
  niitEnabled: boolean;
  /** Holding period in days; selects long-term tax treatment where the active profile offers it. `null` = short-term/default. */
  holdingPeriodDays: number | null;
  /** Path to `config/tax-profiles.json` (or a test fixture). */
  taxProfilesPath: string;
}

export interface StrategyConfig {
  version: number;
  lastUpdated: string;
  addedBy: string;
  assumedEquity: number;
  scoreFloor: number;
  maxCandidatesPerDay: number;
  subThresholdCount: number;
  maxSimultaneousPositions: number;
  vixThresholds: { calmBelow: number; stressedAbove: number };
  regimeSizePct: Record<VixRegime, number>;
  typeSizeModifier: Partial<Record<SignalType, number>>;
  signalModes: Record<SignalType, SignalMode>;
  intelDataDir: string;
  strategyDataDir: string;
  costs: CostsConfig;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  version: 1,
  lastUpdated: "2026-08-27",
  addedBy: "manual-2026-08-27",
  assumedEquity: 7500,
  scoreFloor: 0.4,
  maxCandidatesPerDay: 5,
  subThresholdCount: 3,
  maxSimultaneousPositions: 4,
  vixThresholds: { calmBelow: 15, stressedAbove: 25 },
  regimeSizePct: { calm: 0.25, elevated: 0.125, stressed: 0.0625 },
  typeSizeModifier: { FADE_OVERSHOOT: 0.5 },
  signalModes: {
    CATALYST_ANCHORED: "core",
    SECTOR_ROTATION_FROM_PM: "core",
    SENTIMENT_VELOCITY: "gated",
    FADE_OVERSHOOT: "shadow",
  },
  intelDataDir: "./data/intel",
  strategyDataDir: "./data/strategy",
  costs: {
    jurisdiction: "ON-CA",
    marginalRatePct: null,
    capitalGainsInclusionPct: null,
    perTradeFeeUsd: 0,
    spreadSlippageBps: 5,
    fxSpreadBps: 150,
    minRewardRisk: 1.5,
    niitEnabled: false,
    holdingPeriodDays: null,
    taxProfilesPath: "./config/tax-profiles.json",
  },
};

const VALID_JURISDICTIONS: Jurisdiction[] = ["ON-CA", "CA-US"];

export class StrategyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyConfigError";
  }
}

/**
 * Load `config/strategy-config.json`, shallow-merged over
 * `DEFAULT_STRATEGY_CONFIG`. A missing file falls back to the defaults
 * untouched (ENOENT is not an error — every other I/O error propagates).
 */
export async function loadStrategyConfig(
  configPath = "./config/strategy-config.json",
): Promise<StrategyConfig> {
  let onDisk: Partial<StrategyConfig> = {};
  try {
    const raw = await fs.readFile(path.resolve(configPath), "utf8");
    onDisk = JSON.parse(raw) as Partial<StrategyConfig>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // `costs` is merged explicitly per-key (not just the outer spread) — the
  // outer shallow merge is per-TOP-LEVEL-key, so an on-disk `costs` block
  // would otherwise replace DEFAULT_STRATEGY_CONFIG.costs wholesale and a
  // partial on-disk block would silently drop keys the operator didn't
  // think to touch.
  const merged: StrategyConfig = {
    ...DEFAULT_STRATEGY_CONFIG,
    ...onDisk,
    costs: { ...DEFAULT_STRATEGY_CONFIG.costs, ...(onDisk.costs ?? {}) },
  };

  if (!(merged.assumedEquity > 0)) {
    throw new StrategyConfigError(
      `strategy-config: assumedEquity must be > 0 (got ${merged.assumedEquity})`,
    );
  }
  if (!(merged.scoreFloor >= 0 && merged.scoreFloor <= 1)) {
    throw new StrategyConfigError(
      `strategy-config: scoreFloor must be within [0,1] (got ${merged.scoreFloor})`,
    );
  }
  if (!(merged.maxCandidatesPerDay >= 1)) {
    throw new StrategyConfigError(
      `strategy-config: maxCandidatesPerDay must be >= 1 (got ${merged.maxCandidatesPerDay})`,
    );
  }

  const costs = merged.costs;
  if (!VALID_JURISDICTIONS.includes(costs.jurisdiction)) {
    throw new StrategyConfigError(
      `strategy-config: costs.jurisdiction must be one of ${VALID_JURISDICTIONS.join(", ")} (got ${costs.jurisdiction})`,
    );
  }
  for (const key of ["perTradeFeeUsd", "spreadSlippageBps", "fxSpreadBps"] as const) {
    const value = costs[key];
    if (!(Number.isFinite(value) && value >= 0)) {
      throw new StrategyConfigError(
        `strategy-config: costs.${key} must be finite and >= 0 (got ${value})`,
      );
    }
  }
  if (!(Number.isFinite(costs.minRewardRisk) && costs.minRewardRisk > 0)) {
    throw new StrategyConfigError(
      `strategy-config: costs.minRewardRisk must be finite and > 0 (got ${costs.minRewardRisk})`,
    );
  }
  for (const key of ["marginalRatePct", "capitalGainsInclusionPct"] as const) {
    const value = costs[key];
    if (value !== null && !(Number.isFinite(value) && value >= 0 && value <= 100)) {
      throw new StrategyConfigError(
        `strategy-config: costs.${key} must be null or within [0,100] (got ${value})`,
      );
    }
  }
  if (
    costs.holdingPeriodDays !== null &&
    !(Number.isFinite(costs.holdingPeriodDays) && costs.holdingPeriodDays >= 0)
  ) {
    throw new StrategyConfigError(
      `strategy-config: costs.holdingPeriodDays must be null or finite and >= 0 (got ${costs.holdingPeriodDays})`,
    );
  }
  if (typeof costs.niitEnabled !== "boolean") {
    throw new StrategyConfigError(
      `strategy-config: costs.niitEnabled must be a boolean (got ${String(costs.niitEnabled)})`,
    );
  }

  return merged;
}
