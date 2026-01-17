# Phase 2 Research: Paper Trading

## Executive Summary

The paper trading infrastructure is well-structured with all core components in place, but requires:
1. Integration with real market data (currently uses mock data)
2. Completion of strategy loading API endpoint (returns 501)
3. Fixes to trailing stop logic (partial implementation)

## 1. Current State

### Paper Trading Engine (`src/paper-trading/engine/paper-trading-engine.ts`)

**Critical Issue - Mock Data (Lines 195-216):**
```typescript
private async fetchMarketData(symbols: string[]): Promise<Map<string, MarketDataUpdate>> {
  // TODO: Integrate with Alpha Vantage or Finnhub API
  // For now, return mock data
  for (const symbol of symbols) {
    marketData.set(symbol, {
      price: 100 + Math.random() * 10, // Mock price!
      ...
    });
  }
}
```

**What's Working:**
- Execution loop structure (lines 143-151)
- Position price updates (line 162)
- Order processing (line 165)
- Stop loss/take profit checks (line 168)
- Strategy signal generation (lines 171-175)
- Portfolio state management

### Paper Trading API (`src/paper-trading/api/paper-trading-api.ts`)

**Working Endpoints:**
- GET /api/paper/status, /portfolio, /orders, /trades, /performance, /dashboard
- POST /api/paper/stop

**Critical Issue - 501 Error (Lines 124-139):**
```typescript
this.app.post("/api/paper/start", async (req, res) => {
  // TODO: Load strategy dynamically
  return res.status(501).json({ error: "Start endpoint not fully implemented" });
});
```

### Order Manager (`src/paper-trading/orders/order-manager.ts`)

**Order Types (Line 12):**
- MARKET ✅ Fully implemented
- LIMIT ✅ Fully implemented
- STOP_LOSS ✅ Fully implemented
- TAKE_PROFIT ✅ Fully implemented
- TRAILING_STOP ⚠️ Partially implemented

**Trailing Stop Issue (Lines 277-313):**
- `checkTrailingStop()` doesn't track highest/lowest price since order creation
- Logic checks current price vs trailing %, not peak price retreat
- Engine integration commented out (lines 562-570)

## 2. Market Data Integration

### MarketDataService (`src/data/market-data-service.ts`)

**Available Methods:**
- `getHistoricalData(symbol, outputSize)` - Returns `HistoricalData[]`
- `getCurrentQuote(symbol)` - Returns `MarketData`
- `getFullAnalysisData(symbol)` - Combined quote + historical
- `fetchHistoricalData(symbol, from, to)` - Date range query

**Provider Fallback:** Alpha Vantage → Finnhub → Yahoo Finance

**Integration Needed:**
Convert `OHLCVData` to `MarketDataUpdate`:
- `close` → `price`
- `high/low/open/volume` → direct mapping
- `previousClose` → calculate from adjacent candle

## 3. Order Types Status

| Type | Status | Notes |
|------|--------|-------|
| MARKET | ✅ Complete | Executes immediately at current price |
| LIMIT | ✅ Complete | Buy ≤ limit, Sell ≥ limit |
| STOP_LOSS | ✅ Complete | Buy ≥ stop, Sell ≤ stop |
| TAKE_PROFIT | ✅ Complete | Same logic as limit |
| TRAILING_STOP | ⚠️ Partial | Missing peak price tracking |

## 4. Strategy Loading

**StrategyRegistry** (`src/strategies/strategy-registry.ts`):
- Available: 'mean-reversion', 'momentum'
- Method: `getStrategy(name, params)`

**Interface Mismatch:**
- StrategyRegistry returns `Strategy` interface
- Engine expects `BacktestStrategy` interface
- Need adapter (similar to what backtest-commands.ts does)

## 5. Implementation Plan

### PAPER-01: Real Market Data
1. Import MarketDataService into engine
2. Replace `fetchMarketData()` with real API calls
3. Convert OHLCVData to MarketDataUpdate format
4. Handle caching and rate limits

### PAPER-02: Strategy Loading API
1. Import StrategyRegistry
2. Get strategy by name
3. Create adapter to BacktestStrategy interface
4. Initialize and start engine
5. Return 200 with status

### PAPER-03: Trailing Stop Fixes
1. Add `highestPrice`/`lowestPrice` tracking to Position interface
2. Fix `checkTrailingStop()` to use peak price, not current
3. Uncomment and fix engine integration code
4. Add `updateTrailingStop()` calls in price update loop

### PAPER-04: Order Type Verification
1. Verify all 4 working types with real data
2. Test trailing stop after fixes
3. Integration test full order lifecycle

## 6. Key Files

| File | Purpose | Lines to Modify |
|------|---------|-----------------|
| `src/paper-trading/engine/paper-trading-engine.ts` | Mock data → real data | 195-216, 546-571 |
| `src/paper-trading/api/paper-trading-api.ts` | Strategy loading | 124-139 |
| `src/paper-trading/orders/order-manager.ts` | Trailing stop logic | 277-313 |
| `src/paper-trading/types/paper-trading-types.ts` | Position interface | 82-123 |

---

*Research completed: 2026-01-17*
