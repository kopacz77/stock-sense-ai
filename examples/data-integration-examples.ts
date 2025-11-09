/**
 * Data Integration Examples
 * Demonstrates how to use the data integration system
 */

import { MarketDataService } from '../src/data/market-data-service.js';
import { CSVLoader } from '../src/data/csv-loader.js';
import { DataValidator } from '../src/data/data-validator.js';

/**
 * Example 1: Download historical data for multiple symbols
 */
async function example1_batchDownload() {
  console.log('Example 1: Batch Download Historical Data\n');

  const service = new MarketDataService({
    preferredProvider: 'alpha-vantage',
    enableCache: true,
    validateData: true,
  });

  await service.initialize();

  const symbols = ['AAPL', 'MSFT', 'GOOGL'];
  const from = new Date('2023-01-01');
  const to = new Date('2023-12-31');

  console.log(`Downloading data for: ${symbols.join(', ')}`);
  console.log(`Date range: ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}\n`);

  const results = await service.batchDownload(
    symbols,
    from,
    to,
    (progress) => {
      if (progress.status === 'downloading') {
        console.log(`[${progress.current}/${progress.total}] Downloading ${progress.symbol}...`);
      } else if (progress.status === 'complete') {
        console.log(`[${progress.current}/${progress.total}] ✓ ${progress.symbol} completed`);
      } else if (progress.status === 'error') {
        console.error(`[${progress.current}/${progress.total}] ✗ ${progress.symbol} failed: ${progress.error}`);
      }
    }
  );

  console.log('\nDownload Summary:');
  for (const [symbol, data] of results) {
    console.log(`  ${symbol}: ${data.length} data points`);
  }
}

/**
 * Example 2: Import and validate CSV data
 */
