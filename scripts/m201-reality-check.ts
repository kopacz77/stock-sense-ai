/**
 * M2-01 Strategy Reality Check Runner
 *
 * Executes ~1,050 backtests = 35 tickers × 2 strategies × 15 param-sets each,
 * across 2018-01-01 -> 2025-12-31, with locked costs (Alpaca-realistic:
 * FixedBPSSlippageModel(5) per side, FixedCommissionModel(0), no leverage),
 * persisting one JSONL record per backtest with both full-period and
 * per-regime (bull/bear/highVol) PerformanceMetrics.
 *
 * Output: append-only JSONL at
 *   .planning/phases/07-strategy-reality-check/results.jsonl
 *
 * Inputs:
 *   - Universe per `.planning/phases/07-strategy-reality-check/07-CONTEXT.md`
 *     (30 single names + 5 ETFs).
 *   - Param grids per CONTEXT.md (15 combos each strategy, validators
 *     pre-satisfied — shortMA<longMA=75 locked, rsiOversold<rsiOverbought
 *     because min(overbought)=60 > max(oversold)=40).
 *   - Cached bars from Plan 03 prefetch (24h TTL — re-run
 *     `pnpm tsx scripts/m201-prefetch-universe.ts` first if stale).
 *
 * Why this script bypasses src/strategies/strategy-registry.ts:
 *   The registry's momentum defaultParams use wrong keys (emaPeriod,
 *   rsiPeriod, ... instead of shortMA, longMA, ...). Plan 07-02
 *   extracted `createStrategyFactory` into a shared module that
 *   constructs strategies with the correct keys; this script uses that.
 *
 * Resumability:
 *   On startup, reads any existing results.jsonl and builds a Set of
 *   processed (ticker|strategy|paramJson) keys. Re-running picks up where
 *   the last run left off — useful if a run errors mid-sweep, or if you
 *   want to inspect partial results and resume.
 *
 * Smoke mode (`--smoke`):
 *   Universe = SPY/AAPL/NVDA, 1 param combo per strategy. ~6 records, <60s.
 *
 * Usage:
 *   pnpm tsx scripts/m201-reality-check.ts             # full sweep
 *   pnpm tsx scripts/m201-reality-check.ts --smoke     # smoke test
 *   pnpm tsx scripts/m201-reality-check.ts --reset     # delete JSONL first
 */

import * as fs from "fs";
import * as path from "path";

import { MarketDataService } from "../src/data/market-data-service.js";
import { SimpleBacktestEngine } from "../src/backtesting/engine/simple-backtest-engine.js";
import { FixedBPSSlippageModel } from "../src/backtesting/execution/slippage-models.js";
import { FixedCommissionModel } from "../src/backtesting/execution/commission-models.js";
import { createStrategyFactory } from "../src/backtesting/strategies/strategy-adapter.js";
import { metricsByRegime } from "../src/backtesting/analytics/regime-segmenter.js";
import type { Bar, PerformanceMetrics } from "../src/backtesting/types/backtest-types.js";

// ---------------------------------------------------------------------------
// Universe (35 tickers, locked in 07-CONTEXT.md)
// ---------------------------------------------------------------------------

const FULL_UNIVERSE = [
  // Mega-caps (7)
  "NVDA", "GOOGL", "AAPL", "MSFT", "META", "AMZN", "TSLA",
  // Energy (4)
  "XOM", "CVX", "COP", "SLB",
  // Financials (4)
  "JPM", "BAC", "GS", "MS",
  // Healthcare (4)
  "UNH", "LLY", "JNJ", "PFE",
  // Industrials (3)
  "CAT", "DE", "BA",
  // Consumer discretionary (3)
  "HD", "NKE", "MCD",
  // Consumer staples (2)
  "PG", "KO",
  // Communications (3)
  "NFLX", "DIS", "T",
  // ETFs (5)
  "SPY", "QQQ", "IWM", "XLE", "XLK",
] as const;

