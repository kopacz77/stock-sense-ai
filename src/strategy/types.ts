/**
 * M2-05 AI-Augmented Strategy Engine — shared types.
 *
 * These types define the contract between the per-signal-type modules
 * (`src/strategy/signals/*`), `strategy-engine.ts`, `decision-log.ts`, and
 * the `strategy` CLI. Plans 11-03 and 11-04 implement the remaining three
 * `SignalTypeModule`s against this exact contract — nothing downstream may
 * change `SignalTypeModule`, `RawSignal`, or `StrategyCandidate` without
 * saying so explicitly (this plan is the phase tracer).
 *
 * Single-writer note: `data/strategy/candidates-*.jsonl` is written only by
 * `StrategyEngine.generateCandidates`; `data/strategy/decisions-*.jsonl` is
 * written only by `DecisionLog`. No strategy state is ever written into
 * `data/intel/`, which stays M2-04's substrate (D-20).
 */

import type { TickerDaySummary } from "../market-intelligence/signal/types.js";
import type { StrategyConfig } from "./config.js";
import type { VixQuote } from "./vix-provider.js";

/** The four v1 signal types (CONTEXT.md "Four signal types ship in v1"). */
export type SignalType =
  | "CATALYST_ANCHORED"
  | "SENTIMENT_VELOCITY"
  | "SECTOR_ROTATION_FROM_PM"
  | "FADE_OVERSHOOT";

/** VIX-close-derived volatility regime, drives position sizing (D-06). */
export type VixRegime = "calm" | "elevated" | "stressed";

/**
 * Whether a signal type's candidates are fully ranked+sized ("core"),
 * ranked+sized only when a data-coverage precondition holds ("gated"), or
 * always excluded from ranking/sizing but still recorded for evidence
 * accumulation ("shadow"). Set per type in `config/strategy-config.json`
 * (`signalModes`).
 */
export type SignalMode = "core" | "gated" | "shadow";

/** How a persisted candidate was treated by the engine's partition step. */
export type CandidateMode = "ranked" | "sub-threshold" | "shadow";

/**
 * Runtime-selectable jurisdiction for the after-tax/after-fees net-hurdle
 * cost model (D-24, Plan 11-09). Both rule sets are fully specified in
 * `config/tax-profiles.json` — see `src/strategy/costs.ts`.
 */
export type Jurisdiction = "ON-CA" | "CA-US";

/**
 * Wash-sale (US, CA-US profile) / superficial-loss (Canada, ON-CA profile)
 * flag — informational only. Attached to a candidate whose ticker was
 * closed at a loss within the active profile's `lossRule.windowDays`
 * trailing days (`src/strategy/costs.ts`'s `buildWashSaleFlag`). NEVER
 * demotes a candidate; only annotates it and its rationale.
 */
export interface WashSaleFlag {
  /**
   * The flagged candidate's own ticker. Always equal to the candidate it is
   * attached to (a flag is only built by looking up THAT candidate's own
   * ticker in the loss-closure map) — carried on the flag anyway so it
   * stays self-describing wherever it travels independently (the persisted
   * JSONL row, the redacted web payload, `washSaleRationaleNote`'s single-arg
   * signature).
   */
  ticker: string;
  rule: string; // the active profile's lossRule.name — "superficial-loss" | "wash-sale"
  windowDays: number;
  priorCandidateId: string;
  priorClosedAt: string; // ISO 8601
  priorRealizedPnlUsd: number;
}

/**
 * Result of running a candidate's prospective entry/target/stop/size
 * through the active jurisdiction's net hurdle (D-23/D-24,
 * `src/strategy/costs.ts`'s `evaluateCandidateCosts`). Attached to every
 * ranked-eligible and cost-demoted candidate as
 * `StrategyCandidate.costEvaluation` — `null` for shadow candidates (never
 * sized, so no prospective size) and degenerate-levels candidates (no
 * priceable risk).
 */
