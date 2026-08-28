import { describe, expect, it } from "vitest";

import {
  ATR_STOP_MULTIPLE,
  computeLevels,
  MAX_ATR_TARGET_DISTANCE_PCT,
  MAX_STOP_DISTANCE_PCT,
  targetPriceForCatalyst,
} from "../levels.js";

const HIGH_PRICE_ATR = { 3: 1.0, 5: 1.2, 10: 1.5 };

describe("computeLevels — entry", () => {
  it("entryStyle close returns entryPrice === close for long", () => {
    const levels = computeLevels({
      close: 100,
      direction: "long",
      atrByPeriod: HIGH_PRICE_ATR,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    expect(levels.entryPrice).toBe(100);
  });

  it("entryStyle close returns entryPrice === close for short", () => {
    const levels = computeLevels({
      close: 100,
      direction: "short",
      atrByPeriod: HIGH_PRICE_ATR,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    expect(levels.entryPrice).toBe(100);
  });

  it("entryStyle pullback, long: max(close - 0.5*atr5, close*0.99)", () => {
    const close = 100;
    const atr5 = 1.2;
    const expected = Math.max(close - 0.5 * atr5, close * 0.99);
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod: HIGH_PRICE_ATR,
      entryStyle: "pullback",
      targetSpec: { kind: "atr", period: 5, multiple: 2.5 },
    });
    expect(levels.entryPrice).toBeCloseTo(Math.round(expected * 100) / 100, 10);
  });

  it("entryStyle pullback, short: min(close + 0.5*atr5, close*1.01)", () => {
    const close = 100;
    const atr5 = 1.2;
    const expected = Math.min(close + 0.5 * atr5, close * 1.01);
    const levels = computeLevels({
      close,
      direction: "short",
      atrByPeriod: HIGH_PRICE_ATR,
      entryStyle: "pullback",
      targetSpec: { kind: "atr", period: 5, multiple: 2.5 },
    });
    expect(levels.entryPrice).toBeCloseTo(Math.round(expected * 100) / 100, 10);
  });
});

describe("computeLevels — stop (Pitfall 5 clamp, ATR_5 always)", () => {
  it("high-priced stock: stop is the raw ATR stop, unclamped", () => {
    const close = 300;
    const atr5 = 1.2;
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod: HIGH_PRICE_ATR,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    const rawStop = close - ATR_STOP_MULTIPLE * atr5;
    expect(levels.stopPrice).toBeCloseTo(Math.round(rawStop * 100) / 100, 2);
    // Confirm it did NOT need clamping for this fixture.
    expect(rawStop).toBeGreaterThan(close * (1 - MAX_STOP_DISTANCE_PCT));
  });

  it("low-priced stock (close 3.20, ATR_5 0.85): stop clamps to 5% (long)", () => {
    const close = 3.2;
    const atrByPeriod = { 3: 0.7, 5: 0.85, 10: 1.0 };
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    const rawStop = close - ATR_STOP_MULTIPLE * 0.85; // 3.2 - 1.275 = 1.925
    const clamped = Math.max(rawStop, close * (1 - MAX_STOP_DISTANCE_PCT)); // 3.2*0.95=3.04
    expect(levels.stopPrice).toBeCloseTo(Math.round(clamped * 100) / 100, 2);
    expect(levels.stopPrice).toBeGreaterThan(rawStop);
  });

  it("low-priced stock, short direction: stop clamps to 5% above entry", () => {
    const close = 3.2;
    const atrByPeriod = { 3: 0.7, 5: 0.85, 10: 1.0 };
    const levels = computeLevels({
      close,
      direction: "short",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    const rawStop = close + ATR_STOP_MULTIPLE * 0.85; // 3.2 + 1.275 = 4.475
    const clamped = Math.min(rawStop, close * (1 + MAX_STOP_DISTANCE_PCT)); // 3.2*1.05=3.36
    expect(levels.stopPrice).toBeCloseTo(Math.round(clamped * 100) / 100, 2);
    expect(levels.stopPrice).toBeLessThan(rawStop);
  });
});

describe("computeLevels — ATR target clamp (15%), pctOfClose/absoluteMove unclamped", () => {
  it("low-priced stock: ATR target clamps to 15% from entry (long)", () => {
    const close = 3.2;
    const atrByPeriod = { 3: 0.7, 5: 0.85, 10: 1.0 };
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    const rawTarget = close + 2.0 * 1.0; // 5.2 — far more than 15% above 3.2
    const clamped = Math.min(rawTarget, close * (1 + MAX_ATR_TARGET_DISTANCE_PCT));
    expect(levels.targetPrice).toBeCloseTo(Math.round(clamped * 100) / 100, 2);
    expect(levels.targetPrice).toBeLessThan(rawTarget);
  });

  it("high-priced stock: ATR target is NOT clamped (within 15%)", () => {
    const close = 300;
    const atrByPeriod = HIGH_PRICE_ATR;
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    });
    const rawTarget = close + 2.0 * 1.5; // 303 — well within 15% of 300
    expect(levels.targetPrice).toBeCloseTo(Math.round(rawTarget * 100) / 100, 2);
  });

  it("pctOfClose target (FDA 25% case) is never clamped, even on a low-priced stock", () => {
    const close = 3.2;
    const atrByPeriod = { 3: 0.7, 5: 0.85, 10: 1.0 };
    const levels = computeLevels({
      close,
      direction: "long",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "pctOfClose", pct: 0.25 },
    });
    const expected = close + 0.25 * close; // 4.0 — 25% above close, unclamped
    expect(levels.targetPrice).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  it("absoluteMove target (earnings average-historical-move case) is never clamped", () => {
    const close = 3.2;
    const atrByPeriod = { 3: 0.7, 5: 0.85, 10: 1.0 };
    const levels = computeLevels({
      close,
      direction: "short",
      atrByPeriod,
      entryStyle: "close",
      targetSpec: { kind: "absoluteMove", move: 2.0 },
    });
    const expected = close + 2.0 * -1; // 1.2
    expect(levels.targetPrice).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });
});

describe("computeLevels — direction guard", () => {
  it("throws on an unexpected direction string at runtime", () => {
    expect(() =>
      computeLevels({
        // Cast to bypass the compile-time "long" | "short" contract — this
        // simulates an unvalidated value reaching computeLevels at runtime
        // (e.g. a CatalystDirection "uncertain"/"binary" that a caller
        // failed to pre-filter/split).
        close: 100,
        direction: "uncertain" as unknown as "long",
        atrByPeriod: HIGH_PRICE_ATR,
        entryStyle: "close",
        targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
      }),
    ).toThrow();
  });
});

describe("targetPriceForCatalyst", () => {
  const atrByPeriod = { 3: 1.0, 5: 1.2, 10: 1.5 };

  it("fda -> 25% of close", () => {
    expect(targetPriceForCatalyst("fda", 100, 1, atrByPeriod)).toBeCloseTo(125, 2);
    expect(targetPriceForCatalyst("fda", 100, -1, atrByPeriod)).toBeCloseTo(75, 2);
  });

  it("fda_pdufa -> 25% of close", () => {
    expect(targetPriceForCatalyst("fda_pdufa", 100, 1, atrByPeriod)).toBeCloseTo(125, 2);
  });

  it("earnings -> supplied average historical move when present", () => {
    expect(targetPriceForCatalyst("earnings", 100, 1, atrByPeriod, 8)).toBeCloseTo(108, 2);
    expect(targetPriceForCatalyst("earnings", 100, -1, atrByPeriod, 8)).toBeCloseTo(92, 2);
  });

  it("earnings -> falls back to 2*ATR_5 when average historical move is absent", () => {
    expect(targetPriceForCatalyst("earnings", 100, 1, atrByPeriod)).toBeCloseTo(100 + 2 * 1.2, 2);
  });

  it("treasury_auction -> 1*ATR_5", () => {
    expect(targetPriceForCatalyst("treasury_auction", 100, 1, atrByPeriod)).toBeCloseTo(
      100 + 1 * 1.2,
      2,
    );
  });

  it("every other CatalystType -> 2*ATR_5 (generic default)", () => {
    for (const type of ["ma", "lawsuit", "regulatory", "product", "guidance", "geopolitical", "other", "fomc", "cpi"] as const) {
      expect(targetPriceForCatalyst(type, 100, 1, atrByPeriod)).toBeCloseTo(100 + 2 * 1.2, 2);
    }
  });
});
