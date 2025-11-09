/**
 * Simple RSI Backtest Example
 * Demonstrates how to use the backtesting framework
 */

import { SimpleBacktestEngine } from "../src/backtesting/engine/simple-backtest-engine.js";
import { SimpleRSIStrategy } from "../src/backtesting/strategies/simple-rsi-strategy.js";
import { HistoricalDataManager, type DataSource } from "../src/backtesting/data/historical-data-manager.js";
import {
  FixedBPSSlippageModel,
  ZeroCommissionModel,
} from "../src/backtesting/execution/slippage-models.js";
import type { BacktestConfig } from "../src/backtesting/types/backtest-types.js";

async function main() {
  console.log("=".repeat(60));
  console.log("BACKTESTING FRAMEWORK - SIMPLE RSI EXAMPLE");
  console.log("=".repeat(60));
  console.log();

  // 1. Configure backtest
  const config: BacktestConfig = {
    startDate: new Date("2023-01-01"),
    endDate: new Date("2023-12-31"),
    initialCapital: 10000,
    slippageModel: new FixedBPSSlippageModel(5), // 5 BPS slippage
    commissionModel: new ZeroCommissionModel(),
    fillOnClose: true,
    adjustForSplits: false,
    adjustForDividends: false,
  };

  // 2. Create strategy
  const strategy = new SimpleRSIStrategy({
    rsiPeriod: 14,
    oversoldThreshold: 30,
    overboughtThreshold: 70,
  });

  // 3. Create backtest engine
  const engine = new SimpleBacktestEngine(config, strategy);

  // 4. Load historical data
  console.log("Loading historical data...");
  const dataManager = new HistoricalDataManager();

  // Option A: Load from CSV file
  // const bars = await dataManager.loadFromCSV('./data/AAPL_2023.csv', 'AAPL');

  // Option B: Load from API (requires Alpha Vantage API key)
  const source: DataSource = {
    type: "API",
    // apiKey: "YOUR_API_KEY_HERE" // Optional, will use config
  };

  try {
    const bars = await dataManager.loadData("AAPL", source);
    console.log(`Loaded ${bars.length} bars for AAPL`);
    console.log();

    // 5. Run backtest
    console.log("Running backtest...");
    console.log();
    const result = await engine.run("AAPL", bars);

    // 6. Display results
    console.log("\n" + "=".repeat(60));
    console.log("BACKTEST RESULTS");
    console.log("=".repeat(60));
    console.log();

    console.log("PERFORMANCE SUMMARY");
    console.log("-".repeat(60));
    console.log(`Initial Capital:        $${config.initialCapital.toLocaleString()}`);
    console.log(`Final Equity:           $${result.equityCurve[result.equityCurve.length - 1]?.equity.toLocaleString()}`);
    console.log(`Total Return:           ${result.metrics.totalReturn.toFixed(2)}%`);
    console.log(`Total Return ($):       $${result.metrics.totalReturnDollar.toFixed(2)}`);
    console.log(`CAGR:                   ${result.metrics.cagr.toFixed(2)}%`);
    console.log();

    console.log("RISK METRICS");
    console.log("-".repeat(60));
    console.log(`Volatility (Annual):    ${result.metrics.volatility.toFixed(2)}%`);
    console.log(`Sharpe Ratio:           ${result.metrics.sharpeRatio.toFixed(2)}`);
    console.log(`Sortino Ratio:          ${result.metrics.sortinoRatio.toFixed(2)}`);
    console.log(`Calmar Ratio:           ${result.metrics.calmarRatio.toFixed(2)}`);
    console.log(`Max Drawdown:           ${result.metrics.maxDrawdown.toFixed(2)}%`);
    console.log(`Max DD Duration:        ${result.metrics.maxDrawdownDuration} days`);
    console.log();

    console.log("TRADE STATISTICS");
    console.log("-".repeat(60));
    console.log(`Total Trades:           ${result.metrics.totalTrades}`);
    console.log(`Winning Trades:         ${result.metrics.winningTrades}`);
    console.log(`Losing Trades:          ${result.metrics.losingTrades}`);
    console.log(`Win Rate:               ${result.metrics.winRate.toFixed(2)}%`);
    console.log();

    console.log("WIN/LOSS ANALYSIS");
    console.log("-".repeat(60));
    console.log(`Average Win:            $${result.metrics.avgWin.toFixed(2)} (${result.metrics.avgWinPercent.toFixed(2)}%)`);
    console.log(`Average Loss:           $${result.metrics.avgLoss.toFixed(2)} (${result.metrics.avgLossPercent.toFixed(2)}%)`);
    console.log(`Largest Win:            $${result.metrics.largestWin.toFixed(2)}`);
    console.log(`Largest Loss:           $${result.metrics.largestLoss.toFixed(2)}`);
    console.log(`Profit Factor:          ${result.metrics.profitFactor.toFixed(2)}`);
    console.log(`Payoff Ratio:           ${result.metrics.payoffRatio.toFixed(2)}`);
    console.log(`Expectancy:             $${result.metrics.expectancy.toFixed(2)} per trade`);
    console.log();

    console.log("ADDITIONAL METRICS");
    console.log("-".repeat(60));
    console.log(`Avg Holding Period:     ${result.metrics.avgHoldingPeriod.toFixed(1)} days`);
    console.log(`Max Consecutive Wins:   ${result.metrics.maxConsecutiveWins}`);
    console.log(`Max Consecutive Losses: ${result.metrics.maxConsecutiveLosses}`);
    console.log(`Trading Days:           ${result.metrics.tradingDays}`);
    console.log();

    console.log("TRANSACTION COSTS");
    console.log("-".repeat(60));
    console.log(`Total Commissions:      $${result.metrics.totalCommissions.toFixed(2)}`);
    console.log(`Total Slippage:         $${result.metrics.totalSlippage.toFixed(2)}`);
    console.log(`Total Costs:            $${result.metrics.totalCosts.toFixed(2)}`);
    console.log();

    // Display first 5 and last 5 trades
    if (result.trades.length > 0) {
      console.log("SAMPLE TRADES (First 5)");
      console.log("-".repeat(60));
      result.trades.slice(0, 5).forEach((trade, idx) => {
        console.log(
          `${idx + 1}. ${trade.side} ${trade.quantity} @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} | ` +
          `P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%) | ` +
          `Hold: ${trade.holdingPeriod} days`
        );
      });
      console.log();

      if (result.trades.length > 5) {
        console.log("SAMPLE TRADES (Last 5)");
        console.log("-".repeat(60));
        result.trades.slice(-5).forEach((trade, idx) => {
          console.log(
            `${result.trades.length - 4 + idx}. ${trade.side} ${trade.quantity} @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} | ` +
            `P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%) | ` +
            `Hold: ${trade.holdingPeriod} days`
          );
        });
        console.log();
      }
    }

    console.log("=".repeat(60));
    console.log("Backtest completed successfully!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Error running backtest:", error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
