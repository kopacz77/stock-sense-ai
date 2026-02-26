import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { z } from "zod";

import { MonitoringService } from "../monitoring/monitoring-service.js";
import { StockDiscovery, type DiscoveryResult } from "../discovery/stock-discovery.js";
import { MarketDataService } from "../data/market-data-service.js";
import { SecureConfig } from "../config/secure-config.js";
import { TechnicalIndicators } from "../analysis/technical-indicators.js";
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