const SMOKE_UNIVERSE = ["SPY", "AAPL", "NVDA"] as const;

// ---------------------------------------------------------------------------
// Param grids (locked in 07-CONTEXT.md)
// ---------------------------------------------------------------------------

interface MomentumParams {
  shortMA: number;
  longMA: number;
  minConfidence: number;
}

interface MeanRevParams {
  rsiOversold: number;
  rsiOverbought: number;
}

function buildMomentumGrid(): MomentumParams[] {
  const grid: MomentumParams[] = [];
  // longMA = 75 locked: covers shortMA up to 50 with validator slack.
  for (const shortMA of [10, 15, 20, 30, 50]) {
    for (const minConfidence of [55, 65, 75]) {
      grid.push({ shortMA, longMA: 75, minConfidence });
    }
  }
  return grid;
}

function buildMeanReversionGrid(): MeanRevParams[] {
  const grid: MeanRevParams[] = [];
  // Validator requires rsiOversold < rsiOverbought. min(overbought)=60 >
  // max(oversold)=40, so the full cartesian is admissible — no filtering needed.
  for (const rsiOversold of [20, 25, 30, 35, 40]) {
    for (const rsiOverbought of [60, 70, 80]) {
      grid.push({ rsiOversold, rsiOverbought });
    }
  }
  return grid;
}

const MOMENTUM_GRID_FULL = buildMomentumGrid(); // 15 combos
const MEANREV_GRID_FULL = buildMeanReversionGrid(); // 15 combos

const SMOKE_MOMENTUM_GRID: MomentumParams[] = [{ shortMA: 20, longMA: 75, minConfidence: 65 }];
const SMOKE_MEANREV_GRID: MeanRevParams[] = [{ rsiOversold: 30, rsiOverbought: 70 }];

// ---------------------------------------------------------------------------
// Locked backtest config
// ---------------------------------------------------------------------------

const INITIAL_CAPITAL = 100_000;
const SLIPPAGE_BPS = 5; // 0.05% per side per CONTEXT.md
const COMMISSION_PER_TRADE = 0; // Alpaca $0/trade
const START_DATE = new Date("2018-01-01T00:00:00Z");
const END_DATE = new Date("2025-12-31T00:00:00Z");
const FILL_ON_CLOSE = true;
const MIN_BARS_REQUIRED = 500; // skip tickers with insufficient history

// ---------------------------------------------------------------------------
// Output path
// ---------------------------------------------------------------------------

const RESULTS_PATH = path.resolve(
  process.cwd(),
  ".planning/phases/07-strategy-reality-check/results.jsonl",
);

// ---------------------------------------------------------------------------
// Record schema
// ---------------------------------------------------------------------------

interface RealityCheckRecord {
  ticker: string;
  strategy: "momentum" | "mean-reversion";
  params: MomentumParams | MeanRevParams;
  elapsedMs: number;
  fullMetrics?: PerformanceMetrics;
  regimeMetrics?: {
    bull: PerformanceMetrics;
    bear: PerformanceMetrics;
    highVol: PerformanceMetrics;
  };
  totalTrades?: number;
  tradesPerYear?: number;
  error?: string;
}

