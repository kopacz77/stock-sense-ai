# Stock Sense AI - Development State

## Current Status

| Field | Value |
|-------|-------|
| Active Milestone | M2 — AI-Augmented Swing Trading |
| Current Phase | M2-01 Strategy Reality Check (Plans 07-01 + 07-02 + 07-03 + 07-04 complete; 07-05/06 pending) + M2-03 done + M2-04 next |
| Status | 07-03 universe prefetch landed; 35/35 tickers cached 2018-2025 via Yahoo, per-ticker quality report flags 35/35 OK; Plan 05 sweep can run network-free |
| Last Pivot | 2026-05-23 |
| Last Updated | 2026-05-31 |

---

## Milestone Progress

### Milestone 1 — Production-Ready Trading Platform

| Phase | Name | Status | Started | Completed |
|-------|------|--------|---------|-----------|
| 1 | Backtesting Fix | ✅ COMPLETE | 2026-01-16 | 2026-01-17 |
| 2 | Paper Trading | ✅ COMPLETE | 2026-01-17 | 2026-01-17 |
| 3 | Redis Infrastructure | ⏸ DEFERRED | — | — |
| 4 | Risk Integration | ⏸ DEFERRED | — | — |
| 5 | Code Quality | ⏸ DEFERRED | — | — |
| 6 | Testing | ⏸ DEFERRED | — | — |

### Milestone 2 — AI-Augmented Swing Trading (Active)

| Phase | Name | Status | Started | Completed |
|-------|------|--------|---------|-----------|
| M2-01 | Strategy Reality Check | pending | — | — |
| M2-02 | Alpaca Paper Integration | pending | — | — |
| M2-03 | Market Intelligence Bot | ✅ COMPLETE | 2026-05-23 | 2026-05-28 |
| M2-04 | LLM Trade-Signal Layer | pending | — | — |
| M2-05 | AI-Augmented Strategy Engine | pending | — | — |
| M2-06 | Hard Risk Management | pending | — | — |
| M2-07 | Live Execution + Tax Tracking | pending | — | — |

---

## Active Work

**Current Focus**: M2-03 closed. Next: discuss scope for M2-04 LLM Trade-Signal Layer.

**Blocking Issues**: None.

**Next Actions**:
1. Run `/gsd:discuss-phase` for M2-04 to align scope. Roadmap currently scopes M2-04 as per-ticker sentiment / theme tagging / catalyst flags — but live M2-03 alerts surfaced an additional gap: PM markets are macro (Iran / BTC / Fed / Trump) and map to ETFs/sectors, not single tickers. M2-04 scope likely needs to grow to include PM-market→ticker translation, depth-weighted conviction, and dedup across related markets.
2. Plan M2-04 (`/gsd:plan-phase`) producing PLAN.md with PM-to-ticker mapping decisions baked in.
3. Execute M2-04.

**Parallel track (lower priority)**: M2-01 Strategy Reality Check — Plans 07-01/02/03/04 complete. Next is 07-05 (reality-check runner; can sweep ~1,050 backtests against the now-prefetched cache with zero network I/O), then 07-06 (RECOMMENDATION.md). 07-03 cache TTL is 24h — re-run `pnpm tsx scripts/m201-prefetch-universe.ts` if more than a day elapses before Plan 05 starts.

---

