/**
 * StrategyEngine — orchestrates the "PM signal to sized trade idea" path
 * (M2-05 Plan 11-02 Task 1, the phase tracer; four-type registry + mode
 * enforcement added in Plan 11-05 Task 1).
 *
 * `generateCandidates(asOfDate)`:
 *   1. loads `config/strategy-config.json`
 *   2. asserts every module's declared `mode` matches `config.signalModes`
 *      (D-01/D-02 — the config file and the module classes are two
 *      statements of the same decision and must not drift)
 *   3. reads today's `TickerDaySummary` rollups from `data/intel/` (M2-04's
 *      substrate — the engine's ONLY substrate input)
 *   4. runs each configured `SignalTypeModule` (gate → generate), a failed
 *      gate or a thrown `generate()` both become a `skippedTypes` entry
 *      rather than aborting the run
 *   5. fetches the VIX quote once
 *   6. fetches ATR inputs per surviving ticker via `MarketDataService` — a
 *      per-ticker fetch failure (all providers exhausted) is isolated the
 *      same way a `generate()` throw is: recorded in
 *      `StrategyRunResult.skippedTickers` and that ticker's raw signals are
 *      dropped, never aborting the whole run (CR-01)
 *   7. computes entry/target/stop (levels.ts) for every candidate,
 *      including shadow ones — a candidate whose levels collapsed (zero/
 *      insufficient ATR) is demoted to sub-threshold with an explicit
 *      reason rather than ranked/sized (WR-01, see `hasDegenerateLevels`)
 *   8. partitions `mode: "shadow"` modules' candidates out of ranking
 *      entirely (D-01) — they always land in `StrategyRunResult.shadow`
 *      with `suggestedSizeUsd: null`, never in `ranked`/`subThreshold`
 *   9. resolves cross-type same-(ticker,direction) collisions and ranks
 *      the survivors (D-04/D-05/D-14 — see `resolveTickerCollisions`/
 *      `rankCandidates`)
 *  10. persists every surviving candidate to
 *      `data/strategy/candidates-YYYY-MM-DD.jsonl`
 *
 * Deliberately NOT wired into `market-intelligence/scheduler/cycle-runner.ts`
 * (D-21) — `strategy run` is its own invocation, not part of the 60-90s
 * scheduler cycle. Emits no exit signal of any kind (D-10) — the only
 * close path is the operator-invoked `DecisionLog.recordClose` (Task 3).
 */

import * as crypto from "node:crypto";

import { TechnicalIndicators } from "../analysis/technical-indicators.js";
import { MarketDataService } from "../data/market-data-service.js";
import type { OHLCVData } from "../data/types.js";
import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";
import type { StrategyConfig } from "./config.js";
import { loadStrategyConfig } from "./config.js";
import { computeLevels } from "./levels.js";
import { defaultSignalModules } from "./signals/index.js";
import { suggestSizeUsd } from "./sizing.js";
import { loadRollupsForDay } from "./substrate.js";
import type {
  CandidateMode,
  RawSignal,
  SignalContext,
  SignalMode,
  SignalType,
  SignalTypeModule,
  StrategyCandidate,
  StrategyRunResult,
} from "./types.js";
import { VixProvider } from "./vix-provider.js";
import type { VixQuote } from "./vix-provider.js";

/** Structural subset of `MarketDataService` the engine actually calls — lets tests inject a stub. */
export interface MarketDataSource {
  fetchHistoricalData(symbol: string, from: Date, to?: Date): Promise<OHLCVData[]>;
}

/** Structural subset of `VixProvider` the engine actually calls — lets tests inject a stub. */
export interface VixSource {
  getForDate(asOfDate: Date): Promise<VixQuote>;
}

export interface StrategyEngineOptions {
  intelDataDir?: string;
  strategyDataDir?: string;
  configPath?: string;
  /**
   * Inject a pre-loaded config directly (bypasses `loadStrategyConfig`'s
   * async file read). Mainly for tests that want the mode-consistency
   * assertion (below) to throw synchronously at construction, and for any
   * caller that has already loaded config and wants to avoid a second
   * read. Production usage normally omits this and lets `configPath`
   * resolve from disk on each `generateCandidates` call.
   */
  config?: StrategyConfig;
  modules?: SignalTypeModule[];
  vixProvider?: VixSource;
  marketData?: MarketDataSource;
}

const ATR_LOOKBACK_DAYS = 120;
const ATR_PERIODS = [3, 5, 10] as const;

/**
 * `${asOfDate}-${signalType}-${ticker}-${shortHash}` where `shortHash` is
 * the first 8 hex chars of a sha256 over
 * `${signalType}|${ticker}|${asOfDate}|${score.toFixed(4)}|${generatedAt}`.
 * `generatedAt` is what keeps two same-day same-type same-ticker candidates
 * distinct (RESEARCH Known Threat Patterns, `candidateId` collision).
 */
