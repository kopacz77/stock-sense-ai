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
import type { BacktestConfig, BacktestStrategy, HistoricalDataPoint, Bar, EquityCurvePoint, DrawdownPoint, Trade } from '../backtesting/types/backtest-types.js';
import type { HistoricalData, Signal } from '../types/trading.js';
import type { ParameterRange, WalkForwardConfig, OptimizationConfig, OptimizationRunResult, WalkForwardResult } from '../backtesting/optimization/types.js';
import { MarketDataProvider } from '../backtesting/data/market-data-provider.js';
import { GridSearchOptimizer } from '../backtesting/optimization/grid-search.js';
import { WalkForwardAnalyzer } from '../backtesting/optimization/walk-forward.js';

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
    _currentData: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal> {
    // Convert HistoricalDataPoint[] to HistoricalData[] for strategy
    const convertedData: HistoricalData[] = historicalData.map(point => ({
      date: point.timestamp.toISOString().split('T')[0] ?? '',
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }));

    const signal = await this.strategy.analyze(symbol, convertedData);
    return signal;
  }

  async onBar(
    symbol: string,
    _bar: HistoricalDataPoint,
    historicalData: HistoricalDataPoint[]
  ): Promise<Signal | null> {
    // Convert to HistoricalData format expected by strategies
    const convertedData: HistoricalData[] = historicalData.map(point => ({
      date: point.timestamp.toISOString().split('T')[0] ?? '',
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }));

    const signal = await this.strategy.analyze(symbol, convertedData);
    return signal.action === 'HOLD' ? null : signal;
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
    .option('--report', 'Generate full performance report with equity curve')
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

        // Convert HistoricalData[] to Bar[] for backtest engine
        const bars: Bar[] = historicalData.map(h => ({
          symbol: symbol.toUpperCase(),
          timestamp: new Date(h.date),
          open: h.open,
          high: h.high,
          low: h.low,
          close: h.close,
          volume: h.volume,
        }));

        const result = await backtestEngine.run(symbol, bars);

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

          // Convert HistoricalData[] to Bar[] for backtest engine
          const bars: Bar[] = historicalData.map(h => ({
            symbol: symbol.toUpperCase(),
            timestamp: new Date(h.date),
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.close,
            volume: h.volume,
          }));

          const result = await backtestEngine.run(symbol, bars);
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

  /**
   * Optimize strategy parameters using grid search
   */
  backtestCmd
    .command('optimize <symbol>')
    .description('Optimize strategy parameters using grid search')
    .option('-s, --strategy <name>', 'Strategy name (mean-reversion, momentum)', 'mean-reversion')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', getDefaultToDate())
    .option('-c, --capital <amount>', 'Initial capital', '100000')
    .option('-o, --objective <metric>', 'Optimization objective (sharpeRatio, totalReturn, winRate)', 'sharpeRatio')
    .action(async (symbol: string, options: {
      strategy: string;
      from: string;
      to: string;
      capital: string;
      objective: string;
    }) => {
      const spinner = ora('Initializing optimization...').start();

      try {
        // Initialize data provider
        const dataProvider = new MarketDataProvider();
        await dataProvider.initialize();

        const from = new Date(options.from);
        const to = new Date(options.to);

        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        spinner.text = `Setting up grid search for ${symbol}...`;

        // Get parameter ranges
        const parameterRanges = getDefaultParameterRanges(options.strategy);
        const strategyFactory = createStrategyFactory(options.strategy);

        // Calculate total combinations
        let totalCombinations = 1;
        for (const range of parameterRanges) {
          if (range.min !== undefined && range.max !== undefined && range.step !== undefined) {
            const count = Math.floor((range.max - range.min) / range.step) + 1;
            totalCombinations *= count;
          }
        }

        spinner.info(`Grid search will test ${totalCombinations} parameter combinations`);
        spinner.start('Running optimization...');

        // Create optimization config
        const optimizationConfig: OptimizationConfig = {
          id: `opt-${Date.now()}`,
          name: `${symbol} ${options.strategy} optimization`,
          backtestConfig: {
            id: `backtest-${Date.now()}`,
            name: `${symbol} ${options.strategy}`,
            symbols: [symbol],
            initialCapital: parseFloat(options.capital),
            startDate: from,
            endDate: to,
            commission: { type: 'FIXED', fixedFee: 0 },
            slippage: { type: 'FIXED', fixedAmount: 5 },
            strategy: {
              name: options.strategy,
              parameters: {},
            },
          },
          parameterRanges,
          method: 'grid',
          objective: options.objective as 'sharpeRatio' | 'totalReturn' | 'winRate',
          direction: 'maximize',
        };

        // Run grid search
        const optimizer = new GridSearchOptimizer(
          optimizationConfig,
          dataProvider,
          strategyFactory
        );

        const result = await optimizer.optimize();

        spinner.succeed('Optimization complete!');

        // Display results
        displayOptimizationResults(result, options.objective);

      } catch (error) {
        spinner.fail('Optimization failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Walk-forward analysis to validate strategy robustness
   */
  backtestCmd
    .command('walk-forward <symbol>')
    .description('Validate strategy with walk-forward analysis')
    .option('-s, --strategy <name>', 'Strategy name (mean-reversion, momentum)', 'mean-reversion')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', getDefaultToDate())
    .option('-c, --capital <amount>', 'Initial capital', '100000')
    .option('--train-months <months>', 'Training window months', '6')
    .option('--test-months <months>', 'Test window months', '2')
    .option('--step-months <months>', 'Step forward months', '1')
    .action(async (symbol: string, options: {
      strategy: string;
      from: string;
      to: string;
      capital: string;
      trainMonths: string;
      testMonths: string;
      stepMonths: string;
    }) => {
      const spinner = ora('Initializing walk-forward analysis...').start();

      try {
        // Initialize data provider
        const dataProvider = new MarketDataProvider();
        await dataProvider.initialize();

        const from = new Date(options.from);
        const to = new Date(options.to);

        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        spinner.text = `Setting up walk-forward analysis for ${symbol}...`;

        // Get parameter ranges and factory
        const parameterRanges = getDefaultParameterRanges(options.strategy);
        const strategyFactory = createStrategyFactory(options.strategy);

        // Walk-forward config
        const walkForwardConfig: WalkForwardConfig = {
          trainMonths: Number.parseInt(options.trainMonths, 10),
          testMonths: Number.parseInt(options.testMonths, 10),
          stepMonths: Number.parseInt(options.stepMonths, 10),
          windowType: 'rolling',
          minWindows: 3,
        };

        // Optimization config for each window
        const optimizationConfig: OptimizationConfig = {
          id: `wf-opt-${Date.now()}`,
          name: `${symbol} ${options.strategy} walk-forward`,
          backtestConfig: {
            id: `backtest-${Date.now()}`,
            name: `${symbol} ${options.strategy}`,
            symbols: [symbol],
            initialCapital: parseFloat(options.capital),
            startDate: from,
            endDate: to,
            commission: { type: 'FIXED', fixedFee: 0 },
            slippage: { type: 'FIXED', fixedAmount: 5 },
            strategy: {
              name: options.strategy,
              parameters: {},
            },
          },
          parameterRanges,
          method: 'grid',
          objective: 'sharpeRatio',
          direction: 'maximize',
        };

        spinner.info(`Walk-forward: ${walkForwardConfig.trainMonths}mo train, ${walkForwardConfig.testMonths}mo test, ${walkForwardConfig.stepMonths}mo step`);
        spinner.start('Running walk-forward analysis (this may take several minutes)...');

        // Run walk-forward analysis
        const analyzer = new WalkForwardAnalyzer(
          walkForwardConfig,
          optimizationConfig,
          dataProvider,
          strategyFactory
        );

        const result = await analyzer.analyze();

        spinner.succeed('Walk-forward analysis complete!');

        // Display results
        displayWalkForwardResults(result);

      } catch (error) {
        spinner.fail('Walk-forward analysis failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });
}

/**
 * Format a metric value safely, handling undefined/null/NaN
 */
function formatMetric(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return 'N/A';
  return value.toFixed(2);
}

/**
 * Display comprehensive backtest results with all 30+ metrics
 */
function displayBacktestResults(symbol: string, result: any, options: any): void {
  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue(`  BACKTEST RESULTS: ${symbol.toUpperCase()}`));
  console.log(chalk.bold(`${'='.repeat(60)}\n`));

  // Extract metrics for easier access
  const metrics = result.metrics || {};
  const initialCapital = result.config?.initialCapital ?? result.initialCapital ?? 100000;
  const finalEquity = result.equityCurve?.length > 0
    ? result.equityCurve[result.equityCurve.length - 1]?.equity
    : initialCapital;
  const totalReturn = metrics.totalReturn !== undefined ? metrics.totalReturn * 100 : (result.totalReturn ?? 0);
  const netPnL = finalEquity - initialCapital;

  // Summary Section
  const summaryTable = new Table({
    head: [chalk.cyan('SUMMARY'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });

  summaryTable.push(
    ['Initial Capital', `$${initialCapital.toLocaleString()}`],
    ['Final Value', `$${finalEquity?.toLocaleString() ?? 'N/A'}`],
    ['Net P&L', chalk[netPnL >= 0 ? 'green' : 'red'](
      `$${netPnL?.toLocaleString() ?? 'N/A'}`
    )],
    ['Total Return', chalk[totalReturn >= 0 ? 'green' : 'red'](
      `${totalReturn?.toFixed(2) ?? 0}%`
    )],
  );
  console.log(summaryTable.toString());

  // Return Metrics
  const returnTable = new Table({
    head: [chalk.cyan('RETURN METRICS'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });
  returnTable.push(
    ['CAGR', `${((metrics.cagr ?? 0) * 100).toFixed(2)}%`],
    ['Annualized Return', `${((metrics.annualizedReturn ?? 0) * 100).toFixed(2)}%`],
    ['Total Return ($)', `$${metrics.totalReturnDollar?.toLocaleString() ?? 0}`],
  );
  console.log(`\n${returnTable.toString()}`);

  // Risk Metrics
  const riskTable = new Table({
    head: [chalk.cyan('RISK METRICS'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });
  riskTable.push(
    ['Sharpe Ratio', formatMetric(metrics.sharpeRatio)],
    ['Sortino Ratio', formatMetric(metrics.sortinoRatio)],
    ['Calmar Ratio', formatMetric(metrics.calmarRatio)],
    ['Volatility (Annual)', `${((metrics.volatility ?? 0) * 100).toFixed(2)}%`],
    ['Max Drawdown', chalk.red(`${((metrics.maxDrawdown ?? 0) * 100).toFixed(2)}%`)],
    ['Max DD Duration', `${metrics.maxDrawdownDuration ?? 0} days`],
  );
  console.log(`\n${riskTable.toString()}`);

  // Trade Statistics
  const tradeTable = new Table({
    head: [chalk.cyan('TRADE STATISTICS'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });
  tradeTable.push(
    ['Total Trades', (metrics.totalTrades ?? result.trades?.length ?? 0).toString()],
    ['Winning Trades', chalk.green((metrics.winningTrades ?? 0).toString())],
    ['Losing Trades', chalk.red((metrics.losingTrades ?? 0).toString())],
    ['Win Rate', `${((metrics.winRate ?? 0) * 100).toFixed(2)}%`],
    ['Profit Factor', formatMetric(metrics.profitFactor)],
    ['Payoff Ratio', formatMetric(metrics.payoffRatio)],
  );
  console.log(`\n${tradeTable.toString()}`);

  // Win/Loss Analysis
  const winLossTable = new Table({
    head: [chalk.cyan('WIN/LOSS ANALYSIS'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });
  winLossTable.push(
    ['Average Win', chalk.green(`$${metrics.avgWin?.toFixed(2) ?? 0}`)],
    ['Average Loss', chalk.red(`$${Math.abs(metrics.avgLoss ?? 0).toFixed(2)}`)],
    ['Average Win %', chalk.green(`${((metrics.avgWinPercent ?? 0) * 100).toFixed(2)}%`)],
    ['Average Loss %', chalk.red(`${(Math.abs(metrics.avgLossPercent ?? 0) * 100).toFixed(2)}%`)],
    ['Largest Win', chalk.green(`$${metrics.largestWin?.toFixed(2) ?? 0}`)],
    ['Largest Loss', chalk.red(`$${Math.abs(metrics.largestLoss ?? 0).toFixed(2)}`)],
    ['Max Consecutive Wins', (metrics.maxConsecutiveWins ?? 0).toString()],
    ['Max Consecutive Losses', (metrics.maxConsecutiveLosses ?? 0).toString()],
  );
  console.log(`\n${winLossTable.toString()}`);

  // Expectancy & Efficiency
  const efficiencyTable = new Table({
    head: [chalk.cyan('EXPECTANCY & EFFICIENCY'), chalk.cyan('Value')],
    colWidths: [35, 25],
  });
  efficiencyTable.push(
    ['Expectancy ($/trade)', `$${metrics.expectancy?.toFixed(2) ?? 0}`],
    ['Expectancy (%/trade)', `${((metrics.expectancyPercent ?? 0) * 100).toFixed(2)}%`],
    ['Avg Holding Period', `${metrics.avgHoldingPeriod?.toFixed(1) ?? 0} days`],
  );
  console.log(`\n${efficiencyTable.toString()}`);

  // Display additional visualizations if --report or --detailed flag is set
  if (options.report || options.detailed) {
    displayEquityCurve(result.equityCurve);
    displayDrawdowns(result.drawdownCurve);
    displayDetailedTrades(result.trades);
  } else {
    console.log(chalk.gray('\nTip: Use --detailed or --report flag to see equity curve, drawdowns, and trade history'));
  }
}

/**
 * Display ASCII equity curve visualization
 */
function displayEquityCurve(equityCurve: EquityCurvePoint[], width = 60, height = 15): void {
  if (!equityCurve || equityCurve.length === 0) {
    console.log(chalk.yellow('\nNo equity curve data available'));
    return;
  }

  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue('  EQUITY CURVE'));
  console.log(`${'='.repeat(60)}\n`);

  const values = equityCurve.map(p => p.equity);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Sample data points if too many
  const step = Math.max(1, Math.floor(values.length / width));
  const sampledValues = values.filter((_, i) => i % step === 0).slice(0, width);

  // Create chart rows
  const chart: string[][] = Array(height).fill(null).map(() => Array(sampledValues.length).fill(' ') as string[]);

  for (let x = 0; x < sampledValues.length; x++) {
    const val = sampledValues[x];
    if (val === undefined) continue;
    const y = Math.floor(((val - minVal) / range) * (height - 1));
    const row = height - 1 - y;
    if (chart[row]) {
      chart[row][x] = chalk.green('*');
    }
  }

  // Print chart with Y-axis labels
  for (let row = 0; row < height; row++) {
    const yValue = maxVal - (row / (height - 1)) * range;
    const label = row === 0 || row === height - 1
      ? `$${(yValue / 1000).toFixed(0)}k`.padStart(7)
      : '       ';
    console.log(`${label} |${chart[row]?.join('') ?? ''}`);
  }

  // X-axis
  console.log(`        ${'-'.repeat(sampledValues.length)}`);

  // Legend
  const startDate = equityCurve[0]?.timestamp || equityCurve[0]?.date;
  const endDate = equityCurve[equityCurve.length - 1]?.timestamp || equityCurve[equityCurve.length - 1]?.date;
  if (startDate && endDate) {
    const startStr = new Date(startDate).toISOString().split('T')[0];
    const endStr = new Date(endDate).toISOString().split('T')[0];
    console.log(chalk.gray(`        ${startStr}${' '.repeat(Math.max(0, sampledValues.length - 20))}${endStr}`));
  }
}

/**
 * Display drawdown analysis with significant periods
 */
function displayDrawdowns(drawdownCurve: DrawdownPoint[]): void {
  if (!drawdownCurve || drawdownCurve.length === 0) return;

  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue('  DRAWDOWN ANALYSIS'));
  console.log(`${'='.repeat(60)}\n`);

  // Find significant drawdown periods (> 5%)
  const significantDrawdowns = drawdownCurve.filter(d => (d.drawdownPercent ?? d.drawdown * 100) < -5);

  if (significantDrawdowns.length === 0) {
    console.log(chalk.green('No significant drawdowns (> 5%) detected'));
    return;
  }

  const table = new Table({
    head: ['Date', 'Drawdown', 'Duration', 'Recovery'],
    colWidths: [15, 12, 12, 15],
  });

  // Group into drawdown periods
  interface DrawdownPeriod {
    startDate: Date;
    maxDrawdown: number;
    duration: number;
  }
  let currentPeriod: DrawdownPeriod | null = null;
  for (const point of drawdownCurve) {
    const drawdownPct = point.drawdownPercent ?? (point.drawdown * 100);
    if (drawdownPct < -5) {
      if (!currentPeriod) {
        currentPeriod = {
          startDate: point.timestamp || point.date || new Date(),
          maxDrawdown: drawdownPct,
          duration: 0,
        };
      } else {
        if (drawdownPct < currentPeriod.maxDrawdown) {
          currentPeriod.maxDrawdown = drawdownPct;
        }
        currentPeriod.duration = point.drawdownDuration ?? currentPeriod.duration + 1;
      }
    } else if (currentPeriod) {
      table.push([
        new Date(currentPeriod.startDate).toISOString().split('T')[0],
        chalk.red(`${currentPeriod.maxDrawdown.toFixed(2)}%`),
        `${currentPeriod.duration} days`,
        drawdownPct === 0 ? chalk.green('Yes') : chalk.yellow('Ongoing'),
      ]);
      currentPeriod = null;
    }
  }

  // Handle ongoing drawdown at end of backtest
  if (currentPeriod) {
    table.push([
      new Date(currentPeriod.startDate).toISOString().split('T')[0],
      chalk.red(`${currentPeriod.maxDrawdown.toFixed(2)}%`),
      `${currentPeriod.duration} days`,
      chalk.yellow('Ongoing'),
    ]);
  }

  console.log(table.toString());
}

/**
 * Display detailed trade history
 */
function displayDetailedTrades(trades: Trade[], maxTrades = 20): void {
  if (!trades || trades.length === 0) {
    console.log(chalk.yellow('\nNo trades executed'));
    return;
  }

  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue(`  TRADE HISTORY (${Math.min(trades.length, maxTrades)} of ${trades.length})`));
  console.log(`${'='.repeat(60)}\n`);

  const table = new Table({
    head: ['#', 'Entry', 'Exit', 'Entry $', 'Exit $', 'P&L', 'Return', 'Hold'],
    colWidths: [5, 12, 12, 10, 10, 12, 10, 8],
  });

  const displayTrades = trades.slice(-maxTrades);
  const startIdx = Math.max(0, trades.length - maxTrades);

  displayTrades.forEach((trade, idx) => {
    const pnl = trade.pnl ?? trade.netPnL ?? ((trade.exitPrice - trade.entryPrice) * (trade.quantity ?? 1));
    const returnPct = trade.pnlPercent ?? trade.returnPct ?? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice);
    const entryDate = trade.entryDate || trade.entryTime;
    const exitDate = trade.exitDate || trade.exitTime;

    table.push([
      (startIdx + idx + 1).toString(),
      entryDate ? new Date(entryDate).toISOString().split('T')[0]?.slice(5) : 'N/A',
      exitDate ? new Date(exitDate).toISOString().split('T')[0]?.slice(5) : 'N/A',
      `$${trade.entryPrice?.toFixed(2) ?? 'N/A'}`,
      `$${trade.exitPrice?.toFixed(2) ?? 'N/A'}`,
      chalk[pnl >= 0 ? 'green' : 'red'](`$${pnl?.toFixed(2) ?? 'N/A'}`),
      chalk[returnPct >= 0 ? 'green' : 'red'](`${(returnPct * 100)?.toFixed(1) ?? 0}%`),
      `${trade.holdingPeriod ?? trade.holdDuration ?? '?'}d`,
    ]);
  });

  console.log(table.toString());
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

/**
 * Create a strategy factory function for optimization
 * Returns a function that creates BacktestStrategy instances from parameter sets
 */
function createStrategyFactory(strategyName: string): (params: Record<string, unknown>) => BacktestStrategy {
  return (params: Record<string, unknown>): BacktestStrategy => {
    let strategy;
    if (strategyName === 'mean-reversion') {
      strategy = new MeanReversionStrategy({
        rsiOversold: (params.rsiOversold as number) ?? 30,
        rsiOverbought: (params.rsiOverbought as number) ?? 70,
        mfiOversold: (params.mfiOversold as number) ?? 20,
        mfiOverbought: (params.mfiOverbought as number) ?? 80,
        bbStdDev: (params.bbStdDev as number) ?? 2,
        minConfidence: (params.minConfidence as number) ?? 60,
        volumeThreshold: (params.volumeThreshold as number) ?? 1.2,
        maxHoldingPeriod: (params.maxHoldingPeriod as number) ?? 30,
      });
    } else {
      strategy = new MomentumStrategy({
        shortMA: (params.shortMA as number) ?? 20,
        longMA: (params.longMA as number) ?? 50,
        macdFast: (params.macdFast as number) ?? 12,
        macdSlow: (params.macdSlow as number) ?? 26,
        macdSignal: (params.macdSignal as number) ?? 9,
        trendStrength: (params.trendStrength as number) ?? 0.02,
        minConfidence: (params.minConfidence as number) ?? 65,
        volumeThreshold: (params.volumeThreshold as number) ?? 1.5,
      });
    }
    return new StrategyAdapter(strategy, strategyName);
  };
}

/**
 * Get default parameter ranges for grid search optimization
 */
function getDefaultParameterRanges(strategyName: string): ParameterRange[] {
  if (strategyName === 'mean-reversion') {
    return [
      { name: 'rsiOversold', type: 'integer', min: 20, max: 35, step: 5 },
      { name: 'rsiOverbought', type: 'integer', min: 65, max: 80, step: 5 },
      { name: 'minConfidence', type: 'integer', min: 50, max: 70, step: 10 },
    ];
  }
  // Momentum strategy ranges
  return [
    { name: 'shortMA', type: 'integer', min: 10, max: 30, step: 5 },
    { name: 'longMA', type: 'integer', min: 40, max: 60, step: 10 },
    { name: 'minConfidence', type: 'integer', min: 55, max: 75, step: 10 },
  ];
}

/**
 * Display optimization results
 */
function displayOptimizationResults(result: OptimizationRunResult, objective: string): void {
  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue('  OPTIMIZATION RESULTS'));
  console.log(chalk.bold(`${'='.repeat(60)}\n`));

  // Best Parameters
  const bestTable = new Table({
    head: [chalk.cyan('BEST PARAMETERS'), chalk.cyan('Value')],
    colWidths: [30, 25],
  });

  for (const [param, value] of Object.entries(result.bestResult.parameters.parameters)) {
    bestTable.push([param, String(value)]);
  }
  console.log(bestTable.toString());

  // Best Metrics
  const metricsTable = new Table({
    head: [chalk.cyan('BEST METRICS'), chalk.cyan('Value')],
    colWidths: [30, 25],
  });

  metricsTable.push(
    [chalk.green(`${objective} (Objective)`), chalk.green(result.bestResult.objectiveValue.toFixed(4))],
    ['Total Return', `${((result.bestResult.backtestResult.metrics.totalReturn ?? 0) * 100).toFixed(2)}%`],
    ['Sharpe Ratio', (result.bestResult.backtestResult.metrics.sharpeRatio ?? 0).toFixed(2)],
    ['Win Rate', `${((result.bestResult.backtestResult.metrics.winRate ?? 0) * 100).toFixed(1)}%`],
    ['Max Drawdown', chalk.red(`${((result.bestResult.backtestResult.metrics.maxDrawdown ?? 0) * 100).toFixed(2)}%`)],
  );
  console.log(`\n${metricsTable.toString()}`);

  // Summary Statistics
  const summaryTable = new Table({
    head: [chalk.cyan('OPTIMIZATION SUMMARY'), chalk.cyan('Value')],
    colWidths: [30, 25],
  });

  summaryTable.push(
    ['Total Combinations', result.summary.totalCombinations.toString()],
    ['Valid Combinations', result.summary.validCombinations.toString()],
    ['Mean Objective', result.summary.meanObjectiveValue.toFixed(4)],
    ['Std Dev Objective', result.summary.stdDevObjectiveValue.toFixed(4)],
    ['Execution Time', `${(result.totalExecutionTimeMs / 1000).toFixed(2)}s`],
  );
  console.log(`\n${summaryTable.toString()}`);

  // Parameter Sensitivity
  if (result.summary.parameterSensitivity && result.summary.parameterSensitivity.length > 0) {
    console.log(chalk.bold(`\n${'='.repeat(60)}`));
    console.log(chalk.bold.blue('  PARAMETER SENSITIVITY'));
    console.log(`${'='.repeat(60)}\n`);

    const sensitivityTable = new Table({
      head: ['Parameter', 'Best Value', 'Impact'],
      colWidths: [20, 15, 25],
    });

    for (const sensitivity of result.summary.parameterSensitivity) {
      const impactStr = sensitivity.correlation > 0.1 ? chalk.yellow('High') :
                        sensitivity.correlation > 0.05 ? chalk.blue('Medium') : chalk.gray('Low');
      sensitivityTable.push([
        sensitivity.parameterName,
        String(sensitivity.bestValue),
        impactStr,
      ]);
    }
    console.log(sensitivityTable.toString());
  }
}

/**
 * Display walk-forward analysis results
 */
function displayWalkForwardResults(result: WalkForwardResult): void {
  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue('  WALK-FORWARD ANALYSIS RESULTS'));
  console.log(chalk.bold(`${'='.repeat(60)}\n`));

  // Window Results
  const windowTable = new Table({
    head: ['Window', 'Period', 'In-Sample', 'Out-of-Sample', 'Degradation'],
    colWidths: [8, 22, 14, 16, 14],
  });

  for (const window of result.windows) {
    const inSample = window.optimizationResult?.objectiveValue ?? 0;
    const outOfSample = window.testObjectiveValue ?? 0;
    const degradation = inSample !== 0 ? ((outOfSample - inSample) / inSample) * 100 : 0;
    const degradationColor = degradation >= 0 ? 'green' : (degradation > -20 ? 'yellow' : 'red');

    windowTable.push([
      (window.index + 1).toString(),
      `${window.trainStart.toISOString().split('T')[0]?.slice(5)} - ${window.testEnd.toISOString().split('T')[0]?.slice(5)}`,
      inSample.toFixed(3),
      outOfSample.toFixed(3),
      chalk[degradationColor](`${degradation.toFixed(1)}%`),
    ]);
  }
  console.log(windowTable.toString());

  // Overfitting Analysis
  const analysis = result.overfittingAnalysis;
  const severityColors: Record<string, 'green' | 'yellow' | 'red'> = {
    none: 'green',
    low: 'green',
    moderate: 'yellow',
    high: 'red',
    severe: 'red',
  };
  const severityColor = severityColors[analysis.severity] ?? 'yellow';

  console.log(chalk.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.blue('  OVERFITTING ANALYSIS'));
  console.log(`${'='.repeat(60)}\n`);

  const analysisTable = new Table({
    head: [chalk.cyan('METRIC'), chalk.cyan('VALUE')],
    colWidths: [30, 30],
  });

  analysisTable.push(
    ['Severity', chalk[severityColor](analysis.severity.toUpperCase())],
    ['Degradation', chalk[analysis.degradationPercent < -15 ? 'red' : 'green'](`${analysis.degradationPercent.toFixed(2)}%`)],
    ['Consistency Score', `${analysis.consistencyScore.toFixed(1)}/100`],
    ['Avg In-Sample', analysis.avgInSampleObjective.toFixed(4)],
    ['Avg Out-of-Sample', analysis.avgOutOfSampleObjective.toFixed(4)],
    ['Outperforming Windows', `${analysis.outperformingWindows}/${analysis.totalWindows}`],
  );
  console.log(analysisTable.toString());

  // Status
  if (analysis.isOverfitted) {
    console.log(chalk.red('\nWARNING: Strategy appears to be OVERFIT to historical data!'));
  } else {
    console.log(chalk.green('\nStrategy shows GOOD GENERALIZATION to out-of-sample data.'));
  }

  // Recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log(chalk.bold(`\n${'='.repeat(60)}`));
    console.log(chalk.bold.blue('  RECOMMENDATIONS'));
    console.log(`${'='.repeat(60)}\n`);
    for (const rec of analysis.recommendations) {
      console.log(`  - ${rec}`);
    }
  }

  // Execution time
  console.log(chalk.gray(`\nTotal execution time: ${(result.totalExecutionTimeMs / 1000 / 60).toFixed(2)} minutes`));
}
