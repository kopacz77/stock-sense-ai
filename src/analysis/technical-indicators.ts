import {
  ATR,
  BollingerBands,
  CCI,
  EMA,
  MACD,
  MFI,
  RSI,
  SMA,
  Stochastic,
  WilliamsR,
} from "technicalindicators";

export interface PriceData {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface MarketRegime {
  type: "BULLISH_TREND" | "BEARISH_TREND" | "SIDEWAYS" | "VOLATILE";
  strength: number; // 0-100
  volatility: "LOW" | "MEDIUM" | "HIGH";
  trendStrength: number; // 0-100
  confidence: number; // 0-100
}

export interface TechnicalIndicatorResults {
  rsi: number;
  mfi: number;
  macd: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  sma: {
    short: number; // 20-period
    medium: number; // 50-period
    long: number; // 200-period
  };
  ema: {
    short: number; // 12-period
    long: number; // 26-period
  };
  atr: number;
  stochastic: {
    k: number;
    d: number;
  };
  cci: number;
  williamsR: number;
  volumeProfile: {
    averageVolume: number;
    volumeRatio: number; // Current vs average
    volumeTrend: "increasing" | "decreasing" | "stable";
  };
  marketRegime: MarketRegime;
}

export class TechnicalIndicators {
  static async calculate(data: PriceData): Promise<TechnicalIndicatorResults> {
    if (!this.validateData(data)) {
      throw new Error("Invalid price data provided");
    }

    const [
      rsiResult,
      mfiResult,
      macdResult,
      bbResult,
      sma20,
      sma50,
      sma200,
      ema12,
      ema26,
      atrResult,
      stochResult,
      cciResult,
      williamsRResult,
    ] = await Promise.all([
      this.calculateRSI(data.close),
      this.calculateMFI(data),
      this.calculateMACD(data.close),
      this.calculateBollingerBands(data.close),
      this.calculateSMA(data.close, 20),
      this.calculateSMA(data.close, 50),
      this.calculateSMA(data.close, 200),
      this.calculateEMA(data.close, 12),
      this.calculateEMA(data.close, 26),
      this.calculateATR(data),
      this.calculateStochastic(data),
      this.calculateCCI(data),
      this.calculateWilliamsR(data),
    ]);

    const volumeProfile = this.calculateVolumeProfile(data.volume);
    const marketRegime = this.detectMarketRegime({
      rsi: rsiResult,
      mfi: mfiResult,
      macd: macdResult,
      bollingerBands: bbResult,
      sma: { short: sma20, medium: sma50, long: sma200 },
      ema: { short: ema12, long: ema26 },
      atr: atrResult,
      stochastic: stochResult,
      cci: cciResult,
      williamsR: williamsRResult,
      volumeProfile,
    } as any, data);

    return {
      rsi: rsiResult,
      mfi: mfiResult,
      macd: macdResult,
      bollingerBands: bbResult,
      sma: {
        short: sma20,
        medium: sma50,
        long: sma200,
      },
      ema: {
        short: ema12,
        long: ema26,
      },
      atr: atrResult,
      stochastic: stochResult,
      cci: cciResult,
      williamsR: williamsRResult,
      volumeProfile,
      marketRegime,
    };
  }

  private static validateData(data: PriceData): boolean {
    const { open, high, low, close, volume } = data;

    if (
      !Array.isArray(open) ||
      !Array.isArray(high) ||
      !Array.isArray(low) ||
      !Array.isArray(close) ||
      !Array.isArray(volume)
    ) {
      return false;
    }

    if (
      open.length !== high.length ||
      high.length !== low.length ||
      low.length !== close.length ||
      close.length !== volume.length
    ) {
      return false;
    }

    if (open.length < 50) {
      // Need at least 50 data points for reliable calculations
      return false;
    }

    return true;
  }

  private static async calculateRSI(closes: number[], period = 14): Promise<number> {
    const rsiValues = RSI.calculate({ values: closes, period });
    return rsiValues[rsiValues.length - 1] || 50; // Default to neutral if no data
  }

  private static async calculateMFI(data: PriceData, period = 14): Promise<number> {
    const mfiInput = {
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      period,
    };

    const mfiValues = MFI.calculate(mfiInput);
    return mfiValues[mfiValues.length - 1] || 50;
  }

  private static async calculateMACD(closes: number[]): Promise<{
    MACD: number;
    signal: number;
    histogram: number;
  }> {
    const macdInput = {
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    };

    const macdValues = MACD.calculate(macdInput);
    const latest = macdValues[macdValues.length - 1];

    return {
      MACD: latest?.MACD || 0,
      signal: latest?.signal || 0,
      histogram: latest?.histogram || 0,
    };
  }

