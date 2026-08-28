/**
 * After-tax/after-fees net-hurdle cost model tests (M2-05 Plan 11-09, Task 1).
 *
 * `describe("wash-sale/superficial-loss flag")` and the decision-log accept
 * cases from Task 2's `<behavior>` block are added in that task's edit to
 * this same file.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "../config.js";
import type { CostsConfig } from "../config.js";
import {
  TaxProfileError,
  computeNetHurdle,
  costsDemotionReason,
  evaluateCandidateCosts,
  loadTaxProfiles,
  resolveActiveProfile,
} from "../costs.js";
import type { TaxProfile, TaxProfilesFile } from "../costs.js";

const REAL_TAX_PROFILES_PATH = path.resolve("./config/tax-profiles.json");

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "costs-test-"));
});

afterEach(async () => {
  await fs.rm(scratchDir, { recursive: true, force: true });
});

function costsConfig(overrides: Partial<CostsConfig> = {}): CostsConfig {
  return { ...DEFAULT_STRATEGY_CONFIG.costs, ...overrides };
}

async function writeProfilesFixture(file: unknown): Promise<string> {
  const fixturePath = path.join(scratchDir, "tax-profiles.json");
  await fs.writeFile(fixturePath, JSON.stringify(file), "utf8");
  return fixturePath;
}

/** A minimal-but-complete profiles file for fixture mutation in the rejection tests. */
async function validProfilesFile(): Promise<TaxProfilesFile> {
  const real = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
  // Deep-clone via JSON round-trip so mutations in one test never leak into another.
  return JSON.parse(JSON.stringify(real)) as TaxProfilesFile;
}

describe("loadTaxProfiles / resolveActiveProfile — both jurisdictions", () => {
  it("loads the real config/tax-profiles.json and resolves both ON-CA and CA-US", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    expect(file.profiles["ON-CA"].jurisdiction).toBe("ON-CA");
    expect(file.profiles["CA-US"].jurisdiction).toBe("CA-US");

    const onCa = resolveActiveProfile(file, costsConfig({ jurisdiction: "ON-CA" }));
    expect(onCa.jurisdiction).toBe("ON-CA");
    const caUs = resolveActiveProfile(file, costsConfig({ jurisdiction: "CA-US" }));
    expect(caUs.jurisdiction).toBe("CA-US");
  });

  it("ON-CA carries fxApplies:true and the superficial-loss rule; CA-US carries fxApplies:false and the wash-sale rule", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    expect(file.profiles["ON-CA"].fxApplies).toBe(true);
    expect(file.profiles["ON-CA"].lossRule.name).toBe("superficial-loss");
    expect(file.profiles["CA-US"].fxApplies).toBe(false);
    expect(file.profiles["CA-US"].lossRule.name).toBe("wash-sale");
  });

  it("every AnnotatedRate in the real file ships verified:false with a confirmWithAccountant flag and a source/asOf", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const rates = [
      file.profiles["ON-CA"].inclusionRatePct,
      file.profiles["ON-CA"].regulatorySellFees.secSection31FeeBps,
      file.profiles["ON-CA"].regulatorySellFees.finraTafBps,
      file.profiles["CA-US"].inclusionRatePct,
      file.profiles["CA-US"].shortTermThresholdDays,
      file.profiles["CA-US"].longTerm.federalPreferentialRatePct,
      file.profiles["CA-US"].niit.ratePct,
    ];
    for (const rate of rates) {
      expect(rate).toBeDefined();
      expect(rate?.verified).toBe(false);
      expect(rate?.confirmWithAccountant).toBe(true);
      expect(typeof rate?.source).toBe("string");
      expect(rate?.source.length).toBeGreaterThan(0);
      expect(typeof rate?.asOf).toBe("string");
    }
  });

  it("throws TaxProfileError for a missing file", async () => {
    await expect(loadTaxProfiles(path.join(scratchDir, "does-not-exist.json"))).rejects.toThrow(
      TaxProfileError,
    );
  });

  it("rejects a __proto__ key at any depth", async () => {
    // Inject a literal "__proto__" key as JSON TEXT (not via the JS
    // `__proto__` accessor, which would silently change an object's actual
    // prototype instead of adding an own property and would never survive
    // a JSON.stringify round-trip). JSON.parse creates "__proto__" as a
    // normal own enumerable property — exactly the attack surface
    // assertNoProtoPollution defends against.
    const valid = await validProfilesFile();
    const validJson = JSON.stringify(valid);
    const needle = '"lossRule":{"name":"superficial-loss"';
    expect(validJson).toContain(needle); // sanity: the fixture has the expected shape
    const poisonedJson = validJson.replace(
      needle,
      '"lossRule":{"__proto__":{"polluted":true},"name":"superficial-loss"',
    );
    const fixturePath = path.join(scratchDir, "tax-profiles.json");
    await fs.writeFile(fixturePath, poisonedJson, "utf8");
    await expect(loadTaxProfiles(fixturePath)).rejects.toThrow(TaxProfileError);
  });

  it("rejects a negative AnnotatedRate.value", async () => {
    const valid = await validProfilesFile();
    valid.profiles["ON-CA"].inclusionRatePct.value = -5;
    const fixturePath = await writeProfilesFixture(valid);
    await expect(loadTaxProfiles(fixturePath)).rejects.toThrow(TaxProfileError);
  });

  it("rejects a NaN-producing (non-numeric) AnnotatedRate.value", async () => {
    const valid = await validProfilesFile();
    (valid.profiles["ON-CA"].inclusionRatePct as unknown as { value: unknown }).value = "fifty";
    const fixturePath = await writeProfilesFixture(valid);
    await expect(loadTaxProfiles(fixturePath)).rejects.toThrow(TaxProfileError);
  });

  it("rejects a missing jurisdiction", async () => {
    const valid = await validProfilesFile();
    delete (valid.profiles as Record<string, unknown>)["CA-US"];
    const fixturePath = await writeProfilesFixture(valid);
    await expect(loadTaxProfiles(fixturePath)).rejects.toThrow(TaxProfileError);
  });
});

