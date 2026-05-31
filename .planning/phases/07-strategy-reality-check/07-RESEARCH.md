# Phase M2-01: Strategy Reality Check — Research

**Researched:** 2026-05-30
**Domain:** Using existing backtest infrastructure to validate `MomentumStrategy` and `MeanReversionStrategy` across 2018-2025 with regime segmentation.
**Confidence:** HIGH (infrastructure is concrete, code-verified) / MEDIUM (data-provider date-range capability has a real risk worth raising before planning locks)

## Summary

The backtesting infrastructure built in M1 Phase 1 is fully present and exercised today via the CLI: `BacktestEngine`, `SimpleBacktestEngine`, `GridSearchOptimizer`, `WalkForwardAnalyzer`, `FixedBPSSlippageModel`, `FixedCommissionModel`, `MarketDataProvider` (adapter to `MarketDataService`), and `PerformanceMetricsCalculator` (Sharpe, Sortino, Calmar, MaxDD, win-rate, profit factor, expectancy, etc.). A `StrategyAdapter` already bridges the two strategies into the `BacktestStrategy` interface. M2-01 is overwhelmingly a *runner + aggregation* job, not a new-infrastructure job.

The two real research findings worth flagging before planning:

1. **Data-provider date-range capability is the one structural risk.** `MarketDataService.fetchHistoricalData(symbol, from, to)` routes to Alpha Vantage first (free tier: 25 req/day, 5 req/min) then Finnhub (stock-candle endpoint is widely reported premium-only as of 2024+). The Yahoo Finance fallback exists but the public method (`YahooFinanceProvider.fetchHistoricalData(symbol, days)`) only accepts a *days-back-from-today* argument, not an arbitrary `from`/`to` range — it's never wired into the enhanced `fetchHistoricalData` path. Pulling 35 tickers × 8 years on Alpha Vantage's free tier takes ≥2 calendar days. **Recommended:** add a small Yahoo Finance date-range method (the underlying API already supports `period1`/`period2`) and wire it into `MarketDataService.fetchHistoricalData` as the fallback. Yahoo is free, unlimited, and supports the full 2018-2025 range in a single call per symbol.

2. **No native per-regime metrics.** `PerformanceMetricsCalculator.calculate(equityCurve, trades, initialCapital, startDate, endDate, ...)` computes whole-backtest metrics. There is no built-in "give me metrics for this date slice." Two viable approaches: (a) run separate backtests per regime window and aggregate, or (b) run one 2018-2025 backtest per (ticker × strategy × param-set) and post-process the `equityCurve` + `trades` arrays by regime. Approach (b) is roughly 8× cheaper in compute and avoids cold-start strategy state issues; recommend it. The math is straightforward — filter `equityCurve` and `trades` by timestamp, then re-run `PerformanceMetricsCalculator.calculate()` on the slice with appropriate `startDate`/`endDate` and slice-anchored `initialCapital`.

Both strategies are usable today and have clear primary parameter knobs.

**Primary recommendation:** Add Yahoo Finance date-range fallback (1 small task), write a runner script that drives `SimpleBacktestEngine` over (35 tickers × 2 strategies × ~15 grid points = ~1,050 backtests), post-process equity curves into per-regime metrics, dump JSONL + per-strategy summary tables, and hand the planner the recommendation template.

---

## 1. Backtest Infrastructure Inventory

### Engines

| Component | File | Notes |
|-----------|------|-------|
| `BacktestEngine` | `src/backtesting/engine/backtest-engine.ts` | Full event-driven engine. Constructor: `(config: BacktestConfig, strategy: BacktestStrategy, dataProvider: DataProvider)`. `await engine.run()` returns `BacktestResult`. Used by `GridSearchOptimizer`. Loads data internally via the injected `DataProvider`. |
| `SimpleBacktestEngine` | `src/backtesting/engine/simple-backtest-engine.ts` | Bar-loop engine. Constructor: `(config: BacktestConfig, strategy: BacktestStrategy)`. Caller passes bars: `await engine.run(symbol, bars)`. **Position-sizing today:** 95% of cash on BUY, full position close on SELL, no pyramiding. This is what `backtest run` and `backtest compare` CLI commands use. |
| `BacktestConfig` | `src/backtesting/types/backtest-types.ts` | Requires `id`, `name`, `symbols`, `startDate`, `endDate`, `initialCapital`, `commission` config block, `slippage` config block, `strategy.name + parameters`. Can also accept `slippageModel`/`commissionModel` *instances* (preferred) — both engines use the instances if present. `fillOnClose` defaults to `true`. |
| `BacktestResult` | `src/backtesting/types/backtest-types.ts` | Contains `metrics: PerformanceMetrics`, `equityCurve: EquityCurvePoint[]`, `trades: Trade[]`, `drawdownCurve?`, `dailyReturns?`, `portfolioSnapshots`, `errors`, `statistics`. |

