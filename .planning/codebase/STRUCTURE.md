# Stock Sense AI - Project Structure

## Root Directory Layout

```
stock-sense-ai/
├── .claude/                    # Claude AI configuration
├── .git/                       # Git repository
├── .planning/                  # Planning and documentation
│   └── codebase/              # Codebase documentation (this!)
├── config/                     # Configuration templates
├── data/                       # Data storage
│   ├── cache/                 # Cached market data
│   └── paper-trading/         # Paper trading state
├── dist/                       # Compiled TypeScript output
├── docs/                       # Additional documentation
├── examples/                   # Example configurations
├── nginx/                      # Nginx configuration for Docker
├── node_modules/               # Backend dependencies
├── scripts/                    # Utility scripts
├── src/                        # Backend source code
├── tests/                      # Test suites
├── web/                        # Web application
│   ├── frontend/              # React frontend
│   └── public/                # Static files (built frontend)
├── .dockerignore              # Docker ignore file
├── .env                        # Environment variables (not in git)
├── .env.example               # Environment template
├── .gitignore                 # Git ignore file
├── .key                        # Encrypted encryption key (not in git)
├── biome.json                 # Biome linter/formatter config
├── config.encrypted           # Encrypted configuration (not in git)
├── docker-compose.prod.yml    # Production Docker compose
├── docker-compose.yml         # Development Docker compose
├── Dockerfile                 # Multi-stage Docker build
├── package.json               # Backend package config
├── pnpm-lock.yaml             # pnpm lock file
├── README.md                  # Main project readme
├── tsconfig.json              # TypeScript configuration
├── vitest.config.ts           # Vitest test configuration
└── watchlist.txt              # User watchlist (plain text)
```

---

## Source Code Structure (`src/`)

