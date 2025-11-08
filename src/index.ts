#!/usr/bin/env node

import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { RiskManager } from "./analysis/risk-manager.js";
import { TechnicalIndicators } from "./analysis/technical-indicators.js";
import { SecureConfig } from "./config/secure-config.js";
import { MarketDataService } from "./data/market-data-service.js";
import { AlertService } from "./notifications/alert-service.js";
import { MeanReversionStrategy } from "./strategies/mean-reversion-strategy.js";
import { MomentumStrategy } from "./strategies/momentum-strategy.js";
import { StockDiscovery, type DiscoveryResult } from "./discovery/stock-discovery.js";
import { MonitoringService } from "./monitoring/monitoring-service.js";
import { WebServer } from "./web/server.js";
import type { Signal } from "./types/trading.js";

const program = new Command();
const config = SecureConfig.getInstance();
const marketData = new MarketDataService();
const riskManager = new RiskManager();
const alertService = new AlertService();
const stockDiscovery = new StockDiscovery();
const monitoringService = new MonitoringService();

program
  .name("stock-analyzer")
  .description("Secure local stock analysis CLI with advanced trading strategies")
  .version("1.0.0");

// Setup command
program
  .command("setup")
  .description("Setup API keys and configuration")
  .action(async () => {
    console.log(chalk.blue("🔧 Stock Sense AI Setup\\n"));

    try {
      await config.initialize();

      const answers = await inquirer.prompt([
        {
          type: "password",
          name: "alphaVantageKey",
          message: "Alpha Vantage API Key:",
          validate: (input) => input.length > 0 || "API key required",
        },
        {
          type: "password",
          name: "finnhubKey",
          message: "Finnhub API Key:",
          validate: (input) => input.length > 0 || "API key required",
        },
        {
          type: "list",
          name: "notificationType",
          message: "Choose notification method:",
          choices: [
            { name: "Telegram (Recommended - Free, instant)", value: "telegram" },
            { name: "Email (SendGrid required)", value: "email" },
            { name: "Both Telegram and Email", value: "both" },
            { name: "None (Console only)", value: "none" },
          ],
          default: "telegram",
        },
        {
          type: "input",
          name: "telegramBotToken",
          message: "Telegram Bot Token (from @BotFather):",
          when: (answers) => answers.notificationType === "telegram" || answers.notificationType === "both",
          validate: (input) => input.length > 0 || "Bot token required",
        },
        {
          type: "input",
          name: "telegramChatId",
          message: "Telegram Chat ID (your user ID or group chat ID):",
          when: (answers) => answers.notificationType === "telegram" || answers.notificationType === "both",
          validate: (input) => input.length > 0 || "Chat ID required",
        },
        {
          type: "password",
          name: "sendgridKey",
          message: "SendGrid API Key:",
          when: (answers) => answers.notificationType === "email" || answers.notificationType === "both",
        },
        {
          type: "input",
          name: "emailRecipient",
          message: "Email recipient:",
          when: (answers) => answers.notificationType === "email" || answers.notificationType === "both",
          validate: (input) => /\\S+@\\S+\\.\\S+/.test(input) || "Valid email required",
        },
        {
          type: "number",
          name: "maxRiskPerTrade",
          message: "Maximum risk per trade (%):",
          default: 1,
          validate: (input) => (input > 0 && input <= 5) || "Risk must be between 0.1% and 5%",
        },
        {
          type: "number",
          name: "maxPositionSize",
          message: "Maximum position size (%):",
          default: 25,
          validate: (input) =>
            (input > 0 && input <= 50) || "Position size must be between 1% and 50%",
        },
      ]);

      await config.saveConfig({
        apis: {
          alphaVantage: answers.alphaVantageKey,
          finnhub: answers.finnhubKey,
        },
        notifications: {
          telegram: (answers.notificationType === "telegram" || answers.notificationType === "both")
            ? {
                botToken: answers.telegramBotToken,
                chatId: answers.telegramChatId,
              }
            : undefined,
          email: (answers.notificationType === "email" || answers.notificationType === "both")
            ? {
                sendgridKey: answers.sendgridKey,
                recipient: answers.emailRecipient,
              }
            : undefined,
        },
        trading: {
          maxPositionSize: answers.maxPositionSize / 100, // Convert percentage to decimal
          maxRiskPerTrade: answers.maxRiskPerTrade / 100,
          enableLiveTrading: false,
        },
      });

      console.log(chalk.green("\\n✅ Setup complete! Configuration encrypted and saved."));
      console.log(chalk.gray("\\nNext steps:"));
      console.log(chalk.gray("  • Test configuration: stock-analyzer health"));
      console.log(chalk.gray("  • Analyze a stock: stock-analyzer analyze AAPL"));
      console.log(chalk.gray("  • Create watchlist: echo 'AAPL\\nMSFT\\nGOOG' > watchlist.txt"));
    } catch (error) {
      console.error(
        chalk.red("Setup failed:"),
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exit(1);
    }
  });

// Health check command
program
  .command("health")
  .description("Check system health and API connectivity")
  .action(async () => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora("Checking system health...").start();

    try {
      const health = await marketData.healthCheck();
      const cacheStats = await marketData.getCacheStats();

      spinner.succeed("Health check complete");

      const table = new Table({
        head: ["Component", "Status", "Details"],
        colWidths: [20, 15, 50],
      });

      table.push(
        [
          "Alpha Vantage API",
          health.alphaVantage ? chalk.green("✅ OK") : chalk.red("❌ FAIL"),
          health.alphaVantage ? "Connected successfully" : "Connection failed",
        ],
        [
          "Finnhub API",
          health.finnhub ? chalk.green("✅ OK") : chalk.red("❌ FAIL"),
          health.finnhub ? "Connected successfully" : "Connection failed",
        ],
        [
          "Cache System",
          health.cache ? chalk.green("✅ OK") : chalk.red("❌ FAIL"),
          health.cache
            ? `${cacheStats.totalFiles} files, ${(cacheStats.totalSize / 1024).toFixed(1)} KB`
            : "Cache system not working",
        ],
      );

      console.log("\\n" + table.toString());

      if (health.errors.length > 0) {
        console.log(chalk.red("\\n🚨 Errors detected:"));
        health.errors.forEach((error) => {
          console.log(chalk.red(`  • ${error}`));
        });
      }
    } catch (error) {
      spinner.fail("Health check failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
      process.exit(1);
    }
  });

// Analyze command
program
  .command("analyze")
  .description("Analyze a stock for trading signals")
  .argument("<symbol>", "Stock symbol to analyze")
  .option("-d, --detailed", "Show detailed analysis")
  .option("-s, --strategy <type>", "Strategy type (mean-reversion, momentum, all)", "all")
  .action(async (symbol: string, options) => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora(`Analyzing ${symbol.toUpperCase()}...`).start();

    try {
      // Get market data
      const analysisData = await marketData.getFullAnalysisData(symbol);

      // Convert to format expected by strategy
      const historicalData = analysisData.historical;

      const strategies: Signal[] = [];

      if (options.strategy === "all" || options.strategy === "mean-reversion") {
        const meanReversion = new MeanReversionStrategy({
          rsiOversold: 30,
          rsiOverbought: 70,
          mfiOversold: 20,
          mfiOverbought: 80,
          bbStdDev: 2,
          minConfidence: 60,
          volumeThreshold: 1.2,
          maxHoldingPeriod: 10,
        });

        const signal = await meanReversion.analyze(symbol, historicalData);

        // Apply risk management if signal is actionable
        if (signal.action !== "HOLD") {
          const riskCalc = await riskManager.calculatePosition({
            symbol,
            entryPrice: signal.entryPrice || analysisData.quote.price,
            signal,
            accountBalance: 100000, // Default paper trading balance
            atr: signal.indicators.atr,
          });

          signal.stopLoss = riskCalc.stopLoss;
          signal.takeProfit = riskCalc.takeProfit;
          signal.positionSize = riskCalc.positionSize;
          signal.riskAmount = riskCalc.riskAmount;

          if (!riskCalc.isValid && riskCalc.warnings.length > 0) {
            signal.reasons.push(...riskCalc.warnings.map((w) => `Risk Warning: ${w}`));
          }
        }

        strategies.push(signal);
      }

      if (options.strategy === "all" || options.strategy === "momentum") {
        const momentum = new MomentumStrategy({
          shortMA: 20,
          longMA: 50,
          macdFast: 12,
          macdSlow: 26,
          macdSignal: 9,
          volumeThreshold: 1.5,
          minConfidence: 65,
          trendStrength: 0.02,
        });

        const signal = await momentum.analyze(symbol, historicalData);

        // Apply risk management if signal is actionable
        if (signal.action !== "HOLD") {
          const riskCalc = await riskManager.calculatePosition({
            symbol,
            entryPrice: signal.entryPrice || analysisData.quote.price,
            signal,
            accountBalance: 100000, // Default paper trading balance
            atr: signal.indicators.atr,
          });

          signal.stopLoss = riskCalc.stopLoss;
          signal.takeProfit = riskCalc.takeProfit;
          signal.positionSize = riskCalc.positionSize;
          signal.riskAmount = riskCalc.riskAmount;

          if (!riskCalc.isValid && riskCalc.warnings.length > 0) {
            signal.reasons.push(...riskCalc.warnings.map((w) => `Risk Warning: ${w}`));
          }
        }

        strategies.push(signal);
      }

      spinner.succeed(`Analysis complete for ${symbol.toUpperCase()}`);

      // Check for strong signals and send alerts
      const strongSignals = strategies.filter(s => s.confidence > 75 && s.action !== "HOLD");
      if (strongSignals.length > 0) {
        try {
          const firstSignal = strongSignals[0];
          await alertService.sendAlert({
            type: "STRONG_SIGNAL",
            symbol,
            signals: strongSignals,
            priority: firstSignal && firstSignal.confidence > 90 ? "HIGH" : "MEDIUM",
          });
        } catch (error) {
          console.warn(chalk.yellow("Failed to send alert:"), error instanceof Error ? error.message : "Unknown error");
        }
      }

      // Display results
      displayAnalysisResults(symbol, strategies, analysisData.quote.price, options.detailed);
    } catch (error) {
      spinner.fail("Analysis failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
      process.exit(1);
    }
  });

// Scan command
program
  .command("scan")
  .description("Scan multiple stocks for opportunities")
  .option("-w, --watchlist <file>", "Watchlist file", "watchlist.txt")
  .option("-t, --top <n>", "Show top N opportunities", "10")
  .action(async (options) => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora("Scanning watchlist...").start();

    try {
      const symbols = await loadWatchlist(options.watchlist);
      if (symbols.length === 0) {
        spinner.warn("No symbols found in watchlist");
        console.log(
          chalk.yellow(`Create a watchlist file: echo "AAPL\\nMSFT\\nGOOG" > ${options.watchlist}`),
        );
        return;
      }

      const results: Signal[] = [];

      for (const [index, symbol] of symbols.entries()) {
        spinner.text = `Scanning ${symbol} (${index + 1}/${symbols.length})...`;

        try {
          const analysisData = await marketData.getFullAnalysisData(symbol);

          // Run both strategies for scanning
          const meanReversion = new MeanReversionStrategy({
            rsiOversold: 30,
            rsiOverbought: 70,
            mfiOversold: 20,
            mfiOverbought: 80,
            bbStdDev: 2,
            minConfidence: 60,
            volumeThreshold: 1.2,
            maxHoldingPeriod: 10,
          });

          const momentum = new MomentumStrategy({
            shortMA: 20,
            longMA: 50,
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,
            volumeThreshold: 1.5,
            minConfidence: 65,
            trendStrength: 0.02,
          });

          const meanRevSignal = await meanReversion.analyze(symbol, analysisData.historical);
          const momentumSignal = await momentum.analyze(symbol, analysisData.historical);
          
          // Add the signal with higher confidence
          if (meanRevSignal.confidence >= momentumSignal.confidence) {
            results.push(meanRevSignal);
          } else {
            results.push(momentumSignal);
          }

          // Rate limiting to respect API limits
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn(
            chalk.yellow(
              `\\nWarning: Failed to analyze ${symbol}: ${error instanceof Error ? error.message : "Unknown error"}`,
            ),
          );
        }
      }

      spinner.succeed("Scan complete");

      // Sort by confidence and filter actionable signals
      const opportunities = results
        .filter((r) => r.action !== "HOLD" && r.confidence >= 60)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, Number.parseInt(options.top));

      displayScanResults(opportunities);
    } catch (error) {
      spinner.fail("Scan failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
      process.exit(1);
    }
  });

