---
phase: 07-strategy-reality-check
plan: 03
subsystem: data
tags: [universe-prefetch, yahoo-finance, cache, market-data, m2-01]

requires:
  - phase: 07-strategy-reality-check
    provides: "Plan 07-01 — MarketDataService Yahoo Finance fallback + range-based fetch"
provides:
  - "35-ticker M2-01 universe cached for 2018-01-01 -> 2025-12-31 in data/cache/historical/ (14MB, 2010 bars per ticker, 100% via Yahoo)"
  - "scripts/m201-prefetch-universe.ts — reproducible batched prefetch runner (4 batches of 10/10/10/5, with per-symbol retry-once)"
  - "scripts/m201-prefetch-report.ts — cache-hit-only quality analyzer that writes the per-ticker report"
  - ".planning/phases/07-strategy-reality-check/07-03-prefetch-report.md — per-ticker bar count, span, gap %, provider, flag"
affects:
  - "07-05 reality-check runner — can sweep ~1050 backtests with zero network I/O"
  - "07-06 RECOMMENDATION.md — has the data-quality context to caveat any DEGRADED/FAILED tickers (none in this run)"

tech-stack:
  added: []
  patterns:
    - "Universe prefetch driven by a tsx runner (bypasses the unreachable backtest data download CLI)"
    - "Batched fetch + per-symbol retry-once + small inter-call delay to be polite to Yahoo"

key-files:
  created:
    - "scripts/m201-prefetch-universe.ts"
    - "scripts/m201-prefetch-report.ts"
    - ".planning/phases/07-strategy-reality-check/07-03-prefetch-report.md"
  modified: []

key-decisions:
  - "Bypassed the broken backtest data download CLI in favor of a direct MarketDataService runner script (per Plan 07-01 carry-over guidance)"
  - "Did not commit data/cache/historical/ files (gitignored via /data/); cache is local-only and Plan 05 hits it on the same machine"
  - "Used Yahoo for all 35 tickers (no local Alpha Vantage key configured); the provider chain auto-short-circuited to the Yahoo fallback from Plan 07-01"
  - "Did NOT need a META->FB symbol-switch fallback; Yahoo's META symbol back-fills the pre-2022-06-09 FB era continuously"

patterns-established:
  - "tsx runner scripts in scripts/ as the durable execution path for batch data ops (CLI is broken; runner is reproducible)"
  - "Per-ticker quality flagging at <2% / 2-5% / >5% gap thresholds for downstream RECOMMENDATION.md context"

duration: 3m
completed: 2026-05-31
---

# Phase 07 Plan 03: M2-01 Universe Prefetch Summary

**All 35 M2-01 universe tickers cached locally for 2018-01-01 -> 2025-12-31 (2010 bars each, 14MB total, 100% via Yahoo) with a per-ticker data-quality report flagging 35/35 as OK.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-31T02:05:07Z
- **Completed:** 2026-05-31T02:07:41Z
- **Tasks:** 2
- **Files created:** 3 (2 scripts + 1 report)

## Accomplishments

- Wrote `scripts/m201-prefetch-universe.ts`: drives `MarketDataService.fetchHistoricalData` against the 35-ticker universe in 4 batches (10/10/10/5) with per-symbol retry-once and a 250ms inter-call delay
- Prefetched all 35 tickers in a single run (<1 min wall time) — Yahoo served every symbol, AV/Finnhub were unavailable locally and the provider chain (wired in Plan 07-01) short-circuited correctly to the Yahoo fallback
- Verified META historical continuity across the 2022-06-09 FB->META rename: Yahoo back-fills pre-2022 data under the META symbol (2018-01-02 open ~$177 matches the FB-era price), so no symbol-switch fallback was needed
- Wrote `scripts/m201-prefetch-report.ts`: reads cache via the service (exercises the cache-hit path), reads cache files directly to surface the original provider, and writes the markdown report
- Generated `07-03-prefetch-report.md` (91 lines): per-ticker table with sector, bar count, first/last bar, gap %, provider, flag, plus failures section, flags legend, and notes covering the bar-count-vs-252/yr math, META continuity, provider mix, and a cache-TTL caveat for Plan 05

## Task Commits

Each task was committed atomically:

1. **Task 1: Run universe prefetch via runner script** — `6f531f3` (feat)
2. **Task 2: Generate prefetch report with per-ticker quality summary** — `428033f` (feat)

**Plan metadata commit:** added after STATE.md update.

## Files Created/Modified

- `scripts/m201-prefetch-universe.ts` — Universe constant (35 tickers in 07-CONTEXT.md order), batched async loop calling `MarketDataService.fetchHistoricalData`, per-symbol retry-once on failure, per-batch summary stdout. +135 lines.
- `scripts/m201-prefetch-report.ts` — Cache-hit-only analyzer that fans out across the universe, reads cache file directly for the originating provider, computes bar count / first+last date / gap %, applies the OK/DEGRADED/FAILED flagging, and writes a sectioned markdown report (Summary, Per-Ticker table, Flags Legend, Failures, Notes). +220 lines.
- `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md` — Generated report. 91 lines.

**Cache files** (`data/cache/historical/*.json`): 35 entries totaling 14MB, written by the runner. Not committed (gitignored via `/data/` in .gitignore — local-only by design; Plan 05 regenerates via cache hits on the same machine, or re-runs the prefetch if the 24h `historicalCacheTTL` expires).

## Smoke Test Results

