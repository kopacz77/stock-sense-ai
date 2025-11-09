# Risk Management CLI Reference
## Quick Command Guide for Stock Sense AI

This document provides quick reference for all risk management CLI commands and their outputs.

---

## Core Risk Analysis Commands

### `stock-analyzer risk analyze`
**Purpose:** Comprehensive portfolio risk analysis

**Output:**
```
Portfolio Risk Analysis
=======================

Portfolio Overview:
  Total Value: $105,420.50
  Positions: 8
  Day Change: +$1,245.30 (+1.19%)

Risk Metrics:
  Total Risk: $4,215.20 (4.0% of portfolio) ✓
  1-Day VaR (95%): $2,108.40 (2.0%)
  1-Day VaR (99%): $3,162.60 (3.0%)
  CVaR (95%): $2,845.32 (2.7%)
  Max Drawdown: -$8,234.12 (-7.6%)
  Current Drawdown: -$1,234.00 (-1.2%)

Performance Metrics:
  Sharpe Ratio: 2.34 (Very Good)
  Sortino Ratio: 3.12 (Excellent)
  Calmar Ratio: 1.89 (Good)

Sector Exposure:
  TECHNOLOGY: 28.5% ✓
  HEALTHCARE: 22.0% ✓
  FINANCE: 18.5% ✓
  ENERGY: 15.0% ✓
  CONSUMER: 16.0% ✓

Correlation Analysis:
  Average Correlation: 0.42 (Moderate diversification)
  Diversification Ratio: 1.68 (Good)
  Highly Correlated Pairs:
    • AAPL ↔ MSFT: 0.78
    • JPM ↔ BAC: 0.82

Alerts: None ✓
Status: All risk limits within acceptable ranges
```

---

### `stock-analyzer risk var`
**Purpose:** Detailed Value at Risk calculations

**Options:**
- `--confidence <level>` - Confidence level (90, 95, 99)
- `--method <type>` - Calculation method (historical, parametric, monte-carlo)
- `--horizon <days>` - Time horizon (1, 10, 30 days)

**Output:**
```
Value at Risk (VaR) Analysis
=============================

Method: Historical Simulation
Confidence Level: 95%
Time Horizon: 1 Day
Portfolio Value: $105,420.50

VaR Estimates:
  1-Day VaR (95%): $2,108.40
  1-Day VaR (99%): $3,162.60
  10-Day VaR (95%): $6,664.23
  10-Day VaR (99%): $9,996.35

Interpretation:
  There is a 95% confidence that daily losses will not exceed $2,108.40

Historical Validation:
  VaR Breaches (last 90 days): 4 (4.4%)
  Expected Breaches: 4.5 (5.0%)
  Model Accuracy: Good ✓

Recommendations:
  ✓ VaR levels are reasonable
  ✓ Model is well-calibrated
  💡 Consider hedging if VaR exceeds 5% of portfolio
```

---

### `stock-analyzer risk cvar`
**Purpose:** Expected Shortfall / Conditional VaR

**Output:**
```
Conditional VaR (CVaR) Analysis
================================

Portfolio Value: $105,420.50

CVaR Estimates:
  CVaR (95%): $2,845.32
  CVaR (99%): $4,268.00

Tail Risk Analysis:
  Tail Risk Ratio (CVaR/VaR): 1.35
  Interpretation: Normal tail risk

Expected Shortfall:
  If VaR is breached, expected loss: $2,845.32
  This represents 2.7% of portfolio value

Distribution Analysis:
  Return Distribution: Approximately Normal
  Fat Tails: No (ratio < 1.5)
  Extreme Events: Low probability

Recommendations:
  ✓ Tail risk is manageable
  💡 Monitor for changes in market volatility
```

---

### `stock-analyzer risk correlation`
**Purpose:** Correlation matrix and diversification analysis

**Options:**
- `--lookback <days>` - Lookback period (30, 60, 90, 252)
- `--threshold <value>` - Correlation threshold for highlighting (0.5-1.0)

