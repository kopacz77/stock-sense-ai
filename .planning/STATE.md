# Stock Sense AI - Development State

## Current Status

| Field | Value |
|-------|-------|
| Active Milestone | M2 — AI-Augmented Swing Trading |
| Current Phase | M2-01 Strategy Reality Check (in progress, parallel track) + M2-03 done + M2-04 next |
| Status | 07-02 refactor complete; StrategyAdapter now reusable outside CLI for Plan 05 runner |
| Last Pivot | 2026-05-23 |
| Last Updated | 2026-05-30 |

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

**Parallel track (lower priority)**: M2-01 Strategy Reality Check can run anytime since it's mostly automated backtest runs against existing data.

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

*Last updated: 2026-05-30 — Plan 07-02 complete (StrategyAdapter extracted to reusable module); M2-04 discussion still pending*
