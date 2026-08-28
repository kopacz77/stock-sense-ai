/**
 * Live-window backtest runner (M2-05 Plan 11-06, CONTEXT D-15).
 *
 * Replaces the CONTEXT-locked "2018-2025 per-regime" backtest bar, which
 * RESEARCH §8 proved structurally unevaluable: `regime-segmenter.ts`'s
 * `REGIMES` windows all end 2025-12-31, but every M2-04 substrate stream
 * starts 2026-05-23 — no date range satisfies both "same regimes as M2-01"
 * and "uses real M2-04 outputs", for any signal type. This module instead
 * replays `StrategyEngine.generateCandidates` day-by-day across the real
 * 2026 substrate, prices the resulting candidates against real OHLCV, and
 * reports Sharpe/MaxDD/trade-count via `PerformanceMetricsCalculator.calculate()`
 * directly — no `regime-segmenter` windowing of any kind, because no
 * `REGIMES` window overlaps the substrate window. This file deliberately
 * never imports `regime-segmenter.ts`.
 *
 * Two kinds of run come out of one `runLiveWindow` call:
 *  - `perType[type]`: an ISOLATED single-type run (`modules: [thatType]`),
 *    the exact code path `strategy run --types <TYPE>` takes live. Ranking,
 *    the score floor, and the top-N cap all apply to that type ALONE — this
 *    is what the type would have done running by itself, not a slice of a
 *    multi-type run.
 *  - `combined`: one run with every requested type registered together, so
 *    cross-type collision resolution and the shared top-5/day cap apply
 *    exactly as they do in a live `strategy run` with no `--types` filter —
 *    this is what the operator actually experiences trading all types at
 *    once from one $`assumedEquity` account.
 *
 * **Read-only against `data/intel/` (hard constraint for this execution).**
 * RESEARCH's own recommendation was for the runner to call
 * `rebuildRollupForDay` for any day missing a `ticker-day-summary` file (the
 * only way to give SECTOR_ROTATION_FROM_PM its full 2026-05-23 start, per
 * §8's usable-range table) — but `rebuildRollupForDay` WRITES a rollup file
 * into `data/intel/`, and this execution runs under an explicit "never
 * modify `data/intel/`" directive. Rather than violate that, the runner
 * requires every day in `[startIso, endIso]` to already have a real
 * `ticker-day-summary-YYYY-MM-DD.jsonl` file on disk; the caller (the CLI)
 * is responsible for choosing a `startIso` no earlier than the first day
 * that file exists (2026-05-31 in the real substrate, eight days later than
 * RESEARCH's SECTOR_ROTATION_FROM_PM-only aspirational start of 2026-05-23,
 * which would have required a write). A day inside the window that is
 * STILL missing its rollup file (shouldn't happen within [2026-05-31,
 * today] per RESEARCH §0's continuous-coverage finding, but checked
 * defensively) is recorded in `skippedDays` and excluded from the equity
 * curve entirely — never silently treated as a flat-return day.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { PerformanceMetricsCalculator } from "../../backtesting/analytics/performance-metrics.js";
import type {
  EquityCurvePoint,
  PerformanceMetrics,
  Trade,
} from "../../backtesting/types/backtest-types.js";
import { MarketDataService } from "../../data/market-data-service.js";
import type { OHLCVData } from "../../data/types.js";
import { DRAIN_LOCK_FILE, isDrainLocked } from "../../market-intelligence/signal/backlog-drain.js";
import { loadStrategyConfig } from "../config.js";
import { round2 } from "../levels.js";
import { defaultSignalModules } from "../signals/index.js";
import type { MarketDataSource, VixSource } from "../strategy-engine.js";
import { StrategyEngine } from "../strategy-engine.js";
import type { SignalType, SignalTypeModule, StrategyCandidate } from "../types.js";
import { VixProvider } from "../vix-provider.js";

/** All four v1 signal types — the default `types` set when the caller omits one. */
export const ALL_SIGNAL_TYPES: readonly SignalType[] = [
  "CATALYST_ANCHORED",
  "SENTIMENT_VELOCITY",
  "SECTOR_ROTATION_FROM_PM",
  "FADE_OVERSHOOT",
];

