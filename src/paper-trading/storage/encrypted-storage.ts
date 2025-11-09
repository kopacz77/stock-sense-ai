/**
 * Encrypted Storage System for Paper Trading
 * Provides secure, encrypted persistence for all paper trading data
 * Uses AES-256-CBC encryption with integrity checks
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StorageConfig } from "../types/paper-trading-types.js";

/**
 * Encryption metadata stored with encrypted data
 */
interface EncryptionMetadata {
  version: string;
  algorithm: string;
  timestamp: Date;
  checksum: string;
}

/**
 * Encrypted data format
 */
interface EncryptedData {
  iv: string;
  data: string;
  metadata: EncryptionMetadata;
}

/**
 * Encrypted Storage Manager
 * Handles all file I/O with encryption for paper trading data
 */
export class EncryptedStorage {
  private readonly ALGORITHM = "aes-256-cbc";
  private readonly VERSION = "1.0";
  private encryptionKey: Buffer | null = null;
  private config: StorageConfig;

  constructor(
    private baseDir: string,
    private masterKey?: string // Optional master key, otherwise generates one
  ) {
    this.config = this.initializeStorageConfig();
  }

  /**
   * Initialize storage configuration
   */
  private initializeStorageConfig(): StorageConfig {
    return {
      baseDir: this.baseDir,
      portfolioStateFile: path.join(this.baseDir, "portfolio-state.enc"),
      ordersFile: path.join(this.baseDir, "orders.enc.jsonl"),
      tradesFile: path.join(this.baseDir, "trades.enc.jsonl"),
      journalFile: path.join(this.baseDir, "journal.enc.jsonl"),
      performanceFile: path.join(this.baseDir, "performance-history.enc.jsonl"),
      backupDir: path.join(this.baseDir, "backups"),
    };
  }

  /**
   * Initialize storage (create directories, load/generate encryption key)
   */
  async initialize(): Promise<void> {
    // Create base directory
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.config.backupDir, { recursive: true, mode: 0o700 });