### Optimization

| Component | File | Notes |
|-----------|------|-------|
| `GridSearchOptimizer` | `src/backtesting/optimization/grid-search.ts` | Constructor: `(config: OptimizationConfig, dataProvider: DataProvider, strategyFactory: (params) => BacktestStrategy)`. Internally constructs a `BacktestEngine` per param-set (NOT `SimpleBacktestEngine`). Sequential execution (no concurrency despite `parallel`/`maxConcurrent` flags being defined in types). |
| `ParameterRange` | `src/backtesting/optimization/types.ts` | Either `values: [...]` (discrete) or `{min, max, step, type: 'integer'\|'continuous'}`. **Important for our use:** discrete `values` is the right choice for centered-on-default grids (lets us hand-pick non-uniform spacing). |
| `OptimizationRunResult` | `src/backtesting/optimization/types.ts` | Has `bestResult`, sorted `results[]`, `summary` with `parameterSensitivity` (avg objective per parameter value — useful for the recommendation doc). |
| `WalkForwardAnalyzer` | `src/backtesting/optimization/walk-forward.ts` | Exists but **out of scope per CONTEXT.md**. Mentioned for completeness. |

### Execution / Costs

| Component | File | Notes |
|-----------|------|-------|
| `FixedBPSSlippageModel` | `src/backtesting/execution/slippage-models.ts` | `new FixedBPSSlippageModel(5)` = 5 BPS = 0.05% per side. **Matches the locked cost exactly** (CONTEXT.md says 0.05%/side). |
| `FixedCommissionModel` | `src/backtesting/execution/commission-models.ts` | `new FixedCommissionModel(0)` = $0 per trade. Matches the locked Alpaca cost. |
| `ZeroCommissionModel` | same file | Equivalent to `FixedCommissionModel(0)`; either works. |

### Data

| Component | File | Notes |
|-----------|------|-------|
| `MarketDataProvider` | `src/backtesting/data/market-data-provider.ts` | Adapter implementing `DataProvider`. Wraps `MarketDataService`. In-memory cache by `${symbol}_${startDate.iso}_${endDate.iso}` key. Calls `marketDataService.fetchHistoricalData(symbol, from, to)`. **This is what the optimizer needs.** |
| `MarketDataService.fetchHistoricalData(symbol, from, to)` | `src/data/market-data-service.ts` (lines 468-502) | The enhanced path. Order of providers: cache → Alpha Vantage → Finnhub. **Yahoo is NOT tried here** (Yahoo is only in the legacy `getHistoricalData()` path with hardcoded 100-day window). Returns `OHLCVData[]`. |
| `DataCacheManager` | `src/data/cache-manager.ts` | File cache at `${cwd}/data/cache/historical/`. Keyed by `(symbol, from, to)`. 24h TTL. JSON-on-disk. Currently empty (16 KB total in `data/cache/`). |
| `HistoricalDataManager` | `src/backtesting/data/historical-data-manager.ts` | CSV loader + Alpha-Vantage-via-legacy-MarketDataService. **Not needed for M2-01** — we'll go through `MarketDataProvider` → `MarketDataService.fetchHistoricalData` instead. Also exposes `filterByDateRange(bars, startDate, endDate)` used by `SimpleBacktestEngine`. |

### Analytics

| Component | File | Notes |
|-----------|------|-------|
| `PerformanceMetricsCalculator.calculate(equityCurve, trades, initialCapital, startDate, endDate, totalCommissions, totalSlippage)` | `src/backtesting/analytics/performance-metrics.ts` | Static method. Returns full `PerformanceMetrics`: `totalReturn`, `cagr`, `annualizedReturn`, `sharpeRatio` (assumes 0% risk-free), `sortinoRatio`, `calmarRatio`, `maxDrawdown` (as **percentage**, signed negative), `maxDrawdownDuration`, `winRate` (as **percentage**, 0-100), `totalTrades`, `winningTrades`, `losingTrades`, `avgWin/Loss`, `profitFactor`, `payoffRatio`, `expectancy`, `expectancyPercent`, `avgHoldingPeriod`, `maxConsecutive{Wins,Losses}`. **This is reusable on a sliced equity curve.** |
| `PerformanceMetricsCalculator.calculateDrawdowns(equityCurve)` | same file | Standalone static method for drawdown series. Useful per-regime. |
| `EquityCurveBuilder` | `src/backtesting/analytics/equity-curve.ts` | Builds equity curves from portfolio snapshots. We don't need to touch it — engines already produce `equityCurve` in the result. |