/** The exact, verbatim interim label — printed by the CLI header and stored in the JSON report. */
export const LIVE_WINDOW_LABEL = "single continuous 2026 window — interim, not the per-regime bar";

/**
 * Sharpe's standard error scales with `1/sqrt(N)` (RESEARCH Pitfall 3) — a
 * window with this real substrate's ~90 calendar days produces at most a
 * few dozen closed trades per type. Below this many closed trades, a
 * reported Sharpe is directional only, never a pass/fail signal on its own.
 */
export const THIN_SAMPLE_TRADE_THRESHOLD = 20;

/** M2-01's cost model default (`FixedBPSSlippageModel(5)` was 5bps; this v1 default is slightly wider, per-side). */
const DEFAULT_SLIPPAGE_PCT_PER_SIDE = 0.0005;
const DEFAULT_COMMISSION_PER_TRADE = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Extra calendar days fetched past `endIso` so a late-window candidate still has forward bars to resolve its exit. */
const PRICE_TAIL_BUFFER_DAYS = 30;

export interface LiveWindowOptions {
  startIso: string;
  endIso: string;
  types?: SignalType[];
  initialCapital?: number;
  slippagePctPerSide?: number;
  commissionPerTrade?: number;
  intelDataDir?: string;
  /**
   * Accepted for interface completeness (RESEARCH §8 / plan artifact spec)
   * but never used for engine writes — see the module doc comment.
   * `StrategyEngine.generateCandidates` always persists; a live-window
   * replay of ~90 historical days must never inject synthetic-dated rows
   * into the operator's real `data/strategy/candidates-*.jsonl` stream, so
   * every internally-constructed `StrategyEngine` is pointed at a scratch
   * temp directory instead (same pattern as the CLI's own `--dry-run`).
   */
  strategyDataDir?: string;
  /**
   * Test/advanced injection seams, not part of the plan's literal artifact
   * spec but required to make `runLiveWindow` unit-testable against
   * synthetic bars and stub modules (Task 1's own `<action>`) without
   * touching the network. Omit in production for the real four-module
   * registry and real VIX/market-data providers.
   */
  modules?: SignalTypeModule[];
  marketData?: MarketDataSource;
  vixProvider?: VixSource;
  /**
   * Called once per (pass, day) so a caller (the CLI's `ora` spinner) can
   * report progress across what's typically a multi-minute replay — up to
   * `requestedTypes.length` isolated passes plus one combined pass, each
   * walking every usable day in the window.
   */
  onProgress?: (info: {
    pass: SignalType | "COMBINED";
    dayIndex: number;
    dayCount: number;
  }) => void;
}

export interface TypeReport {
  signalType: SignalType | "COMBINED";
  candidateCount: number;
  tradeCount: number;
  metrics: PerformanceMetrics;
  thinSample: boolean;
  usableRange: string;
}

export interface LiveWindowReport {
  window: { startIso: string; endIso: string };
  label: string;
  /** Only contains entries for the requested `types` (default: all four) — an omitted type has no key. */
  perType: Record<SignalType, TypeReport>;
  combined: TypeReport;
  shadowCandidateCount: number;
  skippedDays: Array<{ date: string; reason: string }>;
}

export interface SimulationCosts {
  slippagePctPerSide: number;
  commissionPerTrade: number;
}

/**
 * Resolve one candidate into a `Trade` by walking `bars` forward from the
 * first bar after `candidate.asOfDate`, up to `candidate.timeHorizonDays`
 * bars. `bars` must already be ascending-by-date (the caller's job — see
 * the runner's price-fetch step, which sorts ascending with a rationale
 * comment naming the newest-first Yahoo ordering that silently broke
 * M2-01's SELL conditions; `simulateCandidate` trusts its input order
 * rather than re-sorting, so a caller passing already-correct bars pays no
 * extra cost).
 *
 * Exit rules (a bar's own OHLC range decides the outcome, most-pessimistic
 * first):
 *   1. If a single bar's range touches BOTH the stop and the target, the
 *      stop wins — intraday sequence is unknowable from a daily bar, so the
 *      pessimistic assumption is used.
 *   2. Otherwise the first bar to touch either level resolves the trade at
 *      that level (`STOP_LOSS` / `TAKE_PROFIT`).
 *   3. If no bar touches either level within the horizon, the trade exits
 *      at the close of the last horizon bar (`TIME_LIMIT`).
 *
 * Sizing: `quantity = floor(suggestedSizeUsd / suggestedEntry)` (the RAW
 * suggested entry, not the slippage-adjusted fill — sizing is a decision
 * made before execution, slippage is a cost applied after). A candidate
 * with `suggestedSizeUsd === null` (sub-threshold or shadow — D-02) or a
 * size too small to buy even one share returns `null` and never reaches
 * the equity curve.
 */
