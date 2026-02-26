/**
 * Survivorship Bias Protection for Backtesting
 *
 * Survivorship bias occurs when backtests only use stocks that have "survived"
 * (i.e., still exist today), ignoring delisted, bankrupt, or acquired companies.
 * This leads to inflated backtest returns because the failures are excluded.
 *
 * This module provides:
 * 1. Detection of potential survivorship bias in backtest data
 * 2. Delisted stock tracking and handling
 * 3. Warnings when backtests may be affected
 * 4. Adjustment recommendations
 *
 * Key Principles:
 * - A stock that was delisted at -90% should count as a -90% loss, not be excluded
 * - Index composition changes over time (S&P 500 today ≠ S&P 500 in 2010)
 * - Backtest should use point-in-time index constituents, not current constituents
 */

export interface DelistedStock {
  symbol: string;
  delistingDate: Date;
  delistingReason: DelistingReason;
  finalPrice: number;
  peakPrice?: number;
  percentFromPeak?: number;
  acquiredBy?: string;
  acquisitionPrice?: number;
}

export type DelistingReason =
  | "BANKRUPTCY"
  | "ACQUISITION"
  | "MERGER"
  | "PRIVATIZATION"
  | "DELISTED_EXCHANGE"
  | "REVERSE_SPLIT_BELOW_THRESHOLD"
  | "SEC_VIOLATION"
  | "UNKNOWN";

export interface SurvivorshipBiasCheck {
  hasPotentialBias: boolean;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  warnings: string[];
  recommendations: string[];
  statistics: {
    totalSymbolsChecked: number;
    delistedDuringPeriod: number;
    bankruptciesDuringPeriod: number;
    acquisitionsDuringPeriod: number;
    avgDelistedLoss: number;
    estimatedBiasImpact: number; // Estimated return inflation in percentage points
  };
  delistedStocks: DelistedStock[];
}

export interface BacktestDataQuality {
  isPointInTime: boolean;
  hasDelistedData: boolean;
  hasSplitAdjustments: boolean;
  hasDividendAdjustments: boolean;
  dataStartDate: Date;
  dataEndDate: Date;
  missingDataDays: number;
  gapDays: Date[];
  qualityScore: number; // 0-100
  qualityRating: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "UNRELIABLE";
}

/**
 * Known major delistings for educational/testing purposes
 * In production, this would be loaded from a comprehensive database
 */
const KNOWN_DELISTINGS: DelistedStock[] = [
  // 2008 Financial Crisis casualties
  { symbol: "LEH", delistingDate: new Date("2008-09-15"), delistingReason: "BANKRUPTCY", finalPrice: 0.21, peakPrice: 86.18, percentFromPeak: -99.8 },
  { symbol: "BSC", delistingDate: new Date("2008-05-30"), delistingReason: "ACQUISITION", finalPrice: 10, acquiredBy: "JPM", acquisitionPrice: 10, peakPrice: 171.51 },
  { symbol: "WB", delistingDate: new Date("2008-12-31"), delistingReason: "ACQUISITION", finalPrice: 7.04, acquiredBy: "WFC", acquisitionPrice: 7.04, peakPrice: 50.61 },
  { symbol: "MER", delistingDate: new Date("2008-12-31"), delistingReason: "ACQUISITION", finalPrice: 29, acquiredBy: "BAC", acquisitionPrice: 29, peakPrice: 97.53 },
  { symbol: "AIG", delistingDate: new Date("2009-06-30"), delistingReason: "REVERSE_SPLIT_BELOW_THRESHOLD", finalPrice: 1.25, peakPrice: 70.13, percentFromPeak: -98.2 },

  // Enron/WorldCom era
  { symbol: "ENRNQ", delistingDate: new Date("2001-12-02"), delistingReason: "BANKRUPTCY", finalPrice: 0.26, peakPrice: 90.56, percentFromPeak: -99.7 },
  { symbol: "WCOME", delistingDate: new Date("2002-07-21"), delistingReason: "BANKRUPTCY", finalPrice: 0.06, peakPrice: 64.50, percentFromPeak: -99.9 },

  // Recent notable delistings
  { symbol: "GE", delistingDate: new Date("2024-04-02"), delistingReason: "MERGER", finalPrice: 159.72, acquiredBy: "GE Aerospace", acquisitionPrice: 159.72 },
  { symbol: "TWTR", delistingDate: new Date("2022-10-28"), delistingReason: "PRIVATIZATION", finalPrice: 54.20, acquiredBy: "X Corp (Musk)", acquisitionPrice: 54.20 },

  // 2020 pandemic/2021 era
  { symbol: "HTZ", delistingDate: new Date("2020-06-11"), delistingReason: "BANKRUPTCY", finalPrice: 0.56, peakPrice: 27.13, percentFromPeak: -97.9 },
  { symbol: "JCP", delistingDate: new Date("2020-05-15"), delistingReason: "BANKRUPTCY", finalPrice: 0.22, peakPrice: 87.46, percentFromPeak: -99.7 },
  { symbol: "SHLDQ", delistingDate: new Date("2019-04-05"), delistingReason: "BANKRUPTCY", finalPrice: 0.33, peakPrice: 192.20, percentFromPeak: -99.8 },
];

