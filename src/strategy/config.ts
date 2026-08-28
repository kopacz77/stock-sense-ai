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

import type { SignalMode, SignalType, VixRegime } from "./types.js";

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
};

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

  const merged: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...onDisk };

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

  return merged;
}
