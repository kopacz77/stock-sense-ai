/**
 * After-tax/after-fees net-hurdle cost model (M2-05 Plan 11-09, D-23/D-24).
 *
 * This module is the cost model for RANKING AND LEVEL decisions only —
 * tax-lot tracking, FIFO cost basis, and a live FX rate feed are M2-07's
 * charter and are deliberately absent here. Nothing in this file is tax
 * advice; every rate it consumes from `config/tax-profiles.json` carries a
 * `confirmWithAccountant` flag for a reason.
 *
 * Every function here takes primitives (or the plain `TaxProfile`/`CostsConfig`
 * objects), the same shape as `levels.ts`'s `computeLevels` — this file
 * deliberately never imports `StrategyCandidate` so there is no import cycle
 * with `types.ts` (which imports `Jurisdiction`/`CandidateCostEvaluation`/
 * `WashSaleFlag` FROM here... actually the reverse: those three types live in
 * `types.ts` and are imported here).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { CostsConfig } from "./config.js";
import { round2 } from "./levels.js";
import type { CandidateCostEvaluation, Jurisdiction, WashSaleFlag } from "./types.js";

export class TaxProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxProfileError";
  }
}

/** Uniform shape for every dollar/percent/day figure in `config/tax-profiles.json`. */
export interface AnnotatedRate {
  value: number;
  unit: "pct" | "bps_of_notional" | "days";
  source: string;
  asOf: string; // ISO date
  confirmWithAccountant: boolean;
  /** `false` means "written from general knowledge, not confirmed against a primary source on this date." */
  verified: boolean;
  note: string;
}

export interface TaxProfile {
  jurisdiction: Jurisdiction;
  label: string;
  gainCharacterisation: string;
  inclusionRatePct: AnnotatedRate;
  marginalRateSource?: {
    value: string;
    unit: string;
    source: string;
    asOf: string;
    confirmWithAccountant: boolean;
    verified: boolean;
    note: string;
  };
  businessIncomeRisk?: { flagged: boolean; note: string };
  shortTermThresholdDays?: AnnotatedRate;
  stateTreatsGainsAsOrdinaryIncome?: boolean;
  stateTreatsGainsAsOrdinaryIncomeNote?: string;
  traderTaxStatusRisk?: { flagged: boolean; note: string };
  longTerm: {
    available: boolean;
    note?: string;
    selectedBy?: string;
    federalPreferentialRatePct?: AnnotatedRate;
  };
  lossRule: { name: string; windowDays: number; note: string };
  fxApplies: boolean;
  fxNote?: string;
  regulatorySellFees: { secSection31FeeBps: AnnotatedRate; finraTafBps: AnnotatedRate };
  niit: {
    applies: boolean;
    ratePct?: AnnotatedRate;
    enabledBy?: string;
    thresholdNote?: string;
    note?: string;
  };
}

export interface TaxProfilesFile {
  version: number;
  lastUpdated: string;
  addedBy: string;
  disclaimer: string;
  profiles: Record<Jurisdiction, TaxProfile>;
}

/** `strategy costs --show`'s per-leg break-even breakdown and the resulting reward:risk hurdle. */
export interface NetHurdle {
  jurisdiction: Jurisdiction;
  minGrossMovePct: number;
  breakEvenLegs: { feeSlippage: number; regulatorySell: number; fx?: number };
  /** Decimal (e.g. 0.268 = 26.8%), clamped to [0, 0.99]. */
  effectiveTaxRate: number;
  effectiveTaxRatePct: number;
  taxRateKnown: boolean;
  minRewardRisk: number;
  degradedReason: string | null;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const REQUIRED_JURISDICTIONS: Jurisdiction[] = ["ON-CA", "CA-US"];

/** Reject any own key named `__proto__`/`constructor`/`prototype` at any depth (T-11-09-02). */
function assertNoProtoPollution(value: unknown, label: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoProtoPollution(v, `${label}[${i}]`));
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new TaxProfileError(`tax-profiles: forbidden key "${key}" at ${label}`);
    }
    assertNoProtoPollution((value as Record<string, unknown>)[key], `${label}.${key}`);
  }
}

