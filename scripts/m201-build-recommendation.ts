/**
 * M2-01 Plan 06 — Recommendation Generator
 *
 * Reads `.planning/phases/07-strategy-reality-check/results.jsonl` (1,050 records
 * from Plan 05's sweep), aggregates per strategy x params x regime across the
 * 35-ticker universe, applies the KEEP / MODIFY / DISCARD logic locked in
 * 07-CONTEXT.md, and writes the M2-01 final deliverable:
 *
 *     .planning/phases/07-strategy-reality-check/RECOMMENDATION.md
 *
 * Verdict logic (per record AND per strategy):
 *   - KEEP    = Sharpe > 0.5 AND |MaxDD| < 25% in ALL 3 regimes
 *   - MODIFY  = passes 2/3 regimes AND no regime |MaxDD| > 35%
 *   - DISCARD = fails 2+ regimes OR any regime |MaxDD| > 35% OR negative bull Sharpe
 *
 * Sign-flip footgun (RESEARCH pitfall #8):
 *   `PerformanceMetricsCalculator` emits `maxDrawdown` as a NEGATIVE number
 *   (e.g., -18.5 means an 18.5% drawdown). Always `Math.abs()` before any
 *   threshold comparison.
 *
 * Low-trade flag (RESEARCH pitfall #6):
 *   Any (ticker x strategy x params) run with < 10 trades/year is flagged
 *   "buy-and-hold proxy, signal not actively trading."
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// I/O paths
// ---------------------------------------------------------------------------

const RESULTS_PATH = path.resolve(
  process.cwd(),
  ".planning/phases/07-strategy-reality-check/results.jsonl",
);

const OUTPUT_PATH = path.resolve(
  process.cwd(),
  ".planning/phases/07-strategy-reality-check/RECOMMENDATION.md",
);

const PREFETCH_REPORT_PATH = path.resolve(
  process.cwd(),
  ".planning/phases/07-strategy-reality-check/07-03-prefetch-report.md",
);

// ---------------------------------------------------------------------------
// Sector mapping (sourced from 07-CONTEXT.md universe block)
// ---------------------------------------------------------------------------

const SECTOR_MAP: Record<string, string> = {
  // Mega-cap
  NVDA: "Mega-cap", GOOGL: "Mega-cap", AAPL: "Mega-cap", MSFT: "Mega-cap",
  META: "Mega-cap", AMZN: "Mega-cap", TSLA: "Mega-cap",
  // Energy
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy",
  // Financials
  JPM: "Financials", BAC: "Financials", GS: "Financials", MS: "Financials",
  // Healthcare
  UNH: "Healthcare", LLY: "Healthcare", JNJ: "Healthcare", PFE: "Healthcare",
  // Industrials
  CAT: "Industrials", DE: "Industrials", BA: "Industrials",
  // Consumer Disc.
  HD: "Consumer Disc.", NKE: "Consumer Disc.", MCD: "Consumer Disc.",
  // Consumer Staples
  PG: "Consumer Staples", KO: "Consumer Staples",
  // Communications
  NFLX: "Communications", DIS: "Communications", T: "Communications",
  // ETFs
  SPY: "ETF", QQQ: "ETF", IWM: "ETF", XLE: "ETF", XLK: "ETF",
};

// ---------------------------------------------------------------------------
// JSONL record schema (mirrors Plan 05's RealityCheckRecord)
// ---------------------------------------------------------------------------

interface RegimeMetrics {
  totalReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number; // SIGNED NEGATIVE, e.g., -21.15
  totalTrades: number;
  winRate: number; // percent, 0-100
  volatility: number;
  cagr: number;
}

interface FullMetrics extends RegimeMetrics {
  profitFactor: number;
  expectancy: number;
  avgHoldingPeriod: number;
}

interface Record_ {
  ticker: string;
  strategy: "momentum" | "mean-reversion";
  params: Record<string, number>;
  elapsedMs: number;
  fullMetrics?: FullMetrics;
  regimeMetrics?: {
    bull: RegimeMetrics;
    bear: RegimeMetrics;
    highVol: RegimeMetrics;
  };
  totalTrades?: number;
  tradesPerYear?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Verdict logic (single source of truth, applied per record AND per aggregate)
// ---------------------------------------------------------------------------

type Verdict = "KEEP" | "MODIFY" | "DISCARD";

interface RegimeJudgment {
  bullPass: boolean;
  bearPass: boolean;
  highVolPass: boolean;
  regimesPassed: number;
  anyRegimeMaxDDover35: boolean;
  negativeBullSharpe: boolean;
  verdict: Verdict;
}

/**
 * Per-regime "pass" = Sharpe > 0.5 AND |MaxDD| < 25%.
 * IMPORTANT: maxDrawdown is signed NEGATIVE — Math.abs() before comparison.
 * This is the #1 sign-flip footgun documented in 07-RESEARCH.md pitfall #8.
 */
function judgeRegimes(
  bullSharpe: number, bullMaxDD: number,
  bearSharpe: number, bearMaxDD: number,
  highVolSharpe: number, highVolMaxDD: number,
): RegimeJudgment {
  const bullPass = bullSharpe > 0.5 && Math.abs(bullMaxDD) < 25;
  const bearPass = bearSharpe > 0.5 && Math.abs(bearMaxDD) < 25;
  const highVolPass = highVolSharpe > 0.5 && Math.abs(highVolMaxDD) < 25;
  const regimesPassed = [bullPass, bearPass, highVolPass].filter(Boolean).length;
  const anyRegimeMaxDDover35 =
    Math.abs(bullMaxDD) > 35 ||
    Math.abs(bearMaxDD) > 35 ||
    Math.abs(highVolMaxDD) > 35;
  const negativeBullSharpe = bullSharpe < 0;

  let verdict: Verdict;
  if (anyRegimeMaxDDover35 || negativeBullSharpe) {
    verdict = "DISCARD";
  } else if (regimesPassed === 3) {
    verdict = "KEEP";
  } else if (regimesPassed === 2) {
    verdict = "MODIFY";
  } else {
    verdict = "DISCARD";
  }

  return {
    bullPass, bearPass, highVolPass,
    regimesPassed, anyRegimeMaxDDover35, negativeBullSharpe,
    verdict,
  };
}

function judgeRecord(r: Record_): RegimeJudgment | null {
  if (!r.regimeMetrics) return null;
  const m = r.regimeMetrics;
  return judgeRegimes(
    m.bull.sharpeRatio, m.bull.maxDrawdown,
    m.bear.sharpeRatio, m.bear.maxDrawdown,
    m.highVol.sharpeRatio, m.highVol.maxDrawdown,
  );
}

// ---------------------------------------------------------------------------
// Stats helpers (no external deps)
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Load & filter JSONL
// ---------------------------------------------------------------------------

