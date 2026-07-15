/**
 * PM-to-Ticker Mapping Engine (M2-04 Plan 10-04)
 *
 * Translates raw Polymarket `MarketSnapshot` records into actionable per-ticker
 * signal contributions using a hybrid approach:
 *
 *   1. Table-driven match against `config/pm-market-mappings.json`
 *      - Primary join key: `eventSlug` (exact) or `eventSlugPrefix` (case-insensitive
 *        prefix). Prefer the prefix: Polymarket appends volatile suffixes within an
 *        event family (`iran-full-airspace-closure-byptptpt-20260625195253028`), so
 *        exact equality silently misses the family.
 *      - Secondary: `slugPrefix` (case-insensitive prefix on slug)
 *      - Tertiary: `questionContains` (case-insensitive substring on question) —
 *        the discriminator when one event family holds opposite-meaning markets
 *        (Fed "decrease" vs "increase" interest rates).
 *      All populated criteria are ANDed.
 *   2. Exclusion filter (sports/entertainment via EXCLUSION_KEYWORDS) runs
 *      BEFORE the mapping pass so false-positive matches never reach scoring.
 *   3. Markets with NO matching rule surface as `PmMappingProposal` records
 *      for weekly operator review. The article scorer (Plan 10-02) may later
 *      populate `proposedTickers` via LLM extraction — both write paths
 *      persist to the same proposals store, merged by Plan 10-07's review CLI.
 *
 * ## Sign math (interpretation × direction × movePp)
 *
 *   contributedScore = movePp × directionSign × weight × interpretationSign
 *     where directionSign     = direction === "long" ? +1 : -1
 *     and   interpretationSign = interpretation === "noPp" ? -1 : +1
 *
 *   | interpretation | direction | movePp | contributedScore | meaning                              |
 *   |----------------|-----------|--------|------------------|--------------------------------------|
 *   | yesPp          | long      |   +4   |   +4 × +1 × +1 = +4 (bullish)        | Yes rising = bullish for long ticker |
 *   | yesPp          | long      |   -4   |   -4 × +1 × +1 = -4 (bearish)        | Yes falling = bearish for long       |
 *   | yesPp          | short     |   +4   |   +4 × -1 × +1 = -4 (bearish)        | Yes rising = bearish for short       |
 *   | noPp           | long      |   -4   |   -4 × +1 × -1 = +4 (bullish)        | Yes falling = bullish (e.g. ceasefire breaks) |
 *   | noPp           | short     |   -4   |   -4 × -1 × -1 = -4 (bearish)        | Yes falling = bearish for short      |
 *
 *   Worked example (M2-03 canonical Iran ceasefire signal):
 *     mapping:    iran-ceasefire-continues-through, interpretation=noPp, XLE long weight=1.0
 *     snapshot:   oneHourPriceChange = -0.04 (-4pp)
 *     math:       movePp=-4, dirSign=+1 (long), weight=1.0, interpSign=-1 (noPp)
 *                 contributedScore = -4 × +1 × 1.0 × -1 = +4 (bullish XLE — "war risk back")
 *
 * Stateless engine — no LLM call inside. The LLM fallback hook is the article
 * scorer, which writes its own proposals to the same `pm-mappings-proposed-*.jsonl`
 * stream. This engine only persists the "we saw this market but had no mapping"
 * shell record (with `proposedTickers: []`) that the scorer may later enrich.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { MarketSnapshot } from "../polymarket/types.js";
import { isExcludedByKeyword } from "../polymarket/relevance-filter.js";
import { JsonlStore } from "../storage/jsonl-store.js";

import type { PmMapping, PmMappingProposal } from "./types.js";

export interface TickerSignal {
  ticker: string;
  direction: "long" | "short";
  weight: number;
  /** Signed score: movePp × sign(direction) × weight × sign(interpretation). */
  contributedScore: number;
  /** Original 1h price change in pp (signed) — for traceability. */
  movePp: number;
  /** The market that produced this signal. */
  sourceMarketId: string;
  sourceSlug: string;
  sourceEventSlug?: string;
  sourceQuestion: string;
  sourceVolume24hr: number;
  /** Which mapping rule matched (composite key of populated match fields). */
  matchedBy: string;
}

export interface PmMappingEngineOptions {
  /** Path to the JSON mapping config. Default: ./config/pm-market-mappings.json */
  configPath?: string;
  /** Directory for proposal JSONL persistence. Default: ./data/intel */
  dataDir?: string;
}

interface ConfigFileShape {
  version: number;
  lastUpdated: string;
  mappings: PmMapping[];
  proposed: unknown[];
}

export type MapMarketResult =
  | { excluded: true }
  | { unmatched: true }
  | { tickerSignals: TickerSignal[] };

export class PmMappingEngine {
  private readonly configPath: string;
  private readonly proposalStore: JsonlStore<PmMappingProposal>;
  private mappings: PmMapping[] | null = null;

  constructor(options: PmMappingEngineOptions = {}) {
    this.configPath =
      options.configPath ?? path.resolve("./config/pm-market-mappings.json");
    this.proposalStore = new JsonlStore<PmMappingProposal>(
      options.dataDir ?? "./data/intel",
      "pm-mappings-proposed",
    );
  }

