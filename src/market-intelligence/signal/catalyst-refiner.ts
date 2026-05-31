/**
 * CatalystRefiner — M2-04 Plan 10-05
 *
 * Applies scored-article catalyst extractions to the existing catalyst-flag stream.
 *
 * Two passes:
 *
 * (1) REFINEMENT — ScoredArticle.referencedCalendarEvents[]:
 *     For each scored article that references an existing calendar event:
 *       - Pick the "best" article (highest materiality; tie-break by latest scoredAt).
 *       - Update direction from the best article's catalyst matching the existing event's type.
 *       - magnitudePrior = max(existing.magnitudePrior, article-proposed magnitude)
 *         (Articles only refine UP — a scheduled FOMC's prior of 3 can't be revised down by
 *          a single low-conviction article. Aggressive consensus is encoded by repeated refinement.)
 *       - confidence = min(1.0, existing.confidence + 0.1 × best.materiality)
 *       - lastRefinedAt = now
 *
 * (2) EMERGING — ScoredArticle.catalysts[]:
 *     For each catalyst the LLM extracted from the article (not referencing an existing event):
 *       - Construct a new CatalystFlag with id = `article-${sourceArticleId}-${type}-${expectedDate ?? "open"}`
 *       - source = `article:${sourceArticleId}` (article-derived, not calendar-derived)
 *       - tickers = [scored.ticker] when present, [] otherwise (themed-only articles)
 *       - expectedDate = the LLM's expectedDate, or today's ISO if null (catalyst is "open"/active now)
 *
 * (3) ARCHIVE PASS:
 *     Any touched catalyst whose `expectedDate < (now - 1 day)` is marked `archived: true`.
 *     Cutoff is "yesterday" to give a 1-day grace window — a scheduled event happening
 *     "today" is still active until tomorrow's pass.
 *
 * Persistence:
 *     Appends the touched (refined + newEmerging) entries to today's catalyst-flags JSONL.
 *     RollupBuilder.loadActiveCatalysts deduplicates by id at read time, taking the latest
 *     (`lastRefinedAt ?? firstSeenAt`), so re-appending the same id just rolls the timestamp
 *     forward. This matches the existing append-only JSONL pattern (Plan 10-03).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CatalystFlag, ScoredArticle } from "./types.js";

export interface CatalystRefinerOptions {
  /** Default "./data/intel". */
  dataDir?: string;
}

export interface CatalystRefineResult {
  /** Refined-existing entries (existing.id matched a scored article's referencedCalendarEvents). */
  refined: CatalystFlag[];
  /** Newly created entries from scored.catalysts[] (no existing match by composite id). */
  newEmerging: CatalystFlag[];
  /** Count of entries we flipped `archived: true` on in this pass. */
  archived: number;
}

export class CatalystRefiner {
  private readonly dataDir: string;

  constructor(options: CatalystRefinerOptions = {}) {
    this.dataDir = options.dataDir ?? "./data/intel";
  }

  async refineFromScored(
    scored: ScoredArticle[],
    existing: CatalystFlag[],
    now: Date = new Date(),
  ): Promise<CatalystRefineResult> {
    // (1) Index existing by id.
    const byId = new Map(existing.map((c) => [c.id, c] as const));

    // (2) Refinement pass — group scored articles by referenced event id.
    const articleByCatalyst = new Map<string, ScoredArticle[]>();
    for (const s of scored) {
      for (const eid of s.referencedCalendarEvents ?? []) {
        const arr = articleByCatalyst.get(eid) ?? [];
        arr.push(s);
        articleByCatalyst.set(eid, arr);
      }
    }

    const refined: CatalystFlag[] = [];
    for (const [eid, refs] of articleByCatalyst) {
      const cur = byId.get(eid);
      if (!cur) continue; // Unknown referenced event — silently ignore (could log later).

      // Pick the best article: highest materiality; tie-break by latest scoredAt.
      const best = refs
        .slice()
        .sort((a, b) => {
          if (b.materiality !== a.materiality) return b.materiality - a.materiality;
          return Date.parse(b.scoredAt) - Date.parse(a.scoredAt);
        })[0]!;

      const matchingCatalyst = best.catalysts.find((c) => c.type === cur.type);
      const proposedDir = matchingCatalyst?.direction ?? cur.direction;
      const proposedMag = matchingCatalyst?.magnitude ?? cur.magnitudePrior;
      const updated: CatalystFlag = {
        ...cur,
        direction: proposedDir,
        magnitudePrior: Math.max(cur.magnitudePrior, proposedMag) as 1 | 2 | 3 | 4 | 5,
        confidence: Math.min(1.0, cur.confidence + 0.1 * best.materiality),
        lastRefinedAt: now.toISOString(),
      };
      refined.push(updated);
    }

    // (3) Emerging catalysts pass — ScoredArticle.catalysts[].
    const newEmerging: CatalystFlag[] = [];
    for (const s of scored) {
      for (const c of s.catalysts ?? []) {
        const id = `article-${s.sourceArticleId}-${c.type}-${c.expectedDate ?? "open"}`;
        if (byId.has(id)) continue; // Already known — skip emergence.

        const flag: CatalystFlag = {
          id,
          type: c.type,
          tickers: s.ticker ? [s.ticker] : [],
          expectedDate: c.expectedDate ?? (now.toISOString().split("T")[0] ?? ""),
          magnitudePrior: c.magnitude,
          direction: c.direction,
          confidence: c.confidence,
          source: `article:${s.sourceArticleId}`,
          firstSeenAt: now.toISOString(),
        };
        newEmerging.push(flag);
      }
    }

    // (4) Archive pass — any touched entry whose expectedDate < (now - 1 day) gets archived.
    const archiveCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const archiveCutoffIso = archiveCutoff.toISOString().split("T")[0]!;
    const allTouched = [...refined, ...newEmerging];
    let archivedCount = 0;
    for (const c of allTouched) {
      const expectedDay = c.expectedDate.split("T")[0] ?? "";
      if (expectedDay < archiveCutoffIso && c.archived !== true) {
        c.archived = true;
        archivedCount += 1;
      }
    }

    // (5) Append touched entries to today's catalyst-flags JSONL.
    const dayIso = now.toISOString().split("T")[0]!;
    const file = path.join(this.dataDir, `catalyst-flags-${dayIso}.jsonl`);
    const lines = allTouched.map((c) => JSON.stringify(c));
    if (lines.length > 0) {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.appendFile(file, lines.join("\n") + "\n", "utf8");
    }

    return { refined, newEmerging, archived: archivedCount };
  }
}
