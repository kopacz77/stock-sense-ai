/**
 * CLI Commands for Paper Trading System
 * Provides command-line interface for managing paper trading
 */

import { Command } from "commander";
import chalk from "chalk";
import { PaperTradingEngine } from "../paper-trading/engine/paper-trading-engine.js";
import type { PaperTradingConfig } from "../paper-trading/types/paper-trading-types.js";
import { FixedBPSSlippageModel } from "../backtesting/execution/slippage-models.js";
import { ZeroCommissionModel } from "../backtesting/execution/commission-models.js";
import { MeanReversionStrategy } from "../strategies/mean-reversion-strategy.js";
import { MomentumStrategy } from "../strategies/momentum-strategy.js";

// Global engine instance (will be loaded from storage)
let engine: PaperTradingEngine | null = null;

/**
 * Initialize engine with default config
 */
async function initializeEngine(): Promise<PaperTradingEngine> {
  if (engine) {
    return engine;
  }

  const config: PaperTradingConfig = {
    initialCapital: 10000,
    slippageModel: new FixedBPSSlippageModel(5),
    commissionModel: new ZeroCommissionModel(),
    maxPositionSize: 2500, // $2500 max per position
    maxPositionPercent: 0.25, // 25% max
    maxPositions: 10,
    maxDailyLoss: 500, // $500 daily loss limit
    maxDailyLossPercent: 0.05, // 5% daily loss limit
    maxTotalExposure: 0.8, // 80% max exposure
    maxSymbolConcentration: 0.3, // 30% max in single symbol
    executeOnClose: false,
    partialFills: false,
    maxSlippageBPS: 20,
    enforceMarketHours: true,
    marketOpenHour: 9,
    marketOpenMinute: 30,
    marketCloseHour: 16,
    marketCloseMinute: 0,
    timezone: "America/New_York",
    defaultTimeInForce: "GTC",
    defaultOrderExpiration: 0,
    dataRefreshInterval: 60000, // 1 minute
    enableEncryption: true,
    backupEnabled: true,
    backupInterval: 3600000, // 1 hour
  };

  engine = new PaperTradingEngine(config);
  await engine.initialize();

  return engine;
}

/**
 * Register paper trading commands
 */
