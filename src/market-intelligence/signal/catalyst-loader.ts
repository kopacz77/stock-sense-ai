/**
 * catalyst-loader.ts — the single shared scan/dedup/filter over
 * `data/intel/catalyst-flags-*.jsonl` (M2-05 Plan 11-03, Task 1).
 *
 * `catalyst-flags-*.jsonl` is append-only: `CatalystRefiner` re-appends a
 * touched entry on every refinement pass, and `CalendarRefresher` re-appends
 * every unarchived scheduled event on each 24-hour-gated calendar refresh.
 * Raw row count therefore far exceeds distinct-id count (1,560 distinct ids
 * across 68 files as of 2026-08-27) — dedup-by-id-take-latest is mandatory
 * at every read site, not an optimization.
 *
 * Before this module existed, five call sites each independently
 * re-implemented the same scan/dedup/filter logic:
 *   - `RollupBuilder.loadActiveCatalysts` (private)
 *   - `intel-commands.ts`'s `loadAllUpcomingCalendarEvents`
 *   - `digest-builder.ts`'s `loadUpcomingCalendar` (dedup only; keeps its
 *     own hours-granular window filter — see below)
 *   - `cycle-runner.ts`'s `loadUpcomingEvents` and `loadAllCatalysts`
 * All five now delegate here. This file owns the scan, the malformed-line
 * tolerance, and the dedup rule; callers own only their own window
 * semantics (days vs. hours vs. no filter at all).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CatalystFlag } from "./types.js";

const CATALYST_FLAGS_FILE_RE = /^catalyst-flags-\d{4}-\d{2}-\d{2}\.jsonl$/;

/**
 * Scan every `catalyst-flags-*.jsonl` file in `dataDir` and parse every
 * line. A malformed JSONL line is skipped, not thrown on — it does not
 * abort the surrounding file or the scan. A missing `dataDir` yields an
 * empty array rather than an `ENOENT` throw. Returns the raw, undeduplicated,
 * unfiltered set — callers almost always want `dedupeCatalystsById` (or one
 * of the two filtered helpers below) applied on top.
 */
export async function loadAllCatalystFlags(dataDir: string): Promise<CatalystFlag[]> {
  const files = await fs.readdir(dataDir).catch(() => [] as string[]);
  const matching = files.filter((f) => CATALYST_FLAGS_FILE_RE.test(f));
  const all: CatalystFlag[] = [];
  for (const f of matching) {
    const content = await fs.readFile(path.join(dataDir, f), "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        all.push(JSON.parse(trimmed) as CatalystFlag);
      } catch {
        /* skip malformed */
      }
    }
  }
  return all;
}

/**
 * Dedup a set of catalyst flags by `id`, keeping — for a repeated id — the
 * flag with the later `lastRefinedAt ?? firstSeenAt`, regardless of file or
 * array order.
 */
export function dedupeCatalystsById(flags: CatalystFlag[]): CatalystFlag[] {
  const byId = new Map<string, CatalystFlag>();
  for (const c of flags) {
    const existing = byId.get(c.id);
    const cTs = Date.parse(c.lastRefinedAt ?? c.firstSeenAt);
    const eTs = existing
      ? Date.parse(existing.lastRefinedAt ?? existing.firstSeenAt)
      : Number.NEGATIVE_INFINITY;
    if (!existing || cTs > eTs) byId.set(c.id, c);
  }
  return Array.from(byId.values());
}

/**
 * Scan + dedup, then filter to non-archived flags whose `expectedDate` (date
 * part only — a full ISO timestamp is compared on its date prefix) is on or
 * after `dayIso`. This is the "still active as of today" query — no upper
 * bound.
 */
export async function loadActiveCatalysts(
  dataDir: string,
  dayIso: string,
): Promise<CatalystFlag[]> {
  const deduped = dedupeCatalystsById(await loadAllCatalystFlags(dataDir));
  return deduped.filter(
    (c) => c.archived !== true && (c.expectedDate.split("T")[0] ?? "") >= dayIso,
  );
}

/**
 * Scan + dedup, then filter to non-archived flags whose `expectedDate` (date
 * part only) falls within `[fromIso, fromIso + days]` inclusive on both
 * ends.
 */
export async function loadUpcomingCatalysts(
  dataDir: string,
  fromIso: string,
  days: number,
): Promise<CatalystFlag[]> {
  const deduped = dedupeCatalystsById(await loadAllCatalystFlags(dataDir));
  const fromMs = Date.parse(fromIso);
  const toIso = new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
  return deduped.filter((c) => {
    if (c.archived === true) return false;
    const ed = c.expectedDate.split("T")[0] ?? "";
    return ed >= fromIso && ed <= toIso;
  });
}
