/**
 * Operator decision log — append-only accept/skip/close events.
 *
 * Task 1 (this file's origin) ships `recordAccept`/`recordSkip`. Task 3
 * adds `recordClose`, `readDay`, `readRange`, `findCandidate`,
 * `readDedupedByCandidateId`, and `acceptSkipStats`. Never rewrite a past
 * record — see `src/strategy/types.ts`'s `StrategyDecisionRecord` doc
 * comment for the append + reconcile-at-read-time contract.
 */

import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";
import type { StrategyCandidate, StrategyDecisionRecord } from "./types.js";

export interface DecisionOverrides {
  entry?: number;
  target?: number;
  stop?: number;
  size?: number;
}

export interface DecisionLogOptions {
  strategyDataDir?: string;
}

export class DecisionLog {
  private readonly store: JsonlStore<StrategyDecisionRecord>;

  constructor(options: DecisionLogOptions = {}) {
    this.store = new JsonlStore<StrategyDecisionRecord>(
      options.strategyDataDir ?? "./data/strategy",
      "decisions",
    );
  }

  /**
   * Accept a candidate. Writes the OPERATOR's chosen entry/target/stop/size
   * when an override is supplied for that field, and the engine's own
   * suggestion otherwise (D-09) — never both, never a merge of the two for
   * a single field.
   */
  async recordAccept(
    candidate: StrategyCandidate,
    overrides: DecisionOverrides = {},
    note?: string,
  ): Promise<StrategyDecisionRecord> {
    const decidedAt = new Date().toISOString();
    const record: StrategyDecisionRecord = {
      ...candidate,
      decision: "accept",
      decidedAt,
      operatorEntry: overrides.entry ?? candidate.suggestedEntry,
      operatorTarget: overrides.target ?? candidate.suggestedTarget,
      operatorStop: overrides.stop ?? candidate.suggestedStop,
      operatorSizeUsd: overrides.size ?? candidate.suggestedSizeUsd,
      ...(note !== undefined ? { operatorNote: note } : {}),
    };
    await this.store.appendManyOn([record], new Date(decidedAt));
    return record;
  }

  /** Skip a candidate. All four operator fields are recorded as null. */
  async recordSkip(candidate: StrategyCandidate, note?: string): Promise<StrategyDecisionRecord> {
    const decidedAt = new Date().toISOString();
    const record: StrategyDecisionRecord = {
      ...candidate,
      decision: "skip",
      decidedAt,
      operatorEntry: null,
      operatorTarget: null,
      operatorStop: null,
      operatorSizeUsd: null,
      ...(note !== undefined ? { operatorNote: note } : {}),
    };
    await this.store.appendManyOn([record], new Date(decidedAt));
    return record;
  }
}