```
src/
├── index.ts                    # CLI entry point (main)
│
├── analysis/                   # Technical analysis module
│   ├── risk-manager.ts        # Risk calculation and management
│   └── technical-indicators.ts # TA indicators (RSI, MACD, etc.)
│
├── backtesting/               # Backtesting framework
│   ├── index.ts               # Module exports
│   ├── README.md              # Backtesting documentation
│   ├── analytics/             # Performance analytics
│   │   ├── equity-curve.ts    # Equity curve tracking
│   │   └── performance-metrics.ts # Metrics calculation
│   ├── data/                  # Backtesting data management
│   │   ├── data-loader.ts     # Historical data loading
│   │   ├── historical-data-manager.ts
│   │   ├── survivorship-bias-guard.ts
│   │   └── types.ts           # Backtesting data types
│   ├── engine/                # Backtest execution
│   │   ├── backtest-engine.ts # Main engine
│   │   ├── event-queue.ts     # Event processing
│   │   ├── simple-backtest-engine.ts
│   │   └── strategy-executor.ts
│   ├── events/                # Event system
│   │   └── event-queue.ts     # Event queue implementation
│   ├── execution/             # Order execution simulation
│   │   ├── commission-models.ts
│   │   ├── fill-simulator.ts  # Order fill simulation
│   │   └── slippage-models.ts # Slippage modeling
│   ├── optimization/          # Parameter optimization
│   │   ├── index.ts           # Optimization exports
│   │   ├── example-configs.ts # Example configurations
│   │   ├── grid-search.ts     # Grid search optimizer
│   │   ├── optimization-report.ts
│   │   ├── parameter-optimizer.ts
│   │   ├── random-search.ts   # Random search optimizer
│   │   ├── types.ts           # Optimization types
│   │   ├── walk-forward.ts    # Walk-forward analysis
│   │   └── examples/          # Example optimization scripts
│   │       └── optimize-rsi-example.ts
│   ├── portfolio/             # Portfolio tracking
│   │   ├── portfolio-tracker.ts # P&L tracking
│   │   ├── position.ts        # Position management
│   │   └── trade.ts           # Trade representation
│   ├── strategies/            # Backtesting strategies
│   │   └── simple-rsi-strategy.ts
│   └── types/                 # Backtesting types
│       └── backtest-types.ts
│
├── cli/                       # CLI command implementations
│   ├── backtest-commands.ts   # Backtest CLI commands
│   ├── backtest-data-commands.ts # Data download commands
│   ├── paper-trading-commands.ts # Paper trading commands
│   └── risk-commands.ts       # Risk management commands
│
├── config/                    # Configuration management
│   └── secure-config.ts       # Encrypted config storage
│
├── data/                      # Market data layer
│   ├── index.ts               # Data module exports
│   ├── types.ts               # Data types (OHLCVData, etc.)
│   ├── cache-manager.ts       # Data caching
│   ├── csv-loader.ts          # CSV data import
│   ├── data-validator.ts      # Data validation
│   ├── market-data-service.ts # Main data service
│   ├── market-data-service-enhanced.ts
│   ├── rate-limiter.ts        # API rate limiting
│   ├── providers/             # Data providers
│   │   ├── alpha-vantage-provider.ts
│   │   ├── finnhub-provider.ts
│   │   └── yahoo-finance-provider.ts
│   └── __tests__/             # Data module tests
│       ├── csv-loader.test.ts
│       ├── data-validator.test.ts
│       └── rate-limiter.test.ts
│
├── discovery/                 # Stock discovery
│   └── stock-discovery.ts     # Discovery engine
│
├── monitoring/                # Market monitoring
│   └── monitoring-service.ts  # Continuous monitoring
│
├── notifications/             # Alert notifications
│   └── alert-service.ts       # Telegram/Email alerts
│
├── paper-trading/             # Paper trading system
│   ├── index.ts               # Module exports
│   ├── api/                   # Paper trading API
│   │   └── paper-trading-api.ts
│   ├── engine/                # Trading engine
│   │   └── paper-trading-engine.ts
│   ├── execution/             # Order execution
│   │   └── execution-simulator.ts
│   ├── journal/               # Trade journaling
│   │   └── trade-journal.ts
│   ├── orders/                # Order management
│   │   └── order-manager.ts
│   ├── performance/           # Performance tracking
│   │   └── performance-calculator.ts
│   ├── portfolio/             # Portfolio management
│   │   └── portfolio-manager.ts
│   ├── risk/                  # Pre-trade risk checks
│   │   └── pre-trade-validator.ts
│   ├── storage/               # Encrypted storage
│   │   └── encrypted-storage.ts
│   └── types/                 # Paper trading types
│       └── paper-trading-types.ts
│
├── risk/                      # Risk management module
│   ├── index.ts               # Module exports
│   ├── alerts/                # Risk alerting
│   │   └── risk-alerter.ts
│   ├── correlation/           # Correlation analysis
│   │   └── correlation-matrix.ts
│   ├── metrics/               # Risk metrics
│   │   ├── cvar-calculator.ts # Conditional VaR
│   │   ├── garch-volatility.ts # GARCH volatility
│   │   └── var-calculator.ts  # Value at Risk
│   ├── position-sizing/       # Position sizing
│   │   └── kelly-criterion.ts # Kelly criterion
│   ├── reporting/             # Risk reports
│   │   └── risk-reporter.ts
│   ├── simulation/            # Monte Carlo simulation
│   ├── stress/                # Stress testing
│   ├── types/                 # Risk types
│   │   └── risk-types.ts
│   ├── validation/            # Pre-trade validation
│   │   └── pre-trade-validator.ts
│   └── __tests__/             # Risk module tests
│       └── performance-benchmarks.test.ts
│
├── strategies/                # Trading strategies
│   ├── mean-reversion-strategy.ts
│   └── momentum-strategy.ts
│
├── types/                     # Shared types
│   └── trading.ts             # Core trading types
│
├── utils/                     # Utility functions
│   ├── logger.ts              # Logging utility
│   └── market-hours.ts        # Market hours validation
│
└── web/                       # Web server
    ├── auth-middleware.ts     # JWT authentication
    └── server.ts              # Express + Socket.IO server
```