/**
 * Historical S&P 500 changes (sample - in production use full historical data)
 * These are examples of stocks that were in S&P 500 but later removed
 */
const SP500_REMOVALS: Map<string, { removedDate: Date; reason: string }> = new Map([
  ["GE", { removedDate: new Date("2018-06-26"), reason: "Market cap decline" }],
  ["LEH", { removedDate: new Date("2008-09-15"), reason: "Bankruptcy" }],
  ["SHLD", { removedDate: new Date("2018-08-31"), reason: "Market cap decline" }],
  ["JCP", { removedDate: new Date("2013-07-09"), reason: "Market cap decline" }],
  ["YHOO", { removedDate: new Date("2017-06-16"), reason: "Acquired by Verizon" }],
  ["ETN", { removedDate: new Date("2012-11-30"), reason: "Corporate action" }],
]);

export class SurvivorshipBiasGuard {
  private knownDelistings: Map<string, DelistedStock>;
  private sp500Removals: Map<string, { removedDate: Date; reason: string }>;

  constructor() {
    // Initialize with known delistings
    this.knownDelistings = new Map();
    for (const stock of KNOWN_DELISTINGS) {
      this.knownDelistings.set(stock.symbol, stock);
    }
    this.sp500Removals = SP500_REMOVALS;
  }

  /**
   * Check a backtest configuration for potential survivorship bias
   */
  checkBacktestForBias(
    symbols: string[],
    startDate: Date,
    endDate: Date,
    indexSource?: "SP500" | "NASDAQ100" | "DOW30" | "CUSTOM"
  ): SurvivorshipBiasCheck {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const delistedDuringPeriod: DelistedStock[] = [];

    // Check for delisted stocks in the symbol list
    for (const symbol of symbols) {
      const delisting = this.knownDelistings.get(symbol.toUpperCase());
      if (delisting && delisting.delistingDate >= startDate && delisting.delistingDate <= endDate) {
        delistedDuringPeriod.push(delisting);
      }
    }

    // Check if using current S&P 500 constituents for historical backtest
    if (indexSource === "SP500") {
      const removalsInPeriod = Array.from(this.sp500Removals.entries())
        .filter(([_, info]) => info.removedDate >= startDate && info.removedDate <= endDate);

      if (removalsInPeriod.length > 0) {
        warnings.push(
          `${removalsInPeriod.length} stocks were removed from S&P 500 during your backtest period. ` +
          `Using current S&P 500 constituents may cause survivorship bias.`
        );
        recommendations.push(
          "Use point-in-time S&P 500 constituents from the start of your backtest period, " +
          "or use a data provider that includes historical index composition."
        );
      }

      // Check backtest length for S&P 500
      const yearsSpan = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsSpan > 5) {
        warnings.push(
          `Your backtest spans ${yearsSpan.toFixed(1)} years. The S&P 500 has approximately ` +
          `20-25 constituent changes per year, meaning ~${Math.round(yearsSpan * 22)} changes ` +
          `may have occurred during your test period.`
        );
      }
    }

