import type { MarketSnapshot } from "../polymarket/types.js";
import type { NewsArticle } from "../news/types.js";

export type IntelligenceAlertKind =
  | "HEADLINE_PM_CONFIRMED"
  | "HEADLINE_PM_DIVERGENCE"
  | "DAILY_DIGEST";

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
}

export interface DigestAlert {
  kind: "DAILY_DIGEST";
  flavor: "MORNING" | "EVENING";
  /** Pre-formatted body (Markdown). */
  body: string;
  createdAt: string;
}

export type IntelligenceAlert = ConfirmedAlert | DivergenceAlert | DigestAlert;
