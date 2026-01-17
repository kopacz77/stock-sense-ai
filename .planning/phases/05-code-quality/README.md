# Phase 5: Code Quality

## Overview

Improve code quality by eliminating `any` types, replacing silent failures with proper error handling, using `Promise.allSettled` where appropriate, and standardizing logging.

## Requirements Covered

| REQ-ID | Description | Status |
|--------|-------------|--------|
| QUAL-01 | All `any` types replaced with proper TypeScript types | pending |
| QUAL-02 | Silent failures replaced with proper error handling | pending |
| QUAL-03 | Promise.all replaced with Promise.allSettled where appropriate | pending |
| QUAL-04 | Console.* replaced with logger.* usage | pending |

## Problem Statement

Code quality issues identified in CONCERNS.md:

### Any Types
```typescript
// src/data/market-data-service.ts
enhancedCache?: any;  // Should be typed

// src/analysis/technical-indicators.ts
private static detectMarketRegime(indicators: any, data: PriceData): MarketRegime
```

### Silent Failures
Some catch blocks swallow errors without logging or re-throwing.

### Promise.all Issues
```typescript
// src/web/server.ts (lines 552-571)
const [stats, opportunities, chartData, overview] = await Promise.all([...]);
// If any promise fails, entire update fails
```

### Inconsistent Logging
Mix of `console.*` and `logger.*` throughout codebase.

## Key Files

- `src/data/market-data-service.ts` - Any types, error handling
- `src/analysis/technical-indicators.ts` - Any types
- `src/web/server.ts` - Promise.all, logging
- `src/utils/logger.ts` - Logger implementation
- All files with `console.*` usage

## Success Criteria

1. `npx tsc --noEmit` passes with zero `any` warnings
2. All catch blocks log, throw, or return meaningful errors
3. WebSocket updates use `Promise.allSettled` with partial failure handling
4. All logging uses `logger.*` with appropriate levels
5. ESLint shows no type-related warnings

## Dependencies

- Phases 1-4: Code should be stable before quality sweep

## Plans

Plans will be created in this directory as work progresses.

---

*Phase Status: pending*
