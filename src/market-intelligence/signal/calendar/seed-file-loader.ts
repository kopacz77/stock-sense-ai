/**
 * Seed-file Calendar Loader — M2-04 Plan 10-03
 *
 * Reads operator-maintained JSON seed files (FDA PDUFA + OPEC schedule)
 * and emits CalendarEvents. The seed files are operator-curated because
 * neither category has a clean free-tier API:
 *   - FDA PDUFA: behind paywalls (biopharmcatalyst); operator copies
 *     quarterly from public summary pages.
 *   - OPEC: schedule announced via press release, no structured feed;
 *     operator updates annually each December.
 *
 * Missing files (ENOENT) are treated as empty seeds — graceful degradation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CalendarEvent } from "../types.js";

export interface SeedFileLoaderOptions {
  /** Path to the config directory containing the seed JSONs. Default: "./config". */
  configDir?: string;
}

interface PdufaEntry {
  ticker: string;
  drug_name: string;
  indication?: string;
  expected_date: string; // YYYY-MM-DD
  source_url?: string;
  last_verified?: string;
}

interface PdufaSeedFile {
  version?: number;
  lastUpdated?: string;
  entries: PdufaEntry[];
}

interface OpecEntry {
  meeting_type: "OPEC" | "JMMC" | "extraordinary";
  date: string; // YYYY-MM-DD
  source_url?: string;
}

interface OpecSeedFile {
  version?: number;
  lastUpdated?: string;
  entries: OpecEntry[];
}

export class SeedFileCalendarLoader {
  private readonly configDir: string;

  constructor(options: SeedFileLoaderOptions = {}) {
    this.configDir = options.configDir ?? "./config";
  }

  async loadAll(): Promise<CalendarEvent[]> {
    const [pdufa, opec] = await Promise.all([this.loadPdufa(), this.loadOpec()]);
    return [...pdufa, ...opec];
  }

  private async loadPdufa(): Promise<CalendarEvent[]> {
    const raw = await this.readJson<PdufaSeedFile>("fda-pdufa-seed.json");
    if (!raw || !Array.isArray(raw.entries)) return [];
    const now = new Date().toISOString();
    return raw.entries.map((e) => ({
      id: `fda-pdufa-${e.ticker.toUpperCase()}-${e.expected_date}`,
      type: "fda_pdufa" as const,
      tickers: [e.ticker.toUpperCase()],
      affectedSectors: [],
      expectedDate: e.expected_date,
      magnitudePrior: 5 as const, // binary single-name event = high impact
      direction: "binary" as const,
      confidence: 0.6,
      source: "calendar:fda-pdufa-seed" as const,
      sourceMeta: {
        drug_name: e.drug_name,
        indication: e.indication,
        source_url: e.source_url,
        last_verified: e.last_verified,
      },
      firstSeenAt: now,
    }));
  }

  private async loadOpec(): Promise<CalendarEvent[]> {
    const raw = await this.readJson<OpecSeedFile>("opec-schedule-seed.json");
    if (!raw || !Array.isArray(raw.entries)) return [];
    const now = new Date().toISOString();
    return raw.entries.map((e) => ({
      id: `opec-${e.meeting_type.toLowerCase()}-${e.date}`,
      type: "opec" as const,
      tickers: [],
      affectedSectors: ["XLE", "USO", "UNG"],
      expectedDate: e.date,
      magnitudePrior: 4 as const,
      direction: "uncertain" as const,
      confidence: 0.5,
      source: "calendar:opec-seed" as const,
      sourceMeta: {
        meeting_type: e.meeting_type,
        source_url: e.source_url,
      },
      firstSeenAt: now,
    }));
  }

  private async readJson<T>(filename: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(path.join(this.configDir, filename), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}
