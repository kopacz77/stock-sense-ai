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
