/**
 * DigestBuilder — Plan 10-06 (M2-04 Wave 3)
 *
 * Produces `DigestPayload` for the three ET scheduled slots
 * (MORNING ~08:30, MIDDAY ~12:30, CLOSE ~15:30) and a stateless
 * `renderDigestMarkdown` for Telegram delivery.
 *
 * Inputs (read-only):
 *   - data/intel/scored-articles-YYYY-MM-DD.jsonl
 *   - data/intel/catalyst-flags-YYYY-MM-DD.jsonl  (next-24h window, archived dropped)
 *   - data/intel/polymarket-snapshots-YYYY-MM-DD.jsonl  (MIDDAY/CLOSE only)
 *   - data/intel/news-YYYY-MM-DD.jsonl  (join for headline/publisher/url)
 *
 * No writes. RollupBuilder remains the only writer of derived per-ticker rollups;
 * the digest is a transient render, persisted only by IntelligenceAlerter when
 * it actually fires.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { dedupeCatalystsById, loadAllCatalystFlags } from "../signal/catalyst-loader.js";
import { ScoreBacklog } from "../signal/score-backlog.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
import type {
  CatalystFlag,
  DigestPayload,
  ScoredArticle,
  ScorerHealth,
} from "../signal/types.js";

export interface DigestBuilderOptions {
  /** Data directory. Default "./data/intel". */
  dataDir?: string;
}

export type DigestFlavor = "MORNING" | "MIDDAY" | "CLOSE";

/**
 * Render-friendly human title per flavor. Re-used by the Telegram renderer.
 */
export function digestTitle(flavor: DigestFlavor): string {
  switch (flavor) {
    case "MORNING":
      return "Morning Brief";
    case "MIDDAY":
      return "Mid-Day Update";
    case "CLOSE":
      return "Pre-Close Recap";
  }
}

/**
 * Builds DigestPayload snapshots for the three scheduled ET slots.
 *
 * The "window" for top-story selection is approximated in absolute time
 * (MORNING ≈ overnight 16h lookback; MIDDAY ≈ 4h since open; CLOSE ≈ 3h
 * since midday). ET-time-of-day fence-posts are not asserted here — the
 * scheduler is responsible for firing within ±1 minute of the targets.
 */
export class DigestBuilder {
  private readonly dataDir: string;
  private readonly scoredStore: JsonlStore<ScoredArticle>;
  private readonly snapshotStore: JsonlStore<MarketSnapshot>;
  private readonly newsStore: JsonlStore<NewsArticle>;

  constructor(options: DigestBuilderOptions = {}) {
    this.dataDir = options.dataDir ?? "./data/intel";
    this.scoredStore = new JsonlStore<ScoredArticle>(this.dataDir, "scored-articles");
    this.snapshotStore = new JsonlStore<MarketSnapshot>(this.dataDir, "polymarket-snapshots");
    this.newsStore = new JsonlStore<NewsArticle>(this.dataDir, "news");
  }

