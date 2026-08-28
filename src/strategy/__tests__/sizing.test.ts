import { describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "../config.js";
import { grossExposureMultiple, suggestSizeUsd, TYPE_SIZE_MODIFIER } from "../sizing.js";

const cfg = DEFAULT_STRATEGY_CONFIG;

describe("suggestSizeUsd", () => {
  it("SECTOR_ROTATION_FROM_PM at 7500 equity: calm=1875, elevated=937, stressed=468", () => {
    expect(suggestSizeUsd("calm", "SECTOR_ROTATION_FROM_PM", 7500, cfg)).toBe(1875);
    expect(suggestSizeUsd("elevated", "SECTOR_ROTATION_FROM_PM", 7500, cfg)).toBe(937);
    expect(suggestSizeUsd("stressed", "SECTOR_ROTATION_FROM_PM", 7500, cfg)).toBe(468);
  });

  it("FADE_OVERSHOOT is exactly half of the same-regime size for any other type", () => {
    for (const regime of ["calm", "elevated", "stressed"] as const) {
      const other = suggestSizeUsd(regime, "CATALYST_ANCHORED", 7500, cfg);
      const fade = suggestSizeUsd(regime, "FADE_OVERSHOOT", 7500, cfg);
      expect(fade).toBe(Math.floor(other / 2));
    }
  });

  it("applies the trailing signalSizeModifier (RawSignal.sizeModifier) on top of the type modifier", () => {
    const full = suggestSizeUsd("elevated", "CATALYST_ANCHORED", 7500, cfg);
    const half = suggestSizeUsd("elevated", "CATALYST_ANCHORED", 7500, cfg, 0.5);
    expect(half).toBe(Math.floor(full / 2));
  });

  it("defaults signalSizeModifier to 1 when omitted", () => {
    const withDefault = suggestSizeUsd("calm", "SECTOR_ROTATION_FROM_PM", 7500, cfg);
    const explicit = suggestSizeUsd("calm", "SECTOR_ROTATION_FROM_PM", 7500, cfg, 1);
    expect(withDefault).toBe(explicit);
  });
});

describe("TYPE_SIZE_MODIFIER", () => {
  it("FADE_OVERSHOOT is 0.5, every other type is 1", () => {
    expect(TYPE_SIZE_MODIFIER.FADE_OVERSHOOT).toBe(0.5);
    expect(TYPE_SIZE_MODIFIER.CATALYST_ANCHORED).toBe(1);
    expect(TYPE_SIZE_MODIFIER.SENTIMENT_VELOCITY).toBe(1);
    expect(TYPE_SIZE_MODIFIER.SECTOR_ROTATION_FROM_PM).toBe(1);
  });
});

describe("grossExposureMultiple", () => {
  it("returns maxSimultaneousPositions * regimeSizePct for calm/elevated/stressed", () => {
    expect(grossExposureMultiple("calm", cfg)).toBeCloseTo(1.0, 10);
    expect(grossExposureMultiple("elevated", cfg)).toBeCloseTo(0.5, 10);
    expect(grossExposureMultiple("stressed", cfg)).toBeCloseTo(0.25, 10);
  });
});