async function example2_csvImport() {
  console.log('\nExample 2: Import and Validate CSV Data\n');

  // Create sample CSV data
  const csvContent = `Date,Open,High,Low,Close,Volume
2023-01-03,100.50,102.30,99.80,101.20,50000000
2023-01-04,101.20,103.50,100.90,103.00,48000000
2023-01-05,103.00,104.80,102.50,104.20,52000000
2023-01-06,104.20,105.50,103.80,105.00,49000000`;

  console.log('Parsing CSV data...');
  const data = CSVLoader.parseCSV(csvContent);
  console.log(`Parsed ${data.length} data points\n`);

  console.log('Validating data...');
  const validation = DataValidator.validate(data);

  if (validation.valid) {
    console.log('✓ Data validation passed');
  } else {
    console.log('✗ Data validation failed:');
    validation.errors.forEach((error) => console.log(`  - ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\nWarnings:');
    validation.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  console.log(`\nTotal data points: ${validation.dataPoints}`);
  console.log(`Date gaps: ${validation.gaps.length}`);

  // Cache the imported data
  const service = new MarketDataService();
  await service.initialize();

  const cacheManager = service.getCacheManager();
  await cacheManager.setHistoricalData(
    'SAMPLE',
    new Date(data[0].date),
    new Date(data[data.length - 1].date),
    data,
    'csv-import'
  );

  console.log('\n✓ Data cached successfully');
}

/**
 * Example 3: Fetch and cache data with automatic fallback
 */
async function example3_fetchWithFallback() {
  console.log('\nExample 3: Fetch Data with Provider Fallback\n');

  const service = new MarketDataService({
    preferredProvider: 'alpha-vantage',
    enableCache: true,
  });

  await service.initialize();

  console.log('Fetching quote for AAPL...');
  const quote = await service.fetchQuote('AAPL');

  console.log('\nQuote Data:');
  console.log(`  Symbol: ${quote.symbol}`);
  console.log(`  Price: $${quote.price.toFixed(2)}`);
  console.log(`  Change: $${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);
  console.log(`  Day Range: $${quote.low.toFixed(2)} - $${quote.high.toFixed(2)}`);
  console.log(`  Volume: ${quote.volume.toLocaleString()}`);

  console.log('\nFetching historical data...');
  const from = new Date();
  from.setMonth(from.getMonth() - 1); // Last month

  const history = await service.fetchHistoricalData('AAPL', from, new Date());

  console.log(`Downloaded ${history.length} historical data points`);
  console.log(`First date: ${history[0].date}`);
  console.log(`Last date: ${history[history.length - 1].date}`);

  // Second fetch should use cache
  console.log('\nFetching again (should use cache)...');
  const cachedHistory = await service.fetchHistoricalData('AAPL', from, new Date());
  console.log(`Retrieved ${cachedHistory.length} data points from cache`);
}

/**
 * Example 4: Cache management
 */
async function example4_cacheManagement() {
  console.log('\nExample 4: Cache Management\n');

  const service = new MarketDataService();
  await service.initialize();

  const cacheManager = service.getCacheManager();

  // Get cache statistics
  const stats = await cacheManager.getStats();

  console.log('Cache Statistics:');
  console.log(`  Total symbols: ${stats.symbols}`);
  console.log(`  Cache size: ${stats.totalSize.toFixed(2)} MB`);
  console.log(`  Quote cache entries: ${stats.quotesCount}`);
  console.log(`  Historical datasets: ${stats.historicalCount}`);

  // List cached symbols
  const symbols = await cacheManager.listCachedSymbols();
  console.log(`\nCached symbols: ${symbols.join(', ')}`);

  // Get metadata for a symbol
  if (symbols.length > 0) {
    const metadata = await cacheManager.getMetadata(symbols[0]);
    console.log(`\nMetadata for ${symbols[0]}:`);
    metadata.forEach((meta, i) => {
      console.log(`  Dataset ${i + 1}:`);
      console.log(`    Provider: ${meta.provider}`);
      console.log(`    Date range: ${meta.from} to ${meta.to}`);
      console.log(`    Data points: ${meta.dataPoints}`);
      console.log(`    Last updated: ${new Date(meta.lastUpdated).toLocaleString()}`);
    });
  }
}

/**
 * Example 5: Export data to CSV
 */
async function example5_exportCSV() {
  console.log('\nExample 5: Export Data to CSV\n');

  const service = new MarketDataService();
  await service.initialize();

  console.log('Fetching data for export...');
  const from = new Date('2023-01-01');
  const to = new Date('2023-12-31');

  const data = await service.fetchHistoricalData('AAPL', from, to);

  console.log(`Exporting ${data.length} data points to CSV...`);

  const csv = CSVLoader.toCSV(data);
  console.log('\nCSV Preview (first 5 lines):');
  console.log(csv.split('\n').slice(0, 6).join('\n'));

  // In real usage, you would write to a file:
  // await CSVLoader.exportToFile('data/AAPL_2023.csv', data);
  console.log('\n✓ Export complete');
}

/**
 * Example 6: Data validation and quality checks
 */
async function example6_dataValidation() {
  console.log('\nExample 6: Data Validation and Quality Checks\n');

  const service = new MarketDataService();
  await service.initialize();

  const from = new Date('2023-01-01');
  const to = new Date('2023-12-31');

  console.log('Fetching data...');
  const data = await service.fetchHistoricalData('AAPL', from, to);

  console.log('Performing validation checks...\n');

  const validation = DataValidator.validate(data, {
    checkGaps: true,
    checkAnomalies: true,
    allowWeekends: true,
  });

  console.log('Validation Results:');
  console.log(`  Valid: ${validation.valid ? '✓ Yes' : '✗ No'}`);
  console.log(`  Total data points: ${validation.dataPoints}`);
  console.log(`  Errors: ${validation.errors.length}`);
  console.log(`  Warnings: ${validation.warnings.length}`);
  console.log(`  Date gaps: ${validation.gaps.length}`);

  if (validation.errors.length > 0) {
    console.log('\nErrors:');
    validation.errors.slice(0, 5).forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  if (validation.warnings.length > 0) {
    console.log('\nWarnings (first 5):');
    validation.warnings.slice(0, 5).forEach((warning) => {
      console.log(`  - ${warning}`);
    });
  }

  if (validation.gaps.length > 0) {
    console.log('\nDate Gaps (first 5):');
    validation.gaps.slice(0, 5).forEach((gap) => {
      console.log(`  - ${gap.from} to ${gap.to}`);
    });
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await example1_batchDownload();
    await example2_csvImport();
    await example3_fetchWithFallback();
    await example4_cacheManagement();
    await example5_exportCSV();
    await example6_dataValidation();

    console.log('\n✓ All examples completed successfully!');
  } catch (error) {
    console.error('\n✗ Error running examples:', error);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_batchDownload,
  example2_csvImport,
  example3_fetchWithFallback,
  example4_cacheManagement,
  example5_exportCSV,
  example6_dataValidation,
};
