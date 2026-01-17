# Stock Sense AI - External Integrations

## Overview

Stock Sense AI integrates with multiple external services for market data, notifications, and secure credential storage. The system uses a provider pattern with automatic failover between data sources.

---

## Market Data APIs

### Alpha Vantage (Primary)

**Provider File**: `src/data/providers/alpha-vantage-provider.ts`

#### Configuration
| Variable | Description |
|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | API key from Alpha Vantage |

#### Rate Limits (Free Tier)
- 5 requests per minute
- 25 requests per day (noted in code, API allows 500)
- Implemented via `src/data/rate-limiter.ts`

#### Endpoints Used

| Endpoint | Function | Purpose |
|----------|----------|---------|
| `TIME_SERIES_DAILY` | `getHistoricalData()` | Historical OHLCV data |
| `TIME_SERIES_DAILY_ADJUSTED` | `fetchHistoricalData()` | Adjusted historical data |
| `GLOBAL_QUOTE` | `getCurrentQuote()` | Real-time quotes |
| `TIME_SERIES_INTRADAY` | `fetchIntradayData()` | Intraday data (1min-60min) |

#### Response Parsing
```typescript
// Historical data parsing
{
  "Time Series (Daily)": {
    "2024-01-15": {
      "1. open": "185.00",
      "2. high": "187.50",
      "3. low": "184.20",
      "4. close": "186.30",
      "5. volume": "45000000"
    }
  }
}
```

#### Error Handling
- Rate limit detection via `Information` field in response
- Automatic failover to Finnhub on rate limit
- Daily reset tracking at midnight UTC

---

### Finnhub (Secondary/Fallback)

**Provider File**: `src/data/providers/finnhub-provider.ts`

#### Configuration
| Variable | Description |
|----------|-------------|
| `FINNHUB_API_KEY` | API key from Finnhub |

#### Usage Pattern
- Automatic fallback when Alpha Vantage rate limit is hit
- Used for real-time quotes and historical candles
- Requires paid tier for some historical data features

#### Features
- Real-time stock quotes
- Company fundamentals
- Historical candlestick data
- Market news (optional)

---

### Yahoo Finance (Tertiary/Free Fallback)

**Provider File**: `src/data/providers/yahoo-finance-provider.ts`

#### Configuration
- No API key required
- Free tier, no rate limits documented

#### Usage Pattern
- Ultimate fallback when both Alpha Vantage and Finnhub fail
- Used for historical data only
- Default fallback for all market data operations

#### Initialization
```typescript
// In MarketDataService constructor
this.yahooFinanceProvider = new YahooFinanceProvider();
```

---

## Data Provider Architecture

**Main Service File**: `src/data/market-data-service.ts`

### Provider Hierarchy
```
1. Alpha Vantage (if API key configured and not rate limited)
   ├── On success: Return data
   └── On rate limit/failure: Try Finnhub

2. Finnhub (if API key configured)
   ├── On success: Return data
   └── On failure: Try Yahoo Finance

3. Yahoo Finance (always available)
   ├── On success: Return data
   └── On failure: Throw error
```

### Caching Strategy
| Cache Type | TTL | Purpose |
|------------|-----|---------|
| Historical Data | 1 hour | Reduce API calls for OHLCV data |
| Quote Data | 4 hours | Derived from historical, rarely needs fresh call |

### Rate Limiting
**File**: `src/data/rate-limiter.ts`

```typescript
interface RateLimiterConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  name: string;
}
```

---

## Notification Services

### Telegram

**Service File**: `src/notifications/alert-service.ts`

#### Configuration
| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Target chat/channel ID |

#### Features
- Real-time signal alerts
- High-confidence opportunity notifications
- Risk warnings
- Market movement alerts

#### Setup Instructions
1. Create bot via @BotFather on Telegram
2. Get bot token
3. Start conversation with bot to get chat ID
4. Configure via `stock-analyzer setup` or environment variables

---

### SendGrid (Email)

**Service File**: `src/notifications/alert-service.ts`

#### Configuration
| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Sender email address |
| `SENDGRID_TO_EMAIL` | Recipient email address |

#### Package
```json
"@sendgrid/mail": "^8.1.0"
```

#### Features
- Email notifications for alerts
- Works alongside Telegram
- Configurable priority levels

---

## Authentication & Security

### JWT Authentication

**Middleware File**: `src/web/auth-middleware.ts`

#### Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | Signing secret |
| `JWT_EXPIRES_IN_SECONDS` | 86400 (24h) | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN_SECONDS` | 604800 (7d) | Refresh token TTL |
| `STOCK_SENSE_API_KEY` | None | API key for login |

#### Authentication Methods
1. **Bearer Token**: `Authorization: Bearer <token>`
2. **API Key Header**: `X-API-Key: <key>`
3. **API Key Query**: `?api_key=<key>`

#### Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Exchange API key for JWT |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Invalidate token |

---

### Secure Configuration Storage

**Config File**: `src/config/secure-config.ts`

#### Storage Methods

##### 1. OS Keychain (Primary)
- Uses `keytar` package
- Accesses system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Most secure option

##### 2. Encrypted File (Fallback)
- File: `.key` and `config.encrypted`
- Encryption: AES-256-GCM
- Key derivation: PBKDF2 (100,000 iterations)

#### Encryption Details
```typescript
// Key derivation
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = "sha256";

// Encryption
// Format: salt:iv:authTag:ciphertext (all hex encoded)
```

#### Config Schema (Zod)
```typescript
const ConfigSchema = z.object({
  apis: z.object({
    alphaVantage: z.string().min(1),
    finnhub: z.string().min(1),
    newsApi: z.string().optional(),
  }),
  notifications: z.object({
    email: z.object({ ... }).optional(),
    telegram: z.object({ ... }).optional(),
    sms: z.object({ ... }).optional(),
  }),
  trading: z.object({
    maxPositionSize: z.number().min(0).max(1).default(0.25),
    maxRiskPerTrade: z.number().min(0).max(0.02).default(0.01),
    enableLiveTrading: z.boolean().default(false),
  }),
});
```

---

## Real-Time Communication

### Socket.IO

**Server File**: `src/web/server.ts`
**Client Hook**: `web/frontend/src/hooks/useSocket.ts`

#### Server Configuration
```typescript
const io = new SocketIOServer(this.server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});
```

#### Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `connection` | Client->Server | Initial connection |
| `disconnect` | Client->Server | Client disconnected |
| `refresh` | Client->Server | Manual data refresh request |
| `update` | Server->Client | Periodic data updates |

#### Update Frequency
- Initial update on connection
- Periodic updates every 5 minutes (respects API rate limits)
- Manual refresh available via `refresh` event

#### Update Payload
```typescript
{
  stats: MonitoringStats,
  opportunities: DiscoveryResult[],
  chartData: ChartData,
  overview: MarketOverview,
  timestamp: Date
}
```

---

## Database / Persistence

### File-Based Storage

The application uses file-based storage rather than a traditional database:

| File/Directory | Purpose |
|----------------|---------|
| `.key` | Encrypted encryption key |
| `config.encrypted` | Encrypted configuration |
| `watchlist.txt` | User watchlist (plain text) |
| `data/cache/` | Cached market data |
| `data/paper-trading/` | Paper trading state |

### Cache Manager

**File**: `src/data/cache-manager.ts`

#### Features
- In-memory caching with configurable TTL
- Persistent cache to disk (optional)
- Cache statistics and monitoring
- Automatic cache expiration

---

## External Service Health Checks

### Health Check Endpoint
**Route**: `GET /api/health`

```typescript
{
  status: "healthy",
  timestamp: ISO8601,
  uptime: seconds,
  version: string,
  environment: string,
  monitoring: {
    isRunning: boolean
  }
}
```

### Provider Health Check
**Method**: `marketData.healthCheck()`

```typescript
{
  alphaVantage: boolean,  // Connection test result
  finnhub: boolean,       // Connection test result
  errors: string[]        // Error messages if any
}
```

---

## CORS Configuration

**Server File**: `src/web/server.ts`

### Allowed Origins
```typescript
const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ];
```

### CORS Settings
- Methods: GET, POST
- Credentials: true
- Custom origin validation function

---

## Rate Limiting

### API Rate Limiting

**Server File**: `src/web/server.ts`

```typescript
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100;       // requests per window
```

### Implementation
- IP-based tracking
- In-memory storage (Map)
- Returns 429 Too Many Requests when exceeded

### Data Provider Rate Limiting

**File**: `src/data/rate-limiter.ts`

- Provider-specific limits
- Per-minute and per-day tracking
- Async wait for availability
- Remaining request tracking
