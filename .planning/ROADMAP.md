# Stock Sense AI - Development Roadmap

## Overview

The project has pivoted from "Milestone 1: Production-Ready Trading Platform" to **Milestone 2: AI-Augmented Swing Trading for Family Income**. The operator (single user) intends to use this platform to compound a $5-10k starting account over a 2-3 year horizon via disciplined swing trading, augmented by LLM-powered news, theme, and catalyst awareness.

**Pivot rationale**: pure-technical strategies (RSI / MACD / Bollinger) are insufficient in the 2026 market — policy/geopolitical shocks invert classical signals, mega-cap concentration distorts indices, and algorithmic arbitrage extracts textbook patterns in minutes. AI as an *analyst* (not just a sector) is where retail can compete in 2026.

**Mode**: yolo (fast iteration, minimal bureaucracy — this is a personal tool, not a product)
**Active milestone**: M2 (7 phases)
**Deferred**: 4 phases from M1 (Redis / Risk CLI / Code Quality / Tests)

---

## Completed (Milestone 1 — Partial)

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Backtesting Fix | ✅ Complete | 2026-01-17 |
| 2 | Paper Trading | ✅ Complete | 2026-01-17 |

The completed M1 work remains foundational: the backtesting engine validates M2 strategies, the paper-trading engine becomes one consumer of the new strategy + risk layer.

---

## Active (Milestone 2 — AI-Augmented Swing Trading)

```
M2-01: Strategy Reality Check  (kill-or-keep existing technicals via brutal backtest)
       │
       ▼
M2-02: Alpaca Paper Integration  (real broker API contract, paper mode)
       │
       ├──────────────┐
       ▼              ▼
M2-03: Market         M2-04: LLM Trade-Signal Layer
       Intelligence          (per-ticker sentiment, themes,
       Bot                    catalysts — for the strategy engine)
       │              │
       └──────┬───────┘
              ▼
M2-05: AI-Augmented Strategy Engine
       │
       ▼
M2-06: Hard Risk Management
       │
       ▼
M2-07: Live Execution + Tax Tracking
```

---

### Phase M2-01: Strategy Reality Check

**Directory**: `.planning/phases/07-strategy-reality-check/`

**Goal**: Empirically determine whether the existing `MomentumStrategy` and `MeanReversionStrategy` have positive expectancy across 2018-2025 (mix of bull, bear, and high-volatility regimes) on a representative US equity universe, after realistic costs.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| INCOME-01 | Active strategy validated with positive expectancy across 2018-2025 after realistic costs (or formally rejected with evidence) |

**Why first**: every downstream phase assumes we have at least one technical baseline that's not garbage. If the existing strategies fail, we know to design fresh signals before building infrastructure around them. If they pass, we have a starting point to layer AI on top of.

**Success Criteria**:
1. Backtests run on at least 30 liquid US equities + 5 sector ETFs, daily bars 2018-01-01 → 2025-12-31
2. Realistic costs applied: $0 commissions (Alpaca), 0.05% slippage per side, no leverage
3. Reports show separate metrics for bull (2019, 2020-H2, 2023-2024), bear (2022, 2018-Q4), and high-vol (2020-Q1, 2025) regimes
4. At least one strategy demonstrates Sharpe > 0.5 and max drawdown < 25% across all regimes — OR — both are formally rejected with documented evidence
5. Document recommends KEEP / MODIFY / DISCARD for each strategy

**Suggested Build Order**:
1. Build the test ticker universe + date range config
2. Run momentum strategy across full universe with parameter sweep
3. Run mean reversion strategy across full universe with parameter sweep
4. Segment results by regime
5. Write recommendation doc

**Status:** ✅ COMPLETE (2026-05-31). Both `MomentumStrategy` and `MeanReversionStrategy` formally DISCARDED with evidence. See `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md`. Bonus finding: `MomentumStrategy.shortMA` is not consumed by the indicator computation (config field is dead) — flagged for M2-05 design.

**Plans:** 6 plans in 4 waves (all complete)
- [x] 07-01-PLAN.md — Yahoo Finance date-range fallback wired into MarketDataService (Wave 1)
- [x] 07-02-PLAN.md — Extract StrategyAdapter + createStrategyFactory into reusable module (Wave 1)
- [x] 07-03-PLAN.md — Prefetch 35-ticker × 8-year universe into cache + quality report (Wave 2)
- [x] 07-04-PLAN.md — Regime segmenter module with per-sub-window daily-return logic + 12 unit tests (Wave 1)
- [x] 07-05-PLAN.md — Reality-check runner: 1,050 backtests → results.jsonl (Wave 3)
- [x] 07-06-PLAN.md — Recommendation builder: results.jsonl → RECOMMENDATION.md with KEEP/MODIFY/DISCARD verdicts (Wave 4)