    // Calculate statistics
    const bankruptcies = delistedDuringPeriod.filter(d => d.delistingReason === "BANKRUPTCY");
    const acquisitions = delistedDuringPeriod.filter(d => d.delistingReason === "ACQUISITION");

    const avgDelistedLoss = delistedDuringPeriod.length > 0
      ? delistedDuringPeriod
          .filter(d => d.percentFromPeak !== undefined)
          .reduce((sum, d) => sum + (d.percentFromPeak ?? 0), 0) / delistedDuringPeriod.length
      : 0;

    // Estimate bias impact (rough heuristic)
    // Each excluded bankruptcy at -90% loss represents potential return inflation
    const estimatedBiasImpact = bankruptcies.length > 0
      ? (bankruptcies.length / symbols.length) * 90 * 0.5 // 50% weight assumption
      : 0;

    // Determine severity
    let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (bankruptcies.length > 0) {
      severity = "HIGH";
    } else if (delistedDuringPeriod.length > symbols.length * 0.1) {
      severity = "MEDIUM";
    }
    if (estimatedBiasImpact > 5) {
      severity = "CRITICAL";
    }

    // Add general warnings based on backtest configuration
    if (symbols.length < 20) {
      warnings.push(
        "Small symbol universe (<20 stocks) may be more susceptible to survivorship bias. " +
        "Consider expanding your universe or verifying all symbols existed during the test period."
      );
    }

    // Add recommendations based on findings
    if (delistedDuringPeriod.length > 0) {
      recommendations.push(
        `Include ${delistedDuringPeriod.length} delisted stocks in your backtest with their ` +
        `terminal values to eliminate survivorship bias.`
      );

      if (bankruptcies.length > 0) {
        recommendations.push(
          `${bankruptcies.length} bankruptcies occurred. Treat these as -100% returns ` +
          `at their delisting dates to accurately model the strategy's true performance.`
        );
      }
    }

