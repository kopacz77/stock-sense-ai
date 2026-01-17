# Stock Sense AI - Architecture

## Overview

Stock Sense AI follows a layered architecture with clear separation between CLI interface, web server, business logic, and data access. The system is designed as a monorepo with a Node.js backend and React frontend.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                         │
├─────────────────────────────────┬───────────────────────────────────┤
│       CLI (Commander.js)        │      Web Dashboard (React)        │
│         src/index.ts            │     web/frontend/src/             │
└─────────────────────────────────┴───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API Layer                                   │
│                       src/web/server.ts                              │
│   • REST endpoints (/api/*)                                          │
│   • WebSocket (Socket.IO)                                            │
│   • Authentication middleware                                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Service Layer                                  │
├─────────────┬──────────────┬──────────────┬─────────────────────────┤
│  Discovery  │  Monitoring  │   Analysis   │    Paper Trading        │
│  Service    │   Service    │  Strategies  │       Engine            │
└─────────────┴──────────────┴──────────────┴─────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Core Domain Layer                              │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│   Technical  │     Risk     │  Backtesting │    Notification        │
│  Indicators  │  Management  │    Engine    │      Service           │
└──────────────┴──────────────┴──────────────┴────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Data Access Layer                              │
├─────────────────────────────────────────────────────────────────────┤
│                     Market Data Service                              │
│   • Alpha Vantage Provider                                           │
│   • Finnhub Provider                                                 │
│   • Yahoo Finance Provider                                           │
│   • Cache Manager                                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    External Services & Storage                       │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ Alpha Vantage│   Finnhub    │    Yahoo     │  File System / Keytar  │
│     API      │     API      │   Finance    │   Telegram / SendGrid  │
└──────────────┴──────────────┴──────────────┴────────────────────────┘
```

---

## Entry Points

### CLI Entry Point
**File**: `src/index.ts`

The main CLI application using Commander.js:
- Registers all commands (analyze, scan, discover, monitor, etc.)
- Initializes services (SecureConfig, MarketDataService, etc.)
- Handles global error handling

```typescript
#!/usr/bin/env node
import { Command } from "commander";
const program = new Command();
program.name("stock-analyzer")
  .description("Secure local stock analysis CLI")
  .version("1.0.0");
// ... commands registration
program.parse();
```

### Web Server Entry Point
**File**: `src/web/server.ts`

Express server with Socket.IO:
- Serves REST API endpoints
- Handles WebSocket connections
- Serves static frontend files

```typescript
export class WebServer {
  private app = express();
  private server = createServer(this.app);
  private io = new SocketIOServer(this.server, {...});

  async start(): Promise<void> { ... }
  async stop(): Promise<void> { ... }
}
```

### Frontend Entry Point
**File**: `web/frontend/src/main.tsx`

React application entry:
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

---

## Design Patterns

### Singleton Pattern
**Used in**: Configuration management

```typescript
// src/config/secure-config.ts
export class SecureConfig {
  private static instance: SecureConfig;

  static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }
}
```

### Strategy Pattern
**Used in**: Trading strategies

```typescript
// src/strategies/mean-reversion-strategy.ts
export class MeanReversionStrategy {
  async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> { ... }
}

// src/strategies/momentum-strategy.ts
export class MomentumStrategy {
  async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> { ... }
}
```

### Provider Pattern
**Used in**: Market data providers

```typescript
// src/data/types.ts
export interface DataProvider {
  name: string;
  testConnection(): Promise<boolean>;
  fetchQuote(symbol: string): Promise<QuoteData>;
  fetchHistoricalData(symbol: string, from: Date, to: Date): Promise<OHLCVData[]>;
}

// Implementations:
// - AlphaVantageProvider
// - FinnhubProvider
// - YahooFinanceProvider
```

### Service Layer Pattern
**Used throughout the application**

Services encapsulate business logic and coordinate between components:
- `MarketDataService` - Data fetching and caching
- `MonitoringService` - Continuous market monitoring
- `AlertService` - Notification dispatching
- `StockDiscovery` - Stock discovery and scanning

### Repository Pattern (Implicit)
**Used in**: Cache and storage management

```typescript
// src/data/cache-manager.ts
export class DataCacheManager {
  async getHistoricalData(symbol: string, from: Date, to: Date): Promise<OHLCVData[] | null>
  async setHistoricalData(symbol: string, from: Date, to: Date, data: OHLCVData[]): Promise<void>
}
```

---

## Data Flow

### Analysis Request Flow
```
1. User Request (CLI: `analyze AAPL` or Web: GET /api/analyze/AAPL)
        │
        ▼
2. MarketDataService.getFullAnalysisData(symbol)
        │
        ├──► Check cache (1 hour TTL for historical, 4 hour for quotes)
        │
        ├──► If cache miss: Fetch from providers (Alpha Vantage → Finnhub → Yahoo)
        │
        ▼
3. Strategy Analysis (MeanReversionStrategy / MomentumStrategy)
        │
        ├──► TechnicalIndicators.calculate(priceData)
        │    (RSI, MACD, Bollinger Bands, ATR, Stochastic, etc.)
        │
        ▼
4. Risk Management (RiskManager.calculatePosition)
        │
        ├──► Calculate stop loss, take profit, position size
        │
        ▼
5. Signal Generation
        │
        ├──► If strong signal: AlertService.sendAlert()
        │
        ▼
6. Response to User (CLI table or JSON response)
```

### Monitoring Flow
```
1. Start Monitoring (CLI: `monitor --start` or Web: POST /api/monitoring/start)
        │
        ▼
2. MonitoringService.start(config)
        │
        ├──► Set up interval (default 90 minutes)
        │
        ▼
3. Periodic Scan Cycle
        │
        ├──► StockDiscovery.discoverByMarket/Sector/Trending
        │    │
        │    ├──► Fetch stock lists
        │    │
        │    ├──► MarketDataService.getFullAnalysisData (for each)
        │    │
        │    └──► Strategy analysis on each
        │
        ├──► Filter by confidence threshold
        │
        ├──► Send alerts for high-confidence results
        │
        └──► Store results for retrieval
        │
        ▼
4. WebSocket Updates (every 5 minutes)
        │
        └──► Emit 'update' event with stats, opportunities, overview
```

### Frontend Data Flow
```
1. App loads → useSocket() establishes WebSocket connection
        │
        ▼
2. Socket receives 'update' event
        │
        ├──► Updates Zustand stores (useTradingStore, useUIStore)
        │
        ▼
3. React Query manages API requests
        │
        ├──► useQuery hooks fetch data with caching (30s stale time)
        │
        ▼
4. Components render with data
        │
        ├──► Pages: MonitoringPage, DiscoveryPage, AnalysisPage, MarketPage
        │
        └──► Components: Charts, Tables, Indicators
```

---

## Module Dependency Graph

```
src/index.ts (CLI Entry)
    ├── src/config/secure-config.ts
    ├── src/data/market-data-service.ts
    │       ├── src/data/providers/alpha-vantage-provider.ts
    │       ├── src/data/providers/finnhub-provider.ts
    │       ├── src/data/providers/yahoo-finance-provider.ts
    │       ├── src/data/cache-manager.ts
    │       └── src/data/rate-limiter.ts
    ├── src/analysis/technical-indicators.ts
    ├── src/analysis/risk-manager.ts
    ├── src/strategies/mean-reversion-strategy.ts
    ├── src/strategies/momentum-strategy.ts
    ├── src/discovery/stock-discovery.ts
    ├── src/monitoring/monitoring-service.ts
    ├── src/notifications/alert-service.ts
    ├── src/web/server.ts
    │       ├── src/web/auth-middleware.ts
    │       └── (static files from web/public/)
    └── src/cli/*.ts (command registrations)

src/backtesting/ (Backtesting Module)
    ├── engine/backtest-engine.ts
    ├── portfolio/portfolio-tracker.ts
    ├── analytics/performance-metrics.ts
    ├── optimization/grid-search.ts
    └── execution/fill-simulator.ts

src/paper-trading/ (Paper Trading Module)
    ├── engine/paper-trading-engine.ts
    ├── portfolio/portfolio-manager.ts
    ├── orders/order-manager.ts
    ├── execution/execution-simulator.ts
    └── storage/encrypted-storage.ts

src/risk/ (Risk Management Module)
    ├── metrics/var-calculator.ts
    ├── metrics/cvar-calculator.ts
    ├── correlation/correlation-matrix.ts
    ├── position-sizing/kelly-criterion.ts
    └── validation/pre-trade-validator.ts
```

---

## Abstraction Layers

### Types Layer
**Location**: `src/types/trading.ts`, `src/data/types.ts`

Core domain types shared across modules:
- `Signal` - Trading signal with action, confidence, indicators
- `Position` - Portfolio position tracking
- `MarketData` - Real-time quote data
- `HistoricalData` - OHLCV price data
- `OHLCVData` - Extended OHLCV with adjusted close

### Technical Indicators Abstraction
**File**: `src/analysis/technical-indicators.ts`

Wraps the `technicalindicators` library with:
- Unified input format (PriceData)
- Comprehensive output structure (TechnicalIndicatorResults)
- Market regime detection
- Signal interpretation

### Data Provider Abstraction
**Interface**: `DataProvider` in `src/data/types.ts`

```typescript
export interface DataProvider {
  name: string;
  testConnection(): Promise<boolean>;
  fetchQuote(symbol: string): Promise<QuoteData>;
  fetchHistoricalData(symbol: string, from: Date, to: Date): Promise<OHLCVData[]>;
}
```

### Configuration Abstraction
**File**: `src/config/secure-config.ts`

Abstracts:
- Keychain vs file-based storage
- Encryption/decryption
- Environment variable loading
- Configuration validation (Zod)

---

## API Architecture

### REST Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | No | Health check |
| `/api/auth/login` | POST | No | Exchange API key for JWT |
| `/api/auth/refresh` | POST | No | Refresh access token |
| `/api/auth/logout` | POST | Optional | Invalidate token |
| `/api/monitoring/status` | GET | Optional | Get monitoring stats |
| `/api/monitoring/start` | POST | Optional | Start monitoring |
| `/api/monitoring/stop` | POST | Optional | Stop monitoring |
| `/api/monitoring/opportunities` | GET | Optional | Get opportunities |
| `/api/monitoring/chart-data` | GET | Optional | Get chart data |
| `/api/monitoring/results` | GET | Optional | Get recent results |
| `/api/discover` | POST | Optional | Discover stocks |
| `/api/market/overview` | GET | Optional | Get market overview |
| `/api/analyze/:symbol` | GET | Optional | Analyze single stock |
| `/api/indicators/:symbol` | GET | Optional | Get technical indicators |
| `/api/settings` | GET | Optional | Get system settings |

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `connection` | C→S | - |
| `disconnect` | C→S | - |
| `refresh` | C→S | - |
| `update` | S→C | `{stats, opportunities, chartData, overview, timestamp}` |

---

## Frontend Architecture

### Routing
**File**: `web/frontend/src/App.tsx`

```
/                  → Redirect to /monitoring
/monitoring        → MonitoringPage
/discovery         → DiscoveryPage
/analysis          → AnalysisPage
/analysis/:symbol  → AnalysisPage (with symbol)
/market            → MarketPage
/settings          → SettingsPage
/help              → HelpPage
```

### State Management

#### Zustand Stores
- `useUIStore` - UI state (active tab, theme, etc.)
- `useTradingStore` - Trading data (stats, opportunities)

#### React Query
- Server state caching
- Automatic refetching
- 30 second stale time

### Component Hierarchy
```
App
├── QueryClientProvider
│   └── BrowserRouter
│       └── AppContent
│           ├── TabRouteSync
│           ├── Layout
│           │   ├── Sidebar
│           │   └── [Page Component]
│           └── Toaster
```

---

## Concurrency Model

### Backend
- **Single-threaded**: Node.js event loop
- **Async I/O**: Non-blocking API calls
- **Intervals**: Monitoring service uses setInterval
- **Rate limiting**: Async waiting for API availability

### Frontend
- **React concurrent mode**: Not explicitly enabled
- **Async state**: React Query handles loading states
- **WebSocket**: Separate connection, event-driven updates

---

## Error Handling Strategy

### Backend
1. **Try-catch blocks** in async functions
2. **Spinner feedback** for CLI operations
3. **HTTP status codes** for API responses
4. **Global error handlers** for uncaught exceptions:
   ```typescript
   process.on("unhandledRejection", ...);
   process.on("uncaughtException", ...);
   ```

### Frontend
1. **React Query error handling** with retry logic
2. **Toast notifications** for user feedback
3. **Error boundaries** (recommended but not fully implemented)

---

## Security Architecture

### Authentication Flow
```
1. Client sends API key to /api/auth/login
        │
        ▼
2. Server validates API key against STOCK_SENSE_API_KEY
        │
        ▼
3. Server generates JWT (access + refresh tokens)
        │
        ▼
4. Client stores tokens, sends with subsequent requests
        │
        ▼
5. Server validates JWT on protected routes
```

### Data Protection
- API keys encrypted at rest (AES-256-GCM)
- PBKDF2 key derivation (100k iterations)
- OS keychain preferred over file storage
- CORS restrictions on API endpoints
- Rate limiting to prevent abuse
