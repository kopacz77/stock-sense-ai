/**
 * Trade Journal - Immutable Append-Only Log
 * Records all trading activity with encryption
 * Provides query interface for analysis
 */

import type {
  TradeJournalEntry,
  PaperOrder,
  PaperTrade,
  PaperPosition,
} from "../types/paper-trading-types.js";
import type { EncryptedStorage } from "../storage/encrypted-storage.js";

/**
 * Query Options for Trade Journal
 */
export interface JournalQueryOptions {
  symbol?: string;
  startDate?: Date;
  endDate?: Date;
  type?: TradeJournalEntry["type"];
  strategyName?: string;
  limit?: number;
}

/**
 * Trade Journal
 * Immutable log of all trading activity
 */
export class TradeJournal {
  constructor(private storage: EncryptedStorage) {}

  /**
   * Record order creation
   */
  async recordOrderCreated(
    order: PaperOrder,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "ORDER",
      orderId: order.id,
      symbol: order.symbol,
      action: "ORDER_CREATED",
      details: {
        orderType: order.type,
        side: order.side,
        quantity: order.quantity,
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        timeInForce: order.timeInForce,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: order.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record order fill
   */
  async recordOrderFilled(
    order: PaperOrder,
    fillPrice: number,
    fillQuantity: number,
    commission: number,
    slippage: number,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "FILL",
      orderId: order.id,
      symbol: order.symbol,
      action: "ORDER_FILLED",
      details: {
        orderType: order.type,
        side: order.side,
        fillPrice,
        fillQuantity,
        commission,
        slippage,
        totalCost: fillQuantity * fillPrice + commission + slippage,
        status: order.status,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: order.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record order cancellation
   */
  async recordOrderCancelled(
    order: PaperOrder,
    reason: string,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "CANCEL",
      orderId: order.id,
      symbol: order.symbol,
      action: "ORDER_CANCELLED",
      details: {
        reason,
        orderType: order.type,
        side: order.side,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: order.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record position opened
   */
  async recordPositionOpened(
    position: PaperPosition,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "POSITION_OPEN",
      symbol: position.symbol,
      action: "POSITION_OPENED",
      details: {
        side: position.side,
        entryPrice: position.entryPrice,
        quantity: position.quantity,
        totalCost: position.quantity * position.entryPrice + position.entryCommission + position.entrySlippage,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: position.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record position closed
   */
  async recordPositionClosed(
    trade: PaperTrade,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "POSITION_CLOSE",
      tradeId: trade.id,
      symbol: trade.symbol,
      action: "POSITION_CLOSED",
      details: {
        side: trade.side,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        grossPnL: trade.grossPnL,
        netPnL: trade.netPnL,
        returnPercent: trade.returnPercent,
        commission: trade.commission,
        slippage: trade.slippage,
        exitReason: trade.exitReason,
        holdDurationDays: trade.holdDurationDays,
        mae: trade.mae,
        mfe: trade.mfe,
        rValue: trade.rValue,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: trade.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record position update (price change, stop/target hit, etc.)
   */
  async recordPositionUpdate(
    position: PaperPosition,
    updateType: string,
    details: Record<string, unknown>,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "UPDATE",
      symbol: position.symbol,
      action: updateType,
      details: {
        currentPrice: position.currentPrice,
        unrealizedPnL: position.unrealizedPnL,
        unrealizedPnLPercent: position.unrealizedPnLPercent,
        ...details,
      },
      portfolioValue,
      cash,
      positionsValue,
      strategyName: position.strategyName,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Record risk event (limit breach, margin call, etc.)
   */
  async recordRiskEvent(
    eventType: string,
    symbol: string | undefined,
    details: Record<string, unknown>,
    portfolioValue: number,
    cash: number,
    positionsValue: number
  ): Promise<void> {
    const entry: TradeJournalEntry = {
      timestamp: new Date(),
      type: "RISK_EVENT",
      symbol,
      action: eventType,
      details,
      portfolioValue,
      cash,
      positionsValue,
    };

    await this.storage.appendJournalEntry(entry);
  }

  /**
   * Query journal entries
   */
  async query(options: JournalQueryOptions = {}): Promise<TradeJournalEntry[]> {
    let entries = await this.storage.readJournalEntries<TradeJournalEntry>();

    // Filter by date range
    if (options.startDate || options.endDate) {
      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.timestamp);
        if (options.startDate && entryDate < options.startDate) return false;
        if (options.endDate && entryDate > options.endDate) return false;
        return true;
      });
    }

    // Filter by symbol
    if (options.symbol) {
      entries = entries.filter((entry) => entry.symbol === options.symbol);
    }

    // Filter by type
    if (options.type) {
      entries = entries.filter((entry) => entry.type === options.type);
    }

    // Filter by strategy
    if (options.strategyName) {
      entries = entries.filter((entry) => entry.strategyName === options.strategyName);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options.limit && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get recent entries
   */
  async getRecent(count: number = 100): Promise<TradeJournalEntry[]> {
    return this.query({ limit: count });
  }

  /**
   * Get entries for symbol
   */
  async getEntriesForSymbol(symbol: string, limit?: number): Promise<TradeJournalEntry[]> {
    return this.query({ symbol, limit });
  }

  /**
   * Get entries by date range
   */
  async getEntriesByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<TradeJournalEntry[]> {
    return this.query({ startDate, endDate });
  }

  /**
   * Get entries by type
   */
  async getEntriesByType(
    type: TradeJournalEntry["type"],
    limit?: number
  ): Promise<TradeJournalEntry[]> {
    return this.query({ type, limit });
  }

  /**
   * Get all fills
   */
  async getAllFills(): Promise<TradeJournalEntry[]> {
    return this.query({ type: "FILL" });
  }

  /**
   * Get all position opens
   */
  async getAllPositionOpens(): Promise<TradeJournalEntry[]> {
    return this.query({ type: "POSITION_OPEN" });
  }

  /**
   * Get all position closes
   */
  async getAllPositionCloses(): Promise<TradeJournalEntry[]> {
    return this.query({ type: "POSITION_CLOSE" });
  }

  /**
   * Get all risk events
   */
  async getAllRiskEvents(): Promise<TradeJournalEntry[]> {
    return this.query({ type: "RISK_EVENT" });
  }

  /**
   * Export journal to CSV
   */
  async exportToCSV(outputPath: string): Promise<void> {
    const entries = await this.storage.readJournalEntries<TradeJournalEntry>();

    const csvLines: string[] = [
      "Timestamp,Type,Symbol,Action,Portfolio Value,Cash,Positions Value,Strategy,Details",
    ];

    for (const entry of entries) {
      const row = [
        new Date(entry.timestamp).toISOString(),
        entry.type,
        entry.symbol ?? "",
        entry.action,
        entry.portfolioValue.toFixed(2),
        entry.cash.toFixed(2),
        entry.positionsValue.toFixed(2),
        entry.strategyName ?? "",
        JSON.stringify(entry.details).replace(/"/g, '""'),
      ];

      csvLines.push(row.map((v) => `"${v}"`).join(","));
    }

    const fs = await import("node:fs/promises");
    await fs.writeFile(outputPath, csvLines.join("\n"), "utf8");
  }

  /**
   * Get journal statistics
   */
  async getStatistics(): Promise<{
    totalEntries: number;
    entriesByType: Record<string, number>;
    dateRange: { start: Date; end: Date } | null;
    symbolCount: number;
    strategyCount: number;
  }> {
    const entries = await this.storage.readJournalEntries<TradeJournalEntry>();

    const entriesByType: Record<string, number> = {};
    const symbols = new Set<string>();
    const strategies = new Set<string>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const entry of entries) {
      // Count by type
      entriesByType[entry.type] = (entriesByType[entry.type] ?? 0) + 1;

      // Track symbols
      if (entry.symbol) {
        symbols.add(entry.symbol);
      }

      // Track strategies
      if (entry.strategyName) {
        strategies.add(entry.strategyName);
      }

      // Track date range
      const entryDate = new Date(entry.timestamp);
      if (!minDate || entryDate < minDate) {
        minDate = entryDate;
      }
      if (!maxDate || entryDate > maxDate) {
        maxDate = entryDate;
      }
    }

    return {
      totalEntries: entries.length,
      entriesByType,
      dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
      symbolCount: symbols.size,
      strategyCount: strategies.size,
    };
  }
}
