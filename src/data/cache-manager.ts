/**
 * Data Cache Manager
 * Manages local storage and caching of historical market data
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { OHLCVData, CacheMetadata, QuoteData } from './types.js';

export interface CacheConfig {
  cacheDir: string;
  quoteCacheTTL: number; // milliseconds
  historicalCacheTTL: number; // milliseconds
  maxCacheSizeMB: number;
}

export class DataCacheManager {
  private config: CacheConfig;
  private readonly CACHE_VERSION = '1.0';

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      cacheDir: path.join(process.cwd(), 'data', 'cache'),
      quoteCacheTTL: 60 * 1000, // 1 minute for quotes
      historicalCacheTTL: 24 * 60 * 60 * 1000, // 24 hours for historical
      maxCacheSizeMB: 500, // 500 MB max cache size
      ...config,
    };
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.cacheDir, { recursive: true });
      await fs.mkdir(path.join(this.config.cacheDir, 'quotes'), { recursive: true });
      await fs.mkdir(path.join(this.config.cacheDir, 'historical'), { recursive: true });
      await fs.mkdir(path.join(this.config.cacheDir, 'metadata'), { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize cache directory: ${error}`);
    }
  }

  /**
   * Get cached quote data
   */
  async getQuote(symbol: string): Promise<QuoteData | null> {
    try {
      const filePath = this.getQuotePath(symbol);
      const data = await fs.readFile(filePath, 'utf-8');
      const cached = JSON.parse(data);

      // Check if cache is still valid
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      if (age > this.config.quoteCacheTTL) {
        return null;
      }

      return cached.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cache quote data
   */
  async setQuote(symbol: string, data: QuoteData): Promise<void> {
    const filePath = this.getQuotePath(symbol);
    const cached = {
      version: this.CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      data,
    };

    await fs.writeFile(filePath, JSON.stringify(cached, null, 2));
  }

  /**
   * Get cached historical data
   */
  async getHistoricalData(
    symbol: string,
    from: Date,
    to: Date
  ): Promise<OHLCVData[] | null> {
    try {
      const cacheKey = this.getHistoricalCacheKey(symbol, from, to);
      const filePath = this.getHistoricalPath(cacheKey);

      const data = await fs.readFile(filePath, 'utf-8');
      const cached = JSON.parse(data);

      // Check if cache is still valid
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      if (age > this.config.historicalCacheTTL) {
        return null;
      }

      // Verify date range matches
      if (cached.from !== from.toISOString().split('T')[0] ||
          cached.to !== to.toISOString().split('T')[0]) {
        return null;
      }

      return cached.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cache historical data
   */
  async setHistoricalData(
    symbol: string,
    from: Date,
    to: Date,
    data: OHLCVData[],
    provider: string
  ): Promise<void> {
    const cacheKey = this.getHistoricalCacheKey(symbol, from, to);
    const filePath = this.getHistoricalPath(cacheKey);

    const cached = {
      version: this.CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      symbol,
      provider,
      dataPoints: data.length,
      data,
    };

    await fs.writeFile(filePath, JSON.stringify(cached, null, 2));

    // Update metadata
    await this.updateMetadata(symbol, from, to, provider, data.length);
  }

  /**
   * Update cache metadata
   */
  private async updateMetadata(
    symbol: string,
    from: Date,
    to: Date,
    provider: string,
    dataPoints: number
  ): Promise<void> {
    const metadata: CacheMetadata = {
      symbol,
      provider,
      from: from.toISOString().split('T')[0] ?? '',
      to: to.toISOString().split('T')[0] ?? '',
      dataPoints,
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + this.config.historicalCacheTTL),
    };

    const metadataPath = path.join(
      this.config.cacheDir,
      'metadata',
      `${symbol.toLowerCase()}.json`
    );

    try {
      const existingData = await fs.readFile(metadataPath, 'utf-8');
      const existing = JSON.parse(existingData);

      // Append to existing metadata array
      const updated = Array.isArray(existing) ? existing : [existing];
      updated.push(metadata);

      await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2));
    } catch (error) {
      // File doesn't exist, create new
      await fs.writeFile(metadataPath, JSON.stringify([metadata], null, 2));
    }
  }

  /**
   * Get metadata for a symbol
   */
  async getMetadata(symbol: string): Promise<CacheMetadata[]> {
    try {
      const metadataPath = path.join(
        this.config.cacheDir,
        'metadata',
        `${symbol.toLowerCase()}.json`
      );

      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);

      return Array.isArray(metadata) ? metadata : [metadata];
    } catch (error) {
      return [];
    }
  }

  /**
   * List all cached symbols
   */
  async listCachedSymbols(): Promise<string[]> {
    try {
      const metadataDir = path.join(this.config.cacheDir, 'metadata');
      const files = await fs.readdir(metadataDir);

      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', '').toUpperCase());
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear cache for a specific symbol
   */
  async clearSymbol(symbol: string): Promise<void> {
    const symbolLower = symbol.toLowerCase();

    // Clear quote cache
    try {
      await fs.unlink(this.getQuotePath(symbol));
    } catch (error) {
      // Ignore if doesn't exist
    }

    // Clear historical cache
    try {
      const historicalDir = path.join(this.config.cacheDir, 'historical');
      const files = await fs.readdir(historicalDir);

      for (const file of files) {
        if (file.startsWith(`${symbolLower}_`)) {
          await fs.unlink(path.join(historicalDir, file));
        }
      }
    } catch (error) {
      // Ignore errors
    }

    // Clear metadata
    try {
      await fs.unlink(
        path.join(this.config.cacheDir, 'metadata', `${symbolLower}.json`)
      );
    } catch (error) {
      // Ignore if doesn't exist
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    try {
      await fs.rm(this.config.cacheDir, { recursive: true, force: true });
      await this.initialize();
    } catch (error) {
      throw new Error(`Failed to clear cache: ${error}`);
    }
  }

  /**
   * Get cache size in MB
   */
  async getCacheSize(): Promise<number> {
    try {
      let totalSize = 0;

      const calculateDirSize = async (dir: string): Promise<number> => {
        let size = 0;
        const files = await fs.readdir(dir, { withFileTypes: true });

        for (const file of files) {
          const filePath = path.join(dir, file.name);

          if (file.isDirectory()) {
            size += await calculateDirSize(filePath);
          } else {
            const stats = await fs.stat(filePath);
            size += stats.size;
          }
        }

        return size;
      };

      totalSize = await calculateDirSize(this.config.cacheDir);
      return totalSize / (1024 * 1024); // Convert to MB
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpired(): Promise<number> {
    let cleaned = 0;

    try {
      const historicalDir = path.join(this.config.cacheDir, 'historical');
      const files = await fs.readdir(historicalDir);

      for (const file of files) {
        const filePath = path.join(historicalDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const cached = JSON.parse(data);

        const age = Date.now() - new Date(cached.cachedAt).getTime();
        if (age > this.config.historicalCacheTTL) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    symbols: number;
    totalSize: number;
    quotesCount: number;
    historicalCount: number;
  }> {
    const symbols = await this.listCachedSymbols();
    const totalSize = await this.getCacheSize();

    let quotesCount = 0;
    let historicalCount = 0;

    try {
      const quotesDir = path.join(this.config.cacheDir, 'quotes');
      const quoteFiles = await fs.readdir(quotesDir);
      quotesCount = quoteFiles.length;
    } catch (error) {
      // Ignore
    }

    try {
      const historicalDir = path.join(this.config.cacheDir, 'historical');
      const historicalFiles = await fs.readdir(historicalDir);
      historicalCount = historicalFiles.length;
    } catch (error) {
      // Ignore
    }

    return {
      symbols: symbols.length,
      totalSize,
      quotesCount,
      historicalCount,
    };
  }

  /**
   * Generate cache key for historical data
   */
  private getHistoricalCacheKey(symbol: string, from: Date, to: Date): string {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    return `${symbol.toLowerCase()}_${fromStr}_${toStr}`;
  }

  private getQuotePath(symbol: string): string {
    return path.join(
      this.config.cacheDir,
      'quotes',
      `${symbol.toLowerCase()}.json`
    );
  }

  private getHistoricalPath(cacheKey: string): string {
    return path.join(this.config.cacheDir, 'historical', `${cacheKey}.json`);
  }
}