export function simulateCandidate(
  candidate: StrategyCandidate,
  bars: OHLCVData[],
  costs: SimulationCosts,
): Trade | null {
  if (candidate.suggestedSizeUsd === null) return null;

  const rawEntry = candidate.suggestedEntry;
  const quantity = Math.floor(candidate.suggestedSizeUsd / rawEntry);
  if (quantity < 1) return null;

  const direction = candidate.direction;
  const dirSign = direction === "long" ? 1 : -1;

  const asOfIso = candidate.asOfDate;
  const startIdx = bars.findIndex((b) => b.date > asOfIso);
  if (startIdx === -1) return null; // no forward price data available — can't simulate

  const entryBar = bars[startIdx];
  if (!entryBar) return null;

  const horizonBars = bars.slice(startIdx, startIdx + candidate.timeHorizonDays);
  if (horizonBars.length === 0) return null;

  let rawExit = horizonBars[horizonBars.length - 1]?.close ?? rawEntry;
  let exitReason: Trade["exitReason"] = "TIME_LIMIT";
  let exitBar = horizonBars[horizonBars.length - 1] ?? entryBar;

  for (const bar of horizonBars) {
    const hitStop =
      direction === "long"
        ? bar.low <= candidate.suggestedStop
        : bar.high >= candidate.suggestedStop;
    const hitTarget =
      direction === "long"
        ? bar.high >= candidate.suggestedTarget
        : bar.low <= candidate.suggestedTarget;

    // Stop checked first: when a single bar spans both levels, the stop
    // wins (the pessimistic assumption — see doc comment above).
    if (hitStop) {
      rawExit = candidate.suggestedStop;
      exitReason = "STOP_LOSS";
      exitBar = bar;
      break;
    }
    if (hitTarget) {
      rawExit = candidate.suggestedTarget;
      exitReason = "TAKE_PROFIT";
      exitBar = bar;
      break;
    }
  }

  // Slippage: entry always fills worse than the raw price (buying costs
  // more, selling-to-open-short receives less); exit always fills worse in
  // the opposite sense (selling-to-close receives less, buying-to-cover
  // costs more). Both directions collapse to the same two formulas via
  // `dirSign`.
  const entryFill = round2(rawEntry * (1 + costs.slippagePctPerSide * dirSign));
  const exitFill = round2(rawExit * (1 - costs.slippagePctPerSide * dirSign));

  const slippage =
    Math.abs(entryFill - rawEntry) * quantity + Math.abs(exitFill - rawExit) * quantity;
  const commission = costs.commissionPerTrade;
  const pnl = round2((exitFill - entryFill) * quantity * dirSign - commission);
  const pnlPercent = round2((pnl / (entryFill * quantity)) * 100);

  const entryDate = new Date(`${entryBar.date}T00:00:00.000Z`);
  const exitDate = new Date(`${exitBar.date}T00:00:00.000Z`);
  const holdingPeriod = Math.max(
    0,
    Math.round((exitDate.getTime() - entryDate.getTime()) / DAY_MS),
  );

  return {
    id: candidate.candidateId,
    symbol: candidate.ticker,
    type: direction === "long" ? "LONG" : "SHORT",
    entryTime: entryDate,
    entryDate,
    entryPrice: entryFill,
    quantity,
    exitTime: exitDate,
    exitDate,
    exitPrice: exitFill,
    exitReason,
    commission,
    slippage,
    pnl,
    netPnL: pnl,
    netPnl: pnl,
    pnlPercent,
    returnPct: pnlPercent,
    holdingPeriod,
    holdDuration: holdingPeriod,
  };
}

/** Ascending list of every calendar-day ISO date in `[startIso, endIso]` inclusive. */
function enumerateDays(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  const days: string[] = [];
  for (
    const cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    days.push(cursor.toISOString().split("T")[0] ?? "");
  }
  return days;
}

