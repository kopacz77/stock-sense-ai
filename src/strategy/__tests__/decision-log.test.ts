import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StrategyCandidate } from "../types.js";
import { DecisionLog, DecisionLogError } from "../decision-log.js";

let strategyDataDir: string;

beforeEach(async () => {
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "decision-log-"));
});

afterEach(async () => {
  await fs.rm(strategyDataDir, { recursive: true, force: true });
});

function candidate(overrides: Partial<StrategyCandidate> = {}): StrategyCandidate {
  return {
    signalType: "SECTOR_ROTATION_FROM_PM",
    ticker: "XLE",
    score: 0.8,
    direction: "long",
    rationale: "test fixture",
    entryStyle: "close",
    targetSpec: { kind: "atr", period: 10, multiple: 2.0 },
    timeHorizonDays: 12,
    sourceArticleIds: [],
    sourcePmMarkets: [],
    candidateId: "2026-06-25-SECTOR_ROTATION_FROM_PM-XLE-aaaaaaaa",
    generatedAt: "2026-06-25T12:00:00.000Z",
    asOfDate: "2026-06-25",
    mode: "ranked",
    vixRegime: "elevated",
    vixCloseAtGeneration: 18,
    vixSource: "live",
    suggestedEntry: 100,
    suggestedTarget: 110,
    suggestedStop: 95,
    suggestedSizeUsd: 937,
    atrPeriodUsed: 10,
    atrValue: 2,
    ...overrides,
  };
}

describe("DecisionLog.recordClose", () => {
  it("computes profit on a long close when exit is above operator entry", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate({ direction: "long" });
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });

    const closed = await log.recordClose(accepted.candidateId, { exitPrice: 110 });

    expect(closed.closeExitPrice).toBe(110);
    // (110-100)/100 * (1000/100) = 0.1 * 10 = 1.0... let's use direct formula:
    // pnlUsd = (110-100) * 1 * (1000/100) = 10 * 10 = 100
    expect(closed.closeRealizedPnlUsd).toBeCloseTo(100, 2);
    expect(closed.closeRealizedPnlPct).toBeCloseTo(10, 2);
  });

  it("computes profit on a SHORT close when exit is BELOW operator entry", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate({ direction: "short", ticker: "USO" });
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });

    const closed = await log.recordClose(accepted.candidateId, { exitPrice: 90 });

    // pnlUsd = (90-100) * -1 * (1000/100) = -10 * -1 * 10 = 100 (profit)
    expect(closed.closeRealizedPnlUsd).toBeCloseTo(100, 2);
    expect(closed.closeRealizedPnlPct).toBeCloseTo(10, 2);
  });

  it("computes a loss on a long close when exit is below operator entry", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate({ direction: "long" });
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });

    const closed = await log.recordClose(accepted.candidateId, { exitPrice: 95 });

    expect(closed.closeRealizedPnlUsd).toBeCloseTo(-50, 2);
    expect(closed.closeRealizedPnlPct).toBeCloseTo(-5, 2);
  });

  it("appends a NEW record sharing candidateId rather than mutating the accept row", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });
    await log.recordClose(accepted.candidateId, { exitPrice: 105 });

    const dateIso = accepted.decidedAt.split("T")[0] ?? "";
    const raw = await log.readDay(new Date(`${dateIso}T00:00:00.000Z`));
    // Both the original accept row AND the close row are on disk.
    expect(raw.length).toBeGreaterThanOrEqual(2);
    expect(raw.filter((r) => r.candidateId === accepted.candidateId).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("fails with a named error when closing a skipped candidateId", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    const skipped = await log.recordSkip(c);

    await expect(log.recordClose(skipped.candidateId, { exitPrice: 100 })).rejects.toThrow(
      DecisionLogError,
    );
  });

  it("fails with a named error when closing a candidateId that does not exist", async () => {
    const log = new DecisionLog({ strategyDataDir });
    await expect(log.recordClose("does-not-exist", { exitPrice: 100 })).rejects.toThrow(
      DecisionLogError,
    );
  });
});

