# Stock Sense AI - Development Roadmap

## Overview

This roadmap defines the phased approach to fix and complete the Stock Sense AI trading platform to production-ready status. The project requires fixing broken backtesting commands, completing paper trading integration, implementing Redis infrastructure for auth persistence, integrating risk management with real portfolio data, improving code quality, and achieving comprehensive test coverage.

**Mode**: yolo (fast iteration, minimal bureaucracy)
**Total Phases**: 6
**Parallelization**: enabled where dependencies allow

---

## Phase Dependency Graph

```
Phase 1: Backtesting Fix
    |
    v
Phase 2: Paper Trading ----+
    |                      |
    v                      v
Phase 3: Redis Infra   Phase 4: Risk Integration
    |                      |
    +----------+-----------+
               |
               v
        Phase 5: Code Quality
               |
               v
        Phase 6: Testing
```

---

## Phase 1: Backtesting Fix

**Directory**: `.planning/phases/01-backtesting-fix/`

**Goal**: Restore full backtesting functionality via CLI so users can run backtests, optimize parameters, perform walk-forward analysis, and view comprehensive performance reports.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| BACK-01 | User can run backtests via CLI with `backtest run` command |
| BACK-02 | User can optimize strategy parameters via grid search |
| BACK-03 | User can validate strategies with walk-forward analysis |
| BACK-04 | User can view performance reports with 30+ metrics and equity curves |

**Problem Analysis**:
- `src/index.ts` has backtest commands commented out (lines 21-22, 1030-1031)
- Type mismatches exist between `backtest-commands.ts` and `backtest-engine.ts`
- The backtesting module itself (`src/backtesting/`) is implemented but not wired up

**Success Criteria**:
1. `stock-analyzer backtest run --symbol AAPL --strategy rsi --start 2025-01-01 --end 2025-12-01` executes without errors
2. `stock-analyzer backtest optimize --strategy rsi --param-ranges '{"period":[7,14,21]}'` completes grid search and outputs best parameters
3. `stock-analyzer backtest walk-forward --symbol AAPL --strategy momentum --windows 4` runs walk-forward validation
4. Performance report shows at least 30 metrics including Sharpe ratio, max drawdown, and equity curve visualization
5. All backtest CLI commands are uncommented and registered in `src/index.ts`

**Suggested Build Order**:
1. Analyze type mismatches in `src/cli/backtest-commands.ts`
2. Fix engine-to-CLI type compatibility
3. Wire up grid search optimization
4. Wire up walk-forward analysis
5. Enable and test CLI commands

---

## Phase 2: Paper Trading Integration

**Directory**: `.planning/phases/02-paper-trading/`

**Goal**: Complete paper trading engine to use real market data from existing providers and support all order types including trailing stops via API.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| PAPER-01 | Paper trading engine fetches real market data from existing providers |
| PAPER-02 | User can start paper trading with a strategy via API endpoint |
| PAPER-03 | Trailing stop loss orders execute correctly when price moves |
| PAPER-04 | All 5 order types (Market, Limit, Stop, Take-Profit, Trailing) work correctly |

**Problem Analysis**:
- `src/paper-trading/engine/paper-trading-engine.ts` exists but uses mock data
- API endpoint returns 501 for strategy loading (`src/paper-trading/api/paper-trading-api.ts`)
- Trailing stop logic needs to track price movement and adjust trigger price
- Order manager has structure but execution paths incomplete

**Success Criteria**:
1. `POST /api/paper-trading/start` with a valid strategy name returns 200 and starts paper trading
2. Paper trading price updates come from `MarketDataService` (Alpha Vantage/Finnhub/Yahoo)
3. Placing a trailing stop order with 5% trail, price moves up 10%, stop adjusts accordingly
4. All order types (Market, Limit, Stop, Take-Profit, Trailing) can be placed and fill correctly
5. Paper trading journal records all executed trades with timestamps

**Suggested Build Order**:
1. Integrate `MarketDataService` into paper trading engine
2. Implement API endpoint for starting paper trading with strategy
3. Fix trailing stop order execution logic
4. Verify all 5 order types work end-to-end
5. Add WebSocket price feed for real-time updates

---

## Phase 3: Redis Infrastructure

**Directory**: `.planning/phases/03-redis-infrastructure/`

**Goal**: Implement Redis-backed persistence for JWT token blacklist, rate limiting state, and JWT secret storage to ensure auth state survives server restarts.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| AUTH-01 | JWT token blacklist persists in Redis across server restarts |
| AUTH-02 | Rate limiting state persists in Redis across server restarts |
| AUTH-03 | JWT secret is stored persistently (not regenerated on restart) |

**Problem Analysis**:
- `src/web/auth-middleware.ts` line 35: `tokenBlacklist = new Set<string>()` is in-memory
- `src/web/server.ts` line 76: `rateLimitMap = new Map<...>()` is in-memory
- `JWT_SECRET` defaults to random bytes if env var not set (line 13 in auth-middleware)

**Success Criteria**:
1. Server restarts, previously blacklisted token still rejected
2. User rate limited, server restarts, rate limit state preserved
3. JWT secret is loaded from Redis or secure config, not regenerated
4. Redis connection failure gracefully falls back to in-memory (with warning)
5. Docker Compose includes Redis service for local development

**Suggested Build Order**:
1. Add Redis client dependency and connection setup
2. Migrate token blacklist to Redis with TTL
3. Migrate rate limiting map to Redis
4. Implement persistent JWT secret storage
5. Add graceful fallback and health checks

---

## Phase 4: Risk Integration

