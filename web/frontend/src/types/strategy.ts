/**
 * M2-05 AI-Augmented Strategy Engine — browser-side mirror of
 * `src/strategy/types.ts` and `src/strategy/vix-provider.ts`.
 *
 * The frontend builds separately from `src/` (see `web/frontend/package.json`
 * and `pnpm build:frontend`), so these types are a hand-written copy, not an
 * import — a divergence here is a frontend-only bug to fix in this file,
 * never a reason to reach across the build boundary. Keep field names and
 * shapes byte-identical to the backend contract; `StrategyPage.tsx` and
 * `services/api.ts` are the only two files that should ever import from
 * here.
 */

/** The four v1 signal types (CONTEXT.md "Four signal types ship in v1"). */
export type SignalType =
  | 'CATALYST_ANCHORED'
  | 'SENTIMENT_VELOCITY'
  | 'SECTOR_ROTATION_FROM_PM'
  | 'FADE_OVERSHOOT';

/** VIX-close-derived volatility regime, drives position sizing (D-06). */
export type VixRegime = 'calm' | 'elevated' | 'stressed';

/** How a persisted candidate was treated by the engine's partition step. */
export type CandidateMode = 'ranked' | 'sub-threshold' | 'shadow';

/** How a VIX quote was resolved for the day it's stamped against. */
export type VixSource = 'live' | 'cache' | 'fallback';

/** Runtime-selectable jurisdiction for the after-tax/after-fees net-hurdle cost model (Plan 11-09, D-24). */
export type Jurisdiction = 'ON-CA' | 'CA-US';

/**
 * Wash-sale (US) / superficial-loss (Canada) flag — informational only,
 * never demotes a candidate. Mirrors `WashSaleFlag` in `src/strategy/types.ts`.
 */
export interface WashSaleFlag {
  ticker: string;
  rule: string; // "superficial-loss" | "wash-sale"
  windowDays: number;
  priorCandidateId: string;
  priorClosedAt: string; // ISO 8601
  priorRealizedPnlUsd: number;
}

/**
 * Plan 11-09 (D-23/D-24). This mirror is DELIBERATELY NARROWER than
 * `CandidateCostEvaluation` in `src/strategy/types.ts` — the server's
 * `redactCostEvaluation` (`src/web/server.ts`) omits `effectiveTaxRatePct`
 * and every dollar figure that inverts back to it (`grossRewardUsd`,
 * `afterTaxRewardUsd`, `riskUsd`, `quantity`) before this ever reaches the
 * browser. Widening this interface to match the backend's full shape is a
 * SECURITY REGRESSION, not a sync fix — it would only be correct once the
 * server itself stops redacting.
 */
export interface CandidateCostEvaluation {
  jurisdiction: Jurisdiction;
  prospectiveSizeUsd: number;
  grossMovePct: number;
  breakEvenPct: number;
  netRewardRisk: number;
  minRewardRisk: number;
  passesBreakEven: boolean;
  passesRewardRisk: boolean;
  passes: boolean;
  taxRateKnown: boolean;
  washSaleFlag: WashSaleFlag | null;
}

export interface VixQuote {
  date: string; // ISO YYYY-MM-DD
  close: number;
  regime: VixRegime;
  source: VixSource;
  fetchedAt: string; // ISO 8601
}

/**
 * A `RawSignal` after the engine has assigned an id, resolved VIX regime,
 * computed entry/target/stop, and (for ranked candidates only) a size.
 * Mirrors `StrategyCandidate` in `src/strategy/types.ts`.
 */
export interface StrategyCandidate {
  candidateId: string; // `${asOfDate}-${signalType}-${ticker}-${shortHash}`
  signalType: SignalType;
  ticker: string;
  score: number; // [0,1], native per-type scale
  direction: 'long' | 'short';
  rationale: string; // human-readable why — never truncate in the UI
  entryStyle: 'close' | 'pullback';
  timeHorizonDays: number;
  sourceArticleIds: string[];
  sourcePmMarkets: Array<{ marketId: string; slug: string; movePp: number }>;
  sourceCatalystId?: string;
  generatedAt: string; // ISO 8601
  asOfDate: string; // ISO YYYY-MM-DD
  mode: CandidateMode;
  vixRegime: VixRegime;
  vixCloseAtGeneration: number;
  vixSource: VixSource;
  suggestedEntry: number;
  suggestedTarget: number;
  suggestedStop: number;
  /** null for sub-threshold and shadow candidates — only ranked candidates get a size. */
  suggestedSizeUsd: number | null;
  atrPeriodUsed: 3 | 5 | 10;
  atrValue: number;
  /**
   * Plan 11-09 (D-23/D-24): the after-tax/after-fees net hurdle evaluation
   * for this candidate's prospective size, redacted server-side. `null` for
   * shadow candidates (never sized) and degenerate-levels candidates (no
   * priceable risk).
   */
  costEvaluation: CandidateCostEvaluation | null;
  /**
   * CR-02: the server joins this candidate against the decision log
   * (`GET /api/strategy/candidates`) so a page reload can hydrate
   * already-decided cards instead of losing that state to local-only
   * React state. `null` when no accept/skip has been recorded yet.
   */
  decision?: 'accept' | 'skip' | null;
}

export interface SkippedSignalType {
  signalType: SignalType;
  reason: string;
}

/** The shape `GET /api/strategy/candidates` returns. */
export interface StrategyCandidatesResponse {
  asOfDate: string; // ISO YYYY-MM-DD
  /** false = no run persisted for this date yet; true = a run happened (D-14 web equivalent). */
  generated: boolean;
  vix: VixQuote | null;
  ranked: StrategyCandidate[];
  subThreshold: StrategyCandidate[];
  shadow: StrategyCandidate[];
  skippedTypes: SkippedSignalType[];
}

/** Operator-editable overrides sent to `POST /api/strategy/candidates/:id/accept`. */
export interface AcceptCandidateOverrides {
  entry?: number;
  target?: number;
  stop?: number;
  sizeUsd?: number;
  note?: string;
}

export interface DecisionRecordResponse {
  success: boolean;
  record: StrategyCandidate & Record<string, unknown>;
}