**Task 1 — prefetch runner:**
```
M2-01 universe prefetch starting (35 tickers, 2018-01-01 -> 2025-12-31)
Batch 1/4: NVDA, GOOGL, AAPL, MSFT, META, AMZN, TSLA, XOM, CVX, COP
  [NVDA]  OK 2010 bars (2018-01-02 -> 2025-12-30) in 0.3s
  [GOOGL] OK 2010 bars (2018-01-02 -> 2025-12-30) in 0.2s
  ...
Batch 4/4: SPY, QQQ, IWM, XLE, XLK
  [XLK]   OK 2010 bars (2018-01-02 -> 2025-12-30) in 0.1s

=== Prefetch complete ===
Success: 35/35
Failed:  0/35
```

**Task 2 — report generator:**
```
Analyzing 35 cached tickers...
  [NVDA] OK 2010 bars, gap 0.30%, provider=yahoo
  [GOOGL] OK 2010 bars, gap 0.30%, provider=yahoo
  ...
  [XLK]  OK 2010 bars, gap 0.30%, provider=yahoo
Report written to .planning/phases/07-strategy-reality-check/07-03-prefetch-report.md
```

**META FB-era continuity check:**
```
META 2018-01-02: { date: '2018-01-02', open: 177.68, close: 181.42, volume: 18,151,900 }
META 2022-06-09: { date: '2022-06-09', open: 194.28, close: 184.00, volume: 23,501,600 }
META total bars: 2010 (continuous; no symbol-switch needed)
```

## Decisions Made

- **Bypassed the broken CLI in favor of a tsx runner.** The plan suggested `pnpm start backtest data download`, but per Plan 07-01's carry-over note the `backtest data` subcommand namespace is shadowed by a Commander double-registration in `src/index.ts`. Building a runner that calls `MarketDataService.fetchHistoricalData` directly is the same exercise minus the broken CLI dispatch, and it's reproducible (committed to `scripts/`).
- **Did not commit cache files.** `/data/` is gitignored. Plan 05 runs on the same machine and will hit cache on a re-run within the 24h TTL, or re-execute `scripts/m201-prefetch-universe.ts` if needed. Committing 14MB of derivable JSON to the repo would bloat history with no upside.
- **Yahoo-only run is the realistic baseline.** No Alpha Vantage key is configured locally, so the chain went `cache miss -> AV unavailable -> Finnhub unavailable -> Yahoo OK` for every symbol. This is exactly what the Plan 07-01 fallback was built for. The report calls this out as "Provider mix: yahoo: 35" so Plan 06 knows the underlying source is uniform.
- **Defined "OK" as gap <2% (not the plan's <2% / "DEGRADED" 2-5%).** The plan's verbatim thresholds were preserved: OK <2%, DEGRADED 2-5%, FAILED >5%. All 35 tickers came in at exactly 0.30% gap (2010 actual vs 2016 expected) — well inside OK. The 0.30% is rounding noise: 252 trading days/yr × 8 yrs = 2016 over-counts the real NYSE/NASDAQ calendar by ~6 days across 8 years.
- **META handled by trusting Yahoo, not by adding a FB fallback.** The plan flagged META as a candidate for symbol-switch fallback. A quick continuity probe (read the cached file, check 2018-01-02 against known FB price) confirmed Yahoo back-fills cleanly under META — no fallback code needed. Saved complexity; documented in the report.

## Deviations from Plan

### Auto-fixed Issues

None.

### Method Substitution (documented, not a bug fix)

**Plan said:** Run `pnpm start backtest data download <tickers> --from 2018-01-01 --to 2025-12-31` in 4 batches.

**What was done:** Wrote `scripts/m201-prefetch-universe.ts` and ran it via `pnpm tsx`. Same provider chain, same cache writes, same date window. The plan itself anticipated this in the additional context provided to me ("invoke MarketDataService.fetchHistoricalData(symbol, from, to) directly from your runner script rather than going through the CLI") — so this is the prescribed path, not a deviation.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None. Method substitution was pre-approved in the execution context.

## Issues Encountered

- **`Warning: Alpha Vantage API key not available after initialization`** logged on every run — expected, AV is optional and the chain falls through to Yahoo. Surfaced cleanly, didn't block anything.
- **`Keytar not available, using file-based key storage (less secure)`** logged on every run — pre-existing platform message (WSL2 has no system keychain). Not introduced by this plan.

## User Setup Required

None — Yahoo Finance requires no API key.

## Next Phase Readiness

**Unblocked for downstream M2-01 plans:**
- 07-05 (reality-check runner) — can sweep ~1,050 backtests (35 tickers × 2 strategies × ~15 grid points) with zero network I/O. Cache hits will return in <1ms per `(symbol, from, to)` triple. Total sweep should be CPU-bound, not I/O-bound.
- 07-06 (RECOMMENDATION.md) — has the data-quality context to caveat any tickers (none in this run, but the report format scales for re-runs).

**Carry-over concerns (not blockers):**
- **Cache TTL is 24h.** `DataCacheManager.historicalCacheTTL = 24 * 60 * 60 * 1000`. Plan 05 should run within 24h of this prefetch, OR `historicalCacheTTL` should be bumped to e.g. 30 days for the immutable-historical-data use case (out of scope for this plan; the runner script makes re-prefetching trivial regardless).
- **The Commander double-registration bug from Plan 07-01 is still live.** Doesn't block 07-05/06 (they're scripts, not CLI invocations), but if any future plan wants `backtest data list/clear/import` it needs the fix first. Tracked in Plan 07-01's STATE.md note already.

---
*Phase: 07-strategy-reality-check*
*Completed: 2026-05-31*