export function registerPaperTradingCommands(program: Command): void {
  const paper = program
    .command("paper")
    .description("Paper trading commands");

  // Start paper trading
  paper
    .command("start")
    .description("Start paper trading with a strategy")
    .requiredOption("-s, --strategy <name>", "Strategy name (mean-reversion, momentum)")
    .option("-c, --capital <amount>", "Initial capital", "10000")
    .option("-y, --symbols <symbols>", "Comma-separated symbols", "AAPL,MSFT,GOOGL")
    .action(async (options) => {
      try {
        const eng = await initializeEngine();

        // Select strategy
        let strategy;
        if (options.strategy === "mean-reversion") {
          strategy = new MeanReversionStrategy({
            rsiOversold: 30,
            rsiOverbought: 70,
            mfiOversold: 20,
            mfiOverbought: 80,
            bbStdDev: 2,
            minConfidence: 60,
            volumeThreshold: 1.2,
            maxHoldingPeriod: 30,
          });
        } else if (options.strategy === "momentum") {
          strategy = new MomentumStrategy({
            emaPeriod: 20,
            rsiPeriod: 14,
            macdFastPeriod: 12,
            macdSlowPeriod: 26,
            macdSignalPeriod: 9,
            minTrendStrength: 60,
            minConfidence: 65,
            volumeConfirmation: true,
            maxHoldingPeriod: 60,
          });
        } else {
          console.log(chalk.red(`Unknown strategy: ${options.strategy}`));
          process.exit(1);
        }

        const symbols = options.symbols.split(",").map((s: string) => s.trim());

        await eng.start(strategy, symbols);

        console.log(chalk.green("Paper trading started!"));
        console.log(chalk.blue(`Strategy: ${options.strategy}`));
        console.log(chalk.blue(`Symbols: ${symbols.join(", ")}`));
        console.log(chalk.blue(`Initial Capital: $${options.capital}`));
        console.log(chalk.yellow("\nPress Ctrl+C to stop"));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Stop paper trading
  paper
    .command("stop")
    .description("Stop paper trading")
    .action(async () => {
      try {
        const eng = await initializeEngine();
        await eng.stop();

        console.log(chalk.green("Paper trading stopped"));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Get status
  paper
    .command("status")
    .description("Get paper trading status")
    .action(async () => {
      try {
        const eng = await initializeEngine();
        const status = eng.getStatus();

        console.log(chalk.bold("\nPaper Trading Status"));
        console.log(chalk.gray("=".repeat(50)));

        console.log(chalk.blue(`Running: ${status.running ? "Yes" : "No"}`));
        if (status.startTime) {
          console.log(chalk.blue(`Started: ${status.startTime.toLocaleString()}`));
        }
        if (status.uptime) {
          const hours = Math.floor(status.uptime / (1000 * 60 * 60));
          const minutes = Math.floor((status.uptime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(chalk.blue(`Uptime: ${hours}h ${minutes}m`));
        }

        console.log(chalk.green(`\nPortfolio Value: $${status.currentValue.toFixed(2)}`));
        console.log(chalk[status.dailyPnL >= 0 ? "green" : "red"](
          `Daily P&L: ${status.dailyPnL >= 0 ? "+" : ""}$${status.dailyPnL.toFixed(2)}`
        ));
        console.log(chalk[status.totalPnL >= 0 ? "green" : "red"](
          `Total P&L: ${status.totalPnL >= 0 ? "+" : ""}$${status.totalPnL.toFixed(2)}`
        ));

        console.log(chalk.blue(`\nActive Positions: ${status.activePositions}`));
        console.log(chalk.blue(`Open Orders: ${status.openOrders}`));
        console.log(chalk.blue(`Total Orders: ${status.totalOrders}`));
        console.log(chalk.blue(`Filled Orders: ${status.filledOrders}`));
        console.log(chalk.blue(`Cancelled Orders: ${status.cancelledOrders}`));

        if (status.errors > 0) {
          console.log(chalk.red(`\nErrors: ${status.errors}`));
          if (status.lastError) {
            console.log(chalk.red(`Last Error: ${status.lastError}`));
          }
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Get portfolio
  paper
    .command("portfolio")
    .description("Show portfolio positions and value")
    .action(async () => {
      try {
        const eng = await initializeEngine();
        const portfolio = eng.getPortfolio();

        console.log(chalk.bold("\nPortfolio Overview"));
        console.log(chalk.gray("=".repeat(50)));

        console.log(chalk.green(`Total Value: $${portfolio.totalValue.toFixed(2)}`));
        console.log(chalk.blue(`Cash: $${portfolio.cash.toFixed(2)}`));
        console.log(chalk.blue(`Positions Value: $${portfolio.positionsValue.toFixed(2)}`));

        console.log(chalk[portfolio.totalPnL >= 0 ? "green" : "red"](
          `Total P&L: ${portfolio.totalPnL >= 0 ? "+" : ""}$${portfolio.totalPnL.toFixed(2)} ` +
            `(${portfolio.totalReturnPercent.toFixed(2)}%)`
        ));

        console.log(chalk.blue(`\nWin Rate: ${portfolio.winRate.toFixed(2)}%`));
        console.log(chalk.blue(`Total Trades: ${portfolio.totalTrades}`));
        console.log(chalk.blue(`Max Drawdown: ${portfolio.maxDrawdown.toFixed(2)}%`));

        if (portfolio.positions.size > 0) {
          console.log(chalk.bold("\nOpen Positions:"));
          console.log(chalk.gray("=".repeat(50)));

          for (const [symbol, position] of portfolio.positions) {
            console.log(chalk.bold(`\n${symbol}:`));
            console.log(chalk.blue(`  Quantity: ${position.quantity}`));
            console.log(chalk.blue(`  Entry Price: $${position.entryPrice.toFixed(2)}`));
            console.log(chalk.blue(`  Current Price: $${position.currentPrice.toFixed(2)}`));
            console.log(chalk.blue(`  Value: $${position.currentValue.toFixed(2)}`));
            console.log(chalk[position.unrealizedPnL >= 0 ? "green" : "red"](
              `  Unrealized P&L: ${position.unrealizedPnL >= 0 ? "+" : ""}$${position.unrealizedPnL.toFixed(2)} ` +
                `(${position.unrealizedPnLPercent.toFixed(2)}%)`
            ));
          }
        }

        console.log(chalk.gray("\nCommissions: $" + portfolio.totalCommissions.toFixed(2)));
        console.log(chalk.gray("Slippage: $" + portfolio.totalSlippage.toFixed(2)));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Get orders
  paper
    .command("orders")
    .description("Show active orders")
    .action(async () => {
      try {
        const eng = await initializeEngine();
        const orders = eng.getOrders();

        console.log(chalk.bold("\nActive Orders"));
        console.log(chalk.gray("=".repeat(50)));

        if (orders.size === 0) {
          console.log(chalk.yellow("No active orders"));
          return;
        }

        for (const [orderId, order] of orders) {
          console.log(chalk.bold(`\nOrder ${orderId.substring(0, 8)}:`));
          console.log(chalk.blue(`  Symbol: ${order.symbol}`));
          console.log(chalk.blue(`  Type: ${order.type}`));
          console.log(chalk.blue(`  Side: ${order.side}`));
          console.log(chalk.blue(`  Quantity: ${order.quantity}`));
          console.log(chalk.blue(`  Status: ${order.status}`));
          console.log(chalk.blue(`  Created: ${order.createdAt.toLocaleString()}`));
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Get trades
  paper
    .command("trades")
    .description("Show trade history")
    .option("-n, --last <count>", "Number of last trades to show", "10")
    .action(async (options) => {
      try {
        const eng = await initializeEngine();
        const allTrades = eng.getTrades();
        const trades = allTrades.slice(-parseInt(options.last));

        console.log(chalk.bold("\nTrade History"));
        console.log(chalk.gray("=".repeat(50)));

        if (trades.length === 0) {
          console.log(chalk.yellow("No trades yet"));
          return;
        }

        for (const trade of trades.reverse()) {
          console.log(chalk.bold(`\n${trade.symbol}:`));
          console.log(chalk.blue(`  Entry: $${trade.entryPrice.toFixed(2)} @ ${new Date(trade.entryTime).toLocaleString()}`));
          console.log(chalk.blue(`  Exit: $${trade.exitPrice.toFixed(2)} @ ${new Date(trade.exitTime).toLocaleString()}`));
          console.log(chalk.blue(`  Quantity: ${trade.quantity}`));
          console.log(chalk[trade.netPnL >= 0 ? "green" : "red"](
            `  P&L: ${trade.netPnL >= 0 ? "+" : ""}$${trade.netPnL.toFixed(2)} (${trade.returnPercent.toFixed(2)}%)`
          ));
          console.log(chalk.blue(`  Exit Reason: ${trade.exitReason}`));
          console.log(chalk.gray(`  Hold: ${trade.holdDurationDays.toFixed(1)} days`));
        }

        console.log(chalk.bold(`\nTotal: ${allTrades.length} trades`));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Get performance
  paper
    .command("performance")
    .description("Show performance metrics")
    .action(async () => {
      try {
        const eng = await initializeEngine();
        const perf = await eng.getPerformance();

        console.log(chalk.bold("\nPerformance Metrics"));
        console.log(chalk.gray("=".repeat(50)));

        console.log(chalk.bold("\nReturns:"));
        console.log(chalk.blue(`  Daily: ${perf.dailyReturn.toFixed(2)}%`));
        console.log(chalk.blue(`  Weekly: ${perf.weeklyReturn.toFixed(2)}%`));
        console.log(chalk.blue(`  Monthly: ${perf.monthlyReturn.toFixed(2)}%`));
        console.log(chalk[perf.totalReturn >= 0 ? "green" : "red"](
          `  Total: ${perf.totalReturn >= 0 ? "+" : ""}${perf.totalReturn.toFixed(2)}%`
        ));

        console.log(chalk.bold("\nRisk Metrics:"));
        console.log(chalk.blue(`  Sharpe Ratio: ${perf.sharpeRatio.toFixed(2)}`));
        console.log(chalk.blue(`  Sortino Ratio: ${perf.sortinoRatio.toFixed(2)}`));
        console.log(chalk.blue(`  Max Drawdown: ${perf.maxDrawdown.toFixed(2)}%`));
        console.log(chalk.blue(`  Current Drawdown: ${perf.currentDrawdown.toFixed(2)}%`));

        console.log(chalk.bold("\nTrade Statistics:"));
        console.log(chalk.blue(`  Total Trades: ${perf.totalTrades}`));
        console.log(chalk.blue(`  Win Rate: ${perf.winRate.toFixed(2)}%`));
        console.log(chalk.blue(`  Profit Factor: ${perf.profitFactor.toFixed(2)}`));
        console.log(chalk.blue(`  Expectancy: $${perf.expectancy.toFixed(2)}`));

        console.log(chalk.bold("\nWin/Loss:"));
        console.log(chalk.green(`  Avg Win: $${perf.avgWin.toFixed(2)}`));
        console.log(chalk.red(`  Avg Loss: $${perf.avgLoss.toFixed(2)}`));
        console.log(chalk.green(`  Largest Win: $${perf.largestWin.toFixed(2)}`));
        console.log(chalk.red(`  Largest Loss: $${perf.largestLoss.toFixed(2)}`));

        console.log(chalk.bold("\nCosts:"));
        console.log(chalk.gray(`  Commissions: $${perf.totalCommissions.toFixed(2)}`));
        console.log(chalk.gray(`  Slippage: $${perf.totalSlippage.toFixed(2)}`));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Reset
  paper
    .command("reset")
    .description("Reset paper trading portfolio (WARNING: Deletes all data)")
    .action(async () => {
      try {
        console.log(chalk.yellow("\nWARNING: This will delete all paper trading data!"));
        // In production, add confirmation prompt

        const eng = await initializeEngine();
        await eng.reset();

        console.log(chalk.green("Paper trading portfolio reset"));
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}