**Output:**
```
Correlation Matrix Analysis
============================

Lookback Period: 90 days
Data Points: 90

Correlation Matrix:
         AAPL   MSFT   GOOGL  JPM    BAC    JNJ    PFE    XOM
AAPL     1.00   0.78   0.72   0.35   0.32   0.28   0.25   0.18
MSFT     0.78   1.00   0.75   0.38   0.35   0.30   0.28   0.20
GOOGL    0.72   0.75   1.00   0.40   0.38   0.32   0.30   0.22
JPM      0.35   0.38   0.40   1.00   0.82   0.45   0.42   0.55
BAC      0.32   0.35   0.38   0.82   1.00   0.42   0.40   0.52
JNJ      0.28   0.30   0.32   0.45   0.42   1.00   0.68   0.38
PFE      0.25   0.28   0.30   0.42   0.40   0.68   1.00   0.35
XOM      0.18   0.20   0.22   0.55   0.52   0.38   0.35   1.00

Average Correlation: 0.42
Diversification Ratio: 1.68

Highly Correlated Pairs (r > 0.7):
  1. JPM ↔ BAC: 0.82 (Both FINANCE sector)
  2. AAPL ↔ MSFT: 0.78 (Both TECH sector)
  3. MSFT ↔ GOOGL: 0.75 (Both TECH sector)
  4. AAPL ↔ GOOGL: 0.72 (Both TECH sector)

Cluster Analysis:
  Cluster 1 (TECH): AAPL, MSFT, GOOGL
    - Avg Internal Correlation: 0.75
    - Portfolio Weight: 48.5%
    - Risk Contribution: 52.3%

  Cluster 2 (FINANCE): JPM, BAC
    - Avg Internal Correlation: 0.82
    - Portfolio Weight: 18.5%
    - Risk Contribution: 21.2%

Recommendations:
  ⚠ High correlation in TECH cluster (0.75)
  ⚠ High correlation between JPM-BAC (0.82)
  💡 Consider adding uncorrelated assets
  💡 Target correlation < 0.5 for better diversification
```

---

### `stock-analyzer risk stress`
**Purpose:** Stress testing under extreme scenarios

**Options:**
- `--scenario <name>` - Predefined scenario (2008-crisis, covid-crash, black-monday, moderate)
- `--custom` - Define custom stress parameters

**Output:**
```
Stress Test Results
===================

Portfolio Value: $105,420.50

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 1: 2008 Financial Crisis
Scenario: -38% market crash, 3x volatility

Portfolio Impact:
  Initial Value: $105,420.50
  Stressed Value: $72,941.00
  Loss: -$32,479.50 (-30.8%)
  Survivable: Yes ✓

Position Impacts:
  JPM:    -$5,234.00 (-55%) ⚠ High impact
  BAC:    -$4,123.00 (-48%) ⚠ High impact
  XOM:    -$3,456.00 (-42%)
  AAPL:   -$2,890.00 (-30%)
  MSFT:   -$2,456.00 (-28%)
  GOOGL:  -$2,234.00 (-27%)
  JNJ:    -$1,890.00 (-22%) ✓ Defensive
  PFE:    -$1,678.00 (-20%) ✓ Defensive

Stressed Risk Metrics:
  Stressed VaR (95%): $4,892.00 (+132%)
  Stressed CVaR (95%): $6,234.00 (+119%)
  Stressed Sharpe: -0.45 (Poor)

Recommendations:
  ⚠ FINANCE sector highly vulnerable (-51% avg)
  ⚠ Consider reducing JPM and BAC positions
  ✓ Healthcare positions provided cushion
  💡 Add more defensive positions
  💡 Consider cash allocation for crisis scenarios

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 2: COVID-19 Crash (March 2020)
Scenario: -34% market, 2.5x volatility

Portfolio Impact:
  Initial Value: $105,420.50
  Stressed Value: $77,359.00
  Loss: -$28,061.50 (-26.6%)
  Survivable: Yes ✓

[Similar detailed output...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 3: Moderate Correction
Scenario: -10% market, 1.5x volatility

Portfolio Impact:
  Initial Value: $105,420.50
  Stressed Value: $95,234.00
  Loss: -$10,186.50 (-9.7%)
  Survivable: Yes ✓

Overall Assessment:
  ✓ Portfolio withstands moderate corrections well
  ⚠ Vulnerable to major financial crises (-31%)
  ⚠ High correlation increases systemic risk
  💡 Consider tail risk hedging
  💡 Increase cash buffer to 10-15%
```

