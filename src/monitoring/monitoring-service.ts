import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StockDiscovery, type DiscoveryResult } from "../discovery/stock-discovery.js";
import { AlertService } from "../notifications/alert-service.js";
import { SecureConfig } from "../config/secure-config.js";
import type { Signal } from "../types/trading.js";

export interface MonitoringConfig {
  enabled: boolean;
  interval: number; // Minutes between scans
  markets: Array<"SP500" | "NASDAQ" | "DOW">;
  sectors: Array<"TECHNOLOGY" | "HEALTHCARE" | "FINANCE" | "CONSUMER" | "ENERGY" | "INDUSTRIAL">;
  trending: boolean;
  minConfidence: number;
  maxResults: number;
  alertThreshold: number; // Confidence level for alerts
  respectApiLimits: boolean;
  maxDailyScans: number;
}

export interface MonitoringStats {
  isRunning: boolean;
  uptime: number; // milliseconds
  totalScans: number;
  todayScans: number;
  opportunitiesFound: number;
  alertsSent: number;
  lastScanTime?: Date;
  nextScanTime?: Date;
  averageScanDuration: number;
  apiCallsToday: number;
  apiLimitReached: boolean;
}

export interface MonitoringResult {
  timestamp: Date;
  type: "market" | "sector" | "trending";
  target: string;
  opportunities: DiscoveryResult[];
  scanDuration: number;
  apiCallsUsed: number;
}

export class MonitoringService {
  private config = SecureConfig.getInstance();
  private discovery = new StockDiscovery();
  private alertService = new AlertService();
  
  private isRunning = false;
  private startTime?: Date;
  private intervalId?: NodeJS.Timeout;
  private stats: MonitoringStats = {
    isRunning: false,
    uptime: 0,
    totalScans: 0,
    todayScans: 0,
    opportunitiesFound: 0,
    alertsSent: 0,
    averageScanDuration: 0,
    apiCallsToday: 0,
    apiLimitReached: false,
  };

  private readonly MONITORING_DIR = "./data/monitoring";
  private readonly RESULTS_FILE = path.join(this.MONITORING_DIR, "results.jsonl");
  private readonly STATS_FILE = path.join(this.MONITORING_DIR, "stats.json");
  
  // API Limits (conservative estimates for free tiers)
  private readonly API_LIMITS = {
    ALPHA_VANTAGE_DAILY: 25, // 25 calls per day for free tier
    FINNHUB_DAILY: 60, // 60 calls per day for free tier
    CALLS_PER_STOCK: 2, // Typically 2 API calls per stock analysis
  };

  async initialize(): Promise<void> {
    await fs.mkdir(this.MONITORING_DIR, { recursive: true });
    await this.loadStats();
  }

  async start(config: MonitoringConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Monitoring is already running");
    }

    await this.initialize();
    
    // Reset daily stats if new day
    this.resetDailyStatsIfNeeded();

    this.isRunning = true;
    this.startTime = new Date();
    this.stats.isRunning = true;

    console.log(`🚀 Starting monitoring with ${config.interval}m intervals...`);
    console.log(`📊 Markets: ${config.markets.join(", ")}`);
    console.log(`🏭 Sectors: ${config.sectors.join(", ")}`);
    console.log(`📈 Trending: ${config.trending ? "Yes" : "No"}`);
    console.log(`🎯 Min Confidence: ${config.minConfidence}%`);
    console.log(`⚠️ Alert Threshold: ${config.alertThreshold}%`);

    // Initial scan
    await this.performScan(config);