**Directory**: `.planning/phases/04-risk-integration/`

**Goal**: Connect risk CLI commands (VaR, CVaR, Monte Carlo, stress test) to actual portfolio data from paper trading or file-based storage.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| RISK-01 | Risk CLI commands (var, cvar, monte-carlo, stress-test) use actual portfolio data |

**Problem Analysis**:
- `src/cli/risk-commands.ts` exists but may use placeholder/mock portfolio data
- `src/risk/` module has calculators (VaR, CVaR, Monte Carlo, stress test) but needs real position data
- Paper trading portfolio manager (`src/paper-trading/portfolio/portfolio-manager.ts`) has positions

**Success Criteria**:
1. `stock-analyzer risk var` reads positions from paper trading portfolio or portfolio file
2. `stock-analyzer risk cvar --confidence 0.99` calculates CVaR with real position weights
3. `stock-analyzer risk monte-carlo --simulations 10000` uses actual holdings
4. `stock-analyzer risk stress-test --scenario market-crash` applies scenarios to real portfolio
5. Risk reports show which positions contribute most to portfolio risk

**Suggested Build Order**:
1. Create portfolio data adapter (reads from paper trading or file)
2. Wire up VaR calculator to real positions
3. Wire up CVaR calculator
4. Wire up Monte Carlo simulation
5. Wire up stress testing scenarios

---

## Phase 5: Code Quality

**Directory**: `.planning/phases/05-code-quality/`

**Goal**: Improve code quality by eliminating `any` types, replacing silent failures with proper error handling, using `Promise.allSettled` where appropriate, and standardizing logging.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| QUAL-01 | All `any` types replaced with proper TypeScript types |
| QUAL-02 | Silent failures replaced with proper error handling and recovery |
| QUAL-03 | Promise.all replaced with Promise.allSettled where appropriate |
| QUAL-04 | Console.* calls replaced with consistent logger.* usage |

**Problem Analysis**:
- Multiple `any` types identified in CONCERNS.md (market-data-service.ts, technical-indicators.ts)
- Some API responses swallow errors without logging
- `Promise.all` in WebSocket update (server.ts line 552) fails entirely if one promise rejects
- Inconsistent use of `console.*` vs `logger.*` throughout codebase

**Success Criteria**:
1. `npx tsc --noEmit` passes with zero `any` type warnings (or explicit justifications)
2. All catch blocks either log the error, throw, or return a meaningful error response
3. WebSocket updates use `Promise.allSettled` and handle partial failures gracefully
4. All runtime logging uses `src/utils/logger.ts` with appropriate log levels
5. ESLint/TypeScript strict mode shows no type-related warnings

**Suggested Build Order**:
1. Audit and list all `any` types in codebase
2. Replace `any` types with proper interfaces/types
3. Review all try-catch blocks for silent failures
4. Replace `Promise.all` with `Promise.allSettled` where partial success acceptable
5. Standardize logging across all files

---

## Phase 6: Testing

**Directory**: `.planning/phases/06-testing/`

**Goal**: Achieve comprehensive test coverage (80%+) across backtesting, paper trading, risk management, and integration tests.

**Requirements**:
| REQ-ID | Description |
|--------|-------------|
| TEST-01 | Backtesting module has comprehensive tests (engine, analytics, optimization) |
| TEST-02 | Paper trading module has comprehensive tests (portfolio, orders, execution, journal) |
| TEST-03 | Risk management module has comprehensive tests (VaR, CVaR, Monte Carlo, stress) |
| TEST-04 | Integration tests cover API endpoints, WebSocket connections, and auth flow |

**Problem Analysis**:
- Current coverage ~30%, target 80%
- Missing tests identified in CONCERNS.md: 8 paper trading, 8 risk, 7 data, 6 integration, 4 performance
- Existing tests in `src/data/__tests__/` and `src/risk/__tests__/` provide patterns

**Success Criteria**:
1. Backtesting tests cover: backtest engine, performance metrics, equity curve, grid search, walk-forward
2. Paper trading tests cover: portfolio manager, order manager, execution simulator, trade journal
3. Risk tests cover: VaR calculator, CVaR calculator, Monte Carlo simulation, stress tester
4. Integration tests cover: all API endpoints, WebSocket connection/events, JWT auth flow
5. `pnpm test -- --coverage` shows 80%+ overall coverage

**Suggested Build Order**:
1. Add backtesting module tests
2. Add paper trading module tests
3. Add remaining risk management tests
4. Add API integration tests
5. Add WebSocket and auth integration tests

---

## Execution Timeline

| Phase | Est. Duration | Dependencies | Parallelizable With |
|-------|---------------|--------------|---------------------|
| 1. Backtesting Fix | 2-3 days | None | - |
| 2. Paper Trading | 3-4 days | Phase 1 (strategy types) | Phase 3 (after start) |
| 3. Redis Infrastructure | 2 days | None | Phase 2, Phase 4 |
| 4. Risk Integration | 2 days | Phase 2 (portfolio data) | Phase 3 |
| 5. Code Quality | 2-3 days | Phases 1-4 (stable code) | - |
| 6. Testing | 3-4 days | Phases 1-5 (all features) | - |

**Total Estimated Duration**: 14-18 days (with parallelization)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Backtesting type issues deeper than expected | Time-box to 3 days, escalate if blocking |
| Redis adds operational complexity | Provide in-memory fallback, document setup |
| Test coverage goal too aggressive | Prioritize critical paths first (engine, API) |
| Data provider rate limits slow development | Use cached/mock data for tests |

---

*Last updated: 2026-01-16*