**Actual effort**: ~1 hour wall-clock (research → plan → 4 waves → verify), of which 35 min was the runner's 1,050-backtest sweep.

---

### Phase M2-02: Alpaca Paper Integration

**Directory**: `.planning/phases/08-alpaca-paper/` (to be created)

**Goal**: Wire Alpaca's paper-trading API as a first-class broker behind the existing paper-trading engine. Same code path will eventually drive live trading.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| EXEC-01 | Alpaca paper-trading integration via real broker API |
| EXEC-03 | Order reconciliation handles partial fills, rejections, disconnects |

**Why now**: doing broker integration with paper money first reveals the real-world ugliness (rate limits, fill latency, rejection codes, websocket disconnects) without financial risk. Every assumption the current paper-trading engine makes will be tested.

**Success Criteria**:
1. `POST /api/paper/start` can target Alpaca paper account (toggle via config)
2. All 5 order types submitted via Alpaca and confirmed by their API
3. Order updates received via Alpaca streaming API and reconciled with local state
4. Partial fills, rejections, and disconnects handled without state corruption
5. Reconnect-on-disconnect with order-state resync from Alpaca's `/orders` endpoint
6. Alpaca API keys stored via existing encrypted config

**Estimated effort**: 4-6 days

---

### Phase M2-03: Market Intelligence Bot (expanded scope)

**Directory**: `.planning/phases/09-market-intel/` (to be created)

**Goal**: Build a continuously-running intelligence service that polls news, prediction markets (Polymarket), and economic calendar; correlates them via LLM; and delivers actionable alerts via Telegram. This phase is *standalone valuable* (operator uses it for situational awareness today) *and* lays the data substrate for M2-04 / M2-05 / M2-06.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| NEWS-01 | Headlines pulled for watchlist tickers from at least one news API |
| NEWS-02 | Economic calendar (Fed, CPI, NFP, scheduled earnings) integrated |
| NEWS-03 | VIX feed integrated for volatility-regime detection |
| PM-01 | Polymarket active markets pulled and stored with prices, volume, end dates |
| PM-02 | Polymarket price snapshots stored on poll cadence for movement detection |
| SCHED-01 | Polling scheduler runs configured cadences during/around US market hours |
| ALERT-01 | Telegram alert types added: HEADLINE_PM_CONFIRMED, HEADLINE_PM_DIVERGENCE, DAILY_DIGEST |
| ALERT-02 | LLM-assisted headline-to-market correlation produces alert rationale (≤200 words per alert) |

**Provider candidates** (selection in phase plan):
- Headlines (ticker): Finnhub `/company-news` (already integrated, free tier — cheapest path)
- Headlines (macro/breaking): Polygon News ($29/mo basic) or NewsAPI (free dev tier as fallback)
- Prediction markets: Polymarket Gamma API + CLOB API (free, no auth for reads); Kalshi deferred
- Calendar: FRED (free) for macro, Finnhub for earnings, manual seeding for policy events
- VIX: Yahoo Finance (free, already integrated)
- Scheduler: `node-cron` (in-process, simplest fit)
- LLM: Claude API with aggressive prompt caching on static schema/theme content

**Architecture sketch**:
```
[News Sources] [Polymarket]   [Calendar] [VIX]
      │            │              │        │
      ▼            ▼              ▼        ▼
              Append-only JSONL stores
                       │
                       ▼
            Correlator (60-min rolling window)
                       │
                       ▼
                LLM Analyzer (Claude)
                       │
                       ▼
              Alert Builder + Dedup
                       │
                       ▼
                   Telegram
```

**Alert signal types** (mapped to Telegram emoji):
- 🔴 **HEADLINE_PM_CONFIRMED** — major headline + Polymarket relevant market moved ≥5pp same direction within 60 min
- 🔵 **HEADLINE_PM_DIVERGENCE** — Polymarket moved ≥5pp but no major news found (smart-money-ahead signal)
- 🟡 **HEADLINE_NO_PM_MOVE** — big-looking headline but markets flat (noise filter — low priority, optional)
- 📋 **DAILY_DIGEST** — 7am ET "what to watch today" + 5pm ET "what happened today"

