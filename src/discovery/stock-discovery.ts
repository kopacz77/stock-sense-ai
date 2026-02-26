import { MarketDataService } from "../data/market-data-service.js";
import { MeanReversionStrategy } from "../strategies/mean-reversion-strategy.js";
import { RiskManager } from "../analysis/risk-manager.js";
import type { Signal } from "../types/trading.js";

export interface DiscoveryConfig {
  minConfidence: number;
  maxResults: number;
  excludeSymbols?: string[];
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
}

export interface DiscoveryResult {
  symbol: string;
  signal: Signal;
  currentPrice: number;
  volume: number;
  marketCap?: number;
  sector?: string;
  discoveryReason: string;
}

export class StockDiscovery {
  private marketData = new MarketDataService();
  private meanReversionStrategy = new MeanReversionStrategy({
    rsiOversold: 30,
    rsiOverbought: 70,
    mfiOversold: 20,
    mfiOverbought: 80,
    bbStdDev: 2,
    minConfidence: 60,
    volumeThreshold: 1.2,
    maxHoldingPeriod: 10,
  });
  private riskManager = new RiskManager();

  // Market overview cache (10 minutes TTL - reduces API calls dramatically)
  private marketOverviewCache: {
    data: {
      totalAnalyzed: number;
      successfullyAnalyzed: number;
      bullishSignals: number;
      bearishSignals: number;
      topSectors: Array<{ sector: string; signalCount: number }>;
      marketSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
      analyzedSymbols: string[];
      skippedSymbols: string[];
    } | null;
    timestamp: number;
  } = { data: null, timestamp: 0 };
  private readonly MARKET_OVERVIEW_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // S&P 500 symbols (comprehensive list for maximum opportunity discovery)
  private readonly SP500_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "UNH", "JNJ",
    "XOM", "JPM", "V", "PG", "AVGO", "HD", "CVX", "MA", "PFE", "ABBV",
    "BAC", "COST", "DIS", "KO", "WMT", "CRM", "ADBE", "PEP", "TMO", "NFLX",
    "ABT", "ACN", "CSCO", "VZ", "DHR", "INTC", "TXN", "QCOM", "WFC", "CMCSA",
    "NEE", "RTX", "AMD", "HON", "UPS", "LOW", "AMGN", "SPGI", "INTU", "CAT",
    "IBM", "GS", "CVS", "AMAT", "DE", "MDT", "AXP", "BKNG", "GILD", "LMT",
    "MO", "SYK", "TJX", "BLK", "SBUX", "ISRG", "CI", "NOW", "MDLZ", "CB",
    "MMM", "PYPL", "SO", "ZTS", "REGN", "SCHW", "PLD", "ADI", "LRCX", "MU",
    "DUK", "AON", "CL", "BSX", "EQIX", "ITW", "APD", "EL", "NSC", "SHW",
    "CME", "ICE", "USB", "PNC", "FCX", "GM", "D", "GD", "F", "EMR",
    // Additional high-opportunity stocks
    "ROKU", "SNAP", "SQ", "SHOP", "ZOOM", "UBER", "LYFT", "PINS", "TWTR", "SPOT",
    "PLTR", "COIN", "RBLX", "HOOD", "SOFI", "UPST", "AFRM", "DKNG", "CHPT", "LCID",
    "RIVN", "MRNA", "BNTX", "ZM", "PTON", "ARKK", "TQQQ", "SQQQ", "SPY", "QQQ"
  ];

  // Sector groupings - comprehensive for maximum revenue opportunities
  private readonly SECTORS = {
    TECHNOLOGY: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "ADBE", "CRM", "INTC", "AMD", "QCOM", "AMAT", "ADI", "LRCX", "MU", "NOW", "PLTR", "ROKU", "SNAP", "SQ", "SHOP", "ZOOM", "UBER"],
    HEALTHCARE: ["JNJ", "PFE", "ABBV", "TMO", "ABT", "DHR", "AMGN", "GILD", "MDT", "SYK", "ISRG", "REGN", "ZTS", "BSX", "MRNA", "BNTX"],
    FINANCE: ["JPM", "V", "MA", "BAC", "WFC", "GS", "AXP", "BLK", "SCHW", "SPGI", "CME", "ICE", "USB", "PNC", "COIN", "HOOD", "SOFI"],
    CONSUMER: ["AMZN", "HD", "COST", "DIS", "WMT", "PG", "KO", "PEP", "LOW", "TJX", "SBUX", "MDLZ", "NFLX", "LYFT", "PINS", "SPOT", "RBLX"],
    ENERGY: ["XOM", "CVX", "NEE", "SO", "DUK", "D", "FCX"],
    INDUSTRIAL: ["CAT", "RTX", "HON", "UPS", "LMT", "MMM", "ITW", "APD", "NSC", "GD", "EMR", "GM", "F"],
    GROWTH: ["TSLA", "ARKK", "TQQQ", "UPST", "AFRM", "DKNG", "CHPT", "LCID", "RIVN", "PTON"], // High-growth opportunities
  };

  async discoverByMarket(market: "SP500" | "NASDAQ" | "DOW", config: DiscoveryConfig): Promise<DiscoveryResult[]> {
    let symbols: string[] = [];

    switch (market) {
      case "SP500":
        symbols = this.SP500_SYMBOLS;
        break;
      case "NASDAQ":
        // Top NASDAQ stocks
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "NFLX", "ADBE", "INTC"];
        break;
      case "DOW":
        // Dow Jones components
        symbols = ["AAPL", "MSFT", "UNH", "JNJ", "V", "WMT", "PG", "JPM", "HD", "CVX"];
        break;
    }

    return this.analyzeSymbolList(symbols, config, `${market} screening`);
  }

  async discoverBySector(sector: keyof typeof this.SECTORS, config: DiscoveryConfig): Promise<DiscoveryResult[]> {
    const symbols = this.SECTORS[sector];
    if (!symbols) {
      throw new Error(`Unknown sector: ${sector}`);
    }

    return this.analyzeSymbolList(symbols, config, `${sector} sector screening`);
  }

  async discoverTrending(config: DiscoveryConfig): Promise<DiscoveryResult[]> {
    // Focus on high-volume, volatile stocks that are good for mean reversion and momentum
    const trendingSymbols = [
      "TSLA", "AMD", "NVDA", "META", "NFLX", "AMZN", "GOOGL", "AAPL", "MSFT",
      "CRM", "ADBE", "PYPL", "SQ", "ROKU", "ZM", "PTON", "SNAP", "UBER",
      "PLTR", "COIN", "RBLX", "HOOD", "SOFI", "UPST", "AFRM", "DKNG", "SHOP",
      "ARKK", "TQQQ", "SQQQ", "SPY", "QQQ", "MRNA", "BNTX", "LCID", "RIVN"
    ];

    return this.analyzeSymbolList(trendingSymbols, config, "trending stocks screening");
  }

  async discoverHighRevenue(config: DiscoveryConfig): Promise<DiscoveryResult[]> {
    // Revenue-focused: High volatility, high opportunity stocks
    const revenueSymbols = [
      // High-growth tech
      "TSLA", "NVDA", "AMD", "PLTR", "ROKU", "SQ", "SHOP", "ZOOM", "UBER",
      // Volatile large caps (big moves = big profits)
      "NFLX", "META", "AMZN", "GOOGL", "AAPL", "MSFT", "CRM", "ADBE",
      // Crypto/fintech (high volatility)
      "COIN", "HOOD", "SOFI", "UPST", "AFRM", "PLTR", "SQ",
      // Growth ETFs and momentum plays
      "ARKK", "TQQQ", "SQQQ", "QQQ", "SPY",
      // Biotech (high reward potential)
      "MRNA", "BNTX", "REGN", "ISRG", "TMO",
      // Gaming/social (trend plays)
      "RBLX", "SNAP", "PINS", "SPOT", "DKNG"
    ];

    return this.analyzeSymbolList(revenueSymbols, config, "high-revenue opportunity screening");
  }

  async discoverCustom(symbols: string[], config: DiscoveryConfig): Promise<DiscoveryResult[]> {
    return this.analyzeSymbolList(symbols, config, "custom list screening");
  }

  private async analyzeSymbolList(
    symbols: string[],
    config: DiscoveryConfig,
    discoveryReason: string
  ): Promise<DiscoveryResult[]> {
    const results: DiscoveryResult[] = [];
    const filteredSymbols = symbols.filter(s => !config.excludeSymbols?.includes(s));

    for (const symbol of filteredSymbols) {
      try {
        const analysisData = await this.marketData.getFullAnalysisData(symbol);
        const quote = analysisData.quote;

        // Apply basic filters
        if (config.minPrice && quote.price < config.minPrice) continue;
        if (config.maxPrice && quote.price > config.maxPrice) continue;
        if (config.minVolume && quote.volume < config.minVolume) continue;

        // Analyze with strategy
        const signal = await this.meanReversionStrategy.analyze(symbol, analysisData.historical);

        // Check if signal meets confidence threshold
        if (signal.confidence >= config.minConfidence && signal.action !== "HOLD") {
          // Apply risk management
          const riskCalc = await this.riskManager.calculatePosition({
            symbol,
            entryPrice: signal.entryPrice || quote.price,
            signal,
            accountBalance: 100000, // Default paper trading balance
            atr: signal.indicators.atr,
          });

          signal.stopLoss = riskCalc.stopLoss;
          signal.takeProfit = riskCalc.takeProfit;
          signal.positionSize = riskCalc.positionSize;
          signal.riskAmount = riskCalc.riskAmount;

          results.push({
            symbol,
            signal,
            currentPrice: quote.price,
            volume: quote.volume,
            marketCap: undefined, // Not available in current MarketData interface
            sector: this.getSectorForSymbol(symbol),
            discoveryReason,
          });
        }

        // Rate limiting between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Stop if we have enough results OR if we're hitting too many API limits
        if (results.length >= config.maxResults) break;
        
        // Also stop if we've tried 30 stocks and got less than 5 results (API issues)
        if (filteredSymbols.indexOf(symbol) > 30 && results.length < 5) {
          console.log("⚠️ Stopping scan due to API issues, but found some opportunities");
          break;
        }

      } catch (error) {
        console.warn(`Failed to analyze ${symbol}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Sort by confidence and return top results
    return results
      .sort((a, b) => b.signal.confidence - a.signal.confidence)
      .slice(0, config.maxResults);
  }

  private getSectorForSymbol(symbol: string): string | undefined {
    for (const [sector, symbols] of Object.entries(this.SECTORS)) {
      if (symbols.includes(symbol)) {
        return sector;
      }
    }
    return undefined;
  }

  async getMarketOverview(): Promise<{
    totalAnalyzed: number;
    successfullyAnalyzed: number;
    bullishSignals: number;
    bearishSignals: number;
    topSectors: Array<{ sector: string; signalCount: number }>;
    marketSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    analyzedSymbols: string[];
    skippedSymbols: string[];
  }> {
    // Return cached data if still valid (10 minute TTL)
    if (
      this.marketOverviewCache.data &&
      Date.now() - this.marketOverviewCache.timestamp < this.MARKET_OVERVIEW_CACHE_TTL
    ) {
      return this.marketOverviewCache.data;
    }

    // Analyze top 5 S&P 500 stocks by market cap for market sentiment
    // These mega-caps represent ~25% of S&P 500 and are reliable market indicators
    // AAPL, MSFT, GOOGL, AMZN, NVDA - saves API calls while still providing useful signal
    const sampleSymbols = this.SP500_SYMBOLS.slice(0, 5);
    let bullishCount = 0;
    let bearishCount = 0;
    const sectorSignals: Record<string, number> = {};
    const analyzedSymbols: string[] = [];
    const skippedSymbols: string[] = [];

    for (const symbol of sampleSymbols) {
      try {
        const analysisData = await this.marketData.getFullAnalysisData(symbol);
        const signal = await this.meanReversionStrategy.analyze(symbol, analysisData.historical);
        analyzedSymbols.push(symbol);

        if (signal.confidence > 60) {
          if (signal.action === "BUY") bullishCount++;
          if (signal.action === "SELL") bearishCount++;

          const sector = this.getSectorForSymbol(symbol);
          if (sector) {
            sectorSignals[sector] = (sectorSignals[sector] || 0) + 1;
          }
        }

        // Reduced delay since we're using cached data
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        skippedSymbols.push(symbol);
      }
    }

    const topSectors = Object.entries(sectorSignals)
      .map(([sector, count]) => ({ sector, signalCount: count }))
      .sort((a, b) => b.signalCount - a.signalCount)
      .slice(0, 5);

    let marketSentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (bullishCount > bearishCount * 1.5) marketSentiment = "BULLISH";
    else if (bearishCount > bullishCount * 1.5) marketSentiment = "BEARISH";

    const result = {
      totalAnalyzed: sampleSymbols.length,
      successfullyAnalyzed: analyzedSymbols.length,
      bullishSignals: bullishCount,
      bearishSignals: bearishCount,
      topSectors,
      marketSentiment,
      analyzedSymbols,
      skippedSymbols,
    };

    // Cache the result
    this.marketOverviewCache = { data: result, timestamp: Date.now() };

    return result;
  }
}