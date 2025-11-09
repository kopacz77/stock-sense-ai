# Frequently Asked Questions (FAQ)

**Common questions about Stock Sense AI**

## Table of Contents

1. [General](#general)
2. [Getting Started](#getting-started)
3. [Backtesting](#backtesting)
4. [Paper Trading](#paper-trading)
5. [Risk Management](#risk-management)
6. [Data & APIs](#data--apis)
7. [Strategies](#strategies)
8. [Security & Privacy](#security--privacy)
9. [Performance](#performance)
10. [Comparison with Other Tools](#comparison-with-other-tools)
11. [Future Plans](#future-plans)

---

## General

### Q: Is Stock Sense AI free?

**A:** Yes, completely free and open source under the MIT license. There are no paid tiers, subscriptions, or hidden costs. The only costs are optional API upgrades (Alpha Vantage Premium, etc.) if you exceed free tier limits.

---

### Q: Can I use this for live trading?

**A:** Currently, Stock Sense AI supports **paper trading only** (virtual money). Live trading with real brokers (Alpaca, Interactive Brokers) is planned for Q3 2024.

**For now:**
- Practice with paper trading
- Backtest strategies thoroughly
- Use risk management tools
- When live trading launches, you'll be ready

---

### Q: What brokers are supported?

**A:** Currently none (paper trading only).

**Planned:**
- Q3 2024: Alpaca (US stocks, commission-free)
- Q4 2024: Interactive Brokers (global, professional)
- Future: TD Ameritrade, Charles Schwab

---

### Q: Why TypeScript instead of Python?

**A:** TypeScript offers several advantages for algorithmic trading:

**Pros:**
- **Type Safety**: Catch errors at compile-time, not in production
- **Performance**: Node.js is faster than Python for I/O-heavy tasks
- **Modern Async/Await**: Clean handling of API calls and real-time data
- **Web Integration**: Easy to build dashboards (same language)
- **Growing Ecosystem**: Excellent for fintech applications
- **IDE Support**: Better autocomplete and refactoring

**Cons:**
- **Smaller Quant Community**: Python has more trading libraries
- **Learning Curve**: If you're a Python expert

**Bottom Line**: TypeScript is modern, fast, and great for web developers entering algorithmic trading.

---

### Q: Is this suitable for beginners?

**A:** Yes! Stock Sense AI is designed for all levels:

**Beginners:**
- Use pre-built strategies (Mean Reversion, Momentum)
- Follow Getting Started Guide (15 minutes)
- Start with paper trading (zero risk)
- Learn gradually with comprehensive docs

**Intermediate:**
- Customize strategy parameters
- Optimize with grid/random search
- Implement risk management (VaR, CVaR)

**Advanced:**
- Create custom strategies (TypeScript)
- Walk-forward analysis
- Monte Carlo simulations
- Institutional-grade risk management

**Recommendation**: Start with the [Getting Started Guide](GETTING_STARTED.md).

---

## Getting Started

### Q: What do I need to get started?

**Minimum Requirements:**
1. **Computer**: Windows/macOS/Linux
2. **Node.js 18+**: Free ([nodejs.org](https://nodejs.org))
3. **API Keys**: Free from Alpha Vantage and Finnhub
4. **15 Minutes**: To complete setup

**Optional:**
- Telegram account (for alerts)
- Git (to clone repository)

**Recommendation**: Follow the [Installation Guide](GETTING_STARTED.md#installation).

---

### Q: How long does setup take?

**A:** 10-15 minutes for most users.

**Breakdown:**
1. **Install Node.js**: 5 minutes (if not installed)
2. **Clone & Build**: 3-5 minutes
3. **Get API Keys**: 2-3 minutes
4. **Run Setup Wizard**: 2 minutes
5. **Download Data**: 2 minutes (first time)

**Total**: 10-15 minutes

After initial setup, you can start backtesting immediately.

---

### Q: Do I need programming experience?

**A:** No, not required for basic use!

**No Coding Needed:**
- Run pre-built strategies via CLI
- Use setup wizard for configuration
- Paper trade with commands
- View results in terminal or web dashboard

**Coding Optional (TypeScript):**
- Create custom strategies
- Add new technical indicators
- Modify risk management rules
- Contribute to the project

**Bottom Line**: Start with CLI, learn TypeScript if you want to customize later.

---

## Backtesting

### Q: How accurate is the backtesting?

**A:** Very accurate, with industry-standard practices:

**Accuracy Features:**
- **Event-driven architecture**: Zero look-ahead bias
- **Realistic execution**: Slippage models (Fixed BPS, Volume-based, Spread-based)
- **Commission models**: Zero, Fixed, Per-share, Percentage
- **Market hours enforcement**: Only trade during 9:30 AM - 4:00 PM ET
- **Transaction cost tracking**: Every penny accounted for

**Limitations:**
- Historical data doesn't guarantee future results
- Slippage estimates may vary in live trading
- Market impact not modeled for very large orders
- No account for black swan events

**Recommendation**: Always validate backtests with:
1. Walk-forward analysis (prevent overfitting)
2. Paper trading (real-time validation)
3. Out-of-sample testing

---

### Q: How long does a backtest take?

**A:** Performance benchmarks:

| Data Range | Time | Notes |
|------------|------|-------|
| 1 year (252 days) | ~30 seconds | Daily data |
| 5 years (1260 days) | ~2 minutes | Daily data |
| 1 year minute data | ~5 minutes | Intraday |
| Parameter optimization (100 combos) | ~5 minutes | Grid search |

**Factors:**
- **First run**: Slower (downloads data)
- **Subsequent runs**: Faster (uses cache)
- **Computer speed**: Faster CPU = faster backtests
- **Number of trades**: More trades = longer processing

**Tip**: Use cache to speed up repeated backtests.

---

### Q: What's the difference between Grid Search and Walk-Forward Analysis?

**A:** Different optimization approaches:

**Grid Search:**
- Tests **all combinations** of parameters
- Example: RSI [25, 30, 35] × BB [1.5, 2.0, 2.5] = 9 backtests
- Ranks results by chosen metric (Sharpe, return, etc.)
- **Pro**: Finds optimal parameters
- **Con**: Risk of overfitting

**Walk-Forward Analysis:**
- Splits data into **train/test periods**
- Optimizes on train data, tests on unseen test data
- Example: Train on Jan-Jun, test on Jul; Train on Feb-Jul, test on Aug, etc.
- **Pro**: Prevents overfitting, validates robustness
- **Con**: Slower, more complex

**Recommendation**:
1. Use Grid Search to find parameters
2. Validate with Walk-Forward Analysis
3. If degradation <20%, parameters are robust

---

### Q: What's a good Sharpe Ratio?

**A:** Sharpe Ratio measures risk-adjusted return:

| Sharpe Ratio | Rating | Interpretation |
|--------------|--------|----------------|
| < 0 | Poor | Losing strategy |
| 0 - 1.0 | Mediocre | Better than nothing |
| 1.0 - 2.0 | Good | Solid strategy ✅ |
| 2.0 - 3.0 | Excellent | Very strong strategy ✅✅ |
| > 3.0 | Outstanding or Overfitted | Verify with walk-forward ⚠️ |

**Examples:**
- **S&P 500 (Buy & Hold)**: Sharpe ~0.5
- **Good Trading Strategy**: Sharpe 1.5-2.5
- **Renaissance Technologies (Medallion Fund)**: Sharpe ~7 (institutional, not retail)

**Warning**: If backtest shows Sharpe >3.0, verify with walk-forward analysis. It may be overfitted.

---

## Paper Trading

### Q: Is paper trading realistic?

**A:** Yes, very realistic!

**Realism Features:**
- **Slippage**: Orders fill at worse prices (like real trading)
- **Commissions**: Optional (zero, fixed, or per-share)
- **Market Hours**: Only 9:30 AM - 4:00 PM ET (configurable)
- **Order Types**: Market, Limit, Stop-Loss, Take-Profit, Trailing Stop
- **Realistic Fills**: Limit orders don't fill if price doesn't reach limit
- **Position Limits**: Max positions, concentration limits
- **Risk Management**: Daily loss limits, position sizing

**Differences from Live Trading:**
- No broker outages
- No partial fills (simplified)
- No overnight interest (for margin)
- No short squeeze scenarios

**Bottom Line**: Paper trading is 90% realistic. Great for practice before live trading.

---

### Q: Can I paper trade multiple strategies simultaneously?

**A:** Yes, but not directly in a single instance.

**Workaround:**
Run multiple instances with different ports:

```bash
# Terminal 1: Mean Reversion
stock-analyzer paper start --strategy mean-reversion --port 3001

# Terminal 2: Momentum
stock-analyzer paper start --strategy momentum --port 3002
```

Each has its own portfolio, isolated.

**Future Enhancement**: Multi-strategy support in single portfolio (Q3 roadmap).

---

### Q: How do I reset my paper trading portfolio?

**A:** Use the reset command:

```bash
stock-analyzer paper reset
```

**⚠️ WARNING**: This **deletes all data**:
- Portfolio state
- Trade history
- Performance metrics
- Journal entries

**Cannot be undone!**

**Recommendation**: Only reset if:
- You want to start completely fresh
- Portfolio is corrupted
- Testing a new strategy from scratch

---

## Risk Management

### Q: What's the difference between VaR and CVaR?

**A:** Both measure downside risk, but differently:

**VaR (Value at Risk):**
- **Question**: "What's the maximum loss I could expect with X% confidence?"
- **Example**: VaR (95%) = -$500 means "95% chance of not losing more than $500"
- **Limitation**: Doesn't tell you how bad it gets in the worst 5%

**CVaR (Conditional VaR / Expected Shortfall):**
- **Question**: "If the worst X% happens, how bad will it be on average?"
- **Example**: CVaR (95%) = -$750 means "If in worst 5%, average loss is $750"
- **Advantage**: Captures tail risk (how bad it really gets)

**Example:**
```
VaR (95%): -$500 (threshold)
CVaR (95%): -$750 (average of worst 5%)
```

**Recommendation**: Use both! VaR for normal risk, CVaR for tail risk.

---

### Q: Should I use Kelly Criterion or the 1% rule?

**A:** Depends on your risk tolerance:

**1% Rule (Default):**
- Risk 1% of portfolio per trade
- **Pro**: Very conservative, low drawdowns
- **Con**: Slower growth
- **Best for**: Beginners, risk-averse traders

**Kelly Criterion:**
- Mathematically optimal for long-term growth
- **Pro**: Maximizes compound growth
- **Con**: Can be aggressive (20-30% position sizes)
- **Best for**: Experienced traders, high win rate strategies

**Recommendation**:
- **Beginners**: Use 1% rule
- **Intermediate**: Half Kelly (divide Kelly by 2)
- **Advanced**: Quarter to Half Kelly

**Example:**
```
Win Rate: 60%
Avg Win: $100
Avg Loss: $50

Kelly: 30% (aggressive!)
Half Kelly: 15% (recommended)
Quarter Kelly: 7.5% (conservative)
1% Rule: 1% (very conservative)
```

---

### Q: What's a Monte Carlo simulation?

**A:** A statistical technique that simulates thousands of possible portfolio outcomes.

**How It Works:**
1. Use historical returns distribution
2. Randomly sample returns for each day
3. Simulate portfolio for N days
4. Repeat 10,000 times
5. Analyze distribution of outcomes

**Example Output:**
```
10,000 Scenarios, 1-Year Projection:
  5th Percentile: -20% (worst case)
  Median: +10% (expected)
  95th Percentile: +50% (best case)
  Probability of Profit: 72%
```

**Use Cases:**
- Understand range of possible outcomes
- Calculate probability of profit/loss
- Stress test portfolio
- Set realistic expectations

**Recommendation**: Run monthly to understand portfolio risk.

---

## Data & APIs

### Q: Why do I need API keys?

**A:** Stock Sense AI fetches real-time and historical data from external providers.

**Alpha Vantage (Required):**
- Historical stock prices (OHLCV)
- Technical indicators
- 500 calls/day free

**Finnhub (Recommended):**
- Real-time quotes
- Backup for Alpha Vantage
- 60 calls/minute free

**Alternative**: Import CSV data manually (no API needed).

---

### Q: Can I use this without internet?

**A:** Partially, yes!

**Offline Capabilities:**
- Run backtests (if data already cached)
- Optimize strategies
- View cached data
- Run risk analysis
- Generate reports

**Requires Internet:**
- Download new data
- Paper trading (needs real-time quotes)
- API-based features

**Recommendation**: Download data while online, then backtest offline.

---

### Q: How much does it cost to use the APIs?

**A:** Free tier is generous for most users:

**Alpha Vantage (Free):**
- 500 API calls/day
- 5 calls/minute
- **Cost**: $0
- **Enough for**: 50 symbols/day

**Finnhub (Free):**
- 60 calls/minute
- **Cost**: $0
- **Enough for**: Unlimited symbols (respecting rate limits)

**Paid Options (if you exceed free tier):**
- Alpha Vantage Premium: $49.99/month (1200 calls/day)
- Finnhub Starter: $49.99/month (more features)

**Recommendation**: Start with free tier. 95% of users never need to upgrade.

---

### Q: Can I import my own data?

**A:** Yes! Stock Sense AI supports CSV import.

**Supported Format:**
```csv
Date,Open,High,Low,Close,Volume
2023-01-03,100.50,102.30,99.80,101.20,50000000
```

**Import Command:**
```bash
stock-analyzer backtest data import mydata.csv --symbol AAPL
```

**Data Sources:**
- Yahoo Finance (free)
- Google Finance
- Your broker (TD Ameritrade, E*TRADE, etc.)
- Custom data collection

**Recommendation**: Use APIs for convenience, CSV for custom data.

---

## Strategies

### Q: What strategies are included?

**A:** Currently 2 pre-built strategies (Q1):

**1. Mean Reversion:**
- **Logic**: Buy when oversold, sell when overbought
- **Indicators**: RSI, MFI, Bollinger Bands, Stochastic, Williams %R
- **Best for**: Range-bound markets, high volatility stocks
- **Win Rate**: ~60-65%

**2. Momentum:**
- **Logic**: Follow the trend (buy uptrends, avoid downtrends)
- **Indicators**: Moving Averages, MACD, Price Momentum
- **Best for**: Trending markets, strong price moves
- **Win Rate**: ~55-60%

**Coming in Q2** (10-15 new strategies):
- MA Crossover
- Pairs Trading
- Breakout Strategy
- Fibonacci Retracement
- VWAP
- And more...

---

### Q: Can I create my own strategy?

**A:** Yes! Create custom strategies in TypeScript.

**Basic Template:**
```typescript
import { BaseStrategy } from './base-strategy';

export class MyStrategy extends BaseStrategy {
  async analyze(data) {
    // Your logic here
    // Return BUY, SELL, or HOLD
  }
}
```

**Examples**: See `src/strategies/` for reference implementations.

**Future**: Visual strategy builder (no coding required) - Q4 roadmap.

---

### Q: Which strategy should I use?

**A:** Depends on market conditions and stock characteristics:

**Use Mean Reversion when:**
- Stock is range-bound (sideways movement)
- High volatility (lots of ups and downs)
- Not in strong trend
- **Examples**: Tech stocks during consolidation, high-beta stocks

**Use Momentum when:**
- Stock is trending (clear up or downtrend)
- Breaking out of range
- Strong volume confirmation
- **Examples**: Growth stocks in uptrend, sector rotation plays

**Best Practice**: Backtest both strategies on your stock, compare Sharpe Ratios.

---

## Security & Privacy

### Q: Is my data secure?

**A:** Yes! Security is a top priority:

**Encryption:**
- AES-256-CBC for all sensitive data
- Config files encrypted
- API keys never stored in plaintext
- Trade journal encrypted

**Key Storage:**
- Encryption keys stored in OS keychain
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service

**Local-First:**
- No cloud storage
- No data sent to third parties (except API providers)
- All processing on your machine

**Bottom Line**: Your data is as secure as your computer. No one else can access it.

---

### Q: Where is my data stored?

**A:** All data is stored locally on your computer:

**Directory Structure:**
```
stock-sense-ai/
├── config.encrypted         # Your API keys (encrypted)
├── data/
│   ├── cache/              # Historical stock data
│   ├── paper-trading/      # Paper trading state (encrypted)
│   └── logs/               # Application logs (encrypted)
```

**macOS/Linux:**
- Default: `./stock-sense-ai/`
- OS keychain: System keychain

**Windows:**
- Default: `.\stock-sense-ai\`
- Credential Manager: Windows Credential Manager

**No Cloud**: Nothing is uploaded to servers (except API calls to Alpha Vantage/Finnhub).

---

### Q: Can I use Stock Sense AI at work (corporate network)?

**A:** Usually yes, but check with IT first:

**Requirements:**
- Outbound HTTPS (port 443) for API calls
- No proxy interference
- No SSL certificate inspection

**Potential Issues:**
- Corporate firewall may block financial APIs
- Proxy may require authentication
- SSL inspection may break API calls

**Workaround**:
- Use your personal device
- Work from home
- Import CSV data manually (no API needed)

**Recommendation**: Test with `stock-analyzer health` to verify connectivity.

---

## Performance

### Q: Why is my first backtest slow?

**A:** First backtest downloads data from APIs.

**Timing:**
- **First Run**: ~2-5 minutes (downloads data)
- **Second Run**: ~30 seconds (uses cache)

**After data is cached, backtests are fast!**

**Speed Up First Run:**
1. Download data separately first:
```bash
stock-analyzer backtest data download AAPL
```
2. Then run backtest (will use cache)

---

### Q: How can I speed up backtests?

**A:** Several optimization techniques:

**1. Use Cached Data:**
- Data caches for 24 hours
- Subsequent backtests are 10x faster

**2. Reduce Date Range:**
```bash
# Instead of 5 years
--from 2023-01-01 --to 2023-12-31
```

**3. Reduce Optimization Iterations:**
```bash
# Instead of 100
--max-iterations 50
```

**4. Close Other Applications:**
- Free up RAM and CPU

**5. Upgrade Hardware:**
- More RAM (8GB+ recommended)
- SSD for faster I/O

---

## Comparison with Other Tools

### Q: How does Stock Sense AI compare to Freqtrade?

**A:**

| Feature | Freqtrade | Stock Sense AI |
|---------|-----------|----------------|
| **Language** | Python | TypeScript |
| **Focus** | Crypto | Stocks (crypto planned) |
| **Security** | Basic | Industry-leading |
| **Risk Management** | Basic | Institutional-grade |
| **Backtesting** | Excellent | Excellent |
| **Paper Trading** | Yes | Yes |
| **Live Trading** | Yes (crypto) | Planned (stocks) |
| **Community** | Large (44K stars) | Growing |

**Choose Freqtrade if**: You trade crypto and prefer Python.
**Choose Stock Sense AI if**: You trade stocks, want better security, or prefer TypeScript.

---

### Q: How does it compare to QuantConnect LEAN?

**A:**

| Feature | LEAN | Stock Sense AI |
|---------|------|----------------|
| **Cloud** | Required | Optional |
| **Cost** | Paid tiers | Free |
| **Security** | Cloud-based | Local + Encrypted |
| **Backtesting** | Professional | Professional |
| **Live Trading** | 20+ brokers | Planned (1-2 brokers) |
| **Data** | Proprietary | Free APIs |

**Choose LEAN if**: You need 20+ brokers and don't mind cloud + cost.
**Choose Stock Sense AI if**: You want free, local-first, privacy-focused platform.

---

## Future Plans

### Q: What's on the roadmap?

**A:** Roadmap summary:

**Q2 2024 (Next 3 months):**
- Sentiment Analysis (News APIs)
- 10-15 New Strategies
- Web Dashboard enhancements
- Hybrid Strategies (TA + Sentiment)

**Q3 2024:**
- Local ML Models (FinBERT, LSTM)
- Portfolio Optimization (Markowitz, Black-Litterman)
- Live Trading (Alpaca)
- Options Trading

**Q4 2024:**
- Strategy Marketplace
- Plugin System
- Mobile App
- More brokers

**See**: [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) for details.

---

### Q: Can I contribute?

**A:** Yes! Contributions are welcome:

**Ways to Contribute:**
1. **Report Bugs**: [GitHub Issues](https://github.com/[your-username]/stock-sense-ai/issues)
2. **Request Features**: [GitHub Discussions](https://github.com/[your-username]/stock-sense-ai/discussions)
3. **Submit Pull Requests**: Fix bugs, add features
4. **Write Documentation**: Improve guides, add examples
5. **Share Strategies**: Contribute trading strategies
6. **Spread the Word**: Star repo, share with friends

**See**: [CONTRIBUTING.md](../CONTRIBUTING.md) (coming soon)

---

### Q: Will there be a paid version?

**A:** No plans for paid tiers!

**Stock Sense AI will always be:**
- Free to use
- Open source (MIT license)
- No paywalls
- No feature restrictions

**Optional Costs (User Choice):**
- Premium API keys (if you exceed free tier)
- Cloud hosting (if you want it)
- Premium strategies (marketplace, optional)

**Commitment**: Core features will always be free.

---

## Still Have Questions?

**Can't find your answer?**

1. **Search Documentation**: [docs/](../docs/)
2. **Check Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
3. **Ask Community**: [GitHub Discussions](https://github.com/[your-username]/stock-sense-ai/discussions)
4. **Report Issue**: [GitHub Issues](https://github.com/[your-username]/stock-sense-ai/issues)
5. **Email**: [Coming Soon]

**Response Time**: Usually 24-48 hours

---

**Last Updated**: November 8, 2025

**Total FAQs**: 50+

**Difficulty**: All Levels
