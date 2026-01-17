# Stock Sense AI - Code Conventions

## Overview

This document describes the coding conventions, patterns, and standards used throughout the Stock Sense AI codebase. Following these conventions ensures consistency and maintainability.

---

## TypeScript Configuration

### Strict Mode Settings

The project enforces strict TypeScript settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true
  }
}
```

### Module System

- **ES Modules** (`"type": "module"` in package.json)
- Import paths require `.js` extension for relative imports
- Use `import type` for type-only imports

```typescript
// Correct
import { SecureConfig } from "./config/secure-config.js";
import type { Signal } from "./types/trading.js";

// Incorrect
import { SecureConfig } from "./config/secure-config";  // Missing .js
```

---

## Code Style (Biome)

### Configuration

Biome replaces ESLint and Prettier. See `biome.json`:

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  }
}
```

### Key Rules

| Rule | Setting | Purpose |
|------|---------|---------|
| `noVar` | error | Use `const` or `let` |
| `useConst` | error | Prefer `const` over `let` |
| `useTemplate` | error | Use template literals |
| `noExplicitAny` | warn | Avoid `any` type |
| `noConsoleLog` | warn | Avoid console.log in production |
| `noDoubleEquals` | error | Use `===` and `!==` |

### Running Lint/Format

```bash
pnpm lint              # Check for issues
pnpm lint:fix          # Fix auto-fixable issues
pnpm format            # Format code
```

---

## Naming Conventions

### Variables and Functions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `marketData`, `isConfigured` |
| Functions | camelCase | `calculatePosition`, `getHistoricalData` |
| Boolean variables | is/has/can prefix | `isRunning`, `hasError`, `canTrade` |
| Private members | no underscore | Use TypeScript `private` |

### Classes and Types

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `MarketDataService`, `RiskManager` |
| Interfaces | PascalCase | `Signal`, `TechnicalIndicatorResults` |
| Type aliases | PascalCase | `ConfigType`, `OHLCVData` |
| Enums | PascalCase | (not commonly used, prefer unions) |
| Generic parameters | Single uppercase | `T`, `K`, `V` |

### Constants

| Type | Convention | Example |
|------|------------|---------|
| Module constants | SCREAMING_SNAKE_CASE | `RATE_LIMIT_MAX`, `JWT_SECRET` |
| Enum-like objects | SCREAMING_SNAKE_CASE | `MarketRegime.BULLISH_TREND` |
| Configuration defaults | SCREAMING_SNAKE_CASE | `DAILY_LIMIT`, `CACHE_DURATION` |

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| Source files | kebab-case | `market-data-service.ts` |
| React components | PascalCase | `AnalysisPage.tsx` |
| Test files | `*.test.ts` | `portfolio-tracker.test.ts` |
| Directories | kebab-case | `paper-trading/`, `risk/` |

---

## Class Patterns

### Service Classes

Services follow a consistent pattern:

```typescript
export class MarketDataService {
  // Private fields
  private apiKey: string | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private initialized = false;

  // Constructor
  constructor() {
    this.initializeApiKey();
  }

  // Public async initialization
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // ... initialization logic
    this.initialized = true;
  }

  // Public methods
  async getHistoricalData(symbol: string): Promise<HistoricalData[]> {
    // ...
  }

  // Private helper methods
  private async fetchFromAlphaVantage(): Promise<HistoricalData[]> {
    // ...
  }
}
```

### Singleton Pattern

Used for global configuration:

```typescript
export class SecureConfig {
  private static instance: SecureConfig;
  private config: ConfigType | null = null;

  private constructor() {}

  static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }
}
```

### Strategy Classes

Trading strategies follow this interface:

```typescript
export class MeanReversionStrategy {
  private readonly name = "MEAN_REVERSION";

  constructor(private config: MeanReversionConfig) {
    this.validateConfig();
  }

  async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> {
    // Main analysis logic
  }

  getName(): string { return this.name; }
  getConfig(): MeanReversionConfig { return { ...this.config }; }
  updateConfig(newConfig: Partial<MeanReversionConfig>): void { ... }
}
```

---

## Function Patterns

### Async Functions

Always use async/await over raw promises:

```typescript
// Preferred
async function fetchData(symbol: string): Promise<HistoricalData[]> {
  try {
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch ${symbol}: ${error.message}`);
  }
}

// Avoid
function fetchData(symbol: string): Promise<HistoricalData[]> {
  return axios.get(url, { params })
    .then(response => response.data)
    .catch(error => { throw new Error(...) });
}
```

### Error Handling

Consistent error handling pattern:

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  // Type guard for Error
  if (error instanceof Error) {
    console.error(`Operation failed: ${error.message}`);
    throw new Error(`Descriptive message: ${error.message}`);
  }
  // Handle non-Error throws
  throw new Error(`Operation failed: Unknown error`);
}
```

### Guard Clauses

Use early returns for validation:

```typescript
async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> {
  // Guard clause
  if (historicalData.length < 50) {
    throw new Error("Insufficient historical data (minimum 50 periods required)");
  }

  // Main logic continues...
}
```

---

## Type Patterns

### Interface Definitions

Group related properties, use optional for non-required:

```typescript
export interface Signal {
  // Required fields
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  strategy: string;
  indicators: TechnicalIndicatorResults;
  confidence: number;
  reasons: string[];
  timestamp: Date;

  // Optional fields
  stopLoss?: number;
  takeProfit?: number;
  positionSize?: number;
  entryPrice?: number;
  riskAmount?: number;
}
```

### Union Types

Prefer union types over enums:

```typescript
// Preferred
type MarketRegimeType = "BULLISH_TREND" | "BEARISH_TREND" | "SIDEWAYS" | "VOLATILE";
type SignalAction = "BUY" | "SELL" | "HOLD";

// Less preferred
enum MarketRegimeType {
  BULLISH_TREND = "BULLISH_TREND",
  // ...
}
```

### Generic Types

Use generics for reusable functions:

```typescript
// Config accessor with generic return type
get<T = any>(path: string): T {
  if (!this.config) throw new Error("Config not initialized");
  return path.split(".").reduce((obj, key) => obj?.[key], this.config as any) as T;
}

// Usage
const apiKey = config.get<string>("apis.alphaVantage");
```

---

## Validation Patterns

### Zod Schema Validation

Used for runtime validation:

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  apis: z.object({
    alphaVantage: z.string().min(1, "Alpha Vantage API key is required"),
    finnhub: z.string().min(1, "Finnhub API key is required"),
  }),
  trading: z.object({
    maxPositionSize: z.number().min(0).max(1).default(0.25),
    maxRiskPerTrade: z.number().min(0).max(0.02).default(0.01),
  }),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

// Usage
const validated = ConfigSchema.parse(config);
```

### API Input Validation

Validate API inputs with Zod:

```typescript
const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9.]+$/i, "Invalid stock symbol format"),
});

app.get("/api/analyze/:symbol", async (req, res): Promise<void> => {
  const parseResult = SymbolParamSchema.safeParse(req.params);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid stock symbol",
      details: parseResult.error.issues,
    });
    return;
  }
  // Continue with validated data
  const { symbol } = parseResult.data;
});
```

### Config Validation

Validate configuration on class construction:

```typescript
constructor(private config: MeanReversionConfig) {
  this.validateConfig();
}