---

### `stock-analyzer risk monte-carlo`
**Purpose:** Monte Carlo simulation for future scenarios

**Options:**
- `--simulations <n>` - Number of simulations (1000-50000)
- `--horizon <days>` - Time horizon (10, 30, 90, 252)
- `--confidence <level>` - Confidence level (90, 95, 99)

**Output:**
```
Monte Carlo Simulation Results
===============================

Configuration:
  Simulations: 10,000
  Time Horizon: 30 days
  Confidence Level: 95%
  Method: Correlated returns (Cholesky decomposition)

Current Portfolio Value: $105,420.50

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Projected Returns (30 days):
  Expected Return: +$2,450.30 (+2.3%)
  Median Return: +$2,123.00 (+2.0%)

Confidence Intervals:
  Best Case (95th): +$8,456.00 (+8.0%)
  Likely Range (90th): +$5,234.00 (+5.0%)
  Median (50th): +$2,123.00 (+2.0%)
  Likely Range (10th): -$2,456.00 (-2.3%)
  Worst Case (5th): -$6,234.00 (-5.9%)

Risk Metrics:
  Probability of Profit: 68.4%
  Probability of Loss: 31.6%
  Probability of Loss > 5%: 12.3%
  Probability of Loss > 10%: 4.2%
  Probability of Loss > 20%: 0.8%

Drawdown Analysis:
  Expected Max Drawdown: -$8,234.00 (-7.8%)
  95th Percentile Drawdown: -$12,345.00 (-11.7%)

Distribution Analysis:
  [-10% to -5%]: ▓▓░░░░░░░░ 8.2% (823 scenarios)
  [ -5% to  0%]: ▓▓▓▓▓░░░░░ 23.4% (2,342 scenarios)
  [  0% to +5%]: ▓▓▓▓▓▓▓▓░░ 36.8% (3,684 scenarios)
  [ +5% to +10%]: ▓▓▓▓▓░░░░░ 24.3% (2,431 scenarios)
  [+10% to +15%]: ▓▓░░░░░░░░ 6.1% (614 scenarios)
  [+15% to +20%]: ▓░░░░░░░░░ 1.2% (106 scenarios)

Interpretation:
  ✓ Positive expected return (2.3%)
  ✓ Good probability of profit (68%)
  ⚠ Maximum drawdown could reach -11.7%
  💡 Consider reducing position sizes if drawdown risk concerns you

Recommendations:
  • Expected return is reasonable for risk taken
  • Low probability of severe loss (<5% chance of -10%+)
  • Portfolio is positioned for moderate growth
  • Monitor for changes in volatility
```

---

## Risk-Adjusted Performance Commands

### `stock-analyzer performance sharpe`
**Purpose:** Sharpe ratio calculation

**Output:**
```
Sharpe Ratio Analysis
=====================

Time Period: 90 days

Returns:
  Annualized Return: 18.5%
  Annualized Volatility: 22.3%

Risk-Free Rate: 4.0% (US T-Bill)

Sharpe Ratio: 2.34

Rating: Very Good ⭐⭐⭐⭐

Interpretation:
  • For every unit of risk, portfolio returns 2.34 units of excess return
  • This is better than most actively managed funds (typical: 0.5-1.5)
  • Strategy is efficiently compensating for risk taken

Benchmark Comparison:
  S&P 500 Sharpe: 1.45
  Your Sharpe: 2.34 (+61% better)

Recommendations:
  ✓ Excellent risk-adjusted returns
  ✓ Continue current strategy
  💡 Monitor for regime changes in market volatility
```

---

### `stock-analyzer performance sortino`
**Purpose:** Sortino ratio (downside risk only)