describe("DecisionLog.readDedupedByCandidateId", () => {
  it("returns one record per candidateId, keeping the latest closedAt ?? decidedAt", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });
    await log.recordClose(accepted.candidateId, { exitPrice: 108 });

    const today = new Date().toISOString().split("T")[0] ?? "";
    const deduped = await log.readDedupedByCandidateId(today, today);

    const matching = deduped.filter((r) => r.candidateId === accepted.candidateId);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.closedAt).toBeDefined();
    expect(matching[0]?.closeExitPrice).toBe(108);
  });

  it("a skip followed by an accept for the same candidateId reconciles to the accept; both rows persist", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();

    // Force the accept to be decided strictly after the skip (dedup uses
    // decidedAt timestamps, so two calls in the same tick could otherwise
    // race in a flaky way).
    await log.recordSkip(c);
    await new Promise((r) => setTimeout(r, 5));
    const accepted = await log.recordAccept(c, { entry: 100, size: 1000 });

    const today = new Date().toISOString().split("T")[0] ?? "";
    const deduped = await log.readDedupedByCandidateId(today, today);
    const matching = deduped.filter((r) => r.candidateId === c.candidateId);

    expect(matching).toHaveLength(1);
    expect(matching[0]?.decision).toBe("accept");

    const raw = await log.readDay(new Date(`${today}T00:00:00.000Z`));
    expect(raw.filter((r) => r.candidateId === c.candidateId)).toHaveLength(2);
    expect(accepted.decision).toBe("accept");
  });
});

describe("DecisionLog.acceptSkipStats", () => {
  it("computes accepted/skipped/total/acceptRate and the D-13 band", async () => {
    const log = new DecisionLog({ strategyDataDir });

    // 1 accept, 4 skips -> acceptRate 0.2 -> "sweet-spot" (>= 0.2 and <= 0.4)
    await log.recordAccept(candidate({ candidateId: "id-1" }), { entry: 100, size: 1000 });
    await log.recordSkip(candidate({ candidateId: "id-2" }));
    await log.recordSkip(candidate({ candidateId: "id-3" }));
    await log.recordSkip(candidate({ candidateId: "id-4" }));
    await log.recordSkip(candidate({ candidateId: "id-5" }));

    const stats = await log.acceptSkipStats(30);
    expect(stats.accepted).toBe(1);
    expect(stats.skipped).toBe(4);
    expect(stats.total).toBe(5);
    expect(stats.acceptRate).toBeCloseTo(0.2, 10);
    expect(stats.band).toBe("sweet-spot");
  });

  it("reports 'low' band below 0.10 accept rate", async () => {
    const log = new DecisionLog({ strategyDataDir });
    await log.recordAccept(candidate({ candidateId: "id-1" }), { entry: 100, size: 1000 });
    for (let i = 0; i < 20; i++) {
      await log.recordSkip(candidate({ candidateId: `skip-${i}` }));
    }
    const stats = await log.acceptSkipStats(30);
    expect(stats.acceptRate).toBeLessThan(0.1);
    expect(stats.band).toBe("low");
  });

  it("reports 'high' band above 0.60 accept rate", async () => {
    const log = new DecisionLog({ strategyDataDir });
    for (let i = 0; i < 8; i++) {
      await log.recordAccept(candidate({ candidateId: `accept-${i}` }), {
        entry: 100,
        size: 1000,
      });
    }
    await log.recordSkip(candidate({ candidateId: "skip-1" }));
    const stats = await log.acceptSkipStats(30);
    expect(stats.acceptRate).toBeGreaterThan(0.6);
    expect(stats.band).toBe("high");
  });
});

describe("DecisionLog.findCandidate", () => {
  it("resolves a candidate id's day directly from its embedded date prefix", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate({ candidateId: "2026-06-25-SECTOR_ROTATION_FROM_PM-XLE-deadbeef" });
    const { JsonlStore } = await import("../../market-intelligence/storage/jsonl-store.js");
    const store = new JsonlStore(strategyDataDir, "candidates");
    await store.appendManyOn([c], new Date("2026-06-25T00:00:00.000Z"));

    const found = await log.findCandidate(c.candidateId);
    expect(found?.candidateId).toBe(c.candidateId);
  });

  it("returns undefined for an id with no matching candidate", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const found = await log.findCandidate("2026-06-25-SECTOR_ROTATION_FROM_PM-XLE-notfound1");
    expect(found).toBeUndefined();
  });
});