// Cache management commands
program
  .command("cache")
  .description("Cache management commands")
  .option("--clear", "Clear all cached data")
  .option("--stats", "Show cache statistics")
  .action(async (options) => {
    if (options.clear) {
      const spinner = ora("Clearing cache...").start();
      await marketData.clearCache();
      spinner.succeed("Cache cleared");
    } else if (options.stats) {
      const stats = await marketData.getCacheStats();
      console.log(chalk.blue("📊 Cache Statistics:\\n"));
      console.log(`Total files: ${stats.totalFiles}`);
      console.log(`Total size: ${(stats.totalSize / 1024).toFixed(1)} KB`);
      console.log(`Oldest entry: ${stats.oldestEntry?.toLocaleString() || "N/A"}`);
      console.log(`Newest entry: ${stats.newestEntry?.toLocaleString() || "N/A"}`);
    } else {
      console.log(chalk.yellow("Use --clear to clear cache or --stats to show statistics"));
    }
  });

// Test notifications command
program
  .command("test-notifications")
  .description("Test notification systems (Telegram, Email)")
  .action(async () => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora("Testing notification systems...").start();

    try {
      const results = await alertService.testNotifications();
      spinner.succeed("Notification test complete");

      const table = new Table({
        head: ["Service", "Status", "Details"],
        colWidths: [15, 15, 50],
      });

      table.push(
        [
          "Telegram",
          results.telegram ? chalk.green("✅ OK") : chalk.red("❌ FAIL"),
          results.telegram ? "Test message sent successfully" : "Not configured or failed",
        ],
        [
          "Email",
          results.email ? chalk.green("✅ OK") : chalk.red("❌ FAIL"),
          results.email ? "Configuration valid" : "Not configured",
        ]
      );

      console.log("\\n" + table.toString());

      if (results.errors.length > 0) {
        console.log(chalk.red("\\n🚨 Issues detected:"));
        results.errors.forEach((error) => {
          console.log(chalk.red(`  • ${error}`));
        });
      }

      if (results.telegram || results.email) {
        console.log(chalk.green("\\n✅ At least one notification method is working!"));
      } else {
        console.log(chalk.yellow("\\n⚠️ No notification methods are configured."));
        console.log(chalk.gray("Run 'stock-analyzer setup' to configure notifications."));
      }
    } catch (error) {
      spinner.fail("Notification test failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
    }
  });