**Output:**
```
Sortino Ratio Analysis
======================

Time Period: 90 days

Returns:
  Annualized Return: 18.5%
  Downside Deviation: 15.2% (vs 22.3% total volatility)

Target Return: 0% (MAR)
Risk-Free Rate: 4.0%

Sortino Ratio: 3.12

Rating: Excellent ⭐⭐⭐⭐⭐

Interpretation:
  • Portfolio has limited downside volatility
  • Most volatility comes from upside moves (good!)
  • Downside risk is 68% of total volatility

Comparison to Sharpe:
  Sharpe Ratio: 2.34
  Sortino Ratio: 3.12 (+33% higher)
  Implication: Returns are positively skewed

Recommendations:
  ✓ Exceptional downside risk management
  ✓ Strategy protects well against losses
  ✓ Asymmetric return profile (preferred)
```

---

### `stock-analyzer performance calmar`
**Purpose:** Calmar ratio (return / max drawdown)

**Output:**
```
Calmar Ratio Analysis
=====================

Time Period: 12 months

Annualized Return: 18.5%
Maximum Drawdown: -9.8%

Calmar Ratio: 1.89

Rating: Good ⭐⭐⭐⭐

Interpretation:
  • For every 1% of maximum drawdown, portfolio returned 1.89%
  • Drawdown recovery typical: 45 days
  • Current drawdown: -1.2% (well within limits)

Drawdown History:
  Largest Drawdown: -9.8% (Oct 15 - Nov 3, 2024)
    - Duration: 19 days
    - Recovery: 26 days
    - Current Status: Fully recovered

  Current Drawdown: -1.2% (started Nov 5)
    - Duration: 3 days
    - Severity: Minor

Benchmark Comparison:
  S&P 500 Calmar: 1.23
  Your Calmar: 1.89 (+54% better)

Recommendations:
  ✓ Good risk-adjusted returns
  ✓ Drawdowns are controlled and recoverable
  💡 Target Calmar > 2.0 for "Excellent" rating
```

---

## Pre-Trade Validation Commands

### `stock-analyzer risk check <SYMBOL>`
**Purpose:** Pre-trade risk check before opening position

**Options:**
- `--size <shares>` - Position size in shares
- `--price <price>` - Entry price
- `--signal <type>` - Signal type (BUY/SELL)

**Output:**
```
Pre-Trade Risk Check: NVDA
===========================

Proposed Trade:
  Symbol: NVDA
  Action: BUY
  Shares: 100
  Entry Price: $485.50
  Position Value: $48,550.00 (45.8% of portfolio)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BLOCKERS (Trade Rejected):
  ❌ Position size 45.8% exceeds limit of 25%
  ❌ TECH sector exposure would reach 73.3% (limit: 30%)
  ❌ Would create 4 highly correlated positions (limit: 3)

WARNINGS:
  ⚠ Total portfolio risk would increase to 7.2% (approaching 10% limit)
  ⚠ High correlation with AAPL (0.81), MSFT (0.79), GOOGL (0.76)
  ⚠ Liquidity: Position is 8.5% of daily volume

Risk Impact Analysis:
  Current Portfolio Risk: $5,234.00 (5.0%)
  New Portfolio Risk: $7,623.00 (7.2%)
  Risk Increase: +$2,389.00 (+2.2%)
  Risk Limit: $10,542.00 (10.0%)
  Utilization: 72.3% of risk budget

Position Impact:
  Current Positions: 8
  New Positions: 9
  Position Limit: 15 ✓

Concentration Impact:
  Current TECH Exposure: 48.5%
  New TECH Exposure: 73.3% ❌
  Sector Limit: 30.0%
  Breach Amount: +43.3%

Correlation Impact:
  Current Avg Correlation: 0.42
  New Avg Correlation: 0.58
  Correlated Positions: 4 (AAPL, MSFT, GOOGL + NVDA)
  Correlation Limit: 3 ❌

Liquidity Check:
  Average Daily Volume: 1,176,470 shares
  Proposed Shares: 100 shares
  Volume Ratio: 0.085% ✓
  Liquidity Rating: HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDATION: ❌ REJECT

Reasons:
  1. Position size far exceeds 25% limit
  2. Would create severe TECH sector concentration
  3. Too many highly correlated positions

Suggested Alternatives:
  💡 Reduce position size to 50 shares ($24,275)
  💡 Close one existing TECH position first
  💡 Wait for TECH sector exposure to decrease
  💡 Consider uncorrelated sectors (HEALTHCARE, CONSUMER)

Trade Status: BLOCKED
```

