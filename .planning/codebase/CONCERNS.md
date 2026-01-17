# Stock Sense AI - Technical Concerns

## Overview

This document tracks technical debt, TODOs, security considerations, performance concerns, and fragile areas in the codebase that require attention.

---

## Technical Debt

### High Priority

#### 1. Backtest Commands Disabled
**Location**: `src/index.ts` (lines 21-22, 1030-1031)

```typescript
// TODO: Fix type mismatches in backtest-commands.ts before enabling
// import { registerBacktestCommands } from "./cli/backtest-commands.js";
```

**Issue**: Type mismatches in backtest-commands.ts prevent it from being used.

**Impact**: Users cannot access backtesting via CLI.

**Fix Required**: Resolve type incompatibilities between backtest engine and CLI command expectations.

---

#### 2. Low Test Coverage
**Location**: `tests/` directory

**Current Status**:
- Overall coverage: ~30%
- Target: 80%
- Critical paths not fully covered

**Missing Tests**:
| Module | Files Missing |
|--------|---------------|
| Paper Trading | 8 test files |
| Risk Management | 8 test files |
| Data Infrastructure | 7 test files |
| Integration | 6 test files |
| Performance | 4 test files |

**Impact**: Risk of regressions, bugs in production.

---

#### 3. In-Memory Token Blacklist
**Location**: `src/web/auth-middleware.ts` (line 35)

```typescript
// In-memory token blacklist for logout functionality
// In production, use Redis or database
const tokenBlacklist = new Set<string>();
```

**Issue**: Token blacklist is lost on server restart.

**Impact**: Logged-out tokens become valid again after restart.

**Fix Required**: Implement Redis or database-backed token storage.

---

#### 4. Rate Limit Map Not Persisted
**Location**: `src/web/server.ts` (line 76)

```typescript
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
```

**Issue**: Rate limiting data lost on restart, in-memory only.

**Impact**: Rate limits reset on deployment/restart.

**Fix Required**: Consider Redis for distributed rate limiting.

---

### Medium Priority

#### 5. Legacy CBC Decryption Support
**Location**: `src/config/secure-config.ts` (lines 314-328)

```typescript
/**
 * Decrypt legacy AES-CBC encrypted data for backward compatibility
 * @deprecated Will be removed in future version
 */
private decryptLegacyCBC(encryptedText: string, key: string): string {
  // ...
}
```

**Issue**: Supporting legacy encryption format adds complexity.

**Action**: Plan migration path for existing users, then remove.

---

#### 6. Keytar Fallback Warning
**Location**: `src/config/secure-config.ts` (lines 6-11)

```typescript
let keytar: typeof import("keytar") | null = null;
try {
  keytar = require("keytar");
} catch (error) {
  console.warn("Keytar not available, using file-based key storage (less secure)");
}
```

**Issue**: File-based key storage is less secure than OS keychain.

**Impact**: In environments without keytar, encryption keys stored in file.

---

#### 7. Any Types in Codebase
**Locations**: Multiple files

```typescript
// src/data/market-data-service.ts
async getCacheStats(): Promise<{
  legacyCache: number;
  enhancedCache?: any;  // Should be typed
}> { ... }

// src/analysis/technical-indicators.ts
private static detectMarketRegime(indicators: any, data: PriceData): MarketRegime {
  // indicators should be properly typed
}
```

**Impact**: Type safety reduced, potential runtime errors.

---

#### 8. Hardcoded Configuration Values
**Locations**: Various files

```typescript
// src/data/market-data-service.ts
private cacheDuration = 60 * 60 * 1000; // 1 hour - should be configurable
private quoteCacheDuration = 4 * 60 * 60 * 1000; // 4 hours - should be configurable
private readonly DAILY_LIMIT = 25; // Free tier limit - may change

// src/web/server.ts
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window
```

**Fix**: Move to configuration or environment variables.

---

## TODO Items

### From Source Code

| Location | TODO |
|----------|------|
| `src/index.ts:21` | Fix type mismatches in backtest-commands.ts |
| `src/web/auth-middleware.ts:34` | Use Redis for token blacklist in production |

### From Documentation

| Item | Priority | Description |
|------|----------|-------------|
| Complete paper trading tests | High | 8 test files needed |
| Complete risk management tests | High | 8 test files needed |
| Add integration tests | Medium | 6 test files needed |
| Add performance benchmarks | Medium | 4 test files needed |
| Implement CI/CD pipeline | Medium | GitHub Actions workflow |

