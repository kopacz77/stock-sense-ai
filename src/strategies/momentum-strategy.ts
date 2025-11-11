import {
  type TechnicalIndicatorResults,
  TechnicalIndicators,
} from "../analysis/technical-indicators.js";
import type { HistoricalData, Signal } from "../types/trading.js";

export interface MomentumConfig {
  shortMA: number; // Default: 20
  longMA: number; // Default: 50
  macdFast: number; // Default: 12
  macdSlow: number; // Default: 26
  macdSignal: number; // Default: 9
  volumeThreshold: number; // Default: 1.5
  minConfidence: number; // Default: 65
  trendStrength: number; // Default: 0.02 (2%)
}

interface PartialSignal {
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  strategy: string;
  reasons: string[];
  confidence?: number;
}

export class MomentumStrategy {
  private readonly name = "MOMENTUM";

  constructor(private config: MomentumConfig) {
    this.validateConfig();
  }

  private validateConfig(): void {
    const { shortMA, longMA, macdFast, macdSlow, minConfidence } = this.config;

    if (shortMA >= longMA) {
      throw new Error("Short MA period must be less than long MA period");
    }
    if (macdFast >= macdSlow) {
      throw new Error("MACD fast period must be less than slow period");
    }
    if (minConfidence < 0 || minConfidence > 100) {
      throw new Error("Minimum confidence must be between 0 and 100");
    }
  }

