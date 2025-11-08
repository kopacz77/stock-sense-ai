# Stock Sense AI - Complete Setup Guide

## Overview
This guide shows how to run the complete Stock Sense AI system with the web dashboard UI that integrates all features in one interface.

## Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- API keys (Alpha Vantage, Finnhub)

## Quick Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build the Project  
```bash
pnpm build
```

### 3. Configure API Keys (if not done)
```bash
node dist/index.js setup
```
Follow the prompts to enter:
- Alpha Vantage API key
- Finnhub API key  
- Notification settings (Telegram/Email)
- Risk parameters

### 4. Verify Configuration
```bash
node dist/index.js health
```

## Running the Complete System

### Option 1: Web Dashboard (Recommended)
Launch the integrated web UI that includes all features:

```bash
# Production mode
node dist/index.js dashboard --port 3000

# Development mode  
pnpm dev dashboard --port 3000
```

**Access at: http://localhost:3000**

The dashboard includes:
- ✅ Real-time stock analysis (both strategies)
- ✅ Market scanning and discovery
- ✅ Live monitoring status
- ✅ Performance charts
- ✅ Alert management
- ✅ Portfolio tracking
- ✅ Market sentiment analysis

### Option 2: Background Monitoring + Dashboard
For 24/7 automated monitoring with web interface:

**Terminal 1 - Start Monitoring:**
```bash
node dist/index.js monitor --start --interval 30 --confidence 75
```

**Terminal 2 - Start Dashboard:**
```bash
node dist/index.js dashboard --port 3000
```

### Option 3: Full Production Setup
For production deployment with all services:

**1. Start monitoring service:**
```bash
# Monitor markets every 30 minutes
node dist/index.js monitor --start --interval 30 --sectors TECHNOLOGY,HEALTHCARE --confidence 80
```

**2. Launch web dashboard:**
```bash
# Web interface on port 3000
node dist/index.js dashboard --port 3000
```

**3. Optional - Test notifications:**
```bash
node dist/index.js test-notifications
```

## Docker Setup (Alternative)

### Build and Run with Docker
```bash
# Build the image
docker build -t stock-sense-ai .

# Run setup (one-time)
docker run -it --rm -v "$(pwd)/data:/app/data" stock-sense-ai setup

# Run dashboard
docker run -it --rm -v "$(pwd)/data:/app/data" -p 3000:3000 stock-sense-ai dashboard

# Run monitoring
docker run -it --rm -v "$(pwd)/data:/app/data" stock-sense-ai monitor --start
```

### Docker Compose (Full Stack)
```bash
docker-compose up -d
```

## Web Dashboard Features

Once running at http://localhost:3000, you'll have access to:

### **Main Dashboard**
- Market overview and sentiment
- Active positions and P&L
- Recent alerts and signals
- System health status

### **Analysis Page**
- Real-time stock analysis
- Both mean reversion and momentum strategies
- Technical indicators display
- Risk management calculations

### **Discovery Page**
- Sector-based opportunity scanning
- Market screening tools
- High-confidence signal filtering
- Trending stock identification

### **Monitoring Page**
- Live monitoring controls
- Start/stop monitoring
- View monitoring results
- Performance statistics

### **Settings Page**
- Strategy configuration
- Risk parameter adjustments
- Notification settings
- API usage monitoring

## API Rate Limiting

### Free Tier Limits:
- **Alpha Vantage**: 25 requests/day, 5/minute
- **Finnhub**: 60 requests/minute

### Optimization Tips:
- Use caching (automatically enabled)
- Run monitoring at 30+ minute intervals
- Focus on specific sectors vs full market scans
- Monitor API usage in dashboard

## Background Services

### Monitoring Service
Automatically scans markets and sends alerts:
```bash
# Start with custom settings
node dist/index.js monitor --start \
  --interval 60 \
  --sectors TECHNOLOGY,FINANCE \
  --confidence 80 \
  --max-results 10
```

### Cache Management
```bash
# View cache statistics
node dist/index.js cache --stats

# Clear cache if needed
node dist/index.js cache --clear
```

## Notifications Setup

### Telegram (Recommended)
1. Create bot with @BotFather
2. Get bot token and chat ID
3. Configure during setup

### Email (SendGrid)
1. Get SendGrid API key
2. Configure during setup
3. Verify email delivery

## Development Mode

For development with hot reload:
```bash
# Start dashboard in dev mode
pnpm dev dashboard --port 3000

# Run individual commands in dev mode
pnpm dev analyze AAPL --detailed
pnpm dev discover --sector TECHNOLOGY
```

## Troubleshooting

### Common Issues:

**"Configuration not found"**
```bash
node dist/index.js setup
```

**"API key not configured"**
- Run setup again
- Verify keys are valid on provider websites

**"Rate limit exceeded"** 
- Wait before retrying
- Clear cache: `node dist/index.js cache --clear`
- Reduce monitoring frequency

**Web dashboard not accessible**
- Check port isn't in use
- Try different port: `--port 3001`
- Check firewall settings

### Health Check
```bash
node dist/index.js health
```

## Production Deployment

### Recommended Production Setup:
1. **VPS/Cloud Server** (AWS, DigitalOcean, etc.)
2. **Process Manager** (PM2, systemd)
3. **Reverse Proxy** (nginx)
4. **SSL Certificate** (Let's Encrypt)

### PM2 Example:
```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start "node dist/index.js monitor --start --interval 30" --name "stock-monitor"
pm2 start "node dist/index.js dashboard --port 3000" --name "stock-dashboard"

# Save configuration
pm2 save
pm2 startup
```

## Next Steps

1. **Start with web dashboard**: `node dist/index.js dashboard`
2. **Test with paper trading**: Monitor signals without real money
3. **Fine-tune parameters**: Adjust confidence thresholds based on results
4. **Set up notifications**: Get alerts for high-confidence signals
5. **Monitor performance**: Track signal accuracy over time

## Support

- Check logs in `logs/` directory
- Run health check for diagnostics
- Review cache stats for API usage
- Test notifications separately

---

**🚀 Ready to start? Run: `node dist/index.js dashboard --port 3000`**