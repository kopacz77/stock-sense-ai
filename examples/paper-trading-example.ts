/**
 * Paper Trading System - Complete Example
 * Demonstrates how to use the paper trading system with a strategy
 */

import { PaperTradingEngine } from "../src/paper-trading/engine/paper-trading-engine.js";
import { PaperTradingAPI } from "../src/paper-trading/api/paper-trading-api.js";
import type { PaperTradingConfig } from "../src/paper-trading/types/paper-trading-types.js";
import { FixedBPSSlippageModel } from "../src/backtesting/execution/slippage-models.js";
import { ZeroCommissionModel } from "../src/backtesting/execution/commission-models.js";
import { MeanReversionStrategy } from "../src/strategies/mean-reversion-strategy.js";

/**
 * Example: Run paper trading with Mean Reversion strategy
 */
async function runPaperTradingExample(): Promise<void> {
  console.log("Starting Paper Trading Example...\n");

  // 1. Configure Paper Trading System
  const config: PaperTradingConfig = {
    // Initial capital
    initialCapital: 10000,

    // Execution models
    slippageModel: new FixedBPSSlippageModel(5), // 5 BPS slippage
    commissionModel: new ZeroCommissionModel(), // Zero commission (like Robinhood)

    // Risk limits
    maxPositionSize: 2500, // Max $2500 per position
    maxPositionPercent: 0.25, // Max 25% of portfolio per position
    maxPositions: 10, // Max 10 concurrent positions
    maxDailyLoss: 500, // Stop trading if daily loss exceeds $500
    maxDailyLossPercent: 0.05, // Stop if daily loss exceeds 5%
    maxTotalExposure: 0.8, // Max 80% of portfolio in positions
    maxSymbolConcentration: 0.3, // Max 30% in any single symbol

    // Execution settings
    executeOnClose: false, // Execute at current price
    partialFills: false, // No partial fills for simplicity
    maxSlippageBPS: 20, // Reject orders with >20 BPS slippage

    // Market hours (9:30 AM - 4:00 PM ET)
    enforceMarketHours: true,
    marketOpenHour: 9,
    marketOpenMinute: 30,
    marketCloseHour: 16,
    marketCloseMinute: 0,
    timezone: "America/New_York",

    // Order management
    defaultTimeInForce: "GTC", // Good till cancelled
    defaultOrderExpiration: 0, // No expiration

    // Data refresh
    dataRefreshInterval: 60000, // Fetch market data every 1 minute

    // Storage
    enableEncryption: true,
    backupEnabled: true,
    backupInterval: 3600000, // Backup every 1 hour
  };

  // 2. Initialize Paper Trading Engine
  const engine = new PaperTradingEngine(config, "./data/paper-trading");
  await engine.initialize();

  console.log("Paper Trading Engine initialized");

  // 3. Setup event listeners
  engine.on("started", ({ strategy, symbols }) => {
    console.log(`\nTrading started with ${strategy} strategy`);
    console.log(`Watching symbols: ${symbols.join(", ")}`);
  });

  engine.on("order-created", ({ order }) => {
    console.log(`\nOrder created: ${order.side} ${order.quantity} ${order.symbol} @ ${order.type}`);
  });

  engine.on("order-filled", ({ order, fillResult }) => {
    console.log(
      `\nOrder filled: ${order.side} ${fillResult.fillQuantity} ${order.symbol} @ $${fillResult.fillPrice.toFixed(2)}`
    );
    console.log(`  Commission: $${fillResult.commission.toFixed(2)}`);
    console.log(`  Slippage: $${fillResult.slippage.toFixed(2)}`);
  });

  engine.on("position-opened", ({ position }) => {
    console.log(`\nPosition opened: ${position.symbol}`);
    console.log(`  Entry: $${position.entryPrice.toFixed(2)}`);
    console.log(`  Quantity: ${position.quantity}`);
    console.log(`  Value: $${position.currentValue.toFixed(2)}`);
  });

  engine.on("position-closed", ({ trade }) => {
    console.log(`\nPosition closed: ${trade.symbol}`);
    console.log(`  Entry: $${trade.entryPrice.toFixed(2)}`);
    console.log(`  Exit: $${trade.exitPrice.toFixed(2)}`);
    console.log(`  P&L: ${trade.netPnL >= 0 ? "+" : ""}$${trade.netPnL.toFixed(2)} (${trade.returnPercent.toFixed(2)}%)`);
    console.log(`  Hold: ${trade.holdDurationDays.toFixed(1)} days`);
  });

  engine.on("error", (error) => {
    console.error("\nError:", error);
  });

  // 4. Create Mean Reversion Strategy
  const strategy = new MeanReversionStrategy({
    rsiOversold: 30,
    rsiOverbought: 70,
    mfiOversold: 20,
    mfiOverbought: 80,
    bbStdDev: 2,
    minConfidence: 60,
    volumeThreshold: 1.2,
    maxHoldingPeriod: 30,
  });

  // 5. Start Paper Trading
  const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"];
  await engine.start(strategy, symbols);

  // 6. Start Web API (optional)
  const api = new PaperTradingAPI(engine, 3000);
  await api.start();

  console.log("\nWeb API started on http://localhost:3000");
  console.log("\nAPI Endpoints:");
  console.log("  GET  /api/paper/status      - Engine status");
  console.log("  GET  /api/paper/portfolio   - Portfolio details");
  console.log("  GET  /api/paper/orders      - Active orders");
  console.log("  GET  /api/paper/trades      - Trade history");
  console.log("  GET  /api/paper/performance - Performance metrics");
  console.log("  GET  /api/paper/dashboard   - Dashboard summary");
  console.log("  POST /api/paper/stop        - Stop trading");

  // 7. Display status every 30 seconds
  setInterval(async () => {
    const status = engine.getStatus();
    const portfolio = engine.getPortfolio();

    console.log("\n" + "=".repeat(60));
    console.log("STATUS UPDATE");
    console.log("=".repeat(60));
    console.log(`Portfolio Value: $${status.currentValue.toFixed(2)}`);
    console.log(
      `Daily P&L: ${status.dailyPnL >= 0 ? "+" : ""}$${status.dailyPnL.toFixed(2)}`
    );
    console.log(
      `Total P&L: ${status.totalPnL >= 0 ? "+" : ""}$${status.totalPnL.toFixed(2)} (${portfolio.totalReturnPercent.toFixed(2)}%)`
    );
    console.log(`Active Positions: ${status.activePositions}`);
    console.log(`Total Trades: ${portfolio.totalTrades}`);
    console.log(`Win Rate: ${portfolio.winRate.toFixed(2)}%`);

    // Show performance metrics every 5 minutes
    if (Date.now() % 300000 < 30000) {
      const perf = await engine.getPerformance();

      console.log("\nPERFORMANCE METRICS:");
      console.log(`  Sharpe Ratio: ${perf.sharpeRatio.toFixed(2)}`);
      console.log(`  Max Drawdown: ${perf.maxDrawdown.toFixed(2)}%`);
      console.log(`  Profit Factor: ${perf.profitFactor.toFixed(2)}`);
      console.log(`  Expectancy: $${perf.expectancy.toFixed(2)}`);
    }
  }, 30000);

  // 8. Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\nShutting down gracefully...");
    await engine.stop();
    await api.stop();

    // Final report
    const finalPerf = await engine.getPerformance();
    const finalPortfolio = engine.getPortfolio();

    console.log("\n" + "=".repeat(60));
    console.log("FINAL REPORT");
    console.log("=".repeat(60));
    console.log(`\nFinal Portfolio Value: $${finalPortfolio.totalValue.toFixed(2)}`);
    console.log(`Initial Capital: $${finalPortfolio.initialCapital.toFixed(2)}`);
    console.log(
      `Total Return: ${finalPortfolio.totalPnL >= 0 ? "+" : ""}$${finalPortfolio.totalPnL.toFixed(2)} (${finalPortfolio.totalReturnPercent.toFixed(2)}%)`
    );

    console.log(`\nTotal Trades: ${finalPerf.totalTrades}`);
    console.log(`Win Rate: ${finalPerf.winRate.toFixed(2)}%`);
    console.log(`Profit Factor: ${finalPerf.profitFactor.toFixed(2)}`);
    console.log(`Sharpe Ratio: ${finalPerf.sharpeRatio.toFixed(2)}`);
    console.log(`Max Drawdown: ${finalPerf.maxDrawdown.toFixed(2)}%`);

    console.log(`\nTotal Commissions: $${finalPortfolio.totalCommissions.toFixed(2)}`);
    console.log(`Total Slippage: $${finalPortfolio.totalSlippage.toFixed(2)}`);

    process.exit(0);
  });
}

// Run example
runPaperTradingExample().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
