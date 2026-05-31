/**
 * M2-01 Universe Prefetch
 *
 * Prefetches daily OHLCV bars for the locked 35-ticker M2-01 universe
 * (30 single names + 5 ETFs, per `.planning/phases/07-strategy-reality-check/07-CONTEXT.md`)
 * across 2018-01-01 -> 2025-12-31.
 *
 * Why a script rather than the CLI:
 * - The `backtest data download` CLI is currently unreachable due to a pre-existing
 *   Commander double-registration bug in `src/index.ts` (both `registerBacktestCommands`
 *   and `registerBacktestDataCommands` call `program.command('backtest')`; second wins).
 *   Plan 07-01 verified that calling `MarketDataService.fetchHistoricalData` directly
 *   works, and that path exercises the same cache + Yahoo fallback the CLI would use.
 *
 * Usage:
 *   pnpm tsx scripts/m201-prefetch-universe.ts
 *
 * Output: per-batch progress to stdout, populated `data/cache/historical/` on disk.
 */

import { MarketDataService } from "../src/data/market-data-service.js";

// Universe per .planning/phases/07-strategy-reality-check/07-CONTEXT.md
const UNIVERSE = [
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
];

const FROM = new Date("2018-01-01T00:00:00Z");
const TO = new Date("2025-12-31T00:00:00Z");
const BATCH_SIZE = 10;

interface FetchResult {
  symbol: string;
  ok: boolean;
  bars?: number;
  firstDate?: string;
  lastDate?: string;
  error?: string;
  retried?: boolean;
}

async function fetchOne(
  service: MarketDataService,
  symbol: string,
  attempt = 1,
): Promise<FetchResult> {
  try {
    const data = await service.fetchHistoricalData(symbol, FROM, TO);
    if (!data || data.length === 0) {
      return { symbol, ok: false, error: "empty response", retried: attempt > 1 };
    }
    // Data may be returned newest-first or oldest-first depending on provider; sort ascending.
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return {
      symbol,
      ok: true,
      bars: sorted.length,
      firstDate: sorted[0]?.date,
      lastDate: sorted[sorted.length - 1]?.date,
      retried: attempt > 1,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt === 1) {
      console.warn(`  [${symbol}] attempt 1 failed: ${msg.slice(0, 200)}; retrying once...`);
      // Small backoff before retry
      await new Promise((r) => setTimeout(r, 1500));
      return fetchOne(service, symbol, 2);
    }
    return { symbol, ok: false, error: msg, retried: true };
  }
}

async function main(): Promise<void> {
  const service = new MarketDataService();
  await service.initialize();

  console.log(`M2-01 universe prefetch starting (${UNIVERSE.length} tickers, ${FROM.toISOString().slice(0, 10)} -> ${TO.toISOString().slice(0, 10)})`);

  const results: FetchResult[] = [];
  const batches: string[][] = [];
  for (let i = 0; i < UNIVERSE.length; i += BATCH_SIZE) {
    batches.push(UNIVERSE.slice(i, i + BATCH_SIZE));
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    console.log(`\nBatch ${b + 1}/${batches.length}: ${batch.join(", ")}`);
    for (const symbol of batch) {
      const t0 = Date.now();
      const r = await fetchOne(service, symbol);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.ok) {
        console.log(`  [${symbol}] OK ${r.bars} bars (${r.firstDate} -> ${r.lastDate}) in ${dt}s${r.retried ? " (after retry)" : ""}`);
      } else {
        console.error(`  [${symbol}] FAILED after ${dt}s: ${r.error?.slice(0, 200)}`);
      }
      results.push(r);
      // Small inter-call delay so we don't hammer Yahoo.
      await new Promise((res) => setTimeout(res, 250));
    }
  }

  const successes = results.filter((r) => r.ok);
  const failures = results.filter((r) => !r.ok);

  console.log(`\n=== Prefetch complete ===`);
  console.log(`Success: ${successes.length}/${UNIVERSE.length}`);
  console.log(`Failed:  ${failures.length}/${UNIVERSE.length}`);
  if (failures.length > 0) {
    console.log(`Failures: ${failures.map((f) => f.symbol).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