// Discovery command
program
  .command("discover")
  .description("Discover new trading opportunities")
  .option("-m, --market <type>", "Market to scan (SP500, NASDAQ, DOW)", "SP500")
  .option("-s, --sector <type>", "Sector to scan (TECHNOLOGY, HEALTHCARE, FINANCE, CONSUMER, ENERGY, INDUSTRIAL, GROWTH)")
  .option("-t, --trending", "Scan trending/volatile stocks")
  .option("--high-revenue", "Focus on high-revenue opportunity stocks")
  .option("-c, --confidence <number>", "Minimum confidence threshold", "75")
  .option("-n, --max-results <number>", "Maximum results to return", "10")
  .option("--min-price <number>", "Minimum stock price")
  .option("--max-price <number>", "Maximum stock price")
  .option("--min-volume <number>", "Minimum daily volume")
  .action(async (options) => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora("🔍 Discovering trading opportunities...").start();

    try {
      const discoveryConfig = {
        minConfidence: Number.parseFloat(options.confidence),
        maxResults: Number.parseInt(options.maxResults),
        minPrice: options.minPrice ? Number.parseFloat(options.minPrice) : undefined,
        maxPrice: options.maxPrice ? Number.parseFloat(options.maxPrice) : undefined,
        minVolume: options.minVolume ? Number.parseInt(options.minVolume) : undefined,
      };

      let results: DiscoveryResult[] = [];
      let discoveryType = "";

      if (options.highRevenue) {
        results = await stockDiscovery.discoverHighRevenue(discoveryConfig);
        discoveryType = "High-Revenue Opportunities";
      } else if (options.trending) {
        results = await stockDiscovery.discoverTrending(discoveryConfig);
        discoveryType = "Trending Stocks";
      } else if (options.sector) {
        const validSectors = ["TECHNOLOGY", "HEALTHCARE", "FINANCE", "CONSUMER", "ENERGY", "INDUSTRIAL", "GROWTH"];
        const sector = options.sector.toUpperCase();
        if (!validSectors.includes(sector)) {
          throw new Error(`Invalid sector. Valid options: ${validSectors.join(", ")}`);
        }
        results = await stockDiscovery.discoverBySector(sector as "TECHNOLOGY" | "HEALTHCARE" | "FINANCE" | "CONSUMER" | "ENERGY" | "INDUSTRIAL" | "GROWTH", discoveryConfig);
        discoveryType = `${options.sector} Sector`;
      } else {
        results = await stockDiscovery.discoverByMarket(options.market, discoveryConfig);
        discoveryType = `${options.market} Market`;
      }

      spinner.succeed(`🎯 Discovery complete! Found ${results.length} opportunities`);

      // Send alerts for high-confidence discoveries
      const highConfidenceResults = results.filter(r => r.signal.confidence > 85);
      if (highConfidenceResults.length > 0) {
        try {
          await alertService.sendAlert({
            type: "STRONG_SIGNAL",
            message: `Discovery found ${highConfidenceResults.length} high-confidence opportunities in ${discoveryType}`,
            signals: highConfidenceResults.map(r => r.signal),
            priority: "HIGH",
          });
        } catch (error) {
          console.warn(chalk.yellow("Failed to send discovery alert:"), error instanceof Error ? error.message : "Unknown error");
        }
      }

      displayDiscoveryResults(results, discoveryType);

    } catch (error) {
      spinner.fail("Discovery failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
      process.exit(1);
    }
  });