async function hasRollupFile(intelDataDir: string, dateIso: string): Promise<boolean> {
  try {
    await fs.access(path.join(intelDataDir, `ticker-day-summary-${dateIso}.jsonl`));
    return true;
  } catch {
    return false;
  }
}

/** Latest bar with `date <= dateIso` (weekend/holiday carry-forward for mark-to-market). */
function closeOnOrBefore(bars: OHLCVData[], dateIso: string): number | undefined {
  let result: number | undefined;
  for (const bar of bars) {
    if (bar.date > dateIso) break;
    result = bar.close;
  }
  return result;
}

function markToMarket(
  direction: "long" | "short",
  quantity: number,
  entryPrice: number,
  close: number,
): number {
  return direction === "long" ? quantity * close : quantity * (2 * entryPrice - close);
}

interface OpenPosition {
  trade: Trade;
  ticker: string;
  direction: "long" | "short";
  quantity: number;
  entryFill: number;
  costBasis: number;
  entryDateIso: string;
  exitDateIso: string;
}

interface PassResult {
  candidateCount: number;
  shadowCount: number;
  trades: Trade[];
  equityCurve: EquityCurvePoint[];
  totalCommissions: number;
  totalSlippage: number;
  firstCandidateDateIso: string | null;
  lastCandidateDateIso: string | null;
}

interface RunPassArgs {
  passLabel: SignalType | "COMBINED";
  modules: SignalTypeModule[];
  dayIsos: string[];
  intelDataDir: string;
  scratchStrategyDataDir: string;
  vixProvider: VixSource;
  marketData: MarketDataSource;
  getBars: (ticker: string) => Promise<OHLCVData[]>;
  initialCapital: number;
  maxSimultaneousPositions: number;
  costs: SimulationCosts;
  onProgress?: LiveWindowOptions["onProgress"];
}

/**
 * One full day-by-day replay for a given module set (either one isolated
 * type, or every requested type together for the combined run). Builds a
 * daily equity curve by marking still-open positions to market and
 * realizing closed positions' P&L into cash, capping concurrency at
 * `maxSimultaneousPositions` across the whole pass (extra same-day
 * candidates are counted into `candidateCount` but never traded).
 */