    // Load or generate encryption key
    if (this.masterKey) {
      this.encryptionKey = crypto.scryptSync(this.masterKey, "salt", 32);
    } else {
      await this.loadOrGenerateKey();
    }
  }

  /**
   * Load or generate encryption key
   */
  private async loadOrGenerateKey(): Promise<void> {
    const keyFile = path.join(this.baseDir, ".encryption-key");

    try {
      const encryptedKey = await fs.readFile(keyFile, "utf8");
      this.encryptionKey = Buffer.from(encryptedKey, "hex");
    } catch (error) {
      // Generate new key
      this.encryptionKey = crypto.randomBytes(32);
      await fs.writeFile(keyFile, this.encryptionKey.toString("hex"), {
        mode: 0o600,
      });
    }
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): EncryptedData {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    // Generate random IV
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv);

    // Encrypt data
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Calculate checksum for integrity
    const checksum = crypto
      .createHash("sha256")
      .update(data)
      .digest("hex");

    const metadata: EncryptionMetadata = {
      version: this.VERSION,
      algorithm: this.ALGORITHM,
      timestamp: new Date(),
      checksum,
    };

    return {
      iv: iv.toString("hex"),
      data: encrypted,
      metadata,
    };
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: EncryptedData): string {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    // Validate version
    if (encryptedData.metadata.version !== this.VERSION) {
      throw new Error(
        `Unsupported encryption version: ${encryptedData.metadata.version}`
      );
    }

    // Create decipher
    const iv = Buffer.from(encryptedData.iv, "hex");
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      this.encryptionKey,
      iv
    );

    // Decrypt data
    let decrypted = decipher.update(encryptedData.data, "hex", "utf8");
    decrypted += decipher.final("utf8");

    // Verify integrity
    const checksum = crypto
      .createHash("sha256")
      .update(decrypted)
      .digest("hex");

    if (checksum !== encryptedData.metadata.checksum) {
      throw new Error("Data integrity check failed");
    }

    return decrypted;
  }

  /**
   * Write encrypted data to file
   */
  async writeEncrypted(filePath: string, data: unknown): Promise<void> {
    const jsonData = JSON.stringify(data, null, 2);
    const encrypted = this.encrypt(jsonData);
    const encryptedJson = JSON.stringify(encrypted);

    await fs.writeFile(filePath, encryptedJson, { mode: 0o600 });
  }

  /**
   * Read encrypted data from file
   */
  async readEncrypted<T>(filePath: string): Promise<T> {
    const encryptedJson = await fs.readFile(filePath, "utf8");
    const encrypted = JSON.parse(encryptedJson) as EncryptedData;
    const decrypted = this.decrypt(encrypted);

    return JSON.parse(decrypted) as T;
  }

  /**
   * Append encrypted line to JSONL file
   */
  async appendEncryptedLine(filePath: string, data: unknown): Promise<void> {
    const jsonData = JSON.stringify(data);
    const encrypted = this.encrypt(jsonData);
    const encryptedJson = JSON.stringify(encrypted);

    await fs.appendFile(filePath, encryptedJson + "\n", { mode: 0o600 });
  }

  /**
   * Read all lines from encrypted JSONL file
   */
  async readEncryptedLines<T>(filePath: string): Promise<T[]> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.trim().split("\n").filter((line) => line.length > 0);

      return lines.map((line) => {
        const encrypted = JSON.parse(line) as EncryptedData;
        const decrypted = this.decrypt(encrypted);
        return JSON.parse(decrypted) as T;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read last N lines from encrypted JSONL file
   */
  async readLastEncryptedLines<T>(
    filePath: string,
    count: number
  ): Promise<T[]> {
    const allLines = await this.readEncryptedLines<T>(filePath);
    return allLines.slice(-count);
  }

  /**
   * Write portfolio state
   */
  async writePortfolioState(state: unknown): Promise<void> {
    await this.writeEncrypted(this.config.portfolioStateFile, state);
  }

  /**
   * Read portfolio state
   */
  async readPortfolioState<T>(): Promise<T | null> {
    try {
      return await this.readEncrypted<T>(this.config.portfolioStateFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Append order to orders log
   */
  async appendOrder(order: unknown): Promise<void> {
    await this.appendEncryptedLine(this.config.ordersFile, order);
  }

  /**
   * Read all orders
   */
  async readOrders<T>(): Promise<T[]> {
    return this.readEncryptedLines<T>(this.config.ordersFile);
  }

  /**
   * Append trade to trades log
   */
  async appendTrade(trade: unknown): Promise<void> {
    await this.appendEncryptedLine(this.config.tradesFile, trade);
  }

  /**
   * Read all trades
   */
  async readTrades<T>(): Promise<T[]> {
    return this.readEncryptedLines<T>(this.config.tradesFile);
  }

  /**
   * Read last N trades
   */
  async readLastTrades<T>(count: number): Promise<T[]> {
    return this.readLastEncryptedLines<T>(this.config.tradesFile, count);
  }

  /**
   * Append journal entry
   */
  async appendJournalEntry(entry: unknown): Promise<void> {
    await this.appendEncryptedLine(this.config.journalFile, entry);
  }

  /**
   * Read all journal entries
   */
  async readJournalEntries<T>(): Promise<T[]> {
    return this.readEncryptedLines<T>(this.config.journalFile);
  }

  /**
   * Read journal entries by date range
   */
  async readJournalEntriesByDateRange<T>(
    startDate: Date,
    endDate: Date
  ): Promise<T[]> {
    const allEntries = await this.readJournalEntries<T & { timestamp: Date }>();

    return allEntries.filter((entry) => {
      const timestamp = new Date(entry.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    }) as T[];
  }

  /**
   * Append performance snapshot
   */
  async appendPerformanceSnapshot(snapshot: unknown): Promise<void> {
    await this.appendEncryptedLine(this.config.performanceFile, snapshot);
  }

  /**
   * Read all performance snapshots
   */
  async readPerformanceSnapshots<T>(): Promise<T[]> {
    return this.readEncryptedLines<T>(this.config.performanceFile);
  }

  /**
   * Create backup of all data
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupSubDir = path.join(this.config.backupDir, timestamp);

    await fs.mkdir(backupSubDir, { recursive: true, mode: 0o700 });

    // Copy all files to backup directory
    const filesToBackup = [
      this.config.portfolioStateFile,
      this.config.ordersFile,
      this.config.tradesFile,
      this.config.journalFile,
      this.config.performanceFile,
    ];

    for (const file of filesToBackup) {
      try {
        const fileName = path.basename(file);
        await fs.copyFile(file, path.join(backupSubDir, fileName));
      } catch (error) {
        // File might not exist yet, skip
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }

    return backupSubDir;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    const files = await fs.readdir(backupPath);

    for (const file of files) {
      const sourcePath = path.join(backupPath, file);
      const destPath = path.join(this.baseDir, file);
      await fs.copyFile(sourcePath, destPath);
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<string[]> {
    try {
      const backups = await fs.readdir(this.config.backupDir);
      return backups.sort().reverse(); // Most recent first
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete old backups (keep only N most recent)
   */
  async pruneBackups(keepCount: number = 10): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length <= keepCount) {
      return;
    }

    const toDelete = backups.slice(keepCount);

    for (const backup of toDelete) {
      const backupPath = path.join(this.config.backupDir, backup);
      await fs.rm(backupPath, { recursive: true, force: true });
    }
  }

  /**
   * Check if portfolio state exists
   */
  async hasPortfolioState(): Promise<boolean> {
    try {
      await fs.access(this.config.portfolioStateFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all data (USE WITH CAUTION)
   */
  async clearAllData(): Promise<void> {
    const files = [
      this.config.portfolioStateFile,
      this.config.ordersFile,
      this.config.tradesFile,
      this.config.journalFile,
      this.config.performanceFile,
    ];

    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // Ignore if file doesn't exist
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  /**
   * Export data to unencrypted CSV (for analysis)
   */
  async exportTradesToCSV(outputPath: string): Promise<void> {
    const trades = await this.readTrades<Record<string, unknown>>();

    if (trades.length === 0) {
      throw new Error("No trades to export");
    }

    // Extract headers from first trade
    const headers = Object.keys(trades[0]);
    const csvLines = [headers.join(",")];

    // Convert each trade to CSV row
    for (const trade of trades) {
      const values = headers.map((header) => {
        const value = trade[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
        return String(value);
      });
      csvLines.push(values.join(","));
    }

    await fs.writeFile(outputPath, csvLines.join("\n"), "utf8");
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalSize: number;
    fileCount: number;
    backupCount: number;
    files: Record<string, number>;
  }> {
    const files = [
      this.config.portfolioStateFile,
      this.config.ordersFile,
      this.config.tradesFile,
      this.config.journalFile,
      this.config.performanceFile,
    ];

    let totalSize = 0;
    let fileCount = 0;
    const fileSizes: Record<string, number> = {};

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;
        fileCount++;
        fileSizes[path.basename(file)] = stats.size;
      } catch (error) {
        // File doesn't exist
        fileSizes[path.basename(file)] = 0;
      }
    }

    const backups = await this.listBackups();

    return {
      totalSize,
      fileCount,
      backupCount: backups.length,
      files: fileSizes,
    };
  }

  /**
   * Get storage configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }
}