---

### `stock-analyzer risk limits show`
**Purpose:** Display current risk limits and utilization

**Output:**
```
Risk Limits Configuration
=========================

Position Sizing Limits:
  Max Risk Per Trade: 1.0% of portfolio
    Current: $1,054.21
    Typical Usage: 0.3-0.8%

  Max Position Size: 25.0% of portfolio
    Current: $26,355.13
    Largest Position: 22.3% (MSFT) ✓

  Max Total Portfolio Risk: 10.0%
    Current: $10,542.05
    Actual Risk: $5,234.00 (49.6% utilized) ✓

Diversification Limits:
  Max Sector Exposure: 30.0%
    Current Max: 28.5% (TECH) ✓
    Status: Within limits

  Max Correlated Positions: 3
    Current: 3 (AAPL, MSFT, GOOGL) ⚠
    Status: At limit - no more TECH positions

Liquidity Requirements:
  Max Volume Impact: 10.0% of daily volume
    Current Avg: 2.3% ✓
    Status: Good liquidity

Drawdown Limits:
  Emergency Stop: -20.0%
    Current Drawdown: -1.2% ✓
    Distance to Stop: 18.8%

  Position Size Reduction: -15.0%
    Current Drawdown: -1.2% ✓
    Status: Normal position sizing

Daily Loss Limits:
  Daily Loss Halt: -3.0%
    Today's P&L: +1.2% ✓
    Status: Normal trading

Overall Status: ✓ All limits within acceptable ranges

Utilization Summary:
  Risk Budget: 49.6% used (49.6% available)
  TECH Sector: 95.0% used (5.0% available)
  Position Slots: 53.3% used (46.7% available)

Recommendations:
  ⚠ TECH sector nearly full - avoid new TECH positions
  ✓ Risk budget healthy - room for new positions
  💡 Consider diversifying into HEALTHCARE or CONSUMER sectors
```

---

## Risk Reporting Commands

### `stock-analyzer risk report daily`
**Purpose:** Daily risk report

**Options:**
- `--email` - Send via email
- `--telegram` - Send via Telegram
- `--export <format>` - Export to file (json, csv, pdf)

**Output:**
```
Daily Risk Report
=================
Date: November 8, 2025

PORTFOLIO OVERVIEW
------------------
Total Value: $105,420.50
Day Change: +$1,245.30 (+1.19%)
Positions: 8
Cash: $38,234.50 (36.3%)

RISK METRICS
------------
Total Risk: $5,234.00 (5.0% of portfolio) ✓
1-Day VaR (95%): $2,108.40 (2.0%)
CVaR (95%): $2,845.32 (2.7%)
Max Drawdown (All-Time): -$8,234.12 (-7.6%)
Current Drawdown: -$1,234.00 (-1.2%)

PERFORMANCE METRICS
-------------------
Sharpe Ratio: 2.34 (Very Good)
Sortino Ratio: 3.12 (Excellent)
Calmar Ratio: 1.89 (Good)
Win Rate: 62.5% (10 wins / 6 losses)

SECTOR EXPOSURE
---------------
TECHNOLOGY:    28.5% ████████████████████████████░░ ✓
HEALTHCARE:    22.0% ██████████████████████░░░░░░░░ ✓
FINANCE:       18.5% ██████████████████░░░░░░░░░░░░ ✓
ENERGY:        15.0% ███████████████░░░░░░░░░░░░░░░ ✓
CONSUMER:      16.0% ████████████████░░░░░░░░░░░░░░ ✓

CORRELATION ANALYSIS
--------------------
Average Correlation: 0.42 (Moderate)
Diversification Ratio: 1.68 (Good)
Highly Correlated: 3 pairs

ALERTS & WARNINGS
-----------------
⚠ TECH sector near limit (28.5% / 30.0%)
⚠ At correlation limit (3 correlated positions)
✓ All other metrics within acceptable ranges

TOP POSITIONS
-------------
1. MSFT: $23,456.00 (22.3%) | P&L: +$1,234 (+5.6%)
2. AAPL: $18,234.00 (17.3%) | P&L: +$892 (+5.1%)
3. JPM:  $12,345.00 (11.7%) | P&L: +$456 (+3.8%)

RECOMMENDATIONS
---------------
💡 TECH sector nearly full - consider other sectors
💡 Strong performance - maintain current strategy
✓ Risk levels optimal - no action needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Report generated: Nov 8, 2025 4:30 PM EST
Next report: Nov 9, 2025 4:30 PM EST
```