function assertValidAnnotatedRate(rate: unknown, label: string): asserts rate is AnnotatedRate {
  if (typeof rate !== "object" || rate === null) {
    throw new TaxProfileError(`tax-profiles: ${label} must be an object`);
  }
  const r = rate as Record<string, unknown>;
  const value = r.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TaxProfileError(
      `tax-profiles: ${label}.value must be a finite, non-negative number (got ${String(value)})`,
    );
  }
  if (r.unit === "pct" && value > 100) {
    throw new TaxProfileError(
      `tax-profiles: ${label}.value must be <= 100 for unit "pct" (got ${value})`,
    );
  }
}

function assertValidTaxProfile(profile: Record<string, unknown>, jurisdiction: Jurisdiction): void {
  const label = `profiles["${jurisdiction}"]`;
  if (profile.jurisdiction !== jurisdiction) {
    throw new TaxProfileError(`tax-profiles: ${label}.jurisdiction must equal "${jurisdiction}"`);
  }
  if (typeof profile.label !== "string" || profile.label.length === 0) {
    throw new TaxProfileError(`tax-profiles: ${label}.label is required`);
  }
  assertValidAnnotatedRate(profile.inclusionRatePct, `${label}.inclusionRatePct`);

  const lossRule = profile.lossRule as { name?: unknown; windowDays?: unknown } | undefined;
  if (!lossRule || typeof lossRule.name !== "string" || typeof lossRule.windowDays !== "number") {
    throw new TaxProfileError(
      `tax-profiles: ${label}.lossRule must have a string name and numeric windowDays`,
    );
  }

  if (typeof profile.fxApplies !== "boolean") {
    throw new TaxProfileError(`tax-profiles: ${label}.fxApplies must be a boolean`);
  }

  const fees = profile.regulatorySellFees as
    | { secSection31FeeBps?: unknown; finraTafBps?: unknown }
    | undefined;
  if (!fees) {
    throw new TaxProfileError(`tax-profiles: ${label}.regulatorySellFees is required`);
  }
  assertValidAnnotatedRate(
    fees.secSection31FeeBps,
    `${label}.regulatorySellFees.secSection31FeeBps`,
  );
  assertValidAnnotatedRate(fees.finraTafBps, `${label}.regulatorySellFees.finraTafBps`);

  const longTerm = profile.longTerm as
    | { available?: unknown; federalPreferentialRatePct?: unknown }
    | undefined;
  if (!longTerm || typeof longTerm.available !== "boolean") {
    throw new TaxProfileError(`tax-profiles: ${label}.longTerm.available must be a boolean`);
  }
  if (longTerm.available) {
    assertValidAnnotatedRate(
      longTerm.federalPreferentialRatePct,
      `${label}.longTerm.federalPreferentialRatePct`,
    );
  }

  const niit = profile.niit as { applies?: unknown; ratePct?: unknown } | undefined;
  if (!niit || typeof niit.applies !== "boolean") {
    throw new TaxProfileError(`tax-profiles: ${label}.niit.applies must be a boolean`);
  }
  if (niit.applies) {
    assertValidAnnotatedRate(niit.ratePct, `${label}.niit.ratePct`);
  }

  if (jurisdiction === "CA-US") {
    assertValidAnnotatedRate(profile.shortTermThresholdDays, `${label}.shortTermThresholdDays`);
  }
}

/**
 * Read + validate `config/tax-profiles.json`. Parses with `JSON.parse` only
 * (never evaluates the file), rejects `__proto__`/`constructor`/`prototype`
 * keys at any depth, asserts both jurisdictions and every required field are
 * present, and asserts every `AnnotatedRate.value` is finite, non-negative,
 * and — for a `"pct"` unit — not above 100.
 *
 * A missing/unreadable/malformed file is an ERROR here, unlike
 * `loadStrategyConfig`'s ENOENT tolerance — this file IS the definition of
 * the cost model; silently continuing without it would mean silently
 * continuing without a jurisdiction.
 */
