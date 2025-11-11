import {
  type TechnicalIndicatorResults,
  TechnicalIndicators,
} from "../analysis/technical-indicators.js";
import type { HistoricalData, Signal } from "../types/trading.js";

export interface MeanReversionConfig {
  rsiOversold: number; // Default: 30
  rsiOverbought: number; // Default: 70
  mfiOversold: number; // Default: 20
  mfiOverbought: number; // Default: 80
  bbStdDev: number; // Default: 2
  minConfidence: number; // Default: 60
  volumeThreshold: number; // Default: 1.2 (20% above average)
  maxHoldingPeriod: number; // Maximum days to hold position
}

interface PartialSignal {
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  strategy: string;
  reasons: string[];
  confidence?: number;
}

export class MeanReversionStrategy {
  private readonly name = "MEAN_REVERSION";

  constructor(private config: MeanReversionConfig) {
    this.validateConfig();
  }

  private validateConfig(): void {
    const { rsiOversold, rsiOverbought, mfiOversold, mfiOverbought, minConfidence } = this.config;

    if (rsiOversold >= rsiOverbought) {
      throw new Error("RSI oversold threshold must be less than overbought threshold");
    }
    if (mfiOversold >= mfiOverbought) {
      throw new Error("MFI oversold threshold must be less than overbought threshold");
    }
    if (minConfidence < 0 || minConfidence > 100) {
      throw new Error("Minimum confidence must be between 0 and 100");
    }
  }

  async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> {
    if (historicalData.length < 50) {
      throw new Error("Insufficient historical data for analysis (minimum 50 periods required)");
    }

    const priceData = this.convertToPriceData(historicalData);
    const indicators = await TechnicalIndicators.calculate(priceData);
    const currentPrice = historicalData[0]?.close || 0;

    const partialSignals = this.generatePartialSignals(indicators, currentPrice, historicalData);
    const finalSignal = this.combineSignals(symbol, partialSignals, indicators, currentPrice);

    return finalSignal;
  }

  private convertToPriceData(data: HistoricalData[]) {
    // Reverse data to have oldest first (required by technical indicators library)
    const reversedData = [...data].reverse();

    return {
      open: reversedData.map((d) => d.open),
      high: reversedData.map((d) => d.high),
      low: reversedData.map((d) => d.low),
      close: reversedData.map((d) => d.close),
      volume: reversedData.map((d) => d.volume),
    };
  }

  private generatePartialSignals(
    indicators: TechnicalIndicatorResults,
    currentPrice: number,
    historicalData: HistoricalData[],
  ): PartialSignal[] {
    const signals: PartialSignal[] = [];

    // RSI Mean Reversion Signals
    signals.push(...this.analyzeRSI(indicators.rsi));

    // MFI Mean Reversion Signals
    signals.push(...this.analyzeMFI(indicators.mfi));

    // Bollinger Bands Mean Reversion
    signals.push(...this.analyzeBollingerBands(indicators.bollingerBands, currentPrice));

    // Volume Confirmation
    this.applyVolumeConfirmation(signals, indicators.volumeProfile);

    // Stochastic Oscillator
    signals.push(...this.analyzeStochastic(indicators.stochastic));

    // Williams %R
    signals.push(...this.analyzeWilliamsR(indicators.williamsR));

    return signals;
  }

  private analyzeRSI(rsi: number): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (rsi < this.config.rsiOversold) {
      const oversoldIntensity = (this.config.rsiOversold - rsi) / this.config.rsiOversold;
      signals.push({
        action: "BUY",
        strength: Math.min(oversoldIntensity * 100, 100),
        strategy: "RSI_OVERSOLD",
        reasons: [
          `RSI at ${rsi.toFixed(2)}, below oversold threshold of ${this.config.rsiOversold}`,
        ],
      });
    } else if (rsi > this.config.rsiOverbought) {
      const overboughtIntensity =
        (rsi - this.config.rsiOverbought) / (100 - this.config.rsiOverbought);
      signals.push({
        action: "SELL",
        strength: Math.min(overboughtIntensity * 100, 100),
        strategy: "RSI_OVERBOUGHT",
        reasons: [
          `RSI at ${rsi.toFixed(2)}, above overbought threshold of ${this.config.rsiOverbought}`,
        ],
      });
    }

