import type { MarketSnapshot } from "../polymarket/types.js";
import type { NewsArticle } from "../news/types.js";
import type { DigestPayload } from "../signal/types.js";

export type IntelligenceAlertKind =
  | "HEADLINE_PM_CONFIRMED"
  | "HEADLINE_PM_DIVERGENCE"
  | "DAILY_DIGEST";

/** Which correlator produced an alert. Undefined on records written before this was tracked. */
export type CorrelatorPath = "llm" | "rule-based";

export interface ConfirmedAlert {
  kind: "HEADLINE_PM_CONFIRMED";
  /** The headline that triggered correlation. */
  article: NewsArticle;
  /** Polymarket market that moved consistently with the headline. */
  market: MarketSnapshot;
  /** Signed pp change in yesPrice over the correlation window. */
  pmMovePp: number;
  /** Short rationale (LLM-generated when available, otherwise rule-based). */
  rationale: string;
  /** ISO timestamp the alert was created. */
  createdAt: string;
  /** Correlator that produced this alert. Lets rule-based fallbacks be filtered from the corpus. */
  correlator?: CorrelatorPath;
}

export interface DivergenceAlert {
  kind: "HEADLINE_PM_DIVERGENCE";
  market: MarketSnapshot;
  /** Signed pp change in yesPrice. */
  pmMovePp: number;
  /** Window we searched for news (e.g. "60 min"). */
  windowDescription: string;
  rationale: string;
  createdAt: string;
  /** Correlator that produced this alert. Lets rule-based fallbacks be filtered from the corpus. */
  correlator?: CorrelatorPath;
}

export interface DigestAlert {
  kind: "DAILY_DIGEST";
  /**
   * Digest flavor — corresponds to the three ET scheduled slots (Plan 10-06).
   * EVENING was used during M2-03; M2-04 replaced it with the MORNING/MIDDAY/CLOSE triple.
   */
  flavor: "MORNING" | "MIDDAY" | "CLOSE";
  /** Pre-formatted body (Markdown). */
  body: string;
  /** Structured payload for re-rendering or audit. Populated by DigestBuilder. */
  payload?: DigestPayload;
  createdAt: string;
}

export type IntelligenceAlert = ConfirmedAlert | DivergenceAlert | DigestAlert;