describe("computeNetHurdle", () => {
  it("hand-computed break-even for a known fee/slippage/size triple (no FX, no regulatory fee)", () => {
    const profile: TaxProfile = {
      jurisdiction: "CA-US",
      label: "test",
      gainCharacterisation: "ordinary_income_short_term",
      inclusionRatePct: {
        value: 100,
        unit: "pct",
        source: "test",
        asOf: "2026-08-28",
        confirmWithAccountant: true,
        verified: false,
        note: "",
      },
      longTerm: { available: false },
      lossRule: { name: "wash-sale", windowDays: 30, note: "" },
      fxApplies: false,
      regulatorySellFees: {
        secSection31FeeBps: {
          value: 0,
          unit: "bps_of_notional",
          source: "test",
          asOf: "2026-08-28",
          confirmWithAccountant: true,
          verified: false,
          note: "",
        },
        finraTafBps: {
          value: 0,
          unit: "bps_of_notional",
          source: "test",
          asOf: "2026-08-28",
          confirmWithAccountant: true,
          verified: false,
          note: "",
        },
      },
      niit: { applies: false },
    };
    const costs = costsConfig({
      jurisdiction: "CA-US",
      perTradeFeeUsd: 5,
      spreadSlippageBps: 10,
      fxSpreadBps: 0,
      marginalRatePct: null,
    });
    const hurdle = computeNetHurdle(costs, profile, 1000);
    // (2*5/1000) + 2*10/10000 = 0.01 + 0.002 = 0.012
    expect(hurdle.minGrossMovePct).toBeCloseTo(0.012, 6);
    expect(hurdle.breakEvenLegs.fx).toBeUndefined();
    expect(hurdle.taxRateKnown).toBe(false);
    expect(hurdle.effectiveTaxRate).toBe(0);
    expect(hurdle.degradedReason).toBe(
      "costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)",
    );
  });

  it("the ON-CA FX leg is present and the CA-US FX leg is absent for otherwise identical inputs", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const costs = costsConfig({ fxSpreadBps: 150, marginalRatePct: null });

    const onCaHurdle = computeNetHurdle(costs, file.profiles["ON-CA"], 1000);
    const caUsHurdle = computeNetHurdle(
      costsConfig({ fxSpreadBps: 150, jurisdiction: "CA-US", marginalRatePct: null }),
      file.profiles["CA-US"],
      1000,
    );

    expect(onCaHurdle.breakEvenLegs.fx).toBeCloseTo(0.03, 6); // 2*150/10000
    expect(caUsHurdle.breakEvenLegs.fx).toBeUndefined();
    expect(onCaHurdle.minGrossMovePct).toBeGreaterThan(caUsHurdle.minGrossMovePct);
  });

  it("hand-computed after-tax reward via evaluateCandidateCosts for a known marginal rate and inclusion", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const costs = costsConfig({
      jurisdiction: "ON-CA",
      marginalRatePct: 40,
      capitalGainsInclusionPct: null, // use the profile's own 50%
      perTradeFeeUsd: 0,
      spreadSlippageBps: 0,
      fxSpreadBps: 0,
      minRewardRisk: 0.01,
    });
    const hurdle = computeNetHurdle(costs, file.profiles["ON-CA"], 1000);
    // effectiveTaxRate = 0.40 * 0.50 = 0.20
    expect(hurdle.effectiveTaxRate).toBeCloseTo(0.2, 6);

    const evaluation = evaluateCandidateCosts({
      entry: 100,
      target: 110,
      stop: 95,
      direction: "long",
      prospectiveSizeUsd: 1000,
      hurdle,
    });
    // quantity = floor(1000/100) = 10; grossReward = 10*10 = 100; afterTax = 100*(1-0.2) = 80
    expect(evaluation.quantity).toBe(10);
    expect(evaluation.grossRewardUsd).toBeCloseTo(100, 6);
    expect(evaluation.afterTaxRewardUsd).toBeCloseTo(80, 6);
    expect(evaluation.riskUsd).toBeCloseTo(50, 6); // (100-95)*10
    expect(evaluation.netRewardRisk).toBeCloseTo(1.6, 6); // 80/50
  });

  it("the same candidate passes under one jurisdiction and fails under the other", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const sizeUsd = 1000;

    // ON-CA: FX leg (150bps round-trip = 3%) makes a 5% move fail break-even.
    const onCaHurdle = computeNetHurdle(
      costsConfig({ jurisdiction: "ON-CA", marginalRatePct: null, spreadSlippageBps: 0 }),
      file.profiles["ON-CA"],
      sizeUsd,
    );
    // CA-US: no FX leg, tiny break-even — the same move clears easily.
    const caUsHurdle = computeNetHurdle(
      costsConfig({ jurisdiction: "CA-US", marginalRatePct: null, spreadSlippageBps: 0 }),
      file.profiles["CA-US"],
      sizeUsd,
    );

    // ON-CA's ~3% FX-driven break-even (2*150bps) swallows a 1% move; CA-US
    // has no FX leg, so its break-even is a fraction of a percent and the
    // same 1% move clears it easily.
    const args = {
      entry: 100,
      target: 101, // 1% move
      stop: 98,
      direction: "long" as const,
      prospectiveSizeUsd: sizeUsd,
    };

    const onCaEval = evaluateCandidateCosts({ ...args, hurdle: { ...onCaHurdle, minRewardRisk: 0.01 } });
    const caUsEval = evaluateCandidateCosts({ ...args, hurdle: { ...caUsHurdle, minRewardRisk: 0.01 } });

    expect(onCaEval.passesBreakEven).toBe(false);
    expect(caUsEval.passesBreakEven).toBe(true);
  });

  it("marginalRatePct:null produces taxRateKnown:false, zero haircut, and the exact degradedReason string", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const hurdle = computeNetHurdle(
      costsConfig({ marginalRatePct: null }),
      file.profiles["ON-CA"],
      1000,
    );
    expect(hurdle.taxRateKnown).toBe(false);
    expect(hurdle.effectiveTaxRate).toBe(0);
    expect(hurdle.effectiveTaxRatePct).toBe(0);
    expect(hurdle.degradedReason).toBe(
      "costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)",
    );
  });

  it("NIIT adds 3.8 points only when both profile.niit.applies and costs.niitEnabled", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const base = costsConfig({
      jurisdiction: "CA-US",
      marginalRatePct: 30,
      capitalGainsInclusionPct: null,
      niitEnabled: false,
    });
    const withoutNiit = computeNetHurdle(base, file.profiles["CA-US"], 1000);
    const withNiit = computeNetHurdle({ ...base, niitEnabled: true }, file.profiles["CA-US"], 1000);

    expect(withNiit.effectiveTaxRate - withoutNiit.effectiveTaxRate).toBeCloseTo(0.038, 6);

    // ON-CA's niit.applies is false — enabling the toggle must be a no-op.
    const onCaWithout = computeNetHurdle(
      costsConfig({ jurisdiction: "ON-CA", marginalRatePct: 30, niitEnabled: false }),
      file.profiles["ON-CA"],
      1000,
    );
    const onCaWith = computeNetHurdle(
      costsConfig({ jurisdiction: "ON-CA", marginalRatePct: 30, niitEnabled: true }),
      file.profiles["ON-CA"],
      1000,
    );
    expect(onCaWith.effectiveTaxRate).toBeCloseTo(onCaWithout.effectiveTaxRate, 6);
  });

  it("selects the long-term federal preferential rate when holdingPeriodDays exceeds the CA-US threshold", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const shortTerm = computeNetHurdle(
      costsConfig({ jurisdiction: "CA-US", marginalRatePct: 35, holdingPeriodDays: 10 }),
      file.profiles["CA-US"],
      1000,
    );
    const longTerm = computeNetHurdle(
      costsConfig({ jurisdiction: "CA-US", marginalRatePct: 35, holdingPeriodDays: 400 }),
      file.profiles["CA-US"],
      1000,
    );
    // Short-term: 0.35 * 1.00 (inclusion 100%) = 0.35. Long-term: the federal
    // preferential rate (0.15) replaces that math entirely.
    expect(shortTerm.effectiveTaxRate).toBeCloseTo(0.35, 6);
    expect(longTerm.effectiveTaxRate).toBeCloseTo(0.15, 6);
  });

  it("throws TaxProfileError when the unclamped effective tax rate reaches 100%", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    expect(() =>
      computeNetHurdle(
        costsConfig({
          jurisdiction: "CA-US",
          marginalRatePct: 100,
          capitalGainsInclusionPct: 100,
          niitEnabled: true,
        }),
        file.profiles["CA-US"],
        1000,
      ),
    ).toThrow(TaxProfileError);
  });
});

