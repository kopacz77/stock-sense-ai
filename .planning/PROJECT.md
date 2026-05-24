# Stock Sense AI - Project Context

## What This Is

An AI-augmented swing trading platform that helps a single operator (the author) generate supplemental income for a growing family by combining systematic technical analysis with LLM-powered news, theme, and catalyst awareness — under disciplined risk management.

**Current milestone (M2):** Pivot the platform from a systematic backtesting sandbox into an AI-augmented swing trading system suitable for live trading with $5-10k starting capital.

---

## Core Value

A decision-support and execution system where:
- Technical signals are *filtered* and *prioritized* by LLM-interpreted news, themes, and catalysts — not used in isolation.
- Real broker execution (Alpaca, paper first then live) is wired in with hard risk limits and auto-halt safeguards.
- Tax-lot-level accounting tracks after-tax PnL, the only return that matters for actual family income.
- The operator stays the decision-maker on each trade, with the system surfacing context fast enough to act before edge decays.

---

## Background

### Where the project came from

The codebase began as a systematic TypeScript trading sandbox with ~10k LOC across CLI, web dashboard, backtesting, paper trading, risk management, and multi-provider market data. Milestone 1 ("Production-Ready Platform") completed two of six planned phases (Backtesting Fix, Paper Trading) before this pivot.

### Why the pivot

Two realities forced a reframing:

1. **Pure-technical strategies (RSI / MACD / Bollinger) are insufficient in the 2026 market.** Policy/geopolitical shocks invert classical signals (oversold ≠ buying opportunity when a tariff just hit); mega-cap concentration means SPY signals are signals on ~7 stocks; algorithmic arbitrage extracts textbook patterns in minutes. The codebase's existing strategies will not produce edge after costs.