---

## Security Considerations

### Handled Well

| Area | Implementation |
|------|----------------|
| API Key Storage | AES-256-GCM encryption with PBKDF2 key derivation |
| JWT Tokens | HS256 signing, configurable expiration |
| Input Validation | Zod schemas for API inputs |
| CORS | Configurable allowed origins |
| Rate Limiting | IP-based, configurable limits |

### Areas of Concern

#### 1. JWT Secret Generation
**Location**: `src/web/auth-middleware.ts` (line 13)

```typescript
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
```

**Concern**: Auto-generated secret changes on restart, invalidating all tokens.

**Recommendation**: Always set `JWT_SECRET` in production environment.

---

#### 2. API Key in Query String
**Location**: `src/web/auth-middleware.ts` (lines 133-138)

```typescript
// Method 3: Check for API key in query string
const apiKeyQuery = req.query.api_key as string | undefined;
if (apiKeyQuery && API_KEY && apiKeyQuery === API_KEY) {
  req.user = { userId: "api-key-user", role: "admin" };
```

**Concern**: API keys in URLs can be logged by proxies, browsers, analytics.

**Recommendation**: Prefer header-based authentication, document risk.

---

#### 3. Sensitive Files in Repository
**Files that should never be committed**:
- `.env` (API keys, secrets)
- `.key` (encryption key)
- `config.encrypted` (encrypted config)

**Current .gitignore** handles this, but verify deployment practices.

---

#### 4. No HTTPS Enforcement
**Location**: `src/web/server.ts`

**Concern**: Server listens on HTTP, no TLS termination.

**Mitigation**:
- Nginx proxy handles HTTPS (see `nginx/` directory)
- Docker setup uses reverse proxy
- Local development only uses HTTP

---

#### 5. Console Logging of Sensitive Data
**Various Locations**:

```typescript
// Could expose sensitive info in logs
console.info("Finnhub provider initialized from environment variable");
console.error("Error loading config:", error);
```

**Recommendation**: Implement structured logging with redaction.

---

## Performance Concerns

### Data Provider Rate Limits

| Provider | Limit | Impact |
|----------|-------|--------|
| Alpha Vantage (Free) | 5/min, 25/day | Severe - limits discovery scans |
| Finnhub (Free) | 60/min | Moderate - OK for most use cases |
| Yahoo Finance | Unknown | No documented limit |

**Mitigation Implemented**:
- Aggressive caching (1-4 hour TTL)
- Provider failover chain
- Rate limiter with waiting

**Remaining Concern**: Heavy discovery scans can exhaust daily limits quickly.

---

### Memory Usage

#### Caching Strategy
**Location**: `src/data/market-data-service.ts`

```typescript
private cache: Map<string, { data: HistoricalData[]; timestamp: number }> = new Map();
private quoteCache: Map<string, { data: MarketData; timestamp: number }> = new Map();
```

**Concern**: No cache size limits, could grow unbounded.

**Recommendation**: Implement LRU cache with maximum size.

---

#### WebSocket Intervals
**Location**: `src/web/server.ts` (lines 521, 532-534)

```typescript
private activeIntervals = new Set<NodeJS.Timeout>();

const updateInterval = setInterval(() => {
  this.sendUpdateToClient(socket);
}, 5 * 60 * 1000);
```

**Status**: Intervals are tracked and cleared on disconnect (good).

---

### Frontend Bundle Size

**Potential Issues**:
- Chart.js is large (~200KB)
- Framer Motion adds animation overhead
- No code splitting visible in config

**Recommendations**:
- Implement lazy loading for pages
- Tree-shake unused icon imports
- Consider lighter alternatives for charts

---

## Fragile Areas

### 1. Alpha Vantage Response Parsing
**Location**: `src/data/market-data-service.ts` (lines 236-271)

```typescript
const timeSeries = response.data["Time Series (Daily)"];
if (!timeSeries) {
  throw new Error(`No data found for symbol: ${symbol}`);
}

return Object.entries(timeSeries)
  .map(([date, values]) => ({
    date,
    open: parseFloat(values["1. open"]),
    // ...
  }))
```

**Risk**: Alpha Vantage API changes could break parsing.

