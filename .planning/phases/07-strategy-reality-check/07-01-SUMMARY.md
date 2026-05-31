---
phase: 07-strategy-reality-check
plan: 01
subsystem: data
tags: [yahoo-finance, market-data, fallback-chain, cache, axios]

requires:
  - phase: 01-backtesting-fix
    provides: MarketDataService + DataCacheManager
  - phase: 02-paper-trading
    provides: YahooFinanceProvider (legacy days-based fetch)
provides:
  - "YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to) — arbitrary date-range Yahoo fetch"
  - "MarketDataService.fetchHistoricalData provider chain: cache -> Alpha Vantage -> Finnhub -> Yahoo (with cache write-through)"
  - "Free unlimited fallback path for historical OHLCV bars"
affects:
  - "07-02 (backtest run pipeline) — can now fetch arbitrary historical windows"
  - "07-03 (universe prefetch) — 35 tickers × 8 years now fetchable in one batch"
  - "07-04 (regime segmenter), 07-05, 07-06 — depend on prefetched data"

tech-stack:
  added: []
  patterns:
    - "Three-tier provider fallback chain with cache write-through"
    - "Private parseChartResponse() helper shared between days-based and range-based Yahoo fetches"

key-files:
  created: []
  modified:
    - "src/data/providers/yahoo-finance-provider.ts"
    - "src/data/market-data-service.ts"

key-decisions:
  - "Keep legacy fetchHistoricalData(symbol, days) for backwards compatibility instead of deprecating"
  - "Extract shared response parsing into private parseChartResponse() to avoid duplication while preserving the legacy signature"
  - "Wrap Finnhub call in try/catch (previously rethrew) so any Finnhub failure falls through to Yahoo instead of bubbling up"
  - "Map HistoricalData -> OHLCVData explicitly even though the shapes are identical, to keep the type contract clean and drop any extra fields"

patterns-established:
  - "Provider chain pattern: try each provider in priority order, write through to cache on success, only throw if every provider fails"
  - "Final-fallback error message lists every provider tried + last underlying error for debuggability"

duration: 4m
completed: 2026-05-31
---

# Phase 07 Plan 01: Yahoo Finance Range Fetch + Fallback Wire-In Summary

