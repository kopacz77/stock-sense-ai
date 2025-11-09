# Video Tutorial Scripts

**Production-ready scripts for creating video tutorials**

## Overview

This document contains detailed scripts for 5 video tutorials covering Stock Sense AI from installation to advanced features. Each script includes timing, shots, narration, and screen actions.

**Target Audience**: Beginners to intermediate users
**Total Runtime**: ~60 minutes across 5 videos
**Format**: Screen recording + voiceover

---

## Tutorial 1: Installation and Setup (5-7 minutes)

**Goal**: Get Stock Sense AI installed and configured in under 10 minutes

### Shot List

| Time | Shot | Narration | Screen Actions |
|------|------|-----------|----------------|
| 0:00-0:30 | Intro | "Welcome to Stock Sense AI! In this tutorial, we'll install and set up the platform in just 5 minutes." | Title card, feature highlights |
| 0:30-1:00 | Prerequisites | "First, let's check prerequisites. You need Node.js 18+ and pnpm." | Open terminal, run `node --version` |
| 1:00-2:00 | Clone & Install | "Clone the repository and install dependencies with pnpm install." | Show git clone, cd, pnpm install |
| 2:00-2:30 | Build | "Build the TypeScript code with pnpm build." | Run `pnpm build`, show success |
| 2:30-4:00 | Setup Wizard | "Run the setup wizard. You'll need Alpha Vantage and Finnhub API keys." | Run `stock-analyzer setup`, enter keys |
| 4:00-4:30 | Health Check | "Verify everything works with the health check command." | Run `stock-analyzer health` |
| 4:30-5:00 | Outro | "That's it! You're ready to start trading. Next tutorial: Your first backtest." | Show summary, next video teaser |

### Full Script

**[INTRO - 0:00]**

*Screen: Title card "Stock Sense AI - Tutorial 1: Installation & Setup"*

"Welcome to Stock Sense AI, the TypeScript-native algorithmic trading platform. I'm going to show you how to install and configure Stock Sense AI in just 5 minutes. Let's get started!"

**[PREREQUISITES - 0:30]**

*Screen: Terminal window*

"Before we begin, make sure you have Node.js version 18 or higher installed. You can check by opening your terminal and typing:"

```bash
node --version
```

*Type command, show output: v18.17.0*

"Great! We're running Node 18. If you're running an older version, head to nodejs.org and download the latest LTS version."

"Next, we'll install pnpm, which is faster than npm:"

```bash
npm install -g pnpm
```

*Show installation progress*

**[CLONE & INSTALL - 1:00]**

*Screen: Terminal, GitHub page in background*

"Now let's clone the repository from GitHub:"

```bash
git clone https://github.com/[your-username]/stock-sense-ai
cd stock-sense-ai
```

*Execute commands, show directory change*

"With the repository cloned, let's install all dependencies:"

```bash
pnpm install
```

*Show package installation progress bar*

"This will take about 30 seconds to download and install all required packages. While that's running, make sure you have your API keys ready from Alpha Vantage and Finnhub. Both offer generous free tiers."

*Installation completes*

"Perfect! All dependencies are installed."

**[BUILD - 2:00]**

*Screen: Terminal*

"Next, we need to compile the TypeScript code:"

```bash
pnpm build
```

*Show build output scrolling*

"The build process compiles TypeScript to JavaScript, which takes about 10-15 seconds."

*Build completes successfully*

"Excellent! The build completed successfully. We're ready for setup."

**[SETUP WIZARD - 2:30]**

*Screen: Terminal*

"Now comes the important part - configuration. Run the setup command:"

```bash
stock-analyzer setup
```

*Setup wizard appears*

"The interactive wizard will guide you through configuration. First, enter your Alpha Vantage API key:"

*Type API key (censored on screen)*

"Next, your Finnhub API key:"

*Type API key (censored on screen)*

"For notifications, I'll choose Telegram - it's free and instant. If you don't have Telegram set up, you can choose 'None' for now."

*Select Telegram option*

