# CLI Command Reference

**Complete reference for all 30+ Stock Sense AI commands**

## Table of Contents

1. [Command Overview](#command-overview)
2. [System Commands](#system-commands)
3. [Backtesting Commands](#backtesting-commands)
4. [Data Management Commands](#data-management-commands)
5. [Paper Trading Commands](#paper-trading-commands)
6. [Risk Management Commands](#risk-management-commands)
7. [Analysis Commands](#analysis-commands)
8. [Cache Commands](#cache-commands)
9. [Web Dashboard Commands](#web-dashboard-commands)
10. [Global Options](#global-options)

---

## Command Overview

### Quick Reference

| Category | Commands | Description |
|----------|----------|-------------|
| **System** | `setup`, `health` | Initial configuration and health checks |
| **Backtesting** | `backtest run`, `backtest optimize`, `backtest compare` | Run and optimize backtests |
| **Data** | `backtest data download`, `backtest data list`, `backtest data import` | Manage historical data |
| **Paper Trading** | `paper start`, `paper stop`, `paper status`, `paper portfolio` | Virtual trading |
| **Risk** | `risk var`, `risk cvar`, `risk monte-carlo`, `risk stress-test` | Portfolio risk analysis |
| **Analysis** | `analyze`, `scan`, `discover`, `market` | Stock analysis |
| **Cache** | `cache --stats`, `cache --clear` | Cache management |
| **Web** | `dashboard`, `monitor` | Web interface |

---

## System Commands

### setup

Configure API keys, risk parameters, and notification preferences.

**Usage:**
```bash
stock-analyzer setup
```

**Interactive wizard guides you through:**
1. Alpha Vantage API key
2. Finnhub API key
3. Notification method (Telegram/Email/None)
4. Risk parameters (max risk per trade, max position size)
5. Trading strategy defaults (RSI levels, Bollinger Bands, etc.)

**Example:**
```bash
$ stock-analyzer setup

🔧 Stock Sense AI Setup

? Alpha Vantage API Key: ******************
? Finnhub API Key: ******************
? Choose notification method: Telegram
? Telegram Bot Token: ******************
? Telegram Chat ID: 123456789
? Maximum risk per trade (%): 1
? Maximum position size (%): 25

✅ Configuration saved successfully!
```

**Notes:**
- All keys are encrypted with AES-256-CBC
- Stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Re-run anytime to update configuration

---

### health

Verify system configuration and API connectivity.

**Usage:**
```bash
stock-analyzer health
```

**Example:**
```bash
$ stock-analyzer health

🏥 System Health Check

✅ Configuration loaded
✅ Encryption working
✅ Alpha Vantage API: Connected
✅ Finnhub API: Connected
✅ Telegram Bot: Connected
✅ Cache directory: Ready (2.34 MB)
✅ Paper trading storage: Ready

All systems operational!

API Rate Limits:
  Alpha Vantage: 487/500 calls remaining today
  Finnhub: 60/60 calls per minute

Cache Status:
  Cached symbols: 5
  Total size: 2.34 MB
  Oldest data: AAPL (2 days ago)
```

**Exit Codes:**
- `0` - All systems operational
- `1` - Configuration errors
- `2` - API connection failures
- `3` - Storage errors

---

## Backtesting Commands

### backtest run

Run a backtest on historical data.

**Usage:**
```bash
stock-analyzer backtest run [options]
```

**Options:**
- `--strategy <name>` - Strategy to backtest (`mean-reversion`, `momentum`)
- `--symbol <symbol>` - Stock symbol (e.g., `AAPL`)
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--capital <amount>` - Initial capital (default: `10000`)
- `--slippage <model>` - Slippage model: `FIXED_BPS_5`, `FIXED_BPS_10`, `VOLUME_BASED`, `ZERO` (default: `FIXED_BPS_5`)
- `--commission <model>` - Commission model: `ZERO`, `FIXED_1`, `PERCENTAGE_0_1`, `PER_SHARE_0_005` (default: `ZERO`)
- `--no-market-hours` - Disable market hours enforcement
- `--benchmark <symbol>` - Benchmark symbol for comparison (default: `SPY`)

**Examples:**

Basic backtest:
```bash
stock-analyzer backtest run \
  --strategy mean-reversion \
  --symbol AAPL \
  --from 2023-01-01 \
  --to 2023-12-31
```

With custom slippage and commissions:
```bash
stock-analyzer backtest run \
  --strategy momentum \
  --symbol MSFT \
  --from 2023-01-01 \
  --to 2023-12-31 \
  --slippage FIXED_BPS_10 \
  --commission PERCENTAGE_0_1
```

Larger capital:
```bash
stock-analyzer backtest run \
  --strategy mean-reversion \
  --symbol GOOGL \
  --capital 100000
```

**Output:**
```
📊 Running backtest for AAPL...

Strategy: Mean Reversion
Period: 2023-01-01 to 2023-12-31 (252 days)
Initial Capital: $10,000.00
Slippage: 5 BPS
Commission: Zero

Progress: ████████████████████ 100%

✅ Backtest Complete!

═══════════════════════════════════════════════════════════
                    PERFORMANCE SUMMARY
═══════════════════════════════════════════════════════════

Returns:
  Total Return:           +15.23%
  CAGR:                   +15.45%
  Benchmark Return (SPY): +24.23%
  Alpha:                  -8.00%
  Beta:                   0.85

Risk Metrics:
  Sharpe Ratio:           1.82
  Sortino Ratio:          2.34
  Calmar Ratio:           1.80
  Max Drawdown:           -8.45%

[... full metrics output ...]
```

---

### backtest optimize

Optimize strategy parameters using grid search, random search, or walk-forward analysis.

**Usage:**
```bash
stock-analyzer backtest optimize [options]
```

**Options:**
- `--strategy <name>` - Strategy to optimize
- `--symbol <symbol>` - Stock symbol
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--method <type>` - Optimization method: `grid`, `random`, `walk-forward` (default: `grid`)
- `--metric <name>` - Optimization metric: `sharpe`, `sortino`, `return`, `calmar` (default: `sharpe`)
- `--max-iterations <n>` - Max iterations for random search (default: `100`)
- `--train-periods <n>` - Training periods for walk-forward (default: `6`)
- `--test-periods <n>` - Test periods for walk-forward (default: `1`)

**Examples:**

Grid search (test all combinations):
```bash
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --from 2023-01-01 \
  --to 2023-12-31 \
  --method grid \
  --metric sharpe
```

Random search (faster for large parameter spaces):
```bash
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --method random \
  --max-iterations 100 \
  --metric sortino
```

Walk-forward analysis (prevent overfitting):
```bash
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --method walk-forward \
  --train-periods 6 \
  --test-periods 1 \
  --metric sharpe
```

**Output (Grid Search):**
```
🔍 Optimizing Mean Reversion Strategy...

Parameter Space:
  RSI Oversold: [25, 30, 35]
  RSI Overbought: [65, 70, 75]
  BB StdDev: [1.5, 2.0, 2.5]

Total Combinations: 27
Optimization Metric: Sharpe Ratio

Progress: ████████████████████ 100% (27/27)
Elapsed: 4m 32s

✅ Optimization Complete!

Top 10 Results:
┌─────┬──────────┬──────────────┬────────────┬────────────┬───────────┬──────────┐
│ Rank│ RSI Low  │ RSI High     │ BB StdDev  │ Sharpe     │ Return    │ Max DD   │
├─────┼──────────┼──────────────┼────────────┼────────────┼───────────┼──────────┤
│ 1   │ 30       │ 70           │ 2.0        │ 1.95       │ +18.23%   │ -7.45%   │
│ 2   │ 25       │ 70           │ 2.0        │ 1.87       │ +16.45%   │ -8.12%   │
│ 3   │ 30       │ 65           │ 2.0        │ 1.84       │ +17.12%   │ -8.45%   │
│ 4   │ 30       │ 70           │ 1.5        │ 1.78       │ +15.89%   │ -9.23%   │
│ 5   │ 35       │ 70           │ 2.0        │ 1.72       │ +14.56%   │ -7.89%   │
[... more results ...]
└─────┴──────────┴──────────────┴────────────┴────────────┴───────────┴──────────┘

🏆 Best Parameters:
  RSI Oversold: 30
  RSI Overbought: 70
  BB StdDev: 2.0

⚠️  Overfitting Warning:
  Best Sharpe (1.95) is suspiciously high.
  Consider walk-forward analysis to validate.
```

**Output (Walk-Forward):**
```
🔄 Walk-Forward Analysis...

Windows: 6 (6-month train, 1-month test)

Window 1:
  Train: Jan-Jun 2023
  Test: Jul 2023
  Optimized: RSI 30/70, BB 2.0
  Train Sharpe: 1.95
  Test Sharpe: 1.72 ✅ (degradation: 11.8%)

Window 2:
  Train: Feb-Jul 2023
  Test: Aug 2023
  Optimized: RSI 30/70, BB 2.0
  Train Sharpe: 1.88
  Test Sharpe: 1.65 ✅ (degradation: 12.2%)

[... more windows ...]

═══════════════════════════════════════════════════════════

Average In-Sample Sharpe: 1.92
Average Out-of-Sample Sharpe: 1.72
Degradation: 10.4% ✅ (Good - strategy not overfitted)

Recommendation: Parameters are robust!
```

---

### backtest compare

Compare multiple strategies side-by-side.

**Usage:**
```bash
stock-analyzer backtest compare <strategy1> <strategy2> [strategy3...] [options]
```

**Options:**
- `--symbol <symbol>` - Stock symbol
- `--from <date>` - Start date
- `--to <date>` - End date
- `--capital <amount>` - Initial capital

**Example:**
```bash
stock-analyzer backtest compare mean-reversion momentum \
  --symbol AAPL \
  --from 2023-01-01 \
  --to 2023-12-31
```

**Output:**
```
📊 Comparing Strategies on AAPL...

Period: 2023-01-01 to 2023-12-31 (252 days)
Initial Capital: $10,000.00

Progress: ████████████████████ 100%

═══════════════════════════════════════════════════════════
                    STRATEGY COMPARISON
═══════════════════════════════════════════════════════════

┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Metric           │ Mean Reversion   │ Momentum         │ Buy & Hold       │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Total Return     │ +15.23% 🥈       │ +18.45% 🥇       │ +12.34%          │
│ Sharpe Ratio     │ 1.82 🥇          │ 1.67 🥈          │ 1.45             │
│ Sortino Ratio    │ 2.34 🥇          │ 2.01 🥈          │ 1.89             │
│ Max Drawdown     │ -8.45% 🥇        │ -12.34% 🥈       │ -15.67%          │
│ Win Rate         │ 64.29% 🥇        │ 58.33% 🥈        │ N/A              │
│ Profit Factor    │ 2.15 🥇          │ 1.89 🥈          │ N/A              │
│ Total Trades     │ 42               │ 56               │ 2                │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

🏆 Winner: Mean Reversion (highest Sharpe Ratio)

Insights:
  • Momentum has higher return but more volatility
  • Mean Reversion has best risk-adjusted return
  • Both outperform Buy & Hold significantly
```

---

## Data Management Commands

### backtest data download

Download historical stock data from Alpha Vantage or Finnhub.

**Usage:**
```bash
stock-analyzer backtest data download <symbols...> [options]
```

**Options:**
- `--from <date>` - Start date (YYYY-MM-DD) (default: 1 year ago)
- `--to <date>` - End date (YYYY-MM-DD) (default: today)
- `--provider <name>` - Data provider: `alpha-vantage`, `finnhub` (default: `alpha-vantage`)

**Examples:**

Download single symbol (default: last 1 year):
```bash
stock-analyzer backtest data download AAPL
```

Download multiple symbols:
```bash
stock-analyzer backtest data download AAPL MSFT GOOGL AMZN TSLA
```

Custom date range:
```bash
stock-analyzer backtest data download AAPL \
  --from 2020-01-01 \
  --to 2023-12-31
```

Use Finnhub provider:
```bash
stock-analyzer backtest data download AAPL --provider finnhub
```

**Output:**
```
Downloading data for 3 symbol(s):
  From: 2023-01-01
  To: 2023-12-31
  Provider: alpha-vantage

✔ [1/3] AAPL completed (252 data points)
✔ [2/3] MSFT completed (252 data points)
✔ [3/3] GOOGL completed (252 data points)

✅ Download complete!
  Success: 3/3
  Failed: 0/3

┌─────────────┬─────────────┬──────────────────────────────────────┐
│ Symbol      │ Data Points │ Date Range                           │
├─────────────┼─────────────┼──────────────────────────────────────┤
│ AAPL        │ 252         │ 2023-01-03 to 2023-12-29             │
│ MSFT        │ 252         │ 2023-01-03 to 2023-12-29             │
│ GOOGL       │ 252         │ 2023-01-03 to 2023-12-29             │
└─────────────┴─────────────┴──────────────────────────────────────┘

Data cached locally. Future backtests will use cache (24hr TTL).
```

---

### backtest data import

Import historical data from CSV files.

**Usage:**
```bash
stock-analyzer backtest data import <file> --symbol <symbol> [options]
```

**Options:**
- `--symbol <symbol>` - Symbol name (required)
- `--separator <char>` - CSV separator: `,`, `;`, `\t` (default: auto-detect)
- `--no-header` - CSV file has no header row
- `--date-format <format>` - Date format: `YYYY-MM-DD`, `MM/DD/YYYY`, etc. (default: auto-detect)

**Examples:**

Import with auto-detection:
```bash
stock-analyzer backtest data import data/AAPL.csv --symbol AAPL
```

Specify separator:
```bash
stock-analyzer backtest data import data.csv --symbol MSFT --separator ";"
```

CSV without header:
```bash
stock-analyzer backtest data import data.csv --symbol GOOGL --no-header
```

**Supported CSV Format:**
```csv
Date,Open,High,Low,Close,Volume
2023-01-03,100.50,102.30,99.80,101.20,50000000
2023-01-04,101.20,103.50,100.90,103.00,48000000
```

Alternative column names (auto-detected):
- Date: `Date`, `date`, `d`, `D`, `timestamp`
- Open: `Open`, `open`, `o`, `O`
- High: `High`, `high`, `h`, `H`
- Low: `Low`, `low`, `l`, `L`
- Close: `Close`, `close`, `c`, `C`
- Volume: `Volume`, `volume`, `v`, `V`

**Output:**
```
📥 Importing CSV data...

File: data/AAPL.csv
Symbol: AAPL
Separator: , (auto-detected)
Header: Yes
Date Format: YYYY-MM-DD (auto-detected)

Parsing CSV... ✔
Validating data... ✔

Data Summary:
  Rows: 252
  Date Range: 2023-01-03 to 2023-12-29
  Missing Data: 0 rows
  Duplicates: 0 rows

✅ Data validated successfully!

Caching data... ✔

✅ Import complete!
  Symbol: AAPL
  Data Points: 252
  Cache Location: data/cache/historical/aapl_2023-01-03_2023-12-29.json
```

---

### backtest data list

List all cached historical data.

**Usage:**
```bash
stock-analyzer backtest data list
```

**Output:**
```
Found 5 cached symbol(s)

┌──────────┬────────────┬──────────────────────────┬───────────────┬──────────────┐
│ Symbol   │ Data Points│ Date Range               │ Provider      │ Last Updated │
├──────────┼────────────┼──────────────────────────┼───────────────┼──────────────┤
│ AAPL     │ 252        │ 2023-01-03 to 2023-12-29 │ alpha-vantage │ 2 hours ago  │
│ MSFT     │ 252        │ 2023-01-03 to 2023-12-29 │ alpha-vantage │ 2 hours ago  │
│ GOOGL    │ 252        │ 2023-01-03 to 2023-12-29 │ alpha-vantage │ 2 hours ago  │
│ AMZN     │ 252        │ 2023-01-03 to 2023-12-29 │ finnhub       │ 1 day ago    │
│ TSLA     │ 252        │ 2023-01-03 to 2023-12-29 │ csv-import    │ 3 days ago   │
└──────────┴────────────┴──────────────────────────┴───────────────┴──────────────┘

Cache Statistics:
  Total symbols: 5
  Cache size: 2.34 MB
  Historical datasets: 5
  Quote cache entries: 0
```

---

### backtest data validate

Validate data quality (check for gaps, anomalies).

**Usage:**
```bash
stock-analyzer backtest data validate <symbol> [options]
```

**Options:**
- `--from <date>` - Start date (optional, validates specific range)
- `--to <date>` - End date (optional)

**Example:**
```bash
stock-analyzer backtest data validate AAPL
```

**Output:**
```
✅ Data validation passed for AAPL

Data Summary:
  Total data points: 252
  Date range: 2023-01-03 to 2023-12-29
  Missing trading days: 0

⚠️  Warnings:
  • 2023-03-15: Extreme volume spike detected (12.50x average)
  • 2023-07-20: Extreme price change (+8.50% in 1 day)

⚠️  Date gaps found: 2
  • 2023-11-23 to 2023-11-27 (4 days) - Thanksgiving week
  • 2023-12-25 to 2023-12-26 (1 day) - Christmas

ℹ️  Weekend/holiday gaps are normal and don't affect backtesting.
```

---

### backtest data export

Export cached data to CSV.

**Usage:**
```bash
stock-analyzer backtest data export <symbol> <output-file> [options]
```

**Options:**
- `--from <date>` - Start date (optional, exports specific range)
- `--to <date>` - End date (optional)
- `--separator <char>` - CSV separator (default: `,`)

**Example:**
```bash
stock-analyzer backtest data export AAPL output/AAPL_2023.csv
```

**Output:**
```
📤 Exporting data for AAPL...

Date Range: 2023-01-03 to 2023-12-29
Format: CSV (comma-separated)
Output: output/AAPL_2023.csv

Writing 252 rows... ✔

✅ Export complete!
  File: output/AAPL_2023.csv
  Size: 45.2 KB
  Rows: 252
```

**Generated CSV:**
```csv
Date,Open,High,Low,Close,Volume
2023-01-03,100.50,102.30,99.80,101.20,50000000
2023-01-04,101.20,103.50,100.90,103.00,48000000
...
```

---

### backtest data clear

Clear cached data for specific symbols or all symbols.

**Usage:**
```bash
stock-analyzer backtest data clear [symbol]
```

**Examples:**

Clear specific symbol:
```bash
stock-analyzer backtest data clear AAPL
```

Clear all cached data:
```bash
stock-analyzer backtest data clear
```

**Output (specific symbol):**
```
🗑️  Clearing cached data for AAPL...

Removing:
  • data/cache/historical/aapl_2023-01-03_2023-12-29.json
  • data/cache/metadata/aapl.json

✅ Cleared 2.34 MB
```

**Output (all data):**
```
⚠️  WARNING: This will delete ALL cached data!
? Are you sure? (y/N) y

🗑️  Clearing all cached data...

Removing:
  • 5 historical datasets
  • 0 quote cache entries
  • 5 metadata files

✅ Cleared 2.34 MB

Cache is now empty. Next backtest will download fresh data.
```

---

### backtest data stats

Show detailed cache statistics.

**Usage:**
```bash
stock-analyzer backtest data stats
```

**Output:**
```
📊 Cache Statistics

Total Size: 2.34 MB
Total Symbols: 5

Historical Data:
  Datasets: 5
  Size: 2.30 MB
  Oldest: TSLA (3 days ago)
  Newest: AAPL (2 hours ago)

Quote Cache:
  Entries: 0
  Size: 0 KB

By Provider:
  Alpha Vantage: 3 symbols (1.80 MB)
  Finnhub: 1 symbol (0.50 MB)
  CSV Import: 1 symbol (0.04 MB)

API Usage (Today):
  Alpha Vantage: 13/500 calls
  Finnhub: 5/10000 calls

Cache Hit Rate:
  Last 7 days: 94.3% (113/120 requests)
  API calls saved: 107

Recommendations:
  • Cache is healthy
  • Consider clearing TSLA (3 days old)
  • 487 API calls remaining today
```

---

## Paper Trading Commands

### paper start

Start paper trading with virtual capital.

**Usage:**
```bash
stock-analyzer paper start [options]
```

**Options:**
- `--strategy <name>` - Strategy to trade: `mean-reversion`, `momentum` (default: `mean-reversion`)
- `--capital <amount>` - Initial virtual capital (default: `10000`)
- `--symbols <list>` - Comma-separated symbols to trade (default: `AAPL,MSFT,GOOGL`)
- `--max-positions <n>` - Maximum concurrent positions (default: `10`)
- `--interval <ms>` - Market data refresh interval in ms (default: `60000` = 1 minute)
- `--no-market-hours` - Disable market hours enforcement (trade 24/7)

**Examples:**

Basic start:
```bash
stock-analyzer paper start
```

Custom configuration:
```bash
stock-analyzer paper start \
  --strategy momentum \
  --capital 25000 \
  --symbols AAPL,MSFT,GOOGL,AMZN,TSLA \
  --max-positions 5
```

**Output:**
```
🚀 Starting Paper Trading...

Configuration:
  Strategy: Mean Reversion
  Initial Capital: $10,000.00
  Symbols: AAPL, MSFT, GOOGL
  Max Positions: 10
  Max Position Size: $2,500 (25%)
  Daily Loss Limit: $500 (5%)
  Market Hours: 9:30 AM - 4:00 PM ET
  Update Interval: 60 seconds

Initializing engine...
  ✔ Portfolio manager initialized
  ✔ Order manager initialized
  ✔ Risk validator initialized
  ✔ Market data service initialized
  ✔ Performance calculator initialized

✅ Paper trading started!

Engine Status:
  Running: Yes
  Started: 11/8/2025, 9:30:15 AM
  Market: OPEN
  Next Update: In 60 seconds

Web Dashboard: http://localhost:3000

Commands:
  Status:      stock-analyzer paper status
  Portfolio:   stock-analyzer paper portfolio
  Trades:      stock-analyzer paper trades
  Performance: stock-analyzer paper performance
  Stop:        stock-analyzer paper stop

📊 Monitoring 3 symbols for trading opportunities...
```

---

### paper stop

Stop paper trading (positions remain open).

**Usage:**
```bash
stock-analyzer paper stop
```

**Output:**
```
🛑 Stopping paper trading...

Closing open orders... ✔ (1 order cancelled)
Saving state... ✔

Final Portfolio Summary:
  Total Value: $10,453.21
  Total P&L: +$453.21 (+4.53%)
  Win Rate: 62.50%
  Total Trades: 16
  Open Positions: 3

✅ Paper trading stopped
✅ All data saved to encrypted storage

Note: Open positions remain in portfolio.
They will be tracked when you restart.

To resume: stock-analyzer paper start
To reset: stock-analyzer paper reset (WARNING: deletes all data)
```

---

### paper status

Check paper trading status.

**Usage:**
```bash
stock-analyzer paper status
```

**Output:**
```
📊 Paper Trading Status

Engine:
  Running: Yes
  Started: 11/8/2025, 9:30:00 AM
  Uptime: 2h 15m 23s
  Last Update: 11:45:23 AM (15s ago)
  Market Status: OPEN
  Next Update: In 45 seconds

Portfolio:
  Total Value: $10,453.21
  Cash: $4,231.50
  Positions Value: $6,221.71
  Margin Used: $0.00

Performance:
  Today's P&L: +$123.45 (+1.23%)
  Total P&L: +$453.21 (+4.53%)
  Daily Return: +1.23%
  Total Return: +4.53%

Activity:
  Total Orders: 47
  Filled Orders: 42 (89.4%)
  Cancelled Orders: 5 (10.6%)
  Rejected Orders: 0 (0.0%)
  Active Positions: 3
  Open Orders: 1

Risk Status:
  Position Limit: 3/10 (30.0%)
  Exposure: 59.5% (limit: 80%)
  Daily Loss: +$123.45 (limit: -$500)
  ✅ All risk limits OK

Web Dashboard: http://localhost:3000
```

---

### paper portfolio

View detailed portfolio positions.

**Usage:**
```bash
stock-analyzer paper portfolio
```

**Output:**
```
💼 Portfolio Overview

Total Value: $10,453.21
Cash: $4,231.50 (40.5%)
Positions Value: $6,221.71 (59.5%)
Total P&L: +$453.21 (+4.53%)

Win Rate: 62.50% (10W / 6L)
Total Trades: 16
Max Drawdown: -3.21%

═══════════════════════════════════════════════════════════
                    OPEN POSITIONS
═══════════════════════════════════════════════════════════

AAPL - Apple Inc.
  Side: LONG
  Quantity: 15
  Entry Price: $152.30
  Entry Time: 11/8/2025, 9:45:00 AM
  Current Price: $155.40
  Current Value: $2,331.00
  Unrealized P&L: +$46.50 (+3.05%)
  MAE: -$5.20 (-0.34%)
  MFE: +$52.30 (+3.43%)
  Stop Loss: $149.25 (-2.0%)
  Take Profit: $158.39 (+4.0%)
  Duration: 2h 0m 23s

MSFT - Microsoft Corporation
  Side: LONG
  Quantity: 10
  Entry Price: $372.10
  Entry Time: 11/8/2025, 10:15:00 AM
  Current Price: $378.20
  Current Value: $3,782.00
  Unrealized P&L: +$61.00 (+1.64%)
  MAE: -$12.40 (-0.33%)
  MFE: +$67.80 (+1.82%)
  Stop Loss: $364.66 (-2.0%)
  Take Profit: $386.98 (+4.0%)
  Duration: 1h 30m 23s

GOOGL - Alphabet Inc.
  Side: LONG
  Quantity: 5
  Entry Price: $141.40
  Entry Time: 11/8/2025, 11:00:00 AM
  Current Price: $141.76
  Current Value: $708.80
  Unrealized P&L: +$1.80 (+0.25%)
  MAE: -$3.20 (-0.45%)
  MFE: +$4.50 (+0.64%)
  Stop Loss: $138.57 (-2.0%)
  Take Profit: $147.06 (+4.0%)
  Duration: 45m 23s

═══════════════════════════════════════════════════════════
```

---

### paper trades

View trade history.

**Usage:**
```bash
stock-analyzer paper trades [options]
```

**Options:**
- `--last <n>` - Show last N trades (default: all)
- `--symbol <symbol>` - Filter by symbol
- `--from <date>` - Filter by start date
- `--to <date>` - Filter by end date

**Examples:**

Last 10 trades:
```bash
stock-analyzer paper trades --last 10
```

All AAPL trades:
```bash
stock-analyzer paper trades --symbol AAPL
```

**Output:**
```
📊 Trade History (Last 10)

┌────┬────────┬──────┬─────────────┬───────────┬─────────────┬───────────┬──────────┬──────────┬──────────┐
│ ID │ Symbol │ Side │ Entry Time  │ Entry $   │ Exit Time   │ Exit $    │ Quantity │ P&L      │ Return   │
├────┼────────┼──────┼─────────────┼───────────┼─────────────┼───────────┼──────────┼──────────┼──────────┤
│ 16 │ AAPL   │ LONG │ 11/8 9:45   │ $152.30   │ 11/8 11:30  │ $155.40   │ 15       │ +$46.50  │ +3.05%   │
│ 15 │ MSFT   │ LONG │ 11/8 9:30   │ $372.10   │ 11/8 10:45  │ $375.80   │ 10       │ +$37.00  │ +0.99%   │
│ 14 │ GOOGL  │ LONG │ 11/7 14:15  │ $141.20   │ 11/8 9:00   │ $140.45   │ 5        │ -$3.75   │ -0.53%   │
│ 13 │ AAPL   │ LONG │ 11/7 10:30  │ $150.50   │ 11/7 15:00  │ $152.80   │ 15       │ +$34.50  │ +1.53%   │
│ 12 │ MSFT   │ LONG │ 11/7 9:45   │ $368.90   │ 11/7 14:30  │ $371.20   │ 10       │ +$23.00  │ +0.62%   │
│ 11 │ GOOGL  │ LONG │ 11/6 11:00  │ $139.80   │ 11/7 10:00  │ $141.10   │ 5        │ +$6.50   │ +0.93%   │
│ 10 │ AAPL   │ LONG │ 11/6 9:30   │ $148.20   │ 11/6 15:45  │ $145.60   │ 15       │ -$39.00  │ -1.75%   │
│ 9  │ MSFT   │ LONG │ 11/5 13:15  │ $365.40   │ 11/6 11:00  │ $367.90   │ 10       │ +$25.00  │ +0.68%   │
│ 8  │ GOOGL  │ LONG │ 11/5 10:00  │ $138.50   │ 11/5 15:30  │ $140.20   │ 5        │ +$8.50   │ +1.23%   │
│ 7  │ AAPL   │ LONG │ 11/4 14:45  │ $146.80   │ 11/5 9:15   │ $148.50   │ 15       │ +$25.50  │ +1.16%   │
└────┴────────┴──────┴─────────────┴───────────┴─────────────┴───────────┴──────────┴──────────┴──────────┘

Summary:
  Total Trades: 16
  Winning: 10 (62.5%)
  Losing: 6 (37.5%)
  Gross Profit: +$724.50
  Gross Loss: -$271.29
  Net Profit: +$453.21
  Profit Factor: 2.67
```

---

### paper performance

View detailed performance metrics.

**Usage:**
```bash
stock-analyzer paper performance
```

**Output:**
```
📈 Performance Metrics

═══════════════════════════════════════════════════════════
                        RETURNS
═══════════════════════════════════════════════════════════

Daily Return: +1.18%
Weekly Return: +3.42%
Monthly Return: N/A (insufficient data)
Total Return: +4.53%
CAGR: N/A (< 1 year of data)

═══════════════════════════════════════════════════════════
                     RISK METRICS
═══════════════════════════════════════════════════════════

Sharpe Ratio: 1.82 (annualized)
Sortino Ratio: 2.34
Calmar Ratio: N/A
Max Drawdown: -3.21%
Current Drawdown: 0.00%
Volatility: 12.4% (annualized)

═══════════════════════════════════════════════════════════
                   TRADE STATISTICS
═══════════════════════════════════════════════════════════

Total Trades: 16
Winning Trades: 10 (62.50%)
Losing Trades: 6 (37.50%)
Break-even Trades: 0 (0.00%)

Profit Factor: 2.67
Expectancy: $28.33 per trade

Consecutive Wins: 4 (current)
Consecutive Losses: 2 (max)
Max Consecutive Wins: 5
Max Consecutive Losses: 3

═══════════════════════════════════════════════════════════
                  WIN/LOSS ANALYSIS
═══════════════════════════════════════════════════════════

Average Win: $72.45
Average Loss: -$45.21
Win/Loss Ratio: 1.60

Largest Win: $145.80 (AAPL, 11/3)
Largest Loss: -$87.30 (MSFT, 11/1)

Average Win %: +2.34%
Average Loss %: -1.45%

═══════════════════════════════════════════════════════════
                      COST ANALYSIS
═══════════════════════════════════════════════════════════

Total Commissions: $0.00
Total Slippage: $23.45 (avg $1.47 per trade)
Net Profit (after costs): $453.21

═══════════════════════════════════════════════════════════
                    HOLDING TIMES
═══════════════════════════════════════════════════════════

Average: 4.2 hours
Median: 3.8 hours
Shortest: 45 minutes
Longest: 2 days 3 hours

═══════════════════════════════════════════════════════════
```

---

### paper orders

View active orders.

**Usage:**
```bash
stock-analyzer paper orders
```

**Output:**
```
📋 Active Orders

┌─────────┬────────┬──────────────┬──────┬──────────┬─────────────┬────────────┬─────────┐
│ ID      │ Symbol │ Type         │ Side │ Quantity │ Limit Price │ Stop Price │ Status  │
├─────────┼────────┼──────────────┼──────┼──────────┼─────────────┼────────────┼─────────┤
│ abc123  │ MSFT   │ LIMIT        │ BUY  │ 10       │ $370.00     │ -          │ PENDING │
│ def456  │ AAPL   │ STOP_LOSS    │ SELL │ 15       │ -           │ $149.25    │ PENDING │
│ ghi789  │ GOOGL  │ TAKE_PROFIT  │ SELL │ 5        │ $147.06     │ -          │ PENDING │
└─────────┴────────┴──────────────┴──────┴──────────┴─────────────┴────────────┴─────────┘

Total: 3 active orders
```

---

### paper reset

Reset paper trading portfolio (DELETE ALL DATA).

**Usage:**
```bash
stock-analyzer paper reset
```

**Output:**
```
⚠️  WARNING: This will DELETE ALL paper trading data!

This includes:
  • Portfolio state
  • All trade history
  • All order history
  • Performance history
  • Trade journal

This action CANNOT be undone!

? Are you sure you want to reset? (y/N) y

🗑️  Resetting paper trading...

Stopping engine... ✔
Deleting portfolio state... ✔
Deleting trade history (16 trades)... ✔
Deleting order history (47 orders)... ✔
Deleting journal (234 events)... ✔

✅ Paper trading reset complete

You can start fresh with: stock-analyzer paper start
```

---

## Risk Management Commands

### risk var

Calculate Value at Risk (VaR).

**Usage:**
```bash
stock-analyzer risk var [options]
```

**Options:**
- `--confidence <percent>` - Confidence level: `90`, `95`, `99` (default: `95`)
- `--method <type>` - Calculation method: `historical`, `parametric`, `monte-carlo` (default: `historical`)
- `--horizon <days>` - Time horizon in days (default: `1`)

**Examples:**

95% VaR (1-day):
```bash
stock-analyzer risk var --confidence 95
```

99% VaR (10-day) using Monte Carlo:
```bash
stock-analyzer risk var --confidence 99 --horizon 10 --method monte-carlo
```

**Output:**
```
📊 Value at Risk (VaR) Analysis

Method: Historical Simulation
Confidence Level: 95%
Time Horizon: 1 day
Portfolio Value: $10,453.21
Analysis Period: 90 days

VaR (95%, 1-day): -$312.45 (-2.99%)

Interpretation:
  With 95% confidence, your portfolio will not lose more than
  $312.45 in a single trading day.

  There is a 5% chance of losing more than this amount.

Historical Distribution (Daily Returns):
  1st Percentile: -5.23%
  5th Percentile: -2.99% ← VaR (95%)
  10th Percentile: -1.85%
  25th Percentile: -0.85%
  Median: +0.12%
  75th Percentile: +1.02%
  90th Percentile: +2.01%
  95th Percentile: +2.45%
  99th Percentile: +4.12%

Risk Assessment:
  ✅ VaR is within acceptable range (<5%)
  ⚠️  Monitor closely on high volatility days
```

---

### risk cvar

Calculate Conditional Value at Risk (CVaR / Expected Shortfall).

**Usage:**
```bash
stock-analyzer risk cvar [options]
```

**Options:**
- `--confidence <percent>` - Confidence level (default: `95`)
- `--method <type>` - Calculation method (default: `historical`)
- `--horizon <days>` - Time horizon in days (default: `1`)

**Example:**
```bash
stock-analyzer risk cvar --confidence 95
```

**Output:**
```
📊 Conditional Value at Risk (CVaR)

Method: Historical Simulation
Confidence Level: 95%
Time Horizon: 1 day
Portfolio Value: $10,453.21

CVaR (95%, 1-day): -$425.67 (-4.07%)

Interpretation:
  If your portfolio experiences a loss in the worst 5% of days,
  the average loss will be $425.67 (4.07%).

  CVaR (Expected Shortfall) represents the average loss when VaR
  is exceeded. It's always worse than VaR.

Comparison:
  VaR (95%):  -$312.45 (-2.99%)
  CVaR (95%): -$425.67 (-4.07%)
  Difference: -$113.22 (36.2% worse)

Tail Risk Analysis:
  Worst 5% of days: -4.07% average loss
  Worst single day: -5.23% loss
  Tail risk is moderate

Risk Assessment:
  ⚠️  CVaR >4% indicates moderate tail risk
  Consider:
    • Reducing position sizes
    • Adding stop-losses
    • Diversifying across uncorrelated assets
```

---

### risk monte-carlo

Run Monte Carlo simulation for portfolio projections.

**Usage:**
```bash
stock-analyzer risk monte-carlo [options]
```

**Options:**
- `--scenarios <n>` - Number of scenarios (default: `10000`)
- `--horizon <days>` - Time horizon in days (default: `252` = 1 year)
- `--method <type>` - Simulation method: `bootstrap`, `geometric-brownian` (default: `bootstrap`)

**Example:**
```bash
stock-analyzer risk monte-carlo --scenarios 10000 --horizon 252
```

**Output:**
```
🎲 Monte Carlo Simulation

Scenarios: 10,000
Time Horizon: 252 trading days (~1 year)
Initial Portfolio: $10,453.21
Method: Bootstrap Resampling

Running simulation... ████████████████████ 100% (10000/10000)
Elapsed: 2.8s

═══════════════════════════════════════════════════════════
                FINAL PORTFOLIO VALUE DISTRIBUTION
═══════════════════════════════════════════════════════════

5th Percentile:   $8,234.12 (-21.2%)
10th Percentile:  $9,012.45 (-13.8%)
25th Percentile:  $9,856.78 (-5.7%)
Median (50th):    $11,523.45 (+10.2%)
75th Percentile:  $13,245.67 (+26.7%)
90th Percentile:  $14,567.89 (+39.4%)
95th Percentile:  $15,678.90 (+50.0%)

Mean: $11,634.56 (+11.3%)
Std Dev: $2,145.23

═══════════════════════════════════════════════════════════
                    PROBABILITY ANALYSIS
═══════════════════════════════════════════════════════════

Probability of Profit: 72.3%
Probability of Loss: 27.7%
Probability of >20% Return: 35.4%
Probability of >50% Return: 5.2%
Probability of <-20% Loss: 5.1%

═══════════════════════════════════════════════════════════
                   DRAWDOWN DISTRIBUTION
═══════════════════════════════════════════════════════════

Median Max Drawdown: -12.3%
95th Percentile Max Drawdown: -28.4%
Worst Case Max Drawdown: -45.6%

Average Time to Recovery: 45 days

═══════════════════════════════════════════════════════════
                      RISK ASSESSMENT
═══════════════════════════════════════════════════════════

Expected Return: +11.3%
Expected Volatility: 20.5%
Sharpe Ratio (est): 0.55

Risk Level: MODERATE

Insights:
  • 72% chance of profit after 1 year
  • Median return of +10.2% is reasonable
  • 5% chance of losing more than 20%
  • Consider diversification if risk-averse

ASCII Distribution:
     |
  30%|           ╭─╮
  25%|         ╭─╯ ╰─╮
  20%|       ╭─╯     ╰─╮
  15%|     ╭─╯         ╰─╮
  10%|   ╭─╯             ╰─╮
   5%| ╭─╯                 ╰─╮
     ├─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬───
    -30 -20 -10  0 +10 +20 +30 +40 +50%
```

---

### risk stress-test

Stress test portfolio against historical crisis scenarios.

**Usage:**
```bash
stock-analyzer risk stress-test [options]
```

**Options:**
- `--scenario <name>` - Crisis scenario (default: `all`)
  - `2008-financial-crisis` - Sep 2008 - Mar 2009 (-56.8% S&P 500)
  - `2020-covid-crash` - Feb-Mar 2020 (-33.9% S&P 500)
  - `2011-debt-crisis` - Jul-Oct 2011 (-19.4% S&P 500)
  - `2018-december-selloff` - Oct-Dec 2018 (-19.8% S&P 500)
  - `2022-bear-market` - Jan-Oct 2022 (-27.5% S&P 500)
  - `all` - Test all scenarios

**Example:**
```bash
stock-analyzer risk stress-test --scenario 2008-financial-crisis
```

**Output:**
```
⚠️  Stress Test: 2008 Financial Crisis

Scenario Details:
  Period: Sep 2008 - Mar 2009 (6 months)
  S&P 500 Decline: -56.8%
  Duration: 182 days
  Peak Decline Day: Oct 10, 2008 (-7.6%)
  Volatility: Extreme (VIX >70)

Applying market shocks to your portfolio...

═══════════════════════════════════════════════════════════
                     PORTFOLIO IMPACT
═══════════════════════════════════════════════════════════

Initial Value: $10,453.21
Stressed Value: $6,234.12
Total Loss: -$4,219.09 (-40.4%)

Individual Position Impacts:
  AAPL:  $2,331.00 → $1,277.00 (-45.2%)
  MSFT:  $3,782.00 → $2,318.00 (-38.7%)
  GOOGL: $708.80 → $447.00 (-36.9%)

═══════════════════════════════════════════════════════════
                  RISK METRICS UNDER STRESS
═══════════════════════════════════════════════════════════

Max Drawdown: -45.2%
Peak-to-Trough Time: 97 days
Recovery Time: 456 days (estimated)

VaR (95%, 1-day): -8.7% (normal: -2.99%)
CVaR (95%, 1-day): -12.3% (normal: -4.07%)

Volatility: 52.3% annualized (normal: 12.4%)
Correlation: +0.92 (high - diversification fails in crisis)

═══════════════════════════════════════════════════════════
                    RISK ASSESSMENT
═══════════════════════════════════════════════════════════

Severity: 🔴 HIGH (40% portfolio loss)

Survival Probability: 100% (no margin calls, all-cash portfolio)
Time to Break-Even: ~1.5 years

═══════════════════════════════════════════════════════════
                     RECOMMENDATIONS
═══════════════════════════════════════════════════════════

To reduce crisis impact:

1. Diversification:
   • Add bonds (60/40 portfolio) → -20% loss (vs -40%)
   • Add gold → -15% loss
   • Add international stocks → -25% loss

2. Risk Management:
   • Reduce position sizes to 15% each → -30% loss
   • Implement 20% trailing stops → -25% loss
   • Use options for downside protection → -15% loss

3. Cash Allocation:
   • Keep 20% cash reserve → -32% loss
   • Allows buying opportunities during crisis

4. Hedging:
   • Buy SPY puts → -10% loss
   • Use inverse ETFs → breakeven

Your current portfolio is AGGRESSIVE with no hedges.
Consider defensive measures before the next crisis.
```

**Output (All Scenarios):**
```
⚠️  Stress Test: All Historical Scenarios

Testing 5 crisis scenarios...

┌────────────────────────┬───────────────┬──────────────┬──────────────┬──────────────┐
│ Scenario               │ S&P 500 Loss  │ Portfolio    │ Max Drawdown │ Recovery     │
│                        │               │ Loss         │              │ Time         │
├────────────────────────┼───────────────┼──────────────┼──────────────┼──────────────┤
│ 2008 Financial Crisis  │ -56.8%        │ -40.4% 🔴    │ -45.2%       │ 456 days     │
│ 2020 COVID Crash       │ -33.9%        │ -24.3% 🟡    │ -28.7%       │ 145 days     │
│ 2022 Bear Market       │ -27.5%        │ -19.8% 🟡    │ -22.4%       │ 267 days     │
│ 2011 Debt Crisis       │ -19.4%        │ -14.2% 🟢    │ -16.8%       │ 98 days      │
│ 2018 December Selloff  │ -19.8%        │ -15.1% 🟢    │ -17.9%       │ 87 days      │
└────────────────────────┴───────────────┴──────────────┴──────────────┴──────────────┘

═══════════════════════════════════════════════════════════
                      SUMMARY
═══════════════════════════════════════════════════════════

Average Loss Across Scenarios: -22.8%
Worst Case Loss: -40.4% (2008)
Best Case Loss: -14.2% (2011)

Your portfolio is MODERATELY RESILIENT to historical crises.

Key Findings:
  • Tech-heavy portfolio amplifies losses in severe crises
  • Lack of diversification increases correlation risk
  • No hedges or defensive positions

Recommendations: See individual scenario analysis above.
```

---

### risk correlation

View correlation matrix for portfolio holdings.

**Usage:**
```bash
stock-analyzer risk correlation
```

**Output:**
```
📊 Correlation Matrix

Period: Last 90 days
Portfolio Holdings: AAPL, MSFT, GOOGL

Correlation Matrix (Daily Returns):

        AAPL    MSFT    GOOGL   SPY
AAPL    1.00    0.78    0.72    0.85
MSFT    0.78    1.00    0.74    0.82
GOOGL   0.72    0.74    1.00    0.79
SPY     0.85    0.82    0.79    1.00

Interpretation:
  0.0 - 0.3: Low correlation (good diversification)
  0.3 - 0.7: Moderate correlation
  0.7 - 1.0: High correlation (poor diversification)

Analysis:
  ⚠️  HIGH correlation between all holdings (0.72 - 0.78)
  ⚠️  Portfolio moves together with market (SPY: 0.79 - 0.85)
  🔴 Poor diversification - all tech stocks

Recommendations:
  • Add uncorrelated assets (bonds, gold, international)
  • Consider defensive sectors (utilities, consumer staples)
  • Reduce tech concentration

Average Pairwise Correlation: 0.75 (HIGH)
Diversification Score: 3/10 (POOR)
```

---

### risk kelly

Calculate optimal position size using Kelly Criterion.

**Usage:**
```bash
stock-analyzer risk kelly [options]
```

**Options:**
- `--win-rate <percent>` - Historical win rate (0-100)
- `--avg-win <amount>` - Average win amount ($)
- `--avg-loss <amount>` - Average loss amount ($)

**Example:**
```bash
stock-analyzer risk kelly --win-rate 65 --avg-win 100 --avg-loss 50
```

**Output:**
```
📐 Kelly Criterion Position Sizing

Inputs:
  Win Rate (W): 65%
  Average Win (B): $100
  Average Loss (A): $50
  Win/Loss Ratio: 2.0

Kelly Formula: f* = (W × B - (1-W) × A) / (B × A)

Kelly Percentage: 30.0%

Interpretation:
  The Kelly Criterion suggests risking 30% of your portfolio
  per trade for optimal long-term growth.

  However, this is VERY AGGRESSIVE and most traders use
  fractional Kelly for reduced volatility.

Kelly Fractions:

┌──────────────────┬────────────┬──────────────┬────────────────────┐
│ Strategy         │ % Risk     │ Volatility   │ Recommendation     │
├──────────────────┼────────────┼──────────────┼────────────────────┤
│ Full Kelly       │ 30.0%      │ Very High    │ Risky              │
│ Half Kelly       │ 15.0%      │ High         │ Recommended ✅      │
│ Quarter Kelly    │ 7.5%       │ Moderate     │ Conservative       │
│ Eighth Kelly     │ 3.8%       │ Low          │ Very Conservative  │
└──────────────────┴────────────┴──────────────┴────────────────────┘

Your Current Settings:
  Max Position Size: 25%
  Recommendation: Reduce to 15% (Half Kelly)

Expected Growth Rate:
  Full Kelly (30%): +45.2% per year (high volatility)
  Half Kelly (15%): +38.7% per year (moderate volatility)
  Quarter Kelly (7.5%): +28.3% per year (low volatility)

Recommendation: Use Half Kelly (15%) for optimal balance
between growth and risk management.
```

---

### risk report

Generate comprehensive risk report.

**Usage:**
```bash
stock-analyzer risk report [options]
```

**Options:**
- `--format <type>` - Output format: `console`, `html`, `pdf` (default: `console`)
- `--output <file>` - Output file path (for HTML/PDF)

**Example:**
```bash
stock-analyzer risk report
```

**Output:**
```
📊 Portfolio Risk Report

Generated: 11/8/2025, 11:45 AM
Portfolio Value: $10,453.21

═══════════════════════════════════════════════════════════
                    PORTFOLIO OVERVIEW
═══════════════════════════════════════════════════════════

Holdings:
  AAPL:  $2,331.00 (22.3%)
  MSFT:  $3,782.00 (36.2%)
  GOOGL: $708.80 (6.8%)
  Cash:  $4,231.50 (40.5%)

Total Return: +4.53%
Win Rate: 62.50%

═══════════════════════════════════════════════════════════
                      VALUE AT RISK
═══════════════════════════════════════════════════════════

VaR (95%, 1-day): -$312.45 (-2.99%)
CVaR (95%, 1-day): -$425.67 (-4.07%)

Risk Level: MODERATE ✅

═══════════════════════════════════════════════════════════
                    STRESS TEST RESULTS
═══════════════════════════════════════════════════════════

2008 Financial Crisis: -40.4% 🔴
2020 COVID Crash: -24.3% 🟡
2022 Bear Market: -19.8% 🟡

Average Crisis Loss: -22.8%

═══════════════════════════════════════════════════════════
                   MONTE CARLO SIMULATION
═══════════════════════════════════════════════════════════

1-Year Projection (10,000 scenarios):
  Median Return: +10.2%
  5th Percentile: -21.2%
  95th Percentile: +50.0%
  Probability of Profit: 72.3%

═══════════════════════════════════════════════════════════
                    CORRELATION ANALYSIS
═══════════════════════════════════════════════════════════

Average Pairwise Correlation: 0.75
Diversification Score: 3/10 (POOR) ⚠️

Holdings are highly correlated. Consider diversifying.

═══════════════════════════════════════════════════════════
                     RISK RECOMMENDATIONS
═══════════════════════════════════════════════════════════

1. 🔴 HIGH PRIORITY:
   • Reduce tech concentration (currently 65% tech stocks)
   • Add uncorrelated assets (bonds, gold, international)
   • Implement stop-losses (currently none)

2. 🟡 MEDIUM PRIORITY:
   • Reduce position sizes to Half Kelly (15%)
   • Add defensive sectors (utilities, consumer staples)
   • Consider put options for downside protection

3. 🟢 LOW PRIORITY:
   • Monitor correlation matrix monthly
   • Rebalance portfolio quarterly
   • Track VaR and CVaR weekly

Overall Risk Rating: MODERATE (6/10)

Your portfolio has moderate risk with room for improvement.
Focus on diversification and downside protection.
```

---

## Analysis Commands

### analyze

Analyze individual stock with technical indicators.

**Usage:**
```bash
stock-analyzer analyze <symbol> [options]
```

**Options:**
- `--detailed` - Show all technical indicators
- `--strategy <name>` - Apply specific strategy analysis

**Example:**
```bash
stock-analyzer analyze AAPL --detailed
```

**Output:**
```
📊 Analyzing AAPL...

Current Price: $155.40
Change: +$2.30 (+1.50%)
Volume: 58.2M (Above Average)

═══════════════════════════════════════════════════════════
                   MEAN REVERSION SIGNALS
═══════════════════════════════════════════════════════════

Signal: NEUTRAL (Confidence: 45%)

RSI (14): 52.3 (Neutral)
MFI (14): 48.7 (Neutral)
Bollinger Bands: Mid-band ($154.20)
Stochastic: %K: 51.2, %D: 49.8 (Neutral)
Williams %R: -48.2 (Neutral)

═══════════════════════════════════════════════════════════
                    MOMENTUM SIGNALS
═══════════════════════════════════════════════════════════

Signal: BUY (Confidence: 65%)

SMA 20: $152.30 (Above ✅)
SMA 50: $148.90 (Above ✅)
SMA 200: $145.20 (Above ✅)
MACD: 2.34 (Positive ✅)
Price Momentum: +8.2% (Strong ✅)
Trend: Uptrend ✅

[... full analysis ...]
```

---

### scan

Scan multiple stocks for trading opportunities.

**Usage:**
```bash
stock-analyzer scan [options]
```

**Options:**
- `--watchlist <file>` - Watchlist file or comma-separated symbols
- `--strategy <name>` - Strategy to use for scanning
- `--top <n>` - Show top N opportunities (default: all)

**Example:**
```bash
stock-analyzer scan --watchlist AAPL,MSFT,GOOGL,AMZN,TSLA --top 5
```

**Output:**
```
🔍 Scanning 5 symbols...

Strategy: Mean Reversion
Progress: ████████████████████ 100% (5/5)

═══════════════════════════════════════════════════════════
                    TOP 5 OPPORTUNITIES
═══════════════════════════════════════════════════════════

1. AAPL - Apple Inc.
   Signal: STRONG BUY (Confidence: 85%)
   Price: $155.40 (+1.50%)
   RSI: 28.3 (Oversold)
   Entry: $155.00
   Stop Loss: $151.90 (-2.0%)
   Target: $161.20 (+4.0%)

2. MSFT - Microsoft Corporation
   Signal: BUY (Confidence: 72%)
   Price: $378.20 (+0.80%)
   RSI: 32.1 (Oversold)
   Entry: $378.00
   Stop Loss: $370.44 (-2.0%)
   Target: $393.12 (+4.0%)

[... more results ...]

Total Signals:
  Strong Buy: 2
  Buy: 1
  Neutral: 1
  Sell: 0
  Strong Sell: 1
```

---

### discover

Discover new stock opportunities based on technical criteria.

**Usage:**
```bash
stock-analyzer discover [options]
```

**Options:**
- `--sector <name>` - Filter by sector
- `--min-volume <amount>` - Minimum average volume
- `--max-price <amount>` - Maximum stock price

**Example:**
```bash
stock-analyzer discover --sector technology --min-volume 1000000
```

---

### market

View market overview and indices.

**Usage:**
```bash
stock-analyzer market
```

**Output:**
```
📊 Market Overview

Major Indices:
  S&P 500 (SPY): $445.32 (+0.45%)
  Dow Jones (DIA): $350.12 (-0.12%)
  Nasdaq (QQQ): $385.67 (+0.78%)

Market Status: OPEN
Next Close: 4:00 PM ET (2h 15m)

Sector Performance (Today):
  Technology: +0.82% 🟢
  Healthcare: +0.34% 🟢
  Financials: -0.12% 🔴
  Energy: -0.45% 🔴
```

---

## Cache Commands

### cache --stats

Show cache statistics.

**Usage:**
```bash
stock-analyzer cache --stats
```

(See `backtest data stats` for detailed output)

---

### cache --clear

Clear all cache.

**Usage:**
```bash
stock-analyzer cache --clear
```

(Equivalent to `backtest data clear`)

---

## Web Dashboard Commands

### dashboard

Launch web dashboard.

**Usage:**
```bash
stock-analyzer dashboard [options]
```

**Options:**
- `--port <number>` - Port number (default: `3000`)
- `--host <address>` - Host address (default: `localhost`)

**Example:**
```bash
stock-analyzer dashboard --port 8080
```

**Output:**
```
🌐 Starting Web Dashboard...

Server: http://localhost:3000
Press Ctrl+C to stop

Features:
  • Real-time portfolio tracking
  • Interactive charts (TradingView)
  • Trade journal
  • Performance metrics
  • Risk analytics

✅ Dashboard ready!
```

---

### monitor

Real-time portfolio monitoring (terminal UI).

**Usage:**
```bash
stock-analyzer monitor
```

**Output:**
```
┌──────────────────────────────────────────────────────────┐
│            Stock Sense AI - Live Monitoring               │
│                  Press 'q' to quit                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Portfolio: $10,453.21 (+4.53%) ↑                        │
│  Today: +$123.45 (+1.23%)                                │
│                                                           │
│  Positions:                                               │
│    AAPL:  $2,331.00 (+3.05%) ↑                           │
│    MSFT:  $3,782.00 (+1.64%) ↑                           │
│    GOOGL: $708.80 (+0.25%) ↑                             │
│                                                           │
│  Last Update: 11:45:23 (5s ago)                          │
│  Next Update: In 55s                                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Global Options

All commands support these global options:

- `--help`, `-h` - Show help for command
- `--version`, `-V` - Show version number
- `--verbose`, `-v` - Enable verbose logging
- `--quiet`, `-q` - Suppress non-essential output
- `--config <file>` - Use custom config file

**Examples:**

Show help:
```bash
stock-analyzer backtest run --help
```

Verbose mode:
```bash
stock-analyzer backtest run --strategy mean-reversion --symbol AAPL --verbose
```

Quiet mode (errors only):
```bash
stock-analyzer backtest run --strategy mean-reversion --symbol AAPL --quiet
```

---

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - API error
- `4` - Data error
- `5` - Invalid arguments

---

## Environment Variables

- `NODE_ENV` - Environment (development, production)
- `STOCK_ANALYZER_CONFIG` - Custom config file path
- `STOCK_ANALYZER_CACHE_DIR` - Custom cache directory

---

## Tips & Tricks

### Combine Commands with Unix Pipes

```bash
# Export trades and analyze with grep
stock-analyzer paper trades | grep "AAPL"

# Count winning trades
stock-analyzer paper trades | grep "+" | wc -l

# Get summary stats
stock-analyzer paper performance | grep "Sharpe"
```

### Use Aliases

Add to `.bashrc` or `.zshrc`:
```bash
alias bt="stock-analyzer backtest run"
alias paper="stock-analyzer paper"
alias risk="stock-analyzer risk"
```

Usage:
```bash
bt --strategy mean-reversion --symbol AAPL
paper start --capital 10000
risk var --confidence 95
```

### Batch Processing

Download data for multiple symbols:
```bash
for symbol in AAPL MSFT GOOGL AMZN TSLA; do
  stock-analyzer backtest data download $symbol
done
```

Run backtests on all symbols:
```bash
for symbol in AAPL MSFT GOOGL; do
  stock-analyzer backtest run --strategy mean-reversion --symbol $symbol
done
```

---

## Support

For help:
- **Command help**: `stock-analyzer <command> --help`
- **Full documentation**: [docs/](../docs/)
- **Troubleshooting**: [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **FAQ**: [docs/FAQ.md](FAQ.md)
- **GitHub Issues**: [Report a bug](https://github.com/[your-username]/stock-sense-ai/issues)

---

**Last Updated**: November 8, 2025

**Total Commands**: 30+

**Difficulty**: Beginner to Advanced
