import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { z } from "zod";

import { MonitoringService } from "../monitoring/monitoring-service.js";
import { StockDiscovery, type DiscoveryResult } from "../discovery/stock-discovery.js";
import { MarketDataService } from "../data/market-data-service.js";
import { SecureConfig } from "../config/secure-config.js";
import { TechnicalIndicators } from "../analysis/technical-indicators.js";
import { JsonlStore } from "../market-intelligence/storage/jsonl-store.js";
import { loadStrategyConfig } from "../strategy/config.js";
import { DecisionLog } from "../strategy/decision-log.js";
import type {
  CandidateCostEvaluation,
  StrategyCandidate,
  StrategyDecisionRecord,
} from "../strategy/types.js";
import type { VixQuote } from "../strategy/vix-provider.js";
import {
  authMiddleware,
  optionalAuthMiddleware,
  generateAuthTokens,
  refreshAccessToken,
  blacklistToken,
  type AuthenticatedRequest,
} from "./auth-middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allowed origins for CORS - configure via environment variable or use defaults
// In production, frontend is served from same origin so we need to include the server port
const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ];

// Input validation schemas
const MonitoringStartSchema = z.object({
  interval: z.union([z.string(), z.number()]).optional().transform(val =>
    val ? Number.parseInt(String(val), 10) : 90
  ),
  sectors: z.array(z.string()).optional().default([]),
  trending: z.boolean().optional().default(false),
  confidence: z.union([z.string(), z.number()]).optional().transform(val =>
    val ? Number.parseInt(String(val), 10) : 75
  ),
  maxResults: z.union([z.string(), z.number()]).optional().transform(val =>
    val ? Number.parseInt(String(val), 10) : 20
  ),
});

// Strategy accept/skip schemas (T-11-07-02) — mirrors MonitoringStartSchema's
// safeParse + 400/details convention. Numbers must be positive+finite so a
// malformed or hostile body can never write NaN/Infinity/negative levels
// into the decision log; note is capped so a skip/accept body can't be used
// to smuggle an oversized payload past the 1mb JSON body limit.
// `force: true` bypasses the CR-02 409 guard below (already-decided
// candidate) for an explicit operator "amend" action; omitted/false is the
// default safe path.
const StrategyAcceptSchema = z.object({
  entry: z.number().positive().finite().optional(),
  target: z.number().positive().finite().optional(),
  stop: z.number().positive().finite().optional(),
  sizeUsd: z.number().positive().finite().optional(),
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

const StrategySkipSchema = z.object({
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

const DiscoverRequestSchema = z.object({
  type: z.enum(["market", "sector", "trending"]),
  target: z.string().min(1).max(50),
  config: z.record(z.unknown()).optional(),
});

const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9.]+$/i, "Invalid stock symbol format"),
});

// Authentication schemas
const LoginSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Environment variable for authentication mode
// Set AUTH_REQUIRED=true to require authentication for all API endpoints
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true";