  private static async calculateBollingerBands(
    closes: number[],
    period = 20,
    stdDev = 2,
  ): Promise<{
    upper: number;
    middle: number;
    lower: number;
  }> {
    const bbInput = {
      values: closes,
      period,
      stdDev,
    };

    const bbValues = BollingerBands.calculate(bbInput);
    const latest = bbValues[bbValues.length - 1];

    return {
      upper: latest?.upper || closes[0] || 0,
      middle: latest?.middle || closes[0] || 0,
      lower: latest?.lower || closes[0] || 0,
    };
  }

  private static async calculateSMA(closes: number[], period: number): Promise<number> {
    const smaValues = SMA.calculate({ values: closes, period });
    return smaValues[smaValues.length - 1] || closes[0] || 0;
  }

  private static async calculateEMA(closes: number[], period: number): Promise<number> {
    const emaValues = EMA.calculate({ values: closes, period });
    return emaValues[emaValues.length - 1] || closes[0] || 0;
  }

  private static async calculateATR(data: PriceData, period = 14): Promise<number> {
    const atrInput = {
      high: data.high,
      low: data.low,
      close: data.close,
      period,
    };

    const atrValues = ATR.calculate(atrInput);
    return atrValues[atrValues.length - 1] || 1.0; // Default to 1.0 if no data
  }

  private static async calculateStochastic(
    data: PriceData,
    kPeriod = 14,
    dPeriod = 3,
  ): Promise<{
    k: number;
    d: number;
  }> {
    const stochInput = {
      high: data.high,
      low: data.low,
      close: data.close,
      period: kPeriod,
      signalPeriod: dPeriod,
    };

    const stochValues = Stochastic.calculate(stochInput);
    const latest = stochValues[stochValues.length - 1];

    return {
      k: latest?.k || 50,
      d: latest?.d || 50,
    };
  }

  private static async calculateCCI(data: PriceData, period = 14): Promise<number> {
    const cciInput = {
      high: data.high,
      low: data.low,
      close: data.close,
      period,
    };

    const cciValues = CCI.calculate(cciInput);
    return cciValues[cciValues.length - 1] || 0;
  }

  private static async calculateWilliamsR(data: PriceData, period = 14): Promise<number> {
    const wrInput = {
      high: data.high,
      low: data.low,
      close: data.close,
      period,
    };

    const wrValues = WilliamsR.calculate(wrInput);
    return wrValues[wrValues.length - 1] || -50;
  }

  private static calculateVolumeProfile(volumes: number[]): {
    averageVolume: number;
    volumeRatio: number;
    volumeTrend: "increasing" | "decreasing" | "stable";
  } {
    if (volumes.length < 20) {
      return {
        averageVolume: volumes[0] || 0,
        volumeRatio: 1,
        volumeTrend: "stable",
      };
    }

    const recentVolumes = volumes.slice(0, 20); // Last 20 periods
    const averageVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const currentVolume = volumes[0] || 0;
    const volumeRatio = currentVolume / averageVolume;

    // Determine trend by comparing first 10 vs last 10 periods
    const firstHalf = recentVolumes.slice(0, 10);
    const secondHalf = recentVolumes.slice(10, 20);
    const firstAvg = firstHalf.reduce((sum, vol) => sum + vol, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, vol) => sum + vol, 0) / secondHalf.length;

    let volumeTrend: "increasing" | "decreasing" | "stable" = "stable";
    const trendThreshold = 0.1; // 10% threshold for trend determination

    if (firstAvg > secondAvg * (1 + trendThreshold)) {
      volumeTrend = "increasing";
    } else if (firstAvg < secondAvg * (1 - trendThreshold)) {
      volumeTrend = "decreasing";
    }

    return {
      averageVolume,
      volumeRatio,
      volumeTrend,
    };
  }

