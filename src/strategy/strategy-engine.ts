/**
 * StrategyEngine — orchestrates the "PM signal to sized trade idea" path
 * (M2-05 Plan 11-02 Task 1, the phase tracer).
 *
 * `generateCandidates(asOfDate)`:
 *   1. loads `config/strategy-config.json`
 *   2. reads today's `TickerDaySummary` rollups from `data/intel/` (M2-04's
 *      substrate — the engine's ONLY substrate input)
 *   3. runs each configured `SignalTypeModule` (gate → generate)
 *   4. fetches the VIX quote once
 *   5. fetches ATR inputs per surviving ticker via `MarketDataService`
 *   6. computes entry/target/stop (levels.ts) and size (sizing.ts)
 *   7. partitions into ranked / sub-threshold / shadow (D-05, D-14)
 *   8. persists every candidate to `data/strategy/candidates-YYYY-MM-DD.jsonl`
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
import { loadStrategyConfig } from "./config.js";
import { computeLevels } from "./levels.js";
import { SectorRotationModule } from "./signals/sector-rotation.js";
import { suggestSizeUsd } from "./sizing.js";
import { loadRollupsForDay } from "./substrate.js";
import type {
  CandidateMode,
  RawSignal,
  SignalContext,
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

export class StrategyEngine {
  private readonly intelDataDir: string;
  private readonly strategyDataDir: string;
  private readonly configPath: string | undefined;
  private readonly modules: SignalTypeModule[];
  private readonly vixProvider: VixSource;
  private readonly marketData: MarketDataSource;
  private readonly candidateStore: JsonlStore<StrategyCandidate>;

  constructor(options: StrategyEngineOptions = {}) {
    this.intelDataDir = options.intelDataDir ?? "./data/intel";
    this.strategyDataDir = options.strategyDataDir ?? "./data/strategy";
    this.configPath = options.configPath;
    this.modules = options.modules ?? [new SectorRotationModule()];
    this.vixProvider =
      options.vixProvider ?? new VixProvider({ strategyDataDir: this.strategyDataDir });
    this.marketData = options.marketData ?? new MarketDataService();
    this.candidateStore = new JsonlStore<StrategyCandidate>(this.strategyDataDir, "candidates");
  }

  async generateCandidates(asOfDate: Date): Promise<StrategyRunResult> {
    const config = await loadStrategyConfig(this.configPath);
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

    for (const mod of this.modules) {
      if (mod.gate) {
        const gateResult = await mod.gate(ctx);
        if (!gateResult.ok) {
          skippedTypes.push({ signalType: mod.signalType, reason: gateResult.reason });
          continue;
        }
      }
      const generated = await mod.generate(ctx);
      rawSignals.push(...generated);
    }

    const vix = await this.vixProvider.getForDate(asOfDate);

    const tickers = Array.from(new Set(rawSignals.map((s) => s.ticker)));
    const atrByTicker = new Map<string, Record<3 | 5 | 10, number>>();
    const closeByTicker = new Map<string, number>();

    for (const ticker of tickers) {
      const from = new Date(asOfDate.getTime() - ATR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
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
    }

    const generatedAt = new Date().toISOString();

    const allCandidates: StrategyCandidate[] = rawSignals.map((raw) => {
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

    const sorted = [...allCandidates].sort((a, b) => b.score - a.score);
    const above = sorted.filter((c) => c.score >= config.scoreFloor);
    const below = sorted.filter((c) => c.score < config.scoreFloor);

    const ranked: StrategyCandidate[] = above.slice(0, config.maxCandidatesPerDay).map((c) => ({
      ...c,
      mode: "ranked" as CandidateMode,
      suggestedSizeUsd: suggestSizeUsd(vix.regime, c.signalType, config.assumedEquity, config),
    }));
    const subThreshold: StrategyCandidate[] = below
      .slice(0, config.subThresholdCount)
      .map((c) => ({ ...c, mode: "sub-threshold" as CandidateMode, suggestedSizeUsd: null }));
    const shadow: StrategyCandidate[] = [];

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
    };
  }
}