async function runPass(args: RunPassArgs): Promise<PassResult> {
  const { initialCapital, maxSimultaneousPositions, costs } = args;

  let cash = initialCapital;
  let prevEquity = initialCapital;
  const openPositions: OpenPosition[] = [];
  const trades: Trade[] = [];
  const equityCurve: EquityCurvePoint[] = [];
  let candidateCount = 0;
  let shadowCount = 0;
  let totalCommissions = 0;
  let totalSlippage = 0;
  let firstCandidateDateIso: string | null = null;
  let lastCandidateDateIso: string | null = null;

  for (let dayIndex = 0; dayIndex < args.dayIsos.length; dayIndex++) {
    const dateIso = args.dayIsos[dayIndex] ?? "";
    const dayDate = new Date(`${dateIso}T00:00:00.000Z`);
    args.onProgress?.({
      pass: args.passLabel,
      dayIndex: dayIndex + 1,
      dayCount: args.dayIsos.length,
    });

    // 1. Realize any positions whose resolved exit date is today (or, for a
    //    weekend/holiday date the engine never runs on, has already passed).
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      if (pos && pos.exitDateIso <= dateIso) {
        cash += pos.costBasis + pos.trade.pnl;
        totalCommissions += pos.trade.commission;
        totalSlippage += pos.trade.slippage;
        trades.push(pos.trade);
        openPositions.splice(i, 1);
      }
    }

    // 2. Generate today's candidates through the exact production code
    //    path (`StrategyEngine.generateCandidates`), scoped to this pass's
    //    module set. Every internally-constructed engine writes to a
    //    scratch strategyDataDir — never the real data/strategy/ stream.
    const engine = new StrategyEngine({
      intelDataDir: args.intelDataDir,
      strategyDataDir: args.scratchStrategyDataDir,
      modules: args.modules,
      vixProvider: args.vixProvider,
      marketData: args.marketData,
    });
    const result = await engine.generateCandidates(dayDate);

    candidateCount += result.ranked.length + result.subThreshold.length + result.shadow.length;
    shadowCount += result.shadow.length;
    if (result.ranked.length + result.subThreshold.length + result.shadow.length > 0) {
      firstCandidateDateIso ??= dateIso;
      lastCandidateDateIso = dateIso;
    }

    // 3. Open new positions from today's ranked (sized) candidates, best
    //    score first, up to whatever concurrency headroom remains.
    let openCount = openPositions.length;
    for (const candidate of result.ranked) {
      if (openCount >= maxSimultaneousPositions) break; // counted (candidateCount above), not traded
      const bars = await args.getBars(candidate.ticker);
      const trade = simulateCandidate(candidate, bars, costs);
      if (!trade) continue; // e.g. < 1 share — not a concurrency skip
      const exitDateIso =
        (trade.exitDate ?? trade.exitTime)?.toISOString().split("T")[0] ?? dateIso;
      cash -= trade.entryPrice * trade.quantity;
      openPositions.push({
        trade,
        ticker: candidate.ticker,
        direction: candidate.direction,
        quantity: trade.quantity,
        entryFill: trade.entryPrice,
        costBasis: trade.entryPrice * trade.quantity,
        entryDateIso: dateIso,
        exitDateIso,
      });
      openCount++;
    }

    // 4. Mark-to-market every still-open position for today's equity point.
    let openValue = 0;
    for (const pos of openPositions) {
      const bars = await args.getBars(pos.ticker);
      const close = closeOnOrBefore(bars, dateIso) ?? pos.entryFill;
      openValue += markToMarket(pos.direction, pos.quantity, pos.entryFill, close);
    }

    const equity = cash + openValue;
    const returns = prevEquity > 0 ? (equity - prevEquity) / prevEquity : 0;
    equityCurve.push({
      timestamp: dayDate,
      date: dayDate,
      equity,
      cash,
      positionsValue: openValue,
      marketValue: openValue,
      cumulativeReturn: (equity - initialCapital) / initialCapital,
      cumulativeReturns: (equity - initialCapital) / initialCapital,
      returns,
      dailyReturn: returns,
      drawdown: 0, // PerformanceMetricsCalculator.calculateDrawdowns recomputes this from the curve
    });
    prevEquity = equity;
  }

  return {
    candidateCount,
    shadowCount,
    trades,
    equityCurve,
    totalCommissions,
    totalSlippage,
    firstCandidateDateIso,
    lastCandidateDateIso,
  };
}

function buildTypeReport(
  signalType: SignalType | "COMBINED",
  pass: PassResult,
  initialCapital: number,
  startIso: string,
  endIso: string,
): TypeReport {
  const metrics = PerformanceMetricsCalculator.calculate(
    pass.equityCurve,
    pass.trades,
    initialCapital,
    new Date(`${startIso}T00:00:00.000Z`),
    new Date(`${endIso}T00:00:00.000Z`),
    pass.totalCommissions,
    pass.totalSlippage,
  );
  const usableRange =
    pass.firstCandidateDateIso && pass.lastCandidateDateIso
      ? `${pass.firstCandidateDateIso} → ${pass.lastCandidateDateIso}`
      : "(no candidates in window)";

  return {
    signalType,
    candidateCount: pass.candidateCount,
    tradeCount: pass.trades.length,
    metrics,
    thinSample: pass.trades.length < THIN_SAMPLE_TRADE_THRESHOLD,
    usableRange,
  };
}

/**
 * Replay the engine day-by-day across `[options.startIso, options.endIso]`
 * and report Sharpe/MaxDD/trade-count per requested type and combined,
 * through `PerformanceMetricsCalculator.calculate()` directly.
 *
 * `PerformanceMetricsCalculator.calculate()` is called here with no
 * `regime-segmenter.sliceByRegime`/`metricsByRegime` step of any kind —
 * `regime-segmenter.ts`'s `REGIMES` constant has no window overlapping
 * calendar 2026 (RESEARCH §8), so slicing by regime would return an empty
 * set for every regime bucket. This module never imports `regime-segmenter`.
 */