**Mitigation**: Add response schema validation with Zod.

---

### 2. Technical Indicator Library Dependency
**Location**: `src/analysis/technical-indicators.ts`

**Dependency**: `technicalindicators` v3.1.0

**Risk**: Library updates could change calculation results.

**Mitigation**: Pin version, add regression tests for indicator values.

---

### 3. Provider Failover Chain
**Location**: `src/data/market-data-service.ts` (lines 160-230)

```typescript
// Try Alpha Vantage first (if not rate limited and key available)
if (!this.alphaVantageRateLimited && this.apiKey) {
  try {
    const data = await this.fetchFromAlphaVantage(symbol, outputSize);
    // ...
  } catch (error) {
    // On rate limit, switch to Finnhub
  }
}
// Fallback to Finnhub
// Ultimate fallback: Yahoo Finance
```

**Risk**: Complex conditional logic, hard to test all paths.

**Recommendation**: Add integration tests for failover scenarios.

---

### 4. Configuration Loading Priority
**Location**: `src/config/secure-config.ts` (lines 176-198)

**Order**:
1. Load from encrypted config file
2. Fallback to environment variables
3. Prompt for setup

**Risk**: Subtle bugs if config sources conflict or partial configs exist.

---

### 5. WebSocket Update Payload
**Location**: `src/web/server.ts` (lines 552-571)

```typescript
const [stats, opportunities, chartData, overview] = await Promise.all([
  this.monitoringService.getStats(),
  this.monitoringService.getOpportunities(),
  this.monitoringService.getChartData(6),
  this.stockDiscovery.getMarketOverview(),
]);
```

**Risk**: If any promise fails, entire update fails.

**Recommendation**: Handle individual promise failures gracefully.

---

## Dependency Concerns

### Outdated/Deprecated Packages

| Package | Current | Concern |
|---------|---------|---------|
| `@types/node` | ^20.19.9 | Check for Node.js 20 compatibility |
| `inquirer` | ^9.2.12 | Major breaking changes in v9 |

### Large Dependencies

| Package | Size | Necessity |
|---------|------|-----------|
| `chart.js` | ~200KB | Required for visualization |
| `framer-motion` | ~150KB | Could use lighter alternative |
| `technicalindicators` | ~100KB | Core functionality |

### Security Audit

Run periodically:
```bash
pnpm audit
npm audit --prefix web/frontend
```

---

## Monitoring and Observability

### Current State

| Aspect | Status |
|--------|--------|
| Health check endpoint | Implemented (`/api/health`) |
| Application logging | Basic console logging |
| Error tracking | None |
| Performance monitoring | None |
| Alerting | Only for trading signals |

### Recommendations

1. **Add structured logging**: Replace console.* with a logging library (pino, winston)
2. **Implement error tracking**: Consider Sentry or similar
3. **Add APM**: Consider lightweight APM for API performance
4. **Metrics endpoint**: Expose `/metrics` for Prometheus

---

## Database/Persistence Gaps

### Current State: File-Based

| Data | Storage | Issue |
|------|---------|-------|
| Configuration | Encrypted file | Works, but not scalable |
| Cache | In-memory | Lost on restart |
| Paper trading | File-based | Could corrupt on crash |
| Trade journal | File-based | Not queryable |
| Watchlist | Plain text file | No structure |

### Future Considerations

If scaling beyond single instance:
- SQLite for local persistence
- Redis for caching and sessions
- PostgreSQL for multi-user deployment

---

## Action Items Summary

### Immediate (Before Production)

1. Set `JWT_SECRET` environment variable
2. Review and update `.env.example` with all required variables
3. Run security audit on dependencies
4. Ensure `.key` and `config.encrypted` are in `.gitignore`

### Short Term (Next Sprint)

1. Fix backtest-commands.ts type issues
2. Implement Redis for token blacklist (if multi-instance)
3. Add cache size limits
4. Complete critical path tests (fill-simulator, var-calculator)

### Medium Term (Next Quarter)

1. Achieve 80% test coverage
2. Implement structured logging
3. Add error tracking (Sentry)
4. Remove legacy CBC decryption support
5. Type all `any` usages

### Long Term (Future)

1. Consider SQLite for local persistence
2. Implement proper metrics/observability
3. Add end-to-end testing
4. Performance optimization for discovery scans
