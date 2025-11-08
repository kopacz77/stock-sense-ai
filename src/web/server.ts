import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";

import { MonitoringService } from "../monitoring/monitoring-service.js";
import { StockDiscovery } from "../discovery/stock-discovery.js";
import { MarketDataService } from "../data/market-data-service.js";
import { SecureConfig } from "../config/secure-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
  private app = express();
  private server = createServer(this.app);
  private io = new SocketIOServer(this.server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  private monitoringService = new MonitoringService();
  private stockDiscovery = new StockDiscovery();
  private marketData = new MarketDataService();
  private config = SecureConfig.getInstance();
  
  private port = 3000;

  constructor(port = 3000) {
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "../../web/public")));
  }

  private setupRoutes(): void {
    // Dashboard API routes
    this.app.get("/api/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Monitoring API
    this.app.get("/api/monitoring/status", async (req, res) => {
      try {
        const stats = await this.monitoringService.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    this.app.post("/api/monitoring/start", async (req, res) => {
      try {
        const { interval, sectors, trending, confidence, maxResults } = req.body;
        
        const monitoringConfig = {
          enabled: true,
          interval: parseInt(interval) || 90,
          markets: ["SP500"] as Array<"SP500" | "NASDAQ" | "DOW">,
          sectors: sectors || [],
          trending: !!trending,
          minConfidence: parseInt(confidence) || 75,
          maxResults: parseInt(maxResults) || 20,
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
    this.app.post("/api/discover", async (req, res) => {
      try {
        const { type, target, config: discoveryConfig } = req.body;
        let results = [];

        switch (type) {
          case "market":
            results = await this.stockDiscovery.discoverByMarket(target, discoveryConfig);
            break;
          case "sector":
            results = await this.stockDiscovery.discoverBySector(target, discoveryConfig);
            break;
          case "trending":
            if (target === 'high-revenue') {
              results = await this.stockDiscovery.discoverHighRevenue(discoveryConfig);
            } else {
              results = await this.stockDiscovery.discoverTrending(discoveryConfig);
            }
            break;
          default:
            res.status(400).json({ error: "Invalid discovery type" });
            return;
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
    this.app.get("/api/analyze/:symbol", async (req, res) => {
      try {
        const { symbol } = req.params;
        const analysisData = await this.marketData.getFullAnalysisData(symbol);
        res.json(analysisData);
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

      // Set up periodic updates
      const updateInterval = setInterval(() => {
        this.sendUpdateToClient(socket);
      }, 30000); // Update every 30 seconds

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
    await this.config.initialize();

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