// Market overview command  
program
  .command("market")
  .description("Get market sentiment and overview")
  .action(async () => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const spinner = ora("📊 Analyzing market sentiment...").start();

    try {
      const overview = await stockDiscovery.getMarketOverview();
      spinner.succeed("Market analysis complete");

      console.log(chalk.bold("\n📈 Market Overview:\n"));

      const sentimentColor = overview.marketSentiment === "BULLISH" ? chalk.green : 
                            overview.marketSentiment === "BEARISH" ? chalk.red : chalk.yellow;
      
      console.log(`Overall Sentiment: ${sentimentColor.bold(overview.marketSentiment)}`);
      console.log(`Analyzed: ${overview.totalAnalyzed} stocks`);
      console.log(chalk.green(`Bullish Signals: ${overview.bullishSignals}`));
      console.log(chalk.red(`Bearish Signals: ${overview.bearishSignals}`));

      if (overview.topSectors.length > 0) {
        console.log(chalk.bold("\n🏭 Active Sectors:"));
        overview.topSectors.forEach((sector, index) => {
          console.log(`${index + 1}. ${sector.sector}: ${sector.signalCount} signals`);
        });
      }
    } catch (error) {
      spinner.fail("Market analysis failed");
      console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
    }
  });

// Monitoring commands
program
  .command("monitor")
  .description("Auto-monitoring commands")
  .option("--start", "Start monitoring")
  .option("--stop", "Stop monitoring")
  .option("--status", "Show monitoring status")
  .option("--results [number]", "Show recent results")
  .option("-i, --interval <minutes>", "Scan interval in minutes", "60")
  .option("-m, --markets <markets>", "Markets to monitor (SP500,NASDAQ,DOW)", "SP500")
  .option("-s, --sectors <sectors>", "Sectors to monitor (comma-separated)")
  .option("--trending", "Include trending stocks")
  .option("-c, --confidence <number>", "Minimum confidence threshold", "75")
  .option("-a, --alert-threshold <number>", "Alert confidence threshold", "85")
  .option("-n, --max-results <number>", "Max results per scan", "20")
  .option("--no-api-limits", "Ignore API rate limits (use with caution)")
  .action(async (options) => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    try {
      if (options.start) {
        const monitoringConfig = {
          enabled: true,
          interval: Number.parseInt(options.interval),
          markets: options.markets.split(",").map((m: string) => m.trim()),
          sectors: options.sectors ? options.sectors.split(",").map((s: string) => s.trim().toUpperCase()) : [],
          trending: !!options.trending,
          minConfidence: Number.parseFloat(options.confidence),
          maxResults: Number.parseInt(options.maxResults),
          alertThreshold: Number.parseFloat(options.alertThreshold),
          respectApiLimits: !options.noApiLimits,
          maxDailyScans: 50,
        };

        await monitoringService.start(monitoringConfig);
        
        console.log(chalk.green("\n✅ Monitoring started successfully!"));
        console.log(chalk.gray("💡 Tips:"));
        console.log(chalk.gray("  • Use 'stock-analyzer monitor --status' to check status"));
        console.log(chalk.gray("  • Use 'stock-analyzer monitor --stop' to stop"));
        console.log(chalk.gray("  • Monitor runs in background - keep this terminal open"));
        console.log(chalk.gray("  • High-confidence alerts will be sent via Telegram"));

        // Keep process alive
        console.log(chalk.blue("\n🔄 Monitoring is running... Press Ctrl+C to stop\n"));
        
        process.on("SIGINT", async () => {
          console.log(chalk.yellow("\n🛑 Stopping monitoring..."));
          await monitoringService.stop();
          process.exit(0);
        });

        // Prevent process from exiting
        setInterval(() => {}, 1000);

      } else if (options.stop) {
        await monitoringService.stop();
        console.log(chalk.green("✅ Monitoring stopped"));

      } else if (options.status) {
        const stats = await monitoringService.getStats();
        
        console.log(chalk.bold("\n📊 Monitoring Status:\n"));
        console.log(`Status: ${stats.isRunning ? chalk.green("🟢 RUNNING") : chalk.red("🔴 STOPPED")}`);
        console.log(`Uptime: ${(stats.uptime / (1000 * 60 * 60)).toFixed(1)} hours`);
        console.log(`Total Scans: ${stats.totalScans}`);
        console.log(`Today's Scans: ${stats.todayScans}`);
        console.log(`Opportunities Found: ${stats.opportunitiesFound}`);
        console.log(`Alerts Sent: ${stats.alertsSent}`);
        console.log(`API Calls Today: ${stats.apiCallsToday}`);
        console.log(`Avg Scan Duration: ${(stats.averageScanDuration / 1000).toFixed(1)}s`);
        
        if (stats.lastScanTime) {
          console.log(`Last Scan: ${stats.lastScanTime.toLocaleString()}`);
        }
        if (stats.nextScanTime && stats.isRunning) {
          console.log(`Next Scan: ${stats.nextScanTime.toLocaleString()}`);
        }
        
        if (stats.apiLimitReached) {
          console.log(chalk.yellow("\n⚠️ Daily API limit reached - monitoring paused"));
        }

      } else if (options.results) {
        const limit = options.results === true ? 10 : Number.parseInt(options.results);
        const results = await monitoringService.getRecentResults(limit);
        
        if (results.length === 0) {
          console.log(chalk.yellow("No monitoring results found"));
          return;
        }

        console.log(chalk.bold(`\n📈 Recent Monitoring Results (${results.length}):\n`));
        
        results.forEach((result, index) => {
          const typeEmoji = result.type === "market" ? "📊" : result.type === "sector" ? "🏭" : "🔥";
          console.log(`${chalk.bold(`${index + 1}. ${typeEmoji} ${result.target.toUpperCase()}`)}`);
          console.log(`   Time: ${result.timestamp.toLocaleString()}`);
          console.log(`   Opportunities: ${result.opportunities.length}`);
          console.log(`   Duration: ${(result.scanDuration / 1000).toFixed(1)}s`);
          console.log(`   API Calls: ${result.apiCallsUsed}`);
          
          if (result.opportunities.length > 0) {
            const topOpp = result.opportunities[0];
            if (topOpp) {
              const actionColor = topOpp.signal.action === "BUY" ? chalk.green : chalk.red;
              console.log(`   Top: ${actionColor.bold(topOpp.signal.action)} ${topOpp.symbol} (${topOpp.signal.confidence.toFixed(1)}%)`);
            }
          }
          console.log();
        });

      } else {
        console.log(chalk.yellow("Use --start, --stop, --status, or --results"));
        console.log(chalk.gray("\nExamples:"));
        console.log(chalk.gray("  stock-analyzer monitor --start --interval 30"));
        console.log(chalk.gray("  stock-analyzer monitor --start --sectors TECHNOLOGY,HEALTHCARE"));
        console.log(chalk.gray("  stock-analyzer monitor --status"));
        console.log(chalk.gray("  stock-analyzer monitor --results 5"));
        console.log(chalk.gray("  stock-analyzer monitor --stop"));
      }

    } catch (error) {
      console.error(chalk.red("Monitoring command failed:"), error instanceof Error ? error.message : "Unknown error");
      process.exit(1);
    }
  });