describe("evaluateCandidateCosts — un-priceable positions", () => {
  it("fails with a stated reason when the prospective size cannot buy one share", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const hurdle = computeNetHurdle(costsConfig({ marginalRatePct: null }), file.profiles["ON-CA"], 50);
    const evaluation = evaluateCandidateCosts({
      entry: 500, // 50 / 500 = 0 shares
      target: 550,
      stop: 480,
      direction: "long",
      prospectiveSizeUsd: 50,
      hurdle,
    });
    expect(evaluation.passes).toBe(false);
    expect(evaluation.quantity).toBe(0);
    expect(evaluation.failureReason).toContain("cannot buy at least one share");
  });
});

describe("costsDemotionReason", () => {
  it("opens with the greppable token and closes with D-23's verbatim re-target sentence", async () => {
    const file = await loadTaxProfiles(REAL_TAX_PROFILES_PATH);
    const hurdle = computeNetHurdle(
      costsConfig({ marginalRatePct: null, spreadSlippageBps: 0, fxSpreadBps: 0, minRewardRisk: 5 }),
      file.profiles["CA-US"],
      1000,
    );
    const evaluation = evaluateCandidateCosts({
      entry: 100,
      target: 105,
      stop: 98,
      direction: "long",
      prospectiveSizeUsd: 1000,
      hurdle,
    });
    const reason = costsDemotionReason(evaluation);
    expect(reason.startsWith("(demoted: costs — ")).toBe(true);
    expect(reason.endsWith("never silently re-targeted upward, because a wider target is a different trade)")).toBe(
      true,
    );
  });
});
