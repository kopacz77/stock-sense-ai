/**
 * Operator decision log — append-only accept/skip/close events.
 *
 * Append + reconcile-at-read-time (same precedent as
 * `backlog-drain.ts`'s day-bucketed writes): every write is a new row,
 * never a rewrite of a past record. `recordClose` appends a NEW record
 * sharing the original's `candidateId` rather than mutating the
 * accept/skip row. Readers dedup by `candidateId`, keeping the record
 * with the latest `closedAt ?? decidedAt` — see
 * `readDedupedByCandidateId`.
 */

import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";
import { round2 } from "./levels.js";
import type { StrategyCandidate, StrategyDecisionRecord } from "./types.js";

export class DecisionLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionLogError";
  }
}

export interface DecisionOverrides {
  entry?: number;
  target?: number;
  stop?: number;
  size?: number;
}

export interface CloseOutcome {
  exitPrice: number;
  /** ISO YYYY-MM-DD. Defaults to today when omitted. */
  exitDate?: string;
  note?: string;
}

export interface DecisionLogOptions {
  strategyDataDir?: string;
}

/** `{ accepted, skipped, total, acceptRate, band }` — D-13's 30-day accept-rate report. */
export interface AcceptSkipStats {
  accepted: number;
  skipped: number;
  total: number;
  acceptRate: number;
  /** "low" < 0.10, "sweet-spot" in [0.20, 0.40], "high" > 0.60, "neutral" otherwise. */
  band: "low" | "sweet-spot" | "high" | "neutral";
}

const CANDIDATE_LOOKUP_FALLBACK_DAYS = 30;
const DECISION_LOOKUP_FALLBACK_DAYS = 90;

export class DecisionLog {
  private readonly strategyDataDir: string;
  private readonly store: JsonlStore<StrategyDecisionRecord>;
  private readonly candidateStore: JsonlStore<StrategyCandidate>;