// Web dashboard command
program
  .command("dashboard")
  .description("Start web dashboard")
  .option("-p, --port <number>", "Port for web server", "3000")
  .action(async (options) => {
    await config.initialize();

    if (!config.isConfigured()) {
      console.log(
        chalk.red("❌ Configuration not found. Please run 'stock-analyzer setup' first."),
      );
      process.exit(1);
    }

    const port = Number.parseInt(options.port);
    const webServer = new WebServer(port);

    try {
      await webServer.start();
      
      console.log(chalk.green("✅ Web dashboard started successfully!"));
      console.log(chalk.blue(`🌐 Dashboard: http://localhost:${port}`));
      console.log(chalk.gray("💡 Features:"));
      console.log(chalk.gray("  • Real-time monitoring status"));
      console.log(chalk.gray("  • Live opportunity feed"));
      console.log(chalk.gray("  • Performance charts"));
      console.log(chalk.gray("  • Market sentiment analysis"));
      console.log(chalk.gray("\nPress Ctrl+C to stop the dashboard"));

      // Keep process alive and handle graceful shutdown
      const gracefulShutdown = async () => {
        console.log(chalk.yellow("\n🛑 Stopping dashboard..."));
        try {
          await webServer.stop();
          console.log(chalk.green("✅ Dashboard stopped gracefully"));
          process.exit(0);
        } catch (error) {
          console.error(chalk.red("Error during shutdown:"), error instanceof Error ? error.message : "Unknown error");
          process.exit(1);
        }
      };

      process.on("SIGINT", gracefulShutdown);
      process.on("SIGTERM", gracefulShutdown);

      // Keep process alive (more efficient than interval)
      await new Promise(() => {});

    } catch (error) {
      console.error(chalk.red("Failed to start dashboard:"), error instanceof Error ? error.message : "Unknown error");
      process.exit(1);
    }
  });

