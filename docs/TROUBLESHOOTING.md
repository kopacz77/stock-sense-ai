# Troubleshooting Guide

**Solutions to common problems and error messages**

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [API Issues](#api-issues)
3. [Backtesting Issues](#backtesting-issues)
4. [Paper Trading Issues](#paper-trading-issues)
5. [Risk Management Issues](#risk-management-issues)
6. [Data Issues](#data-issues)
7. [Performance Issues](#performance-issues)
8. [Security & Encryption Issues](#security--encryption-issues)
9. [Common Error Messages](#common-error-messages)
10. [Getting Help](#getting-help)

---

## Installation Issues

### Problem: `pnpm install` fails with permission errors

**Symptoms:**
```
Error: EACCES: permission denied
```

**Solutions:**

**macOS/Linux:**
```bash
# Fix npm permissions
sudo chown -R $USER:$(id -gn $USER) ~/.config
sudo chown -R $USER:$(id -gn $USER) ~/.npm

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows:**
Run PowerShell/Command Prompt as Administrator.

---

### Problem: `pnpm build` fails with TypeScript errors

**Symptoms:**
```
error TS2307: Cannot find module '...'
error TS2304: Cannot find name '...'
```

**Solutions:**

```bash
# Clean and reinstall
rm -rf node_modules
rm -rf dist
rm pnpm-lock.yaml

pnpm install
pnpm build
```

**Verify Node.js version:**
```bash
node --version  # Should be 18.x.x or higher
```

If Node.js is too old:
```bash
# macOS
brew install node@18

# Windows
# Download from nodejs.org

# Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### Problem: `stock-analyzer: command not found`

**Symptoms:**
After building, running `stock-analyzer` shows "command not found"

**Solutions:**

**Option 1: Use node directly**
```bash
node dist/index.js <command>
```

**Option 2: Make executable (Linux/macOS)**
```bash
chmod +x dist/index.js
./dist/index.js <command>
```

**Option 3: Link globally**
```bash
pnpm link --global
# Now you can use: stock-analyzer
```

**Option 4: Use npm bin**
```bash
$(npm bin)/stock-analyzer <command>
```

---

### Problem: Module resolution errors

**Symptoms:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

**Solution:**

Verify `package.json` has:
```json
{
  "type": "module"
}
```

Rebuild:
```bash
pnpm clean
pnpm build
```

---

## API Issues

### Problem: "API key not configured"

**Symptoms:**
```
❌ API key not configured
Please run: stock-analyzer setup
```

**Solutions:**

**Re-run setup:**
```bash
stock-analyzer setup
```

**Verify configuration:**
```bash
stock-analyzer health
```

**Manual configuration (if wizard fails):**

Check if config file exists:
```bash
ls -la config.encrypted
```

If missing, setup wasn't completed. Re-run setup.

---

### Problem: "Rate limit exceeded"

**Symptoms:**
```
❌ Daily rate limit (500) reached for Alpha Vantage
Please try again tomorrow or use Finnhub
```

**Solutions:**

**Solution 1: Wait**
- Alpha Vantage limits reset at midnight UTC
- Wait until the next day

**Solution 2: Use Finnhub**
```bash
stock-analyzer backtest data download AAPL --provider finnhub
```

**Solution 3: Use cached data**
```bash
# Check what's cached
stock-analyzer backtest data list

# Use existing cached data for backtests
```

**Solution 4: Upgrade API tier**
- Alpha Vantage Premium: 1200 calls/day
- Visit: alphavantage.co/premium

**Prevention:**
- Download data in batches
- Use cache (24-hour TTL)
- Plan downloads during off-peak hours

---

### Problem: "API connection failed"

**Symptoms:**
```
❌ Failed to connect to Alpha Vantage API
Error: getaddrinfo ENOTFOUND
```

**Solutions:**

**Check internet connection:**
```bash
ping www.alphavantage.co
```

**Check firewall:**
- Ensure outbound HTTPS (port 443) is allowed
- Check corporate firewall/proxy

**Verify API key:**
- Log in to Alpha Vantage
- Verify key is active (not expired)

**Try Finnhub:**
```bash
stock-analyzer backtest data download AAPL --provider finnhub
```

**Check system time:**
SSL certificates require accurate system time:
```bash
# macOS/Linux
date

# If wrong, update:
sudo ntpdate time.apple.com
```

---

### Problem: "Invalid API key"

**Symptoms:**
```
❌ Alpha Vantage API error: Invalid API key
```

**Solutions:**

**Get new API key:**
1. Visit [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
2. Enter email
3. Get new key
4. Run `stock-analyzer setup` with new key

**Verify key format:**
- Alpha Vantage keys are alphanumeric (e.g., `ABCD1234EFGH5678`)
- No spaces or special characters

**Check key status:**
- Log in to provider dashboard
- Verify key hasn't expired
- Check usage quotas

---

## Backtesting Issues

### Problem: "No data found for symbol"

**Symptoms:**
```
❌ No data found for AAPL
Please download data first
```

**Solutions:**

**Download data:**
```bash
stock-analyzer backtest data download AAPL --from 2023-01-01 --to 2023-12-31
```

**Verify symbol:**
- Check symbol is correct (AAPL, not APPLE)
- Use uppercase (AAPL, not aapl)

**Check cache:**
```bash
stock-analyzer backtest data list
```

**Clear and re-download:**
```bash
stock-analyzer backtest data clear AAPL
stock-analyzer backtest data download AAPL
```

---

### Problem: "Insufficient historical data"

**Symptoms:**
```
❌ Insufficient historical data for AAPL
Need at least 60 days, found 30
```

**Solutions:**

**Download more data:**
```bash
stock-analyzer backtest data download AAPL \
  --from 2022-01-01 \
  --to 2023-12-31
```

**Check data range:**
```bash
stock-analyzer backtest data list
```

**Requirements:**
- Mean Reversion: 60 days minimum (for RSI, Bollinger Bands)
- Momentum: 200 days minimum (for SMA 200)
- Optimization: 252 days minimum (1 year)

---

### Problem: Slow backtest performance

**Symptoms:**
- Backtest takes >5 minutes for 1 year of data

**Solutions:**

**Use cached data:**
- First run downloads data (slow)
- Subsequent runs use cache (fast)

**Reduce data range:**
```bash
# Instead of 5 years:
--from 2020-01-01 --to 2024-12-31

# Try 1 year:
--from 2023-01-01 --to 2023-12-31
```

**Close other applications:**
- Free up RAM
- Close browser tabs

**Check system resources:**
```bash
# macOS/Linux
top

# Windows
Task Manager
```

**Upgrade hardware:**
- Minimum: 4GB RAM
- Recommended: 8GB+ RAM

---

### Problem: Unrealistic backtest results

**Symptoms:**
- Sharpe Ratio >5
- Win rate >90%
- Returns >500% per year

**Causes:**
- Look-ahead bias
- Overfitting
- Incorrect slippage/commission models

**Solutions:**

**Use realistic slippage:**
```bash
--slippage FIXED_BPS_10  # More conservative than 5 BPS
```

**Add commissions:**
```bash
--commission PERCENTAGE_0_1  # 0.1% per trade
```

**Run walk-forward analysis:**
```bash
stock-analyzer backtest optimize \
  --method walk-forward \
  --strategy mean-reversion \
  --symbol AAPL
```

**Check for overfitting:**
- If in-sample Sharpe is 3.0 but out-of-sample is 1.0, it's overfitted
- Degradation >30% indicates overfitting

**Validate with paper trading:**
- Paper trade the strategy for 1-2 weeks
- Compare results to backtest

---

## Paper Trading Issues

### Problem: "Insufficient cash for order"

**Symptoms:**
```
❌ Order rejected: Insufficient cash
Required: $2,500
Available: $1,200
```

**Solutions:**

**Check portfolio:**
```bash
stock-analyzer paper portfolio
```

**Close positions:**
- Close existing positions to free up cash
- Or wait for positions to close automatically

**Reduce position sizes:**
- Decrease `maxPositionSize` in config
- Use smaller quantities

**Increase initial capital:**
```bash
# Stop current session
stock-analyzer paper stop

# Reset and start with more capital
stock-analyzer paper reset
stock-analyzer paper start --capital 25000
```

---

### Problem: "Orders not executing"

**Symptoms:**
- Orders remain PENDING
- No fills after several minutes

**Possible Causes:**
1. Market is closed
2. Limit price not reached
3. Data feed issue

**Solutions:**

**Check market hours:**
```bash
stock-analyzer paper status
```

If market is closed:
- Wait until 9:30 AM ET
- Or disable market hours: `--no-market-hours`

**Check order type:**
- LIMIT orders only fill if price reaches limit
- Use MARKET orders for immediate execution

**Verify data feed:**
```bash
stock-analyzer health
```

**Check order details:**
```bash
stock-analyzer paper orders
```

---

### Problem: "Encrypted storage errors"

**Symptoms:**
```
❌ Failed to write encrypted portfolio state
Error: EACCES: permission denied
```

**Solutions:**

**Check permissions:**
```bash
# macOS/Linux
ls -la data/paper-trading/

# Fix permissions
chmod 755 data/paper-trading/
chmod 644 data/paper-trading/*
```

**Check disk space:**
```bash
# macOS/Linux
df -h

# Ensure >100MB free
```

**Verify directory exists:**
```bash
mkdir -p data/paper-trading/backups
```

**Reset if corrupted:**
```bash
⚠️  WARNING: This deletes all paper trading data

# Backup first
cp -r data/paper-trading data/paper-trading-backup

# Reset
stock-analyzer paper reset
```

---

## Risk Management Issues

### Problem: "VaR calculation failed"

**Symptoms:**
```
❌ Failed to calculate VaR
Error: Not enough historical data
```

**Solutions:**

**Ensure sufficient data:**
- VaR requires at least 30 days of historical returns
- Download more data if needed

**Check portfolio:**
```bash
stock-analyzer paper portfolio
```

- Need at least 1 open position

**Try different method:**
```bash
# Instead of historical
--method parametric

# Or
--method monte-carlo
```

---

### Problem: "Monte Carlo simulation timeout"

**Symptoms:**
- Monte Carlo hangs or takes >10 minutes

**Solutions:**

**Reduce scenarios:**
```bash
# Instead of 10,000
--scenarios 1000

# Start small, increase gradually
```

**Check system resources:**
- Close other applications
- Ensure 4GB+ RAM available

**Use shorter horizon:**
```bash
# Instead of 252 days (1 year)
--horizon 60  # ~3 months
```

---

## Data Issues

### Problem: "Data validation failed"

**Symptoms:**
```
❌ Data validation failed for AAPL
Errors:
  • Missing data for 2023-03-15
  • Volume is 0 for 2023-04-20
```

**Solutions:**

**Re-download data:**
```bash
stock-analyzer backtest data clear AAPL
stock-analyzer backtest data download AAPL
```

**Check data quality:**
```bash
stock-analyzer backtest data validate AAPL
```

**Use different provider:**
```bash
stock-analyzer backtest data download AAPL --provider finnhub
```

**Manual CSV import (if APIs fail):**
1. Download CSV from Yahoo Finance
2. Import: `stock-analyzer backtest data import aapl.csv --symbol AAPL`

---

### Problem: "Date gaps in data"

**Symptoms:**
```
⚠️  Date gaps found: 5
  • 2023-11-23 to 2023-11-27 (4 days)
```

**This is normal!**
- Markets are closed on weekends
- Markets are closed on holidays (Thanksgiving, Christmas, etc.)
- Backtesting automatically skips non-trading days

**Only re-download if:**
- Gaps occur on known trading days (Mon-Fri, non-holidays)
- Large gaps (>7 days) in the middle of the year

**Solution (if abnormal):**
```bash
stock-analyzer backtest data clear AAPL
stock-analyzer backtest data download AAPL
```

---

### Problem: "CSV import fails"

**Symptoms:**
```
❌ Unable to detect required columns in CSV
```

**Solutions:**

**Verify CSV format:**
Required columns (case-insensitive):
- Date
- Open
- High
- Low
- Close
- Volume

Example:
```csv
Date,Open,High,Low,Close,Volume
2023-01-03,100.50,102.30,99.80,101.20,50000000
```

**Specify separator:**
```bash
# If semicolon-separated
--separator ";"

# If tab-separated
--separator "\t"
```

**Check header:**
```bash
# If no header row
--no-header
```

**Download example CSV:**
- Yahoo Finance: [finance.yahoo.com](https://finance.yahoo.com)
- Google Finance
- Alpha Vantage CSV export

---

## Performance Issues

### Problem: High memory usage

**Symptoms:**
- Application uses >2GB RAM
- System becomes slow

**Solutions:**

**Reduce cache size:**
```bash
stock-analyzer backtest data clear
```

**Process fewer symbols:**
```bash
# Instead of 50 symbols
stock-analyzer scan --watchlist AAPL,MSFT,GOOGL
```

**Close dashboard:**
- Web dashboard uses significant RAM
- Use CLI-only mode

**Restart application:**
```bash
stock-analyzer paper stop
# Wait 30 seconds
stock-analyzer paper start
```

---

### Problem: Slow API responses

**Symptoms:**
- Data downloads take >2 minutes per symbol
- Timeouts

**Solutions:**

**Check internet speed:**
```bash
# Run speed test
# Minimum: 5 Mbps download
```

**Use different provider:**
```bash
# Finnhub is often faster
stock-analyzer backtest data download AAPL --provider finnhub
```

**Download during off-peak:**
- Avoid market hours (9:30 AM - 4:00 PM ET)
- Night/weekend downloads are faster

**Check firewall/proxy:**
- Corporate firewalls may throttle
- Try from home network

---

## Security & Encryption Issues

### Problem: "Encryption key not found"

**Symptoms:**
```
❌ Encryption key not found in OS keychain
Please run setup again
```

**Solutions:**

**Re-run setup:**
```bash
stock-analyzer setup
```

**Check OS keychain access:**

**macOS:**
- Open Keychain Access
- Search for "stock-sense-ai"
- Verify entry exists

**Windows:**
- Open Credential Manager
- Search for "stock-sense-ai"

**Linux:**
- Ensure Secret Service is installed:
```bash
sudo apt-get install gnome-keyring
```

**Manual fix (advanced):**
```bash
# Delete old config
rm config.encrypted

# Re-run setup
stock-analyzer setup
```

---

### Problem: "Failed to decrypt configuration"

**Symptoms:**
```
❌ Failed to decrypt configuration
Decryption failed
```

**Solutions:**

**Possible causes:**
- Config file corrupted
- Encryption key changed
- OS keychain access denied

**Solution: Reset configuration**
```bash
⚠️  WARNING: You'll need to re-enter API keys

# Backup current config (optional)
cp config.encrypted config.encrypted.backup

# Delete and re-setup
rm config.encrypted
stock-analyzer setup
```

---

## Common Error Messages

### `ECONNREFUSED`

**Meaning:** Cannot connect to server

**Solutions:**
- Check internet connection
- Verify firewall settings
- Try different provider

---

### `ETIMEDOUT`

**Meaning:** Connection timed out

**Solutions:**
- Check internet speed
- Retry command
- Use `--timeout` option (if available)

---

### `ENOENT`

**Meaning:** File or directory not found

**Solutions:**
```bash
# Create missing directories
mkdir -p data/cache
mkdir -p data/paper-trading
```

---

### `EACCES`

**Meaning:** Permission denied

**Solutions:**
```bash
# Fix permissions
chmod 755 data/
chmod 644 data/*
```

---

### `ERR_MODULE_NOT_FOUND`

**Meaning:** Missing npm module

**Solutions:**
```bash
pnpm install
pnpm build
```

---

## Getting Help

### Before Asking for Help

1. **Check this guide** - Most issues are covered here
2. **Read error message carefully** - Often contains solution
3. **Run health check:**
```bash
stock-analyzer health
```

4. **Check logs** (if enabled):
```bash
ls -la logs/
cat logs/latest.log
```

5. **Search existing issues:**
- [GitHub Issues](https://github.com/[your-username]/stock-sense-ai/issues)

### How to Report a Bug

1. **Create GitHub Issue**
2. **Include:**
   - Operating System (macOS/Windows/Linux)
   - Node.js version (`node --version`)
   - Stock Sense AI version (`stock-analyzer --version`)
   - Command that failed
   - Full error message
   - Steps to reproduce

**Template:**
```markdown
**Environment:**
- OS: macOS 13.5
- Node.js: v18.17.0
- Stock Sense AI: v1.0.0

**Command:**
stock-analyzer backtest run --strategy mean-reversion --symbol AAPL

**Error:**
❌ No data found for AAPL

**Steps to Reproduce:**
1. Run setup
2. Run backtest without downloading data
3. Error occurs

**Expected:**
Should prompt to download data

**Actual:**
Error with no guidance
```

### Where to Get Help

- **Documentation**: [docs/](../docs/)
- **FAQ**: [FAQ.md](FAQ.md)
- **GitHub Issues**: [Report bug](https://github.com/[your-username]/stock-sense-ai/issues)
- **GitHub Discussions**: [Ask question](https://github.com/[your-username]/stock-sense-ai/discussions)

---

## Diagnostic Commands

Run these commands to diagnose issues:

```bash
# System health
stock-analyzer health

# Cache status
stock-analyzer backtest data stats

# Paper trading status
stock-analyzer paper status

# Node.js version
node --version

# pnpm version
pnpm --version

# Check file permissions
ls -la data/

# Check disk space
df -h

# Check memory
free -h  # Linux
vm_stat  # macOS

# Test API connectivity
curl https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL&apikey=demo
```

---

## Prevention Tips

1. **Always run health check after setup:**
```bash
stock-analyzer setup
stock-analyzer health
```

2. **Download data before backtesting:**
```bash
stock-analyzer backtest data download AAPL
stock-analyzer backtest run --strategy mean-reversion --symbol AAPL
```

3. **Monitor API usage:**
```bash
stock-analyzer backtest data stats
# Check "API Usage" section
```

4. **Keep cache clean:**
```bash
# Monthly cleanup
stock-analyzer backtest data clear
```

5. **Backup paper trading data:**
```bash
cp -r data/paper-trading data/paper-trading-backup-$(date +%Y%m%d)
```

6. **Update regularly:**
```bash
git pull
pnpm install
pnpm build
```

---

**Last Updated**: November 8, 2025

**Difficulty**: All Levels

**Total Issues Covered**: 40+
