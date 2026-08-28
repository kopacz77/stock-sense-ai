/**
 * CatalystAnchoredModule unit tests (M2-05 Plan 11-03, Task 2).
 *
 * `generate()` reads from disk via `loadActiveCatalysts`, so each case uses
 * `fs.mkdtemp` for an isolated `intelDataDir` and stages
 * `catalyst-flags-YYYY-MM-DD.jsonl` fixture files directly, mirroring
 * `rollup-backfill.test.ts`'s fixture shape.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "../../config.js";
import type { SignalContext } from "../../types.js";
import {
  CatalystAnchoredModule,
  catalystTickers,
  daysUntil,
  scoreCatalyst,
} from "../catalyst-anchored.js";
import type { CatalystFlag } from "../../../market-intelligence/signal/types.js";

let intelDataDir: string;

beforeEach(async () => {
  intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "catalyst-anchored-"));
});

afterEach(async () => {
  await fs.rm(intelDataDir, { recursive: true, force: true });
});

function makeCatalyst(overrides: Partial<CatalystFlag> = {}): CatalystFlag {
  return {
    id: "test-catalyst-1",
    type: "product",
    tickers: ["NVDA"],
    expectedDate: "2026-06-27",
    magnitudePrior: 4,
    direction: "up",
    confidence: 0.8,
    source: "article:art-1",
    firstSeenAt: "2026-06-20T10:00:00Z",
    ...overrides,
  };
}

async function stageCatalysts(date: string, rows: CatalystFlag[]): Promise<void> {
  await fs.writeFile(
    path.join(intelDataDir, `catalyst-flags-${date}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : ""),
    "utf8",
  );
}

function makeContext(asOfDate = "2026-06-25"): SignalContext {
  return {
    asOfDate,
    rollups: [],
    config: DEFAULT_STRATEGY_CONFIG,
    intelDataDir,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pure functions
// ───────────────────────────────────────────────────────────────────────────

describe("scoreCatalyst", () => {
  it("magnitudePrior 5, confidence 1 -> 1", () => {
    expect(scoreCatalyst(makeCatalyst({ magnitudePrior: 5, confidence: 1 }))).toBe(1);
  });

  it("magnitudePrior 1, confidence 0.5 -> 0.1", () => {
    expect(scoreCatalyst(makeCatalyst({ magnitudePrior: 1, confidence: 0.5 }))).toBeCloseTo(0.1, 10);
  });

  it("clamps into [0,1] even if magnitudePrior*confidence would exceed 1", () => {
    // confidence is documented [0,1] but the function's own clamp is asserted
    // independent of caller discipline.
    const catalyst = makeCatalyst({ magnitudePrior: 5, confidence: 1 });
    (catalyst as unknown as { confidence: number }).confidence = 2;
    expect(scoreCatalyst(catalyst)).toBe(1);
  });
});

describe("catalystTickers", () => {
  it("returns the union of tickers[] and affectedSectors[], upper-cased and de-duplicated", () => {
    const catalyst = makeCatalyst({ tickers: ["nvda", "NVDA"], affectedSectors: ["xlk"] });
    expect(catalystTickers(catalyst)).toEqual(["NVDA", "XLK"]);
  });

  it("an FOMC flag with empty tickers and 4 affectedSectors produces 4 candidate tickers", () => {
    const catalyst = makeCatalyst({
      type: "fomc",
      tickers: [],
      affectedSectors: ["TLT", "IEF", "XLF", "IWM"],
    });
    expect(catalystTickers(catalyst)).toEqual(["TLT", "IEF", "XLF", "IWM"]);
  });
});

describe("daysUntil", () => {
  it("daysUntil('2026-06-27', '2026-06-25') is 2", () => {
    expect(daysUntil("2026-06-27", "2026-06-25")).toBe(2);
  });

  it("same-day catalyst yields 0", () => {
    expect(daysUntil("2026-06-25", "2026-06-25")).toBe(0);
  });

  it("compares on the date part only, ignoring a full-ISO expectedDate's time component", () => {
    expect(daysUntil("2026-06-27T14:00:00Z", "2026-06-25")).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CatalystAnchoredModule.generate()
// ───────────────────────────────────────────────────────────────────────────

describe("CatalystAnchoredModule.generate", () => {
  it("direction 'up' maps to 'long'", async () => {
    await stageCatalysts("2026-06-25", [makeCatalyst({ direction: "up" })]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toHaveLength(1);
    expect(signals[0]?.direction).toBe("long");
  });

  it("direction 'down' maps to 'short'", async () => {
    await stageCatalysts("2026-06-25", [makeCatalyst({ direction: "down" })]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toHaveLength(1);
    expect(signals[0]?.direction).toBe("short");
  });

  it("direction 'uncertain' emits zero signals for that catalyst", async () => {
    await stageCatalysts("2026-06-25", [makeCatalyst({ direction: "uncertain" })]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toEqual([]);
  });

  it("direction 'binary' emits two signals for the same ticker — one long, one short — each sizeModifier 0.5", async () => {
    await stageCatalysts("2026-06-25", [makeCatalyst({ direction: "binary", tickers: ["NVDA"] })]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.ticker === "NVDA")).toBe(true);
    expect(signals.map((s) => s.direction).sort()).toEqual(["long", "short"]);
    expect(signals.every((s) => s.sizeModifier === 0.5)).toBe(true);
  });

  it("an FOMC-shaped flag with empty tickers and 4 affectedSectors produces 4 signals", async () => {
    await stageCatalysts("2026-06-25", [
      makeCatalyst({
        type: "fomc",
        tickers: [],
        affectedSectors: ["TLT", "IEF", "XLF", "IWM"],
        direction: "down",
        source: "calendar:fomc-seed",
      }),
    ]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toHaveLength(4);
    expect(signals.map((s) => s.ticker).sort()).toEqual(["IEF", "IWM", "TLT", "XLF"]);
    expect(signals.every((s) => s.direction === "short")).toBe(true);
  });

  it("timeHorizonDays is daysUntilEvent + 1; a same-day catalyst yields timeHorizonDays: 1", async () => {
    await stageCatalysts("2026-06-25", [
      makeCatalyst({ id: "future", expectedDate: "2026-06-27" }),
    ]);
    const moduleFuture = new CatalystAnchoredModule();
    const futureSignals = await moduleFuture.generate(makeContext("2026-06-25"));
    expect(futureSignals[0]?.timeHorizonDays).toBe(3);

    await fs.rm(intelDataDir, { recursive: true, force: true });
    intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "catalyst-anchored-sameday-"));
    await stageCatalysts("2026-06-25", [
      makeCatalyst({ id: "sameday", expectedDate: "2026-06-25" }),
    ]);
    const moduleSameDay = new CatalystAnchoredModule();
    const sameDaySignals = await moduleSameDay.generate(makeContext("2026-06-25"));
    expect(sameDaySignals[0]?.timeHorizonDays).toBe(1);
  });

  it("emits nothing for an archived catalyst", async () => {
    await stageCatalysts("2026-06-25", [
      makeCatalyst({ expectedDate: "2026-06-30", archived: true }),
    ]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals).toEqual([]);
  });

  it("emits nothing for a catalyst whose expectedDate is in the past relative to asOfDate", async () => {
    await stageCatalysts("2026-06-25", [makeCatalyst({ expectedDate: "2026-06-20" })]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext("2026-06-25"));
    expect(signals).toEqual([]);
  });

  it("entryStyle is 'close' for every catalyst candidate", async () => {
    await stageCatalysts("2026-06-25", [
      makeCatalyst({ direction: "up" }),
      makeCatalyst({ id: "second", type: "fda", direction: "down", tickers: ["MRNA"] }),
    ]);
    const module = new CatalystAnchoredModule();
    const signals = await module.generate(makeContext());
    expect(signals.every((s) => s.entryStyle === "close")).toBe(true);
  });

  describe("same-type (ticker, direction) tie-break", () => {
    it("higher score wins when two catalysts collide on the same ticker+direction", async () => {
      await stageCatalysts("2026-06-25", [
        makeCatalyst({
          id: "low-score",
          tickers: ["NVDA"],
          direction: "up",
          magnitudePrior: 2,
          confidence: 0.3,
          expectedDate: "2026-06-27",
        }),
        makeCatalyst({
          id: "high-score",
          tickers: ["NVDA"],
          direction: "up",
          magnitudePrior: 5,
          confidence: 0.9,
          expectedDate: "2026-06-29",
        }),
      ]);
      const module = new CatalystAnchoredModule();
      const signals = await module.generate(makeContext());
      expect(signals).toHaveLength(1);
      expect(signals[0]?.sourceCatalystId).toBe("high-score");
      expect(signals[0]?.rationale).toContain("low-score");
    });

    it("on an exact score tie, the nearer expectedDate wins", async () => {
      await stageCatalysts("2026-06-25", [
        makeCatalyst({
          id: "far",
          tickers: ["NVDA"],
          direction: "up",
          magnitudePrior: 4,
          confidence: 0.5,
          expectedDate: "2026-07-10",
        }),
        makeCatalyst({
          id: "near",
          tickers: ["NVDA"],
          direction: "up",
          magnitudePrior: 4,
          confidence: 0.5,
          expectedDate: "2026-06-27",
        }),
      ]);
      const module = new CatalystAnchoredModule();
      const signals = await module.generate(makeContext());
      expect(signals).toHaveLength(1);
      expect(signals[0]?.sourceCatalystId).toBe("near");
      expect(signals[0]?.rationale).toContain("far");
    });
  });

  describe("targetSpec per catalyst type (D-08)", () => {
    it("fda and fda_pdufa use { kind: pctOfClose, pct: 0.25 }", async () => {
      await stageCatalysts("2026-06-25", [
        makeCatalyst({ id: "fda-1", type: "fda", tickers: ["MRNA"] }),
        makeCatalyst({ id: "fda-2", type: "fda_pdufa", tickers: ["PFE"] }),
      ]);
      const module = new CatalystAnchoredModule();
      const signals = await module.generate(makeContext());
      for (const s of signals) {
        expect(s.targetSpec).toEqual({ kind: "pctOfClose", pct: 0.25 });
      }
    });

    it("treasury_auction uses { kind: atr, period: 5, multiple: 1 }", async () => {
      await stageCatalysts("2026-06-25", [
        makeCatalyst({ type: "treasury_auction", tickers: ["TLT"] }),
      ]);
      const module = new CatalystAnchoredModule();
      const signals = await module.generate(makeContext());
      expect(signals[0]?.targetSpec).toEqual({ kind: "atr", period: 5, multiple: 1 });
    });

    it("every other type (including product/lawsuit/ma/earnings) uses { kind: atr, period: 5, multiple: 2 }", async () => {
      await stageCatalysts("2026-06-25", [
        makeCatalyst({ id: "p", type: "product", tickers: ["NVDA"] }),
        makeCatalyst({ id: "l", type: "lawsuit", tickers: ["META"] }),
        makeCatalyst({ id: "m", type: "ma", tickers: ["AAPL"] }),
        makeCatalyst({ id: "e", type: "earnings", tickers: ["MSFT"] }),
        makeCatalyst({ id: "f", type: "fomc", tickers: [], affectedSectors: ["TLT"] }),
      ]);
      const module = new CatalystAnchoredModule();
      const signals = await module.generate(makeContext());
      expect(signals.length).toBeGreaterThan(0);
      for (const s of signals) {
        expect(s.targetSpec).toEqual({ kind: "atr", period: 5, multiple: 2 });
      }
    });
  });
});
