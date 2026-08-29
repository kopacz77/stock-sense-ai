/**
 * CR-02: `GET /api/strategy/candidates` join + the accept/skip 409 guard's
 * underlying lookup. `WebServer` itself has no isolated HTTP test harness
 * (`start()` also initializes `SecureConfig`/`MarketDataService`, so it is
 * not safe to spin up in a unit test) — these tests exercise the two pure
 * helpers the route handlers call directly against a real `DecisionLog`,
 * covering exactly the conditions the 409 guard and the decision join
 * depend on.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DecisionLog } from "../../strategy/decision-log.js";
import type { CandidateCostEvaluation, StrategyCandidate } from "../../strategy/types.js";
import { attachDecisionStatus, findLiveDecisionForCandidate, redactCostEvaluation } from "../server.js";

let strategyDataDir: string;

beforeEach(async () => {
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "server-strategy-decision-"));
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
    costEvaluation: null,
    ...overrides,
  };
}

describe("findLiveDecisionForCandidate", () => {
  it("returns undefined when no decision has been recorded yet", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    const found = await findLiveDecisionForCandidate(log, c);
    expect(found).toBeUndefined();
  });

  it("finds the decision after an accept — this is exactly what the 409 guard checks", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    await log.recordAccept(c, { entry: 101, target: 111, stop: 96, size: 900 });

    const found = await findLiveDecisionForCandidate(log, c);
    expect(found).toBeDefined();
    expect(found?.decision).toBe("accept");
    expect(found?.operatorEntry).toBe(101);
  });

  it("finds the decision after a skip", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    await log.recordSkip(c, "not liquid enough");

    const found = await findLiveDecisionForCandidate(log, c);
    expect(found?.decision).toBe("skip");
  });
});

describe("attachDecisionStatus", () => {
  it("attaches decision:null when no decision exists for the candidateId", () => {
    const c = candidate();
    const result = attachDecisionStatus(c, new Map());
    expect(result.decision).toBeNull();
    expect(result.candidateId).toBe(c.candidateId);
  });

  it("attaches the joined decision's accept/skip status so a reload can hydrate it", async () => {
    const log = new DecisionLog({ strategyDataDir });
    const c = candidate();
    const accepted = await log.recordAccept(c, { entry: 101, size: 900 });

    const byId = new Map([[accepted.candidateId, accepted]]);
    const result = attachDecisionStatus(c, byId);
    expect(result.decision).toBe("accept");
  });

  // Plan 11-09 (T-11-09-01): the operator's tax rate never leaves the process.
  it("redacts costEvaluation — keeps netRewardRisk/minRewardRisk/breakEvenPct/washSaleFlag, omits effectiveTaxRatePct and every dollar figure", () => {
    const fullEvaluation: CandidateCostEvaluation = {
      jurisdiction: "ON-CA",
      prospectiveSizeUsd: 937,
      quantity: 9,
      grossMovePct: 0.05,
      breakEvenPct: 0.0301,
      grossRewardUsd: 90,
      afterTaxRewardUsd: 72,
      riskUsd: 45,
      netRewardRisk: 1.6,
      minRewardRisk: 1.5,
      effectiveTaxRatePct: 20,
      taxRateKnown: true,
      passesBreakEven: true,
      passesRewardRisk: true,
      passes: true,
      washSaleFlag: {
        ticker: "XLE",
        rule: "superficial-loss",
        windowDays: 30,
        priorCandidateId: "2026-06-20-CATALYST_ANCHORED-XLE-deadbeef",
        priorClosedAt: "2026-06-21T00:00:00.000Z",
        priorRealizedPnlUsd: -50,
      },
    };
    const c = candidate({ costEvaluation: fullEvaluation });

    const result = attachDecisionStatus(c, new Map());
    const redacted = result.costEvaluation;

    expect(redacted).not.toBeNull();
    expect(redacted?.jurisdiction).toBe("ON-CA");
    expect(redacted?.netRewardRisk).toBe(1.6);
    expect(redacted?.minRewardRisk).toBe(1.5);
    expect(redacted?.breakEvenPct).toBe(0.0301);
    expect(redacted?.passes).toBe(true);
    expect(redacted?.taxRateKnown).toBe(true);
    expect(redacted?.washSaleFlag).toEqual(fullEvaluation.washSaleFlag);

    // The operator's tax bracket and every dollar figure that inverts back
    // to it must never appear on the object at all.
    expect((redacted as unknown as Record<string, unknown>).effectiveTaxRatePct).toBeUndefined();
    expect((redacted as unknown as Record<string, unknown>).afterTaxRewardUsd).toBeUndefined();
    expect((redacted as unknown as Record<string, unknown>).grossRewardUsd).toBeUndefined();
    expect((redacted as unknown as Record<string, unknown>).riskUsd).toBeUndefined();
    expect((redacted as unknown as Record<string, unknown>).quantity).toBeUndefined();
  });

  it("redactCostEvaluation returns null for a null costEvaluation", () => {
    expect(redactCostEvaluation(null)).toBeNull();
  });
});