function keyFor(ticker: string, strategy: string, params: object): string {
  return `${ticker}|${strategy}|${JSON.stringify(params)}`;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function ensureResultsDir(): void {
  const dir = path.dirname(RESULTS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendJsonl(record: RealityCheckRecord): void {
  fs.appendFileSync(RESULTS_PATH, JSON.stringify(record) + "\n", "utf8");
}

function loadProcessedKeys(): Set<string> {
  const set = new Set<string>();
  if (!fs.existsSync(RESULTS_PATH)) return set;
  const lines = fs.readFileSync(RESULTS_PATH, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as RealityCheckRecord;
      set.add(keyFor(r.ticker, r.strategy, r.params));
    } catch {
      // Skip malformed line; the next run will reprocess that combo.
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Bar conversion
// ---------------------------------------------------------------------------

interface OHLCVRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toBars(symbol: string, ohlcv: OHLCVRow[]): Bar[] {
  // Yahoo (and the cache built from it) returns rows newest-first; the engine
  // needs oldest-first so its sequential loop processes time forward. Sort
  // by date ascending before mapping.
  const sorted = [...ohlcv].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((h) => ({
    symbol: symbol.toUpperCase(),
    timestamp: new Date(h.date),
    open: h.open,
    high: h.high,
    low: h.low,
    close: h.close,
    volume: h.volume,
  }));
}

// ---------------------------------------------------------------------------
// Single-backtest runner
// ---------------------------------------------------------------------------

interface RunOneOptions {
  ticker: string;
  bars: Bar[];
  strategyName: "momentum" | "mean-reversion";
  params: MomentumParams | MeanRevParams;
}

async function runOne(opts: RunOneOptions): Promise<RealityCheckRecord> {
  const { ticker, bars, strategyName, params } = opts;
  const t0 = Date.now();

  try {
    const factory = createStrategyFactory(strategyName);
    const strategyAdapter = factory(params as unknown as Record<string, unknown>);

    const engine = new SimpleBacktestEngine(
      {
        id: `m201-${ticker}-${strategyName}-${t0}`,
        name: `M2-01 reality-check ${ticker} ${strategyName}`,
        symbols: [ticker],
        initialCapital: INITIAL_CAPITAL,
        commissionModel: new FixedCommissionModel(COMMISSION_PER_TRADE),
        slippageModel: new FixedBPSSlippageModel(SLIPPAGE_BPS),
        startDate: START_DATE,
        endDate: END_DATE,
        fillOnClose: FILL_ON_CLOSE,
        commission: { type: "FIXED", fixedFee: COMMISSION_PER_TRADE },
        slippage: { type: "FIXED", fixedAmount: SLIPPAGE_BPS },
        strategy: { name: strategyName, parameters: params as Record<string, unknown> },
      },
      strategyAdapter,
    );

    const result = await engine.run(ticker, bars);
    const elapsedMs = Date.now() - t0;

    const regimeMetrics = {
      bull: metricsByRegime(result, "bull"),
      bear: metricsByRegime(result, "bear"),
      highVol: metricsByRegime(result, "highVol"),
    };

    const totalTrades = result.metrics.totalTrades;
    // 8 years span (2018-2025 inclusive).
    const tradesPerYear = totalTrades / 8;

    return {
      ticker,
      strategy: strategyName,
      params,
      elapsedMs,
      fullMetrics: result.metrics,
      regimeMetrics,
      totalTrades,
      tradesPerYear,
    };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ticker,
      strategy: strategyName,
      params,
      elapsedMs,
      error: msg,
    };
  }
}

// ---------------------------------------------------------------------------
// Main sweep
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const smoke = args.has("--smoke");
  const reset = args.has("--reset");

  ensureResultsDir();

  if (reset && fs.existsSync(RESULTS_PATH)) {
    fs.unlinkSync(RESULTS_PATH);
    console.log(`[reset] Deleted ${RESULTS_PATH}`);
  }

  const universe: readonly string[] = smoke ? SMOKE_UNIVERSE : FULL_UNIVERSE;
  const momentumGrid = smoke ? SMOKE_MOMENTUM_GRID : MOMENTUM_GRID_FULL;
  const meanrevGrid = smoke ? SMOKE_MEANREV_GRID : MEANREV_GRID_FULL;

  const totalCombos =
    universe.length * (momentumGrid.length + meanrevGrid.length);

  console.log(
    `M2-01 reality-check starting${smoke ? " [SMOKE MODE]" : ""}\n` +
      `  Universe: ${universe.length} tickers\n` +
      `  Momentum grid: ${momentumGrid.length} combos\n` +
      `  MeanReversion grid: ${meanrevGrid.length} combos\n` +
      `  Total backtests: ${totalCombos}\n` +
      `  Output: ${RESULTS_PATH}\n`,
  );

  const processed = loadProcessedKeys();
  if (processed.size > 0) {
    console.log(`[resume] Found ${processed.size} previously-processed records — will skip.\n`);
  }

  const service = new MarketDataService();
  await service.initialize();

  const t0Sweep = Date.now();
  let runCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let skipCount = processed.size;

  for (const ticker of universe) {
    console.log(`\n=== ${ticker} ===`);
    let bars: Bar[];
    try {
      const ohlcv = await service.fetchHistoricalData(ticker, START_DATE, END_DATE);
      if (!ohlcv || ohlcv.length < MIN_BARS_REQUIRED) {
        console.warn(
          `  [${ticker}] only ${ohlcv?.length ?? 0} bars (<${MIN_BARS_REQUIRED}); skipping all combos.`,
        );
        // Emit error stubs so Plan 06 can see the gap.
        for (const params of momentumGrid) {
          appendJsonl({
            ticker,
            strategy: "momentum",
            params,
            elapsedMs: 0,
            error: `insufficient bars: ${ohlcv?.length ?? 0}`,
          });
          errorCount += 1;
          runCount += 1;
        }
        for (const params of meanrevGrid) {
          appendJsonl({
            ticker,
            strategy: "mean-reversion",
            params,
            elapsedMs: 0,
            error: `insufficient bars: ${ohlcv?.length ?? 0}`,
          });
          errorCount += 1;
          runCount += 1;
        }
        continue;
      }
      bars = toBars(ticker, ohlcv as OHLCVRow[]);
      console.log(`  loaded ${bars.length} bars (${bars[0]?.timestamp.toISOString().slice(0, 10)} -> ${bars[bars.length - 1]?.timestamp.toISOString().slice(0, 10)})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${ticker}] data fetch failed: ${msg}`);
      for (const params of momentumGrid) {
        appendJsonl({ ticker, strategy: "momentum", params, elapsedMs: 0, error: `fetch failed: ${msg}` });
        errorCount += 1;
        runCount += 1;
      }
      for (const params of meanrevGrid) {
        appendJsonl({ ticker, strategy: "mean-reversion", params, elapsedMs: 0, error: `fetch failed: ${msg}` });
        errorCount += 1;
        runCount += 1;
      }
      continue;
    }

    const work: Array<{ strategyName: "momentum" | "mean-reversion"; params: MomentumParams | MeanRevParams }> = [
      ...momentumGrid.map((p) => ({ strategyName: "momentum" as const, params: p })),
      ...meanrevGrid.map((p) => ({ strategyName: "mean-reversion" as const, params: p })),
    ];

    for (const { strategyName, params } of work) {
      const k = keyFor(ticker, strategyName, params);
      if (processed.has(k)) {
        continue; // already done in a prior run
      }

      const rec = await runOne({ ticker, bars, strategyName, params });
      appendJsonl(rec);
      processed.add(k);
      runCount += 1;
      if (rec.error) {
        errorCount += 1;
        console.error(
          `  [ERR] ${ticker} ${strategyName} ${JSON.stringify(params)} -> ${rec.error.slice(0, 200)}`,
        );
      } else {
        successCount += 1;
      }

      const totalDone = runCount + skipCount;
      if (totalDone % 50 === 0) {
        const elapsedSec = Math.round((Date.now() - t0Sweep) / 1000);
        console.log(
          `  [${totalDone}/${totalCombos}] elapsed ${elapsedSec}s | last: ${ticker} ${strategyName} ${JSON.stringify(params)}`,
        );
      }
    }
  }

  const totalSec = Math.round((Date.now() - t0Sweep) / 1000);
  console.log(`\n=== Sweep complete ===`);
  console.log(`  Total runs this session: ${runCount}`);
  console.log(`  Successes: ${successCount}`);
  console.log(`  Errors:    ${errorCount}`);
  console.log(`  Skipped (already processed): ${skipCount}`);
  console.log(`  Wall time: ${totalSec}s`);
  console.log(`  Output:    ${RESULTS_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