private validateConfig(): void {
  const { rsiOversold, rsiOverbought, minConfidence } = this.config;

  if (rsiOversold >= rsiOverbought) {
    throw new Error("RSI oversold threshold must be less than overbought threshold");
  }
  if (minConfidence < 0 || minConfidence > 100) {
    throw new Error("Minimum confidence must be between 0 and 100");
  }
}
```

---

## Express API Patterns

### Route Handler Pattern

Express route handlers with proper typing:

```typescript
this.app.get("/api/monitoring/status", async (req, res) => {
  try {
    const stats = await this.monitoringService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// For handlers that may return early, use Promise<void> return type
this.app.post("/api/auth/login", async (req, res): Promise<void> => {
  // Validation
  const parseResult = LoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request" });
    return;  // Early return
  }
  // Continue...
});
```

### Middleware Pattern

Authentication middleware:

```typescript
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip for certain paths
  if (req.path === "/api/health") {
    next();
    return;
  }

  // Validate token
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Attach user and continue
  req.user = verifyToken(token);
  next();
}
```

---

## React Patterns (Frontend)

### Component Structure

```typescript
// Functional component with hooks
export function MonitoringPage() {
  // Hooks at the top
  const { stats, opportunities } = useTradingStore();
  const [filter, setFilter] = useState<string>('all');

  // Effects
  useEffect(() => {
    // ...
  }, [dependencies]);

  // Event handlers
  const handleFilterChange = (value: string) => {
    setFilter(value);
  };

  // Render
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
}
```

### Custom Hooks

```typescript
// useSocket.ts
export function useSocket() {
  const setStats = useTradingStore((state) => state.setStats);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('update', (data) => {
      setStats(data.stats);
    });

    return () => {
      socket.disconnect();
    };
  }, [setStats]);
}
```

### Zustand Store Pattern

```typescript
interface UIState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'monitoring',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
```

---

## Documentation Patterns

### JSDoc Comments

Use JSDoc for public APIs:

```typescript
/**
 * Fetch historical daily data with automatic failover
 * Tries Alpha Vantage first, falls back to Finnhub on rate limit
 *
 * @param symbol - Stock ticker symbol
 * @param outputSize - "compact" (100 days) or "full" (20+ years)
 * @returns Array of historical data sorted by date descending
 * @throws Error if all providers fail
 */
async getHistoricalData(
  symbol: string,
  outputSize: "compact" | "full" = "full"
): Promise<HistoricalData[]> {
  // ...
}
```

### Inline Comments

Use for complex logic explanation:

```typescript
// Derive quote from historical data - NO ADDITIONAL API CALL
// This is the key optimization: we get all data from TIME_SERIES_DAILY
private deriveQuoteFromHistorical(symbol: string, historical: HistoricalData[]): MarketData {
  // ...
}
```

### TODO Comments

Format for future work:

```typescript
// TODO: Fix type mismatches in backtest-commands.ts before enabling
// import { registerBacktestCommands } from "./cli/backtest-commands.js";
```

---

## Error Messages

### User-Facing Errors

Clear, actionable messages:

```typescript
// Good
throw new Error("Insufficient historical data for analysis (minimum 50 periods required)");
throw new Error("Alpha Vantage API key not configured. Run 'stock-analyzer setup' first.");

// Avoid
throw new Error("Error");
throw new Error("Invalid input");
```

### Logging

Consistent logging patterns:

```typescript
// Info level
console.info("Finnhub provider initialized from environment variable");

// Warning level
console.warn("Keytar not available, using file-based key storage (less secure)");
console.warn(`Alpha Vantage error for ${symbol}: ${errorMessage}, trying Finnhub`);

// Error level
console.error("Error loading config:", error);
```

---

## Import Organization

### Import Order (enforced by Biome)

1. Built-in Node.js modules
2. External packages
3. Internal modules (absolute paths)
4. Internal modules (relative paths)
5. Type imports

```typescript
// Node.js built-ins
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

// External packages
import axios from "axios";
import { z } from "zod";
import chalk from "chalk";

// Internal absolute imports
import { SecureConfig } from "./config/secure-config.js";
import { MarketDataService } from "./data/market-data-service.js";

// Internal relative imports
import { RateLimiter } from "../rate-limiter.js";

// Type imports
import type { Signal, HistoricalData } from "./types/trading.js";
```

---

## Test Conventions

### Test File Structure

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("PortfolioTracker", () => {
  let tracker: PortfolioTracker;

  beforeEach(() => {
    tracker = new PortfolioTracker(100000);
  });

  describe("processFill", () => {
    it("should update position on buy fill", () => {
      // Arrange
      const fill = createBuyFill();

      // Act
      tracker.processFill(fill);

      // Assert
      expect(tracker.getPosition("AAPL")).toBeDefined();
    });

    it("should throw error for insufficient cash", () => {
      // Arrange
      const largeBuyOrder = createLargeBuyOrder();

      // Act & Assert
      expect(() => tracker.processFill(largeBuyOrder)).toThrow("Insufficient cash");
    });
  });
});
```

### Naming

- Test files: `*.test.ts` or `*.spec.ts`
- Describe blocks: Class/function name
- It blocks: "should [expected behavior]"