  async analyze(symbol: string, historicalData: HistoricalData[]): Promise<Signal> {
    if (historicalData.length < Math.max(this.config.longMA, 50)) {
      throw new Error(
        `Insufficient historical data for analysis (minimum ${Math.max(this.config.longMA, 50)} periods required)`,
      );
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

    // Moving Average Crossover
    signals.push(...this.analyzeMovingAverages(indicators.sma, indicators.ema));

    // MACD Momentum
    signals.push(...this.analyzeMACD(indicators.macd));

    // Price momentum vs moving averages
    signals.push(...this.analyzePriceMomentum(currentPrice, indicators.sma));

    // Volume momentum confirmation
    this.applyVolumeConfirmation(signals, indicators.volumeProfile);

    // Trend strength analysis
    signals.push(...this.analyzeTrendStrength(historicalData));

    return signals;
  }

  private analyzeMovingAverages(
    sma: { short: number; medium: number; long: number },
    ema: { short: number; long: number },
  ): PartialSignal[] {
    const signals: PartialSignal[] = [];

    // SMA crossover signals
    if (sma.short > sma.medium && sma.medium > sma.long) {
      const strength = ((sma.short - sma.long) / sma.long) * 1000; // Scale for visibility
      signals.push({
        action: "BUY",
        strength: Math.min(strength, 100),
        strategy: "SMA_BULLISH_ALIGNMENT",
        reasons: [`Bullish MA alignment: ${this.config.shortMA}>${this.config.longMA}>200`],
      });
    } else if (sma.short < sma.medium && sma.medium < sma.long) {
      const strength = ((sma.long - sma.short) / sma.long) * 1000;
      signals.push({
        action: "SELL",
        strength: Math.min(strength, 100),
        strategy: "SMA_BEARISH_ALIGNMENT",
        reasons: [`Bearish MA alignment: ${this.config.shortMA}<${this.config.longMA}<200`],
      });
    }

    // EMA crossover
    if (ema.short > ema.long) {
      const crossoverStrength = ((ema.short - ema.long) / ema.long) * 1000;
      signals.push({
        action: "BUY",
        strength: Math.min(crossoverStrength * 50, 80), // Scale down for crossover
        strategy: "EMA_BULLISH_CROSSOVER",
        reasons: [`${this.config.macdFast}EMA crossed above ${this.config.macdSlow}EMA`],
      });
    } else {
      const crossoverStrength = ((ema.long - ema.short) / ema.long) * 1000;
      signals.push({
        action: "SELL",
        strength: Math.min(crossoverStrength * 50, 80),
        strategy: "EMA_BEARISH_CROSSOVER",
        reasons: [`${this.config.macdFast}EMA crossed below ${this.config.macdSlow}EMA`],
      });
    }

    return signals;
  }

  private analyzeMACD(macd: { MACD: number; signal: number; histogram: number }): PartialSignal[] {
    const signals: PartialSignal[] = [];

    // MACD line vs signal line
    if (macd.MACD > macd.signal && macd.histogram > 0) {
      signals.push({
        action: "BUY",
        strength: Math.min(Math.abs(macd.histogram) * 100, 90),
        strategy: "MACD_BULLISH",
        reasons: [`MACD bullish: Line above signal with positive histogram`],
      });
    } else if (macd.MACD < macd.signal && macd.histogram < 0) {
      signals.push({
        action: "SELL",
        strength: Math.min(Math.abs(macd.histogram) * 100, 90),
        strategy: "MACD_BEARISH",
        reasons: [`MACD bearish: Line below signal with negative histogram`],
      });
    }

    // MACD zero line cross
    if (macd.MACD > 0 && macd.signal > 0) {
      signals.push({
        action: "BUY",
        strength: 60,
        strategy: "MACD_ABOVE_ZERO",
        reasons: ["MACD and signal above zero line - bullish momentum"],
      });
    } else if (macd.MACD < 0 && macd.signal < 0) {
      signals.push({
        action: "SELL",
        strength: 60,
        strategy: "MACD_BELOW_ZERO",
        reasons: ["MACD and signal below zero line - bearish momentum"],
      });
    }

    return signals;
  }

  private analyzePriceMomentum(
    currentPrice: number,
    sma: { short: number; medium: number; long: number },
  ): PartialSignal[] {
    const signals: PartialSignal[] = [];

    // Price vs short-term MA
    const shortMADiff = (currentPrice - sma.short) / sma.short;
    if (shortMADiff > this.config.trendStrength) {
      signals.push({
        action: "BUY",
        strength: Math.min(shortMADiff * 500, 85),
        strategy: "PRICE_MOMENTUM_UP",
        reasons: [
          `Price ${(shortMADiff * 100).toFixed(1)}% above ${this.config.shortMA}MA - strong upward momentum`,
        ],
      });
    } else if (shortMADiff < -this.config.trendStrength) {
      signals.push({
        action: "SELL",
        strength: Math.min(Math.abs(shortMADiff) * 500, 85),
        strategy: "PRICE_MOMENTUM_DOWN",
        reasons: [
          `Price ${(Math.abs(shortMADiff) * 100).toFixed(1)}% below ${this.config.shortMA}MA - strong downward momentum`,
        ],
      });
    }

    // Price vs long-term MA for trend confirmation
    const longMADiff = (currentPrice - sma.long) / sma.long;
    if (longMADiff > 0.05) {
      // 5% above long-term MA
      signals.push({
        action: "BUY",
        strength: 50,
        strategy: "LONG_TERM_BULLISH",
        reasons: [`Price ${(longMADiff * 100).toFixed(1)}% above 200MA - strong bullish trend`],
      });
    } else if (longMADiff < -0.05) {
      signals.push({
        action: "SELL",
        strength: 50,
        strategy: "LONG_TERM_BEARISH",
        reasons: [
          `Price ${(Math.abs(longMADiff) * 100).toFixed(1)}% below 200MA - strong bearish trend`,
        ],
      });
    }

    return signals;
  }

  private analyzeTrendStrength(historicalData: HistoricalData[]): PartialSignal[] {
    const signals: PartialSignal[] = [];

    if (historicalData.length < 10) return signals;

    // Calculate price velocity (rate of change)
    const recent = historicalData.slice(0, 5);
    const older = historicalData.slice(5, 10);

    const recentAvg = recent.reduce((sum, d) => sum + d.close, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.close, 0) / older.length;

    const velocity = (recentAvg - olderAvg) / olderAvg;

    if (velocity > 0.03) {
      // 3% increase in 5 days
      signals.push({
        action: "BUY",
        strength: Math.min(velocity * 1000, 80),
        strategy: "PRICE_ACCELERATION_UP",
        reasons: [`Strong price acceleration: ${(velocity * 100).toFixed(1)}% in 5 days`],
      });
    } else if (velocity < -0.03) {
      signals.push({
        action: "SELL",
        strength: Math.min(Math.abs(velocity) * 1000, 80),
        strategy: "PRICE_ACCELERATION_DOWN",
        reasons: [
          `Strong price deceleration: ${(Math.abs(velocity) * 100).toFixed(1)}% drop in 5 days`,
        ],
      });
    }

    // Higher highs and higher lows pattern
    if (historicalData.length >= 6) {
      const isUptrend = this.checkUptrend(historicalData.slice(0, 6));
      const isDowntrend = this.checkDowntrend(historicalData.slice(0, 6));

      if (isUptrend) {
        signals.push({
          action: "BUY",
          strength: 65,
          strategy: "HIGHER_HIGHS_LOWS",
          reasons: ["Pattern of higher highs and higher lows detected"],
        });
      } else if (isDowntrend) {
        signals.push({
          action: "SELL",
          strength: 65,
          strategy: "LOWER_HIGHS_LOWS",
          reasons: ["Pattern of lower highs and lower lows detected"],
        });
      }
    }

    return signals;
  }

  private checkUptrend(data: HistoricalData[]): boolean {
    // Check for higher highs and higher lows pattern
    for (let i = 1; i < data.length - 1; i++) {
      const current = data[i];
      const next = data[i + 1];
      if (!current || !next || current.high <= next.high || current.low <= next.low) {
        return false;
      }
    }
    return true;
  }

  private checkDowntrend(data: HistoricalData[]): boolean {
    // Check for lower highs and lower lows pattern
    for (let i = 1; i < data.length - 1; i++) {
      const current = data[i];
      const next = data[i + 1];
      if (!current || !next || current.high >= next.high || current.low >= next.low) {
        return false;
      }
    }
    return true;
  }

  private applyVolumeConfirmation(
    signals: PartialSignal[],
    volumeProfile: { volumeRatio: number; volumeTrend: string },
  ): void {
    const volumeMultiplier = volumeProfile.volumeRatio >= this.config.volumeThreshold ? 1.3 : 0.8;

    signals.forEach((signal) => {
      const originalStrength = signal.strength;
      signal.strength *= volumeMultiplier;

      if (volumeProfile.volumeRatio >= this.config.volumeThreshold) {
        signal.reasons.push(
          `Strong volume confirmation: ${(volumeProfile.volumeRatio * 100).toFixed(0)}% of average`,
        );
      } else if (volumeProfile.volumeRatio < 0.7) {
        signal.strength = Math.min(signal.strength, 50); // Cap strength with low volume
        signal.reasons.push(
          `Low volume warning: ${(volumeProfile.volumeRatio * 100).toFixed(0)}% of average`,
        );
      }

      // Volume trend consideration
      if (volumeProfile.volumeTrend === "increasing") {
        signal.strength *= 1.1;
        signal.reasons.push("Volume trend increasing");
      } else if (volumeProfile.volumeTrend === "decreasing") {
        signal.strength *= 0.9;
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
      return this.createHoldSignal(symbol, indicators, "No momentum signals detected");
    }

    // Group signals by action
    const buySignals = partialSignals.filter((s) => s.action === "BUY");
    const sellSignals = partialSignals.filter((s) => s.action === "SELL");

    // Determine dominant signal direction
    let finalAction: "BUY" | "SELL" | "HOLD" = "HOLD";
    let relevantSignals: PartialSignal[] = [];

    // Weight signals by strength
    const buyStrength = buySignals.reduce((sum, s) => sum + s.strength, 0);
    const sellStrength = sellSignals.reduce((sum, s) => sum + s.strength, 0);

    if (buyStrength > sellStrength && buySignals.length > 0) {
      finalAction = "BUY";
      relevantSignals = buySignals;
    } else if (sellStrength > buyStrength && sellSignals.length > 0) {
      finalAction = "SELL";
      relevantSignals = sellSignals;
    }

    if (relevantSignals.length === 0) {
      return this.createHoldSignal(symbol, indicators, "Conflicting momentum signals detected");
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
    confidence += signals.length * 12; // 12 points per confirming signal

    // Bonus for signal strength
    const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    confidence += avgStrength * 0.4;

    // Volume confirmation bonus
    if (indicators.volumeProfile.volumeRatio >= this.config.volumeThreshold) {
      confidence += 15;
    }

    // Market regime adjustment
    const regime = indicators.marketRegime;
    if (regime.type === "BULLISH_TREND" || regime.type === "BEARISH_TREND") {
      // Momentum works best in trending markets
      confidence += regime.trendStrength * 0.25;
    } else if (regime.type === "SIDEWAYS") {
      // Reduce confidence in sideways markets
      confidence -= regime.strength * 0.2;
    } else if (regime.type === "VOLATILE") {
      // Mixed results in volatile markets
      confidence -= 10;
    }

    // MACD alignment bonus
    if (indicators.macd.MACD > indicators.macd.signal && indicators.macd.histogram > 0) {
      confidence += 10;
    } else if (indicators.macd.MACD < indicators.macd.signal && indicators.macd.histogram < 0) {
      confidence += 10; // Bearish alignment is still alignment
    }

    // Moving average trend bonus
    if (
      (indicators.sma.short > indicators.sma.medium &&
        indicators.sma.medium > indicators.sma.long) ||
      (indicators.sma.short < indicators.sma.medium && indicators.sma.medium < indicators.sma.long)
    ) {
      confidence += 8;
    }

    // Penalize conflicting signals
    const hasConflictingSignals =
      signals.some((s) => s.action === "BUY") && signals.some((s) => s.action === "SELL");
    if (hasConflictingSignals) {
      confidence -= 25;
    }

    return Math.min(Math.max(confidence, 0), 100);
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
    return "Momentum strategy using EMA, MACD, and volume confirmation";
  }

  getConfig(): MomentumConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<MomentumConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }
}