  constructor(options: DecisionLogOptions = {}) {
    this.strategyDataDir = options.strategyDataDir ?? "./data/strategy";
    this.store = new JsonlStore<StrategyDecisionRecord>(this.strategyDataDir, "decisions");
    this.candidateStore = new JsonlStore<StrategyCandidate>(this.strategyDataDir, "candidates");
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
      // Plan 11-09 Task 2 computes these for real from the operator's own
      // levels; Plan 11-09 Task 1 lands the null-safe placeholder shape
      // here so the type change to StrategyDecisionRecord compiles cleanly
      // ahead of Task 2's real implementation.
      afterTaxRewardUsd: null,
      costJurisdiction: null,
      costEffectiveTaxRatePct: null,
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
      afterTaxRewardUsd: null,
      costJurisdiction: null,
      costEffectiveTaxRatePct: null,
      ...(note !== undefined ? { operatorNote: note } : {}),
    };
    await this.store.appendManyOn([record], new Date(decidedAt));
    return record;
  }

  /**
   * Log a realized close against a previously ACCEPTED `candidateId`.
   * Appends a NEW record — never rewrites the accept row. P&L is computed
   * from the OPERATOR's entry/size (D-09/D-12), not the engine's
   * suggestion. Throws `DecisionLogError` (no record written) when the
   * candidateId doesn't exist or was skipped rather than accepted.
   */
  async recordClose(candidateId: string, outcome: CloseOutcome): Promise<StrategyDecisionRecord> {
    const prior = await this.latestDecisionForCandidate(candidateId);
    if (!prior) {
      throw new DecisionLogError(
        `recordClose: no decision found for candidateId "${candidateId}" — nothing to close`,
      );
    }
    if (prior.decision !== "accept") {
      throw new DecisionLogError(
        `recordClose: candidateId "${candidateId}" was skipped, not accepted — cannot close`,
      );
    }
    if (prior.operatorEntry === null || prior.operatorSizeUsd === null) {
      throw new DecisionLogError(
        `recordClose: candidateId "${candidateId}" has no operator entry/size to compute P&L against`,
      );
    }

    const dirSign = prior.direction === "long" ? 1 : -1;
    const operatorEntry = prior.operatorEntry;
    const operatorSizeUsd = prior.operatorSizeUsd;

    const closeRealizedPnlUsd = round2(
      (outcome.exitPrice - operatorEntry) * dirSign * (operatorSizeUsd / operatorEntry),
    );
    const closeRealizedPnlPct = round2(
      ((outcome.exitPrice - operatorEntry) / operatorEntry) * dirSign * 100,
    );

    const closedAt =
      outcome.exitDate !== undefined
        ? new Date(`${outcome.exitDate}T00:00:00.000Z`).toISOString()
        : new Date().toISOString();

    const record: StrategyDecisionRecord = {
      ...prior,
      closedAt,
      closeExitPrice: outcome.exitPrice,
      closeRealizedPnlUsd,
      closeRealizedPnlPct,
      ...(outcome.note !== undefined ? { closeOperatorNote: outcome.note } : {}),
    };

    await this.store.appendManyOn([record], new Date(closedAt));
    return record;
  }

  /** Read all decision records (raw, undeduped) for one calendar day. */
  async readDay(date: Date): Promise<StrategyDecisionRecord[]> {
    return this.store.readDay(date);
  }

  /** Read all decision records (raw, undeduped) across `[startIso, endIso]` inclusive. */
  async readRange(startIso: string, endIso: string): Promise<StrategyDecisionRecord[]> {
    const start = new Date(`${startIso}T00:00:00.000Z`);
    const end = new Date(`${endIso}T00:00:00.000Z`);
    const all: StrategyDecisionRecord[] = [];

    for (
      const cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      all.push(...(await this.store.readDay(new Date(cursor))));
    }

    return all;
  }

  /**
   * One record per `candidateId` across `[startIso, endIso]`, keeping the
   * record with the latest `closedAt ?? decidedAt`. A skip followed by an
   * accept reconciles to the accept; a close reconciles to the close row
   * (which carries `decision: "accept"` inherited from the prior record).
   */
  async readDedupedByCandidateId(
    startIso: string,
    endIso: string,
  ): Promise<StrategyDecisionRecord[]> {
    const all = await this.readRange(startIso, endIso);
    const byId = new Map<string, StrategyDecisionRecord>();

    for (const record of all) {
      const existing = byId.get(record.candidateId);
      if (!existing) {
        byId.set(record.candidateId, record);
        continue;
      }
      const recordTs = Date.parse(record.closedAt ?? record.decidedAt);
      const existingTs = Date.parse(existing.closedAt ?? existing.decidedAt);
      if (recordTs > existingTs) byId.set(record.candidateId, record);
    }

    return Array.from(byId.values());
  }

  /**
   * D-13's 30-day accept/skip rate report over the trailing `days`
   * calendar days (ending today). `band` is `"low"` below 10%,
   * `"sweet-spot"` in [20%, 40%], `"high"` above 60%, `"neutral"` in the
   * two gaps in between.
   */
  async acceptSkipStats(days: number): Promise<AcceptSkipStats> {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().split("T")[0] ?? "";
    const endIso = end.toISOString().split("T")[0] ?? "";

    const deduped = await this.readDedupedByCandidateId(startIso, endIso);
    const accepted = deduped.filter((r) => r.decision === "accept").length;
    const skipped = deduped.filter((r) => r.decision === "skip").length;
    const total = accepted + skipped;
    const acceptRate = total > 0 ? accepted / total : 0;

    let band: AcceptSkipStats["band"] = "neutral";
    if (total > 0) {
      if (acceptRate < 0.1) band = "low";
      else if (acceptRate > 0.6) band = "high";
      else if (acceptRate >= 0.2 && acceptRate <= 0.4) band = "sweet-spot";
    }

    return { accepted, skipped, total, acceptRate, band };
  }

  /**
   * Resolve a `StrategyCandidate` from `candidates-*.jsonl` by id.
   * `candidateId` always starts with its `asOfDate`
   * (`YYYY-MM-DD-signalType-ticker-hash`), so the fast path reads that
   * day's file directly; the fallback scans backward from today (newest
   * first) for a malformed/hand-typed id that doesn't resolve directly.
   */
  async findCandidate(
    candidateId: string,
    lookbackDays = CANDIDATE_LOOKUP_FALLBACK_DAYS,
  ): Promise<StrategyCandidate | undefined> {
    const dateMatch = candidateId.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (dateMatch) {
      const rows = await this.candidateStore.readDay(new Date(`${dateMatch[1]}T00:00:00.000Z`));
      const hit = rows.find((c) => c.candidateId === candidateId);
      if (hit) return hit;
    }

    for (let i = 0; i < lookbackDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const rows = await this.candidateStore.readDay(date);
      const hit = rows.find((c) => c.candidateId === candidateId);
      if (hit) return hit;
    }

    return undefined;
  }

  /** Latest decision record (by `closedAt ?? decidedAt`) for `candidateId`, scanning backward from today. */
  private async latestDecisionForCandidate(
    candidateId: string,
    lookbackDays = DECISION_LOOKUP_FALLBACK_DAYS,
  ): Promise<StrategyDecisionRecord | undefined> {
    const matches: StrategyDecisionRecord[] = [];
    for (let i = 0; i < lookbackDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const rows = await this.store.readDay(date);
      matches.push(...rows.filter((r) => r.candidateId === candidateId));
    }
    if (matches.length === 0) return undefined;

    matches.sort(
      (a, b) => Date.parse(b.closedAt ?? b.decidedAt) - Date.parse(a.closedAt ?? a.decidedAt),
    );
    return matches[0];
  }
}
