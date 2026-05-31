/**
 * Themes-review helpers — Plan 10-07 Task 2.
 *
 * Pure-logic surface (no readline I/O here) for the `intel themes review` CLI.
 * Aggregates LLM-proposed themes from the last N days of `scored-articles-*.jsonl`,
 * filters out themes that are already canonical / aliased / rejected, returns
 * candidates sorted by mention count descending.
 *
 * Why a separate file: keeps `intel-commands.ts` thin and makes
 * `aggregateThemeCandidates` unit-testable in isolation. The interactive
 * accept/alias/reject readline loop lives in intel-commands.ts and is
 * exercised by operators during real use, not in unit tests.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { ScoredArticle } from "../signal/types.js";
import type { NewsArticle } from "../news/types.js";

export interface ThemesConfigShape {
  version: number;
  lastUpdated: string;
  themes: Array<{ canonical: string; aliases: string[] }>;
}

export interface ThemesRejectedShape {
  version: number;
  rejected: string[];
}

export interface ThemeCandidate {
  theme: string;
  mentions: number;
  tickers: string[];
  samples: Array<{ articleId: string; headline: string; publisher: string; materiality: number }>;
}

export interface AggregateOptions {
  days: number;
  minMentions: number;
  dataDir?: string;
  configDir?: string;
}

/**
 * Read scored-articles-*.jsonl across the last N days, tally theme mentions
 * per (theme), and exclude themes that are already canonicalized or rejected.
 *
 * Returns candidates sorted by mention count descending then by theme name
 * (stable secondary sort for deterministic output).
 */
export async function aggregateThemeCandidates(
  options: AggregateOptions,
): Promise<ThemeCandidate[]> {
  const dataDir = options.dataDir ?? "./data/intel";
  const configDir = options.configDir ?? "./config";

  const scored = await loadScoredWindow(dataDir, options.days);
  if (scored.length === 0) return [];

  const themesCfg = await readThemesConfig(configDir);
  const rejectedCfg = await readRejectedConfig(configDir);

  // Build the exclusion set: canonical names + every alias + every rejected.
  const excluded = new Set<string>();
  for (const entry of themesCfg.themes) {
    excluded.add(entry.canonical);
    for (const a of entry.aliases) excluded.add(a);
  }
  for (const r of rejectedCfg.rejected) excluded.add(r);

  // Tally mentions + tickers per theme.
  const tally = new Map<
    string,
    {
      mentions: number;
      tickers: Set<string>;
      samples: Array<{ articleId: string; materiality: number }>;
    }
  >();
  for (const s of scored) {
    for (const theme of s.themes ?? []) {
      if (excluded.has(theme)) continue;
      const cur =
        tally.get(theme) ??
        ({ mentions: 0, tickers: new Set<string>(), samples: [] } as {
          mentions: number;
          tickers: Set<string>;
          samples: Array<{ articleId: string; materiality: number }>;
        });
      cur.mentions += 1;
      if (s.ticker) cur.tickers.add(s.ticker);
      cur.samples.push({ articleId: s.sourceArticleId, materiality: s.materiality });
      tally.set(theme, cur);
    }
  }

  // Filter to >=minMentions, then enrich with headline samples (highest-materiality first).
  const survivors: Array<{
    theme: string;
    mentions: number;
    tickers: string[];
    sampleArticleIds: string[];
  }> = [];
  for (const [theme, info] of tally) {
    if (info.mentions < options.minMentions) continue;
    const sortedSamples = info.samples
      .slice()
      .sort((a, b) => b.materiality - a.materiality)
      .slice(0, 2);
    survivors.push({
      theme,
      mentions: info.mentions,
      tickers: Array.from(info.tickers).sort(),
      sampleArticleIds: sortedSamples.map((s) => s.articleId),
    });
  }

  if (survivors.length === 0) return [];

  // Fetch headline + publisher for sample articleIds.
  const allSampleIds = Array.from(new Set(survivors.flatMap((s) => s.sampleArticleIds)));
  const headlines = await loadHeadlinesForArticleIds(dataDir, allSampleIds, options.days + 7);

  const candidates: ThemeCandidate[] = survivors.map((s) => ({
    theme: s.theme,
    mentions: s.mentions,
    tickers: s.tickers,
    samples: s.sampleArticleIds.map((id) => {
      const h = headlines.get(id);
      return {
        articleId: id,
        headline: h?.headline ?? "(headline not found)",
        publisher: h?.publisher ?? "—",
        // Re-lookup materiality from tally if needed — but we already have the
        // article id and only need it for display, so 0 is fine here.
        materiality: 0,
      };
    }),
  }));

  candidates.sort((a, b) => {
    if (b.mentions !== a.mentions) return b.mentions - a.mentions;
    return a.theme.localeCompare(b.theme);
  });
  return candidates;
}

// ───────────────────────────────────────────────────────────────────────────
// Config I/O (atomic temp-rename writes — pattern matches RollupBuilder)
// ───────────────────────────────────────────────────────────────────────────

export async function readThemesConfig(configDir = "./config"): Promise<ThemesConfigShape> {
  const file = path.join(configDir, "themes.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ThemesConfigShape;
    if (!Array.isArray(parsed.themes)) throw new Error("themes.json missing 'themes' array");
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, lastUpdated: new Date().toISOString().split("T")[0]!, themes: [] };
    }
    throw err;
  }
}

export async function writeThemesConfig(
  cfg: ThemesConfigShape,
  configDir = "./config",
): Promise<void> {
  const file = path.join(configDir, "themes.json");
  const tmp = `${file}.tmp`;
  cfg.lastUpdated = new Date().toISOString().split("T")[0]!;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

export async function readRejectedConfig(configDir = "./config"): Promise<ThemesRejectedShape> {
  const file = path.join(configDir, "themes-rejected.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ThemesRejectedShape;
    if (!Array.isArray(parsed.rejected)) throw new Error("themes-rejected.json missing 'rejected' array");
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, rejected: [] };
    }
    throw err;
  }
}

export async function writeRejectedConfig(
  cfg: ThemesRejectedShape,
  configDir = "./config",
): Promise<void> {
  const file = path.join(configDir, "themes-rejected.json");
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

// ───────────────────────────────────────────────────────────────────────────
// Internal scanners
// ───────────────────────────────────────────────────────────────────────────

async function loadScoredWindow(dataDir: string, days: number): Promise<ScoredArticle[]> {
  const store = new JsonlStore<ScoredArticle>(dataDir, "scored-articles");
  const out: ScoredArticle[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const rows = await store.readDay(d);
    out.push(...rows);
  }
  return out;
}

async function loadHeadlinesForArticleIds(
  dataDir: string,
  ids: string[],
  maxLookbackDays: number,
): Promise<Map<string, { headline: string; publisher: string }>> {
  const out = new Map<string, { headline: string; publisher: string }>();
  if (ids.length === 0) return out;
  const idSet = new Set(ids);
  const store = new JsonlStore<NewsArticle>(dataDir, "news");
  for (let i = 0; i < maxLookbackDays; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const rows = await store.readDay(d);
    for (const a of rows) {
      if (idSet.has(a.id)) {
        out.set(a.id, { headline: a.headline, publisher: a.publisher ?? a.source });
        idSet.delete(a.id);
        if (idSet.size === 0) return out;
      }
    }
  }
  return out;
}
