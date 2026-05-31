# Stock Sense AI - Requirements

## Milestone 1 — Production-Ready Trading Platform (Partial / Deferred)

### Backtesting (complete)
- [x] **BACK-01**: User can run backtests via CLI with `backtest run` command
- [x] **BACK-02**: User can optimize strategy parameters via grid search
- [x] **BACK-03**: User can validate strategies with walk-forward analysis
- [x] **BACK-04**: User can view performance reports with 30+ metrics and equity curves

### Paper Trading (complete)
- [x] **PAPER-01**: Paper trading engine fetches real market data from existing providers
- [x] **PAPER-02**: User can start paper trading with a strategy via API endpoint
- [x] **PAPER-03**: Trailing stop loss orders execute correctly when price moves
- [x] **PAPER-04**: All 5 order types (Market, Limit, Stop, Take-Profit, Trailing) work correctly

### Risk & Authentication (deferred)
- [ ] **RISK-01**: Risk CLI commands (var, cvar, monte-carlo, stress-test) use actual portfolio data *(partially superseded by RISK-02..05 in M2)*
- [ ] **AUTH-01**: JWT token blacklist persists in Redis across server restarts
- [ ] **AUTH-02**: Rate limiting state persists in Redis across server restarts
- [ ] **AUTH-03**: JWT secret is stored persistently (not regenerated on restart)

### Testing (deferred)
- [ ] **TEST-01**: Backtesting module has comprehensive tests (engine, analytics, optimization)
- [ ] **TEST-02**: Paper trading module has comprehensive tests (portfolio, orders, execution, journal)
- [ ] **TEST-03**: Risk management module has comprehensive tests (VaR, CVaR, Monte Carlo, stress)
- [ ] **TEST-04**: Integration tests cover API endpoints, WebSocket connections, and auth flow

### Code Quality (deferred)
- [ ] **QUAL-01**: All `any` types replaced with proper TypeScript types
- [ ] **QUAL-02**: Silent failures replaced with proper error handling and recovery
- [ ] **QUAL-03**: Promise.all replaced with Promise.allSettled where appropriate
- [ ] **QUAL-04**: Console.* calls replaced with consistent logger.* usage

---

## Milestone 2 — AI-Augmented Swing Trading (Active)

### Strategy Validation
- [x] **INCOME-01**: ✅ Resolved 2026-05-31 — *both* `MomentumStrategy` and `MeanReversionStrategy` formally rejected with evidence (DISCARD). Implication: M2-05 must design fresh signals from M2-04 catalyst data rather than layer AI on existing technicals.

### Broker Execution
- [ ] **EXEC-01**: Alpaca paper-trading integration via real broker API
- [ ] **EXEC-02**: Alpaca live integration with hard position-size and daily-loss limits
- [ ] **EXEC-03**: Order reconciliation handles partial fills, rejections, disconnects
- [ ] **EXEC-04**: Tax-lot tracking records every fill with cost basis (FIFO) for after-tax PnL

### Market Intelligence (M2-03)
- [ ] **NEWS-01**: Headlines pulled for watchlist tickers from at least one news API
- [ ] **NEWS-02**: Economic calendar (Fed / CPI / NFP / scheduled earnings) integrated
- [ ] **NEWS-03**: VIX feed integrated for volatility-regime detection (calm / elevated / stressed)
- [ ] **PM-01**: Polymarket active markets pulled and stored with prices, volume, end dates
- [ ] **PM-02**: Polymarket price snapshots stored on poll cadence for movement detection
- [ ] **SCHED-01**: Polling scheduler runs configured cadences during/around US market hours and persists last-poll-timestamp across restarts
- [ ] **ALERT-01**: Telegram alert types added: HEADLINE_PM_CONFIRMED, HEADLINE_PM_DIVERGENCE, DAILY_DIGEST
- [ ] **ALERT-02**: LLM-assisted headline-to-market correlation produces alert rationale (≤200 words per alert)