export interface CandidateCostEvaluation {
  jurisdiction: Jurisdiction;
  prospectiveSizeUsd: number;
  quantity: number;
  grossMovePct: number;
  breakEvenPct: number;
  grossRewardUsd: number;
  afterTaxRewardUsd: number;
  riskUsd: number;
  netRewardRisk: number;
  minRewardRisk: number;
  effectiveTaxRatePct: number;
  taxRateKnown: boolean;
  passesBreakEven: boolean;
  passesRewardRisk: boolean;
  passes: boolean;
  /** Set only when `passes` is false because the position was un-priceable (too small / zero risk) rather than a genuine hurdle failure. */
  failureReason?: string;
  /** Populated by the engine from the decision log; `null` when no recent same-ticker loss closure exists. */
  washSaleFlag: WashSaleFlag | null;
}

/**
 * How a candidate's target price is computed. `atr` is the common case
 * (ATR-multiple-from-entry); `pctOfClose` covers binary catalysts like FDA
 * PDUFA decisions where the move is a deliberate fixed percentage, not an
 * ATR artifact; `absoluteMove` covers cases like earnings where a supplied
 * average-historical-move number should be used verbatim. See
 * `src/strategy/levels.ts` for how each kind is priced and (for `atr`
 * only) clamped.
 */
export type TargetSpec =
  | { kind: "atr"; period: 3 | 5 | 10; multiple: number }
  | { kind: "pctOfClose"; pct: number }
  | { kind: "absoluteMove"; move: number };

/**
 * A signal-type module's raw output before the engine assigns an id, VIX
 * regime, computed levels, or a size. One `RawSignal` per (ticker ×
 * signal type) the module wants to surface today.
 */
export interface RawSignal {
  signalType: SignalType;
  ticker: string;
  score: number; // [0,1], native per-type scale — see each module's score fn
  direction: "long" | "short";
  rationale: string; // human-readable why, printed by the CLI and logged
  entryStyle: "close" | "pullback";
  targetSpec: TargetSpec;
  timeHorizonDays: number;
  /**
   * Defaults to 1 when omitted. Exists so a `binary`-direction catalyst can
   * emit its two opposite-direction candidates at 0.5 each (a future
   * catalyst-anchored module concern) without this file changing again —
   * `sizing.ts`'s `suggestSizeUsd` multiplies by this value.
   */
  sizeModifier?: number;
  sourceArticleIds: string[];
  sourcePmMarkets: Array<{ marketId: string; slug: string; movePp: number }>;
  sourceCatalystId?: string;
}

/**
 * Everything a `SignalTypeModule.generate` call needs to read. Later plans
 * extend this by adding fields — existing fields are never repurposed.
 */
export interface SignalContext {
  asOfDate: string; // ISO YYYY-MM-DD
  rollups: TickerDaySummary[];
  config: StrategyConfig;
  intelDataDir: string;
}

/**
 * The contract every `src/strategy/signals/*` module implements. `gate` is
 * optional: a `mode: "gated"` type (e.g. SENTIMENT_VELOCITY, which needs
 * scored-article coverage) can decline to run with a stated reason instead
 * of silently emitting nothing — the engine calls `gate` before `generate`
 * and records the reason in `StrategyRunResult.skippedTypes` (never a
 * silent zero-delta, per CONTEXT.md's "v1 signal set" decision).
 */
export interface SignalTypeModule {
  readonly signalType: SignalType;
  readonly mode: SignalMode;
  generate(ctx: SignalContext): Promise<RawSignal[]>;
  gate?(ctx: SignalContext): Promise<{ ok: boolean; reason: string }>;
}

/**
 * A `RawSignal` after the engine has assigned an id, resolved VIX regime,
 * computed entry/target/stop, and (for ranked candidates only) a size.
 * Persisted to `data/strategy/candidates-YYYY-MM-DD.jsonl` — every
 * candidate the engine computes (ranked, sub-threshold, and shadow alike)
 * is written here so a later CLI process can resolve a `candidateId`.
 */