    // Schedule recurring scans
    this.intervalId = setInterval(async () => {
      try {
        await this.performScan(config);
      } catch (error) {
        console.error("Monitoring scan failed:", error);
        await this.alertService.sendAlert({
          type: "SYSTEM_ALERT",
          message: `Monitoring scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          priority: "HIGH",
        });
      }
    }, config.interval * 60 * 1000); // Convert minutes to milliseconds

    await this.saveStats();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stats.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.startTime) {
      this.stats.uptime += Date.now() - this.startTime.getTime();
    }

    await this.saveStats();
    console.log("🛑 Monitoring stopped");
  }

  async getStats(): Promise<MonitoringStats> {
    if (this.isRunning && this.startTime) {
      return {
        ...this.stats,
        uptime: this.stats.uptime + (Date.now() - this.startTime.getTime()),
      };
    }
    return this.stats;
  }

  async getRecentResults(limit = 50): Promise<MonitoringResult[]> {
    try {
      const content = await fs.readFile(this.RESULTS_FILE, "utf8");
      const lines = content.trim().split("\n");
      return lines
        .slice(-limit)
        .map(line => JSON.parse(line))
        .reverse(); // Most recent first
    } catch (error) {
      return [];
    }
  }

  private async performScan(config: MonitoringConfig): Promise<void> {
    const startTime = Date.now();
    
    // Check API limits
    if (config.respectApiLimits && this.stats.apiCallsToday >= this.getMaxDailyApiCalls()) {
      this.stats.apiLimitReached = true;
      console.log("⚠️ Daily API limit reached, skipping scan");
      return;
    }

    console.log(`🔍 Starting monitoring scan at ${new Date().toLocaleTimeString()}`);
    
    const allOpportunities: DiscoveryResult[] = [];
    let totalApiCalls = 0;

    const discoveryConfig = {
      minConfidence: config.minConfidence,
      maxResults: Math.floor(config.maxResults / (config.markets.length + config.sectors.length + (config.trending ? 1 : 0))),
    };

    try {
      // Scan markets
      for (const market of config.markets) {
        if (this.shouldSkipDueToApiLimits(totalApiCalls, config)) break;
        
        const results = await this.discovery.discoverByMarket(market, discoveryConfig);
        allOpportunities.push(...results);
        totalApiCalls += results.length * this.API_LIMITS.CALLS_PER_STOCK;
        
        await this.saveResult({
          timestamp: new Date(),
          type: "market",
          target: market,
          opportunities: results,
          scanDuration: Date.now() - startTime,
          apiCallsUsed: results.length * this.API_LIMITS.CALLS_PER_STOCK,
        });

        // Rate limiting between scans
        await this.sleep(2000);
      }

      // Scan sectors
      for (const sector of config.sectors) {
        if (this.shouldSkipDueToApiLimits(totalApiCalls, config)) break;
        
        const results = await this.discovery.discoverBySector(sector, discoveryConfig);
        allOpportunities.push(...results);
        totalApiCalls += results.length * this.API_LIMITS.CALLS_PER_STOCK;
        
        await this.saveResult({
          timestamp: new Date(),
          type: "sector",
          target: sector,
          opportunities: results,
          scanDuration: Date.now() - startTime,
          apiCallsUsed: results.length * this.API_LIMITS.CALLS_PER_STOCK,
        });

        await this.sleep(2000);
      }

      // Scan trending
      if (config.trending && !this.shouldSkipDueToApiLimits(totalApiCalls, config)) {
        const results = await this.discovery.discoverTrending(discoveryConfig);
        allOpportunities.push(...results);
        totalApiCalls += results.length * this.API_LIMITS.CALLS_PER_STOCK;
        
        await this.saveResult({
          timestamp: new Date(),
          type: "trending",
          target: "trending",
          opportunities: results,
          scanDuration: Date.now() - startTime,
          apiCallsUsed: results.length * this.API_LIMITS.CALLS_PER_STOCK,
        });
      }

      // Send alerts for high-confidence opportunities
      const alertWorthy = allOpportunities.filter(opp => opp.signal.confidence >= config.alertThreshold);
      if (alertWorthy.length > 0) {
        await this.alertService.sendAlert({
          type: "STRONG_SIGNAL",
          message: `Monitoring found ${alertWorthy.length} high-confidence opportunities`,
          signals: alertWorthy.map(opp => opp.signal),
          priority: alertWorthy.some(opp => opp.signal.confidence > 90) ? "HIGH" : "MEDIUM",
        });
        this.stats.alertsSent++;
      }

      // Update stats
      const scanDuration = Date.now() - startTime;
      this.stats.totalScans++;
      this.stats.todayScans++;
      this.stats.opportunitiesFound += allOpportunities.length;
      this.stats.lastScanTime = new Date();
      this.stats.nextScanTime = new Date(Date.now() + config.interval * 60 * 1000);
      this.stats.averageScanDuration = (this.stats.averageScanDuration * (this.stats.totalScans - 1) + scanDuration) / this.stats.totalScans;
      this.stats.apiCallsToday += totalApiCalls;

      console.log(`✅ Scan complete: ${allOpportunities.length} opportunities found in ${(scanDuration / 1000).toFixed(1)}s`);
      console.log(`📊 API calls used: ${totalApiCalls} (${this.stats.apiCallsToday}/${this.getMaxDailyApiCalls()} daily)`);

    } catch (error) {
      console.error("Scan failed:", error);
      throw error;
    } finally {
      await this.saveStats();
    }
  }

  private shouldSkipDueToApiLimits(currentApiCalls: number, config: MonitoringConfig): boolean {
    if (!config.respectApiLimits) return false;
    return (this.stats.apiCallsToday + currentApiCalls) >= this.getMaxDailyApiCalls();
  }

  private getMaxDailyApiCalls(): number {
    // Conservative estimate: use 80% of daily limit
    return Math.floor((this.API_LIMITS.ALPHA_VANTAGE_DAILY + this.API_LIMITS.FINNHUB_DAILY) * 0.8);
  }

  private async saveResult(result: MonitoringResult): Promise<void> {
    try {
      const line = JSON.stringify(result) + "\n";
      await fs.appendFile(this.RESULTS_FILE, line, "utf8");
    } catch (error) {
      console.error("Failed to save monitoring result:", error);
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await fs.writeFile(this.STATS_FILE, JSON.stringify(this.stats, null, 2), "utf8");
    } catch (error) {
      console.error("Failed to save monitoring stats:", error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const content = await fs.readFile(this.STATS_FILE, "utf8");
      this.stats = { ...this.stats, ...JSON.parse(content) };
      
      // Ensure monitoring is marked as stopped on restart
      this.stats.isRunning = false;
    } catch (error) {
      // Stats file doesn't exist, use defaults
    }
  }

  private resetDailyStatsIfNeeded(): void {
    const today = new Date().toDateString();
    const lastScanDay = this.stats.lastScanTime ? new Date(this.stats.lastScanTime).toDateString() : null;
    
    if (lastScanDay !== today) {
      this.stats.todayScans = 0;
      this.stats.apiCallsToday = 0;
      this.stats.apiLimitReached = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Web API endpoints for dashboard
  async getOpportunities(): Promise<DiscoveryResult[]> {
    const results = await this.getRecentResults(10);
    return results.flatMap(r => r.opportunities).slice(0, 50);
  }

  async getChartData(hours = 24): Promise<Array<{
    timestamp: Date;
    opportunities: number;
    avgConfidence: number;
    apiCalls: number;
  }>> {
    const results = await this.getRecentResults(1000);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const filteredResults = results.filter(r => r.timestamp > cutoff);
    
    // If no recent results, generate placeholder data to show the chart structure
    if (filteredResults.length === 0) {
      const now = new Date();
      return [
        {
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
          opportunities: 0,
          avgConfidence: 0,
          apiCalls: 0,
        },
        {
          timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
          opportunities: 0,
          avgConfidence: 0,
          apiCalls: 0,
        },
        {
          timestamp: now,
          opportunities: 0,
          avgConfidence: 0,
          apiCalls: 0,
        },
      ];
    }
    
    return filteredResults.map(r => ({
      timestamp: r.timestamp,
      opportunities: r.opportunities.length,
      avgConfidence: r.opportunities.length > 0 
        ? r.opportunities.reduce((sum, opp) => sum + opp.signal.confidence, 0) / r.opportunities.length 
        : 0,
      apiCalls: r.apiCallsUsed,
    }));
  }
}