// Rate limiting map for basic protection
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * T-11-09-01: the redacted mirror of `CandidateCostEvaluation` that reaches
 * the browser. Omits `effectiveTaxRatePct` (a direct read on the
 * operator's personal tax bracket) and every dollar figure that inverts
 * back to it given a known size (`grossRewardUsd`, `afterTaxRewardUsd`,
 * `riskUsd`, `quantity`) — the endpoint sits behind `optionalAuthMiddleware`
 * and may serve an unauthenticated local request.
 */
export type RedactedCostEvaluation = Pick<
  CandidateCostEvaluation,
  | "jurisdiction"
  | "prospectiveSizeUsd"
  | "grossMovePct"
  | "breakEvenPct"
  | "netRewardRisk"
  | "minRewardRisk"
  | "passesBreakEven"
  | "passesRewardRisk"
  | "passes"
  | "taxRateKnown"
  | "washSaleFlag"
>;

/**
 * `null` for a `null` input, otherwise a copy built by naming each KEPT
 * field explicitly — never by deleting keys from a spread, which would
 * leak a field added to `CandidateCostEvaluation` later by default.
 */
export function redactCostEvaluation(
  evaluation: CandidateCostEvaluation | null,
): RedactedCostEvaluation | null {
  if (evaluation === null) return null;
  return {
    jurisdiction: evaluation.jurisdiction,
    prospectiveSizeUsd: evaluation.prospectiveSizeUsd,
    grossMovePct: evaluation.grossMovePct,
    breakEvenPct: evaluation.breakEvenPct,
    netRewardRisk: evaluation.netRewardRisk,
    minRewardRisk: evaluation.minRewardRisk,
    passesBreakEven: evaluation.passesBreakEven,
    passesRewardRisk: evaluation.passesRewardRisk,
    passes: evaluation.passes,
    taxRateKnown: evaluation.taxRateKnown,
    washSaleFlag: evaluation.washSaleFlag,
  };
}

/**
 * CR-02: `GET /api/strategy/candidates` never joined against the decision
 * log, so `StrategyPage` tracked accept/skip purely in local React state —
 * a reload lost it and let the operator re-accept (and silently
 * overwrite) an already-decided candidate. Attach the deduped decision
 * status here so the frontend can hydrate on every load, exported for
 * direct unit testing. Also redacts `costEvaluation` (Plan 11-09,
 * T-11-09-01) so all three of ranked/sub-threshold/shadow are covered by
 * this one change.
 */
export function attachDecisionStatus(
  candidate: StrategyCandidate,
  decisionByCandidateId: Map<string, StrategyDecisionRecord>,
): Omit<StrategyCandidate, "costEvaluation"> & {
  decision: "accept" | "skip" | null;
  costEvaluation: RedactedCostEvaluation | null;
} {
  const decision = decisionByCandidateId.get(candidate.candidateId);
  return {
    ...candidate,
    decision: decision?.decision ?? null,
    costEvaluation: redactCostEvaluation(candidate.costEvaluation),
  };
}

/**
 * Find the current live decision (if any) for `candidate`, reading the
 * decision log from the candidate's own day through today — same
 * `[asOfDate, today]` range as `list-candidates`' decision join
 * (`strategy-commands.ts`), because decisions are filed under the day
 * they were MADE (`decidedAt`), not the candidate's `asOfDate`. Exported
 * for direct unit testing.
 */
export async function findLiveDecisionForCandidate(
  decisionLog: DecisionLog,
  candidate: StrategyCandidate,
): Promise<StrategyDecisionRecord | undefined> {
  const todayIso = new Date().toISOString().split("T")[0] ?? candidate.asOfDate;
  const endIso = todayIso > candidate.asOfDate ? todayIso : candidate.asOfDate;
  const decisions = await decisionLog.readDedupedByCandidateId(candidate.asOfDate, endIso);
  return decisions.find((d) => d.candidateId === candidate.candidateId);
}
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

export class WebServer {
  private app = express();
  private server = createServer(this.app);
  private io = new SocketIOServer(this.server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  private monitoringService = new MonitoringService();
  private stockDiscovery = new StockDiscovery();
  private marketData = new MarketDataService();
  private config = SecureConfig.getInstance();

  // Strategy dashboard route (11-07) — same data directory the strategy CLI
  // defaults to; read-only against candidates-*.jsonl / vix-cache.json,
  // writes only through DecisionLog (never a duplicate record-construction
  // path — T-11-07-01 key_link).
  private readonly strategyDataDir = "./data/strategy";

  private port = 3001;

  constructor(port = 3001) {
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    // CORS with restricted origins
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST"],
    }));

    this.app.use(express.json({ limit: "1mb" }));

    // Rate limiting middleware
    this.app.use((req, res, next) => {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const clientData = rateLimitMap.get(clientIp);

      if (!clientData || now > clientData.resetTime) {
        rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
      }

      if (clientData.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }

      clientData.count++;
      next();
    });

    this.app.use(express.static(path.join(__dirname, "../../web/public")));
  }

  private setupRoutes(): void {
    // ==========================================
    // Public routes (no authentication required)
    // ==========================================

    // Health check endpoint (used by Docker HEALTHCHECK)
    this.app.get("/api/health", async (req, res) => {
      const stats = await this.monitoringService?.getStats();
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        monitoring: {
          isRunning: stats?.isRunning || false,
        },
      });
    });

    // ==========================================
    // Authentication routes
    // ==========================================

    // Login - exchange API key for JWT tokens
    this.app.post("/api/auth/login", async (req, res): Promise<void> => {
      try {
        const parseResult = LoginSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request",
            details: parseResult.error.issues,
          });
          return;
        }

        const { apiKey } = parseResult.data;
        const expectedApiKey = process.env.STOCK_SENSE_API_KEY;

        // Validate API key
        if (!expectedApiKey) {
          res.status(503).json({
            error: "Authentication not configured",
            hint: "Set STOCK_SENSE_API_KEY environment variable",
          });
          return;
        }

        if (apiKey !== expectedApiKey) {
          res.status(401).json({
            error: "Invalid API key",
            code: "INVALID_CREDENTIALS",
          });
          return;
        }

        // Generate tokens
        const tokens = generateAuthTokens("default-user", "admin");
        res.json({
          success: true,
          ...tokens,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Refresh token endpoint
    this.app.post("/api/auth/refresh", async (req, res): Promise<void> => {
      try {
        const parseResult = RefreshTokenSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request",
            details: parseResult.error.issues,
          });
          return;
        }

        const { refreshToken } = parseResult.data;
        const result = refreshAccessToken(refreshToken);

        if (!result) {
          res.status(401).json({
            error: "Invalid or expired refresh token",
            code: "INVALID_REFRESH_TOKEN",
          });
          return;
        }

        res.json({
          success: true,
          ...result,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Logout - invalidate token
    this.app.post("/api/auth/logout", (req: AuthenticatedRequest, res): void => {
      const authHeader = req.headers.authorization;

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        blacklistToken(token);
      }

      res.json({ success: true, message: "Logged out successfully" });
    });

    // ==========================================
    // Protected routes (authentication optional by default,
    // set AUTH_REQUIRED=true to enforce)
    // ==========================================

    // Apply authentication middleware to all /api routes except auth routes
    if (AUTH_REQUIRED) {
      this.app.use("/api", (req, res, next) => {
        // Skip auth routes
        if (req.path.startsWith("/auth/") || req.path === "/health") {
          return next();
        }
        return authMiddleware(req as AuthenticatedRequest, res, next);
      });
    } else {
      // Optional auth - attaches user if authenticated but doesn't block
      this.app.use("/api", (req, res, next) => {
        if (req.path.startsWith("/auth/") || req.path === "/health") {
          return next();
        }
        return optionalAuthMiddleware(req as AuthenticatedRequest, res, next);
      });
    }

    // Monitoring API
    this.app.get("/api/monitoring/status", async (req, res) => {
      try {
        const stats = await this.monitoringService.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.post("/api/monitoring/start", async (req, res): Promise<void> => {
      try {
        // Validate input with Zod schema
        const parseResult = MonitoringStartSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request parameters",
            details: parseResult.error.issues,
          });
          return;
        }

        const { interval, sectors, trending, confidence, maxResults } = parseResult.data;

        const monitoringConfig = {
          enabled: true,
          interval,
          markets: ["SP500"] as Array<"SP500" | "NASDAQ" | "DOW">,
          sectors: sectors as Array<"FINANCE" | "HEALTHCARE" | "ENERGY" | "TECHNOLOGY" | "CONSUMER" | "INDUSTRIAL">,
          trending,
          minConfidence: confidence,
          maxResults,
          alertThreshold: 85,
          respectApiLimits: true,
          maxDailyScans: 50,
        };

        await this.monitoringService.start(monitoringConfig);
        res.json({ success: true, message: "Monitoring started successfully" });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.post("/api/monitoring/stop", async (req, res) => {
      try {
        await this.monitoringService.stop();
        res.json({ success: true, message: "Monitoring stopped successfully" });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.get("/api/monitoring/opportunities", async (req, res) => {
      try {
        const opportunities = await this.monitoringService.getOpportunities();
        res.json(opportunities);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.get("/api/monitoring/chart-data", async (req, res) => {
      try {
        const hours = Number.parseInt(req.query.hours as string) || 24;
        const data = await this.monitoringService.getChartData(hours);
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.get("/api/monitoring/results", async (req, res) => {
      try {
        const limit = Number.parseInt(req.query.limit as string) || 50;
        const results = await this.monitoringService.getRecentResults(limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Discovery API
    this.app.post("/api/discover", async (req, res): Promise<void> => {
      try {
        // Validate input with Zod schema
        const parseResult = DiscoverRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request parameters",
            details: parseResult.error.issues,
          });
          return;
        }

        const { type, target, config: discoveryConfig } = parseResult.data;
        const defaultConfig = { minConfidence: 70, maxResults: 20, strategies: ["mean-reversion", "momentum"] as const };
        const config = discoveryConfig ? { ...defaultConfig, ...discoveryConfig } : defaultConfig;
        let results: DiscoveryResult[] = [];

        switch (type) {
          case "market":
            results = await this.stockDiscovery.discoverByMarket(target as "SP500" | "NASDAQ" | "DOW", config);
            break;
          case "sector":
            results = await this.stockDiscovery.discoverBySector(target as "FINANCE" | "HEALTHCARE" | "ENERGY" | "TECHNOLOGY" | "CONSUMER" | "INDUSTRIAL" | "GROWTH", config);
            break;
          case "trending":
            if (target === 'high-revenue') {
              results = await this.stockDiscovery.discoverHighRevenue(config);
            } else {
              results = await this.stockDiscovery.discoverTrending(config);
            }
            break;
        }

        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.get("/api/market/overview", async (req, res) => {
      try {
        const overview = await this.stockDiscovery.getMarketOverview();
        res.json(overview);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Analysis API
    this.app.get("/api/analyze/:symbol", async (req, res): Promise<void> => {
      try {
        // Validate symbol parameter
        const parseResult = SymbolParamSchema.safeParse(req.params);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid stock symbol",
            details: parseResult.error.issues,
          });
          return;
        }

        const { symbol } = parseResult.data;
        const analysisData = await this.marketData.getFullAnalysisData(symbol.toUpperCase());
        res.json(analysisData);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Technical Indicators API - Full analysis with all indicators
    this.app.get("/api/indicators/:symbol", async (req, res): Promise<void> => {
      try {
        const parseResult = SymbolParamSchema.safeParse(req.params);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid stock symbol",
            details: parseResult.error.issues,
          });
          return;
        }

        const { symbol } = parseResult.data;
        const historicalData = await this.marketData.getHistoricalData(symbol.toUpperCase(), "compact");

        // Convert to the format TechnicalIndicators expects
        const priceData = {
          open: historicalData.map(d => d.open).reverse(),
          high: historicalData.map(d => d.high).reverse(),
          low: historicalData.map(d => d.low).reverse(),
          close: historicalData.map(d => d.close).reverse(),
          volume: historicalData.map(d => d.volume).reverse(),
        };

        const indicators = await TechnicalIndicators.calculate(priceData);
        const interpretation = TechnicalIndicators.getIndicatorInterpretation(indicators);

        res.json({
          symbol: symbol.toUpperCase(),
          timestamp: new Date().toISOString(),
          indicators,
          interpretation,
          currentPrice: historicalData[0]?.close || 0,
          priceChange: historicalData.length >= 2
            ? ((historicalData[0]?.close || 0) - (historicalData[1]?.close || 0)) / (historicalData[1]?.close || 1) * 100
            : 0,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // System Settings API - Get current configuration
    this.app.get("/api/settings", async (_req, res) => {
      try {
        const stats = await this.monitoringService.getStats();
        const healthCheck = await this.marketData.healthCheck();

        res.json({
          monitoring: {
            isRunning: stats?.isRunning || false,
            interval: 90, // Default interval in seconds
            lastScan: stats?.lastScanTime?.toISOString() || null,
            totalScans: stats?.totalScans || 0,
          },
          dataProviders: {
            alphaVantage: healthCheck.alphaVantage,
            finnhub: healthCheck.finnhub,
            errors: healthCheck.errors,
          },
          features: {
            technicalIndicators: true,
            rsi: true,
            macd: true,
            bollingerBands: true,
            movingAverages: true,
            volumeProfile: true,
            marketRegime: true,
            stochastic: true,
            cci: true,
            williamsR: true,
            atr: true,
          },
          riskMetrics: {
            varEnabled: true,
            cvarEnabled: true,
            volatilityAnalysis: true,
          },
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // ==========================================
    // Strategy API (11-07) — minimal /strategy dashboard route.
    // Registered here, after the /api auth-middleware block above, so these
    // routes inherit the exact same access level as /api/monitoring/* —
    // authMiddleware when AUTH_REQUIRED, optionalAuthMiddleware otherwise.
    // No separate mount path, no route-level opt-out (T-11-07-01).
    // ==========================================

    // GET /api/strategy/candidates?date=YYYY-MM-DD
    // Reads the persisted candidates-*.jsonl for the date rather than
    // re-running the engine — a browser request must never trigger a
    // multi-second live engine run with real provider fetches (T-11-07-05).
    this.app.get("/api/strategy/candidates", async (req, res): Promise<void> => {
      try {
        const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
        if (dateParam !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
          res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
          return;
        }
        const asOfDate = dateParam ?? (new Date().toISOString().split("T")[0] ?? "");
        const date = new Date(`${asOfDate}T00:00:00.000Z`);

        const candidatesStore = new JsonlStore<StrategyCandidate>(this.strategyDataDir, "candidates");
        const candidates = await candidatesStore.readDay(date);

        if (candidates.length === 0) {
          // No run persisted for this date at all — the honest empty state
          // (D-14's web equivalent): "no run yet", not "ran and found
          // nothing." Do not backfill placeholder cards.
          res.json({
            asOfDate,
            generated: false,
            vix: null,
            ranked: [],
            subThreshold: [],
            shadow: [],
            skippedTypes: [],
          });
          return;
        }

        // CR-02: join the latest decision per candidate so a page reload
        // hydrates already-accepted/skipped cards instead of losing that
        // state and letting the operator re-accept over their own prior
        // decision. Same [asOfDate, today] range as list-candidates'
        // decision join (strategy-commands.ts) — decisions are filed under
        // the day they were MADE, not the candidate's asOfDate.
        const decisionLog = new DecisionLog({ strategyDataDir: this.strategyDataDir });
        const todayIso = new Date().toISOString().split("T")[0] ?? asOfDate;
        const decisionRecords = await decisionLog.readDedupedByCandidateId(
          asOfDate,
          todayIso > asOfDate ? todayIso : asOfDate,
        );
        const decisionByCandidateId = new Map(decisionRecords.map((d) => [d.candidateId, d]));

        const ranked = candidates
          .filter((c) => c.mode === "ranked")
          .map((c) => attachDecisionStatus(c, decisionByCandidateId));
        const subThreshold = candidates
          .filter((c) => c.mode === "sub-threshold")
          .map((c) => attachDecisionStatus(c, decisionByCandidateId));
        const shadow = candidates
          .filter((c) => c.mode === "shadow")
          .map((c) => attachDecisionStatus(c, decisionByCandidateId));

        // Prefer the VIX quote StrategyEngine cached for this exact date;
        // fall back to reconstructing it from any persisted candidate's own
        // vix* fields (every candidate from one run shares the same quote)
        // so a cache-file miss never hides the VIX header.
        let vix: VixQuote | null = null;
        try {
          const cacheRaw = await fs.readFile(
            path.join(this.strategyDataDir, "vix-cache.json"),
            "utf8",
          );
          const cache = JSON.parse(cacheRaw) as Record<string, VixQuote>;
          vix = cache[asOfDate] ?? null;
        } catch {
          vix = null;
        }
        if (!vix) {
          const any = candidates[0];
          if (any) {
            vix = {
              date: asOfDate,
              close: any.vixCloseAtGeneration,
              regime: any.vixRegime,
              source: any.vixSource,
              fetchedAt: any.generatedAt,
            };
          }
        }

        res.json({
          asOfDate,
          generated: true,
          vix,
          ranked,
          subThreshold,
          shadow,
          // skippedTypes is a run-time-only field on StrategyRunResult — the
          // engine never persists it to candidates-*.jsonl (only the CLI
          // prints it). Always empty here until a future plan persists it.
          skippedTypes: [] as Array<{ signalType: string; reason: string }>,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // POST /api/strategy/candidates/:id/accept
    this.app.post("/api/strategy/candidates/:id/accept", async (req, res): Promise<void> => {
      try {
        const parseResult = StrategyAcceptSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request parameters",
            details: parseResult.error.issues,
          });
          return;
        }
        const { entry, target, stop, sizeUsd, note, force } = parseResult.data;

        const decisionLog = new DecisionLog({ strategyDataDir: this.strategyDataDir });
        const candidate = await decisionLog.findCandidate(req.params.id);
        if (!candidate) {
          res.status(404).json({ error: `Unknown candidateId "${req.params.id}"` });
          return;
        }

        // CR-02: the web path (unlike the CLI, which already permits
        // re-accept) has no confirmation step — a page reload could
        // otherwise silently overwrite an operator's earlier accept/skip.
        // Require an explicit force:true to amend an already-decided
        // candidate.
        const existingDecision = await findLiveDecisionForCandidate(decisionLog, candidate);
        if (existingDecision && !force) {
          res.status(409).json({
            error:
              `candidateId "${req.params.id}" already has a "${existingDecision.decision}" decision ` +
              `recorded at ${existingDecision.decidedAt}` +
              `${existingDecision.closedAt ? ` (closed at ${existingDecision.closedAt})` : ""}. ` +
              "Pass force: true to record a new decision anyway.",
            decision: existingDecision,
          });
          return;
        }

        if (sizeUsd !== undefined) {
          // The web form has no confirmation step, so unlike the CLI (which
          // warns and proceeds) this boundary is enforced hard (T-11-07-02).
          const config = await loadStrategyConfig();
          const maxRegimeSizeUsd =
            Math.max(...Object.values(config.regimeSizePct)) * config.assumedEquity;
          const cap = maxRegimeSizeUsd * 2;
          if (sizeUsd > cap) {
            res.status(400).json({
              error: `sizeUsd ${sizeUsd} exceeds the 2x safety cap of ${cap} (largest regime size ${maxRegimeSizeUsd} for assumedEquity ${config.assumedEquity})`,
            });
            return;
          }
        }

        // Same DecisionLog.recordAccept the CLI calls — no duplicate
        // record-construction logic in the web layer (key_link).
        const record = await decisionLog.recordAccept(
          candidate,
          { entry, target, stop, size: sizeUsd },
          note,
        );
        res.json({ success: true, record });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // POST /api/strategy/candidates/:id/skip
    this.app.post("/api/strategy/candidates/:id/skip", async (req, res): Promise<void> => {
      try {
        const parseResult = StrategySkipSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request parameters",
            details: parseResult.error.issues,
          });
          return;
        }
        const { note, force } = parseResult.data;

        const decisionLog = new DecisionLog({ strategyDataDir: this.strategyDataDir });
        const candidate = await decisionLog.findCandidate(req.params.id);
        if (!candidate) {
          res.status(404).json({ error: `Unknown candidateId "${req.params.id}"` });
          return;
        }

        // CR-02: same guard as accept — the web path has no confirmation
        // step, so a reload could otherwise silently overwrite an
        // operator's earlier accept/skip.
        const existingDecision = await findLiveDecisionForCandidate(decisionLog, candidate);
        if (existingDecision && !force) {
          res.status(409).json({
            error:
              `candidateId "${req.params.id}" already has a "${existingDecision.decision}" decision ` +
              `recorded at ${existingDecision.decidedAt}` +
              `${existingDecision.closedAt ? ` (closed at ${existingDecision.closedAt})` : ""}. ` +
              "Pass force: true to record a new decision anyway.",
            decision: existingDecision,
          });
          return;
        }

        // Same DecisionLog.recordSkip the CLI calls.
        const record = await decisionLog.recordSkip(candidate, note);
        res.json({ success: true, record });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    // Serve the dashboard
    this.app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../../web/public/index.html"));
    });
  }

  private activeIntervals = new Set<NodeJS.Timeout>();

  private setupSocketHandlers(): void {
    this.io.on("connection", (socket) => {
      console.log("Dashboard client connected:", socket.id);

      // Send initial data
      this.sendUpdateToClient(socket);

      // Set up periodic updates - 5 minutes to respect API rate limits
      // Market overview is cached for 10 min, so 5 min refresh is plenty
      const updateInterval = setInterval(() => {
        this.sendUpdateToClient(socket);
      }, 5 * 60 * 1000); // Update every 5 minutes (was 30 seconds!)

      // Track the interval for cleanup
      this.activeIntervals.add(updateInterval);

      socket.on("disconnect", () => {
        console.log("Dashboard client disconnected:", socket.id);
        clearInterval(updateInterval);
        this.activeIntervals.delete(updateInterval);
      });

      // Handle manual refresh requests
      socket.on("refresh", () => {
        this.sendUpdateToClient(socket);
      });
    });
  }

  private async sendUpdateToClient(socket: any): Promise<void> {
    try {
      const [stats, opportunities, chartData, overview] = await Promise.all([
        this.monitoringService.getStats(),
        this.monitoringService.getOpportunities(),
        this.monitoringService.getChartData(6), // Last 6 hours
        this.stockDiscovery.getMarketOverview(),
      ]);

      socket.emit("update", {
        stats,
        opportunities: opportunities.slice(0, 20),
        chartData,
        overview,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Failed to send update to client:", error);
    }
  }

  async start(): Promise<void> {
    // Initialize config first so API keys are available
    await this.config.initialize();

    // Now initialize market data service with the loaded config
    await this.marketData.initialize();

    // Config and market data service are now initialized

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🌐 Web dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping web server...");
    
    // Clear all active intervals
    for (const interval of this.activeIntervals) {
      clearInterval(interval);
    }
    this.activeIntervals.clear();
    
    // Close all Socket.IO connections
    this.io.close();
    
    // Stop monitoring service if running
    try {
      await this.monitoringService.stop();
    } catch (error) {
      console.log("Monitoring service already stopped or error:", error instanceof Error ? error.message : String(error));
    }
    
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("🛑 Web server stopped");
        resolve();
      });
    });
  }
}