**Yahoo Finance is now the unlimited final fallback in MarketDataService.fetchHistoricalData — unblocks the M2-01 universe prefetch (35 tickers × 8 years) without hitting Alpha Vantage's 25-req/day quota.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-31T01:56:18Z
- **Completed:** 2026-05-31T01:59:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` — uses Yahoo's `period1/period2` unix-second params against the existing `/v8/finance/chart` endpoint
- Extracted shared response parsing into private `parseChartResponse()` so the legacy `fetchHistoricalData(symbol, days)` and the new range method share parsing logic without code duplication
- Wired Yahoo as the third fallback in `MarketDataService.fetchHistoricalData()` after Alpha Vantage and Finnhub, with cache write-through via `cacheManager.setHistoricalData(..., 'yahoo')`
- Wrapped the Finnhub call in a try/catch so any Finnhub error (previously rethrown) now falls through to Yahoo
- Verified end-to-end: SPY 2018-01-01..2018-02-01 returns 21 OHLCV bars via Yahoo and writes a cache metadata entry with `provider: 'yahoo'`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fetchHistoricalDataRange to YahooFinanceProvider** — `84d4a55` (feat)
2. **Task 2: Wire Yahoo fallback into MarketDataService.fetchHistoricalData with cache write-through** — `81a1d19` (feat)

**Plan metadata commit:** (pending — added below after STATE.md update)

## Files Created/Modified

- `src/data/providers/yahoo-finance-provider.ts` — added `fetchHistoricalDataRange(symbol, from, to): Promise<HistoricalData[]>` (new public method, ~16 lines for the method itself, plus ~50 lines of shared private `parseChartResponse()` helper extracted from the existing `fetchHistoricalData`). Net diff: +62 / -9 lines. Legacy `fetchHistoricalData(symbol, days)` is byte-equivalent in behavior.
- `src/data/market-data-service.ts` — `fetchHistoricalData(symbol, from, to)` now has a third try block (lines ~510-540) that calls `yahooFinanceProvider.fetchHistoricalDataRange()`, maps `HistoricalData -> OHLCVData`, and writes to the cache via `cacheManager.setHistoricalData(symbol, from, to, data, 'yahoo')`. Finnhub block wrapped in try/catch. Net diff: +37 / -4 lines.

## Smoke Test Results

**Task 1 — direct provider call:**

```
YahooFinanceProvider.fetchHistoricalDataRange('SPY', 2018-01-01, 2018-02-01)
-> rows: 21
-> first: { date: '2018-01-02', open: 267.84, close: 268.77, volume: 86,655,700 }
-> last:  { date: '2018-01-31', open: 282.73, close: 281.90, volume: 108,364,800 }
```

**Task 2 — forced Yahoo fallback via MarketDataService:**

```
[null'd AV + Finnhub providers via reflection]
Falling back to Yahoo Finance for SPY (2018-01-01 -> 2018-02-01)
-> rows: 21
-> cache entry written: provider='yahoo', dataPoints=21
-> metadata: { from: '2018-01-01', to: '2018-02-01', expiresAt: 2026-06-01 }
```

Both smoke tests confirm the wire-through reaches the cache and returns properly typed `OHLCVData[]`.

## Decisions Made

- **Kept the legacy `fetchHistoricalData(symbol, days)` method** instead of deprecating it. Other callers (the quote-derivation path in `MarketDataService.getHistoricalData` and any direct consumer) still use the days-based API. Removing it would expand the blast radius unnecessarily.
- **Extracted shared parsing into `private parseChartResponse()`** rather than duplicating ~40 lines of array zipping / null-skipping / ISO-date conversion. The plan explicitly allowed this as an "optional refactor" — the file is cleaner and the new method gets the same null-handling + newest-first sort as the legacy one for free.
- **Explicit `HistoricalData -> OHLCVData` mapping** even though the shapes are identical (date, open, high, low, close, volume). Keeps the type contract clean and drops any future fields that diverge (e.g., if `OHLCVData.adjustedClose` becomes required).
- **Wrapped the Finnhub block in try/catch.** Previously, Finnhub failures rethrew (since the Yahoo fallback was the next-and-final option, this short-circuited the chain). With Yahoo wired in, Finnhub errors should fall through, not bubble up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Finnhub error-handling pattern adjusted**

- **Found during:** Task 2 (wire-through)
- **Issue:** The pre-existing Finnhub block had no try/catch — a Finnhub error would rethrow before reaching the new Yahoo fallback, defeating the chain.
- **Fix:** Wrapped the Finnhub call in try/catch with a `console.warn` log on failure, so any Finnhub error falls through to Yahoo.
- **Files modified:** `src/data/market-data-service.ts` (lines around the Finnhub block)
- **Verification:** Build clean; smoke test confirms Yahoo is reached when prior providers fail/are absent.
- **Committed in:** `81a1d19` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the fallback chain to function as intended. No scope creep.

## Issues Encountered

- **Apparent build failure on first attempt was a transient tsc cache state.** First `pnpm build` after Task 1 surfaced a `src/cli/backtest-commands.ts(24,27): error TS2440: Import declaration conflicts with local declaration of 'createStrategyFactory'` — but a fresh `pnpm build` immediately after came back clean with no source changes. The grep that showed an inline `createStrategyFactory` at line 778 was actually matching `getDefaultParameterRanges` (false positive). The 07-02 refactor was already complete and the inline duplicates had been removed. No code change required.
- **Plan's intended `pnpm start backtest data download SPY` smoke test was not runnable** because the `backtest data` subcommand namespace is shadowed by a Commander double-registration in `src/index.ts` (lines 1030-1031: `registerBacktestCommands` and `registerBacktestDataCommands` both call `program.command('backtest')`, and the second wins). This is a pre-existing CLI registration bug, out of scope for this plan. Substituted a direct tsx invocation of `MarketDataService.fetchHistoricalData` (with AV+Finnhub providers nulled) to exercise the Yahoo path and verify cache write-through.
- **`pnpm lint` shows 587 pre-existing errors / 200 warnings** across `commission-models.ts`, `backtest-engine.ts`, etc. These are baseline — none introduced by this plan. Build (`pnpm build`) is clean.

## User Setup Required

None — Yahoo Finance requires no API key.

## Next Phase Readiness

**Unblocked for next plans in M2-01:**
- 07-02 (backtest pipeline) — can call `MarketDataService.fetchHistoricalData(symbol, from, to)` for arbitrary ranges without quota concerns
- 07-03 (universe prefetch) — 35 tickers × ~2000 trading days now fits in one batch run; Yahoo is the unlimited fallback when AV's 25 req/day is exhausted
- 07-04 / 07-05 / 07-06 — all downstream consumers of the cached historical data

**Carry-over concerns (not blockers, but worth tracking):**
- The Commander double-registration bug in `src/index.ts` (`registerBacktestCommands` + `registerBacktestDataCommands` both calling `program.command('backtest')`) means `backtest data download/list/import/clear` CLI commands are unreachable. If 07-03's universe prefetch wants to invoke `data download` as a CLI step, this needs fixing first. Otherwise, calling `MarketDataService` directly from a script works.
- Yahoo's unofficial chart endpoint has no documented rate limit but can throttle aggressive callers. For 35-ticker batch fetches, sequential calls with a small delay (or per-symbol caching as already implemented) should be fine; massive parallel fan-out is not.

---
*Phase: 07-strategy-reality-check*
*Completed: 2026-05-31*
