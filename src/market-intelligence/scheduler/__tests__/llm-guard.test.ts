import { describe, expect, it } from "vitest";
import {
  isWithinQuietHours,
  parseQuietHours,
  resolveLlmGuardFromEnv,
} from "../llm-guard.js";

// 2026-08-28 is EDT (UTC-4). 02:00 UTC = 22:00 ET previous day.
const etUtc = (etHour: number, etMin = 0) => new Date(Date.UTC(2026, 7, 28, etHour + 4, etMin));

describe("parseQuietHours", () => {
  it("parses HH:MM-HH:MM and rejects garbage", () => {
    expect(parseQuietHours("22:00-07:00")).toMatchObject({ startMin: 1320, endMin: 420 });
    expect(parseQuietHours(" 9:30-16:00 ")).toMatchObject({ startMin: 570, endMin: 960 });
    for (const bad of ["", "22-07", "25:00-07:00", "22:00", "22:00-22:00", undefined, null]) {
      expect(parseQuietHours(bad as string)).toBeNull();
    }
  });
});

describe("isWithinQuietHours (ET)", () => {
  const w = parseQuietHours("22:00-07:00");
  it("handles a window that wraps midnight", () => {
    expect(isWithinQuietHours(etUtc(23), w)).toBe(true);
    expect(isWithinQuietHours(etUtc(2), w)).toBe(true);
    expect(isWithinQuietHours(etUtc(6, 59), w)).toBe(true);
    expect(isWithinQuietHours(etUtc(7), w)).toBe(false);
    expect(isWithinQuietHours(etUtc(12), w)).toBe(false);
    expect(isWithinQuietHours(etUtc(21, 59), w)).toBe(false);
  });
  it("handles a same-day window and a null window", () => {
    const day = parseQuietHours("09:30-16:00");
    expect(isWithinQuietHours(etUtc(10), day)).toBe(true);
    expect(isWithinQuietHours(etUtc(16), day)).toBe(false);
    expect(isWithinQuietHours(etUtc(3), null)).toBe(false);
  });
});

describe("resolveLlmGuardFromEnv", () => {
  it("defaults to unload-after-cycle on and no quiet hours", () => {
    expect(resolveLlmGuardFromEnv({})).toEqual({ quietHours: null, unloadAfterCycle: true });
  });
  it("honours explicit settings", () => {
    const g = resolveLlmGuardFromEnv({ LLM_QUIET_HOURS_ET: "22:00-07:00", LLM_UNLOAD_AFTER_CYCLE: "false" });
    expect(g.quietHours?.label).toBe("22:00-07:00 ET");
    expect(g.unloadAfterCycle).toBe(false);
  });
});
