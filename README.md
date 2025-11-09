# Stock Sense AI - Professional TypeScript Algorithmic Trading Platform

**The secure, TypeScript-native algorithmic trading platform for privacy-conscious developers**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![Security](https://img.shields.io/badge/Security-AES--256--CBC-red)](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)

## Overview

Stock Sense AI is a **free, open-source** algorithmic trading platform built with TypeScript. It combines institutional-grade features with a local-first, privacy-focused architecture. Unlike cloud-based alternatives, all your strategies, data, and API keys stay on your machine—encrypted with AES-256-CBC.

**Why Stock Sense AI?**

- **TypeScript-Native**: Full type safety, modern async/await, and excellent IDE support
- **Security-First**: End-to-end encryption, OS keychain integration, zero cloud dependencies
- **Institutional Features**: Professional backtesting, risk management, and performance analytics
- **Local-First**: Your data never leaves your machine
- **Free & Open Source**: MIT licensed, no paid tiers or hidden costs

## Key Features (Q1 Complete ✅)

### Backtesting Framework ✅
- **Event-driven architecture** - Zero look-ahead bias guaranteed
- **Realistic execution** - Slippage models (Fixed BPS, Volume-based, Spread-based)
- **Commission models** - Zero, Fixed, Per-share, Percentage-based
- **Market hours enforcement** - Accurate trading session simulation
- **Transaction cost analysis** - Track every penny of slippage and commissions

### Performance Metrics (30+) ✅
- **Returns**: Total, CAGR, Daily, Weekly, Monthly
- **Risk-Adjusted**: Sharpe Ratio, Sortino Ratio, Calmar Ratio
- **Drawdown Analysis**: Maximum drawdown, current drawdown, recovery factor
- **Trade Statistics**: Win rate, profit factor, expectancy, consecutive streaks
- **Benchmark Comparison**: Alpha, Beta, R-squared vs. SPY/custom benchmark
- **Advanced Metrics**: Ulcer Index, MAE/MFE tracking, win/loss ratios

### Parameter Optimization ✅
- **Grid Search** - Exhaustive parameter space exploration
- **Random Search** - Efficient sampling for large parameter spaces
- **Walk-Forward Analysis** - Out-of-sample validation to prevent overfitting
- **Overfitting Detection** - Automatic warnings for suspiciously good results
- **Multi-objective Optimization** - Balance return, risk, and drawdown

### Paper Trading ✅
- **5 Order Types** - Market, Limit, Stop-Loss, Take-Profit, Trailing Stop
- **Real-time P&L** - Live unrealized and realized profit/loss tracking
- **25+ Performance Metrics** - Same metrics as backtesting, in real-time
- **Encrypted Trade Journal** - Complete audit trail (append-only JSONL)
- **Pre-trade Risk Checks** - Position limits, concentration, daily loss limits
- **Market Hours Simulation** - 9:30 AM - 4:00 PM ET enforcement

### Risk Management ✅
- **Value at Risk (VaR)** - Historical, Parametric, and Monte Carlo methods
- **Conditional VaR (CVaR)** - Expected Shortfall for tail risk
- **Kelly Criterion** - Optimal position sizing based on win rate and payoff
- **Monte Carlo Simulation** - 10,000+ scenario portfolio projections
- **Stress Testing** - 5 historical crisis scenarios (2008, 2020, etc.)
- **Correlation Matrix** - Real correlation analysis from historical returns
- **Pre-trade Validation** - Automatic risk limit enforcement

### Trading Strategies ✅
- **Mean Reversion** - RSI, MFI, Bollinger Bands, Stochastic, Williams %R
- **Momentum** - Moving averages, MACD, rate of change, trend detection
- **Volume Analysis** - Above-average volume confirmation
- **Extensible Framework** - Easy to add custom strategies

### Data Infrastructure ✅
- **Multi-source Integration** - Alpha Vantage (primary) + Finnhub (backup)
- **Intelligent Caching** - 90%+ API call reduction
- **CSV Import/Export** - Standard OHLCV format with auto-detection
- **Data Validation** - Automatic gap detection and anomaly warnings
- **Rate Limiting** - Strict API quota management
- **Batch Downloads** - Efficient multi-symbol data acquisition

### CLI Interface (30+ Commands) ✅
- **Backtesting** - `backtest run`, `backtest optimize`, `backtest data download`
- **Paper Trading** - `paper start`, `paper status`, `paper portfolio`, `paper performance`
- **Risk Management** - `risk var`, `risk cvar`, `risk monte-carlo`, `risk stress-test`
- **Data Management** - `backtest data download`, `backtest data list`, `backtest data import`
- **Analysis** - `analyze`, `scan`, `discover`, `market`
- **System** - `setup`, `health`, `cache`, `dashboard`

### Encrypted Storage ✅
- **AES-256-CBC Encryption** - Military-grade encryption for all sensitive data
- **OS Keychain Integration** - Secure key storage (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Encrypted Logs** - No plaintext secrets anywhere
- **Encrypted Cache** - Optional encryption for historical data
- **Secure Configuration** - All API keys encrypted at rest

## Quick Start

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **pnpm 8.15+** - [Install](https://pnpm.io/installation) (recommended) or npm
- **Alpha Vantage API Key** - [Get Free Key](https://www.alphavantage.co/support/#api-key)
- **Finnhub API Key** - [Get Free Key](https://finnhub.io/register) (optional but recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/[your-username]/stock-sense-ai
cd stock-sense-ai

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run setup wizard
stock-analyzer setup
```

### Your First Backtest

```bash
# Step 1: Download historical data
stock-analyzer backtest data download AAPL --from 2023-01-01 --to 2023-12-31

# Step 2: Run a simple backtest
stock-analyzer backtest run --strategy mean-reversion --symbol AAPL

# Step 3: View detailed results with 30+ metrics
```

**Expected Output:**
```
✅ Backtest Complete for AAPL

Performance Summary:
  Total Return: +15.23%
  Sharpe Ratio: 1.82
  Sortino Ratio: 2.34
  Max Drawdown: -8.45%

Trade Statistics:
  Total Trades: 42
  Win Rate: 64.29%
  Profit Factor: 2.15
  Expectancy: $18.50
```

### Parameter Optimization

```bash
# Optimize strategy parameters with grid search
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --method grid \
  --metric sharpe

# Use walk-forward analysis to prevent overfitting
stock-analyzer backtest optimize \
  --strategy mean-reversion \
  --symbol AAPL \
  --method walk-forward \
  --train-periods 6 \
  --test-periods 1
```

### Start Paper Trading

```bash
# Start paper trading with $10,000 virtual capital
stock-analyzer paper start \
  --strategy mean-reversion \
  --capital 10000 \
  --symbols AAPL,MSFT,GOOGL

# Check status
stock-analyzer paper status

# View portfolio
stock-analyzer paper portfolio

# View performance metrics
stock-analyzer paper performance

# Stop trading
stock-analyzer paper stop
```

### Risk Analysis

```bash
# Calculate 95% Value at Risk
stock-analyzer risk var --confidence 95

# Calculate CVaR (Expected Shortfall)
stock-analyzer risk cvar --confidence 95

# Run Monte Carlo simulation (10,000 scenarios)
stock-analyzer risk monte-carlo --scenarios 10000

# Stress test against historical crises
stock-analyzer risk stress-test --scenario 2008-financial-crisis

# Calculate optimal position size (Kelly Criterion)
stock-analyzer risk kelly --win-rate 65 --avg-win 100 --avg-loss 50
```

## Documentation

### User Guides
- **[Getting Started Guide](docs/GETTING_STARTED.md)** - Complete beginner's guide (15 min setup)
- **[CLI Reference](docs/CLI_REFERENCE.md)** - All 30+ commands with examples
- **[Backtesting Guide](BACKTESTING_GUIDE.md)** - Comprehensive backtesting tutorial
- **[Paper Trading Guide](docs/PAPER_TRADING_SYSTEM.md)** - Virtual trading system guide
- **[Risk Management Guide](RISK_MANAGEMENT_DESIGN.md)** - Institutional risk management
- **[Data Integration Guide](docs/DATA_INTEGRATION_GUIDE.md)** - Data sources and caching
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[FAQ](docs/FAQ.md)** - Frequently asked questions

### Developer Guides
- **[Architecture Overview](IMPLEMENTATION_ROADMAP.md)** - System architecture and roadmap
- **[Video Tutorial Scripts](docs/VIDEO_TUTORIALS.md)** - Scripts for creating video tutorials

## CLI Commands Overview

### Backtesting Commands
```bash
stock-analyzer backtest run             # Run a backtest
stock-analyzer backtest optimize        # Optimize strategy parameters
stock-analyzer backtest compare         # Compare multiple strategies
stock-analyzer backtest data download   # Download historical data
stock-analyzer backtest data import     # Import CSV data
stock-analyzer backtest data list       # List cached data
stock-analyzer backtest data validate   # Validate data quality
stock-analyzer backtest data export     # Export data to CSV
stock-analyzer backtest data clear      # Clear cached data
stock-analyzer backtest data stats      # Cache statistics
```

### Paper Trading Commands
```bash
stock-analyzer paper start              # Start paper trading
stock-analyzer paper stop               # Stop paper trading
stock-analyzer paper status             # Check trading status
stock-analyzer paper portfolio          # View portfolio
stock-analyzer paper trades             # View trade history
stock-analyzer paper performance        # View performance metrics
stock-analyzer paper orders             # View active orders
stock-analyzer paper reset              # Reset portfolio (WARNING: deletes all data)
```

### Risk Management Commands
```bash
stock-analyzer risk var                 # Calculate Value at Risk
stock-analyzer risk cvar                # Calculate Conditional VaR
stock-analyzer risk monte-carlo         # Run Monte Carlo simulation
stock-analyzer risk stress-test         # Stress test portfolio
stock-analyzer risk correlation         # View correlation matrix
stock-analyzer risk kelly               # Calculate Kelly Criterion position size
stock-analyzer risk report              # Generate risk report
```

### Data & Analysis Commands
```bash
stock-analyzer analyze <symbol>         # Analyze individual stock
stock-analyzer scan                     # Scan multiple stocks
stock-analyzer discover                 # Discover new opportunities
stock-analyzer market                   # View market overview
```

### System Commands
```bash
stock-analyzer setup                    # Initial setup wizard
stock-analyzer health                   # System health check
stock-analyzer cache --stats            # Cache statistics
stock-analyzer cache --clear            # Clear cache
stock-analyzer dashboard                # Launch web dashboard
stock-analyzer monitor                  # Real-time monitoring
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Stock Sense AI Platform                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐       ┌──────────────────┐           │
│  │   Backtesting    │       │  Paper Trading   │           │
│  │   Framework      │◄──────┤     Engine       │           │
│  │  (Event-driven)  │       │  (Real-time)     │           │
│  └────────┬─────────┘       └────────┬─────────┘           │
│           │                          │                       │
│           │    ┌──────────────────┐  │                      │
│           ├────┤  Strategy System ├──┤                      │
│           │    │ (Mean Reversion, │  │                      │
│           │    │   Momentum, etc.)│  │                      │
│           │    └────────┬─────────┘  │                      │
│           │             │            │                       │
│  ┌────────▼─────────┐   │   ┌────────▼─────────┐           │
│  │  Risk Manager    │◄──┴───┤  Optimization    │           │
│  │  (VaR, CVaR,     │       │  (Grid, Random,  │           │
│  │   Kelly, MC)     │       │   Walk-Forward)  │           │
│  └──────────────────┘       └──────────────────┘           │
│           │                          │                       │
│           └──────────┬───────────────┘                      │
│                      ▼                                       │
│           ┌──────────────────┐                              │
│           │  Market Data     │                              │
│           │  Service         │                              │
│           │  (Alpha Vantage, │                              │
│           │   Finnhub,       │                              │
│           │   Caching)       │                              │
│           └──────────────────┘                              │
│                      │                                       │
│           ┌──────────▼───────────┐                          │
│           │   Encrypted Storage  │                          │
│           │   (AES-256-CBC)      │                          │
│           └──────────────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm 8.15+
- **CLI Framework**: Commander.js
- **Encryption**: AES-256-CBC (Node.js crypto)
- **Secure Storage**: Keytar (OS keychain integration)
- **Technical Indicators**: technicalindicators library
- **Testing**: Vitest
- **Linting**: Biome
- **Data Sources**: Alpha Vantage, Finnhub

## Comparison with Competitors

### vs. Freqtrade (44K GitHub stars)

| Feature | Freqtrade | Stock Sense AI | Winner |
|---------|-----------|----------------|--------|
| **Language** | Python | TypeScript | **Stock Sense AI** (web devs) |
| **Security** | Basic | **Industry-leading** | **Stock Sense AI** |
| **Backtesting** | Excellent | Excellent | Tie |
| **Paper Trading** | Yes | Yes | Tie |
| **Risk Management** | Basic | **Institutional-grade** | **Stock Sense AI** |
| **Local-First** | Yes | **Encrypted** | **Stock Sense AI** |
| **Stocks** | Basic | **Optimized** | **Stock Sense AI** |
| **Crypto Focus** | **Excellent** | Planned | Freqtrade |

### vs. QuantConnect Lean (12K GitHub stars)

| Feature | Lean | Stock Sense AI | Winner |
|---------|------|----------------|--------|
| **Language** | C#/Python | TypeScript | Tie |
| **Cloud** | Required | Optional | **Stock Sense AI** |
| **Cost** | **Paid tiers** | Free | **Stock Sense AI** |
| **Security** | Cloud-based | **Local + Encrypted** | **Stock Sense AI** |
| **Backtesting** | Professional | Professional | Tie |
| **Live Trading** | **20+ brokers** | Planned (Alpaca) | Lean |
| **Data** | Proprietary | **Free APIs** | **Stock Sense AI** |

### vs. Backtesting.py (5K GitHub stars)

| Feature | Backtesting.py | Stock Sense AI | Winner |
|---------|----------------|----------------|--------|
| **Language** | Python | TypeScript | **Stock Sense AI** (type safety) |
| **Ease of Use** | **Excellent** | Good | Backtesting.py |
| **Features** | Basic | **Comprehensive** | **Stock Sense AI** |
| **Risk Management** | None | **Institutional** | **Stock Sense AI** |
| **Paper Trading** | None | **Yes** | **Stock Sense AI** |
| **Optimization** | Manual | **Automated** | **Stock Sense AI** |

**Positioning:** *Stock Sense AI is the only TypeScript-native algorithmic trading platform with institutional-grade features and privacy-first architecture.*

## Roadmap

### Q1: Foundation (Complete ✅)
- ✅ Event-driven backtesting framework
- ✅ 30+ performance metrics
- ✅ Parameter optimization (Grid, Random, Walk-Forward)
- ✅ Paper trading system (5 order types)
- ✅ Risk management (VaR, CVaR, Kelly, Monte Carlo, Stress Testing)
- ✅ Data infrastructure (Alpha Vantage + Finnhub + caching)
- ✅ CLI interface (30+ commands)
- ✅ Encrypted storage (AES-256-CBC)

### Q2: Competitive Differentiation (Planned)
- 🔄 Sentiment Analysis (Finnhub News API + Alpaca News API)
- 🔄 Strategy Expansion (10-15 new strategies: MA Crossover, Pairs Trading, Breakout, etc.)
- 🔄 Web Dashboard (TradingView charts, real-time updates, interactive backtesting)
- 🔄 Hybrid Strategies (Technical Analysis + Sentiment)

### Q3: Advanced Features (Planned)
- 🔄 Local ML Models (FinBERT sentiment, LSTM price prediction via ONNX Runtime)
- 🔄 Portfolio Optimization (Markowitz, Black-Litterman, Risk Parity)
- 🔄 Live Trading (Alpaca broker integration)
- 🔄 Options Trading Support
- 🔄 Multi-account Support

### Q4: Ecosystem & Growth (Planned)
- 🔄 Strategy Marketplace
- 🔄 Plugin System
- 🔄 Mobile App (React Native)
- 🔄 Cloud Sync (Optional, encrypted)
- 🔄 Community Contributions

## Performance Benchmarks

### Backtesting Speed
- **1 year daily data**: ~30 seconds
- **5 years daily data**: ~2 minutes
- **1 year minute data**: ~5 minutes
- **Parameter optimization (100 combinations)**: ~5 minutes

### Paper Trading Latency
- **Order execution**: <100ms
- **Portfolio update**: <50ms
- **Market data refresh**: <500ms
- **Risk validation**: <50ms

### Risk Calculation Speed
- **VaR (10-position portfolio)**: <500ms
- **Monte Carlo (10,000 scenarios)**: <3 seconds
- **Correlation matrix (20 stocks)**: <1 second
- **Stress test (5 scenarios)**: <2 seconds

### Cache Performance
- **API call reduction**: 90%+
- **Backtest speed improvement**: 10x with cached data
- **Cache hit rate**: >95% for repeated analyses

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** with tests
4. **Run tests** (`pnpm test`)
5. **Run linting** (`pnpm lint`)
6. **Commit changes** (`git commit -m 'Add amazing feature'`)
7. **Push to branch** (`git push origin feature/amazing-feature`)
8. **Open a Pull Request**

### Development Setup

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Build
pnpm build
```

### Code Style

- **TypeScript**: Use strict mode, full type annotations
- **Formatting**: Biome (runs automatically)
- **Testing**: Vitest with >80% coverage
- **Documentation**: JSDoc for public APIs
- **Commits**: Conventional Commits format

## Community & Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/[your-username]/stock-sense-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/[your-username]/stock-sense-ai/discussions)
- **Discord**: [Coming Soon]
- **Twitter**: [Coming Soon]

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Disclaimer

**IMPORTANT**: This software is for educational and research purposes only. It is **NOT** financial advice and should **NOT** be used for actual trading without proper due diligence and testing.

- Past performance does not guarantee future results
- Trading stocks involves risk of loss
- Always do your own research
- Consider consulting with a licensed financial advisor
- Start with paper trading before risking real capital
- The authors are not responsible for any financial losses

## Acknowledgments

- **Alpha Vantage** - Free stock market data API
- **Finnhub** - Real-time market data
- **technicalindicators** - Technical analysis library
- **QuantConnect Lean** - Inspiration for architecture
- **Freqtrade** - Inspiration for features
- **Open Source Community** - For making this possible

---

**Made with ❤️ by developers, for developers**

**⭐ Star this repo if you find it useful!**

---

## Quick Links

- [Getting Started](docs/GETTING_STARTED.md) - 15-minute setup guide
- [CLI Reference](docs/CLI_REFERENCE.md) - All commands
- [Backtesting Tutorial](BACKTESTING_GUIDE.md) - Learn backtesting
- [Paper Trading Guide](docs/PAPER_TRADING_SYSTEM.md) - Virtual trading
- [Risk Management](RISK_MANAGEMENT_DESIGN.md) - Manage portfolio risk
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Fix common issues
- [FAQ](docs/FAQ.md) - Common questions
- [Roadmap](IMPLEMENTATION_ROADMAP.md) - Future features