  /**
   * Build a digest for the given flavor.
   *
   * `topStories`: top 1-2 (article × ticker) scored rows by materiality DESC,
   *   secondary sort |sentiment| DESC; deduped by sourceArticleId.
   * `upcomingCalendar`: catalyst-flags non-archived with expectedDate in next 24h.
   * `pmMovers`: MIDDAY + CLOSE only. Top 2 PM markets ranked by
   *   |oneHourPriceChange| × log10(volume24hr + 1).
   */
  async build(flavor: DigestFlavor, now: Date = new Date()): Promise<DigestPayload> {
    const windowStart = computeWindowStart(flavor, now);

    // 1) Top stories from scored articles in window
    const scored = await this.loadScoredSince(windowStart, now);
    const topStories = await this.pickTopStories(scored, 2, now);

    // 2) Upcoming calendar (24h)
    const upcomingCalendar = await this.loadUpcomingCalendar(now, 24);

    // 3) PM movers (MIDDAY/CLOSE)
    const pmMovers =
      flavor === "MORNING" ? undefined : await this.loadPmMovers(now, 2);

    // 4) Scorer health — heartbeat for the LLM layer. Never throws: a digest
    //    must still go out if the backlog file is unreadable.
    const scorerHealth = await this.loadScorerHealth(now).catch(() => undefined);

    const payload: DigestPayload = {
      flavor,
      builtAt: now.toISOString(),
      topStories,
      upcomingCalendar,
    };
    if (pmMovers !== undefined) payload.pmMovers = pmMovers;
    if (scorerHealth !== undefined) payload.scorerHealth = scorerHealth;
    return payload;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: scorer health
  // ─────────────────────────────────────────────────────────────────────────

  private async loadScorerHealth(now: Date): Promise<ScorerHealth> {
    const backlog = new ScoreBacklog({ dataDir: this.dataDir });
    const backlogSize = await backlog.size();
    const oldestMs = await backlog.oldestAgeMs();
    // oldestAgeMs is relative to wall-clock; re-base to `now` for testability.
    const oldestBacklogAgeHours =
      oldestMs === null ? null : (oldestMs - (Date.now() - now.getTime())) / (60 * 60 * 1000);

    const lastScoredAt = await this.findLastScoredAt();
    const lastMs = lastScoredAt === null ? null : Date.parse(lastScoredAt);
    const scoredRecently =
      lastMs !== null && Number.isFinite(lastMs) && now.getTime() - lastMs <= 24 * 60 * 60 * 1000;

    return {
      backlogSize,
      oldestBacklogAgeHours,
      lastScoredAt,
      healthy: backlogSize === 0 || scoredRecently,
    };
  }

  /** Newest `scoredAt` across scored-articles files (newest file only — files are day-named). */
  private async findLastScoredAt(): Promise<string | null> {
    const files = await fs.readdir(this.dataDir).catch(() => [] as string[]);
    const newest = files
      .filter((f) => /^scored-articles-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort()
      .pop();
    if (newest === undefined) return null;
    const raw = await fs.readFile(path.join(this.dataDir, newest), "utf8").catch(() => "");
    let best: string | null = null;
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        const ts = (JSON.parse(line) as { scoredAt?: string }).scoredAt;
        if (ts !== undefined && (best === null || ts > best)) best = ts;
      } catch {
        /* skip malformed line */
      }
    }
    return best;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: load scored articles in window
  // ─────────────────────────────────────────────────────────────────────────

  private async loadScoredSince(since: Date, until: Date): Promise<ScoredArticle[]> {
    // Cross-day window (MORNING reaches into prior day). Read today + yesterday.
    const today = await this.scoredStore.readDay(until);
    const yest = await this.scoredStore.readDay(
      new Date(until.getTime() - 24 * 60 * 60 * 1000),
    );
    const sinceMs = since.getTime();
    const untilMs = until.getTime();
    const inWindow = (s: ScoredArticle): boolean => {
      const ts = Date.parse(s.scoredAt);
      return Number.isFinite(ts) && ts >= sinceMs && ts <= untilMs;
    };
    return [...yest, ...today].filter(inWindow);
  }

  private async pickTopStories(
    scored: ScoredArticle[],
    n: number,
    now: Date,
  ): Promise<DigestPayload["topStories"]> {
    if (scored.length === 0) return [];

    // Dedup by sourceArticleId — one row per article in the digest.
    // For an article with multiple ticker fan-outs, take the row with the
    // highest materiality (tiebreak |sentiment|).
    const byArticle = new Map<string, ScoredArticle>();
    for (const s of scored) {
      const existing = byArticle.get(s.sourceArticleId);
      if (
        !existing ||
        s.materiality > existing.materiality ||
        (s.materiality === existing.materiality &&
          Math.abs(s.sentiment) > Math.abs(existing.sentiment))
      ) {
        byArticle.set(s.sourceArticleId, s);
      }
    }

    const ranked = Array.from(byArticle.values()).sort((a, b) => {
      if (b.materiality !== a.materiality) return b.materiality - a.materiality;
      return Math.abs(b.sentiment) - Math.abs(a.sentiment);
    });
    const top = ranked.slice(0, n);

    // Join with news-*.jsonl to recover headline/publisher/url/tickers.
    const articleMeta = await this.loadArticleMeta(top.map((s) => s.sourceArticleId), now);

    return top.map((s) => {
      const meta = articleMeta.get(s.sourceArticleId);
      const publisher = meta?.publisher ?? meta?.source ?? "(unknown)";
      const tickers = meta?.tickers ?? (s.ticker !== "" ? [s.ticker] : []);
      return {
        articleId: s.sourceArticleId,
        headline: meta?.headline ?? "(headline missing)",
        publisher,
        tickers,
        sentiment: s.sentiment,
        materiality: s.materiality,
        rationale: buildRationale(s),
        url: meta?.url ?? "",
      };
    });
  }

  private async loadArticleMeta(ids: string[], now: Date): Promise<Map<string, NewsArticle>> {
    if (ids.length === 0) return new Map();
    const idSet = new Set(ids);
    // Read news for the digest's reference day (+ prior day for cross-day
    // windows), NOT the wall-clock day — otherwise the headline join misses
    // whenever the digest is built for any day other than the literal today.
    const today = await this.newsStore.readDay(now);
    const yest = await this.newsStore.readDay(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    const map = new Map<string, NewsArticle>();
    for (const a of [...yest, ...today]) {
      if (idSet.has(a.id) && !map.has(a.id)) map.set(a.id, a);
    }
    return map;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: calendar window
  // ─────────────────────────────────────────────────────────────────────────

  private async loadUpcomingCalendar(
    now: Date,
    hours: number,
  ): Promise<DigestPayload["upcomingCalendar"]> {
    // Shared loader owns the scan + dedup; this method keeps its own
    // hours-granular window filter (the shared loader's day-granular
    // `loadUpcomingCatalysts` is too coarse for the digest's 24h window).
    const deduped = dedupeCatalystsById(await loadAllCatalystFlags(this.dataDir));

    const cutoffMs = now.getTime() + hours * 60 * 60 * 1000;
    const nowMs = now.getTime();
    return deduped
      .filter((c) => c.archived !== true)
      .filter((c) => {
        const expected = Date.parse(c.expectedDate);
        return Number.isFinite(expected) && expected >= nowMs && expected <= cutoffMs;
      })
      .sort((a, b) => b.magnitudePrior - a.magnitudePrior)
      .slice(0, 5)
      .map((c) => {
        const entry: DigestPayload["upcomingCalendar"][number] = {
          eventId: c.id,
          type: c.type,
          label: humanLabel(c),
          expectedDate: c.expectedDate,
          magnitudePrior: c.magnitudePrior,
          affectedTickers: [...(c.tickers ?? []), ...(c.affectedSectors ?? [])],
        };
        if (c.expectedTimeEt !== undefined) entry.expectedTimeEt = c.expectedTimeEt;
        return entry;
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: PM movers
  // ─────────────────────────────────────────────────────────────────────────

  private async loadPmMovers(
    now: Date,
    n: number,
  ): Promise<DigestPayload["pmMovers"]> {
    const today = await this.snapshotStore.readDay(now);
    if (today.length === 0) return [];

    // Take the latest snapshot per marketId. Since `appendMany` preserves
    // write order in the file, the last occurrence wins.
    const byId = new Map<string, MarketSnapshot>();
    for (const s of today) {
      byId.set(s.id, s);
    }

    const ranked = Array.from(byId.values()).sort((a, b) => {
      const aScore =
        Math.abs(a.oneHourPriceChange ?? 0) * Math.log10(Math.max(a.volume24hr, 1));
      const bScore =
        Math.abs(b.oneHourPriceChange ?? 0) * Math.log10(Math.max(b.volume24hr, 1));
      return bScore - aScore;
    });

    return ranked.slice(0, n).map((m) => ({
      marketId: m.id,
      question: m.question,
      movePp: (m.oneHourPriceChange ?? 0) * 100,
      volume24hr: m.volume24hr,
    }));
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Approximate window start in absolute time. Slot-time fence-posts are
 * enforced by the scheduler; this just decides how far back to look for
 * "top stories".
 */
function computeWindowStart(flavor: DigestFlavor, now: Date): Date {
  const hour = 60 * 60 * 1000;
  if (flavor === "MORNING") return new Date(now.getTime() - 16 * hour); // overnight
  if (flavor === "MIDDAY") return new Date(now.getTime() - 4 * hour); // since open
  return new Date(now.getTime() - 3 * hour); // since midday
}

function buildRationale(s: ScoredArticle): string {
  const dir = s.sentiment >= 0 ? "bullish" : "bearish";
  const mag =
    s.materiality >= 0.7 ? "high-impact" : s.materiality >= 0.4 ? "notable" : "context";
  const themesPart =
    s.themes.length > 0 ? ` themes: ${s.themes.slice(0, 2).join(", ")}.` : "";
  return `${mag} ${dir} (sent=${s.sentiment.toFixed(2)}, mat=${s.materiality.toFixed(2)}).${themesPart}`;
}

function humanLabel(c: CatalystFlag): string {
  const tickerPart =
    (c.tickers ?? []).length > 0 ? ` (${(c.tickers ?? []).join(",")})` : "";
  return `${c.type.replace(/_/g, " ").toUpperCase()}${tickerPart}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Markdown renderer (stateless)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Render a DigestPayload to Telegram MarkdownV1.
 *
 * Layout:
 *   *Title*
 *
 *   *Top stories*
 *   • [TICKERS] _headline_
 *     rationale ([read](url))
 *
 *   *Next 24h calendar*
 *   • `type` LABEL — YYYY-MM-DD HH:MM ET (m=N)
 *
 *   *PM movers*           (MIDDAY/CLOSE only)
 *   • question — ±X.X pp, $vol
 */
export function renderDigestMarkdown(p: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`*${digestTitle(p.flavor)}*`, "");

  // Top stories
  if (p.topStories.length === 0) {
    lines.push("_No high-materiality stories this window._");
  } else {
    lines.push("*Top stories*");
    for (const s of p.topStories) {
      const tickerStr = s.tickers.length > 0 ? `[${s.tickers.join(", ")}]` : "[—]";
      const headlinePart = `${tickerStr} _${escapeMd(s.headline)}_`;
      lines.push(`• ${headlinePart}`);
      const readPart = s.url.length > 0 ? `  ([read](${s.url}))` : "";
      lines.push(`  ${s.rationale}${readPart}`);
    }
  }

  // Calendar
  lines.push("", "*Next 24h calendar*");
  if (p.upcomingCalendar.length === 0) {
    lines.push("_(nothing scheduled)_");
  } else {
    for (const e of p.upcomingCalendar) {
      const when = e.expectedTimeEt
        ? `${e.expectedDate} ${e.expectedTimeEt} ET`
        : e.expectedDate;
      lines.push(
        `• \`${e.type}\` ${escapeMd(e.label)} — ${when} (m=${e.magnitudePrior})`,
      );
    }
  }

  // PM movers (optional)
  if (p.pmMovers && p.pmMovers.length > 0) {
    lines.push("", "*PM movers*");
    for (const m of p.pmMovers) {
      const sign = m.movePp >= 0 ? "+" : "";
      lines.push(
        `• ${escapeMd(m.question)} — ${sign}${m.movePp.toFixed(1)} pp, $${compact(m.volume24hr)}`,
      );
    }
  }

  // Scorer health — always rendered so silence is itself a signal.
  if (p.scorerHealth) {
    lines.push("", renderScorerHealth(p.scorerHealth, p.builtAt));
  }

  return lines.join("\n");
}

function renderScorerHealth(h: ScorerHealth, builtAt: string): string {
  const nowMs = Date.parse(builtAt);
  const lastAgo =
    h.lastScoredAt === null
      ? "never"
      : `${hoursLabel((nowMs - Date.parse(h.lastScoredAt)) / (60 * 60 * 1000))} ago`;
  const backlogPart =
    h.oldestBacklogAgeHours === null
      ? `backlog ${h.backlogSize}`
      : `backlog ${h.backlogSize} (oldest ${hoursLabel(h.oldestBacklogAgeHours)})`;
  if (h.healthy) {
    return `_Scorer ok — ${backlogPart}, last scored ${lastAgo}_`;
  }
  return (
    `⚠️ *Scorer down* — ${backlogPart}, last scored ${lastAgo}. ` +
    `Start LM Studio, then \`pnpm intel backlog-drain\`.`
  );
}

function hoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "?";
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(0)}d`;
}

function escapeMd(s: string): string {
  return s.replace(/([_*[\]`])/g, "\\$1");
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}
