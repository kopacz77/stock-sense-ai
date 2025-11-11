/**
 * CLI Commands for Backtesting
 * Run backtests with strategies on historical data
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Command } from 'commander';
import { BacktestEngine } from '../backtesting/engine/backtest-engine.js';
import { SimpleBacktestEngine } from '../backtesting/engine/simple-backtest-engine.js';
import { HistoricalDataManager } from '../backtesting/data/historical-data-manager.js';
import { MarketDataService } from '../data/market-data-service.js';
import { MeanReversionStrategy } from '../strategies/mean-reversion-strategy.js';
import { MomentumStrategy } from '../strategies/momentum-strategy.js';
import { FixedBPSSlippageModel } from '../backtesting/execution/slippage-models.js';
import { FixedCommissionModel } from '../backtesting/execution/commission-models.js';
import type { BacktestConfig, BacktestStrategy } from '../backtesting/types/backtest-types.js';
import type { HistoricalData } from '../types/trading.js';

/**
 * Strategy adapter to convert trading strategies to backtest strategies
 */
class StrategyAdapter implements BacktestStrategy {
  constructor(
    private strategy: MeanReversionStrategy | MomentumStrategy,
    private strategyName: string
  ) {}

  getName(): string {
    return this.strategyName;
  }

  async generateSignal(
    symbol: string,
    currentData: any,
    historicalData: any[]
  ): Promise<any> {
    // This is a simplified adapter - in production you'd need more sophisticated conversion
    const signal = await this.strategy.analyze(symbol, historicalData as HistoricalData[]);
    return signal;
  }

  async initialize(): Promise<void> {
    // No initialization needed for these strategies
  }

