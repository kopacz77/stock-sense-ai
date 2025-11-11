/**
 * CLI Commands for Backtest Data Management
 * Provides commands to download, import, list, and manage historical data
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Command } from 'commander';
import { MarketDataService } from '../data/market-data-service.js';
import { CSVLoader } from '../data/csv-loader.js';
import type { DownloadProgress } from '../data/types.js';

export function registerBacktestDataCommands(program: Command): void {
  const backtestCmd = program.command('backtest').description('Backtesting tools and data management');

  const dataCmd = backtestCmd.command('data').description('Manage historical data for backtesting');

  /**
   * Download historical data
   */
  dataCmd
    .command('download <symbols...>')
    .description('Download historical data for symbols')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', getDefaultToDate())
    .option('--provider <name>', 'Data provider (alpha-vantage, finnhub)', 'alpha-vantage')
    .action(async (symbols: string[], options) => {
      const marketData = new MarketDataService();

      const spinner = ora('Initializing...').start();

      try {
        await marketData.initialize();
        spinner.succeed('Initialized');

        const from = new Date(options.from);
        const to = new Date(options.to);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        console.log(chalk.blue(`\nDownloading data for ${symbols.length} symbol(s):`));
        console.log(chalk.gray(`  From: ${options.from}`));
        console.log(chalk.gray(`  To: ${options.to}`));
        console.log(chalk.gray(`  Provider: ${options.provider}\n`));

        const progressBar = ora();
        let completed = 0;
        let failed = 0;

        const results = await marketData.batchDownload(
          symbols,
          from,
          to,
          (progress: DownloadProgress) => {
            if (progress.status === 'downloading') {
              progressBar.start(
                `[${progress.current}/${progress.total}] Downloading ${progress.symbol}...`
              );
            } else if (progress.status === 'complete') {
              progressBar.succeed(
                `[${progress.current}/${progress.total}] ${progress.symbol} completed`
              );
              completed++;
            } else if (progress.status === 'error') {
              progressBar.fail(
                `[${progress.current}/${progress.total}] ${progress.symbol} failed: ${progress.error}`
              );
              failed++;
            }
          }
        );

        console.log(chalk.green(`\n✅ Download complete!`));
        console.log(chalk.gray(`  Success: ${completed}/${symbols.length}`));
        if (failed > 0) {
          console.log(chalk.red(`  Failed: ${failed}/${symbols.length}`));
        }

        // Display data summary
        const table = new Table({
          head: ['Symbol', 'Data Points', 'Date Range'],
          colWidths: [15, 15, 40],
        });

        for (const [symbol, data] of results) {
          if (data.length > 0) {
            const first = data[0];
            const last = data[data.length - 1];
            if (first && last) {
              table.push([
                symbol,
                data.length.toString(),
                `${first.date} to ${last.date}`,
              ]);
            }
          }
        }

        console.log('\n' + table.toString());
      } catch (error) {
        spinner.fail('Download failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Import data from CSV
   */
  dataCmd
    .command('import <file>')
    .description('Import historical data from CSV file')
    .option('-s, --symbol <symbol>', 'Symbol name (if not in CSV)', 'UNKNOWN')
    .option('--separator <char>', 'CSV separator (auto-detect if not specified)')
    .option('--no-header', 'CSV has no header row')
    .action(async (file: string, options) => {
      const spinner = ora('Importing CSV data...').start();

      try {
        const data = await CSVLoader.loadFromFile(file, {
          separator: options.separator || 'auto',
          hasHeader: options.header !== false,
        });

        spinner.succeed(`Imported ${data.length} data points`);

        if (data.length === 0) {
          console.log(chalk.yellow('No data to cache'));
          return;
        }

        // Save to cache
        const marketData = new MarketDataService();
        await marketData.initialize();

        const cacheManager = marketData.getCacheManager();

        const first = data[0];
        const last = data[data.length - 1];

        if (!first || !last) {
          console.log(chalk.yellow('Invalid data structure'));
          return;
        }

        const from = new Date(first.date);
        const to = new Date(last.date);

        await cacheManager.setHistoricalData(
          options.symbol.toUpperCase(),
          from,
          to,
          data,
          'csv-import'
        );

        console.log(chalk.green(`\n✅ Data cached for ${options.symbol.toUpperCase()}`));
        console.log(chalk.gray(`  Date range: ${first.date} to ${last.date}`));
        console.log(chalk.gray(`  Data points: ${data.length}`));
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * List cached data
   */
  dataCmd
    .command('list')
    .description('List all cached historical data')
    .action(async () => {
      const spinner = ora('Loading cache information...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const cacheManager = marketData.getCacheManager();
        const symbols = await cacheManager.listCachedSymbols();

        if (symbols.length === 0) {
          spinner.warn('No cached data found');
          console.log(
            chalk.yellow(
              '\nUse "stock-analyzer backtest data download <symbols>" to download data'
            )
          );
          return;
        }

        spinner.succeed(`Found ${symbols.length} cached symbol(s)`);

        const table = new Table({
          head: ['Symbol', 'Data Points', 'Date Range', 'Provider', 'Last Updated'],
          colWidths: [12, 12, 30, 15, 20],
        });

        for (const symbol of symbols) {
          const metadata = await cacheManager.getMetadata(symbol);

          if (metadata.length > 0) {
            // Show the most recent cache entry
            const latest = metadata[metadata.length - 1];
            if (latest) {
              table.push([
                symbol,
                latest.dataPoints.toString(),
                `${latest.from} to ${latest.to}`,
                latest.provider,
                new Date(latest.lastUpdated).toLocaleDateString(),
              ]);
            }
          }
        }

        console.log('\n' + table.toString());

        // Show cache statistics
        const stats = await cacheManager.getStats();
        console.log(chalk.gray(`\nCache Statistics:`));
        console.log(chalk.gray(`  Total symbols: ${stats.symbols}`));
        console.log(chalk.gray(`  Cache size: ${stats.totalSize.toFixed(2)} MB`));
        console.log(chalk.gray(`  Historical datasets: ${stats.historicalCount}`));
      } catch (error) {
        spinner.fail('Failed to list cache');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Clear cache
   */
  dataCmd
    .command('clear [symbol]')
    .description('Clear cached data (all or specific symbol)')
    .action(async (symbol?: string) => {
      const spinner = ora('Clearing cache...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const cacheManager = marketData.getCacheManager();

        if (symbol) {
          await cacheManager.clearSymbol(symbol);
          spinner.succeed(`Cleared cache for ${symbol.toUpperCase()}`);
        } else {
          await cacheManager.clearAll();
          spinner.succeed('Cleared all cached data');
        }
      } catch (error) {
        spinner.fail('Failed to clear cache');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Export cached data to CSV
   */
  dataCmd
    .command('export <symbol> <file>')
    .description('Export cached data to CSV file')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .action(async (symbol: string, file: string, options) => {
      const spinner = ora('Exporting data...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const from = options.from ? new Date(options.from) : new Date('2000-01-01');
        const to = options.to ? new Date(options.to) : new Date();

        const data = await marketData.fetchHistoricalData(symbol, from, to);

        await CSVLoader.exportToFile(file, data);

        spinner.succeed(`Exported ${data.length} data points to ${file}`);
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Validate cached data
   */
  dataCmd
    .command('validate <symbol>')
    .description('Validate cached data for quality issues')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .action(async (symbol: string, options) => {
      const spinner = ora('Validating data...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const from = options.from ? new Date(options.from) : new Date('2000-01-01');
        const to = options.to ? new Date(options.to) : new Date();

        const data = await marketData.fetchHistoricalData(symbol, from, to);

        const { DataValidator } = await import('../data/data-validator.js');
        const validation = DataValidator.validate(data);

        if (validation.valid) {
          spinner.succeed(`Data validation passed for ${symbol}`);
          console.log(chalk.green(`\n✅ No errors found`));
        } else {
          spinner.warn(`Data validation found issues for ${symbol}`);
          console.log(chalk.yellow(`\n⚠️ Errors found:`));
          validation.errors.forEach((error) => {
            console.log(chalk.red(`  • ${error}`));
          });
        }

        if (validation.warnings.length > 0) {
          console.log(chalk.yellow(`\n⚠️ Warnings:`));
          validation.warnings.slice(0, 10).forEach((warning) => {
            console.log(chalk.yellow(`  • ${warning}`));
          });

          if (validation.warnings.length > 10) {
            console.log(chalk.gray(`  ... and ${validation.warnings.length - 10} more`));
          }
        }

        if (validation.gaps.length > 0) {
          console.log(chalk.yellow(`\n⚠️ Date gaps found: ${validation.gaps.length}`));
          validation.gaps.slice(0, 5).forEach((gap) => {
            console.log(chalk.yellow(`  • ${gap.from} to ${gap.to}`));
          });

          if (validation.gaps.length > 5) {
            console.log(chalk.gray(`  ... and ${validation.gaps.length - 5} more`));
          }
        }

        console.log(chalk.gray(`\nTotal data points: ${validation.dataPoints}`));
      } catch (error) {
        spinner.fail('Validation failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });

  /**
   * Show cache statistics
   */
  dataCmd
    .command('stats')
    .description('Show cache statistics and usage')
    .action(async () => {
      const spinner = ora('Calculating statistics...').start();

      try {
        const marketData = new MarketDataService();
        await marketData.initialize();

        const cacheManager = marketData.getCacheManager();
        const stats = await cacheManager.getStats();

        spinner.succeed('Statistics calculated');

        console.log(chalk.blue('\n📊 Cache Statistics:\n'));

        const table = new Table({
          chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
          },
        });

        table.push(
          ['Total Symbols', stats.symbols.toString()],
          ['Total Cache Size', `${stats.totalSize.toFixed(2)} MB`],
          ['Quote Cache Count', stats.quotesCount.toString()],
          ['Historical Datasets', stats.historicalCount.toString()]
        );

        console.log(table.toString());
      } catch (error) {
        spinner.fail('Failed to get statistics');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
      }
    });
}

function getDefaultFromDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1); // 1 year ago
  return date.toISOString().split('T')[0] ?? '';
}

function getDefaultToDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}