## Session History

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-16 | M1 Initialized | Created roadmap, state, phase directories, requirements traceability |
| 2026-01-16 | Plan 01-01 | Enabled CLI backtest commands (commit: a30153c) |
| 2026-01-16 | Plan 01-02 | Fixed StrategyAdapter type safety (commit: 47837f4) |
| 2026-01-16 | Plan 01-04 | Added comprehensive performance reports with 30+ metrics (commit: 2354f4b) |
| 2026-01-17 | Plan 01-03 | Added grid search optimization and walk-forward analysis CLI commands (commit: 6482458) |
| 2026-01-17 | Phase 01 | Backtesting Fix phase COMPLETE |
| 2026-01-17 | Plan 02-01 | Real market data integration for paper trading (5 commits) |
| 2026-01-17 | Plan 02-02 | Strategy loading API (5 commits) |
| 2026-01-17 | Plan 02-03 | Trailing stop fixes (5 commits) |
| 2026-01-17 | Plan 02-04 | Order type verification (3 commits) |
| 2026-01-17 | Phase 02 | Paper Trading phase COMPLETE |
| 2026-05-23 | **Milestone Pivot** | M1 paused after Phase 2; M2 (AI-Augmented Swing Trading) begun. PROJECT.md, ROADMAP.md, REQUIREMENTS.md rewritten. |
| 2026-05-23 | M2-03 begun | Built news + Polymarket + rule-based + LLM correlator + Telegram alerts; node-cron scheduler; persisted JSONL streams. |
| 2026-05-26 | M2-03 commit 4aed303 | First full end-to-end commit — pipeline producing alerts via local Qwen 3 14B + Telegram. |
| 2026-05-28 | M2-03 commit be4107c | Follow-up: macro RSS news source (CNBC/Google/MarketWatch), Polymarket volume-desc sort fix, CLI/scheduler pipeline consolidation. Pipeline started firing real Iran-peace + BTC-divergence alerts. |
| 2026-05-28 | M2-03 commit 0aff0e5 | Scheduler fix: replaced node-cron with sleep-resilient setInterval heartbeat (WSL2 host-sleep was silently dropping `*/15` cron fires during market hours). |
| 2026-05-28 | **Phase M2-03 COMPLETE** | Acceptance: 7 Telegram alerts validated in production (Iran peace ÷ oil-strike confirm, BTC threshold divergences). Known limitation: PM markets are macro-only — translation layer to single-ticker actions is the M2-04 gap. |
| 2026-05-30 | Plan 07-02 | Extracted StrategyAdapter + createStrategyFactory from CLI into reusable `src/backtesting/strategies/strategy-adapter.ts` (commits 920c0dc, 0b5370e). Pure refactor — Plan 05 runner can now construct strategies without depending on `src/cli/`. |
| 2026-05-31 | Plan 07-01 | Added `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` (commit 84d4a55) and wired Yahoo as the third fallback in `MarketDataService.fetchHistoricalData` with cache write-through (commit 81a1d19). M2-01 universe prefetch (35 tickers × 8 years) now fits in one batch run instead of multi-day slicing around the Alpha Vantage 25-req/day quota. |
| 2026-05-31 | Plan 07-04 | Built `regime-segmenter.ts` (commit ff925db) with REGIMES constant + sliceByRegime + metricsByRegime. Per-sub-window daily-return recomputation drops cross-window jump returns (Sharpe stays sane on discontinuous bull = 2019+2020-H2+2023+2024 windows); maxDrawdown selected as worst per-sub-window. 12 vitest unit tests landed (commit ea9c40d), including a "100k→180k cross-window jump" test that demonstrably proves volatility stays <1.0. Plan 05 reality-check runner now has its per-regime metrics dependency. |
| 2026-05-31 | Plan 07-03 | Prefetched 35-ticker M2-01 universe across 2018-01-01 -> 2025-12-31 via Yahoo fallback (commits 6f531f3 + 428033f). Added `scripts/m201-prefetch-universe.ts` (batched 10/10/10/5 runner, per-symbol retry-once) and `scripts/m201-prefetch-report.ts` (cache-hit-only analyzer). 35/35 tickers came back OK with 2010 bars each, gap 0.30% (NYSE-calendar-vs-252/yr rounding noise, not data degradation). META historical continuity confirmed across the 2022 FB->META rename — no symbol-switch needed. Total cache: 14MB under `data/cache/historical/`. Per-ticker quality report at `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md`. |

---

## Metrics

| Metric | Current | Target |
|--------|---------|--------|
| M1 phases complete | 2/6 | (deferred) |
| M2 phases complete | 1/7 | 7/7 |
| Live broker integrated | No | Yes (M2-02) |
| News + AI layer | No | Yes (M2-03/04) |
| Hard risk limits enforced at execution | No | Yes (M2-06) |
| Tax-lot tracking | No | Yes (M2-07) |

---

## Decisions

### 2026-05-31: Plan 07-03 — M2-01 Universe Prefetched via Yahoo (35/35 OK)

**Decision**: Prefetch the 35-ticker M2-01 universe (30 single names + 5 ETFs per `07-CONTEXT.md`) across 2018-01-01 -> 2025-12-31 using a tsx runner (`scripts/m201-prefetch-universe.ts`) that calls `MarketDataService.fetchHistoricalData` directly, bypassing the unreachable `backtest data download` CLI. Persist results in `data/cache/historical/` (gitignored). Generate a per-ticker quality report at `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md`.