### Strategy Adapter (already exists)

| Component | File | Notes |
|-----------|------|-------|
| `StrategyAdapter` | `src/cli/backtest-commands.ts` (lines 28-83) | Wraps `MeanReversionStrategy` or `MomentumStrategy` (which expose `.analyze()`) into the `BacktestStrategy` interface (`generateSignal`, `onBar`, `initialize`, `cleanup`). Reusable as-is for the M2-01 runner — likely belongs in `src/backtesting/strategies/` so it isn't trapped inside a CLI file, but that refactor is optional. |
| `createStrategyFactory(strategyName)` | `src/cli/backtest-commands.ts` (lines 837-865) | Returns `(params: Record<string, unknown>) => BacktestStrategy` for both strategies. Has correct constructor-key mapping. Reusable. |

### Caveats Found in Codebase

- **`strategy-registry.ts` is broken for momentum.** Lines 80-87 declare `defaultParams` with keys `emaPeriod`, `rsiPeriod`, `macdFastPeriod`, `macdSlowPeriod`, `macdSignalPeriod`, `minTrendStrength`, `volumeConfirmation`, `maxHoldingPeriod` — none of which match `MomentumConfig` (which expects `shortMA`, `longMA`, `macdFast`, `macdSlow`, `macdSignal`, `volumeThreshold`, `minConfidence`, `trendStrength`). Anyone using `StrategyRegistry.getStrategy('momentum')` would get garbage. The CLI bypasses the registry. **Recommendation:** do NOT use the registry for M2-01 — use `createStrategyFactory()` from `backtest-commands.ts` (or copy/relocate it). Fixing the registry is out of scope here.
- **`SimpleBacktestEngine` position sizing is naive** (95% of cash, all-in/all-out). This is fine for M2-01 — we're testing strategy expectancy, not portfolio management. Just be aware: results are per-ticker per-strategy, not "I deployed $100k across all 35 tickers."
- **`SimpleBacktestEngine` and `BacktestEngine` produce slightly different result shapes** in places (e.g., `BacktestEngine` returns `portfolioSnapshots: []` (always empty), `SimpleBacktestEngine` populates a snapshot). Both produce a full `equityCurve` and `metrics`. Either is fine for our needs.

---

## 2. Strategy Parameter Recommendations

### MomentumStrategy

**File:** `src/strategies/momentum-strategy.ts`
**Config interface:** `MomentumConfig` (lines 7-16)