  /**
   * Map a single market against the loaded mapping table.
   *
   *   - `{ excluded: true }` — question matched an EXCLUSION_KEYWORDS entry;
   *     caller should skip silently (no signal, no proposal).
   *   - `{ unmatched: true }` — no mapping rule fired; caller may persist a
   *     `PmMappingProposal` for operator review (mapMarkets does this).
   *   - `{ tickerSignals: [...] }` — one or more mapping rules fired; the
   *     ticker contributions from all matching rules are concatenated.
   */
  async mapMarket(snapshot: MarketSnapshot): Promise<MapMarketResult> {
    if (this.isExcluded(snapshot)) return { excluded: true };

    const mappings = await this.loadMappings();
    const hits = mappings.filter((m) => this.matches(m, snapshot));
    if (hits.length === 0) return { unmatched: true };

    const tickerSignals: TickerSignal[] = [];
    const movePp = (snapshot.oneHourPriceChange ?? 0) * 100;

    for (const m of hits) {
      const interpSign = m.interpretation === "noPp" ? -1 : 1;
      for (const t of m.tickers) {
        const dirSign = t.direction === "long" ? 1 : -1;
        const contributedScore = movePp * dirSign * t.weight * interpSign;
        tickerSignals.push({
          ticker: t.ticker,
          direction: t.direction,
          weight: t.weight,
          contributedScore,
          movePp,
          sourceMarketId: snapshot.id,
          sourceSlug: snapshot.slug,
          sourceEventSlug: snapshot.eventSlug,
          sourceQuestion: snapshot.question,
          sourceVolume24hr: snapshot.volume24hr,
          matchedBy: this.matchKey(m),
        });
      }
    }

    return { tickerSignals };
  }

  /**
   * Batch convenience: map many snapshots; collect signals, persist proposals.
   * Excluded markets are silently dropped (only counted).
   */
  async mapMarkets(snapshots: MarketSnapshot[]): Promise<{
    tickerSignals: TickerSignal[];
    proposals: PmMappingProposal[];
    excludedCount: number;
  }> {
    const tickerSignals: TickerSignal[] = [];
    const proposals: PmMappingProposal[] = [];
    let excludedCount = 0;

    for (const snapshot of snapshots) {
      const result = await this.mapMarket(snapshot);
      if ("excluded" in result) {
        excludedCount++;
        continue;
      }
      if ("unmatched" in result) {
        proposals.push({
          marketId: snapshot.id,
          slug: snapshot.slug,
          eventSlug: snapshot.eventSlug,
          question: snapshot.question,
          // Empty — the article scorer's LLM fallback may populate later.
          proposedTickers: [],
          interpretationSuggestion: "yesPp",
          proposedAt: new Date().toISOString(),
        });
        continue;
      }
      tickerSignals.push(...result.tickerSignals);
    }

    if (proposals.length > 0) {
      await this.proposalStore.appendMany(proposals);
    }

    return { tickerSignals, proposals, excludedCount };
  }

  /** Invalidate the in-memory mapping cache (e.g. after `intel pm-mappings review` writes). */
  invalidateCache(): void {
    this.mappings = null;
  }

  /** Number of mappings currently loaded (for diagnostics). Loads if not yet loaded. */
  async mappingCount(): Promise<number> {
    const mappings = await this.loadMappings();
    return mappings.length;
  }

  // ---- private helpers ----

  private async loadMappings(): Promise<PmMapping[]> {
    if (this.mappings !== null) return this.mappings;
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as ConfigFileShape;
      this.mappings = parsed.mappings ?? [];
      return this.mappings;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn(
          `[PmMappingEngine] config file not found at ${this.configPath} — mapping disabled`,
        );
        this.mappings = [];
        return [];
      }
      throw err;
    }
  }

  private matches(m: PmMapping, s: MarketSnapshot): boolean {
    const eventSlugPrefix = m.match.eventSlugPrefix ?? null;
    // Refuse to fire a catch-all (all-null) mapping — would match every market.
    if (
      m.match.eventSlug === null &&
      eventSlugPrefix === null &&
      m.match.slugPrefix === null &&
      m.match.questionContains === null
    ) {
      return false;
    }
    if (m.match.eventSlug !== null && s.eventSlug !== m.match.eventSlug) {
      return false;
    }
    if (
      eventSlugPrefix !== null &&
      !(s.eventSlug ?? "").toLowerCase().startsWith(eventSlugPrefix.toLowerCase())
    ) {
      return false;
    }
    if (
      m.match.slugPrefix !== null &&
      !s.slug.toLowerCase().startsWith(m.match.slugPrefix.toLowerCase())
    ) {
      return false;
    }
    if (
      m.match.questionContains !== null &&
      !s.question.toLowerCase().includes(m.match.questionContains.toLowerCase())
    ) {
      return false;
    }
    return true;
  }

  private isExcluded(s: MarketSnapshot): boolean {
    // Word-boundary match (shared with the fetch-time relevance filter) — a plain
    // substring test wrongly excludes "diplomatic" via "ipl", "album" via itself, etc.
    return isExcludedByKeyword(s.question);
  }

  private matchKey(m: PmMapping): string {
    const parts: string[] = [];
    if (m.match.eventSlug) parts.push(`eventSlug=${m.match.eventSlug}`);
    if (m.match.eventSlugPrefix)
      parts.push(`eventSlugPrefix=${m.match.eventSlugPrefix}`);
    if (m.match.slugPrefix) parts.push(`slugPrefix=${m.match.slugPrefix}`);
    if (m.match.questionContains)
      parts.push(`questionContains="${m.match.questionContains}"`);
    return parts.join("&") || "(empty)";
  }
}