// Helper functions
function displayAnalysisResults(
  symbol: string,
  signals: Signal[],
  currentPrice: number,
  detailed: boolean,
): void {
  console.log(`\\n${chalk.bold(`Analysis Results for ${symbol.toUpperCase()}`)}`);
  console.log(chalk.gray(`Current Price: $${currentPrice.toFixed(2)}\\n`));

  const table = new Table({
    head: ["Strategy", "Action", "Confidence", "Strength", "Key Reasons"],
    colWidths: [25, 10, 15, 15, 45],
  });

  signals.forEach((signal) => {
    const actionColor =
      signal.action === "BUY" ? chalk.green : signal.action === "SELL" ? chalk.red : chalk.gray;

    table.push([
      signal.strategy,
      actionColor(signal.action),
      `${signal.confidence.toFixed(1)}%`,
      `${signal.strength.toFixed(1)}%`,
      signal.reasons[0] || "N/A",
    ]);

    if (signal.action !== "HOLD" && signal.stopLoss) {
      table.push([
        chalk.gray("Risk Management"),
        "",
        "",
        "",
        chalk.gray(
          `Stop: $${signal.stopLoss.toFixed(2)}, Target: $${signal.takeProfit?.toFixed(2)}, Size: ${signal.positionSize} shares`,
        ),
      ]);
    }
  });

  console.log(table.toString());

  if (detailed) {
    const indicators = signals[0]?.indicators;
    if (indicators) {
      console.log(chalk.bold("\\nTechnical Indicators:"));
      console.log(`  RSI: ${indicators.rsi.toFixed(2)}`);
      console.log(`  MFI: ${indicators.mfi.toFixed(2)}`);
      console.log(`  MACD: ${indicators.macd.MACD.toFixed(2)}`);
      console.log(`  MACD Signal: ${indicators.macd.signal.toFixed(2)}`);
      console.log(`  ATR: ${indicators.atr.toFixed(2)}`);
      console.log(`  Volume Ratio: ${indicators.volumeProfile.volumeRatio.toFixed(2)}`);
    }
  }
}