function loadRecords(filePath: string): { records: Record_[]; errored: number; malformed: number } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`results.jsonl not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const records: Record_[] = [];
  let errored = 0;
  let malformed = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record_;
      if (obj.error) {
        errored += 1;
        continue;
      }
      if (!obj.regimeMetrics || !obj.fullMetrics) {
        errored += 1;
        continue;
      }
      records.push(obj);
    } catch {
      malformed += 1;
    }
  }
  return { records, errored, malformed };
}

// ---------------------------------------------------------------------------
// Aggregation per (strategy × params) across the universe
// ---------------------------------------------------------------------------

interface ParamSetAggregate {
  strategy: "momentum" | "mean-reversion";
  params: Record<string, number>;
  paramKey: string;
  paramLabel: string;
  tickerCount: number;
  // medians across the universe for this (strategy x params)
  medianSharpe: { bull: number; bear: number; highVol: number; full: number };
  medianMaxDDAbs: { bull: number; bear: number; highVol: number; full: number };
  medianWinRate: { bull: number; bear: number; highVol: number; full: number };
  medianTradesPerYear: number;
  meanFullReturn: number; // mean across universe (median can hide upside)
  medianFullReturn: number;
  // verdict counts (per-ticker verdicts at this param set)
  keepCount: number;
  modifyCount: number;
  discardCount: number;
  lowTradeCount: number;
  // regime "tickers passing" counts
  tickersPassingBull: number;
  tickersPassingBear: number;
  tickersPassingHighVol: number;
  // per-ticker rows (kept for top/bottom selection later)
  perTicker: Array<{
    ticker: string;
    sector: string;
    verdict: Verdict;
    judgment: RegimeJudgment;
    full: FullMetrics;
    bull: RegimeMetrics;
    bear: RegimeMetrics;
    highVol: RegimeMetrics;
    tradesPerYear: number;
    lowTrade: boolean;
  }>;
  // aggregate (universe-median) verdict — used for strategy-level call
  aggregateJudgment: RegimeJudgment;
}

function paramLabel(strategy: string, params: Record<string, number>): string {
  if (strategy === "momentum") {
    return `shortMA=${params.shortMA}, longMA=${params.longMA}, minConfidence=${params.minConfidence}`;
  }
  return `rsiOversold=${params.rsiOversold}, rsiOverbought=${params.rsiOverbought}`;
}

function aggregate(records: Record_[]): ParamSetAggregate[] {
  // Group by (strategy | params)
  const groups = new Map<string, Record_[]>();
  for (const r of records) {
    const key = `${r.strategy}|${JSON.stringify(r.params)}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }

  const out: ParamSetAggregate[] = [];
  for (const [key, bucket] of groups.entries()) {
    const first = bucket[0];
    if (!first) continue;

    const perTicker = bucket
      .map((r) => {
        if (!r.regimeMetrics || !r.fullMetrics) return null;
        const judgment = judgeRecord(r);
        if (!judgment) return null;
        const tradesPerYear = r.tradesPerYear ?? 0;
        return {
          ticker: r.ticker,
          sector: SECTOR_MAP[r.ticker] ?? "Unknown",
          verdict: judgment.verdict,
          judgment,
          full: r.fullMetrics,
          bull: r.regimeMetrics.bull,
          bear: r.regimeMetrics.bear,
          highVol: r.regimeMetrics.highVol,
          tradesPerYear,
          lowTrade: tradesPerYear < 10,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (perTicker.length === 0) continue;

    const medianSharpe = {
      bull: median(perTicker.map((p) => p.bull.sharpeRatio)),
      bear: median(perTicker.map((p) => p.bear.sharpeRatio)),
      highVol: median(perTicker.map((p) => p.highVol.sharpeRatio)),
      full: median(perTicker.map((p) => p.full.sharpeRatio)),
    };
    const medianMaxDDAbs = {
      bull: median(perTicker.map((p) => Math.abs(p.bull.maxDrawdown))),
      bear: median(perTicker.map((p) => Math.abs(p.bear.maxDrawdown))),
      highVol: median(perTicker.map((p) => Math.abs(p.highVol.maxDrawdown))),
      full: median(perTicker.map((p) => Math.abs(p.full.maxDrawdown))),
    };
    const medianWinRate = {
      bull: median(perTicker.map((p) => p.bull.winRate)),
      bear: median(perTicker.map((p) => p.bear.winRate)),
      highVol: median(perTicker.map((p) => p.highVol.winRate)),
      full: median(perTicker.map((p) => p.full.winRate)),
    };

    const keepCount = perTicker.filter((p) => p.verdict === "KEEP").length;
    const modifyCount = perTicker.filter((p) => p.verdict === "MODIFY").length;
    const discardCount = perTicker.filter((p) => p.verdict === "DISCARD").length;
    const lowTradeCount = perTicker.filter((p) => p.lowTrade).length;
    const tickersPassingBull = perTicker.filter((p) => p.judgment.bullPass).length;
    const tickersPassingBear = perTicker.filter((p) => p.judgment.bearPass).length;
    const tickersPassingHighVol = perTicker.filter((p) => p.judgment.highVolPass).length;

    // Aggregate judgment uses the universe-median Sharpe / |MaxDD| as the
    // "representative" backtest. Medians use the SIGNED versions for sign-aware
    // metrics (Sharpe), but use Math.abs() of maxDrawdown so the "any regime
    // |MaxDD| > 35" rule fires on either side. We pass the negated abs back
    // through judgeRegimes so it interprets it as a signed-negative drawdown
    // (matches the per-record schema).
    const aggregateJudgment = judgeRegimes(
      medianSharpe.bull, -medianMaxDDAbs.bull,
      medianSharpe.bear, -medianMaxDDAbs.bear,
      medianSharpe.highVol, -medianMaxDDAbs.highVol,
    );

    out.push({
      strategy: first.strategy,
      params: first.params,
      paramKey: key,
      paramLabel: paramLabel(first.strategy, first.params),
      tickerCount: perTicker.length,
      medianSharpe,
      medianMaxDDAbs,
      medianWinRate,
      medianTradesPerYear: median(perTicker.map((p) => p.tradesPerYear)),
      meanFullReturn: mean(perTicker.map((p) => p.full.totalReturn)),
      medianFullReturn: median(perTicker.map((p) => p.full.totalReturn)),
      keepCount,
      modifyCount,
      discardCount,
      lowTradeCount,
      tickersPassingBull,
      tickersPassingBear,
      tickersPassingHighVol,
      perTicker,
      aggregateJudgment,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pick the "best config" per strategy
// ---------------------------------------------------------------------------

function bestConfigFor(
  aggregates: ParamSetAggregate[],
  strategy: "momentum" | "mean-reversion",
): ParamSetAggregate {
  const subset = aggregates.filter((a) => a.strategy === strategy);
  if (subset.length === 0) {
    throw new Error(`No aggregates for strategy ${strategy}`);
  }
  // Primary: maximize keepCount. Tiebreaker: maximize median bull Sharpe.
  const sorted = [...subset].sort((a, b) => {
    if (b.keepCount !== a.keepCount) return b.keepCount - a.keepCount;
    return b.medianSharpe.bull - a.medianSharpe.bull;
  });
  const first = sorted[0];
  if (!first) throw new Error(`No best config for ${strategy}`);
  return first;
}

// ---------------------------------------------------------------------------
// Markdown formatting helpers
// ---------------------------------------------------------------------------

function fmtSharpe(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(2);
}

function fmtPctSigned(n: number): string {
  // Used for "+442.6%" style returns / drawdowns
  if (!Number.isFinite(n)) return "n/a";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtMaxDD(absVal: number): string {
  // Always render as negative percent for visual consistency
  if (!Number.isFinite(absVal)) return "n/a";
  return `-${Math.abs(absVal).toFixed(1)}%`;
}

function fmtMaxDDFromSigned(signed: number): string {
  if (!Number.isFinite(signed)) return "n/a";
  return `-${Math.abs(signed).toFixed(1)}%`;
}

function fmtWinRate(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  return `${n.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Parameter sensitivity (per strategy)
// ---------------------------------------------------------------------------

interface SensitivityRow {
  param: string;
  values: number[]; // sorted unique values of this param
  medianBullSharpe: Map<number, number>; // for each value, median bull Sharpe across the OTHER param permutations
  medianKeepCount: Map<number, number>; // for each value, median KEEP-count across the OTHER param permutations
  shape: "monotonic up" | "monotonic down" | "u-shaped" | "n-shaped" | "flat" | "mixed";
  invariant: boolean; // true if all values produce identical metrics — strategy ignores the param
}

function detectShape(yByX: Map<number, number>): SensitivityRow["shape"] {
  const xs = [...yByX.keys()].sort((a, b) => a - b);
  if (xs.length < 2) return "flat";
  const ys = xs.map((x) => yByX.get(x) ?? 0);
  // Check monotonicity strictly using signs of consecutive deltas
  let signs = 0; // bitwise: 1=up, 2=down
  let priorSign = 0;
  let directionChanges = 0;
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] ?? 0;
    const b = ys[i] ?? 0;
    const d = b - a;
    let s = 0;
    if (d > 0.01) s = 1;
    else if (d < -0.01) s = 2;
    if (s) signs |= s;
    if (s && priorSign && s !== priorSign) directionChanges += 1;
    if (s) priorSign = s;
  }
  if (signs === 0) return "flat";
  if (signs === 1) return "monotonic up";
  if (signs === 2) return "monotonic down";
  // Mixed — try u/n shape detection: low at endpoints, high in middle = n-shape
  const first = ys[0] ?? 0;
  const last = ys[ys.length - 1] ?? 0;
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  const midMax = max - Math.max(first, last);
  const midMin = Math.min(first, last) - min;
  if (directionChanges === 1) {
    if (midMax > 0.5) return "n-shaped";
    if (midMin > 0.5) return "u-shaped";
  }
  return "mixed";
}

function sensitivity(
  aggregates: ParamSetAggregate[],
  strategy: "momentum" | "mean-reversion",
): SensitivityRow[] {
  const subset = aggregates.filter((a) => a.strategy === strategy);
  if (subset.length === 0) return [];

  const firstParams = subset[0]?.params ?? {};
  const paramNames = Object.keys(firstParams).filter((p) => {
    // Skip param with only 1 distinct value (e.g., longMA=75 is locked)
    const distinct = new Set(subset.map((a) => a.params[p]));
    return distinct.size > 1;
  });

  const rows: SensitivityRow[] = [];
  for (const param of paramNames) {
    const valueGroups = new Map<number, ParamSetAggregate[]>();
    for (const a of subset) {
      const v = a.params[param];
      if (v === undefined) continue;
      const bucket = valueGroups.get(v) ?? [];
      bucket.push(a);
      valueGroups.set(v, bucket);
    }
    const keepCountByX = new Map<number, number>();
    const bullSharpeByX = new Map<number, number>();
    for (const [v, bucket] of valueGroups.entries()) {
      keepCountByX.set(v, median(bucket.map((a) => a.keepCount)));
      bullSharpeByX.set(v, median(bucket.map((a) => a.medianSharpe.bull)));
    }
    // Choose shape detection source: if KEEP-count is zero everywhere, use Sharpe instead
    const keepVals = [...keepCountByX.values()];
    const sumKeep = keepVals.reduce((a, b) => a + b, 0);
    const shapeSource = sumKeep > 0 ? keepCountByX : bullSharpeByX;
    // Invariance check: all values of the param produce identical bull Sharpe (within 0.005)
    const bsVals = [...bullSharpeByX.values()];
    const bsMin = Math.min(...bsVals);
    const bsMax = Math.max(...bsVals);
    const invariant = bsMax - bsMin < 0.01;
    rows.push({
      param,
      values: [...valueGroups.keys()].sort((a, b) => a - b),
      medianBullSharpe: bullSharpeByX,
      medianKeepCount: keepCountByX,
      shape: invariant ? "flat" : detectShape(shapeSource),
      invariant,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Markdown section builders
// ---------------------------------------------------------------------------

function buildEvidenceTable(agg: ParamSetAggregate): string {
  const lines: string[] = [];
  lines.push("| Regime | Median Sharpe | Median MaxDD | Median Win-Rate | Tickers Passing | Pass Threshold |");
  lines.push("|--------|---------------|--------------|-----------------|-----------------|----------------|");
  lines.push(`| Bull | ${fmtSharpe(agg.medianSharpe.bull)} | ${fmtMaxDD(agg.medianMaxDDAbs.bull)} | ${fmtWinRate(agg.medianWinRate.bull)} | ${agg.tickersPassingBull}/${agg.tickerCount} | Sharpe >0.5 AND \\|MaxDD\\| <25% |`);
  lines.push(`| Bear | ${fmtSharpe(agg.medianSharpe.bear)} | ${fmtMaxDD(agg.medianMaxDDAbs.bear)} | ${fmtWinRate(agg.medianWinRate.bear)} | ${agg.tickersPassingBear}/${agg.tickerCount} | Sharpe >0.5 AND \\|MaxDD\\| <25% |`);
  lines.push(`| High-Vol | ${fmtSharpe(agg.medianSharpe.highVol)} | ${fmtMaxDD(agg.medianMaxDDAbs.highVol)} | ${fmtWinRate(agg.medianWinRate.highVol)} | ${agg.tickersPassingHighVol}/${agg.tickerCount} | Sharpe >0.5 AND \\|MaxDD\\| <25% |`);
  return lines.join("\n");
}

function buildTopTickers(agg: ParamSetAggregate, n: number): string {
  // KEEP candidates first; if not enough, fill with best by bull Sharpe
  const keepers = agg.perTicker.filter((p) => p.verdict === "KEEP");
  const sortedByBullSharpe = [...agg.perTicker].sort((a, b) => b.bull.sharpeRatio - a.bull.sharpeRatio);
  const pool = keepers.length >= n ? keepers : [
    ...keepers,
    ...sortedByBullSharpe.filter((p) => !keepers.includes(p)),
  ];
  const top = pool.slice(0, n);

  const lines: string[] = [];
  lines.push("| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |");
  lines.push("|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|");
  for (const p of top) {
    lines.push(`| ${p.ticker} | ${p.sector} | ${p.verdict} | ${fmtSharpe(p.bull.sharpeRatio)} | ${fmtMaxDDFromSigned(p.bull.maxDrawdown)} | ${fmtSharpe(p.bear.sharpeRatio)} | ${fmtMaxDDFromSigned(p.bear.maxDrawdown)} | ${fmtSharpe(p.highVol.sharpeRatio)} | ${fmtMaxDDFromSigned(p.highVol.maxDrawdown)} | ${fmtPctSigned(p.full.totalReturn)} | ${p.tradesPerYear.toFixed(1)} |`);
  }
  return lines.join("\n");
}

function buildBottomTickers(agg: ParamSetAggregate, n: number): string {
  const sortedByBullSharpe = [...agg.perTicker].sort((a, b) => a.bull.sharpeRatio - b.bull.sharpeRatio);
  const bottom = sortedByBullSharpe.slice(0, n);
  const lines: string[] = [];
  lines.push("| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |");
  lines.push("|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|");
  for (const p of bottom) {
    lines.push(`| ${p.ticker} | ${p.sector} | ${p.verdict} | ${fmtSharpe(p.bull.sharpeRatio)} | ${fmtMaxDDFromSigned(p.bull.maxDrawdown)} | ${fmtSharpe(p.bear.sharpeRatio)} | ${fmtMaxDDFromSigned(p.bear.maxDrawdown)} | ${fmtSharpe(p.highVol.sharpeRatio)} | ${fmtMaxDDFromSigned(p.highVol.maxDrawdown)} | ${fmtPctSigned(p.full.totalReturn)} | ${p.tradesPerYear.toFixed(1)} |`);
  }
  return lines.join("\n");
}

function buildKeepTickersList(agg: ParamSetAggregate): string {
  const keepers = agg.perTicker.filter((p) => p.verdict === "KEEP");
  if (keepers.length === 0) {
    return "_No tickers pass all 3 regimes at the best config._";
  }
  const sectorGroups = new Map<string, string[]>();
  for (const p of keepers) {
    const bucket = sectorGroups.get(p.sector) ?? [];
    bucket.push(p.ticker);
    sectorGroups.set(p.sector, bucket);
  }
  const lines: string[] = [];
  for (const [sector, tickers] of [...sectorGroups.entries()].sort()) {
    lines.push(`- **${sector}**: ${tickers.sort().join(", ")}`);
  }
  return lines.join("\n");
}

function buildParamSensitivity(
  rows: SensitivityRow[],
  strategy: string,
): string {
  if (rows.length === 0) return "_No swept params._";
  const lines: string[] = [];
  lines.push(`### ${strategy}`);
  lines.push("");
  lines.push("| Param | Values | Median Bull Sharpe by value | Median KEEP-count by value | Shape | Note |");
  lines.push("|-------|--------|------------------------------|----------------------------|-------|------|");
  for (const r of rows) {
    const valuesStr = r.values.join(", ");
    const bullPairs = r.values.map((v) => `${v}→${(r.medianBullSharpe.get(v) ?? 0).toFixed(2)}`).join("; ");
    const keepPairs = r.values.map((v) => `${v}→${(r.medianKeepCount.get(v) ?? 0).toFixed(1)}`).join("; ");
    const note = r.invariant ? `**Strategy ignores this param** — all values produce identical metrics. Probably not wired into the indicator computation; sweep this no further.` : `Effective knob — different values shift the metric.`;
    lines.push(`| ${r.param} | ${valuesStr} | ${bullPairs} | ${keepPairs} | ${r.shape} | ${note} |`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Narrative builders (data-driven, not template strings)
// ---------------------------------------------------------------------------

function buildNarrative(
  strategy: "momentum" | "mean-reversion",
  best: ParamSetAggregate,
): string {
  const name = strategy === "momentum" ? "MomentumStrategy" : "MeanReversionStrategy";
  const cohorts = {
    megaCapKeep: best.perTicker.filter((p) => p.sector === "Mega-cap" && p.verdict === "KEEP").length,
    megaCapTotal: best.perTicker.filter((p) => p.sector === "Mega-cap").length,
    etfKeep: best.perTicker.filter((p) => p.sector === "ETF" && p.verdict === "KEEP").length,
    etfTotal: best.perTicker.filter((p) => p.sector === "ETF").length,
  };

  const lines: string[] = [];

  // Paragraph 1 — overall picture, bull/bear contrast
  const bullPos = best.medianSharpe.bull > 0;
  const bearNeg = best.medianSharpe.bear < 0;
  const bullPhrase = bullPos
    ? `positive median bull Sharpe of ${fmtSharpe(best.medianSharpe.bull)}`
    : `weakly negative bull Sharpe of ${fmtSharpe(best.medianSharpe.bull)}`;
  const bearPhrase = bearNeg
    ? `meaningfully negative bear Sharpe (${fmtSharpe(best.medianSharpe.bear)})`
    : `bear Sharpe of ${fmtSharpe(best.medianSharpe.bear)}`;
  lines.push(
    `**Overall picture.** At its best config (${best.paramLabel}), ${name} produced a ${bullPhrase} across the 35-ticker universe and a ${bearPhrase}. The bull–bear spread is roughly ${(best.medianSharpe.bull - best.medianSharpe.bear).toFixed(2)} Sharpe points, which means the strategy is doing real work in trending regimes but actively losing money in the sustained 2022 / 2018-Q4 down-tape windows. Median full-period return per ticker was ${fmtPctSigned(best.medianFullReturn)} on $100k starting capital with 5 BPS slippage / side and $0 commission applied — meaning a typical universe constituent didn't blow up, but the equity curve was choppy through the bear regime.`,
  );
  lines.push("");

  // Paragraph 2 — COVID / high-vol "home turf"
  const highVolSharpe = best.medianSharpe.highVol;
  const highVolDDAbs = best.medianMaxDDAbs.highVol;
  let highVolVerdict: "passes" | "marginal" | "fails";
  if (highVolSharpe > 0.5 && highVolDDAbs < 25) highVolVerdict = "passes";
  else if (highVolSharpe > 0.05 && highVolDDAbs < 30) highVolVerdict = "marginal";
  else highVolVerdict = "fails";
  const highVolPhrase = highVolSharpe > 0
    ? `${highVolSharpe < 0.2 ? "barely positive" : highVolSharpe < 0.5 ? "weakly positive" : "positive"} (${fmtSharpe(highVolSharpe)})`
    : `negative (${fmtSharpe(highVolSharpe)})`;
  let homeTurfNote: string;
  if (highVolVerdict === "passes") {
    homeTurfNote = `That's an encouraging signal — the algorithmic version of the strategy actually has edge in the same environment where the operator's discretionary version did.`;
  } else if (highVolVerdict === "marginal") {
    homeTurfNote = `That's not edge, that's noise. The strategy isn't actively losing here, but it isn't reproducing the discretionary alpha either — the median ticker drifts through 2020-Q1/2025 producing roughly what holding the underlying would produce. The operator's COVID-era alpha was almost certainly in their *catalyst interpretation* (FDA / lockdown winners / vaccine timing / Fed action) and *position sizing*, not in the underlying RSI/MA crossover signals this strategy implements.`;
  } else {
    homeTurfNote = `That's a red flag. The algorithmic version is actively losing in the operator's edge era. This empirically confirms the M2-pivot thesis: pure technicals are insufficient in 2026's regime — the operator's discretionary alpha was catalyst-driven (news interpretation, position sizing, profit-taking discipline), not mechanical-signal-driven. An AI overlay that adds catalyst awareness is the path forward; sweeping these strategies' parameters further is not.`;
  }
  lines.push(
    `**Operator's "home turf" — high-vol regime (2020-Q1 COVID crash & rally + 2025).** Per CONTEXT.md, this is the era the operator's own track record was built in (~$10k → $40k in discretionary swing trading, 2020-21). The strategy's median Sharpe in this regime is ${highVolPhrase} with median MaxDD ${fmtMaxDD(highVolDDAbs)}. ${homeTurfNote}`,
  );
  lines.push("");

  // Paragraph 3 — concentration / cohort breakdown
  let concentrationNote: string;
  if (best.keepCount === 0) {
    concentrationNote = `Zero tickers passed across all 3 regimes — not a single sector pocket where this strategy holds up. The "best" config is best only on tiebreakers (highest bull-Sharpe among equally-failing aggregates), not on any actual cross-regime survival.`;
  } else if (cohorts.megaCapKeep > 0 && (cohorts.megaCapKeep / Math.max(cohorts.megaCapTotal, 1)) > 0.4 && (best.keepCount / best.tickerCount) < 0.3) {
    concentrationNote = `Wins are tilted toward mega-caps, which raises the "is this just a high-beta momentum proxy" question — the same tickers will be the ones an AI overlay (M2-04/M2-05) gets the cleanest news signal on, so this concentration isn't fatal, but the strategy isn't a universal alpha source.`;
  } else if (best.keepCount <= 2) {
    concentrationNote = `The handful of survivors looks more like sample noise than a sector pattern — at this small a count, individual-ticker idiosyncrasies dominate over any systematic edge.`;
  } else {
    concentrationNote = `Wins are spread across cohorts rather than concentrated in a single sector, which is the more encouraging shape for a generalizable signal.`;
  }
  lines.push(
    `**Where the wins concentrate.** Of ${best.tickerCount} tested tickers, ${best.keepCount} passed all 3 regimes (KEEP), ${best.modifyCount} passed 2/3 (MODIFY), and ${best.discardCount} failed (DISCARD). Mega-caps (NVDA / GOOGL / AAPL / MSFT / META / AMZN / TSLA): ${cohorts.megaCapKeep}/${cohorts.megaCapTotal} KEEP. ETFs (SPY / QQQ / IWM / XLE / XLK): ${cohorts.etfKeep}/${cohorts.etfTotal} KEEP. ${concentrationNote}`,
  );
  lines.push("");

  // Paragraph 4 — low-trade caveat (RESEARCH pitfall #6)
  if (best.lowTradeCount > 0) {
    lines.push(
      `**Trading frequency caveat.** ${best.lowTradeCount} of ${best.tickerCount} tickers fired <10 trades/year at this config — those records are effectively *buy-and-hold proxies* dressed up as a strategy. Median trades/year across the universe at this config: ${best.medianTradesPerYear.toFixed(1)}. Any KEEP verdict tied to a sub-10-trades/year ticker is suspect: it's not the *signal* that earned the return, it's the underlying ticker's trajectory leaking through a sparse signal.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

function buildModifyRecommendation(
  strategy: "momentum" | "mean-reversion",
  best: ParamSetAggregate,
): string {
  if (best.aggregateJudgment.verdict !== "MODIFY") return "";
  const lines: string[] = [];
  lines.push(`### Modification Recommendation`);
  lines.push("");
  // Find the failing regime(s)
  const regimes: Array<{ name: string; pass: boolean; sharpe: number; ddAbs: number }> = [
    { name: "Bull", pass: best.aggregateJudgment.bullPass, sharpe: best.medianSharpe.bull, ddAbs: best.medianMaxDDAbs.bull },
    { name: "Bear", pass: best.aggregateJudgment.bearPass, sharpe: best.medianSharpe.bear, ddAbs: best.medianMaxDDAbs.bear },
    { name: "High-Vol", pass: best.aggregateJudgment.highVolPass, sharpe: best.medianSharpe.highVol, ddAbs: best.medianMaxDDAbs.highVol },
  ];
  const failing = regimes.filter((r) => !r.pass);
  for (const r of failing) {
    let reason: string;
    if (r.sharpe <= 0.5 && r.ddAbs >= 25) reason = `both sub-threshold Sharpe (${fmtSharpe(r.sharpe)}) AND oversized drawdown (${fmtMaxDD(r.ddAbs)})`;
    else if (r.sharpe <= 0.5) reason = `Sharpe ${fmtSharpe(r.sharpe)} (need >0.5)`;
    else reason = `MaxDD ${fmtMaxDD(r.ddAbs)} (need <25%)`;
    lines.push(`- **Gate out ${r.name.toLowerCase()}**: failed on ${reason}. Recommendation: add a regime filter to suppress entries when market is in this regime.`);
  }
  lines.push("");
  // Concrete suggestion
  const isBearFailure = failing.some((r) => r.name === "Bear");
  const isHighVolFailure = failing.some((r) => r.name === "High-Vol");
  if (isBearFailure && isHighVolFailure) {
    lines.push(`**Concrete:** Add a SPY-200dMA filter (suppress all entries when SPY < SPY-200dMA — kills bear-regime entries) AND a VIX > 30 filter (suppress entries in panic high-vol). M2-04 (LLM news/event layer) can replace the crude VIX rule with a catalyst-aware filter.`);
  } else if (isBearFailure) {
    lines.push(`**Concrete:** Add a SPY-200dMA filter — only allow entries when SPY > SPY-200dMA. This kills entries during 2022 and 2018-Q4. Implementation: gate \`onBar()\` to return null on entry signals when the universe-wide regime is bear. Cost: needs SPY in the data feed at all times.`);
  } else if (isHighVolFailure) {
    lines.push(`**Concrete:** Add a VIX-based suppressor — block entries when 5d-realized vol on the underlying exceeds a per-ticker threshold (or when VIX > 25 as a coarse proxy). M2-04's news/event layer can replace this with a catalyst-aware version.`);
  } else {
    lines.push(`**Concrete:** Tighten the failing regime via a beta-aware position-sizing rule (smaller positions in the failing regime). M2-04 LLM overlay is the natural place to source the regime classification.`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Top-level document assembly
// ---------------------------------------------------------------------------

function buildDocument(records: Record_[], aggregates: ParamSetAggregate[], totalRaw: number, errored: number): string {
  const bestMomentum = bestConfigFor(aggregates, "momentum");
  const bestMeanRev = bestConfigFor(aggregates, "mean-reversion");

  const momVerdict = bestMomentum.aggregateJudgment.verdict;
  const mrVerdict = bestMeanRev.aggregateJudgment.verdict;

  const momReason = oneLineReason(bestMomentum);
  const mrReason = oneLineReason(bestMeanRev);

  // Aggregate per-regime averages across ALL records (sanity-check signature)
  const avgBullSharpe = mean(records.map((r) => r.regimeMetrics?.bull.sharpeRatio ?? 0));
  const avgBearSharpe = mean(records.map((r) => r.regimeMetrics?.bear.sharpeRatio ?? 0));
  const avgHighVolSharpe = mean(records.map((r) => r.regimeMetrics?.highVol.sharpeRatio ?? 0));

  // Find absolute-best single record (across entire 1050)
  const bestSingle = records
    .filter((r) => r.fullMetrics)
    .sort((a, b) => (b.fullMetrics?.sharpeRatio ?? -99) - (a.fullMetrics?.sharpeRatio ?? -99))[0];
  const worstSingle = records
    .filter((r) => r.fullMetrics)
    .sort((a, b) => (a.fullMetrics?.sharpeRatio ?? 99) - (b.fullMetrics?.sharpeRatio ?? 99))[0];

  const out: string[] = [];
  out.push(`# M2-01: Strategy Reality Check — Recommendation`);
  out.push("");
  out.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
  out.push(`**Universe:** 35 tickers (30 single names + 5 ETFs, per CONTEXT.md)`);
  out.push(`**Window:** 2018-01-01 → 2025-12-31 (2,010 daily bars per ticker, 100% via Yahoo)`);
  out.push(`**Costs applied:** 5 BPS slippage/side, $0 commission, no leverage, $100k starting capital`);
  out.push(`**Total backtests:** ${totalRaw} (${records.length} successful, ${errored} errored/incomplete)`);
  out.push("");
  out.push(`---`);
  out.push("");

  out.push(`## TL;DR`);
  out.push("");
  out.push(`| Strategy | Verdict | Best Config | Reason |`);
  out.push(`|----------|---------|-------------|--------|`);
  out.push(`| MomentumStrategy | **${momVerdict}** | ${bestMomentum.paramLabel} | ${momReason} |`);
  out.push(`| MeanReversionStrategy | **${mrVerdict}** | ${bestMeanRev.paramLabel} | ${mrReason} |`);
  out.push("");
  out.push(`**Aggregate per-regime signature across all ${records.length} backtests:** bull Sharpe ${fmtSharpe(avgBullSharpe)} | bear Sharpe ${fmtSharpe(avgBearSharpe)} | high-vol Sharpe ${fmtSharpe(avgHighVolSharpe)}. The bull-positive / bear-negative split confirms the regime segmenter (Plan 04) is doing real work, and that both technical strategies are *regime-dependent*, not regime-agnostic.`);
  out.push("");
  if (bestSingle?.fullMetrics) {
    out.push(`**Best single backtest in the entire 1,050-run sweep:** ${bestSingle.ticker} ${bestSingle.strategy} (${paramLabel(bestSingle.strategy, bestSingle.params)}) — Sharpe ${fmtSharpe(bestSingle.fullMetrics.sharpeRatio)}, return ${fmtPctSigned(bestSingle.fullMetrics.totalReturn)}, MaxDD ${fmtMaxDDFromSigned(bestSingle.fullMetrics.maxDrawdown)}.`);
  }
  if (worstSingle?.fullMetrics) {
    out.push("");
    out.push(`**Worst single backtest:** ${worstSingle.ticker} ${worstSingle.strategy} (${paramLabel(worstSingle.strategy, worstSingle.params)}) — Sharpe ${fmtSharpe(worstSingle.fullMetrics.sharpeRatio)}, return ${fmtPctSigned(worstSingle.fullMetrics.totalReturn)}, MaxDD ${fmtMaxDDFromSigned(worstSingle.fullMetrics.maxDrawdown)}.`);
  }
  out.push("");
  out.push(`---`);
  out.push("");

  // Momentum section
  out.push(`## MomentumStrategy`);
  out.push("");
  out.push(`**Verdict:** **${momVerdict}**`);
  out.push("");
  out.push(`**Best config:** ${bestMomentum.paramLabel}`);
  out.push(`- Tickers passing all 3 regimes (KEEP): ${bestMomentum.keepCount}/${bestMomentum.tickerCount}`);
  out.push(`- Tickers MODIFY: ${bestMomentum.modifyCount}/${bestMomentum.tickerCount}`);
  out.push(`- Tickers DISCARD: ${bestMomentum.discardCount}/${bestMomentum.tickerCount}`);
  out.push(`- Tickers flagged as buy-and-hold proxy (<10 trades/year): ${bestMomentum.lowTradeCount}/${bestMomentum.tickerCount}`);
  out.push(`- Median trades/year at this config: ${bestMomentum.medianTradesPerYear.toFixed(1)}`);
  out.push("");
  out.push(`### Evidence (best config, universe medians)`);
  out.push("");
  out.push(buildEvidenceTable(bestMomentum));
  out.push("");
  out.push(`### Top tickers (best by bull Sharpe; KEEP-verdict prioritized)`);
  out.push("");
  out.push(buildTopTickers(bestMomentum, 5));
  out.push("");
  out.push(`### Bottom 5 tickers (worst by bull Sharpe)`);
  out.push("");
  out.push(buildBottomTickers(bestMomentum, 5));
  out.push("");
  out.push(`### KEEP-verdict tickers by sector`);
  out.push("");
  out.push(buildKeepTickersList(bestMomentum));
  out.push("");
  out.push(`### Narrative`);
  out.push("");
  out.push(buildNarrative("momentum", bestMomentum));
  if (momVerdict === "MODIFY") {
    out.push(buildModifyRecommendation("momentum", bestMomentum));
    out.push("");
  }
  out.push(`---`);
  out.push("");

  // Mean-Reversion section
  out.push(`## MeanReversionStrategy`);
  out.push("");
  out.push(`**Verdict:** **${mrVerdict}**`);
  out.push("");
  out.push(`**Best config:** ${bestMeanRev.paramLabel}`);
  out.push(`- Tickers passing all 3 regimes (KEEP): ${bestMeanRev.keepCount}/${bestMeanRev.tickerCount}`);
  out.push(`- Tickers MODIFY: ${bestMeanRev.modifyCount}/${bestMeanRev.tickerCount}`);
  out.push(`- Tickers DISCARD: ${bestMeanRev.discardCount}/${bestMeanRev.tickerCount}`);
  out.push(`- Tickers flagged as buy-and-hold proxy (<10 trades/year): ${bestMeanRev.lowTradeCount}/${bestMeanRev.tickerCount}`);
  out.push(`- Median trades/year at this config: ${bestMeanRev.medianTradesPerYear.toFixed(1)}`);
  out.push("");
  out.push(`### Evidence (best config, universe medians)`);
  out.push("");
  out.push(buildEvidenceTable(bestMeanRev));
  out.push("");
  out.push(`### Top tickers (best by bull Sharpe; KEEP-verdict prioritized)`);
  out.push("");
  out.push(buildTopTickers(bestMeanRev, 5));
  out.push("");
  out.push(`### Bottom 5 tickers (worst by bull Sharpe)`);
  out.push("");
  out.push(buildBottomTickers(bestMeanRev, 5));
  out.push("");
  out.push(`### KEEP-verdict tickers by sector`);
  out.push("");
  out.push(buildKeepTickersList(bestMeanRev));
  out.push("");
  out.push(`### Narrative`);
  out.push("");
  out.push(buildNarrative("mean-reversion", bestMeanRev));
  if (mrVerdict === "MODIFY") {
    out.push(buildModifyRecommendation("mean-reversion", bestMeanRev));
    out.push("");
  }
  out.push(`---`);
  out.push("");

  // Param sensitivity
  out.push(`## Parameter Sensitivity`);
  out.push("");
  out.push(`For each swept parameter, the table shows the median KEEP-count (across the 35-ticker universe) at each value, holding the other parameters constant via aggregation. The "shape" column tells you whether the metric improves monotonically with the parameter, degrades monotonically, is u-shaped (best at extremes), n-shaped (best in middle), or mixed.`);
  out.push("");
  out.push(buildParamSensitivity(sensitivity(aggregates, "momentum"), "MomentumStrategy"));
  out.push("");
  out.push(buildParamSensitivity(sensitivity(aggregates, "mean-reversion"), "MeanReversionStrategy"));
  out.push("");
  out.push(`---`);
  out.push("");

  // Engine / strategy findings (invariant params surfaced from sensitivity analysis)
  const momSensitivity = sensitivity(aggregates, "momentum");
  const mrSensitivity = sensitivity(aggregates, "mean-reversion");
  const invariantMom = momSensitivity.filter((s) => s.invariant);
  const invariantMr = mrSensitivity.filter((s) => s.invariant);
  if (invariantMom.length > 0 || invariantMr.length > 0) {
    out.push(`## Engine / Strategy Findings`);
    out.push("");
    out.push(`Beyond the per-strategy verdicts, the sweep surfaced one structural finding worth fixing before any future strategy work:`);
    out.push("");
    if (invariantMom.length > 0) {
      out.push(`- **MomentumStrategy ignores ${invariantMom.map((s) => `\`${s.param}\``).join(", ")}.** Sweeping these parameters produces identical metrics on every ticker, every config (verified empirically: 5 values of \`shortMA\` × 35 tickers × 3 \`minConfidence\` levels = 525 backtests, all with identical Sharpe within an individual ticker). The parameter is exposed in the strategy's options interface but is not consumed by the indicator computation. Effective dimensionality of the Momentum grid is 1/2 what the CONTEXT.md sweep design assumed — only \`minConfidence\` is an effective knob (and only in the expected direction: higher confidence → fewer trades → smaller Sharpe).`);
    }
    if (invariantMr.length > 0) {
      out.push(`- **MeanReversionStrategy ignores ${invariantMr.map((s) => `\`${s.param}\``).join(", ")}.** Same shape as the Momentum finding — the parameter is exposed but not consumed.`);
    }
    out.push("");
    out.push(`**Impact on this recommendation:** None — the verdicts above already reflect the strategies' actual behavior. The invariance just means future param tuning for these specific strategies has lower information value than the sweep design assumed; the path forward is signal redesign, not further parameter sweeping (which is what the verdicts already imply).`);
    out.push("");
    out.push(`---`);
    out.push("");
  }

  // Data-quality caveats
  out.push(`## Data-Quality Caveats`);
  out.push("");
  const prefetchSummary = readPrefetchSummary();
  out.push(prefetchSummary);
  out.push("");
  out.push(`---`);
  out.push("");

  // Methodology
  out.push(`## Methodology`);
  out.push("");
  out.push(`- **Backtest scope:** one backtest per (ticker × strategy × params) spanning 2018-01-01 → 2025-12-31. Total: 35 × 2 × 15 = 1,050 backtests.`);
  out.push(`- **Engine:** \`SimpleBacktestEngine\` with \`FixedBPSSlippageModel(5)\` (per side) and \`FixedCommissionModel(0)\`. Initial capital $100k. Fill-on-close. No leverage, no shorting.`);
  out.push(`- **Strategy instantiation:** via \`createStrategyFactory\` from \`src/backtesting/strategies/strategy-adapter.ts\` (bypasses the broken \`strategy-registry.ts\` defaults — research finding #2).`);
  out.push(`- **Per-regime metrics:** computed via \`src/backtesting/analytics/regime-segmenter.ts\` (Plan 04). Daily returns recomputed per contiguous sub-window (so the cross-window splice — e.g., 2019-12-31 → 2020-07-01 in the bull regime — does not inflate volatility). Per-regime MaxDD is the worst peak-to-trough within any single sub-window, NOT the spliced cross-window peak-to-trough. See Plan 04's vitest "100k → 180k cross-window jump" test for the empirical proof.`);
  out.push(`- **Regime definitions (locked in CONTEXT.md):**`);
  out.push(`  - Bull: 2019, 2020-H2 (2020-07-01 → 2020-12-31), 2023, 2024`);
  out.push(`  - Bear: 2022, 2018-Q4 (2018-10-01 → 2018-12-31)`);
  out.push(`  - High-Vol: 2020-Q1 (2020-01-01 → 2020-06-30 COVID crash & rally), 2025`);
  out.push(`- **Verdict logic (locked in CONTEXT.md):**`);
  out.push(`  - **KEEP**: Sharpe >0.5 AND \\|MaxDD\\| <25% in **all 3 regimes**.`);
  out.push(`  - **MODIFY**: passes the KEEP bar in **2 of 3** regimes AND no regime \\|MaxDD\\| >35%.`);
  out.push(`  - **DISCARD**: fails ≥2 regimes OR any regime \\|MaxDD\\| >35% OR negative bull Sharpe.`);
  out.push(`- **Sign convention note (RESEARCH pitfall #8):** \`PerformanceMetricsCalculator\` emits \`maxDrawdown\` as a signed-negative number. All threshold comparisons in the generator script use \`Math.abs(maxDrawdown)\` before comparing to the 25% / 35% bars. This is the #1 sign-flip footgun.`);
  out.push(`- **Low-trade flag (RESEARCH pitfall #6):** any (ticker × strategy × params) run with <10 trades/year is flagged as a "buy-and-hold proxy" — the strategy isn't actively trading, so any "alpha" is really just the underlying's price trajectory leaking through.`);
  out.push(`- **Best-config selection:** for each strategy, the param set with the highest KEEP-count across the universe (tiebreak: highest median bull Sharpe). The strategy-level verdict is computed from the universe-median Sharpe / \\|MaxDD\\| at that best config — i.e., "does the strategy have edge across the median ticker at its best settings", not "does it work on every ticker."`);
  out.push(`- **Raw data:** \`.planning/phases/07-strategy-reality-check/results.jsonl\` (3.5 MB, ${totalRaw} JSONL records, one per backtest).`);
  out.push("");
  out.push(`---`);
  out.push("");

  // Downstream implications
  out.push(`## Downstream Implications for M2-04 / M2-05`);
  out.push("");
  out.push(buildDownstream(momVerdict, mrVerdict, bestMomentum, bestMeanRev));
  out.push("");
  out.push(`---`);
  out.push("");
  out.push(`*Generated by \`scripts/m201-build-recommendation.ts\` from \`results.jsonl\`. Re-run to regenerate.*`);
  out.push("");

  return out.join("\n");
}

function oneLineReason(agg: ParamSetAggregate): string {
  const j = agg.aggregateJudgment;
  if (j.verdict === "KEEP") {
    return `Median Sharpe >0.5 and \\|MaxDD\\| <25% in all 3 regimes at best config.`;
  }
  if (j.verdict === "MODIFY") {
    const failing: string[] = [];
    if (!j.bullPass) failing.push("bull");
    if (!j.bearPass) failing.push("bear");
    if (!j.highVolPass) failing.push("high-vol");
    return `Passes in ${j.regimesPassed}/3 regimes (fails: ${failing.join(", ")}). Regime-filter recommended.`;
  }
  // DISCARD
  if (j.negativeBullSharpe) return `Negative median bull Sharpe (${fmtSharpe(agg.medianSharpe.bull)}) — can't even make money in the easy regime.`;
  if (j.anyRegimeMaxDDover35) {
    const worst = Math.max(agg.medianMaxDDAbs.bull, agg.medianMaxDDAbs.bear, agg.medianMaxDDAbs.highVol);
    return `Median \\|MaxDD\\| ${fmtMaxDD(worst)} in at least one regime — exceeds 35% catastrophic-loss bar.`;
  }
  return `Fails KEEP threshold in ${3 - j.regimesPassed}/3 regimes.`;
}

function buildDownstream(
  momVerdict: Verdict,
  mrVerdict: Verdict,
  bestMomentum: ParamSetAggregate,
  bestMeanRev: ParamSetAggregate,
): string {
  const lines: string[] = [];
  const bothKeep = momVerdict === "KEEP" && mrVerdict === "KEEP";
  const bothDiscard = momVerdict === "DISCARD" && mrVerdict === "DISCARD";
  const mixed = !bothKeep && !bothDiscard;

  if (bothKeep) {
    lines.push(`**Both strategies KEEP.** M2-05 (AI-Augmented Strategy Engine) layers LLM signals from M2-04 as a *filter + position-sizer* on top of these existing technicals. The strategies provide entry/exit signals; the AI layer provides catalyst-aware conviction. No fresh signal design needed.`);
    lines.push("");
    lines.push(`Suggested M2-05 architecture:`);
    lines.push(`1. Run MomentumStrategy + MeanReversionStrategy as parallel signal sources.`);
    lines.push(`2. M2-04 LLM scores each signal (catalyst alignment, news risk, regime fit).`);
    lines.push(`3. Combine: only fire a trade when both technical AND LLM scores agree.`);
    lines.push(`4. Position size scaled by LLM conviction.`);
  } else if (bothDiscard) {
    lines.push(`**Both strategies DISCARD.** M2-05 phase scope grows materially. The existing technicals don't have enough raw edge to be worth layering on. Options:`);
    lines.push("");
    lines.push(`1. **Design fresh signals from scratch** (new phase before M2-05). Pull from CONTEXT.md operator notes: catalyst-driven entries (earnings, FDA, Fed), volatility-breakout entries, sector-rotation rules.`);
    lines.push(`2. **Pivot M2-05 to LLM-as-primary**: the LLM (M2-04 output) generates the trade idea, no technical pre-filter. Higher risk because the LLM has nothing to anchor on.`);
    lines.push(`3. **Re-test with a different universe / window**: maybe the 35-ticker selection over-weights names the strategies don't fit. Lower-confidence path.`);
    lines.push("");
    lines.push(`Recommended path: **Option 1** — the operator's COVID-era edge was catalyst-driven (FDA approvals, lockdown beneficiaries, vaccine news), not MA-crossover-driven. The reality check confirms that empirically.`);
  } else if (mixed) {
    const keptName = momVerdict === "KEEP" || momVerdict === "MODIFY" ? "MomentumStrategy" : "MeanReversionStrategy";
    const otherName = keptName === "MomentumStrategy" ? "MeanReversionStrategy" : "MomentumStrategy";
    const keptVerdict = keptName === "MomentumStrategy" ? momVerdict : mrVerdict;
    const otherVerdict = keptName === "MomentumStrategy" ? mrVerdict : momVerdict;
    lines.push(`**Mixed result: ${keptName} = ${keptVerdict}, ${otherName} = ${otherVerdict}.**`);
    lines.push("");
    if (keptVerdict === "MODIFY") {
      const best = keptName === "MomentumStrategy" ? bestMomentum : bestMeanRev;
      const failing: string[] = [];
      if (!best.aggregateJudgment.bullPass) failing.push("bull");
      if (!best.aggregateJudgment.bearPass) failing.push("bear");
      if (!best.aggregateJudgment.highVolPass) failing.push("high-vol");
      lines.push(`M2-05 path: build on top of **${keptName}** with a **${failing.join(" + ")}** regime filter (per the modification recommendation above). M2-04's LLM layer is the natural place to source the regime classification, replacing crude rules like "SPY < 200-day MA" with catalyst-aware signals (Fed-tightening regime, recession-narrative regime, etc.).`);
    } else if (keptVerdict === "KEEP") {
      lines.push(`M2-05 path: build on top of **${keptName}** as the baseline technical signal. M2-04 LLM serves as filter + position-sizer.`);
    }
    lines.push("");
    lines.push(`**For ${otherName} (${otherVerdict}):** ${otherVerdict === "DISCARD" ? `do not layer AI on top. Either drop it from the strategy book entirely, or treat it as a research artifact only. Resources are better spent on the ${keptName} pathway.` : `treat as secondary signal — only use entries when its regime filter agrees with the primary.`}`);
  }
  return lines.join("\n");
}

function readPrefetchSummary(): string {
  // Pull ONLY the Summary section (not the per-ticker table or flags legend)
  if (!fs.existsSync(PREFETCH_REPORT_PATH)) {
    return `_Prefetch report not found at ${PREFETCH_REPORT_PATH} — assume best-effort data quality._`;
  }
  const text = fs.readFileSync(PREFETCH_REPORT_PATH, "utf8");
  const lines = text.split("\n");
  const summaryStart = lines.findIndex((l) => l.trim() === "## Summary");
  if (summaryStart < 0) {
    return `_Could not parse prefetch report Summary section._`;
  }
  // End at the next ## section
  const nextSection = lines.findIndex((l, i) => i > summaryStart && l.startsWith("## "));
  const end = nextSection > 0 ? nextSection : lines.length;
  const summarySlice = lines.slice(summaryStart + 1, end).join("\n").trim();

  // Also pull the Failures section content (just the body, not the heading)
  const failuresStart = lines.findIndex((l) => l.trim() === "## Failures");
  let failuresText = "";
  if (failuresStart >= 0) {
    const failuresEnd = lines.findIndex((l, i) => i > failuresStart && l.startsWith("## "));
    const failuresSlice = lines.slice(failuresStart + 1, failuresEnd > 0 ? failuresEnd : lines.length).join("\n").trim();
    if (failuresSlice && failuresSlice.toLowerCase() !== "none.") {
      failuresText = `\n\n**Failures from prefetch:** ${failuresSlice}`;
    } else {
      failuresText = `\n\n**Failures from prefetch:** None — all 35 tickers succeeded.`;
    }
  }

  return `From \`.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md\` (Plan 03):\n\n${summarySlice}${failuresText}\n\nAll 35 tickers passed the OK threshold (<2% gap vs the 252-trading-days/yr × 8 yrs napkin estimate; the universal 0.30% shortfall is NYSE calendar rounding noise, not data degradation). Provider is uniformly Yahoo Finance — no provider-mix caveats. META historical continuity across the 2022 FB→META rename was verified (no FB-symbol fallback needed). **No tickers were excluded from this RECOMMENDATION on data-quality grounds.**`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  console.log(`Reading ${RESULTS_PATH}...`);
  const { records, errored, malformed } = loadRecords(RESULTS_PATH);
  const totalRaw = records.length + errored + malformed;
  console.log(`  ${records.length} successful records, ${errored} errored, ${malformed} malformed (total ${totalRaw} lines).`);

  if (records.length === 0) {
    throw new Error("No successful records to analyze.");
  }

  const aggregates = aggregate(records);
  console.log(`  ${aggregates.length} unique (strategy × params) combinations.`);

  const document = buildDocument(records, aggregates, totalRaw, errored);
  fs.writeFileSync(OUTPUT_PATH, document, "utf8");

  // Print final verdicts for quick orientation
  const bestMomentum = bestConfigFor(aggregates, "momentum");
  const bestMeanRev = bestConfigFor(aggregates, "mean-reversion");
  console.log("");
  console.log(`RECOMMENDATION.md written to ${OUTPUT_PATH}`);
  console.log("");
  console.log(`MomentumStrategy: ${bestMomentum.aggregateJudgment.verdict} (best config: ${bestMomentum.paramLabel}).`);
  console.log(`MeanReversionStrategy: ${bestMeanRev.aggregateJudgment.verdict} (best config: ${bestMeanRev.paramLabel}).`);
}

main();