---

### `stock-analyzer risk report weekly`
**Purpose:** Comprehensive weekly risk report

**Output:**
```
Weekly Risk Report
==================
Week of November 4-8, 2025

WEEKLY SUMMARY
--------------
Starting Value: $103,245.20
Ending Value: $105,420.50
Weekly Return: +$2,175.30 (+2.11%)
Best Day: Nov 6 (+1.8%)
Worst Day: Nov 7 (-0.5%)

PERFORMANCE METRICS
-------------------
Sharpe Ratio: 2.34 (Very Good) ⭐⭐⭐⭐
Sortino Ratio: 3.12 (Excellent) ⭐⭐⭐⭐⭐
Calmar Ratio: 1.89 (Good) ⭐⭐⭐⭐
Information Ratio vs S&P: 1.67 (Excellent)

TRADING ACTIVITY
----------------
Trades Executed: 3
  • 2 BUY orders
  • 1 SELL order
Win Rate: 66.7% (2 wins, 1 loss)
Avg Win: +$567.00
Avg Loss: -$234.00
Profit Factor: 2.42

RISK ANALYSIS
-------------
Average Daily VaR (95%): $2,034.00
VaR Breaches: 1 (20% - within expected)
Max Daily Drawdown: -2.3%
Recovery Time: 1 day

STRESS TEST RESULTS
-------------------
2008 Financial Crisis: -30.8% (Survivable) ⚠
COVID-19 Crash: -26.6% (Survivable) ⚠
Moderate Correction: -9.7% (Survivable) ✓

MONTE CARLO PROJECTION
----------------------
Next Week (7 days):
  Expected Return: +0.8% ($843)
  Probability of Profit: 62%
  Worst Case (5th): -3.2%

Next Month (30 days):
  Expected Return: +2.3% ($2,450)
  Probability of Profit: 68%
  Worst Case (5th): -5.9%

SECTOR PERFORMANCE
------------------
Best Performers:
  1. TECHNOLOGY: +3.2%
  2. HEALTHCARE: +1.8%
  3. CONSUMER: +1.5%

Worst Performers:
  1. ENERGY: -0.8%
  2. FINANCE: +0.3%

ALERTS & ACTIONS
----------------
This Week:
  • 2 high-confidence signals generated
  • 1 stop-loss triggered (minimal loss)
  • 0 risk limit breaches ✓

RECOMMENDATIONS
---------------
✓ Excellent week - all metrics positive
✓ Risk management working well
⚠ Monitor TECH concentration (28.5%)
💡 Consider taking profits on MSFT (+5.6%)
💡 Look for HEALTHCARE opportunities (underweight)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next Actions:
  • Review TECH sector exposure
  • Monitor correlation levels
  • Execute rebalancing if needed

Report generated: Nov 8, 2025 5:00 PM EST
```

---

## Integration with Paper Trading

### `stock-analyzer paper trade <SYMBOL>`
**Purpose:** Execute paper trade with automatic risk checks

**Flow:**
1. Pre-trade risk validation
2. Position sizing with Kelly Criterion
3. Automatic stop-loss calculation
4. Trade execution
5. Post-trade risk update