  static getIndicatorInterpretation(indicators: TechnicalIndicatorResults): {
    bullishSignals: string[];
    bearishSignals: string[];
    neutralSignals: string[];
  } {
    const bullishSignals: string[] = [];
    const bearishSignals: string[] = [];
    const neutralSignals: string[] = [];

    // RSI analysis
    if (indicators.rsi < 30) {
      bullishSignals.push(`RSI oversold at ${indicators.rsi.toFixed(1)}`);
    } else if (indicators.rsi > 70) {
      bearishSignals.push(`RSI overbought at ${indicators.rsi.toFixed(1)}`);
    } else {
      neutralSignals.push(`RSI neutral at ${indicators.rsi.toFixed(1)}`);
    }

    // MACD analysis
    if (indicators.macd.histogram > 0 && indicators.macd.MACD > indicators.macd.signal) {
      bullishSignals.push("MACD bullish crossover");
    } else if (indicators.macd.histogram < 0 && indicators.macd.MACD < indicators.macd.signal) {
      bearishSignals.push("MACD bearish crossover");
    }

    // Moving averages
    if (
      indicators.sma.short > indicators.sma.medium &&
      indicators.sma.medium > indicators.sma.long
    ) {
      bullishSignals.push("Bullish moving average alignment");
    } else if (
      indicators.sma.short < indicators.sma.medium &&
      indicators.sma.medium < indicators.sma.long
    ) {
      bearishSignals.push("Bearish moving average alignment");
    }

    // Volume analysis
    if (
      indicators.volumeProfile.volumeRatio > 1.5 &&
      indicators.volumeProfile.volumeTrend === "increasing"
    ) {
      bullishSignals.push("Strong volume confirmation");
    } else if (indicators.volumeProfile.volumeRatio < 0.7) {
      neutralSignals.push("Low volume - lack of conviction");
    }

    return {
      bullishSignals,
      bearishSignals,
      neutralSignals,
    };
  }

  private static detectMarketRegime(indicators: any, data: PriceData): MarketRegime {
    const closes = data.close;
    const currentPrice = closes[0] || 0;
    
    // Calculate trend strength using moving averages
    const smaAlignment = this.calculateTrendAlignment(indicators.sma);
    const priceVsSMA = this.calculatePricePosition(currentPrice, indicators.sma);
    
    // Calculate volatility using ATR and Bollinger Band width
    const bbWidth = (indicators.bollingerBands.upper - indicators.bollingerBands.lower) / indicators.bollingerBands.middle;
    const atrPercent = indicators.atr / currentPrice;
    
    // Determine volatility level
    let volatility: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
    if (atrPercent < 0.02 && bbWidth < 0.1) {
      volatility = "LOW";
    } else if (atrPercent > 0.05 || bbWidth > 0.2) {
      volatility = "HIGH";
    }
    
    // Calculate trend strength (0-100)
    let trendStrength = Math.abs(smaAlignment) * 25; // Base from MA alignment
    trendStrength += Math.abs(priceVsSMA) * 25; // Add price position
    trendStrength += Math.abs(indicators.macd.histogram) * 10; // MACD momentum
    trendStrength = Math.min(trendStrength, 100);
    
    // Determine regime type
    let regimeType: "BULLISH_TREND" | "BEARISH_TREND" | "SIDEWAYS" | "VOLATILE";
    let strength = 0;
    
    if (volatility === "HIGH" && trendStrength < 40) {
      regimeType = "VOLATILE";
      strength = Math.min(atrPercent * 1000, 100);
    } else if (trendStrength < 30) {
      regimeType = "SIDEWAYS";
      strength = 100 - trendStrength;
    } else if (smaAlignment > 0 && priceVsSMA > 0) {
      regimeType = "BULLISH_TREND";
      strength = trendStrength;
    } else if (smaAlignment < 0 && priceVsSMA < 0) {
      regimeType = "BEARISH_TREND";
      strength = trendStrength;
    } else {
      regimeType = "SIDEWAYS";
      strength = 50;
    }
    
    // Calculate confidence based on signal consistency
    let confidence = 70; // Base confidence
    
    // Boost confidence for strong trends with volume confirmation
    if (trendStrength > 60 && indicators.volumeProfile.volumeRatio > 1.2) {
      confidence += 20;
    }
    
    // Reduce confidence for conflicting signals
    if (Math.abs(smaAlignment) < 0.5 && volatility === "HIGH") {
      confidence -= 20;
    }
    
    confidence = Math.min(Math.max(confidence, 0), 100);
    
    return {
      type: regimeType,
      strength: Math.round(strength),
      volatility,
      trendStrength: Math.round(trendStrength),
      confidence: Math.round(confidence),
    };
  }
  
  private static calculateTrendAlignment(sma: { short: number; medium: number; long: number }): number {
    // Returns -1 to 1, where 1 is perfect bullish alignment, -1 is perfect bearish
    let score = 0;
    
    if (sma.short > sma.medium) score += 0.5;
    else score -= 0.5;
    
    if (sma.medium > sma.long) score += 0.5;
    else score -= 0.5;
    
    return score;
  }
  
  private static calculatePricePosition(currentPrice: number, sma: { short: number; medium: number; long: number }): number {
    // Returns position relative to moving averages (-1 to 1)
    const avgSMA = (sma.short + sma.medium + sma.long) / 3;
    const deviation = (currentPrice - avgSMA) / avgSMA;
    
    // Normalize to -1 to 1 range
    return Math.max(-1, Math.min(1, deviation * 10));
  }
}