"Enter your Telegram Bot Token from BotFather:"

*Type token (censored)*

"And your Chat ID from @userinfobot:"

*Type Chat ID (censored)*

"For risk parameters, the defaults are conservative and work well for beginners. Let's accept them by pressing Enter:"

*Press Enter for all defaults*

"And that's it! The setup is complete. All your sensitive data is now encrypted with AES-256 and stored in your system's secure keychain."

**[HEALTH CHECK - 4:00]**

*Screen: Terminal*

"Let's verify everything is working correctly:"

```bash
stock-analyzer health
```

*Health check runs, shows green checkmarks*

"Perfect! All systems are operational. Notice the green checkmarks:
- Configuration loaded
- Encryption working
- Alpha Vantage API connected
- Finnhub API connected
- Telegram bot connected
- Cache directory ready

You're all set!"

**[OUTRO - 4:30]**

*Screen: Summary slide*

"Congratulations! You've successfully installed and configured Stock Sense AI. In the next tutorial, we'll run your first backtest and learn how to interpret the results. See you there!"

*Fade to black, "Next: Tutorial 2 - Your First Backtest"*

---

## Tutorial 2: Your First Backtest (10-12 minutes)

**Goal**: Download data, run a backtest, and understand the results

### Shot List

| Time | Shot | Narration | Screen Actions |
|------|------|-----------|----------------|
| 0:00-0:30 | Intro | "Let's run your first backtest!" | Title card |
| 0:30-2:00 | Download Data | "Download historical data for Apple stock" | Run download command |
| 2:00-4:00 | Run Backtest | "Execute a mean reversion backtest" | Run backtest command |
| 4:00-7:00 | Interpret Results | "Understand the 30+ metrics" | Explain each metric group |
| 7:00-8:00 | Trade Log | "View individual trades" | Show trade journal |
| 8:00-9:00 | Compare Benchmark | "How did we do vs. Buy & Hold?" | Compare results |
| 9:00-10:00 | Outro | "What's next?" | Teaser for optimization |

### Key Metrics to Explain

Focus on these beginner-friendly metrics:
- **Total Return**: Simple percentage gain
- **Sharpe Ratio**: Risk-adjusted return (>1.0 is good)
- **Max Drawdown**: Biggest loss from peak (-8% is acceptable)
- **Win Rate**: Percentage of winning trades (>50% is profitable)
- **Profit Factor**: Gross profit / Gross loss (>2.0 is strong)

*(Full script available upon request)*

---

## Tutorial 3: Parameter Optimization (15-18 minutes)

**Goal**: Optimize strategy parameters and avoid overfitting

### Shot List

| Time | Shot | Narration | Screen Actions |
|------|------|-----------|----------------|
| 0:00-0:30 | Intro | "Make your strategy better with optimization" | Title card |
| 0:30-2:00 | Grid Search Intro | "What is grid search?" | Explain concept with visuals |
| 2:00-5:00 | Run Grid Search | "Find optimal RSI and Bollinger Band parameters" | Execute optimization |
| 5:00-7:00 | Analyze Results | "Top 10 parameter combinations" | Review results table |
| 7:00-10:00 | Walk-Forward Analysis | "Prevent overfitting with out-of-sample testing" | Run walk-forward |
| 10:00-12:00 | Interpret Degradation | "Is your strategy overfitted?" | Explain degradation % |
| 12:00-14:00 | Apply Best Parameters | "Retest with optimized settings" | Run backtest with best params |
| 14:00-15:00 | Outro | "You found the optimal parameters!" | Summary, next video teaser |

### Key Concepts to Cover

- **Parameter Space**: Range of values to test
- **Overfitting**: Great backtest, poor live results
- **In-Sample vs. Out-of-Sample**: Train vs. Test data
- **Degradation**: How much performance drops on unseen data
- **Acceptable Degradation**: <20% is robust, >30% is overfitted

*(Full script available upon request)*

---

## Tutorial 4: Paper Trading (10-12 minutes)

**Goal**: Start paper trading and monitor performance