function displayScanResults(opportunities: Signal[]): void {
  if (opportunities.length === 0) {
    console.log(chalk.yellow("\\nNo high-confidence trading opportunities found."));
    return;
  }

  console.log(chalk.bold(`\\nTop Trading Opportunities:\\n`));

  const table = new Table({
    head: ["Rank", "Symbol", "Action", "Confidence", "Strategy", "Primary Reason"],
    colWidths: [6, 10, 10, 15, 25, 40],
  });

  opportunities.forEach((opp, index) => {
    const actionColor = opp.action === "BUY" ? chalk.green : chalk.red;

    table.push([
      `#${index + 1}`,
      chalk.bold(opp.symbol),
      actionColor(opp.action),
      `${opp.confidence.toFixed(1)}%`,
      opp.strategy,
      opp.reasons[0] || "N/A",
    ]);
  });

  console.log(table.toString());
}

function displayDiscoveryResults(results: DiscoveryResult[], discoveryType: string): void {
  if (results.length === 0) {
    console.log(chalk.yellow(`\n❌ No opportunities found in ${discoveryType} matching your criteria.`));
    console.log(chalk.gray("Try lowering the confidence threshold or adjusting price/volume filters."));
    return;
  }

  console.log(chalk.bold(`\n🎯 ${discoveryType} - Top ${results.length} Opportunities:\n`));

  const table = new Table({
    head: ["Rank", "Symbol", "Action", "Confidence", "Price", "Sector", "Risk/Reward"],
    colWidths: [6, 8, 8, 12, 10, 12, 20],
  });

  results.forEach((result, index) => {
    const signal = result.signal;
    const actionColor = signal.action === "BUY" ? chalk.green : chalk.red;
    const confidenceColor = signal.confidence > 90 ? chalk.green : 
                           signal.confidence > 80 ? chalk.yellow : chalk.white;

    const riskReward = signal.stopLoss && signal.takeProfit 
      ? `${((signal.takeProfit - result.currentPrice) / (result.currentPrice - signal.stopLoss)).toFixed(1)}:1`
      : "N/A";

    table.push([
      `#${index + 1}`,
      chalk.bold(result.symbol),
      actionColor.bold(signal.action),
      confidenceColor(`${signal.confidence.toFixed(1)}%`),
      `$${result.currentPrice.toFixed(2)}`,
      result.sector || "Unknown",
      riskReward,
    ]);
  });

  console.log(table.toString());

  // Show details for top 3 results
  if (results.length > 0) {
    console.log(chalk.bold("\n💡 Top Opportunities Details:\n"));
    
    results.slice(0, 3).forEach((result, index) => {
      const signal = result.signal;
      const actionColor = signal.action === "BUY" ? chalk.green : chalk.red;
      
      console.log(`${chalk.bold(`#${index + 1} ${result.symbol}`)} - ${actionColor.bold(signal.action)} Signal`);
      console.log(`   Confidence: ${signal.confidence.toFixed(1)}% | Strategy: ${signal.strategy}`);
      console.log(`   Price: $${result.currentPrice.toFixed(2)} | Volume: ${result.volume.toLocaleString()}`);
      
      if (signal.stopLoss && signal.takeProfit) {
        console.log(`   Stop Loss: $${signal.stopLoss.toFixed(2)} | Take Profit: $${signal.takeProfit.toFixed(2)}`);
        console.log(`   Position Size: ${signal.positionSize} shares | Risk: $${signal.riskAmount?.toFixed(2)}`);
      }
      
      console.log(`   Key Reason: ${signal.reasons[0] || "Technical analysis"}`);
      console.log();
    });
  }

  // Summary statistics
  const buySignals = results.filter(r => r.signal.action === "BUY").length;
  const sellSignals = results.filter(r => r.signal.action === "SELL").length;
  const avgConfidence = results.reduce((sum, r) => sum + r.signal.confidence, 0) / results.length;

  console.log(chalk.bold("📊 Discovery Summary:"));
  console.log(chalk.green(`   BUY signals: ${buySignals}`));
  console.log(chalk.red(`   SELL signals: ${sellSignals}`));
  console.log(`   Average confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`   Discovery method: ${discoveryType}`);
}

async function loadWatchlist(filename: string): Promise<string[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filename, "utf8");
    return content
      .split("\\n")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error(chalk.red("Unhandled Rejection at:"), promise, chalk.red("reason:"), reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(chalk.red("Uncaught Exception:"), error);
  process.exit(1);
});

// Parse command line arguments
program.parse();