2. **AI is a structural regime change, not a sector.** It reshapes market composition (mega-cap dominance), competitive dynamics (retail can now use LLMs to interpret news at scale — a place where speed-based algos don't dominate), and the multi-year capex cycle. A retail trader's edge in 2026 is *interpretation*, not *speed*.

The operator's real-world track record (turned $10k → $40k during 2020-2021 via disciplined swing trading with profit-taking) demonstrates the relevant skill is *discipline*, not signal generation. The platform should amplify that.

### Operator context

- Starting capital: $5,000-$10,000
- Goal: generate supplemental income for family; treat as 2-3 year compounding project, not job replacement
- Style: discretionary swing trading with disciplined profit-taking; instinctively momentum-biased
- Constraint: PDT rule blocks meaningful US day-trading under $25k margin equity — swing-trading focus is forced and appropriate
- Time: hands-on at start, increasingly automated as confidence builds

---

## Requirements

### Validated (Milestone 1)

- ✓ Backtesting framework with grid search, walk-forward, 30+ performance metrics
- ✓ Paper trading engine with 5 order types, trailing stops, real market data
- ✓ Multi-provider data layer (Alpha Vantage / Finnhub / Yahoo Finance)
- ✓ Technical indicators (RSI, MACD, Bollinger, etc.) — kept as one input among several
- ✓ Encrypted config and secure key storage
- ✓ Web dashboard with React/Vite + Socket.IO

### Active (Milestone 2 — AI-Augmented Swing Trading)

- [ ] **INCOME-01**: Active strategy validated with positive expectancy across 2018-2025 (including bear periods) after realistic costs
- [ ] **EXEC-01**: Alpaca paper-trading integration via real broker API
- [ ] **EXEC-02**: Alpaca live integration with hard position-size and daily-loss limits
- [ ] **EXEC-03**: Order reconciliation handles partial fills, rejections, disconnects
- [ ] **EXEC-04**: Tax-lot tracking records every fill with cost basis (FIFO) for after-tax PnL
- [ ] **NEWS-01**: Headlines pulled for watchlist tickers from at least one news API
- [ ] **NEWS-02**: Economic calendar (Fed / CPI / NFP / scheduled earnings) integrated
- [ ] **NEWS-03**: VIX feed integrated for volatility-regime detection
- [ ] **PM-01/02**: Polymarket markets + price snapshots integrated for headline correlation
- [ ] **SCHED-01**: Polling scheduler with configurable cadence (M2-03)
- [ ] **ALERT-01/02**: Telegram alerts for headline ↔ Polymarket confirmation / divergence + daily digest
- [ ] **AI-01**: LLM scores news headlines for sentiment + materiality per ticker
- [ ] **AI-02**: LLM tags tickers with active themes (AI infra, defense, reshoring, tariff exposure, etc.)
- [ ] **AI-03**: LLM flags catalysts (earnings, regulatory, M&A) from news/calendar
- [ ] **AI-04**: LLM API spend tracked and capped daily
- [ ] **RISK-02**: Pre-trade check blocks orders violating concentration / size limits
- [ ] **RISK-03**: Catalyst-aware halt prevents new entries 24h before scheduled high-impact events
- [ ] **RISK-04**: Vol-regime sizing scales position size inversely with VIX regime
- [ ] **RISK-05**: Daily/weekly drawdown breaker auto-flattens and halts new orders

### Deferred (Milestone 1 carryover — kept for later)

- [ ] **AUTH-01/02/03**: Redis-backed JWT blacklist, rate limiting, secret persistence
- [ ] **RISK-01**: Risk CLI uses actual portfolio data (partially superseded by M2 risk work)
- [ ] **QUAL-01/02/03/04**: Code quality (any types, error handling, logging consistency)
- [ ] **TEST-01/02/03/04**: Test coverage to 80%+

### Out of Scope (this milestone)

- Day trading at current capital level — PDT rule + math make it inappropriate
- Options strategies — complex enough to be a separate effort
- Long-term ETF core sleeve — best done in a brokerage account directly, not in this codebase
- Mobile app — web dashboard is sufficient
- Multi-user / SaaS productization — this is a personal tool
- Mean reversion as a primary signal — kept as one input, not standalone

---

## Constraints

- **Capital**: $5k-$10k initial; treat as risk capital, not savings
- **Regulatory**: US Pattern Day Trader rule limits to 3 day-trades / 5 business days under $25k
- **Tax**: All gains short-term (ordinary income); lot tracking required for accurate accounting and wash-sale awareness
- **Data**: Free-tier API limits apply (Alpha Vantage 25/day, Finnhub 60/min); news/calendar APIs add cost
- **LLM cost**: Claude/OpenAI API spend must be tracked and capped
- **Timing**: 2-3 year compounding horizon, not weeks

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pivot from systematic to AI-augmented discretionary | Pure technicals don't survive 2026 market dynamics; LLM-as-analyst is where retail can compete | Active |
| Swing trading over day trading | PDT rule + math at $5-10k forces swing-trading focus; matches operator's proven style | Active |
| Alpaca as broker | Free, US-based, modern API, paper+live with same contract, good TS SDK | Pending |
| Long-term sleeve outside this codebase | Buy-and-hold ETFs need no custom software; building for it would be wasted work | Active |
| Backtest existing strategies before tearing them up | Empirical evidence beats assumption; if momentum strategy has edge in bear periods, keep it | Pending |
| Tax-lot tracking from day 1 of live | After-tax PnL is the only return that matters; retrofitting tax tracking is painful | Pending |
| Defer Milestone 1 cleanup phases | Auth/code-quality/test work is real but doesn't move toward income goal; tackle after live works | Active |

---

## Technical Context

### Stack
- **Backend**: Node.js 18+, TypeScript 5.8, Express 4.18, Socket.IO 4.7
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand
- **Testing**: Vitest
- **Broker (target)**: Alpaca via `@alpacahq/alpaca-trade-api`
- **LLM**: Anthropic Claude (operator uses Claude Code; consistent toolchain)
- **News (target)**: Finnhub News (ticker, free tier) + Polygon News (macro, paid)
- **Prediction markets**: Polymarket Gamma API + CLOB API (free, no auth for reads)
- **Scheduler**: `node-cron` (in-process, simplest fit for single-operator scale)
- **Alerts**: extends existing Telegram bot (`src/notifications/telegram-service.ts`)

### Key Files
- CLI entry: `src/index.ts`
- Web server: `src/web/server.ts`
- Existing momentum strategy: `src/strategies/momentum-strategy.ts` (closest fit to operator style)
- Backtesting engine: `src/backtesting/engine/backtest-engine.ts`
- Paper trading: `src/paper-trading/engine/paper-trading-engine.ts`
- Risk: `src/risk/` (will be extended for catalyst-aware halts)

### Codebase Map
Full documentation in `.planning/codebase/`. Architecture stays layered (CLI/Web → Service → Domain → Data). New layers added on top:
- News & Events layer (data acquisition)
- AI Analysis layer (LLM-powered interpretation)
- Broker layer (Alpaca abstraction)

---

*Last updated: 2026-05-23 — Milestone 2 pivot*