  async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

export function registerBacktestCommands(program: Command): void {
  const backtestCmd = program.command('backtest');

  /**
   * Run backtest command
   */
  backtestCmd
    .command('run <symbol>')
    .description('Run backtest on a symbol with a strategy')
    .option('-s, --strategy <name>', 'Strategy name (mean-reversion, momentum)', 'mean-reversion')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', getDefaultToDate())
    .option('-c, --capital <amount>', 'Initial capital', '100000')
    .option('--commission <amount>', 'Commission per trade', '0')
    .option('--slippage <bps>', 'Slippage in basis points', '5')
    .option('--detailed', 'Show detailed results')
    .action(async (symbol: string, options) => {
      const spinner = ora('Initializing backtest...').start();

      try {
        // Initialize market data service
        const marketData = new MarketDataService();
        await marketData.initialize();

        // Load historical data
        spinner.text = `Loading historical data for ${symbol}...`;
        const from = new Date(options.from);
        const to = new Date(options.to);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        const historicalData = await marketData.fetchHistoricalData(symbol, from, to);

        if (historicalData.length === 0) {
          throw new Error(`No historical data found for ${symbol}`);
        }

        spinner.text = `Loaded ${historicalData.length} data points`;

        // Select strategy
        let strategy;
        if (options.strategy === 'mean-reversion') {
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
        } else if (options.strategy === 'momentum') {
          strategy = new MomentumStrategy({
            shortMA: 20,
            longMA: 50,
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,
            trendStrength: 0.02,
            minConfidence: 65,
            volumeThreshold: 1.5,
          });
        } else {
          throw new Error(`Unknown strategy: ${options.strategy}`);
        }

        // Use SimpleBacktestEngine for now (simpler integration)
        spinner.text = 'Running backtest...';

        const strategyAdapter = new StrategyAdapter(strategy, options.strategy);
        const backtestEngine = new SimpleBacktestEngine({
          id: `backtest-${Date.now()}`,
          name: `${symbol} ${options.strategy} backtest`,
          symbols: [symbol],
          initialCapital: parseFloat(options.capital),
          commissionModel: new FixedCommissionModel(parseFloat(options.commission)),
          slippageModel: new FixedBPSSlippageModel(parseFloat(options.slippage)),
          startDate: from,
          endDate: to,
          commission: { type: 'FIXED', fixedFee: parseFloat(options.commission) },
          slippage: { type: 'FIXED', fixedAmount: parseFloat(options.slippage) },
          strategy: {
            name: options.strategy,
            parameters: {},
          },
        }, strategyAdapter);

        const result = await backtestEngine.run(symbol, historicalData as any);

        spinner.succeed('Backtest complete!');

        // Display results
        displayBacktestResults(symbol, result, options);

      } catch (error) {
        spinner.fail('Backtest failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Compare strategies command
   */
  backtestCmd
    .command('compare <symbol>')
    .description('Compare multiple strategies on the same symbol')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', getDefaultToDate())
    .option('-c, --capital <amount>', 'Initial capital', '100000')
    .action(async (symbol: string, options) => {
      const spinner = ora('Initializing comparison...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const from = new Date(options.from);
        const to = new Date(options.to);

        spinner.text = `Loading historical data for ${symbol}...`;
        const historicalData = await marketData.fetchHistoricalData(symbol, from, to);

        if (historicalData.length === 0) {
          throw new Error(`No historical data found for ${symbol}`);
        }

        const strategies = [
          {
            name: 'Mean Reversion',
            strategy: new MeanReversionStrategy({
              rsiOversold: 30,
              rsiOverbought: 70,
              mfiOversold: 20,
              mfiOverbought: 80,
              bbStdDev: 2,
              minConfidence: 60,
              volumeThreshold: 1.2,
              maxHoldingPeriod: 30,
            }),
          },
          {
            name: 'Momentum',
            strategy: new MomentumStrategy({
              shortMA: 20,
              longMA: 50,
              macdFast: 12,
              macdSlow: 26,
              macdSignal: 9,
              trendStrength: 0.02,
              minConfidence: 65,
              volumeThreshold: 1.5,
            }),
          },
        ];

        const results: any[] = [];

        for (const { name, strategy } of strategies) {
          spinner.text = `Running ${name} strategy...`;

          const strategyAdapter = new StrategyAdapter(strategy, name);
          const backtestEngine = new SimpleBacktestEngine({
            id: `backtest-${name}-${Date.now()}`,
            name: `${symbol} ${name} comparison`,
            symbols: [symbol],
            initialCapital: parseFloat(options.capital),
            commissionModel: new FixedCommissionModel(0),
            slippageModel: new FixedBPSSlippageModel(5),
            startDate: from,
            endDate: to,
            commission: { type: 'FIXED', fixedFee: 0 },
            slippage: { type: 'FIXED', fixedAmount: 5 },
            strategy: {
              name: name,
              parameters: {},
            },
          }, strategyAdapter);

          const result = await backtestEngine.run(symbol, historicalData as any);
          results.push({ name, result });
        }

        spinner.succeed('Comparison complete!');

        // Display comparison table
        displayComparisonResults(symbol, results);

      } catch (error) {
        spinner.fail('Comparison failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });
}

function displayBacktestResults(symbol: string, result: any, options: any): void {
  console.log(chalk.bold(`\n📊 Backtest Results for ${symbol.toUpperCase()}\n`));

  const summaryTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [30, 20],
  });

  summaryTable.push(
    ['Initial Capital', `$${result.initialCapital.toLocaleString()}`],
    ['Final Value', `$${result.finalValue.toLocaleString()}`],
    ['Total Return', chalk[result.totalReturn >= 0 ? 'green' : 'red'](`${result.totalReturn.toFixed(2)}%`)],
    ['Total Trades', result.totalTrades.toString()],
    ['Winning Trades', chalk.green(result.winningTrades.toString())],
    ['Losing Trades', chalk.red(result.losingTrades.toString())],
    ['Win Rate', `${result.winRate.toFixed(2)}%`],
    ['Profit Factor', result.profitFactor.toFixed(2)],
    ['Sharpe Ratio', result.sharpeRatio.toFixed(2)],
    ['Max Drawdown', chalk.red(`${result.maxDrawdown.toFixed(2)}%`)],
  );

  console.log(summaryTable.toString());

  if (options.detailed && result.trades && result.trades.length > 0) {
    console.log(chalk.bold('\n📝 Recent Trades (Last 10):\n'));

    const tradesTable = new Table({
      head: ['Entry Date', 'Exit Date', 'Entry Price', 'Exit Price', 'P&L', 'Return'],
      colWidths: [15, 15, 12, 12, 12, 10],
    });

    const recentTrades = result.trades.slice(-10);

    for (const trade of recentTrades) {
      const pnl = trade.exitPrice - trade.entryPrice;
      const returnPct = ((pnl / trade.entryPrice) * 100).toFixed(2);

      tradesTable.push([
        trade.entryDate.substring(0, 10),
        trade.exitDate.substring(0, 10),
        `$${trade.entryPrice.toFixed(2)}`,
        `$${trade.exitPrice.toFixed(2)}`,
        chalk[pnl >= 0 ? 'green' : 'red'](`$${pnl.toFixed(2)}`),
        chalk[pnl >= 0 ? 'green' : 'red'](`${returnPct}%`),
      ]);
    }

    console.log(tradesTable.toString());
  }

  console.log(chalk.gray('\n💡 Tip: Use --detailed flag to see individual trades'));
}

function displayComparisonResults(symbol: string, results: any[]): void {
  console.log(chalk.bold(`\n📊 Strategy Comparison for ${symbol.toUpperCase()}\n`));

  const table = new Table({
    head: ['Strategy', 'Return', 'Trades', 'Win Rate', 'Sharpe', 'Max DD'],
    colWidths: [20, 12, 10, 12, 10, 12],
  });

  for (const { name, result } of results) {
    table.push([
      name,
      chalk[result.totalReturn >= 0 ? 'green' : 'red'](`${result.totalReturn.toFixed(2)}%`),
      result.totalTrades.toString(),
      `${result.winRate.toFixed(1)}%`,
      result.sharpeRatio.toFixed(2),
      chalk.red(`${result.maxDrawdown.toFixed(2)}%`),
    ]);
  }

  console.log(table.toString());

  // Find best strategy
  const bestStrategy = results.reduce((best, current) => {
    return current.result.totalReturn > best.result.totalReturn ? current : best;
  });

  console.log(chalk.green(`\n🏆 Best Strategy: ${bestStrategy.name} (${bestStrategy.result.totalReturn.toFixed(2)}% return)`));
}

function getDefaultFromDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1); // 1 year ago
  return date.toISOString().split('T')[0] ?? '';
}

function getDefaultToDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}