export async function runLiveWindow(options: LiveWindowOptions): Promise<LiveWindowReport> {
  const intelDataDir = options.intelDataDir ?? "./data/intel";

  if (await isDrainLocked(intelDataDir)) {
    throw new Error(
      `live-window: refusing to run — intel backlog-drain holds ${DRAIN_LOCK_FILE} in ${intelDataDir}. Wait for the drain to finish (or investigate a stale lock) before measuring this window (RESEARCH Pitfall 4 — a concurrent drain rewrites ticker-day-summary mid-run).`,
    );
  }

  const config = await loadStrategyConfig();
  const initialCapital = options.initialCapital ?? config.assumedEquity;
  const costs: SimulationCosts = {
    slippagePctPerSide: options.slippagePctPerSide ?? DEFAULT_SLIPPAGE_PCT_PER_SIDE,
    commissionPerTrade: options.commissionPerTrade ?? DEFAULT_COMMISSION_PER_TRADE,
  };
  const requestedTypes = options.types ?? ALL_SIGNAL_TYPES;
  const allModules = options.modules ?? defaultSignalModules();
  const modulesFor = (types: readonly SignalType[]): SignalTypeModule[] =>
    allModules.filter((m) => types.includes(m.signalType));

  const dayIsos = enumerateDays(options.startIso, options.endIso);

  const skippedDays: Array<{ date: string; reason: string }> = [];
  const usableDayIsos: string[] = [];
  for (const dateIso of dayIsos) {
    if (await hasRollupFile(intelDataDir, dateIso)) {
      usableDayIsos.push(dateIso);
    } else {
      skippedDays.push({
        date: dateIso,
        reason: "no ticker-day-summary file for this day (substrate hole)",
      });
    }
  }

  const scratchStrategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "live-window-"));
  try {
    const sharedVixProvider =
      options.vixProvider ?? new VixProvider({ strategyDataDir: scratchStrategyDataDir });
    const sharedMarketData = options.marketData ?? new MarketDataService();

    const endDate = new Date(`${options.endIso}T00:00:00.000Z`);
    const priceFrom = new Date(`${options.startIso}T00:00:00.000Z`);
    const priceTo = new Date(
      Math.min(endDate.getTime() + PRICE_TAIL_BUFFER_DAYS * DAY_MS, Date.now()),
    );

    const barsCache = new Map<string, OHLCVData[]>();
    async function getBars(ticker: string): Promise<OHLCVData[]> {
      const cached = barsCache.get(ticker);
      if (cached) return cached;
      const raw = await sharedMarketData.fetchHistoricalData(ticker, priceFrom, priceTo);
      // Bars may arrive newest-first (Yahoo — the exact trap that silently
      // broke M2-01's SELL conditions, per strategy-adapter.ts) or already
      // ascending depending on provider/cache path — sort ascending
      // explicitly rather than trust the caller's order.
      const ascending = [...raw].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      barsCache.set(ticker, ascending);
      return ascending;
    }

    const runPassArgs = (
      passLabel: SignalType | "COMBINED",
      types: readonly SignalType[],
    ): RunPassArgs => ({
      passLabel,
      modules: modulesFor(types),
      dayIsos: usableDayIsos,
      intelDataDir,
      scratchStrategyDataDir,
      vixProvider: sharedVixProvider,
      marketData: sharedMarketData,
      getBars,
      initialCapital,
      maxSimultaneousPositions: config.maxSimultaneousPositions,
      costs,
      onProgress: options.onProgress,
    });

    const perType: Partial<Record<SignalType, TypeReport>> = {};
    let shadowCandidateCount = 0;

    for (const type of requestedTypes) {
      const pass = await runPass(runPassArgs(type, [type]));
      shadowCandidateCount += pass.shadowCount;
      perType[type] = buildTypeReport(type, pass, initialCapital, options.startIso, options.endIso);
    }

    const combinedPass = await runPass(runPassArgs("COMBINED", requestedTypes));
    const combined = buildTypeReport(
      "COMBINED",
      combinedPass,
      initialCapital,
      options.startIso,
      options.endIso,
    );

    return {
      window: { startIso: options.startIso, endIso: options.endIso },
      label: LIVE_WINDOW_LABEL,
      perType: perType as Record<SignalType, TypeReport>,
      combined,
      shadowCandidateCount,
      skippedDays,
    };
  } finally {
    await fs.rm(scratchStrategyDataDir, { recursive: true, force: true });
  }
}
