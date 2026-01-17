# Stock Sense AI - Project Context

## What This Is

A comprehensive TypeScript-based algorithmic trading platform that provides technical analysis, paper trading, backtesting, risk management, and real-time monitoring through both CLI and web dashboard interfaces.

**This milestone:** Fix and complete all existing features to production-ready status.

---

## Core Value

A fully functional, reliable trading analysis platform where all features work as intended — backtesting runs, paper trading connects to real data, risk calculations use actual portfolio data, and the system handles auth/sessions properly.

---

## Background

The codebase is substantial (~10k lines TypeScript) with a layered architecture:
- **CLI**: 30+ commands via Commander.js
- **Web**: Express API + React dashboard with Socket.IO
- **Services**: Analysis, Discovery, Monitoring, Paper Trading
- **Data**: Multi-provider (Alpha Vantage → Finnhub → Yahoo Finance) with caching

However, several key features are broken or incomplete:
- Backtesting CLI commands disabled due to type mismatches
- Paper trading has no real API integration (uses mock data)
- Risk commands use placeholder data instead of actual portfolio
- Auth tokens invalidate on restart (in-memory blacklist)
- Test coverage is ~30% (target: 80%)

---

## Requirements

### Validated

- ✓ Technical indicators calculation (15+ indicators) — existing
- ✓ Mean reversion and momentum strategies — existing
- ✓ Market data fetching with provider fallback — existing
- ✓ Stock discovery and market overview — existing
- ✓ Background monitoring with alerts — existing
- ✓ Web dashboard with real-time updates — existing
- ✓ Telegram/Email notifications — existing
- ✓ Encrypted configuration storage — existing
- ✓ Docker deployment — existing

### Active

- [ ] Backtesting CLI commands functional with all strategies
- [ ] Parameter optimization (grid, random, walk-forward)
- [ ] Full performance reports with 30+ metrics and equity curves
- [ ] Paper trading with real market data from existing providers
- [ ] Strategy loading in paper trading API (currently returns 501)
- [ ] Trailing stop loss execution in paper trading
- [ ] Risk commands using actual portfolio data
- [ ] Redis-backed JWT token storage and blacklist
- [ ] Persistent rate limiting across restarts
- [ ] Comprehensive test coverage (80%+)
- [ ] Type safety improvements (eliminate `any` types)
- [ ] Security fixes (JWT secret persistence, API key handling)

### Out of Scope

- New trading strategies — focus on fixing existing functionality first
- Additional data providers — three providers already sufficient
- Mobile app — web dashboard serves the purpose
- Live trading integration — paper trading is the target

---

## Constraints

- **Data Providers**: Free tier limits (Alpha Vantage 25/day, Finnhub 60/min)
- **Timeline**: ASAP
- **Testing**: 80%+ coverage required
- **Auth**: Must persist across restarts using Redis

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Redis for auth state | Need token persistence across restarts, in-memory not sufficient for production | — Pending |
| Use existing providers for paper trading | Already built and tested fallback chain, no need for new integrations | — Pending |
| Fix backtesting before new features | Core functionality must work before adding capabilities | — Pending |
| Comprehensive testing | Production-ready requires confidence in code correctness | — Pending |

---

## Technical Context

### Stack
- **Backend**: Node.js 18+, TypeScript 5.8, Express 4.18, Socket.IO 4.7
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand
- **Testing**: Vitest
- **Deployment**: Docker, Docker Compose

### Key Files
- CLI entry: `src/index.ts`
- Web server: `src/web/server.ts`
- Backtesting: `src/backtesting/` (broken)
- Paper trading: `src/paper-trading/` (incomplete)
- Risk: `src/risk/`
- Auth: `src/web/auth-middleware.ts`

### Codebase Map
Full documentation available in `.planning/codebase/`:
- ARCHITECTURE.md
- STACK.md
- STRUCTURE.md
- CONVENTIONS.md
- TESTING.md
- INTEGRATIONS.md
- CONCERNS.md

---

*Last updated: 2026-01-16 after initialization*
