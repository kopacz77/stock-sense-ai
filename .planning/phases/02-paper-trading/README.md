# Phase 2: Paper Trading Integration

## Overview

Complete paper trading engine to use real market data from existing providers and support all order types including trailing stops via API.

## Requirements Covered

| REQ-ID | Description | Status |
|--------|-------------|--------|
| PAPER-01 | Paper trading engine fetches real market data from existing providers | pending |
| PAPER-02 | User can start paper trading with a strategy via API endpoint | pending |
| PAPER-03 | Trailing stop loss orders execute correctly when price moves | pending |
| PAPER-04 | All 5 order types (Market, Limit, Stop, Take-Profit, Trailing) work correctly | pending |

## Problem Statement

The paper trading module exists but:
- Uses mock data instead of real market data from existing providers
- API endpoint returns 501 for strategy loading
- Trailing stop execution logic is incomplete
- Order execution paths not fully wired up

## Key Files

- `src/paper-trading/engine/paper-trading-engine.ts` - Core engine
- `src/paper-trading/api/paper-trading-api.ts` - API endpoints
- `src/paper-trading/orders/order-manager.ts` - Order handling
- `src/paper-trading/execution/execution-simulator.ts` - Order execution
- `src/paper-trading/portfolio/portfolio-manager.ts` - Position tracking
- `src/paper-trading/journal/trade-journal.ts` - Trade logging
- `src/data/market-data-service.ts` - Real market data source

## Success Criteria

1. `POST /api/paper-trading/start` with valid strategy returns 200
2. Price updates come from `MarketDataService` providers
3. Trailing stop with 5% trail adjusts when price moves up 10%
4. All order types can be placed and fill correctly
5. Trade journal records all executed trades

## Dependencies

- Phase 1: Strategy type definitions may be shared

## Plans

Plans will be created in this directory as work progresses.

---

*Phase Status: pending*