---

## Frontend Structure (`web/frontend/`)

```
web/frontend/
├── node_modules/              # Frontend dependencies
├── public/                    # Static public assets
├── src/
│   ├── App.tsx               # Main App component
│   ├── App.css               # App-level styles
│   ├── main.tsx              # React entry point
│   ├── index.css             # Global styles
│   ├── vite-env.d.ts         # Vite type declarations
│   │
│   ├── assets/               # Static assets (images, etc.)
│   │
│   ├── components/           # React components
│   │   ├── layout/           # Layout components
│   │   │   ├── Layout.tsx    # Main layout wrapper
│   │   │   └── Sidebar.tsx   # Navigation sidebar
│   │   ├── charts/           # Chart components
│   │   ├── common/           # Shared components
│   │   └── indicators/       # Technical indicator displays
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useSocket.ts      # Socket.IO hook
│   │   └── ...
│   │
│   ├── pages/                # Page components
│   │   ├── AnalysisPage.tsx  # Stock analysis page
│   │   ├── DiscoveryPage.tsx # Stock discovery page
│   │   ├── HelpPage.tsx      # Help/documentation page
│   │   ├── MarketPage.tsx    # Market overview page
│   │   ├── MonitoringPage.tsx # Monitoring dashboard
│   │   └── SettingsPage.tsx  # Settings page
│   │
│   ├── services/             # API services
│   │   └── api.ts            # API client
│   │
│   ├── stores/               # Zustand state stores
│   │   ├── useTradingStore.ts # Trading data store
│   │   └── useUIStore.ts     # UI state store
│   │
│   ├── styles/               # CSS/styling
│   │   └── ...
│   │
│   ├── types/                # TypeScript types
│   │   └── trading.ts        # Frontend trading types
│   │
│   └── utils/                # Utility functions
│       └── ...
│
├── .eslintrc.cjs             # ESLint configuration
├── index.html                # HTML entry point
├── package.json              # Frontend package config
├── pnpm-lock.yaml            # Lock file
├── postcss.config.js         # PostCSS configuration
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
├── tsconfig.node.json        # Node TypeScript config
└── vite.config.ts            # Vite configuration
```

---

## Test Structure (`tests/`)

```
tests/
├── README.md                  # Test documentation
│
├── backtesting/              # Backtesting tests
│   ├── analytics/
│   │   └── performance-metrics.test.ts
│   ├── data/
│   │   └── data-loader.test.ts
│   ├── engine/
│   │   └── backtest-engine.test.ts
│   ├── execution/
│   │   └── fill-simulator.test.ts
│   ├── optimization/
│   │   └── grid-search.test.ts
│   └── portfolio/
│       └── portfolio-tracker.test.ts
│
├── risk/                     # Risk management tests
│   └── metrics/
│       └── var-calculator.test.ts
│
└── utils/                    # Test utilities
    ├── mock-data-provider.ts # Mock data provider
    ├── mock-market-data.ts   # Mock market data generators
    ├── test-portfolios.ts    # Test portfolio fixtures
    └── test-strategies.ts    # Test strategy fixtures
```

---

## Key File Locations

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| Main package.json | `/package.json` | Backend dependencies |
| Frontend package.json | `/web/frontend/package.json` | Frontend dependencies |
| TypeScript config | `/tsconfig.json` | Backend TS config |
| Biome config | `/biome.json` | Linter/formatter |
| Vitest config | `/vitest.config.ts` | Test configuration |
| Docker config | `/Dockerfile` | Container build |
| Environment template | `/.env.example` | Env var template |

### Core Application Files

| File | Location | Purpose |
|------|----------|---------|
| CLI Entry | `/src/index.ts` | Main CLI application |
| Web Server | `/src/web/server.ts` | Express + Socket.IO |
| Auth Middleware | `/src/web/auth-middleware.ts` | JWT authentication |
| Secure Config | `/src/config/secure-config.ts` | Encrypted config |
| Market Data | `/src/data/market-data-service.ts` | Data fetching |
| Technical Indicators | `/src/analysis/technical-indicators.ts` | TA calculations |
| Discovery | `/src/discovery/stock-discovery.ts` | Stock scanning |
| Monitoring | `/src/monitoring/monitoring-service.ts` | Auto monitoring |

