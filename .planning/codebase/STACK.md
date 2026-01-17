# Stock Sense AI - Technology Stack

## Overview

Stock Sense AI is a secure local stock analysis CLI with advanced trading strategies, backtesting, paper trading, and risk management capabilities. The application features both a CLI interface and a web dashboard.

---

## Runtime Environment

### Node.js
- **Version**: >=18.0.0 (required)
- **Recommended**: 20.x (used in Docker)
- **Module System**: ES Modules (`"type": "module"`)

### Package Manager
- **Primary**: pnpm 8.15.0
- **Frontend**: npm (for web/frontend)

---

## Languages

### TypeScript
- **Backend Version**: 5.8.3
- **Frontend Version**: 5.5.3
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: bundler

#### TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true
  }
}
```

---

## Backend Framework & Libraries

### Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | HTTP server for web dashboard |
| `commander` | ^11.1.0 | CLI framework for command-line interface |
| `socket.io` | ^4.7.4 | Real-time WebSocket communication |

### Data & HTTP
| Package | Version | Purpose |
|---------|---------|---------|
| `axios` | ^1.6.2 | HTTP client for API calls |
| `dotenv` | ^17.2.3 | Environment variable management |

### Security & Authentication
| Package | Version | Purpose |
|---------|---------|---------|
| `jsonwebtoken` | ^9.0.3 | JWT token generation and verification |
| `keytar` | ^7.9.0 | Secure OS keychain access for API key storage |
| `zod` | ^3.22.4 | Runtime schema validation |

### Analysis & Indicators
| Package | Version | Purpose |
|---------|---------|---------|
| `technicalindicators` | ^3.1.0 | Technical analysis calculations (RSI, MACD, etc.) |

### CLI Enhancement
| Package | Version | Purpose |
|---------|---------|---------|
| `chalk` | ^5.3.0 | Terminal string styling |
| `cli-table3` | ^0.6.3 | Table formatting for CLI output |
| `inquirer` | ^9.2.12 | Interactive CLI prompts |
| `ora` | ^7.0.1 | Terminal spinners |

### Notifications
| Package | Version | Purpose |
|---------|---------|---------|
| `@sendgrid/mail` | ^8.1.0 | Email notifications via SendGrid |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `uuid` | ^13.0.0 | UUID generation |
| `cors` | ^2.8.5 | CORS middleware for Express |

---

## Frontend Framework & Libraries

### Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM rendering |
| `react-router-dom` | ^6.26.0 | Client-side routing |

### State Management
| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | ^4.5.0 | Lightweight state management |
| `@tanstack/react-query` | ^5.51.0 | Server state management and caching |

### UI & Styling
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^3.4.4 | Utility-first CSS framework |
| `framer-motion` | ^11.5.0 | Animation library |
| `lucide-react` | ^0.562.0 | Icon library |
| `clsx` | ^2.1.1 | Conditional CSS class utility |
| `react-hot-toast` | ^2.4.1 | Toast notifications |

### Charts & Visualization
| Package | Version | Purpose |
|---------|---------|---------|
| `chart.js` | ^4.4.0 | Charting library |
| `react-chartjs-2` | ^5.2.0 | React wrapper for Chart.js |
| `chartjs-adapter-date-fns` | ^3.0.0 | Date adapter for Chart.js |
| `date-fns` | ^3.6.0 | Date utility library |

### Real-time Communication
| Package | Version | Purpose |
|---------|---------|---------|
| `socket.io-client` | ^4.7.4 | WebSocket client for real-time updates |

---

## Development Tools

### Build Tools
| Tool | Version | Purpose |
|------|---------|---------|
| `vite` | ^5.3.5 | Frontend build tool and dev server |
| `tsx` | ^4.20.3 | TypeScript execution for development |
| `concurrently` | ^9.2.1 | Run multiple scripts simultaneously |

### Code Quality
| Tool | Version | Purpose |
|------|---------|---------|
| `@biomejs/biome` | ^1.9.4 | Linter and formatter (replaces ESLint + Prettier) |
| `eslint` | ^8.57.0 | Frontend linting (via @typescript-eslint) |

### Testing
| Tool | Version | Purpose |
|------|---------|---------|
| `vitest` | ^1.6.1 | Unit and integration testing framework |
| V8 | (built-in) | Code coverage provider |

---

## Configuration Files

### Root Configuration
| File | Purpose |
|------|---------|
| `package.json` | Backend dependencies and scripts |
| `tsconfig.json` | TypeScript compiler configuration |
| `biome.json` | Biome linter/formatter configuration |
| `vitest.config.ts` | Vitest test configuration |
| `.env` / `.env.example` | Environment variables |
| `Dockerfile` | Container build configuration |
| `docker-compose.yml` | Development container orchestration |
| `docker-compose.prod.yml` | Production container orchestration |

### Frontend Configuration
| File | Path | Purpose |
|------|------|---------|
| `package.json` | `web/frontend/` | Frontend dependencies |
| `vite.config.ts` | `web/frontend/` | Vite build configuration |
| `tsconfig.json` | `web/frontend/` | Frontend TypeScript config |
| `tailwind.config.js` | `web/frontend/` | Tailwind CSS configuration |
| `postcss.config.js` | `web/frontend/` | PostCSS configuration |

---

## NPM Scripts

### Backend Scripts
```bash
pnpm build              # Compile TypeScript to dist/
pnpm dev                # Run with tsx (development)
pnpm dev:backend        # Run dashboard with watch mode
pnpm start              # Run compiled code
pnpm lint               # Run Biome linter
pnpm lint:fix           # Fix linting issues
pnpm format             # Format code with Biome
pnpm test               # Run Vitest tests
pnpm test:watch         # Run tests in watch mode
pnpm clean              # Remove dist directory
```

### Frontend Scripts
```bash
npm run dev             # Start Vite dev server
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run ESLint
```

### Combined Scripts
```bash
pnpm dev:all            # Run backend and frontend concurrently
pnpm build:all          # Build backend and frontend
pnpm build:frontend     # Build frontend only
```

---

## Environment Variables

### API Keys
| Variable | Required | Description |
|----------|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | Yes | Alpha Vantage market data API |
| `FINNHUB_API_KEY` | Yes | Finnhub market data API (fallback) |
| `NEWS_API_KEY` | No | News API for market news |

### Notifications
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot for alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram chat destination |
| `SENDGRID_API_KEY` | No | SendGrid email service |
| `SENDGRID_FROM_EMAIL` | No | Email sender address |
| `SENDGRID_TO_EMAIL` | No | Email recipient address |

### Authentication
| Variable | Required | Description |
|----------|----------|-------------|
| `STOCK_SENSE_API_KEY` | No | API key for web dashboard auth |
| `JWT_SECRET` | No | JWT signing secret (auto-generated if not set) |
| `JWT_EXPIRES_IN_SECONDS` | No | Access token expiration (default: 86400) |
| `JWT_REFRESH_EXPIRES_IN_SECONDS` | No | Refresh token expiration (default: 604800) |
| `AUTH_REQUIRED` | No | Set to "true" to require auth for all endpoints |

### Application
| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | No | Environment (development/production) |
| `PORT` | No | Server port (default: 3000) |
| `LOG_LEVEL` | No | Logging verbosity |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated allowed origins |

### Paper Trading
| Variable | Required | Description |
|----------|----------|-------------|
| `PAPER_TRADING_ENABLED` | No | Enable paper trading |
| `PAPER_TRADING_INITIAL_CAPITAL` | No | Starting capital (default: 10000) |

### Risk Management
| Variable | Required | Description |
|----------|----------|-------------|
| `RISK_MAX_POSITION_SIZE_PERCENT` | No | Max position size % (default: 25) |
| `RISK_MAX_DAILY_LOSS_PERCENT` | No | Max daily loss % (default: 5) |

---

## Docker Configuration

### Base Image
- Node.js 20 Alpine

### Build Stages
1. **backend-builder**: Compiles TypeScript backend
2. **frontend-builder**: Builds React frontend with Vite
3. **production**: Minimal production image

### Exposed Port
- 3001 (web dashboard)

### Health Check
- Endpoint: `/api/health`
- Interval: 30s
- Timeout: 10s

---

## Output Artifacts

### Backend Build
- **Output**: `dist/`
- **Entry Point**: `dist/index.js`
- **Binary**: `stock-analyzer` (via npm bin)

### Frontend Build
- **Output**: `web/frontend/dist/`
- **Served From**: `web/public/` (copied during build)
