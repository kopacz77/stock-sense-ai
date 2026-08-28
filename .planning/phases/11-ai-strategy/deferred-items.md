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
