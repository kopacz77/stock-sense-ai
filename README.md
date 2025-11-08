# Stock Sense AI

A secure, local stock analysis CLI tool with advanced trading strategies, risk management, and comprehensive technical analysis.

## Features

🔐 **Security First**
- End-to-end encryption for all sensitive data
- OS keychain integration for secure key storage
- No cloud dependencies - runs entirely locally
- Encrypted configuration and logs

📈 **Advanced Trading Strategies**
- Mean reversion with RSI, MFI, Bollinger Bands
- Momentum trading with moving averages and MACD
- Volume analysis and confirmation
- Seasonal trading patterns

⚡ **Smart Risk Management**
- 1% risk rule with position sizing
- Stop-loss and take-profit calculations
- Portfolio correlation analysis
- Sector concentration limits

🚀 **Performance Optimized**
- Intelligent caching system
- Rate limiting for API calls
- Concurrent analysis capabilities
- TypeScript for type safety

## Quick Start

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

```bash
# Clone and install
git clone <repository-url>
cd stock-sense-ai
pnpm install

# Build the project
pnpm build

# Run setup
node dist/index.js setup
```

### Docker Installation

```bash
# Build the image
docker build -t stock-sense-ai .

# Run setup
docker run -it --rm -v "$(pwd)/data:/app/data" stock-sense-ai setup

# Run analysis
docker run -it --rm -v "$(pwd)/data:/app/data" stock-sense-ai analyze AAPL
```

## Usage

### Initial Setup

```bash
# Configure API keys and settings
stock-analyzer setup
```

You'll need:
- Alpha Vantage API key (free at alphavantage.co)
- Finnhub API key (free at finnhub.io)
- Optional: SendGrid key for email alerts

### Health Check

```bash
# Verify configuration and API connectivity
stock-analyzer health
```

### Analyze Individual Stocks

```bash
# Basic analysis
stock-analyzer analyze AAPL

# Detailed analysis with all indicators
stock-analyzer analyze AAPL --detailed

# Specific strategy
stock-analyzer analyze AAPL --strategy mean-reversion
```

### Scan Multiple Stocks

```bash
# Scan default watchlist
stock-analyzer scan

# Scan custom watchlist
stock-analyzer scan --watchlist my-stocks.txt

# Show top 5 opportunities
stock-analyzer scan --top 5
```

### Cache Management

```bash
# Show cache statistics
stock-analyzer cache --stats

# Clear all cached data
stock-analyzer cache --clear
```

## Configuration

All configuration is encrypted and stored locally. During setup, you'll configure:

### API Keys
- **Alpha Vantage**: Historical data and technical indicators
- **Finnhub**: Real-time quotes and market data
- **SendGrid** (optional): Email alerts for strong signals

### Risk Parameters
- Maximum risk per trade (default: 1%)
- Maximum position size (default: 25%)
- Risk/reward ratios and stop-loss multipliers

### Trading Strategies
- RSI oversold/overbought levels
- Bollinger Band standard deviations
- Moving average periods
- Volume confirmation thresholds

## Trading Strategies

### Mean Reversion Strategy

Identifies oversold/overbought conditions using:
- **RSI**: Relative Strength Index (14-period)
- **MFI**: Money Flow Index (14-period) 
- **Bollinger Bands**: 2 standard deviations
- **Stochastic Oscillator**: %K and %D crossovers
- **Williams %R**: Momentum oscillator

### Momentum Strategy

Captures trending moves using:
- **Moving Averages**: SMA 20/50/200 alignment
- **MACD**: 12/26/9 configuration with histogram
- **Price Momentum**: Rate of change analysis
- **Volume Confirmation**: Above-average volume
- **Trend Patterns**: Higher highs/lows detection

### Risk Management

Automatic position sizing based on:
- **1% Risk Rule**: Never risk more than 1% per trade
- **ATR-Based Stops**: 2x Average True Range
- **Reward/Risk Ratio**: Minimum 2:1 target
- **Portfolio Limits**: Max 25% in any position
- **Correlation Control**: Limit correlated positions

## File Structure

```
stock-sense-ai/
├── src/
│   ├── analysis/          # Technical indicators & risk management
│   ├── config/            # Secure configuration management
│   ├── data/              # Market data service with caching
│   ├── strategies/        # Trading strategy implementations
│   ├── types/             # TypeScript type definitions
│   └── index.ts           # CLI entry point
├── data/                  # Cached market data (encrypted)
├── logs/                  # Application logs (encrypted)
├── config.encrypted       # Encrypted configuration file
└── watchlist.txt          # Stock symbols to monitor
```

## Security Features

### Encryption
- AES-256-CBC encryption for all sensitive data
- Unique initialization vectors for each encryption
- Secure key derivation and storage

### Key Management
- Encryption keys stored in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- No plaintext storage of API keys or configuration
- Automatic key generation and rotation

### Data Protection
- All API keys encrypted at rest
- Trading configuration encrypted
- Cache data optionally encrypted
- Logs contain no sensitive information

### Network Security
- HTTPS-only API communications
- Rate limiting and request deduplication
- No persistent network connections
- Optional VPN recommendations

## Performance

### Caching Strategy
- **Quotes**: 5-minute cache
- **Historical Data**: 1-hour cache  
- **Technical Indicators**: 30-minute cache
- Automatic cache invalidation and cleanup

### API Management
- Built-in rate limiting (250ms between requests)
- Request deduplication for concurrent calls
- Graceful error handling and retries
- Multiple data source failover

### Optimization
- Parallel data fetching where possible
- Efficient memory usage with streaming
- TypeScript for compile-time optimization
- Minimal dependency footprint

## Development

### Building

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run linting
pnpm lint

# Run tests
pnpm test
```

### Code Quality

- **TypeScript**: Full type safety
- **Biome**: Linting and formatting
- **Strict Mode**: Enhanced error checking
- **Security Linting**: No hardcoded secrets

### Architecture Principles

- **Security by Design**: Encryption-first approach
- **Type Safety**: Comprehensive TypeScript usage
- **Error Handling**: Graceful failure modes
- **Modularity**: Clean separation of concerns
- **Performance**: Caching and optimization

## API Limits

### Alpha Vantage (Free Tier)
- 25 requests per day
- 5 API calls per minute

### Finnhub (Free Tier)
- 60 API calls per minute
- No daily limit

**Tip**: The caching system significantly reduces API usage. A typical analysis uses 3-4 API calls, but subsequent analyses within the cache window use 0 calls.

## Troubleshooting

### Common Issues

**"API key not configured"**
- Run `stock-analyzer setup` to configure API keys
- Verify keys are valid on provider websites

**"Rate limit exceeded"**
- Wait before retrying (limits reset every minute)
- Clear cache to force fresh requests: `stock-analyzer cache --clear`

**"Insufficient historical data"**
- Some stocks may not have enough trading history
- Try blue-chip stocks like AAPL, MSFT for testing

**"Encryption key not found"**
- Run setup again to regenerate encryption keys
- Check OS keychain permissions

### Debug Mode

```bash
# Enable verbose logging
NODE_ENV=development stock-analyzer analyze AAPL
```

### Health Diagnostics

```bash
# Comprehensive system check
stock-analyzer health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting: `pnpm lint`
5. Build successfully: `pnpm build`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is for educational and research purposes only. It is not financial advice and should not be used for actual trading without proper due diligence. Past performance does not guarantee future results. Always do your own research and consider consulting with a financial advisor before making investment decisions.