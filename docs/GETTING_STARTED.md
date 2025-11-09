# Getting Started with Stock Sense AI

**Complete beginner's guide - From zero to first backtest in 15 minutes**

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [First-Time Setup](#first-time-setup)
4. [Your First Backtest](#your-first-backtest)
5. [Parameter Optimization](#parameter-optimization)
6. [Paper Trading](#paper-trading)
7. [Risk Analysis](#risk-analysis)
8. [Next Steps](#next-steps)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Node.js**: Version 18.0.0 or higher
- **RAM**: Minimum 4GB (8GB recommended for optimization)
- **Storage**: 500MB for application + 1GB for data cache

### Required Software

#### 1. Install Node.js

**macOS (using Homebrew):**
```bash
brew install node@18
```

**Windows:**
- Download from [nodejs.org](https://nodejs.org/)
- Run the installer (LTS version recommended)
- Verify installation: `node --version`

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verify Installation:**
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show v9.x.x or higher
```

#### 2. Install pnpm (Recommended)

pnpm is faster and more efficient than npm:

```bash
npm install -g pnpm

# Verify installation
pnpm --version  # Should show v8.15.0 or higher
```

**Alternatively, use npm:** All commands work with npm, just replace `pnpm` with `npm`.

### API Keys (Free)

You'll need API keys from these providers (both have generous free tiers):

#### Alpha Vantage (Required)
- **Purpose**: Historical stock data and technical indicators
- **Free Tier**: 500 API calls/day, 5 calls/minute
- **Sign Up**: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
- **Steps**:
  1. Visit the link above
  2. Enter your email
  3. Click "GET FREE API KEY"
  4. Copy the key (save it for setup)

#### Finnhub (Recommended)
- **Purpose**: Real-time quotes and backup data source
- **Free Tier**: 60 API calls/minute
- **Sign Up**: [finnhub.io/register](https://finnhub.io/register)
- **Steps**:
  1. Create a free account
  2. Verify your email
  3. Go to Dashboard → API Keys
  4. Copy the key (save it for setup)

#### Telegram (Optional, for Notifications)
- **Purpose**: Instant trade alerts and notifications
- **Free**: Yes, completely free
- **Setup**:
  1. Open Telegram app
  2. Search for [@BotFather](https://t.me/BotFather)
  3. Send `/newbot` and follow prompts
  4. Copy the Bot Token (save it for setup)
  5. Search for [@userinfobot](https://t.me/userinfobot)
  6. Send `/start` to get your Chat ID (save it for setup)

---

## Installation

### Step 1: Clone the Repository

```bash
# Using HTTPS
git clone https://github.com/[your-username]/stock-sense-ai.git

# OR using SSH (if you have GitHub SSH keys set up)
git clone git@github.com:[your-username]/stock-sense-ai.git

# Navigate to the directory
cd stock-sense-ai
```

### Step 2: Install Dependencies

```bash
# Using pnpm (recommended)
pnpm install

# OR using npm
npm install
```

**Expected output:**
```
Progress: resolved 234, reused 234, downloaded 0, added 234, done
Done in 15.3s
```

### Step 3: Build the Project

```bash
pnpm build

# OR
npm run build
```

**Expected output:**
```
> stock-sense-ai@1.0.0 build
> tsc

Successfully compiled TypeScript files
```

### Step 4: Verify Installation

```bash
# Run the CLI
stock-analyzer --version

# OR if not globally available
node dist/index.js --version
```

**Expected output:**
```
1.0.0
```

---

## First-Time Setup

Run the interactive setup wizard to configure API keys and preferences:

```bash
stock-analyzer setup
```

### Setup Wizard Walkthrough

#### 1. API Keys

```
🔧 Stock Sense AI Setup

? Alpha Vantage API Key: [enter your key]
? Finnhub API Key: [enter your key]
```

**Tip**: Keys are encrypted with AES-256-CBC and stored securely in your OS keychain.

#### 2. Notification Preferences

```
? Choose notification method: (Use arrow keys)
❯ Telegram (Recommended - Free, instant)
  Email (SendGrid required)
  Both Telegram and Email
  None (Console only)
```

**Recommendation**: Choose Telegram for free instant notifications.

If you choose Telegram:
```
? Telegram Bot Token (from @BotFather): [enter bot token]
? Telegram Chat ID (your user ID): [enter chat ID]
```

#### 3. Risk Parameters

```
? Maximum risk per trade (%): (1) [press Enter for default]
? Maximum position size (%): (25) [press Enter for default]
```

**Recommendations**:
- **Max risk per trade**: 1% (conservative) to 2% (moderate)
- **Max position size**: 20% (conservative) to 25% (moderate)

#### 4. Trading Strategy Defaults

```
? RSI Oversold Level: (30)
? RSI Overbought Level: (70)
? Bollinger Band Standard Deviations: (2)
```

**Tip**: Accept defaults unless you have specific preferences.

#### 5. Completion

```
✅ Configuration saved successfully!
✅ Encryption keys stored in OS keychain
✅ Setup complete!

Next steps:
  1. Run health check: stock-analyzer health
  2. Download data: stock-analyzer backtest data download AAPL
  3. Run your first backtest: stock-analyzer backtest run --strategy mean-reversion --symbol AAPL
```

### Verify Setup

```bash
stock-analyzer health
```

**Expected output:**
```
🏥 System Health Check

✅ Configuration loaded
✅ Encryption working
✅ Alpha Vantage API: Connected
✅ Finnhub API: Connected
✅ Telegram Bot: Connected
✅ Cache directory: Ready

All systems operational!
```

---

## Your First Backtest

Let's backtest a mean reversion strategy on Apple stock (AAPL) for 2023.

### Step 1: Download Historical Data

```bash
stock-analyzer backtest data download AAPL --from 2023-01-01 --to 2023-12-31
```

**What's happening:**
- Downloads daily OHLCV data from Alpha Vantage
- Validates data quality (checks for gaps, anomalies)
- Caches data locally (future backtests use cache)
- Takes ~10 seconds (5 second API rate limit)

**Expected output:**
```
Downloading data for 1 symbol(s):
  From: 2023-01-01
  To: 2023-12-31
  Provider: alpha-vantage

✔ [1/1] AAPL completed

✅ Download complete!
  Success: 1/1

┌────────┬─────────────┬──────────────────────────────────┐
│ Symbol │ Data Points │ Date Range                       │
├────────┼─────────────┼──────────────────────────────────┤
│ AAPL   │ 252         │ 2023-01-03 to 2023-12-29         │
└────────┴─────────────┴──────────────────────────────────┘
```

**Tip**: Data is cached for 24 hours. Subsequent backtests use the cache (instant).

### Step 2: Run Your First Backtest

```bash
stock-analyzer backtest run \
  --strategy mean-reversion \
  --symbol AAPL \
  --from 2023-01-01 \
  --to 2023-12-31 \
  --capital 10000
```

**What's happening:**
- Loads cached AAPL data
- Initializes portfolio with $10,000
- Applies mean reversion strategy (RSI, Bollinger Bands, etc.)
- Simulates realistic order execution (slippage, commissions)
- Calculates 30+ performance metrics
- Takes ~30 seconds

**Expected output:**
```
📊 Running backtest for AAPL...

Strategy: Mean Reversion
Period: 2023-01-01 to 2023-12-31
Initial Capital: $10,000.00
Slippage: 5 BPS
Commission: Zero

Progress: ████████████████████ 100% (252/252 days)

✅ Backtest Complete!

═══════════════════════════════════════════════════════════
                    PERFORMANCE SUMMARY
═══════════════════════════════════════════════════════════

Returns:
  Total Return:           +15.23%
  CAGR:                   +15.45%
  Daily Return (Avg):     +0.06%
  Weekly Return (Avg):    +0.29%
  Monthly Return (Avg):   +1.27%

Risk Metrics:
  Sharpe Ratio:           1.82
  Sortino Ratio:          2.34
  Calmar Ratio:           1.80
  Max Drawdown:           -8.45%
  Current Drawdown:       0.00%

Trade Statistics:
  Total Trades:           42
  Winning Trades:         27
  Losing Trades:          15
  Win Rate:               64.29%
  Profit Factor:          2.15
  Expectancy:             $18.50

Win/Loss Analysis:
  Average Win:            $72.45
  Average Loss:           -$41.20
  Largest Win:            $145.80
  Largest Loss:           -$87.30
  Win/Loss Ratio:         1.76

Costs:
  Total Commissions:      $0.00
  Total Slippage:         $23.45
  Net Profit:             $1,523.00

Final Portfolio:
  Ending Capital:         $11,523.00
  Cash:                   $11,523.00
  Positions:              0 (all closed)

═══════════════════════════════════════════════════════════
```

### Step 3: Understand the Results

#### Key Metrics Explained

**Total Return (+15.23%)**
- Your strategy made 15.23% profit on the initial $10,000
- Final value: $11,523

**Sharpe Ratio (1.82)**
- Risk-adjusted return
- **>1.0** = Good, **>2.0** = Excellent, **>3.0** = Outstanding
- 1.82 is considered very good

**Sortino Ratio (2.34)**
- Similar to Sharpe but only penalizes downside volatility
- Higher is better

**Max Drawdown (-8.45%)**
- Largest peak-to-trough decline
- Lower is better (less risk)
- -8.45% is acceptable

**Win Rate (64.29%)**
- Percentage of profitable trades
- **>50%** = Profitable strategy
- 64.29% is strong

**Profit Factor (2.15)**
- Gross profit ÷ Gross loss
- **>1.0** = Profitable, **>2.0** = Strong, **>3.0** = Excellent
- 2.15 is strong

**Expectancy ($18.50)**
- Average profit per trade
- Positive = profitable strategy
- $18.50 per trade is good

### Step 4: View Detailed Trade Log

```bash
stock-analyzer backtest trades --last 10
```

See individual trade details (entry, exit, P&L).

---

## Parameter Optimization

Strategies have parameters (e.g., RSI oversold level). Let's optimize them to find the best values.

### Grid Search Optimization

Test all combinations of parameters:

```bash
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --from 2023-01-01 \
  --to 2023-12-31 \
  --method grid \
  --metric sharpe
```

**What's happening:**
- Tests multiple RSI thresholds (25, 30, 35 for oversold / 65, 70, 75 for overbought)
- Tests multiple Bollinger Band settings (1.5, 2.0, 2.5 standard deviations)
- Runs backtest for each combination
- Ranks results by Sharpe Ratio
- Takes ~5 minutes for 100 combinations

**Expected output:**
```
🔍 Optimizing Mean Reversion Strategy...

Parameter Space:
  RSI Oversold: [25, 30, 35]
  RSI Overbought: [65, 70, 75]
  BB StdDev: [1.5, 2.0, 2.5]

Total Combinations: 27

Progress: ████████████████████ 100% (27/27)

✅ Optimization Complete!

Top 5 Results (by Sharpe Ratio):
┌─────┬──────────┬──────────────┬────────────┬────────────┬───────────┐
│ Rank│ RSI Low  │ RSI High     │ BB StdDev  │ Sharpe     │ Return    │
├─────┼──────────┼──────────────┼────────────┼────────────┼───────────┤
│ 1   │ 30       │ 70           │ 2.0        │ 1.95       │ +18.23%   │
│ 2   │ 25       │ 70           │ 2.0        │ 1.87       │ +16.45%   │
│ 3   │ 30       │ 65           │ 2.0        │ 1.84       │ +17.12%   │
│ 4   │ 30       │ 70           │ 1.5        │ 1.78       │ +15.89%   │
│ 5   │ 35       │ 70           │ 2.0        │ 1.72       │ +14.56%   │
└─────┴──────────┴──────────────┴────────────┴────────────┴───────────┘

🏆 Best Parameters:
  RSI Oversold: 30
  RSI Overbought: 70
  BB StdDev: 2.0
```

### Walk-Forward Analysis (Prevent Overfitting)

Test on out-of-sample data to validate results:

```bash
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --method walk-forward \
  --train-periods 6 \
  --test-periods 1
```

**What's happening:**
- Splits 2023 into 6-month training periods + 1-month test periods
- Optimizes parameters on training data
- Tests on unseen test data
- Validates that results aren't overfitted

**Expected output:**
```
🔄 Walk-Forward Analysis...

Window 1:
  Train: Jan-Jun 2023
  Test: Jul 2023
  Train Sharpe: 1.95
  Test Sharpe: 1.72 ✅ (within 20%)

Window 2:
  Train: Feb-Jul 2023
  Test: Aug 2023
  Train Sharpe: 1.88
  Test Sharpe: 1.65 ✅

Window 3:
  Train: Mar-Aug 2023
  Test: Sep 2023
  Train Sharpe: 1.92
  Test Sharpe: 1.78 ✅

Average In-Sample Sharpe: 1.92
Average Out-of-Sample Sharpe: 1.72
Degradation: 10.4% ✅ (Good - strategy not overfitted)
```

**Interpretation**:
- **Degradation <20%**: Good (strategy generalizes well)
- **Degradation 20-30%**: Warning (possible overfitting)
- **Degradation >30%**: Bad (strategy is overfitted)

---

## Paper Trading

Practice trading with virtual money before risking real capital.

### Step 1: Start Paper Trading

```bash
stock-analyzer paper start \
  --strategy mean-reversion \
  --capital 10000 \
  --symbols AAPL,MSFT,GOOGL
```

**What's happening:**
- Initializes virtual portfolio with $10,000
- Monitors AAPL, MSFT, GOOGL every minute
- Applies mean reversion strategy in real-time
- Executes virtual trades with realistic slippage
- Tracks performance continuously

**Expected output:**
```
🚀 Starting Paper Trading...

Configuration:
  Strategy: Mean Reversion
  Initial Capital: $10,000.00
  Symbols: AAPL, MSFT, GOOGL
  Max Positions: 10
  Max Position Size: $2,500 (25%)
  Daily Loss Limit: $500 (5%)

✅ Paper trading started!

Engine Status:
  Running: Yes
  Update Interval: 60 seconds
  Market Hours: 9:30 AM - 4:00 PM ET
  Web Dashboard: http://localhost:3000

Commands:
  Status:      stock-analyzer paper status
  Portfolio:   stock-analyzer paper portfolio
  Performance: stock-analyzer paper performance
  Stop:        stock-analyzer paper stop
```

### Step 2: Monitor Status

```bash
stock-analyzer paper status
```

**Expected output:**
```
📊 Paper Trading Status

Engine:
  Running: Yes
  Started: 11/8/2025, 9:30:00 AM
  Uptime: 2h 15m
  Last Update: 11:45:23 AM

Portfolio:
  Total Value: $10,453.21
  Cash: $4,231.50
  Positions Value: $6,221.71

Performance:
  Daily P&L: +$123.45 (+1.23%)
  Total P&L: +$453.21 (+4.53%)

Activity:
  Total Orders: 47
  Filled Orders: 42 (89.4%)
  Cancelled Orders: 5 (10.6%)
  Active Positions: 3
  Open Orders: 1
```

### Step 3: View Portfolio

```bash
stock-analyzer paper portfolio
```

**Expected output:**
```
💼 Portfolio Overview

Total Value: $10,453.21
Cash: $4,231.50
Positions Value: $6,221.71
Total P&L: +$453.21 (+4.53%)

Win Rate: 62.50%
Total Trades: 16
Max Drawdown: -3.21%

═══════════════════════════════════════════════════════════
                    OPEN POSITIONS
═══════════════════════════════════════════════════════════

AAPL:
  Side: LONG
  Quantity: 15
  Entry Price: $152.30
  Entry Time: 11/8/2025, 9:45:00 AM
  Current Price: $155.40
  Current Value: $2,331.00
  Unrealized P&L: +$46.50 (+3.05%)
  Duration: 2h 0m

MSFT:
  Side: LONG
  Quantity: 10
  Entry Price: $372.10
  Entry Time: 11/8/2025, 10:15:00 AM
  Current Price: $378.20
  Current Value: $3,782.00
  Unrealized P&L: +$61.00 (+1.64%)
  Duration: 1h 30m

GOOGL:
  Side: LONG
  Quantity: 5
  Entry Price: $141.40
  Entry Time: 11/8/2025, 11:00:00 AM
  Current Price: $141.76
  Current Value: $708.80
  Unrealized P&L: +$1.80 (+0.25%)
  Duration: 45m
```

### Step 4: View Performance Metrics

```bash
stock-analyzer paper performance
```

**Expected output:**
```
📈 Performance Metrics

Returns:
  Daily Return: +1.18%
  Weekly Return: +3.42%
  Monthly Return: N/A (insufficient data)
  Total Return: +4.53%

Risk Metrics:
  Sharpe Ratio: 1.82
  Sortino Ratio: 2.34
  Max Drawdown: -3.21%
  Current Drawdown: 0.00%

Trade Statistics:
  Total Trades: 16
  Winning Trades: 10
  Losing Trades: 6
  Win Rate: 62.50%
  Profit Factor: 2.15
  Expectancy: $28.33

Win/Loss Analysis:
  Average Win: $72.45
  Average Loss: -$41.20
  Largest Win: $145.80
  Largest Loss: -$87.30
  Win/Loss Ratio: 1.76

Costs:
  Total Commissions: $0.00
  Total Slippage: $23.45

Holding Times:
  Average: 4.2 hours
  Median: 3.8 hours
```

### Step 5: Stop Paper Trading

```bash
stock-analyzer paper stop
```

**Expected output:**
```
🛑 Stopping paper trading...

Final Portfolio Summary:
  Total Value: $10,453.21
  Total P&L: +$453.21 (+4.53%)
  Win Rate: 62.50%
  Total Trades: 16

✅ Paper trading stopped
✅ All data saved
✅ Positions remain open (will auto-close on next start)

To resume: stock-analyzer paper start
To reset: stock-analyzer paper reset (WARNING: deletes all data)
```

---

## Risk Analysis

Understand and manage portfolio risk.

### Calculate Value at Risk (VaR)

VaR answers: "What's the maximum loss I could expect with 95% confidence?"

```bash
stock-analyzer risk var --confidence 95
```

**Expected output:**
```
📊 Value at Risk (VaR) Analysis

Method: Historical Simulation
Confidence Level: 95%
Time Horizon: 1 day
Portfolio Value: $10,453.21

VaR (95%): -$312.45 (-2.99%)

Interpretation:
  With 95% confidence, your portfolio will not lose more than
  $312.45 in a single day.

  There is a 5% chance of losing more than this amount.

Historical Distribution:
  1st Percentile: -5.23%
  5th Percentile: -2.99% ← VaR (95%)
  25th Percentile: -0.85%
  Median: +0.12%
  75th Percentile: +1.02%
  95th Percentile: +2.45%
  99th Percentile: +4.12%
```

### Calculate CVaR (Expected Shortfall)

CVaR answers: "If the worst 5% happens, how bad will it be on average?"

```bash
stock-analyzer risk cvar --confidence 95
```

**Expected output:**
```
📊 Conditional Value at Risk (CVaR)

Method: Historical Simulation
Confidence Level: 95%
Portfolio Value: $10,453.21

CVaR (95%): -$425.67 (-4.07%)

Interpretation:
  If your portfolio experiences a loss in the worst 5% of days,
  the average loss will be $425.67 (4.07%).

  CVaR is always worse than VaR because it's the average of the
  worst outcomes, not just the threshold.

VaR vs CVaR:
  VaR (95%): -$312.45 (-2.99%)
  CVaR (95%): -$425.67 (-4.07%)
  Difference: -$113.22 (36.2% worse)
```

### Run Monte Carlo Simulation

Simulate 10,000 possible portfolio outcomes:

```bash
stock-analyzer risk monte-carlo --scenarios 10000
```

**Expected output:**
```
🎲 Monte Carlo Simulation

Scenarios: 10,000
Time Horizon: 252 trading days (1 year)
Initial Portfolio: $10,453.21

Running simulation... ████████████████████ 100%

Results:

Final Portfolio Value Distribution:
  5th Percentile: $8,234.12 (-21.2%)
  25th Percentile: $9,856.78 (-5.7%)
  Median: $11,523.45 (+10.2%)
  75th Percentile: $13,245.67 (+26.7%)
  95th Percentile: $15,678.90 (+50.0%)

Probability of Profit: 72.3%
Probability of Loss: 27.7%

Maximum Drawdown Distribution:
  Median: -12.3%
  95th Percentile: -28.4%

Interpretation:
  - 72.3% chance of profit after 1 year
  - Median expected return: +10.2%
  - Worst case (5th percentile): -21.2% loss
  - Best case (95th percentile): +50.0% gain
```

### Stress Test Portfolio

Test against historical crisis scenarios:

```bash
stock-analyzer risk stress-test --scenario 2008-financial-crisis
```

**Expected output:**
```
⚠️  Stress Test: 2008 Financial Crisis

Scenario Details:
  Period: Sep 2008 - Mar 2009
  S&P 500 Decline: -56.8%
  Volatility: Extremely High

Applying market shocks to your portfolio...

Results:

Portfolio Impact:
  Initial Value: $10,453.21
  Stressed Value: $6,234.12
  Loss: -$4,219.09 (-40.4%)

Individual Positions:
  AAPL: -45.2%
  MSFT: -38.7%
  GOOGL: -36.9%

Risk Metrics Under Stress:
  Max Drawdown: -45.2%
  VaR (95%): -8.7% (vs -2.99% normal)
  Correlation: +0.92 (high - diversification fails)

Interpretation:
  Your portfolio would lose approximately 40% in a 2008-style
  crisis. Consider:
  - Adding defensive assets (bonds, gold)
  - Reducing position sizes
  - Implementing stop-losses
```

### Calculate Kelly Criterion Position Size

Optimal position sizing based on win rate:

```bash
stock-analyzer risk kelly --win-rate 65 --avg-win 100 --avg-loss 50
```

**Expected output:**
```
📐 Kelly Criterion Position Sizing

Inputs:
  Win Rate: 65%
  Average Win: $100
  Average Loss: $50

Kelly Percentage: 30.0%

Interpretation:
  The Kelly Criterion suggests risking 30% of your portfolio
  per trade for optimal growth.

  However, this is aggressive!

Recommended Adjustments:
  Full Kelly (30%): Very aggressive, high volatility
  Half Kelly (15%): Moderate risk, recommended
  Quarter Kelly (7.5%): Conservative, lower growth

Current Settings:
  Your max position size: 25%
  Recommendation: Reduce to 15% for Half Kelly
```

---

## Next Steps

### 1. Explore More Strategies

```bash
# Try momentum strategy
stock-analyzer backtest run --strategy momentum --symbol AAPL

# Compare strategies
stock-analyzer backtest compare mean-reversion momentum --symbol AAPL
```

### 2. Scan Multiple Stocks

```bash
# Scan watchlist for opportunities
stock-analyzer scan --watchlist AAPL,MSFT,GOOGL,AMZN,TSLA

# Show top 5 opportunities
stock-analyzer scan --top 5
```

### 3. Customize Strategies

Create your own strategy by editing:
- `/home/kopacz/stock-sense-ai/src/strategies/custom-strategy.ts`

See [Strategy Development Guide](STRATEGY_DEVELOPMENT.md) (coming soon).

### 4. Access Web Dashboard

```bash
stock-analyzer dashboard
```

View charts, performance, and trades in your browser at `http://localhost:3000`.

### 5. Set Up Alerts

Configure Telegram or email alerts for trade signals:

```bash
# Already configured during setup
# Test notifications:
stock-analyzer test-notifications
```

### 6. Learn Advanced Features

- **[Parameter Optimization Guide](OPTIMIZATION_GUIDE.md)** - Deep dive into optimization
- **[Risk Management Guide](../RISK_MANAGEMENT_DESIGN.md)** - Institutional risk techniques
- **[Strategy Development](STRATEGY_DEVELOPMENT.md)** - Create custom strategies
- **[CLI Reference](CLI_REFERENCE.md)** - All 30+ commands

---

## Troubleshooting

### Issue: "API key not configured"

**Solution:**
```bash
# Re-run setup
stock-analyzer setup

# Verify keys
stock-analyzer health
```

### Issue: "Rate limit exceeded"

**Solution:**
- Wait 1 minute (Alpha Vantage: 5 calls/min limit)
- Use cached data: `stock-analyzer backtest data list`
- Switch to Finnhub: `stock-analyzer backtest data download AAPL --provider finnhub`

### Issue: "No data found for symbol"

**Solution:**
```bash
# Download data first
stock-analyzer backtest data download AAPL --from 2023-01-01 --to 2023-12-31

# Verify data exists
stock-analyzer backtest data list
```

### Issue: "Insufficient historical data"

**Solution:**
- Download more data (need at least 60 days)
- Use a larger date range: `--from 2022-01-01 --to 2023-12-31`

### Issue: "Build failed" or "TypeScript errors"

**Solution:**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build

# If still failing, check Node.js version
node --version  # Should be 18+
```

### Issue: "Permission denied" (Linux/macOS)

**Solution:**
```bash
# Make CLI executable
chmod +x dist/index.js

# OR run with node
node dist/index.js [command]
```

### More Help

- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Comprehensive troubleshooting
- **[FAQ](FAQ.md)** - Frequently asked questions
- **[GitHub Issues](https://github.com/[your-username]/stock-sense-ai/issues)** - Report bugs

---

## Summary

Congratulations! You've completed the getting started guide. You now know how to:

- ✅ Install and set up Stock Sense AI
- ✅ Download historical stock data
- ✅ Run backtests and interpret results
- ✅ Optimize strategy parameters
- ✅ Paper trade with virtual money
- ✅ Analyze portfolio risk
- ✅ Troubleshoot common issues

**Next Steps:**
1. Run more backtests on different stocks
2. Try different strategies (momentum, custom)
3. Optimize parameters for your favorite stocks
4. Start paper trading to test in real-time
5. Monitor risk with VaR and stress tests

**Happy Trading!** 📈

---

**Estimated Time to Complete**: 15-30 minutes

**Difficulty**: Beginner

**Last Updated**: November 8, 2025
