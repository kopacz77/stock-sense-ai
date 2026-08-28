# Deferred Items — Phase 11 (ai-strategy)

Out-of-scope discoveries found during plan execution, logged per the executor's
scope-boundary rule (only auto-fix issues directly caused by the current
task's own changes — everything else is recorded here, not fixed).

## From 11-05 (engine registry / ranking / CLI completion)

**1. Provider fetch-failure logs may leak the Finnhub API key.**
- **Found during:** Task 3 real-data verification (`pnpm dev strategy run --date 2026-08-26 --dry-run`).
- **File:** `src/data/providers/finnhub-provider.ts` / `src/data/market-data-service.ts` (both pre-existing, untouched by any 11-05 task).
- **Issue:** When Alpha Vantage and Finnhub both fail for a symbol before falling back to Yahoo, `MarketDataService`'s console-logged Axios error object includes the full request `config`, which embeds the Finnhub API token in the querystring (`...&token=<key>...`) in plaintext. Observed live during this session's `--dry-run` smoke against real tickers (USO, XLF) that Alpha Vantage doesn't cover.
- **Why deferred:** Neither file is in this plan's `files_modified`, and the fix (redacting `token`/`apikey`/`api_key`-shaped querystring params before any console.error of an Axios error, or catching+re-throwing a sanitized error) is a cross-cutting concern for every `*-provider.ts` file, not a one-line change scoped to 11-05.
- **Suggested owner:** A small standalone hardening plan across `src/data/providers/*.ts`, or fold into the next `M2-06` (risk-gating) phase's ASVS pass.

## From 11-06 (live-window backtest runner + CLI)

**2. `MarketDataService`'s per-ticker-per-day OHLCV fetch pattern is unreliable under real Yahoo Finance rate-limiting at live-window-backtest call volumes.**
- **Found during:** Task 2 real-data verification (`pnpm dev strategy backtest`).
- **File:** `src/data/market-data-service.ts` / `src/data/providers/yahoo-finance-provider.ts` (both pre-existing, untouched by any 11-06 task).
- **Issue:** `StrategyEngine.generateCandidates`'s own per-day ATR fetch (`fetchHistoricalData(ticker, asOfDate-120d, asOfDate)`, a distinct `(symbol, from, to)` cache key every day since the window rolls) means a live-window backtest re-issues the full Alpha Vantage(fail, no key configured) → Finnhub(fail, `403 You don't have access to this resource` — Finnhub's free tier does not include the `/stock/candle` historical-OHLCV endpoint at all, so this 403 is expected on every call regardless of rate, not an entitlement fluke) → Yahoo Finance fallback chain for essentially every (ticker, day) pair in the window. At the call volumes an ~20-day, four-signal-type backtest produces, this session observed real, confirmed Yahoo Finance IP-level rate-limiting (`curl -sI https://query1.finance.yahoo.com` returned `HTTP/2 429` repeatedly), which the underlying Yahoo client absorbs with slow internal retries rather than a fast, surfaced failure — turning what should be a multi-minute replay into one that can stall for many minutes per ticker, even though the same ticker fetched standalone (fresh process, no accumulated request history) consistently returned in under 300ms during this same session, suggesting the degradation compounds within a single long-running process rather than being a flat, constant rate limit. A 20-day/all-four-type run was abandoned mid-flight during this session for exactly this reason; a 5-day/all-four-type run completed (see `11-06-SUMMARY.md`) but took materially longer than its ticker-day count alone would predict.
- **Why deferred:** Neither file is in this plan's `files_modified`, and the fix (an Alpha Vantage/paid data key so the free-tier Yahoo fallback isn't the workhorse path, and/or a shared 120-day-lookback cache keyed coarser than exact-date-range so consecutive days' ATR fetches for the same ticker reuse one fetch instead of N) is a `MarketDataService`-wide change, not a one-line fix scoped to this plan.
- **Suggested owner:** Before 11-08's phase-acceptance re-run (which re-executes the full default window), either acquire a real Alpha Vantage key or widen `DataCacheManager`'s historical-data cache key to a coarser granularity (e.g. cache per calendar month rather than per exact `(from, to)` pair) so a live-window backtest's rolling 120-day lookback reuses one fetch per ticker across consecutive days instead of one per day.