**Rationale**:
- Plan 05 will run ~1,050 backtests (35 tickers × 2 strategies × ~15 grid points). Network fetches per run are infeasible; cache-once is the only sane approach.
- The plan's intended `pnpm start backtest data download` path is shadowed by the Commander double-registration bug in `src/index.ts` (Plan 07-01 carry-over). Plan 07-01 already validated the direct-MarketDataService approach as a workable substitute; this plan formalizes it into a committed runner.
- Runner script (vs one-shot inline command) makes the prefetch reproducible: if the cache TTL expires or the universe needs re-fetching, it's `pnpm tsx scripts/m201-prefetch-universe.ts`.
- Yahoo fallback (Plan 07-01) is the unlimited free path. With no local AV key, the chain auto-routes 35/35 fetches to Yahoo cleanly.
- META was the only ticker at risk of pre-2022 coverage issues due to the FB->META rename. Yahoo back-fills under the META symbol continuously (verified: 2018-01-02 open ~$177 matches FB-era price), so no FB-fallback code was needed.

**Verification**:
- Runner: 35/35 succeeded on first attempt, no retries triggered, total wall time <1 min via Yahoo.
- Report: 35/35 OK, 0 DEGRADED, 0 FAILED. All tickers returned exactly 2010 bars for 2018-01-02 -> 2025-12-30 (0.30% under the napkin-math 2016 = 252×8, which is just the NYSE-calendar rounding).
- Cache: 14MB under `data/cache/historical/`, 35 files named `{symbol}_2018-01-01_2025-12-31.json` with `provider: 'yahoo'` metadata.

**Carry-over for Plan 05**:
- `DataCacheManager.historicalCacheTTL = 24h`. Plan 05 should run within 24h of this prefetch, OR bump the TTL before starting. The runner makes re-prefetching trivial regardless.
- All 35 tickers are uniformly Yahoo-sourced, so no provider-mix caveats are needed in `RECOMMENDATION.md`.

### 2026-05-31: Plan 07-04 — Regime Segmenter with Per-Sub-Window Return Recomputation

**Decision**: Build `src/backtesting/analytics/regime-segmenter.ts` exposing `REGIMES`, `sliceByRegime`, `metricsByRegime`. Use `PerformanceMetricsCalculator` for baseline trade-statistics and aggregate-return fields, then override Sharpe / Sortino / volatility / maxDrawdown using per-sub-window recomputation. Add 12 vitest unit tests at `src/backtesting/analytics/__tests__/regime-segmenter.test.ts`.

**Rationale**:
- Naively splicing the 4 bull-regime sub-windows (2019, 2020-H2, 2023, 2024) and feeding the result to `PerformanceMetricsCalculator.calculate()` produces two correctness bugs: (a) the cross-window equity "jump" (e.g., 2019-12-31 equity → 2020-07-01 equity, skipping 6 months of high-vol) becomes a single "daily return" that catastrophically inflates volatility and distorts Sharpe; (b) `maxDrawdown` over the spliced curve reflects the absence-of-data gap, not a sustained decline.
- Fix (a): recompute daily returns per contiguous sub-window. The inter-window jump return is implicitly dropped because each sub-window starts at index 1 of its own series. Concatenate the resulting per-sub-window returns into a single array for Sharpe/Sortino/volatility.
- Fix (b): compute drawdown per sub-window via `PerformanceMetricsCalculator.calculateDrawdowns()`, select the worst (most negative).
- `totalReturn`/`cagr`/`annualizedReturn` left as the calculator computes them — they use first-point equity, last-point equity, and the regime date span, which is a defensible "what did the operator earn during this regime" read.
- Empty regime returns zero metrics rather than throwing (Plan 05 runner will sweep ~1050 (ticker × strategy × params) combos × 3 regimes; a single sparse-data ticker must not abort the sweep).

**Verification**: 12/12 vitest tests pass; key test "metricsByRegime does NOT include cross-window jump in Sharpe" empirically proves volatility stays <1.0 (decimal terms) even with a 100k→180k inter-window gap that would yield >3.0 under naive splicing.