**Success Criteria**:
1. Polymarket Gamma API client returns active markets with prices/volume/end-date
2. Headlines fetched and stored per-ticker for entire watchlist on cadence
3. Economic calendar fetched and queryable for next 14 days
4. VIX daily close stored and 20-day regime classified (calm / elevated / stressed)
5. Scheduler runs with configurable cadence and survives restart (last-poll-timestamp persisted)
6. Telegram bot delivers at least one alert of each type in real testing
7. Daily LLM spend tracked and visible; hard daily cap halts analysis if exceeded
8. Cost per day under $5 total (news provider + LLM)
9. Failures degrade gracefully (last-known state cached, scheduler keeps going, errors surface but don't crash)

**Estimated effort**: 5-7 days

**Suggested Build Order**:
1. Polymarket read-only client + types
2. Finnhub company-news poller + JSONL storage
3. Telegram alert types extended (formatters only; not yet fired by correlator)
4. Scheduler + manual one-cycle CLI command (`stock-analyzer intel run-once`)
5. Rule-based correlator (no LLM yet) → fire test alerts on raw movement
6. LLM correlator + cost tracking
7. Daily digest job
8. End-to-end smoke test with real APIs

**Can start independent of M2-01 (different code paths). Polymarket integration de-risks early.**

---

### Phase M2-04: LLM Trade-Signal Layer

**Directory**: `.planning/phases/10-llm-trade-signal/` (to be created)

**Goal**: Extend the M2-03 LLM scaffolding into a *trade-decision-grade* analysis layer: per-ticker rolling sentiment, theme tagging against a maintained enum, structured catalyst flags. M2-03 produces "alerts worth your attention"; M2-04 produces "machine-readable signal usable by the strategy engine."

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| AI-01 | LLM scores news headlines for sentiment + materiality per ticker (rolling, persisted) |
| AI-02 | LLM tags tickers with active themes (AI infra, defense, reshoring, tariff exposure, etc.) |
| AI-03 | LLM flags catalysts (earnings, regulatory, M&A) from news/calendar with date + magnitude |
| AI-04 | LLM API spend tracked and capped daily (extends M2-03 cost tracking) |

**Architecture additions on top of M2-03**:
- Daily batch: aggregate M2-03 headlines per ticker → Claude scores sentiment + materiality → persist rolling per-ticker summary
- Theme tags: closed enum in config; LLM scores each ticker against enum weekly
- Catalyst flags: structured output (type / date / magnitude / direction)
- Prompt-cache static parts (schema, theme enum, watchlist) aggressively

**Success Criteria**:
1. Daily headline batch processed with sentiment + materiality per article
2. Per-ticker daily summary (mean sentiment, materiality-weighted) queryable via API
3. Theme tags refreshed weekly per ticker
4. Catalyst flags surface 24h+ before scheduled events
5. Daily LLM spend tracked with breakdown (M2-03 alerts vs. M2-04 batch); single combined cap
6. Stability test: same 7-day window scored twice, results stable (no LLM drift hallucination)

**Estimated effort**: 3-4 days (smaller than original because M2-03 builds the LLM scaffolding)

**Depends on M2-03.**

---

### Phase M2-05: AI-Augmented Strategy Engine

**Directory**: `.planning/phases/11-ai-strategy/` (to be created)

**Goal**: Combine technical signals (from M2-01 winners) + LLM analysis (from M2-04) + volatility regime (from M2-03) into a single decision engine that produces *prioritized* candidate signals rather than raw buy/sell.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| INCOME-01 (extended) | Combined strategy outperforms standalone technicals in backtest |

**Design intent**:
- Technical layer: identifies *candidates* (e.g., momentum breakout, oversold mean-reversion setup)
- News layer: *filters* — kill the trade if recent sentiment is negative, kill it if a catalyst is within 24h
- Theme layer: *prioritizes* — if the candidate is in an active theme (AI infra, defense, etc.), rank higher
- Volatility layer: *sizes* — full size in calm regime, half in elevated, quarter in stressed
- Output: ranked list of trade ideas with rationale, *not* an auto-fire

**Success Criteria**:
1. Combined strategy backtests show better risk-adjusted return (Sharpe, Calmar) than standalone technical in M2-01
2. Backtest covers same 2018-2025 universe + regimes as M2-01
3. Top-N daily candidates surfaced via CLI and web dashboard with full rationale
4. Operator can accept / skip each candidate; system tracks decision history
5. Rationale displayed: technical setup + recent news summary + theme + vol regime + suggested size

**Estimated effort**: 5-7 days

---

### Phase M2-06: Hard Risk Management

**Directory**: `.planning/phases/12-risk-hardening/` (to be created)

**Goal**: Enforce risk limits at the broker layer, not just monitor them. The operator should not be able to override these without explicit code change.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| RISK-02 | Pre-trade check blocks orders violating concentration / size limits |
| RISK-03 | Catalyst-aware halt prevents new entries 24h before scheduled high-impact events |
| RISK-04 | Vol-regime sizing scales position size inversely with VIX regime |
| RISK-05 | Daily/weekly drawdown breaker auto-flattens and halts new orders |

**Hard rules to enforce**:
- Max single position: 25% of equity (later 15% as account grows)
- Max sector / theme exposure: 50% of equity
- Daily loss limit: 3% of equity → halt new entries until next session
- Weekly loss limit: 8% of equity → halt for 7 days, require manual review
- Catalyst within 24h on held position: alert (do not auto-close unless configured)
- Catalyst within 24h on candidate: block new entry
- VIX regime stressed: max position size = 25% of normal

**Success Criteria**:
1. Every pre-trade goes through a hard check that returns ALLOW / BLOCK with reason
2. BLOCK reasons logged and surfaced in dashboard
3. Drawdown breaker tested: simulate -3% day → new orders rejected
4. Halt state persists across restart (uses existing encrypted storage)
5. Operator override requires editing config + restart — no UI toggle

**Estimated effort**: 4-5 days

---

### Phase M2-07: Live Execution + Tax Tracking

**Directory**: `.planning/phases/13-live-and-tax/` (to be created)

**Goal**: Flip the Alpaca toggle from paper to live (with tiny initial size) and add lot-level tax tracking so after-tax PnL is the headline metric.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| EXEC-02 | Alpaca live integration with hard position-size and daily-loss limits |
| EXEC-04 | Tax-lot tracking records every fill with cost basis (FIFO) for after-tax PnL |

**Success Criteria**:
1. Live trading enabled via config + extra confirmation step
2. First 30 days hard-capped at $250/position regardless of signal — to find execution bugs
3. Every fill creates a tax lot with timestamp, cost basis, lot ID
4. Sells consume lots FIFO with realized PnL calculated
5. Wash-sale detection: warn (not block) on a sell-at-loss followed by buy within 30 days
6. After-tax PnL report: total realized gain, estimated tax (configurable bracket), after-tax PnL

**Estimated effort**: 4-5 days

---

## Deferred (Milestone 1 carryover)

These phases were planned under M1 but are deprioritized until M2 ships. Work remains valid but does not move toward income.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 3 | Redis Infrastructure | Deferred | Auth persistence — irrelevant until multi-user / production deployment |
| 4 | Risk Integration (CLI) | Deferred | Partially superseded by M2-06; keep doc for future cleanup |
| 5 | Code Quality | Deferred | Worth doing once M2 code stabilizes |
| 6 | Testing | Deferred | Resume after M2-05 to test the new layers (which is where bugs will matter) |

---

## Execution Timeline

| Phase | Est. Duration | Dependencies | Parallelizable With |
|-------|---------------|--------------|---------------------|
| M2-01: Strategy Reality Check | 1-2 days | None | — |
| M2-02: Alpaca Paper | 4-6 days | M2-01 (need a strategy to wire) | M2-03 |
| M2-03: Market Intelligence Bot | 5-7 days | None | M2-02 |
| M2-04: LLM Trade-Signal Layer | 3-4 days | M2-03 | — |
| M2-05: AI-Augmented Strategy | 5-7 days | M2-01, M2-02, M2-04 | — |
| M2-06: Risk Hardening | 4-5 days | M2-05 (need strategy output to gate) | — |
| M2-07: Live + Tax | 4-5 days | M2-02, M2-06 | — |

**Total M2 estimated duration**: 25-34 working days (~5-7 weeks with parallelization, one operator).

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| M2-01 shows existing strategies have no edge | Use the empirical result to design new signals; do not skip the test |
| Alpaca rate limits surprise us in M2-02 | Build with rate limiter + queue from day 1 |
| LLM cost spirals in M2-04 | Hard daily cap; aggressive prompt caching; batch processing |
| News provider unreliable | Multi-provider fallback (same pattern as market data) |
| Live trading bugs cost real money | First 30 days $250/position cap, exhaustive Alpaca paper testing first |
| Tax tracking gets retrofitted poorly | Build lot tracking in M2-02 (paper), validate before live |
| Operator over-trades during a losing streak | M2-06 hard limits enforce halt; design halts to be hard to override |

---

## Out of Scope (M2)

- Day trading (PDT rule blocks meaningfully)
- Options strategies (separate competency; defer)
- Long-term ETF core sleeve (best done outside this codebase)
- Multi-user productization
- Mean reversion as a *standalone* signal (kept as one input within M2-05)
- Mobile app

---

*Last updated: 2026-05-30 — M2-01 plans created*