    return signals;
  }

  private analyzeMFI(mfi: number): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (mfi < this.config.mfiOversold) {
      const oversoldIntensity = (this.config.mfiOversold - mfi) / this.config.mfiOversold;
      signals.push({
        action: "BUY",
        strength: Math.min(oversoldIntensity * 100, 100),
        strategy: "MFI_OVERSOLD",
        reasons: [`MFI at ${mfi.toFixed(2)}, indicating oversold with low money flow pressure`],
      });
    } else if (mfi > this.config.mfiOverbought) {
      const overboughtIntensity =
        (mfi - this.config.mfiOverbought) / (100 - this.config.mfiOverbought);
      signals.push({
        action: "SELL",
        strength: Math.min(overboughtIntensity * 100, 100),
        strategy: "MFI_OVERBOUGHT",
        reasons: [`MFI at ${mfi.toFixed(2)}, indicating overbought with high money flow pressure`],
      });
    }

    return signals;
  }

  private analyzeBollingerBands(
    bb: { upper: number; middle: number; lower: number },
    currentPrice: number,
  ): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (currentPrice < bb.lower) {
      const deviation = ((bb.lower - currentPrice) / currentPrice) * 100;
      signals.push({
        action: "BUY",
        strength: Math.min(deviation * 10, 100),
        strategy: "BB_LOWER_BREACH",
        reasons: [
          `Price ${deviation.toFixed(2)}% below lower Bollinger Band at $${bb.lower.toFixed(2)}`,
        ],
      });
    } else if (currentPrice > bb.upper) {
      const deviation = ((currentPrice - bb.upper) / currentPrice) * 100;
      signals.push({
        action: "SELL",
        strength: Math.min(deviation * 10, 100),
        strategy: "BB_UPPER_BREACH",
        reasons: [
          `Price ${deviation.toFixed(2)}% above upper Bollinger Band at $${bb.upper.toFixed(2)}`,
        ],
      });
    }

    // Additional signal for mean reversion to middle band
    const distanceFromMiddle = Math.abs(currentPrice - bb.middle) / bb.middle;
    if (distanceFromMiddle > 0.05) {
      // More than 5% from middle band
      const revertAction = currentPrice > bb.middle ? "SELL" : "BUY";
      signals.push({
        action: revertAction,
        strength: Math.min(distanceFromMiddle * 200, 50), // Lower strength for mean reversion
        strategy: "BB_MEAN_REVERSION",
        reasons: [
          `Price ${(distanceFromMiddle * 100).toFixed(1)}% from Bollinger middle band, potential reversion`,
        ],
      });
    }

    return signals;
  }

  private analyzeStochastic(stoch: { k: number; d: number }): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (stoch.k < 20 && stoch.d < 20) {
      signals.push({
        action: "BUY",
        strength: (20 - Math.min(stoch.k, stoch.d)) * 4, // Scale to 0-80
        strategy: "STOCH_OVERSOLD",
        reasons: [`Stochastic oversold: %K=${stoch.k.toFixed(1)}, %D=${stoch.d.toFixed(1)}`],
      });
    } else if (stoch.k > 80 && stoch.d > 80) {
      signals.push({
        action: "SELL",
        strength: (Math.min(stoch.k, stoch.d) - 80) * 4, // Scale to 0-80
        strategy: "STOCH_OVERBOUGHT",
        reasons: [`Stochastic overbought: %K=${stoch.k.toFixed(1)}, %D=${stoch.d.toFixed(1)}`],
      });
    }

    // Stochastic crossover signals
    if (stoch.k > stoch.d && stoch.k < 30) {
      signals.push({
        action: "BUY",
        strength: 40,
        strategy: "STOCH_BULLISH_CROSSOVER",
        reasons: ["Stochastic %K crossed above %D in oversold territory"],
      });
    } else if (stoch.k < stoch.d && stoch.k > 70) {
      signals.push({
        action: "SELL",
        strength: 40,
        strategy: "STOCH_BEARISH_CROSSOVER",
        reasons: ["Stochastic %K crossed below %D in overbought territory"],
      });
    }

    return signals;
  }

  private analyzeWilliamsR(williamsR: number): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (williamsR < -80) {
      signals.push({
        action: "BUY",
        strength: Math.abs(williamsR + 80) * 5, // Scale appropriately
        strategy: "WILLIAMS_R_OVERSOLD",
        reasons: [`Williams %R oversold at ${williamsR.toFixed(1)}`],
      });
    } else if (williamsR > -20) {
      signals.push({
        action: "SELL",
        strength: (20 + williamsR) * 5, // Scale appropriately
        strategy: "WILLIAMS_R_OVERBOUGHT",
        reasons: [`Williams %R overbought at ${williamsR.toFixed(1)}`],
      });
    }

    return signals;
  }

  private applyVolumeConfirmation(
    signals: PartialSignal[],
    volumeProfile: { volumeRatio: number; volumeTrend: string },
  ): void {
    const volumeMultiplier = volumeProfile.volumeRatio >= this.config.volumeThreshold ? 1.2 : 0.9;

    signals.forEach((signal) => {
      signal.strength *= volumeMultiplier;
      if (volumeProfile.volumeRatio >= this.config.volumeThreshold) {
        signal.reasons.push(
          `Volume confirmation: ${(volumeProfile.volumeRatio * 100).toFixed(0)}% of average`,
        );
      } else if (volumeProfile.volumeRatio < 0.8) {
        signal.reasons.push(
          `Low volume warning: ${(volumeProfile.volumeRatio * 100).toFixed(0)}% of average`,
        );
      }
    });
  }

  private combineSignals(
    symbol: string,
    partialSignals: PartialSignal[],
    indicators: TechnicalIndicatorResults,
    currentPrice: number,
  ): Signal {
    if (partialSignals.length === 0) {
      return this.createHoldSignal(symbol, indicators, "No mean reversion signals detected");
    }

    // Group signals by action
    const buySignals = partialSignals.filter((s) => s.action === "BUY");
    const sellSignals = partialSignals.filter((s) => s.action === "SELL");

    // Determine dominant signal direction
    let finalAction: "BUY" | "SELL" | "HOLD" = "HOLD";
    let relevantSignals: PartialSignal[] = [];

    if (buySignals.length > sellSignals.length) {
      finalAction = "BUY";
      relevantSignals = buySignals;
    } else if (sellSignals.length > buySignals.length) {
      finalAction = "SELL";
      relevantSignals = sellSignals;
    } else if (buySignals.length > 0 && sellSignals.length > 0) {
      // Equal number of buy/sell signals - choose stronger ones
      const buyStrength = buySignals.reduce((sum, s) => sum + s.strength, 0) / buySignals.length;
      const sellStrength = sellSignals.reduce((sum, s) => sum + s.strength, 0) / sellSignals.length;

      if (buyStrength > sellStrength) {
        finalAction = "BUY";
        relevantSignals = buySignals;
      } else {
        finalAction = "SELL";
        relevantSignals = sellSignals;
      }
    }

    if (relevantSignals.length === 0) {
      return this.createHoldSignal(symbol, indicators, "Conflicting signals detected");
    }

    // Calculate combined metrics
    const avgStrength =
      relevantSignals.reduce((sum, s) => sum + s.strength, 0) / relevantSignals.length;
    const confidence = this.calculateConfidence(relevantSignals, indicators);
    const allReasons = relevantSignals.flatMap((s) => s.reasons);
    const strategyNames = [...new Set(relevantSignals.map((s) => s.strategy))].join("+");

    // Apply minimum confidence threshold
    if (confidence < this.config.minConfidence) {
      return this.createHoldSignal(
        symbol,
        indicators,
        `Confidence ${confidence.toFixed(1)}% below minimum threshold of ${this.config.minConfidence}%`,
      );
    }

    return {
      symbol,
      action: finalAction,
      strength: Math.min(avgStrength, 100),
      strategy: `${this.name}_${strategyNames}`,
      indicators,
      confidence,
      reasons: allReasons,
      timestamp: new Date(),
      entryPrice: currentPrice,
    };
  }

  private calculateConfidence(
    signals: PartialSignal[],
    indicators: TechnicalIndicatorResults,
  ): number {
    let confidence = 0;

    // Base confidence from number of confirming signals
    confidence += signals.length * 15; // 15 points per confirming signal

    // Bonus for signal strength
    const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    confidence += avgStrength * 0.3;

    // Volume confirmation bonus
    if (indicators.volumeProfile.volumeRatio >= this.config.volumeThreshold) {
      confidence += 10;
    }

    // Market regime adjustment
    const regime = indicators.marketRegime;
    if (regime.type === "SIDEWAYS" || regime.type === "VOLATILE") {
      // Mean reversion works best in sideways/volatile markets
      confidence += regime.strength * 0.2;
    } else if (regime.type === "BULLISH_TREND" || regime.type === "BEARISH_TREND") {
      // Reduce confidence in strong trending markets
      confidence -= regime.trendStrength * 0.15;
    }

    // Trend alignment bonus (if multiple timeframes agree)
    const trendAlignment = this.checkTrendAlignment(indicators);
    confidence += trendAlignment * 5;

    // Penalize conflicting signals
    const hasConflictingSignals =
      signals.some((s) => s.action === "BUY") && signals.some((s) => s.action === "SELL");
    if (hasConflictingSignals) {
      confidence -= 20;
    }

    return Math.min(Math.max(confidence, 0), 100);
  }

  private checkTrendAlignment(indicators: TechnicalIndicatorResults): number {
    let alignment = 0;

    // Check if short-term and medium-term trends align
    if (indicators.sma.short > indicators.sma.medium) alignment += 1;
    if (indicators.ema.short > indicators.ema.long) alignment += 1;
    if (indicators.macd.MACD > indicators.macd.signal) alignment += 1;

    return alignment;
  }

  private createHoldSignal(
    symbol: string,
    indicators: TechnicalIndicatorResults,
    reason: string,
  ): Signal {
    return {
      symbol,
      action: "HOLD",
      strength: 0,
      strategy: `${this.name}_NO_SIGNAL`,
      indicators,
      confidence: 0,
      reasons: [reason],
      timestamp: new Date(),
    };
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return "Mean reversion strategy using RSI, MFI, and Bollinger Bands";
  }

  getConfig(): MeanReversionConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<MeanReversionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }
}