### AI Analysis
- [ ] **AI-01**: LLM scores news headlines for sentiment + materiality per ticker
- [ ] **AI-02**: LLM tags tickers with active themes (AI infra, defense, reshoring, tariff exposure, etc.)
- [ ] **AI-03**: LLM flags catalysts (earnings, regulatory, M&A) from news/calendar
- [ ] **AI-04**: LLM API spend tracked and capped daily

### Risk Hardening
- [ ] **RISK-02**: Pre-trade check blocks orders violating concentration / size limits (ALLOW/BLOCK with reason)
- [ ] **RISK-03**: Catalyst-aware halt prevents new entries 24h before scheduled high-impact events
- [ ] **RISK-04**: Vol-regime sizing scales position size inversely with VIX regime
- [ ] **RISK-05**: Daily/weekly drawdown breaker auto-flattens and halts new orders

---

## Out of Scope (M2)

- Day trading at current capital level — PDT rule + math make it inappropriate
- Options strategies — separate competency; defer
- Long-term ETF core sleeve — buy-and-hold ETFs need no custom software
- Mobile app — web dashboard is sufficient
- Multi-user productization — this is a personal tool
- New trading strategies *as standalone systematic signals* — kept only as inputs within M2-05
- Database migration — file-based + encrypted storage is sufficient for personal use

---

## Traceability

| REQ-ID | Milestone | Phase | Plan | Status |
|--------|-----------|-------|------|--------|
| BACK-01 | M1 | Phase 1 | 01-01 | complete |
| BACK-02 | M1 | Phase 1 | 01-03 | complete |
| BACK-03 | M1 | Phase 1 | 01-03 | complete |
| BACK-04 | M1 | Phase 1 | 01-04 | complete |
| PAPER-01 | M1 | Phase 2 | 02-01 | complete |
| PAPER-02 | M1 | Phase 2 | 02-02 | complete |
| PAPER-03 | M1 | Phase 2 | 02-03 | complete |
| PAPER-04 | M1 | Phase 2 | 02-04 | complete |
| AUTH-01 | M1 | Phase 3 | — | deferred |
| AUTH-02 | M1 | Phase 3 | — | deferred |
| AUTH-03 | M1 | Phase 3 | — | deferred |
| RISK-01 | M1 | Phase 4 | — | deferred (partially superseded by RISK-02..05) |
| QUAL-01 | M1 | Phase 5 | — | deferred |
| QUAL-02 | M1 | Phase 5 | — | deferred |
| QUAL-03 | M1 | Phase 5 | — | deferred |
| QUAL-04 | M1 | Phase 5 | — | deferred |
| TEST-01 | M1 | Phase 6 | — | deferred |
| TEST-02 | M1 | Phase 6 | — | deferred |
| TEST-03 | M1 | Phase 6 | — | deferred |
| TEST-04 | M1 | Phase 6 | — | deferred |
| INCOME-01 | M2 | M2-01 | 07-01..06 | Complete (DISCARD, both strategies — formally rejected with evidence per RECOMMENDATION.md) |
| EXEC-01 | M2 | M2-02 | — | pending |
| EXEC-02 | M2 | M2-07 | — | pending |
| EXEC-03 | M2 | M2-02 | — | pending |
| EXEC-04 | M2 | M2-07 | — | pending |
| NEWS-01 | M2 | M2-03 | — | pending |
| NEWS-02 | M2 | M2-03 | — | pending |
| NEWS-03 | M2 | M2-03 | — | pending |
| PM-01 | M2 | M2-03 | — | pending |
| PM-02 | M2 | M2-03 | — | pending |
| SCHED-01 | M2 | M2-03 | — | pending |
| ALERT-01 | M2 | M2-03 | — | pending |
| ALERT-02 | M2 | M2-03 | — | pending |
| AI-01 | M2 | M2-04 | — | pending |
| AI-02 | M2 | M2-04 | — | pending |
| AI-03 | M2 | M2-04 | — | pending |
| AI-04 | M2 | M2-04 | — | pending |
| RISK-02 | M2 | M2-06 | — | pending |
| RISK-03 | M2 | M2-06 | — | pending |
| RISK-04 | M2 | M2-06 | — | pending |
| RISK-05 | M2 | M2-06 | — | pending |

---

*Last updated: 2026-05-23 — Milestone 2 pivot*