### Shot List

| Time | Shot | Narration | Screen Actions |
|------|------|-----------|----------------|
| 0:00-0:30 | Intro | "Practice trading with virtual money" | Title card |
| 0:30-2:00 | Start Paper Trading | "Launch the paper trading engine" | Run start command |
| 2:00-3:00 | Portfolio Overview | "Check your virtual portfolio" | Show portfolio command |
| 3:00-5:00 | Monitor Trades | "Watch trades execute in real-time" | Show status updates |
| 5:00-7:00 | View Performance | "Track your P&L and metrics" | Show performance command |
| 7:00-9:00 | Risk Limits | "Understand position limits and safety features" | Explain risk checks |
| 9:00-10:00 | Stop Trading | "Stop the engine and review results" | Run stop command |
| 10:00-11:00 | Outro | "You're ready to paper trade!" | Summary |

### Risk Features to Highlight

- Position size limits (max 25%)
- Maximum concurrent positions (10)
- Daily loss limits (-5%)
- Concentration limits (no more than 30% in one symbol)
- Pre-trade validation (prevents risky orders)

*(Full script available upon request)*

---

## Tutorial 5: Risk Management (15-18 minutes)

**Goal**: Use VaR, CVaR, Monte Carlo, and Stress Testing

### Shot List

| Time | Shot | Narration | Screen Actions |
|------|------|-----------|----------------|
| 0:00-0:30 | Intro | "Manage risk like institutions" | Title card |
| 0:30-3:00 | VaR Intro | "What is Value at Risk?" | Concept explanation |
| 3:00-5:00 | Calculate VaR | "Find your maximum expected loss" | Run VaR command |
| 5:00-7:00 | CVaR (Expected Shortfall) | "Understand tail risk" | Run CVaR command |
| 7:00-10:00 | Monte Carlo Simulation | "10,000 possible futures" | Run Monte Carlo |
| 10:00-12:00 | Stress Testing | "Survive a 2008-style crash" | Run stress test |
| 12:00-14:00 | Kelly Criterion | "Optimal position sizing" | Calculate Kelly |
| 14:00-15:00 | Risk Report | "Generate comprehensive report" | Show risk report |
| 15:00-16:00 | Outro | "You're now a risk management pro!" | Summary |

### Risk Concepts to Explain

**VaR:**
- "With 95% confidence, you won't lose more than X"
- Show distribution histogram

**CVaR:**
- "If the worst 5% happens, average loss is X"
- Explain tail risk

**Monte Carlo:**
- "Simulate 10,000 possible portfolio paths"
- Show probability of profit

**Stress Test:**
- "What if 2008 happens again?"
- Show portfolio impact

*(Full script available upon request)*

---

## Production Notes

### Equipment Needed

- **Screen Recording Software**: OBS Studio (free) or Camtasia
- **Microphone**: USB condenser mic (Blue Yeti recommended)
- **Video Editing**: DaVinci Resolve (free) or Adobe Premiere
- **Screen Resolution**: 1920x1080 (Full HD)
- **Frame Rate**: 30 fps

### Recording Tips

1. **Clean Desktop**: Hide personal files, use neutral wallpaper
2. **Terminal Settings**:
   - Font: Monaco or Menlo, 16pt
   - Color scheme: Dark background (easier on eyes)
   - No distracting animations
3. **Zoom In**: When showing code/terminal, zoom to 150-200%
4. **Pace**: Speak slowly, pause between steps
5. **Mouse**: Use mouse cursor highlights (available in OBS)
6. **Errors**: Leave them in! Show how to fix mistakes

### Editing Checklist

- [ ] Remove dead air (>3 seconds of silence)
- [ ] Add captions for key terms
- [ ] Zoom in on important text
- [ ] Add chapter markers
- [ ] Include download links in description
- [ ] Add music (subtle, royalty-free)
- [ ] Export at 1080p, H.264

### YouTube Optimization