| Parameter | Default | Role | Sweep recommendation |
|-----------|---------|------|----------------------|
| `shortMA` | 20 | Short-term SMA & EMA period; **the primary trend-detection knob** | Sweep: `[10, 15, 20, 30, 50]` (5 points, ±50% to +150% around default — wider on the upside because slower momentum is what we'd expect to filter noise in choppy markets) |
| `longMA` | 50 | Long-term SMA period | Constrained by `shortMA < longMA` validator; sweep `[40, 50, 75]` (3 points). **Combine carefully** — must hold `shortMA < longMA` else constructor throws. |
| `macdFast` | 12 | MACD fast EMA | Leave at default for M2-01. |
| `macdSlow` | 26 | MACD slow EMA | Leave at default. |
| `macdSignal` | 9 | MACD signal smoothing | Leave at default. |
| `volumeThreshold` | 1.5 | Volume ratio above which signal is amplified | Leave at default. |
| `minConfidence` | 65 | Minimum confidence to fire BUY/SELL (else HOLD) | Sweep: `[55, 65, 75]` (3 points). This is the "how trigger-happy" knob and is genuinely important. |
| `trendStrength` | 0.02 | Min % deviation from short MA to call it momentum | Leave at default for M2-01. |

**Recommended grid:** `shortMA × minConfidence` with `longMA = max(50, shortMA*2)` derived (or just lock `longMA=50` and constrain `shortMA<=30` to satisfy the validator). That's 5 × 3 = **15 combinations per (ticker × strategy)**, matching the CONTEXT.md target of ~9-27.

**Validator gotcha:** `MomentumStrategy.validateConfig()` throws if `shortMA >= longMA` or `macdFast >= macdSlow`. The grid above (shortMA max=50 with longMA=50) would fail at one corner. Either bump `longMA=75` or cap the grid to `shortMA<=30`. The planner should pick.

### MeanReversionStrategy

**File:** `src/strategies/mean-reversion-strategy.ts`
**Config interface:** `MeanReversionConfig` (lines 7-16)

| Parameter | Default | Role | Sweep recommendation |
|-----------|---------|------|----------------------|
| `rsiOversold` | 30 | RSI BUY trigger threshold; **the primary entry knob** | Sweep: `[20, 25, 30, 35, 40]` (5 points). Tighter (lower) = fewer but higher-conviction entries; looser = more frequent. |
| `rsiOverbought` | 70 | RSI SELL trigger threshold | Mirror of oversold; sweep `[60, 70, 80]` (3 points). Validator requires `rsiOversold < rsiOverbought`. |
| `mfiOversold` / `mfiOverbought` | 20 / 80 | Money Flow Index thresholds | Leave at defaults. |
| `bbStdDev` | 2 | Bollinger Band width (std devs) | Leave at default. |
| `minConfidence` | 60 | Minimum signal confidence | Leave at default (or sweep `[50, 60, 70]` if planner wants more breadth — 3 more points). |
| `volumeThreshold` | 1.2 | Volume amplifier threshold | Leave at default. |
| `maxHoldingPeriod` | 30 | Max days to hold (NOTE: **declared but the strategy does NOT enforce it** — there's no time-based exit in `analyze()`. The engine exits only on opposing signal, stop-loss, or end-of-backtest). | Irrelevant — declared but unused. Don't sweep. |

**Recommended grid:** `rsiOversold × rsiOverbought` = 5 × 3 = **15 combinations**, with constraint `rsiOversold < rsiOverbought` (the validator throws otherwise; `GridSearchOptimizer` supports `OptimizationConstraint` for this — see `example-configs.ts:141-152` for the pattern).

### Cross-Strategy Notes

- **Both strategies share `analyze(symbol, historicalData)` signature.** They take `HistoricalData[]` ordered **newest-first** (they `.reverse()` internally). `StrategyAdapter` already handles the conversion from the engine's newest-last `HistoricalDataPoint[]`. No glue work needed.
- **Both strategies require ≥50 historical bars** before they'll produce signals (Momentum: `max(longMA, 50)`; MeanReversion: hardcoded 50). For an 8-year backtest the warm-up is irrelevant, but be aware the first ~50 trading days produce zero signals.
- **Neither strategy implements its own exit logic beyond signal flip.** Exits come from: (a) opposite-direction signal, (b) engine-level `stopLoss`/`takeProfit` on the position (not set anywhere in the CLI path today), or (c) end-of-backtest auto-close. For M2-01 this means trades will tend to be long-held — relevant when reading `avgHoldingPeriod` results.

---

## 3. Data Provider Behavior

### What we have
- **Alpha Vantage** (`apiKey` configured in `.env`): supports `TIME_SERIES_DAILY_ADJUSTED` covering 20+ years on a single call. **Free tier: 25 requests/day, 5/min.** 35 tickers = ~2 days of fetching at the free-tier ceiling. Provider rate limiter (`src/data/rate-limiter.ts`) enforces 5/min.
- **Finnhub** (`apiKey` configured in `.env`): `/stock/candle` endpoint with `resolution=D`. **As of 2024, Finnhub's stock-candle endpoint for US equities is widely reported as premium-only on most accounts.** Their public docs/pricing pages are ambiguous. Treat as untrusted fallback — may 403/error per ticker.
- **Yahoo Finance** (`YahooFinanceProvider`, no key): **Free, unlimited, full history. But the current implementation hardcodes `days = 100` and does not accept arbitrary `from`/`to`.** It's only wired into the legacy `getHistoricalData()` path, not the enhanced `fetchHistoricalData(symbol, from, to)`. The underlying Yahoo API supports `period1`/`period2` Unix timestamps — adapting the provider is a ~10-line change.

### Cache
- `DataCacheManager` writes to `${cwd}/data/cache/historical/`. Currently empty.
- Cache key includes `(symbol, from, to)` and provider name. 24h TTL.
- For M2-01: once we fetch 2018-2025 for each of 35 tickers, ~1050 backtests reuse the cache without API calls. **Plan to fetch once, run many.**

### Risk and recommendation
**Risk:** if Alpha Vantage hits the daily limit mid-fetch (which it will at 25/day for 35 tickers), and Finnhub returns premium-only errors, the runner crashes for unfetched tickers. The cache helps on re-runs but the first full fetch is brittle.

**Recommended fix (1 small task in the plan):** Extend `YahooFinanceProvider` with a `fetchHistoricalDataRange(symbol, from, to)` method (the API already supports `period1`/`period2` — see lines 41-52 of `yahoo-finance-provider.ts`), and wire it into `MarketDataService.fetchHistoricalData()` as the final fallback (after Finnhub). Yahoo can do all 35 tickers × 8 years in 35 calls, with no key, no rate limit, in minutes.

**Alternative if planner wants to keep this phase pure:** write a one-shot data-prefetch script that uses Yahoo (calling a new method) and writes to the cache via `cacheManager.setHistoricalData(symbol, from, to, data, 'yahoo')`, then let the runner read from cache. Same end state with slightly more code.

### Survivorship bias note
- `src/backtesting/data/survivorship-bias-guard.ts` exists and defines a `DelistedStock` framework, but it's not auto-applied by either engine. **For our universe this isn't a concern:** all 35 tickers (mega-caps + sector leaders + ETFs) were public and listed throughout 2018-2025. The closest edge case is TWTR-like situations, and none of our tickers had a delisting event in window. Skip the guard for M2-01.

---

## 4. CLI Gap Analysis

### What we can reuse
- `backtest run <symbol>` — runs a **single** (symbol × strategy × default-params) backtest. Useful for sanity-checking but doesn't sweep params.
- `backtest compare <symbol>` — runs both strategies with default params on one ticker.
- `backtest optimize <symbol> --strategy <name>` — runs `GridSearchOptimizer` for ONE ticker with the hardcoded `getDefaultParameterRanges()` grid (lines 870-884 of `backtest-commands.ts`). The default ranges there are reasonable but DIFFERENT from what CONTEXT.md asks for — and the command only operates on ONE ticker.
- `backtest data download <symbols...>` — already batches downloads and uses the cache. **Use this to pre-fetch the universe.** Example: `pnpm start backtest data download NVDA GOOGL AAPL ... --from 2018-01-01 --to 2025-12-31`. Note: `download` calls `MarketDataService.batchDownload()` which hits the same provider-fallback chain (so this is where the Yahoo-date-range gap bites).
- `backtest data list` / `backtest data stats` — visibility into cache state.

### What we need to build
A new runner — one of these two options:

**Option A: CLI subcommand** (cleaner, follows existing patterns)
- New command: `backtest reality-check` or `m201` in `src/cli/backtest-commands.ts`.
- Takes a universe config file (or hardcodes the universe per CONTEXT.md).
- For each ticker:
  - For each strategy:
    - For each param grid point:
      - Run `SimpleBacktestEngine` with cached bars (full 2018-2025 window).
      - Slice equity curve by regime windows.
      - Recompute metrics per slice via `PerformanceMetricsCalculator.calculate()`.
- Aggregate per-strategy across tickers (median Sharpe, % of tickers passing, etc.).
- Emit JSONL of raw results.
- Emit summary table (`RECOMMENDATION.md` body) keyed by strategy + regime.

**Option B: Standalone Node script** (faster to write, doesn't pollute CLI)
- New file: `scripts/m201-reality-check.ts` (or `src/scripts/`).
- Same logic, no Commander wrapping.
- Run with `pnpm tsx scripts/m201-reality-check.ts`.

**Recommendation:** Option B for speed. M2-01 is a one-time research run; a CLI command adds permanent surface area for a transient need. Option A becomes worth it only if we expect to re-run reality checks for every new strategy (in which case extract the runner core into a reusable module).

Either way, the script/command is **~150-250 lines** and uses:
- `MarketDataProvider` (or `SimpleBacktestEngine` + cache reads) for bars
- `StrategyAdapter` + `createStrategyFactory` from `backtest-commands.ts` (will need to export them — currently both are file-local)
- `FixedBPSSlippageModel(5)` + `FixedCommissionModel(0)` for costs
- `PerformanceMetricsCalculator.calculate()` for per-regime re-computation

---

## 5. Metrics Gap Analysis

### What's native
`PerformanceMetrics` (after `calculate()`) gives us **everything CONTEXT.md needs**: `sharpeRatio`, `maxDrawdown` (as signed % — note: e.g. -0.18 means 18% drawdown), `winRate` (0-100), `totalReturn` (0-100), `profitFactor`, `expectancy`, `avgHoldingPeriod`, plus less critical extras.

### What's NOT native: per-regime metrics
`PerformanceMetricsCalculator.calculate()` operates on the whole `equityCurve` and `trades` arrays. There is **no built-in slice-by-date function**.

### Recommended approach: post-process the equity curve

Run **one** 2018-2025 backtest per (ticker × strategy × param-set), then for each regime:

```
For regime R with windows W_1, W_2, ...:
  sliced_equity = []
  sliced_trades = []
  for window (start, end) in R.windows:
    sliced_equity += equityCurve.filter(p => p.timestamp >= start && p.timestamp <= end)
    sliced_trades += trades.filter(t => t.exitDate >= start && t.exitDate <= end)
  # Re-anchor to slice
  slice_initial = sliced_equity[0].equity
  slice_metrics = PerformanceMetricsCalculator.calculate(
    sliced_equity,
    sliced_trades,
    slice_initial,
    R.windows[0].start,
    R.windows[-1].end,
    sum(sliced_trades.commission),
    sum(sliced_trades.slippage)
  )
```

**Two subtleties the planner should address in a task:**

1. **Discontinuous windows** (e.g., Bull = 2019 + 2020-H2 + 2023 + 2024 — gaps between them) will produce one-day "jumps" between windows in the spliced equity curve. The Sharpe/Sortino calcs use *daily returns* (`equityCurve[i].returns`), so we need to **filter out the cross-window jump returns** to avoid contaminating volatility. Easiest fix: re-compute daily returns from scratch after splicing, treating each contiguous sub-window independently for return calculation.

2. **`maxDrawdown` across spliced windows is the cross-window peak-to-trough**, which may not be meaningful. Better: compute `maxDrawdown` per contiguous sub-window and take the worst.

A small helper `sliceByRegime(equityCurve, trades, regimeWindows): SlicedResult` would centralize this. The planner should make it a dedicated task with explicit handling for these edge cases.

### Alternative considered (and rejected)
Run a separate backtest per regime sub-window. Rejected because: (a) strategies have a 50-bar warm-up that would eat the start of every short window (e.g., 2018-Q4 is only 64 trading days — half consumed by warm-up); (b) ~8× the compute (8 regime windows × strategy state restarts). Post-processing is correct here.

---

## 6. Concrete Pitfalls

| # | Pitfall | Why it bites | Mitigation |
|---|---------|--------------|------------|
| 1 | **Yahoo provider doesn't accept date ranges** — only `days` back from today | Fetching 2018 data via current Yahoo path is impossible; current Alpha Vantage free-tier limit means 35-ticker fetch takes ≥2 days; Finnhub stock-candle may be premium-only | Either add `fetchHistoricalDataRange(symbol, from, to)` to `YahooFinanceProvider` and wire into `MarketDataService` (≤30 LoC), OR commit to a 2-day Alpha Vantage prefetch then cache. Yahoo path is the right answer. |
| 2 | **`strategy-registry.ts` momentum defaults are wrong keys** — would crash at construction | Anyone tempted to use the registry will fail mysteriously | Don't touch the registry; instantiate strategies directly via `createStrategyFactory()` from `backtest-commands.ts` (or factor it out). |
| 3 | **`MomentumStrategy` validator throws on `shortMA >= longMA`** | A naive Cartesian sweep of `shortMA=[10..50]` × `longMA=[40..60]` produces many invalid combos that crash mid-run | Use `OptimizationConstraint` pattern from `example-configs.ts:141-152`, OR pre-filter the grid in the runner. |
| 4 | **`MeanReversionStrategy.maxHoldingPeriod` is declared but unused** | Operator might assume positions auto-exit after N days; they don't | Document in results; don't sweep this parameter; if time-based exits matter, that's a follow-up strategy modification, not a parameter. |
| 5 | **Daily-return splicing across discontinuous regime windows inflates volatility** | A "jump" return between e.g. 2019-12-31 and 2020-07-01 (skipping the COVID crash) will be treated as a single-day return — distorts Sharpe | Recompute daily returns per contiguous sub-window before aggregating; filter cross-window returns. |
| 6 | **`SimpleBacktestEngine` opens position with 95% of cash, holds until opposing signal** | For an 8-year backtest on a trending mega-cap, the strategy may take a single buy-and-hold position. Looks like a "win" but reveals nothing about the signal | Acceptable for sanity-check; flag low `totalTrades` (<10/year) results in the recommendation doc as "strategy not actively trading — buy-and-hold proxy." |
| 7 | **2020-Q1 (COVID crash) has extreme gaps & halts** | Some tickers had circuit-breaker halts; `volume = 0` rows can confuse volume-confirmation logic | `HistoricalDataManager.isValidBar()` already filters `volume < 0` but allows `volume === 0`. Either accept zero-volume bars or filter in the runner. ETFs and mega-caps mostly traded through, so impact is limited. |
| 8 | **`maxDrawdown` is signed negative** in `PerformanceMetrics` (e.g., -18.5 means 18.5% drawdown) | Easy to flip the sign and break the pass/fail check (CONTEXT.md: `MaxDD < 25%` means absolute MaxDD < 25% = `metrics.maxDrawdown > -25`) | Use `Math.abs(metrics.maxDrawdown)` for comparisons, explicitly. |
| 9 | **`winRate` is 0-100, not 0-1** in `PerformanceMetrics` | Easy to mis-format reports | Just be consistent; CONTEXT.md doesn't gate on win rate, so this is cosmetic. |
| 10 | **CLI default `--slippage` is 5 (interpreted as BPS by `FixedBPSSlippageModel`), matching CONTEXT.md's 0.05%** | Subtle: `--slippage 5` in CLI means 5 BPS = 0.05%. Don't confuse with "5%" | Be explicit in runner: `new FixedBPSSlippageModel(5)` with a comment. |
| 11 | **`GridSearchOptimizer` is sequential** despite `parallel`/`maxConcurrent` in its config type | 1,050 backtests sequentially is fine (~ minutes each? 8-year daily backtests are fast — likely sub-second per run) but if any single backtest hangs, the whole sweep stalls | Add a per-backtest timeout in the runner. For M2-01, sequential is acceptable — total runtime estimate: ~20-40 min for 1,050 cached-data backtests. |
| 12 | **No `executionTimeMs` populated by `SimpleBacktestEngine`** (hardcoded to 0) | If we want per-run timing for diagnostics, must wrap with our own timer | Use `Date.now()` around each `engine.run()` call. |

---

## 7. Recommended Task Decomposition

Suggested 6-task plan (planner can adjust granularity):

### Task 1: Data prefetch fix
- Add `fetchHistoricalDataRange(symbol: string, from: Date, to: Date): Promise<HistoricalData[]>` to `YahooFinanceProvider` using `period1`/`period2` (the API already supports it — body change is ~15 lines).
- Wire it into `MarketDataService.fetchHistoricalData()` as the final fallback after Finnhub.
- Add cache write-through so Yahoo results land in `DataCacheManager`.
- **Verification:** `backtest data download SPY --from 2018-01-01 --to 2025-12-31` succeeds and `backtest data list` shows SPY with ~2000 data points.

### Task 2: Universe prefetch
- Run `backtest data download` for all 35 tickers, 2018-01-01 → 2025-12-31.
- Validate via `backtest data validate <symbol>` for each.
- **Verification:** `data/cache/historical/` contains 35 cached datasets; each spans the full window with <5% gaps.

### Task 3: Refactor — expose `StrategyAdapter` and `createStrategyFactory`
- Move both from `src/cli/backtest-commands.ts` into a new `src/backtesting/strategies/strategy-adapter.ts`.
- Update CLI imports to use the new location.
- **Verification:** `pnpm build` clean; `backtest run AAPL` still works.

### Task 4: Regime segmentation helper
- New module: `src/backtesting/analytics/regime-segmenter.ts`.
- Export `REGIMES` constant: `{ bull: [...windows], bear: [...], highVol: [...] }` from CONTEXT.md windows.
- Export `sliceByRegime(equityCurve, trades, regime): { equityCurve, trades, dailyReturns, contiguousSubWindows }` that:
  - Filters equity curve and trades by date.
  - Recomputes daily returns per contiguous sub-window (avoids cross-window jump distortion).
  - Returns spliced arrays ready for `PerformanceMetricsCalculator`.
- Export `metricsByRegime(result: BacktestResult, regime): PerformanceMetrics`.
- **Verification:** unit test on a synthetic linear equity curve; per-regime Sharpe matches whole-period Sharpe when regime spans the whole period.

### Task 5: Reality-check runner script
- New file: `scripts/m201-reality-check.ts` (use `pnpm tsx`).
- Hardcode the 35-ticker universe + parameter grids from this RESEARCH.md.
- For each (ticker × strategy × param-set):
  - Load cached bars.
  - Run `SimpleBacktestEngine` with `FixedBPSSlippageModel(5)`, `FixedCommissionModel(0)`, `initialCapital=100000`, `fillOnClose=true`.
  - Compute per-regime metrics via `metricsByRegime()`.
  - Append result row to JSONL at `.planning/phases/07-strategy-reality-check/results.jsonl`.
- Print progress every 50 runs.
- **Verification:** runs end-to-end on a 3-ticker × 1-strategy × 1-param subset (smoke test) in <1 min and produces valid JSONL.

### Task 6: Recommendation document generator
- New file: `scripts/m201-build-recommendation.ts`.
- Reads `results.jsonl`.
- Aggregates per (strategy × regime): median Sharpe, median MaxDD, % of tickers passing the KEEP bar, best-performing param-set, worst-performing param-set.
- Applies CONTEXT.md pass/fail logic to produce KEEP/MODIFY/DISCARD verdict per strategy.
- Writes `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` with:
  - Per-strategy verdict + 2-3 paragraph narrative
  - Evidence table (regime × Sharpe × MaxDD × WinRate × Trade count, per strategy)
  - Best-config table (param-set → median metrics across universe)
  - List of tickers where the strategy passed all 3 regimes (the "works on these" list)
  - If MODIFY: specific filter recommendation (which regime to gate out)
- Also writes per-strategy per-regime CSV equity curves (CONTEXT.md says "nice-to-have").
- **Verification:** RECOMMENDATION.md renders, contains a clear KEEP/MODIFY/DISCARD verdict for both strategies, evidence aligns with raw JSONL.

### Optional Task 7: Data validation pass
- Run `backtest data validate` across all 35 tickers; flag any with >2% missing bars.
- Document in RECOMMENDATION.md if any ticker's results are degraded by data quality.

**Total estimated effort:** 1-2 days of focused work; runner script is ~200 lines, regime segmenter ~100 lines, recommendation generator ~250 lines. The Yahoo provider fix is ~30 LoC. No new dependencies.

---

## Sources

### Primary (HIGH confidence — code-verified)
- `src/backtesting/engine/backtest-engine.ts`, `simple-backtest-engine.ts` — engine APIs
- `src/backtesting/types/backtest-types.ts` — type contracts
- `src/backtesting/optimization/grid-search.ts`, `types.ts`, `example-configs.ts` — optimizer
- `src/backtesting/execution/slippage-models.ts`, `commission-models.ts` — cost models
- `src/backtesting/analytics/performance-metrics.ts` — metrics calc
- `src/backtesting/data/market-data-provider.ts`, `historical-data-manager.ts` — data adapters
- `src/strategies/momentum-strategy.ts`, `mean-reversion-strategy.ts`, `strategy-registry.ts` — strategy definitions and defaults
- `src/data/market-data-service.ts`, `cache-manager.ts`, `providers/yahoo-finance-provider.ts`, `alpha-vantage-provider.ts`, `finnhub-provider.ts` — data layer
- `src/cli/backtest-commands.ts`, `backtest-data-commands.ts` — existing CLI surface
- `.planning/phases/01-backtesting-fix/01-RESEARCH.md`, `SUMMARY.md` — historical context on infra build
- `.env` — confirmed Alpha Vantage and Finnhub keys are set

### Secondary (MEDIUM confidence — web search verified)
- Alpha Vantage docs / Find My Moat / AlphaLog (2025) — `TIME_SERIES_DAILY_ADJUSTED` available on free tier (25 req/day, 5/min, 20+ years coverage)

### Tertiary (LOW confidence — needs validation if it matters)
- Finnhub stock-candle endpoint premium-vs-free status in 2025 — search results were ambiguous; community reports (GitHub issues) suggest premium-only for US equities. **Recommendation:** smoke-test Finnhub on one ticker before relying on it; if it fails, Yahoo fix becomes mandatory rather than nice-to-have.

## Metadata

**Confidence breakdown:**
- Backtest infrastructure inventory: **HIGH** — all code paths read and verified
- Strategy parameter recommendations: **HIGH** — derived directly from config interfaces and validators
- Data provider behavior: **MEDIUM** — Alpha Vantage and Yahoo behavior verified in code; Finnhub free-tier candle availability uncertain
- CLI gap analysis: **HIGH** — full CLI surface read and mapped
- Metrics gap analysis: **HIGH** — `PerformanceMetricsCalculator` source read and verified
- Pitfalls: **HIGH** — each pitfall mapped to specific code lines

**Research date:** 2026-05-30
**Valid until:** ~30 days (infra is stable; data-provider API surfaces could shift)

## RESEARCH COMPLETE