### Frontend Application Files

| File | Location | Purpose |
|------|----------|---------|
| App Entry | `/web/frontend/src/App.tsx` | React app |
| Main Entry | `/web/frontend/src/main.tsx` | React DOM |
| Socket Hook | `/web/frontend/src/hooks/useSocket.ts` | WebSocket |
| Trading Store | `/web/frontend/src/stores/useTradingStore.ts` | State |
| UI Store | `/web/frontend/src/stores/useUIStore.ts` | UI state |

### Type Definitions

| File | Location | Purpose |
|------|----------|---------|
| Core Trading Types | `/src/types/trading.ts` | Signals, Positions, etc. |
| Data Types | `/src/data/types.ts` | OHLCV, Provider interface |
| Backtest Types | `/src/backtesting/types/backtest-types.ts` | Backtest types |
| Risk Types | `/src/risk/types/risk-types.ts` | Risk metrics types |
| Paper Trading Types | `/src/paper-trading/types/paper-trading-types.ts` | Paper trading |
| Frontend Types | `/web/frontend/src/types/trading.ts` | Frontend types |

---

## Naming Conventions

### Files

| Pattern | Convention | Example |
|---------|------------|---------|
| TypeScript source | kebab-case | `market-data-service.ts` |
| React components | PascalCase | `AnalysisPage.tsx` |
| Test files | `*.test.ts` or `*.spec.ts` | `portfolio-tracker.test.ts` |
| Type definition files | Descriptive | `trading.ts`, `types.ts` |
| Config files | lowercase | `biome.json`, `tsconfig.json` |

### Directories

| Pattern | Convention | Example |
|---------|------------|---------|
| Source modules | kebab-case | `paper-trading/`, `risk/` |
| Component groups | kebab-case | `components/layout/` |
| Test directories | Match source | `tests/backtesting/` |

### Exports

| Pattern | Convention | Example |
|---------|------------|---------|
| Classes | PascalCase | `MarketDataService` |
| Functions | camelCase | `generateAuthTokens` |
| Constants | SCREAMING_SNAKE | `RATE_LIMIT_MAX` |
| Types/Interfaces | PascalCase | `Signal`, `TechnicalIndicatorResults` |
| Enums | PascalCase | `MarketRegime` |

---

## Build Output Structure

### Backend (`dist/`)
```
dist/
├── index.js                  # Main entry point
├── index.d.ts                # Type declarations
├── index.js.map              # Source map
├── analysis/
│   ├── risk-manager.js
│   └── technical-indicators.js
├── backtesting/
│   └── ...
├── cli/
│   └── ...
├── config/
│   └── secure-config.js
├── data/
│   └── ...
├── discovery/
│   └── stock-discovery.js
├── monitoring/
│   └── monitoring-service.js
├── notifications/
│   └── alert-service.js
├── paper-trading/
│   └── ...
├── risk/
│   └── ...
├── strategies/
│   └── ...
├── types/
│   └── trading.js
├── utils/
│   └── ...
└── web/
    ├── auth-middleware.js
    └── server.js
```

### Frontend (`web/frontend/dist/` → `web/public/`)
```
web/public/
├── index.html               # SPA entry
├── assets/
│   ├── index-[hash].js      # Main bundle
│   ├── index-[hash].css     # Styles
│   └── ...                  # Additional chunks
└── vite.svg                 # Vite logo (if used)
```

---

## Import Path Conventions

### Backend
- Relative imports with `.js` extension (ESM requirement):
  ```typescript
  import { SecureConfig } from "./config/secure-config.js";
  ```

### Frontend
- Path aliases via `@/`:
  ```typescript
  import { Layout } from '@/components/layout/Layout';
  import { useUIStore } from '@/stores/useUIStore';
  ```
