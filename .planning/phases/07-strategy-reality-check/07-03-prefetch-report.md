# M2-01 Universe Prefetch Report

**Generated:** 2026-05-31
**Window:** 2018-01-01 -> 2025-12-31
**Expected bars per ticker:** ~2016 (252 trading days x 8 years)
**Tickers prefetched:** 35/35

## Summary

- OK (gap <2%):       35/35
- DEGRADED (2-5%):    0/35
- FAILED (>5% / err): 0/35
- Provider mix:       yahoo: 35

## Per-Ticker Summary

| Ticker | Sector | Bars | First Bar | Last Bar | Gap % | Provider | Flag |
|--------|--------|------|-----------|----------|-------|----------|------|
| NVDA | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| GOOGL | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| AAPL | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| MSFT | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| META | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| AMZN | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| TSLA | Mega-cap | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| XOM | Energy | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| CVX | Energy | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| COP | Energy | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| SLB | Energy | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| JPM | Financials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| BAC | Financials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| GS | Financials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| MS | Financials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| UNH | Healthcare | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| LLY | Healthcare | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| JNJ | Healthcare | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| PFE | Healthcare | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| CAT | Industrials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| DE | Industrials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| BA | Industrials | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| HD | Consumer Disc. | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| NKE | Consumer Disc. | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| MCD | Consumer Disc. | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| PG | Consumer Staples | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| KO | Consumer Staples | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| NFLX | Communications | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| DIS | Communications | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| T | Communications | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| SPY | ETF | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| QQQ | ETF | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| IWM | ETF | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| XLE | ETF | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |
| XLK | ETF | 2010 | 2018-01-02 | 2025-12-30 | 0.30% | yahoo | OK |

## Flags Legend

- **OK**: gap <2% — data is complete enough for backtesting
- **DEGRADED**: gap 2-5% — usable but Plan 06 should note the gap in RECOMMENDATION.md
- **FAILED**: gap >5% or ticker missing — Plan 05 should skip OR Plan 06 must caveat

## Failures

None. All 35 tickers prefetched successfully.

## Notes

- **Bar count consistency:** All tickers returned exactly 2,010 bars for the
  2018-01-02 -> 2025-12-30 window. This is ~0.3% below the napkin-math
  estimate of ~2,016 (252 trading days x 8 years) — the small gap reflects
  exact NYSE/NASDAQ closures (Christmas, MLK Day, etc.) that the 252/year
  estimate rounds away. No tickers are flagged DEGRADED on this basis.

- **META historical continuity:** META (Yahoo symbol used) returns continuous
  daily bars across the 2022-06-09 FB->META rename. 2018-01-02 opens at
  ~$177, which matches FB's historical price. No symbol-switch fallback to
  `FB` was needed; Yahoo back-fills the pre-rename era under the META symbol.

- **Provider:** All 35 tickers were served by Yahoo Finance. Alpha Vantage
  was not available in this run (no API key configured locally), so the
  service short-circuited straight to the Yahoo fallback (per the chain wired
  in Plan 07-01). For reproducibility, the cache key is
  `{symbol}_2018-01-01_2025-12-31.json` in `data/cache/historical/`.

- **Cache TTL:** `DataCacheManager.historicalCacheTTL` is 24h. Plan 05 should
  run within 24h of this prefetch to hit cache, OR `historicalCacheTTL`
  should be bumped before Plan 05 starts. (For the M2-01 backtesting reality
  check, the 2018-2025 window is immutable historical data — a longer TTL is
  safe; that knob change is out of scope for this plan.)

- **Plan 05 readiness:** With cache populated, ~1,050 backtests (35 tickers x
  2 strategies x ~15 grid points) can run network-free. Resumable, fast.
