# Stock Sense AI - Requirements

## v1 Requirements

### Backtesting
- [x] **BACK-01**: User can run backtests via CLI with `backtest run` command
- [x] **BACK-02**: User can optimize strategy parameters via grid search
- [x] **BACK-03**: User can validate strategies with walk-forward analysis
- [x] **BACK-04**: User can view performance reports with 30+ metrics and equity curves

### Paper Trading
- [ ] **PAPER-01**: Paper trading engine fetches real market data from existing providers
- [ ] **PAPER-02**: User can start paper trading with a strategy via API endpoint
- [ ] **PAPER-03**: Trailing stop loss orders execute correctly when price moves
- [ ] **PAPER-04**: All 5 order types (Market, Limit, Stop, Take-Profit, Trailing) work correctly

### Risk & Authentication
- [ ] **RISK-01**: Risk CLI commands (var, cvar, monte-carlo, stress-test) use actual portfolio data
- [ ] **AUTH-01**: JWT token blacklist persists in Redis across server restarts
- [ ] **AUTH-02**: Rate limiting state persists in Redis across server restarts
- [ ] **AUTH-03**: JWT secret is stored persistently (not regenerated on restart)

### Testing
- [ ] **TEST-01**: Backtesting module has comprehensive tests (engine, analytics, optimization)
- [ ] **TEST-02**: Paper trading module has comprehensive tests (portfolio, orders, execution, journal)
- [ ] **TEST-03**: Risk management module has comprehensive tests (VaR, CVaR, Monte Carlo, stress)
- [ ] **TEST-04**: Integration tests cover API endpoints, WebSocket connections, and auth flow

### Code Quality
- [ ] **QUAL-01**: All `any` types replaced with proper TypeScript types
- [ ] **QUAL-02**: Silent failures replaced with proper error handling and recovery
- [ ] **QUAL-03**: Promise.all replaced with Promise.allSettled where appropriate
- [ ] **QUAL-04**: Console.* calls replaced with consistent logger.* usage

---

## v2 Requirements (Deferred)

- Random search optimization for backtesting
- Additional commission/slippage models
- Advanced performance analytics dashboard
- Real-time portfolio risk alerts

---

## Out of Scope

- New trading strategies — focus on fixing existing functionality first
- Additional data providers — three providers already sufficient
- Mobile app — web dashboard serves the purpose
- Live trading integration — paper trading is the target
- Database migration — file-based storage is sufficient for now

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| BACK-01 | Phase 1: Backtesting Fix | 01-01 | complete |
| BACK-02 | Phase 1: Backtesting Fix | 01-03 | complete |
| BACK-03 | Phase 1: Backtesting Fix | 01-03 | complete |
| BACK-04 | Phase 1: Backtesting Fix | 01-04 | complete |
| PAPER-01 | Phase 2: Paper Trading | — | pending |
| PAPER-02 | Phase 2: Paper Trading | — | pending |
| PAPER-03 | Phase 2: Paper Trading | — | pending |
| PAPER-04 | Phase 2: Paper Trading | — | pending |
| AUTH-01 | Phase 3: Redis Infrastructure | — | pending |
| AUTH-02 | Phase 3: Redis Infrastructure | — | pending |
| AUTH-03 | Phase 3: Redis Infrastructure | — | pending |
| RISK-01 | Phase 4: Risk Integration | — | pending |
| QUAL-01 | Phase 5: Code Quality | — | pending |
| QUAL-02 | Phase 5: Code Quality | — | pending |
| QUAL-03 | Phase 5: Code Quality | — | pending |
| QUAL-04 | Phase 5: Code Quality | — | pending |
| TEST-01 | Phase 6: Testing | — | pending |
| TEST-02 | Phase 6: Testing | — | pending |
| TEST-03 | Phase 6: Testing | — | pending |
| TEST-04 | Phase 6: Testing | — | pending |

---

*Last updated: 2026-01-17*