export interface StrategyCandidate extends RawSignal {
  candidateId: string; // `${asOfDate}-${signalType}-${ticker}-${shortHash}`
  generatedAt: string; // ISO 8601, also the entropy source for candidateId
  asOfDate: string; // ISO YYYY-MM-DD
  mode: CandidateMode;
  vixRegime: VixRegime;
  vixCloseAtGeneration: number;
  vixSource: "live" | "cache" | "fallback";
  suggestedEntry: number;
  suggestedTarget: number;
  suggestedStop: number;
  /** null for sub-threshold and shadow candidates — only ranked candidates get a size. */
  suggestedSizeUsd: number | null;
  /** The period the *target* used. The stop always uses ATR_5 regardless — see levels.ts. */
  atrPeriodUsed: 3 | 5 | 10;
  atrValue: number;
  /**
   * The after-tax/after-fees net hurdle evaluation for this candidate's
   * prospective size (Plan 11-09, D-23/D-24). `null` for shadow candidates
   * (never sized) and degenerate-levels candidates (no priceable risk) —
   * every other candidate (ranked, cost-demoted, or otherwise
   * sub-threshold) carries one.
   */
  costEvaluation: CandidateCostEvaluation | null;
}

/**
 * One accept/skip/close event in the decision log. Extends
 * `StrategyCandidate` (all the engine's suggestion fields) with the
 * operator's decision. Persisted to `data/strategy/decisions-YYYY-MM-DD.jsonl`,
 * append-only — `close` appends a NEW record sharing `candidateId` rather
 * than mutating the accept/skip row; readers reconcile by taking the
 * record with the latest `closedAt ?? decidedAt` (see decision-log.ts).
 */
export interface StrategyDecisionRecord extends StrategyCandidate {
  decision: "accept" | "skip";
  decidedAt: string; // ISO 8601
  /** Operator's chosen levels/size when supplied at accept time; null on skip. */
  operatorEntry: number | null;
  operatorTarget: number | null;
  operatorStop: number | null;
  operatorSizeUsd: number | null;
  operatorNote?: string;
  closedAt?: string; // ISO 8601, set only on a close-append record
  closeExitPrice?: number;
  closeRealizedPnlUsd?: number;
  closeRealizedPnlPct?: number;
  closeOperatorNote?: string;
  /**
   * Plan 11-09 (D-23/D-24). These three are persisted TOGETHER so an
   * accepted record stays self-describing if the operator later edits
   * `tax-profiles.json` — a later recomputation that disagrees with what
   * was recorded here is then visibly a profile change, not a corrupted
   * number (T-11-09-06). Computed from the OPERATOR's own entry/target/size
   * (D-09/D-12), never the engine's suggestion. `null` on skip, and `null`
   * on accept when `costs.marginalRatePct` is unset or the cost config
   * failed to load — an operator's accept is never lost to a config
   * problem.
   */
  afterTaxRewardUsd: number | null;
  /** The active jurisdiction at accept time; `null` on skip or a cost-config failure. */
  costJurisdiction: Jurisdiction | null;
  /** The effective tax rate (percent) that produced `afterTaxRewardUsd`; `null` when the tax rate was unknown or on skip/config failure. */
  costEffectiveTaxRatePct: number | null;
}

/** The full output of one `StrategyEngine.generateCandidates` call. */
export interface StrategyRunResult {
  asOfDate: string; // ISO YYYY-MM-DD
  vix: VixQuote;
  ranked: StrategyCandidate[]; // score >= scoreFloor, capped at maxCandidatesPerDay
  subThreshold: StrategyCandidate[]; // next subThresholdCount below the floor
  shadow: StrategyCandidate[]; // shadow-mode candidates, never ranked or sized
  skippedTypes: Array<{ signalType: SignalType; reason: string }>;
  /**
   * Tickers whose `MarketDataService.fetchHistoricalData` call threw (all
   * providers exhausted) — that ticker's raw signals are excluded from
   * `ranked`/`subThreshold`/`shadow` entirely rather than aborting the
   * whole run (CR-01: one bad ticker must not cost every other ticker's
   * candidates for the day).
   */
  skippedTickers: Array<{ ticker: string; reason: string }>;
}