    return {
      hasPotentialBias: warnings.length > 0 || delistedDuringPeriod.length > 0,
      severity,
      warnings,
      recommendations,
      statistics: {
        totalSymbolsChecked: symbols.length,
        delistedDuringPeriod: delistedDuringPeriod.length,
        bankruptciesDuringPeriod: bankruptcies.length,
        acquisitionsDuringPeriod: acquisitions.length,
        avgDelistedLoss,
        estimatedBiasImpact,
      },
      delistedStocks: delistedDuringPeriod,
    };
  }

  /**
   * Assess data quality for backtesting
   */
  assessDataQuality(
    data: Array<{ symbol: string; timestamp: Date; close: number }>,
    expectedStartDate: Date,
    expectedEndDate: Date
  ): BacktestDataQuality {
    if (data.length === 0) {
      return {
        isPointInTime: false,
        hasDelistedData: false,
        hasSplitAdjustments: false,
        hasDividendAdjustments: false,
        dataStartDate: expectedStartDate,
        dataEndDate: expectedEndDate,
        missingDataDays: 0,
        gapDays: [],
        qualityScore: 0,
        qualityRating: "UNRELIABLE",
      };
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const actualStartDate = sortedData[0]?.timestamp ?? expectedStartDate;
    const actualEndDate = sortedData[sortedData.length - 1]?.timestamp ?? expectedEndDate;

    // Find gaps in data (excluding weekends)
    const gapDays: Date[] = [];
    for (let i = 1; i < sortedData.length; i++) {
      const prev = sortedData[i - 1];
      const curr = sortedData[i];
      if (!prev || !curr) continue;

      const daysDiff = Math.floor(
        (curr.timestamp.getTime() - prev.timestamp.getTime()) / (24 * 60 * 60 * 1000)
      );

      // If gap is more than 3 days (accounting for weekends), flag it
      if (daysDiff > 3) {
        const gapDate = new Date(prev.timestamp);
        gapDate.setDate(gapDate.getDate() + 1);
        gapDays.push(gapDate);
      }
    }

    // Calculate quality score
    let qualityScore = 100;

    // Penalize for missing start/end alignment
    const startDiff = Math.abs(actualStartDate.getTime() - expectedStartDate.getTime()) / (24 * 60 * 60 * 1000);
    const endDiff = Math.abs(actualEndDate.getTime() - expectedEndDate.getTime()) / (24 * 60 * 60 * 1000);
    qualityScore -= Math.min(startDiff * 0.5, 10);
    qualityScore -= Math.min(endDiff * 0.5, 10);

    // Penalize for gaps
    qualityScore -= gapDays.length * 2;

    // Penalize for insufficient data points
    const expectedTradingDays = Math.floor(
      (expectedEndDate.getTime() - expectedStartDate.getTime()) / (24 * 60 * 60 * 1000) * (252 / 365)
    );
    const dataCoverage = data.length / expectedTradingDays;
    if (dataCoverage < 0.9) {
      qualityScore -= (1 - dataCoverage) * 30;
    }

    qualityScore = Math.max(0, Math.min(100, qualityScore));

    // Determine rating
    let qualityRating: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "UNRELIABLE";
    if (qualityScore >= 90) qualityRating = "EXCELLENT";
    else if (qualityScore >= 75) qualityRating = "GOOD";
    else if (qualityScore >= 60) qualityRating = "FAIR";
    else if (qualityScore >= 40) qualityRating = "POOR";
    else qualityRating = "UNRELIABLE";

    return {
      isPointInTime: true, // Assume true if using proper historical data
      hasDelistedData: false, // Would need to verify against delisting database
      hasSplitAdjustments: true, // Assume adjusted data
      hasDividendAdjustments: true, // Assume adjusted data
      dataStartDate: actualStartDate,
      dataEndDate: actualEndDate,
      missingDataDays: gapDays.length,
      gapDays,
      qualityScore: Math.round(qualityScore),
      qualityRating,
    };
  }

  /**
   * Generate a survivorship bias warning message for display
   */
  generateWarningMessage(check: SurvivorshipBiasCheck): string {
    if (!check.hasPotentialBias) {
      return "No significant survivorship bias detected.";
    }

    const lines: string[] = [
      `⚠️ SURVIVORSHIP BIAS WARNING (${check.severity})`,
      "",
    ];

    for (const warning of check.warnings) {
      lines.push(`• ${warning}`);
    }

    if (check.delistedStocks.length > 0) {
      lines.push("");
      lines.push("Delisted stocks during backtest period:");
      for (const stock of check.delistedStocks) {
        const loss = stock.percentFromPeak !== undefined
          ? ` (${stock.percentFromPeak.toFixed(1)}% from peak)`
          : "";
        lines.push(`  - ${stock.symbol}: ${stock.delistingReason}${loss}`);
      }
    }

    if (check.statistics.estimatedBiasImpact > 0) {
      lines.push("");
      lines.push(`Estimated return inflation from bias: ~${check.statistics.estimatedBiasImpact.toFixed(1)} percentage points`);
    }

    if (check.recommendations.length > 0) {
      lines.push("");
      lines.push("Recommendations:");
      for (const rec of check.recommendations) {
        lines.push(`  → ${rec}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Check if a specific symbol was delisted and return details
   */
  getDelistingInfo(symbol: string): DelistedStock | null {
    return this.knownDelistings.get(symbol.toUpperCase()) ?? null;
  }

  /**
   * Add custom delisting information
   */
  addDelisting(stock: DelistedStock): void {
    this.knownDelistings.set(stock.symbol.toUpperCase(), stock);
  }

  /**
   * Get all known delistings within a date range
   */
  getDelistingsInRange(startDate: Date, endDate: Date): DelistedStock[] {
    return Array.from(this.knownDelistings.values()).filter(
      d => d.delistingDate >= startDate && d.delistingDate <= endDate
    );
  }
}

/**
 * Factory function for easy instantiation
 */
export function createSurvivorshipBiasGuard(): SurvivorshipBiasGuard {
  return new SurvivorshipBiasGuard();
}