export async function loadTaxProfiles(
  profilesPath = "./config/tax-profiles.json",
): Promise<TaxProfilesFile> {
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(profilesPath), "utf8");
  } catch (err) {
    throw new TaxProfileError(
      `tax-profiles: failed to read "${profilesPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new TaxProfileError(
      `tax-profiles: "${profilesPath}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  assertNoProtoPollution(parsed, "tax-profiles");

  const file = parsed as Partial<TaxProfilesFile> | null;
  if (
    typeof file !== "object" ||
    file === null ||
    typeof file.profiles !== "object" ||
    file.profiles === null
  ) {
    throw new TaxProfileError(
      `tax-profiles: "${profilesPath}" must have a top-level "profiles" object`,
    );
  }

  for (const jurisdiction of REQUIRED_JURISDICTIONS) {
    const profile = (file.profiles as Record<string, unknown>)[jurisdiction];
    if (!profile || typeof profile !== "object") {
      throw new TaxProfileError(`tax-profiles: missing required jurisdiction "${jurisdiction}"`);
    }
    assertValidTaxProfile(profile as Record<string, unknown>, jurisdiction);
  }

  return file as TaxProfilesFile;
}

/** Resolve `costs.jurisdiction`'s profile from an already-loaded `TaxProfilesFile`. */
export function resolveActiveProfile(file: TaxProfilesFile, costs: CostsConfig): TaxProfile {
  const profile = file.profiles[costs.jurisdiction];
  if (!profile) {
    throw new TaxProfileError(`tax-profiles: no profile for jurisdiction "${costs.jurisdiction}"`);
  }
  return profile;
}

/**
 * Turn `costs` + the active `profile` + a prospective position size into a
 * two-part net hurdle (D-23): a fee/slippage/FX/regulatory-fee break-even on
 * the gross move, and an after-tax-reward ÷ pre-tax-risk minimum.
 */
export function computeNetHurdle(
  costs: CostsConfig,
  profile: TaxProfile,
  sizeUsd: number,
): NetHurdle {
  const feeSlippageLeg =
    sizeUsd > 0
      ? (2 * costs.perTradeFeeUsd) / sizeUsd + (2 * costs.spreadSlippageBps) / 10000
      : Number.POSITIVE_INFINITY;
  const fxLeg = profile.fxApplies ? (2 * costs.fxSpreadBps) / 10000 : 0;
  const regulatorySellLeg =
    (profile.regulatorySellFees.secSection31FeeBps.value +
      profile.regulatorySellFees.finraTafBps.value) /
    10000;

  const breakEvenLegs: NetHurdle["breakEvenLegs"] = {
    feeSlippage: feeSlippageLeg,
    regulatorySell: regulatorySellLeg,
  };
  if (profile.fxApplies) breakEvenLegs.fx = fxLeg;

  const minGrossMovePct = feeSlippageLeg + fxLeg + regulatorySellLeg;

  const taxRateKnown = costs.marginalRatePct !== null;
  let effectiveTaxRate = 0;
  let degradedReason: string | null = null;

  if (!taxRateKnown) {
    degradedReason =
      "costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)";
  } else {
    const inclusion = (costs.capitalGainsInclusionPct ?? profile.inclusionRatePct.value) / 100;
    const useLongTerm =
      profile.longTerm.available &&
      costs.holdingPeriodDays !== null &&
      profile.shortTermThresholdDays !== undefined &&
      costs.holdingPeriodDays > profile.shortTermThresholdDays.value;

    if (useLongTerm && profile.longTerm.federalPreferentialRatePct) {
      effectiveTaxRate = profile.longTerm.federalPreferentialRatePct.value / 100;
    } else {
      effectiveTaxRate = ((costs.marginalRatePct as number) / 100) * inclusion;
    }

    if (profile.niit.applies && costs.niitEnabled && profile.niit.ratePct) {
      effectiveTaxRate += profile.niit.ratePct.value / 100;
    }

    if (effectiveTaxRate >= 1) {
      throw new TaxProfileError(
        `computeNetHurdle: effective tax rate reached/exceeded 100% (${(effectiveTaxRate * 100).toFixed(1)}%) — check costs.marginalRatePct/capitalGainsInclusionPct/niitEnabled against the ${profile.jurisdiction} profile`,
      );
    }
    effectiveTaxRate = Math.min(Math.max(effectiveTaxRate, 0), 0.99);
  }

  return {
    jurisdiction: costs.jurisdiction,
    minGrossMovePct,
    breakEvenLegs,
    effectiveTaxRate,
    effectiveTaxRatePct: effectiveTaxRate * 100,
    taxRateKnown,
    minRewardRisk: costs.minRewardRisk,
    degradedReason,
  };
}

export interface EvaluateCandidateCostsArgs {
  entry: number;
  target: number;
  stop: number;
  direction: "long" | "short";
  prospectiveSizeUsd: number;
  hurdle: NetHurdle;
}

/**
 * Evaluate one candidate's prospective size against `hurdle`. Never mutates
 * `entry`/`target`/`stop` — a failing candidate is reported as failing, not
 * re-targeted (D-23's own words: "never silently re-targeted upward,
 * because a wider target is a different trade").
 */
export function evaluateCandidateCosts(args: EvaluateCandidateCostsArgs): CandidateCostEvaluation {
  const { entry, target, stop, prospectiveSizeUsd, hurdle } = args;

  const base = {
    jurisdiction: hurdle.jurisdiction,
    prospectiveSizeUsd,
    minRewardRisk: hurdle.minRewardRisk,
    effectiveTaxRatePct: hurdle.effectiveTaxRatePct,
    taxRateKnown: hurdle.taxRateKnown,
    breakEvenPct: hurdle.minGrossMovePct,
    washSaleFlag: null as WashSaleFlag | null,
  };

  if (!(prospectiveSizeUsd > 0) || !(entry > 0)) {
    return {
      ...base,
      quantity: 0,
      grossMovePct: 0,
      grossRewardUsd: 0,
      afterTaxRewardUsd: 0,
      riskUsd: 0,
      netRewardRisk: 0,
      passesBreakEven: false,
      passesRewardRisk: false,
      passes: false,
      failureReason: `prospective size $${prospectiveSizeUsd} at entry ${entry} cannot buy at least one share`,
    };
  }

  const quantity = Math.floor(prospectiveSizeUsd / entry);
  if (quantity < 1) {
    return {
      ...base,
      quantity,
      grossMovePct: 0,
      grossRewardUsd: 0,
      afterTaxRewardUsd: 0,
      riskUsd: 0,
      netRewardRisk: 0,
      passesBreakEven: false,
      passesRewardRisk: false,
      passes: false,
      failureReason: `prospective size $${prospectiveSizeUsd} at entry ${entry} cannot buy at least one share`,
    };
  }

  const grossMovePct = Math.abs(target - entry) / entry;
  const grossRewardUsd = Math.abs(target - entry) * quantity;
  const riskUsd = Math.abs(entry - stop) * quantity;

  if (!(riskUsd > 0)) {
    return {
      ...base,
      quantity,
      grossMovePct,
      grossRewardUsd,
      afterTaxRewardUsd: 0,
      riskUsd: 0,
      netRewardRisk: 0,
      passesBreakEven: grossMovePct >= hurdle.minGrossMovePct,
      passesRewardRisk: false,
      passes: false,
      failureReason: `zero stop distance (entry ${entry}, stop ${stop}) — cannot compute risk`,
    };
  }

  const afterTaxRewardUsd = round2(grossRewardUsd * (1 - hurdle.effectiveTaxRate));
  const netRewardRisk = afterTaxRewardUsd / riskUsd;
  const passesBreakEven = grossMovePct >= hurdle.minGrossMovePct;
  const passesRewardRisk = netRewardRisk >= hurdle.minRewardRisk;

  return {
    ...base,
    quantity,
    grossMovePct,
    grossRewardUsd,
    afterTaxRewardUsd,
    riskUsd,
    netRewardRisk,
    passesBreakEven,
    passesRewardRisk,
    passes: passesBreakEven && passesRewardRisk,
  };
}

/**
 * The rationale suffix the engine appends to a cost-demoted candidate.
 * Opens with the literal, greppable token `(demoted: costs — ` (matches the
 * shape of `hasDegenerateLevels`'s `(demoted: degenerate levels — ` reason)
 * and always closes with D-23's own words verbatim — there is no re-target
 * code path anywhere in this plan.
 */
export function costsDemotionReason(evaluation: CandidateCostEvaluation): string {
  const parts: string[] = [];
  if (!evaluation.passesBreakEven) {
    parts.push(
      `gross move ${(evaluation.grossMovePct * 100).toFixed(2)}% is below the ` +
        `${(evaluation.breakEvenPct * 100).toFixed(2)}% fee/slippage break-even for a ` +
        `$${evaluation.prospectiveSizeUsd} prospective size`,
    );
  }
  if (!evaluation.passesRewardRisk) {
    const taxLabel = evaluation.taxRateKnown
      ? `effective tax rate ${evaluation.effectiveTaxRatePct.toFixed(1)}%`
      : "pre-tax, marginalRatePct unset";
    parts.push(
      `net reward:risk ${evaluation.netRewardRisk.toFixed(2)} is below the required ` +
        `${evaluation.minRewardRisk.toFixed(2)} for ${evaluation.jurisdiction} (${taxLabel})`,
    );
  }
  if (evaluation.failureReason && parts.length === 0) {
    parts.push(evaluation.failureReason);
  }
  return `(demoted: costs — ${parts.join("; ")}; never silently re-targeted upward, because a wider target is a different trade)`;
}

// ─────────────────────────────────────────────────────────────────────────
// Wash-sale / superficial-loss flag (Plan 11-09 Task 2, D-24)
// ─────────────────────────────────────────────────────────────────────────

/** The subset of a `StrategyDecisionRecord` this file needs — never imports `StrategyCandidate`/`StrategyDecisionRecord` from `types.ts`. */
export interface DecisionRecordLike {
  candidateId: string;
  ticker: string;
  closedAt?: string;
  closeRealizedPnlUsd?: number;
}

export interface LossClosure {
  ticker: string;
  priorCandidateId: string;
  priorClosedAt: string; // ISO 8601
  priorRealizedPnlUsd: number;
}

/**
 * Given already-read decision-log rows, keep only closed positions realized
 * at a LOSS within `windowDays` calendar days ending at `asOfIso` inclusive,
 * and return the most recent such closure per (upper-cased) ticker. Pure —
 * the caller reads the decision log ONCE per `generateCandidates` run and
 * shares this map across every candidate (T-11-09-05); this function itself
 * performs no I/O.
 */
export function findRecentLossClosures(
  records: DecisionRecordLike[],
  asOfIso: string,
  windowDays: number,
): Map<string, LossClosure> {
  const asOfMs = Date.parse(`${asOfIso}T00:00:00.000Z`);
  const windowStartMs = asOfMs - windowDays * 24 * 60 * 60 * 1000;
  const byTicker = new Map<string, LossClosure>();

  for (const record of records) {
    if (!record.closedAt) continue;
    if (record.closeRealizedPnlUsd === undefined || record.closeRealizedPnlUsd >= 0) continue;
    const closedMs = Date.parse(record.closedAt);
    if (Number.isNaN(closedMs) || closedMs < windowStartMs || closedMs > asOfMs) continue;

    const ticker = record.ticker.toUpperCase();
    const existing = byTicker.get(ticker);
    if (!existing || closedMs > Date.parse(existing.priorClosedAt)) {
      byTicker.set(ticker, {
        ticker,
        priorCandidateId: record.candidateId,
        priorClosedAt: record.closedAt,
        priorRealizedPnlUsd: record.closeRealizedPnlUsd,
      });
    }
  }

  return byTicker;
}

/**
 * `null` when `ticker` has no recent loss closure; otherwise a `WashSaleFlag`
 * whose `rule`/`windowDays` come from the ACTIVE profile's `lossRule` — the
 * same decision-log history therefore produces `superficial-loss` under
 * ON-CA and `wash-sale` under CA-US without a second code path.
 */
export function buildWashSaleFlag(
  ticker: string,
  lossClosures: Map<string, LossClosure>,
  profile: TaxProfile,
): WashSaleFlag | null {
  const closure = lossClosures.get(ticker.toUpperCase());
  if (!closure) return null;
  return {
    ticker: closure.ticker,
    rule: profile.lossRule.name,
    windowDays: profile.lossRule.windowDays,
    priorCandidateId: closure.priorCandidateId,
    priorClosedAt: closure.priorClosedAt,
    priorRealizedPnlUsd: closure.priorRealizedPnlUsd,
  };
}

/**
 * Rationale suffix for a flagged (never demoted) candidate. Nothing in this
 * path may call `costsDemotionReason` or move a candidate out of `rankable`
 * — the flag is informational only.
 */
export function washSaleRationaleNote(flag: WashSaleFlag): string {
  const lossAbs = Math.abs(flag.priorRealizedPnlUsd).toFixed(2);
  const closedDateOnly = flag.priorClosedAt.split("T")[0] ?? flag.priorClosedAt;
  return (
    `(flag: ${flag.rule} — ${flag.ticker} closed at a loss of $${lossAbs} on ${closedDateOnly}, ` +
    `within the ${flag.windowDays}-day window. Informational only — this does not demote the candidate.)`
  );
}
