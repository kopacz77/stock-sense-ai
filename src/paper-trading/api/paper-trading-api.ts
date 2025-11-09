/**
 * Web Dashboard API for Paper Trading
 * REST API endpoints for web interface integration
 */

import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { PaperTradingEngine } from "../engine/paper-trading-engine.js";
import type { PaperTradingConfig } from "../types/paper-trading-types.js";

/**
 * Paper Trading API Server
 * Provides REST endpoints for web dashboard
 */
export class PaperTradingAPI {
  private app: Express;
  private server: any;

  constructor(private engine: PaperTradingEngine, private port: number = 3000) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Error handler
    this.app.use(
      (
        err: Error,
        req: Request,
        res: Response,
        next: express.NextFunction
      ) => {
        console.error(err.stack);
        res.status(500).json({ error: err.message });
      }
    );
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Get engine status
    this.app.get("/api/paper/status", (req, res) => {
      try {
        const status = this.engine.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get portfolio
    this.app.get("/api/paper/portfolio", (req, res) => {
      try {
        const portfolio = this.engine.getPortfolio();

        // Convert Map to array for JSON serialization
        const positions = Array.from(portfolio.positions.entries()).map(
          ([symbol, position]) => ({
            symbol,
            ...position,
          })
        );

        res.json({
          ...portfolio,
          positions,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get active orders
    this.app.get("/api/paper/orders", (req, res) => {
      try {
        const orders = this.engine.getOrders();

        // Convert Map to array
        const orderArray = Array.from(orders.values());

        res.json(orderArray);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get trades
    this.app.get("/api/paper/trades", (req, res) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const trades = this.engine.getTrades();

        const result = limit ? trades.slice(-limit) : trades;

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get performance
    this.app.get("/api/paper/performance", async (req, res) => {
      try {
        const performance = await this.engine.getPerformance();
        res.json(performance);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Start trading (POST)
    this.app.post("/api/paper/start", async (req, res) => {
      try {
        const { strategyName, symbols } = req.body;

        if (!strategyName || !symbols) {
          return res.status(400).json({ error: "Strategy name and symbols required" });
        }

        // TODO: Load strategy dynamically
        // For now, return error
        res.status(501).json({ error: "Start endpoint not fully implemented" });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Stop trading (POST)
    this.app.post("/api/paper/stop", async (req, res) => {
      try {
        await this.engine.stop();
        res.json({ success: true, message: "Trading stopped" });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get position by symbol
    this.app.get("/api/paper/positions/:symbol", (req, res) => {
      try {
        const { symbol } = req.params;
        const portfolio = this.engine.getPortfolio();
        const position = portfolio.positions.get(symbol.toUpperCase());

        if (!position) {
          return res.status(404).json({ error: "Position not found" });
        }

        res.json({ symbol, ...position });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Get trades for symbol
    this.app.get("/api/paper/trades/:symbol", (req, res) => {
      try {
        const { symbol } = req.params;
        const allTrades = this.engine.getTrades();
        const trades = allTrades.filter((t) => t.symbol === symbol.toUpperCase());

        res.json(trades);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    // Dashboard summary
    this.app.get("/api/paper/dashboard", async (req, res) => {
      try {
        const status = this.engine.getStatus();
        const portfolio = this.engine.getPortfolio();
        const performance = await this.engine.getPerformance();
        const recentTrades = this.engine.getTrades().slice(-10);

        res.json({
          status,
          portfolio: {
            totalValue: portfolio.totalValue,
            cash: portfolio.cash,
            positionsValue: portfolio.positionsValue,
            totalPnL: portfolio.totalPnL,
            totalReturnPercent: portfolio.totalReturnPercent,
            winRate: portfolio.winRate,
            activePositions: portfolio.positions.size,
          },
          performance: {
            dailyReturn: performance.dailyReturn,
            totalReturn: performance.totalReturn,
            sharpeRatio: performance.sharpeRatio,
            maxDrawdown: performance.maxDrawdown,
            totalTrades: performance.totalTrades,
            winRate: performance.winRate,
            profitFactor: performance.profitFactor,
          },
          recentTrades,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  /**
   * Start API server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Paper Trading API listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop API server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): Express {
    return this.app;
  }
}