**Titles:**
- "Stock Sense AI Tutorial 1: Installation (5 min)"
- "Stock Sense AI Tutorial 2: Your First Backtest (10 min)"
- "Stock Sense AI Tutorial 3: Parameter Optimization (15 min)"
- "Stock Sense AI Tutorial 4: Paper Trading (10 min)"
- "Stock Sense AI Tutorial 5: Risk Management (15 min)"

**Descriptions:**
```
Learn [topic] in Stock Sense AI, the TypeScript algorithmic trading platform.

⏱️ Timestamps:
0:00 - Intro
0:30 - [Section 1]
2:00 - [Section 2]
...

📥 Download Stock Sense AI:
https://github.com/[your-username]/stock-sense-ai

📚 Documentation:
https://github.com/[your-username]/stock-sense-ai/docs

💬 Community:
https://discord.gg/[your-server]

#AlgorithmicTrading #TypeScript #StockTrading #Backtesting
```

**Thumbnails:**
- Clean design, large text
- Feature screenshot
- Stock Sense AI logo
- Tutorial number visible

**Tags:**
algorithmic trading, stock trading, backtesting, typescript, nodejs, trading bot, paper trading, risk management, quantitative finance, trading strategies

---

## Engagement Ideas

### Interactive Elements

1. **Code Along**: Pause video, let viewers complete each step
2. **Challenges**: "Try optimizing MSFT on your own!"
3. **Q&A**: Answer top comments in next video
4. **Series Playlist**: Auto-play next tutorial

### Call to Actions

- **Subscribe**: "Subscribe for advanced tutorials!"
- **Like**: "Helpful? Give it a thumbs up!"
- **Comment**: "Share your backtest results in comments!"
- **Star Repo**: "Star the GitHub repo to support development!"
- **Discord**: "Join our Discord community for help!"

---

## Advanced Tutorial Ideas (Future)

**Tutorial 6: Creating Custom Strategies (20 min)**
- Write your own strategy in TypeScript
- Implement technical indicators
- Backtest your custom strategy

**Tutorial 7: Multi-Symbol Portfolio Trading (15 min)**
- Trade multiple stocks simultaneously
- Portfolio optimization
- Diversification strategies

**Tutorial 8: Web Dashboard Deep Dive (12 min)**
- Launch and navigate dashboard
- Interactive charts with TradingView
- Real-time monitoring

**Tutorial 9: Deploying to Cloud (18 min)**
- Deploy to AWS/DigitalOcean
- Run 24/7 paper trading
- Set up alerts

**Tutorial 10: Live Trading with Alpaca (20 min)**
- Connect to Alpaca broker
- Place real orders
- Monitor live positions
- Safety considerations

---

## Accessibility

### Closed Captions

Provide accurate captions for all videos:
- Auto-generate with YouTube
- Review and edit for accuracy
- Add technical terms to custom dictionary

### Transcripts

Provide full text transcripts:
- Post on GitHub (docs/transcripts/)
- Include in video description
- Searchable for SEO

### International

Consider creating versions in:
- Spanish
- Mandarin Chinese
- Hindi
- Portuguese
- French

---

## Analytics & Iteration

Track these metrics after release:

- **Watch Time**: Aim for >50% average
- **Engagement**: Likes, comments, shares
- **Click-Through Rate**: >5% from thumbnails
- **Drop-Off Points**: Where viewers leave
- **Traffic Sources**: YouTube search, external, etc.

**Iterate based on feedback**:
- Update tutorials if UI changes
- Add advanced tutorials based on requests
- Improve based on common questions

---

## Distribution Channels

1. **YouTube** (Primary)
2. **GitHub README** (Embed playlist)
3. **Documentation** (Link from Getting Started)
4. **Twitter** (Share clips)
5. **Reddit** (r/algotrading, r/typescript)
6. **Discord** (Community server)
7. **Dev.to** (Blog post with embedded videos)

---

**Last Updated**: November 8, 2025

**Total Tutorials**: 5 (+ 5 advanced planned)

**Total Runtime**: ~60 minutes

**Production Status**: Scripts ready for filming