export function buildCandidateId(
  asOfDate: string,
  signalType: SignalType,
  ticker: string,
  score: number,
  generatedAt: string,
): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${signalType}|${ticker}|${asOfDate}|${score.toFixed(4)}|${generatedAt}`)
    .digest("hex")
    .slice(0, 8);
  return `${asOfDate}-${signalType}-${ticker}-${hash}`;
}

/**
 * Thrown when a `SignalTypeModule`'s declared `mode` disagrees with
 * `config.signalModes[module.signalType]` (T-11-05-02). The config file and
 * the module classes are two statements of the same v1-mode decision (D-02);
 * this keeps a hand-edit of one from silently promoting/demoting a signal
 * type the other side still thinks is unchanged.
 */
export class SignalModeMismatchError extends Error {
  constructor(
    mismatches: Array<{ signalType: SignalType; declared: SignalMode; configured: SignalMode }>,
  ) {
    super(
      `strategy-engine: module/config signalModes mismatch — ${mismatches
        .map(
          (m) =>
            `${m.signalType} (module declares "${m.declared}", config.signalModes says "${m.configured}")`,
        )
        .join("; ")}`,
    );
    this.name = "SignalModeMismatchError";
  }
}

/**
 * Assert every module's declared `mode` matches `signalModes[module.signalType]`
 * — throws `SignalModeMismatchError` naming every offending type at once
 * rather than failing on the first mismatch found.
 */
export function assertModulesMatchConfig(
  modules: SignalTypeModule[],
  signalModes: Record<SignalType, SignalMode>,
): void {
  const mismatches = modules
    .filter((m) => signalModes[m.signalType] !== undefined && signalModes[m.signalType] !== m.mode)
    .map((m) => ({
      signalType: m.signalType,
      declared: m.mode,
      configured: signalModes[m.signalType],
    }));
  if (mismatches.length > 0) {
    throw new SignalModeMismatchError(mismatches);
  }
}

/**
 * Cross-type same-(ticker,direction) collision resolution (D-04/RESEARCH
 * Pitfall 1) — two candidates from DIFFERENT signal types on the same
 * ticker pointing the same direction collapse to one: the higher score
 * survives, keeping its own `candidateId`, and the dropped candidate's
 * type + score is appended to the survivor's rationale so the evidence is
 * never silently lost. Opposite-direction candidates for the same ticker
 * never interact — the disagreement between two signal types is
 * information, not a bug, and both survive.
 *
 * The within-type collision case (two CATALYST_ANCHORED catalysts both
 * bullish NVDA) is each module's own job (see
 * `catalyst-anchored.ts`'s `dedupeSameTypeCollisions`) — by the time
 * candidates reach here every module has already deduped its own output,
 * so this function only ever sees at most one candidate per
 * (signalType, ticker, direction) triple.
 */
export function resolveTickerCollisions(candidates: StrategyCandidate[]): StrategyCandidate[] {
  const byKey = new Map<string, StrategyCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.ticker}|${candidate.direction}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }

    const existingWins =
      existing.score > candidate.score ||
      (existing.score === candidate.score && existing.timeHorizonDays <= candidate.timeHorizonDays);
    const winner = existingWins ? existing : candidate;
    const loser = existingWins ? candidate : existing;

    byKey.set(key, {
      ...winner,
      rationale:
        `${winner.rationale} (${loser.signalType} also flagged ${loser.ticker} ${loser.direction} ` +
        `at score ${loser.score.toFixed(2)}, dropped as a lower-scoring cross-type duplicate)`,
    });
  }

  return Array.from(byKey.values());
}

/**
 * Cross-type ranking (D-04/D-05/D-14) — sorts `candidates` by raw score
 * descending (no per-type weight, coefficient, or bias term anywhere in
 * this comparator; D-04 defers all of that to v2), breaking ties by
 * nearer `timeHorizonDays` then alphabetically by `ticker` so a run is
 * reproducible.
 *
 * Takes up to `config.maxCandidatesPerDay` from the ABOVE-floor prefix as
 * `ranked` — never padded from below the floor (D-14: a quiet day with
 * nothing above the floor produces an explicit empty `ranked`, not a
 * backfilled top-3). Takes the next `config.subThresholdCount` candidates
 * from whatever remains — regardless of whether that remainder is itself
 * above or below the floor — as `subThreshold`. Anything past that is
 * reported nowhere.
 */
export function rankCandidates(
  candidates: StrategyCandidate[],
  config: StrategyConfig,
): { ranked: StrategyCandidate[]; subThreshold: StrategyCandidate[] } {
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.timeHorizonDays !== b.timeHorizonDays) return a.timeHorizonDays - b.timeHorizonDays;
    return a.ticker.localeCompare(b.ticker);
  });

  const aboveFloorCount = sorted.filter((c) => c.score >= config.scoreFloor).length;
  const ranked = sorted.slice(0, Math.min(config.maxCandidatesPerDay, aboveFloorCount));
  const remainder = sorted.slice(ranked.length);
  const subThreshold = remainder.slice(0, config.subThresholdCount);

  return { ranked, subThreshold };
}

/**
 * A candidate's computed levels are un-priceable when the ATR that fed
 * `computeLevels` was zero/insufficient (a thin ticker, a recently-listed
 * symbol, or a short-but-non-throwing bar set) — the stop/target clamps in
 * `levels.ts` then collapse to `entry === target` or `entry === stop`
 * (WR-01). A degenerate candidate must never be ranked or sized; the
 * caller demotes it to `subThreshold` with an explicit reason instead.
 */
export function hasDegenerateLevels(candidate: StrategyCandidate): boolean {
  return (
    candidate.atrValue <= 0 ||
    candidate.suggestedTarget === candidate.suggestedEntry ||
    candidate.suggestedStop === candidate.suggestedEntry
  );
}

export class StrategyEngine {
  private readonly intelDataDir: string;
  private readonly strategyDataDir: string;
  private readonly configPath: string | undefined;
  private readonly suppliedConfig: StrategyConfig | undefined;
  private readonly modules: SignalTypeModule[];
  private readonly vixProvider: VixSource;
  private readonly marketData: MarketDataSource;
  private readonly candidateStore: JsonlStore<StrategyCandidate>;

  constructor(options: StrategyEngineOptions = {}) {
    this.intelDataDir = options.intelDataDir ?? "./data/intel";
    this.strategyDataDir = options.strategyDataDir ?? "./data/strategy";
    this.configPath = options.configPath;
    this.suppliedConfig = options.config;
    this.modules = options.modules ?? defaultSignalModules();
    if (this.suppliedConfig) {
      assertModulesMatchConfig(this.modules, this.suppliedConfig.signalModes);
    }
    this.vixProvider =
      options.vixProvider ?? new VixProvider({ strategyDataDir: this.strategyDataDir });
    this.marketData = options.marketData ?? new MarketDataService();
    this.candidateStore = new JsonlStore<StrategyCandidate>(this.strategyDataDir, "candidates");
  }

  async generateCandidates(asOfDate: Date): Promise<StrategyRunResult> {
    const config = this.suppliedConfig ?? (await loadStrategyConfig(this.configPath));
    assertModulesMatchConfig(this.modules, config.signalModes);

    const asOfIso = asOfDate.toISOString().split("T")[0] ?? "";

    const rollups = await loadRollupsForDay(this.intelDataDir, asOfDate);
    const ctx: SignalContext = {
      asOfDate: asOfIso,
      rollups,
      config,
      intelDataDir: this.intelDataDir,
    };

    const skippedTypes: StrategyRunResult["skippedTypes"] = [];
    const rawSignals: RawSignal[] = [];
    const modeByType = new Map<SignalType, SignalMode>(
      this.modules.map((m) => [m.signalType, m.mode]),
    );

    for (const mod of this.modules) {
      if (mod.gate) {
        const gateResult = await mod.gate(ctx);
        if (!gateResult.ok) {
          skippedTypes.push({ signalType: mod.signalType, reason: gateResult.reason });
          continue;
        }
      }
      try {
        const generated = await mod.generate(ctx);
        rawSignals.push(...generated);
      } catch (err) {
        // One broken signal type must not cost the operator the whole
        // morning's candidates from the other three (T-11-05-04).
        const message = err instanceof Error ? err.message : String(err);
        skippedTypes.push({ signalType: mod.signalType, reason: `generate() threw: ${message}` });
      }
    }

    const vix = await this.vixProvider.getForDate(asOfDate);

    const tickers = Array.from(new Set(rawSignals.map((s) => s.ticker)));
    const atrByTicker = new Map<string, Record<3 | 5 | 10, number>>();
    const closeByTicker = new Map<string, number>();
    const skippedTickers: StrategyRunResult["skippedTickers"] = [];

    for (const ticker of tickers) {
      const from = new Date(asOfDate.getTime() - ATR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      try {
        const bars = await this.marketData.fetchHistoricalData(ticker, from, asOfDate);

        // Bars may arrive newest-first (Yahoo) or already ascending depending
        // on provider/cache path — sort ascending explicitly rather than
        // trust the caller's order (strategy-adapter.ts doc-comment
        // discipline: state the order, don't bare-.reverse()).
        const ascending = [...bars].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        const priceData = {
          open: ascending.map((b) => b.open),
          high: ascending.map((b) => b.high),
          low: ascending.map((b) => b.low),
          close: ascending.map((b) => b.close),
          volume: ascending.map((b) => b.volume),
        };

        const atrByPeriod = {} as Record<3 | 5 | 10, number>;
        for (const period of ATR_PERIODS) {
          const series = TechnicalIndicators.calculateATRSeries(priceData, period);
          atrByPeriod[period] = series[series.length - 1] ?? 0;
        }
        atrByTicker.set(ticker, atrByPeriod);
        closeByTicker.set(ticker, ascending[ascending.length - 1]?.close ?? 0);
      } catch (err) {
        // One ticker's market-data outage (all providers exhausted) must
        // not cost the operator every other ticker's candidates for the
        // day (CR-01) — record it the same way a skipped signal type is
        // recorded and exclude only this ticker's raw signals below,
        // rather than letting the exception propagate out of
        // generateCandidates.
        const message = err instanceof Error ? err.message : String(err);
        skippedTickers.push({ ticker, reason: `fetchHistoricalData threw: ${message}` });
      }
    }

    const skippedTickerSet = new Set(skippedTickers.map((s) => s.ticker));
    const generatedAt = new Date().toISOString();

    const allCandidates: StrategyCandidate[] = rawSignals
      .filter((raw) => !skippedTickerSet.has(raw.ticker))
      .map((raw) => {
        const close = closeByTicker.get(raw.ticker) ?? 0;
        const atrByPeriod = atrByTicker.get(raw.ticker) ?? { 3: 0, 5: 0, 10: 0 };
        const levels = computeLevels({
          close,
          direction: raw.direction,
          atrByPeriod,
          entryStyle: raw.entryStyle,
          targetSpec: raw.targetSpec,
        });

        return {
          ...raw,
          candidateId: buildCandidateId(asOfIso, raw.signalType, raw.ticker, raw.score, generatedAt),
          generatedAt,
          asOfDate: asOfIso,
          mode: "sub-threshold" as CandidateMode, // reassigned below during partition
          vixRegime: vix.regime,
          vixCloseAtGeneration: vix.close,
          vixSource: vix.source,
          suggestedEntry: levels.entryPrice,
          suggestedTarget: levels.targetPrice,
          suggestedStop: levels.stopPrice,
          suggestedSizeUsd: null, // reassigned below for ranked candidates only
          atrPeriodUsed: levels.atrPeriodUsed,
          atrValue: levels.atrValue,
        };
      });

    // Shadow-mode modules' candidates bypass ranking structurally — a
    // shadow candidate never competes for a ranked/sub-threshold slot no
    // matter how high its score (D-01, T-11-05-01). A candidate whose
    // computed levels collapsed (zero/insufficient ATR, or an entry that
    // equals its own target/stop) is un-priceable and is demoted straight
    // to sub-threshold with an explicit reason instead — never silently
    // ranked/sized with a zero-distance stop (WR-01).
    const shadow: StrategyCandidate[] = [];
    const rankable: StrategyCandidate[] = [];
    const degenerate: StrategyCandidate[] = [];
    for (const candidate of allCandidates) {
      if (modeByType.get(candidate.signalType) === "shadow") {
        shadow.push({ ...candidate, mode: "shadow" as CandidateMode, suggestedSizeUsd: null });
      } else if (hasDegenerateLevels(candidate)) {
        degenerate.push({
          ...candidate,
          mode: "sub-threshold" as CandidateMode,
          suggestedSizeUsd: null,
          rationale:
            `${candidate.rationale} (demoted: degenerate levels — atrValue=${candidate.atrValue}, ` +
            `entry=${candidate.suggestedEntry}, target=${candidate.suggestedTarget}, ` +
            `stop=${candidate.suggestedStop}; insufficient price history to size this trade safely)`,
        });
      } else {
        rankable.push(candidate);
      }
    }

    const deduped = resolveTickerCollisions(rankable);
    const { ranked: rankedRaw, subThreshold: subThresholdRaw } = rankCandidates(deduped, config);

    const ranked: StrategyCandidate[] = rankedRaw.map((c) => ({
      ...c,
      mode: "ranked" as CandidateMode,
      suggestedSizeUsd: suggestSizeUsd(
        vix.regime,
        c.signalType,
        config.assumedEquity,
        config,
        c.sizeModifier ?? 1,
      ),
    }));
    const subThreshold: StrategyCandidate[] = [
      ...subThresholdRaw.map((c) => ({
        ...c,
        mode: "sub-threshold" as CandidateMode,
        suggestedSizeUsd: null,
      })),
      ...degenerate,
    ];

    const toPersist = [...ranked, ...subThreshold, ...shadow];
    if (toPersist.length > 0) {
      await this.candidateStore.appendManyOn(toPersist, asOfDate);
    }

    return {
      asOfDate: asOfIso,
      vix,
      ranked,
      subThreshold,
      shadow,
      skippedTypes,
      skippedTickers,
    };
  }
}