**Output:**
```
Paper Trade Execution: AAPL
===========================

Step 1: Pre-Trade Risk Check
  ✓ Position size within limits
  ✓ Risk budget available
  ✓ Sector exposure acceptable
  ✓ Correlation levels acceptable
  ✓ Liquidity sufficient

Step 2: Position Sizing (Kelly Criterion)
  Strategy Win Rate: 62%
  Avg Win/Loss: $500 / -$300
  Kelly Recommendation: Half-Kelly
  Position Size: 50 shares

Step 3: Risk Management
  Entry Price: $155.50
  Stop Loss: $148.32 (ATR-based, 2σ)
  Take Profit: $169.86 (2:1 R/R)
  Risk Per Share: $7.18
  Total Risk: $359.00 (0.34% of portfolio)

Step 4: Trade Execution
  Order Type: MARKET
  Shares: 50
  Filled Price: $155.52 (+$0.02 slippage)
  Total Cost: $7,776.00
  Status: FILLED ✓

Step 5: Post-Trade Portfolio Update
  New Portfolio Value: $105,420.50
  New Total Risk: $5,593.00 (5.3%)
  New Position Count: 9
  TECH Sector: 30.2% (⚠ near limit)

Trade Confirmation:
  Trade ID: PT-2025-11-08-001
  Timestamp: 2025-11-08 14:32:15 EST
  Commission: $0.00 (paper trading)

Monitoring:
  ✓ Stop-loss monitoring activated
  ✓ Take-profit target set
  ✓ Risk alerts configured

Next Steps:
  • Monitor position daily
  • Adjust stop-loss as price moves (trailing)
  • Review at weekly rebalance
```

---

## Export & Reporting

### `stock-analyzer risk export --format json`
**Purpose:** Export risk metrics for external analysis

**Output:**
```json
{
  "generatedAt": "2025-11-08T16:30:00Z",
  "portfolioValue": 105420.50,
  "riskMetrics": {
    "totalRisk": 5234.00,
    "riskPercentage": 5.0,
    "var95_1day": 2108.40,
    "var99_1day": 3162.60,
    "cvar95": 2845.32,
    "maxDrawdown": -8234.12,
    "currentDrawdown": -1234.00
  },
  "performance": {
    "sharpeRatio": 2.34,
    "sortinoRatio": 3.12,
    "calmarRatio": 1.89,
    "informationRatio": 1.67
  },
  "sectorExposure": {
    "TECHNOLOGY": 0.285,
    "HEALTHCARE": 0.220,
    "FINANCE": 0.185,
    "ENERGY": 0.150,
    "CONSUMER": 0.160
  },
  "correlation": {
    "avgCorrelation": 0.42,
    "diversificationRatio": 1.68,
    "highlyCorrelatedPairs": [
      {"symbol1": "JPM", "symbol2": "BAC", "correlation": 0.82},
      {"symbol1": "AAPL", "symbol2": "MSFT", "correlation": 0.78}
    ]
  },
  "alerts": [
    {
      "severity": "MEDIUM",
      "category": "CONCENTRATION",
      "message": "TECH sector near limit (28.5%)"
    }
  ]
}
```

---

## Quick Reference Table

| Command | Purpose | Time to Run |
|---------|---------|-------------|
| `risk analyze` | Complete risk overview | 5-10s |
| `risk var` | VaR calculations | 3-5s |
| `risk cvar` | Expected shortfall | 3-5s |
| `risk correlation` | Correlation matrix | 5-8s |
| `risk stress` | Stress testing | 10-15s |
| `risk monte-carlo` | MC simulation | 30-60s |
| `performance sharpe` | Sharpe ratio | 2-3s |
| `performance sortino` | Sortino ratio | 2-3s |
| `performance calmar` | Calmar ratio | 3-5s |
| `risk check <SYM>` | Pre-trade validation | 3-5s |
| `risk limits show` | Current limits | 1-2s |
| `risk report daily` | Daily report | 5-10s |
| `risk report weekly` | Weekly report | 10-15s |
| `risk export` | Export data | 2-3s |

---

**Last Updated:** November 8, 2025
**Version:** 2.0
**For:** Stock Sense AI v1.0+