**Carry-over**: Plan 05 reality-check runner is now unblocked. Plan 06 recommendation generator can read per-regime metrics from the JSONL Plan 05 produces.

### 2026-05-31: Plan 07-01 — Yahoo Finance as Unlimited Fallback in fetchHistoricalData

**Decision**: Add `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` and wire it as the third fallback in `MarketDataService.fetchHistoricalData` (after Alpha Vantage and Finnhub), with cache write-through. Keep the legacy `fetchHistoricalData(symbol, days)` method untouched for backwards compatibility.

**Rationale**:
- M2-01 Plan 03 (universe prefetch) needs 35 tickers × 8 years of daily bars. Alpha Vantage's free-tier 25 req/day quota would stretch that to ≥2 calendar days. Finnhub's `/stock/candle` for US equities is widely reported as premium-only. Yahoo's chart endpoint is free, undocumented but functional, and accepts arbitrary `period1/period2` windows in a single call per symbol.
- The pre-existing Yahoo provider only exposed a days-based `fetchHistoricalData(symbol, days)` method (legacy path used by `getHistoricalData`'s "ultimate fallback"). Range-based fetching for backtest data needed a new method, not a signature change.
- Wrapped the Finnhub block in try/catch (previously rethrew) so any Finnhub failure falls through to Yahoo instead of bubbling up — necessary for the chain to function as intended (auto-fixed per Rule 3).

**Verification**: Direct provider call returns 21 SPY bars for Jan 2018 (2018-01-02..2018-01-31). MarketDataService end-to-end test with AV+Finnhub nulled writes a `provider='yahoo'` cache entry with `dataPoints=21`.

**Carry-over**: Pre-existing Commander double-registration bug in `src/index.ts` (lines 1030-1031: both `registerBacktestCommands` and `registerBacktestDataCommands` call `program.command('backtest')`, second wins) means the `backtest data download/list/import/clear` CLI subcommands are unreachable. If 07-03 wants to invoke `data download` as a CLI step, this needs fixing first. Otherwise, calling `MarketDataService` directly from a prefetch script works.

### 2026-05-30: Plan 07-02 — StrategyAdapter Extracted to Reusable Module

**Decision**: Move `StrategyAdapter` class and `createStrategyFactory` function out of `src/cli/backtest-commands.ts` into new `src/backtesting/strategies/strategy-adapter.ts`. Bypass `strategy-registry.ts` rather than fix its broken momentum `defaultParams` keys.

**Rationale**:
- M2-01 reality-check runner (Plan 05) must instantiate `MomentumStrategy`/`MeanReversionStrategy` and adapt them to `BacktestStrategy`. Importing from a CLI command file creates an awkward upward dependency from a script to the CLI layer.
- `strategy-registry.ts`'s defaultParams use wrong keys for momentum (`emaPeriod`, `rsiPeriod` instead of `shortMA`, `longMA`) — fixing the registry is research pitfall #2 and is explicitly out of scope for this plan.
- Pure refactor: no behavior change, all existing CLI semantics preserved.

**Verification**: Build clean, smoke test confirms exports work, both `backtest run` and `backtest compare` CLI commands load and execute the action handler (only data-fetch errors remain, which are pre-existing infrastructure issues unrelated to this refactor).

### 2026-05-28: M2-03 Closed — Pipeline Validated, Translation Gap Surfaced

**Decision**: Mark M2-03 complete despite the live pipeline only producing macro-level alerts (not single-ticker ones). The remaining gap — turning "Iran peace -4pp" into "buy XLE" — is a separate concern that belongs in M2-04, not in re-scoping M2-03.

**What works (validated in production)**:
- News pipeline pulls 50/50 ticker-tagged (Finnhub) + macro (CNBC / Google News / MarketWatch RSS)
- Polymarket client filters by volume to focus on high-conviction macro markets ($1M+ volume)
- LLM correlator (local Qwen 3 14B via LM Studio) emits HEADLINE_PM_CONFIRMED + HEADLINE_PM_DIVERGENCE alerts
- Scheduler fires reliably on a sleep-resilient heartbeat (cron replaced 2026-05-28 after WSL2 host-sleep caused silent fire-drops)
- Real alert caught: Iran peace -4pp DIVERGENCE → 2min later CNBC published "Oil jumps 3% after fresh Iran strikes" CONFIRMED (textbook front-run pattern)

**Known limitations carried into M2-04**:
- PM markets are macro (Iran / BTC / Fed / Trump) — they map to ETFs (XLE / GLD / QQQ), not single tickers
- No dedup across related-threshold markets (BTC tanking fires 3 alerts on 3 thresholds)
- No volume/depth weighting — a 4pp move on $6M market is treated same as 4pp on $300k
- CONFIRMED alerts fire AFTER the news is public — the alpha is in the prior DIVERGENCE
- No "fade" frame — every alert is "look here," none is "this is overreaction, fade it"

**Verification**: 13 Telegram alerts fired live across 5/27-5/28. Operator confirmed signal quality matches the architectural intent (PM-as-oracle); the missing piece is per-ticker actionability, which is the explicit M2-04 charter.

### 2026-05-23: Milestone Pivot (M1 → M2)

**Decision**: Pause Milestone 1's remaining production-cleanup phases (Redis / Risk CLI / Code Quality / Tests) and start Milestone 2: AI-Augmented Swing Trading for Family Income.

**Rationale**:
- Operator's underlying goal (family income via calculated growth + day trading) was not actually served by the M1 roadmap — completing M1 produces a polished simulator, not income.
- Operator at $5-10k capital is structurally blocked from day trading by PDT rule; swing trading is the appropriate mode.
- Pure technical strategies (RSI / MACD) in `src/strategies/` are insufficient in 2026 — policy shocks invert signals, mega-cap concentration distorts indices, algorithmic arbitrage extracts textbook patterns fast.
- AI as an analyst layer (LLM-scored news, theme tagging, catalyst detection) is where retail can compete in 2026 — speed is dominated by algos, but interpretation is not.
- Operator has demonstrated discipline (COVID 2020-2021: $10k → $40k via disciplined swing trading with profit-taking). The platform should amplify discipline, not replace judgment.

**Implementation**:
- M1 Phases 3-6 marked DEFERRED (still on roadmap, lower priority)
- M2 defined with 7 new phases: Strategy Reality Check → Alpaca Paper → News & Events → LLM Analysis → AI-Augmented Strategy → Risk Hardening → Live + Tax Tracking
- New requirements added: INCOME, EXEC, NEWS, AI, and extended RISK
- PROJECT.md, ROADMAP.md, REQUIREMENTS.md fully rewritten

**Verification**: pending operator sign-off on direction before starting M2-01 work.

### 2026-01-17: Order Type Verification (Plan 02-04)

**Decision**: Implement comprehensive test coverage for all 5 order types and integration testing.
**Outcome**: 82 paper trading tests, OrderManager coverage 91.49%.

### 2026-01-17: Trailing Stop Implementation (Plan 02-03)

**Decision**: Implement proper peak price tracking for trailing stops using order-level peakPrice field.
**Outcome**: 9 test cases covering long/short positions, percentage/fixed trailing; all pass.

### 2026-01-17: Strategy Loading API (Plan 02-02)

**Decision**: Implement reusable StrategyAdapter and dynamic strategy loading in POST /api/paper/start.
**Outcome**: API returns 200 with valid strategy; 13 adapter/registry tests pass.

### 2026-01-17: Real Market Data Integration (Plan 02-01)

**Decision**: Integrate MarketDataService into PaperTradingEngine to replace mock data.
**Outcome**: Real prices confirmed (AAPL $255.53, MSFT $459.86, GOOGL $330.00); invalid symbols handled gracefully.

---

## Notes

- M1 Phase 1 & 2 work is foundational for M2 — backtesting engine validates M2 strategies, paper-trading engine becomes one consumer of the new strategy + risk layer.
- M1 deferred work (Redis / Code Quality / Tests) remains tracked but will not block M2.
- Token blacklist and rate limiting are still in-memory (lost on restart) — acceptable for personal-tool stage.
- Risk CLI commands still use placeholder data — superseded by M2-06 risk hardening.

---

*Last updated: 2026-05-31 — Plan 07-03 complete (35-ticker M2-01 universe cached 2018-2025 via Yahoo, per-ticker quality report 35/35 OK); Plan 05 reality-check runner can now run network-free; M2-04 discussion still pending*
