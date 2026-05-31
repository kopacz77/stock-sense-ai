import * as fs from "node:fs/promises";
import * as path from "node:path";
import { IntelligenceAlerter, alertPriority } from "../alerts/intelligence-alerter.js";
import { HeadlinePmCorrelator } from "../correlator/headline-pm-correlator.js";
import { LlmCorrelator } from "../correlator/llm-correlator.js";
import { LlmCostTracker } from "../correlator/cost-tracker.js";
import { MacroNewsPoller } from "../news/macro-news-poller.js";
import { NewsPoller } from "../news/news-poller.js";
import { PolymarketClient } from "../polymarket/polymarket-client.js";
import {
  filterRelevantMarkets,
  RELEVANT_TOPIC_KEYWORDS,
} from "../polymarket/relevance-filter.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { IntelligenceAlert } from "../alerts/types.js";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";

// M2-04 signal layer wiring
import { ArticleScorer, type ScoringContext } from "../signal/article-scorer.js";
import { ScoreBacklog } from "../signal/score-backlog.js";
import { PmMappingEngine } from "../signal/pm-mapping-engine.js";
import { CatalystRefiner } from "../signal/catalyst-refiner.js";
import { RollupBuilder } from "../signal/rollup-builder.js";
import { CalendarRefresher, type CalendarRefresherOptions } from "../signal/calendar/index.js";
import type {
  CalendarEvent,
  CatalystFlag,
  ScoredArticle,
  TickerDaySummary,
} from "../signal/types.js";

// ───────────────────────────────────────────────────────────────────────────
// Priority detection (soft-cap deprioritization helper)
// ───────────────────────────────────────────────────────────────────────────
//
// NOTE (M2-05 design): the per-article scored stream + rollup file produced here
// are M2-04's primary deliverable. M2-05 will design fresh signal modules; M2-04's
// job is to provide the data substrate, not consume it. Do not embed strategy
// logic in scoring or rollup — keep them descriptive, leave ranking/sizing to M2-05.

/** Flat lowercase macro keyword set; built once at module load from RELEVANT_TOPIC_KEYWORDS. */
const MACRO_KEYWORDS: ReadonlySet<string> = new Set(
  Object.values(RELEVANT_TOPIC_KEYWORDS).flat().map((k) => k.toLowerCase()),
);

/**
 * True if the article should be scored even when the daily cap is hit.
 * Priority articles: ticker ∈ watchlist OR body matches a macro keyword.
 * Soft cap drops everything else past the limit.
 */
function isPriorityArticle(article: NewsArticle, watchlist: Set<string>): boolean {
  if (article.tickers.some((t) => watchlist.has(t.toUpperCase()))) return true;
  const hay = `${article.headline} ${article.summary ?? ""}`.toLowerCase();
  for (const kw of MACRO_KEYWORDS) {
    if (hay.includes(kw)) return true;
  }
  return false;
}

export interface LlmConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  provider: "local" | "remote";
}

export interface CycleOptions {
  finnhubApiKey: string;
  /** Optional LLM config. If omitted, the rule-based correlator is used AND scoring is skipped. */
  llm?: LlmConfig;
  watchlist: string[];
  minMovePp?: number;
  dailyCapUsd?: number;
  dataDir?: string;
  /** When true, only print alerts to stdout; do not send to Telegram. */
  dryRun?: boolean;
  // ── M2-04 additions ───────────────────────────────────────────────────────
  /** Optional FRED API key for the daily calendar refresh. */
  fredApiKey?: string;
  /** Soft cap on articles scored per ET day. Default 500. */
  scoreDailyCap?: number;
  /** Max backlog entries drained at end-of-step. Default 50. */
  backlogDrainCap?: number;
  /** Sector/macro ETF tickers used for ScoringContext.tickerUniverse and calendar earnings filter. */
  macroTickers?: string[];
  /** Skip the rollup build step (for tests or rule-based-only cycles). Default false. */
  skipRollup?: boolean;
}

export interface CycleResult {
  articles: number;
  rawMarkets: number;
  relevantMarkets: number;
  alerts: IntelligenceAlert[];
  alertsSent: number;
  llmUsedUsd: number;
  llmDailyUsedUsd: number;
  llmDailyCapUsd: number;
  correlator: "llm" | "rule-based";
  durationMs: number;
  // ── M2-04 additions ──────────────────────────────────────────────────────
  /** Number of ScoredArticle records produced this cycle (fresh + drained). */
  scoredArticles: number;
  /** Articles that failed scoring this cycle and were enqueued to backlog. */
  backloggedArticles: number;
  /** Backlog size after this cycle's drain attempt. */
  backlogSize: number;
  /** Number of TickerDaySummary rows in today's rollup file. */
  rollupTickerCount: number;
  /** Number of PM-derived TickerSignal records produced from today's snapshots. */
  pmTickerSignalCount: number;
}

/**
 * Reusable polling cycle. Called from both the CLI's `intel run-once` action
 * and the scheduler's tick handler. Idempotent (safe to call repeatedly).
 *
 * Pipeline:
 *   1. Fetch (equity news + macro RSS + Polymarket — parallel)
 *   2. Persist raw streams (news + polymarket-snapshots JSONL)
 *   3. Correlate (existing LlmCorrelator or rule-based fallback) → IntelligenceAlert[]
 *   3.5 Score new articles (sequential, soft-cap + watchlist-priority, backlog on LLM-fail)
 *   3.6 Map PM snapshots via PmMappingEngine → TickerSignal[]
 *   3.7 Refine catalysts from scored.referencedCalendarEvents
 *   3.8 Daily calendar refresh (24h-guarded, separate state file)
 *   3.9 Build today's rollup → ticker-day-summary-YYYY-MM-DD.jsonl
 *   4. Dispatch alerts to Telegram (unchanged from M2-03)
 *
 * Plan 10-06 (DigestBuilder) will insert step 3.95 between rollup build and dispatch.
 * That slot is intentionally left clean here.
 */
export async function runCycle(options: CycleOptions): Promise<CycleResult> {
  const start = Date.now();
  const dataDir = options.dataDir ?? "./data/intel";
  const minMovePp = options.minMovePp ?? 0.5;
  const dailyCap = options.dailyCapUsd ?? 5;

  // ── 1. Fetch — equity news (Finnhub), macro RSS, Polymarket in parallel.
  // Macro RSS is the source for geopolitical/policy headlines that never
  // mention a ticker but drive sector/ETF trades (Iran ceasefire → XLE, etc.).
  const poller = new NewsPoller({ finnhubApiKey: options.finnhubApiKey, lookbackHours: 6 });
  const macroPoller = new MacroNewsPoller({ lookbackHours: 6 });
  const pm = new PolymarketClient();
  const [equityArticles, macroArticles, rawMarkets] = await Promise.all([
    options.watchlist.length > 0
      ? poller.fetchWatchlistNews(options.watchlist)
      : Promise.resolve([] as NewsArticle[]),
    macroPoller.fetchAll(),
    pm.fetchActiveMarkets({ limit: 500, minVolume24hr: 10_000 }),
  ]);
  const articles = [...equityArticles, ...macroArticles].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const markets = filterRelevantMarkets(rawMarkets);

  // ── 2. Persist raw streams.
  await persistStreams(dataDir, articles, markets);

  // ── 3. Correlate (existing M2-03 behavior — LLM or rule-based).
  const costTracker = new LlmCostTracker(dataDir);
  const usedToday = await costTracker.todayUsd();
  let alerts: IntelligenceAlert[];
  let llmUsedUsd = 0;
  let correlator: "llm" | "rule-based";

  const remoteCapHit = options.llm?.provider === "remote" && usedToday >= dailyCap;
  if (options.llm && !remoteCapHit) {
    try {
      const llm = new LlmCorrelator({
        endpoint: options.llm.endpoint,
        model: options.llm.model,
        apiKey: options.llm.apiKey,
        minMovePp,
      });
      const result = await llm.correlate(markets, articles);
      alerts = result.alerts;
      llmUsedUsd = result.cost.usdEstimate;
      if (llmUsedUsd > 0) await costTracker.record(result.cost);
      correlator = "llm";
    } catch (err) {
      console.warn(
        `[cycle-runner] LLM correlator failed, falling back to rules: ${
          err instanceof Error ? err.message : err
        }`,
      );
      const rules = new HeadlinePmCorrelator({ minMovePp });
      alerts = rules.correlate(markets, articles);
      correlator = "rule-based";
    }
  } else {
    const rules = new HeadlinePmCorrelator({ minMovePp });
    alerts = rules.correlate(markets, articles);
    correlator = "rule-based";
  }

  // ── 3.5 Article scoring (M2-04 step). NOTE: NO Promise.all — sequential by
  // construction. ArticleScorer has its own sequential gate, but we also avoid
  // Promise.all here for clarity. See ScoreBacklog for failure semantics.
  let scoringResult: { scored: ScoredArticle[]; backlogged: number; backlogSize: number } = {
    scored: [],
    backlogged: 0,
    backlogSize: 0,
  };
  if (options.llm) {
    try {
      scoringResult = await runArticleScoring(articles, options, dataDir);
    } catch (err) {
      console.warn(
        `[cycle-runner] article scoring failed (continuing without scored records): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  // ── 3.6 PM mapping.
  const pmEngine = new PmMappingEngine({ dataDir });
  const pmMapResult = await pmEngine.mapMarkets(markets);
  const pmSignals = pmMapResult.tickerSignals;

  // ── 3.7 Catalyst refinement (only if we scored something this cycle).
  if (scoringResult.scored.length > 0) {
    try {
      const existingCatalysts = await loadAllCatalysts(dataDir);
      const refiner = new CatalystRefiner({ dataDir });
      await refiner.refineFromScored(scoringResult.scored, existingCatalysts);
    } catch (err) {
      console.warn(
        `[cycle-runner] catalyst refinement failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── 3.8 Daily calendar refresh (24h-guarded; separate state file).
  await maybeRefreshCalendar(options, dataDir);

  // ── 3.9 Build today's rollup. Plan 10-06 will insert DigestBuilder as step 3.95
  // between this and dispatch — leave that slot clean.
  let rollupSummaries: TickerDaySummary[] = [];
  if (!options.skipRollup) {
    try {
      const rollupBuilder = new RollupBuilder({ dataDir });
      rollupSummaries = await rollupBuilder.buildForDay(new Date(), pmSignals);
    } catch (err) {
      console.warn(
        `[cycle-runner] rollup build failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── 4. Dispatch — sort by priority so the daily cap is spent on the
  //    biggest signals first within a cycle.
  const rankedAlerts = [...alerts].sort((a, b) => alertPriority(b) - alertPriority(a));
  let alertsSent = 0;
  if (!options.dryRun && rankedAlerts.length > 0) {
    const alerter = new IntelligenceAlerter(dataDir);
    for (const alert of rankedAlerts) {
      const ok = await alerter.send(alert);
      if (ok) alertsSent++;
    }
  }

  return {
    articles: articles.length,
    rawMarkets: rawMarkets.length,
    relevantMarkets: markets.length,
    alerts,
    alertsSent,
    llmUsedUsd,
    llmDailyUsedUsd: usedToday + llmUsedUsd,
    llmDailyCapUsd: dailyCap,
    correlator,
    durationMs: Date.now() - start,
    scoredArticles: scoringResult.scored.length,
    backloggedArticles: scoringResult.backlogged,
    backlogSize: scoringResult.backlogSize,
    rollupTickerCount: rollupSummaries.length,
    pmTickerSignalCount: pmSignals.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3.5: Article scoring (sequential, soft-cap, backlog-on-failure)
// ───────────────────────────────────────────────────────────────────────────

async function runArticleScoring(
  articles: NewsArticle[],
  options: CycleOptions,
  dataDir: string,
): Promise<{ scored: ScoredArticle[]; backlogged: number; backlogSize: number }> {
  const llmCfg = options.llm!;
  const scorer = new ArticleScorer({
    endpoint: llmCfg.endpoint,
    model: llmCfg.model,
    apiKey: llmCfg.apiKey,
    concurrency: 1,
  });
  const backlog = new ScoreBacklog({ dataDir });
  const scoredStore = new JsonlStore<ScoredArticle>(dataDir, "scored-articles");

  // Build "already scored today" set so we don't re-score on resume / restart.
  const today = new Date();
  const alreadyScored = await scoredStore.readDay(today);
  const seen = new Set(alreadyScored.map((s) => s.sourceArticleId));
  const cap = options.scoreDailyCap ?? 500;
  const watchlistSet = new Set(options.watchlist.map((t) => t.toUpperCase()));

  // Filter to articles not yet scored today.
  const newArticles = articles.filter((a) => !seen.has(a.id));

  // Sort: priority first, then publishedAt desc — non-priority articles past the
  // cap get silently skipped (raw article remains in news-*.jsonl, auditable).
  newArticles.sort((a, b) => {
    const pa = isPriorityArticle(a, watchlistSet);
    const pb = isPriorityArticle(b, watchlistSet);
    if (pa !== pb) return pa ? -1 : 1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });

  // Compose ScoringContext once per cycle.
  const themesPath = path.resolve("./config/themes.json");
  const canonicalThemes = await loadCanonicalThemes(themesPath);
  const upcomingEvents = await loadUpcomingEvents(dataDir, 14);
  const macroTickers = options.macroTickers ?? [];
  const tickerUniverse = Array.from(new Set([...options.watchlist, ...macroTickers]));

  const baseContext: ScoringContext = {
    canonicalThemes,
    upcomingEvents,
    tickerUniverse,
  };

  const scored: ScoredArticle[] = [];
  let backlogged = 0;
  let runningCount = alreadyScored.length;

  for (const article of newArticles) {
    // Soft-cap: past the daily total, non-priority articles get skipped entirely.
    if (runningCount >= cap && !isPriorityArticle(article, watchlistSet)) continue;

    try {
      const records = await scorer.scoreArticle(article, baseContext);
      if (records.length > 0) await scoredStore.appendMany(records);
      scored.push(...records);
      runningCount += records.length;
    } catch (err) {
      // LLM failure → enqueue and continue. Per-article parse errors also land here;
      // they'll bail-on-first-failure in the next cycle's drain (acceptable cost).
      await backlog.enqueue(
        article,
        [],
        err instanceof Error ? err.message : String(err),
      );
      backlogged += 1;
    }
  }

  // Drain backlog LAST so fresh articles aren't starved (RESEARCH pitfall #5).
  const drainCap = options.backlogDrainCap ?? 50;
  try {
    const drainResult = await backlog.drain(scorer, baseContext, drainCap);
    if (drainResult.scoredRecords.length > 0) {
      await scoredStore.appendMany(drainResult.scoredRecords);
    }
    scored.push(...drainResult.scoredRecords);
  } catch (err) {
    console.warn(
      `[cycle-runner] backlog drain failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  const backlogSize = await backlog.size();
  return { scored, backlogged, backlogSize };
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3.8: Daily calendar refresh (24h-guarded)
// ───────────────────────────────────────────────────────────────────────────

async function maybeRefreshCalendar(options: CycleOptions, dataDir: string): Promise<void> {
  const stateFile = path.join(dataDir, "calendar-refresh-state.json");
  let lastAt: number | null = null;
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    lastAt = Date.parse((JSON.parse(raw) as { lastRefreshedAt: string }).lastRefreshedAt);
  } catch {
    /* no prior refresh */
  }
  const dayMs = 24 * 60 * 60 * 1000;
  if (lastAt !== null && Date.now() - lastAt < dayMs) return;

  if (!options.finnhubApiKey) return; // Need Finnhub key to run the earnings fetcher.

  const refresherOpts: CalendarRefresherOptions = {
    finnhubApiKey: options.finnhubApiKey,
    tickerUniverse: Array.from(
      new Set([...options.watchlist, ...(options.macroTickers ?? [])]),
    ),
    dataDir,
  };
  if (options.fredApiKey !== undefined) {
    refresherOpts.fredApiKey = options.fredApiKey;
  }
  const refresher = new CalendarRefresher(refresherOpts);
  try {
    const result = await refresher.refreshAll(60);
    console.log(
      `[cycle-runner] calendar refreshed: ${result.totalEvents} events; failed sources: ${
        result.failed.join(",") || "none"
      }`,
    );
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      stateFile,
      JSON.stringify({ lastRefreshedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch (err) {
    console.warn(
      `[cycle-runner] calendar refresh failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

async function persistStreams(
  dataDir: string,
  articles: NewsArticle[],
  markets: MarketSnapshot[],
): Promise<void> {
  await fs.mkdir(path.resolve(dataDir), { recursive: true });
  const newsStore = new JsonlStore<NewsArticle>(dataDir, "news");
  const pmStore = new JsonlStore<MarketSnapshot>(dataDir, "polymarket-snapshots");
  await Promise.all([newsStore.appendMany(articles), pmStore.appendMany(markets)]);
}

interface ThemesConfigShape {
  themes: Array<{ canonical: string; aliases?: string[] }>;
}

async function loadCanonicalThemes(themesPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(themesPath, "utf8");
    const parsed = JSON.parse(raw) as ThemesConfigShape;
    return (parsed.themes ?? []).map((t) => t.canonical);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[cycle-runner] failed to load canonical themes from ${themesPath}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
    return [];
  }
}

/**
 * Read all catalyst-flags-*.jsonl files in dataDir, dedup by id (taking the
 * latest by lastRefinedAt ?? firstSeenAt), filter to expectedDate within the
 * next `days` days AND not archived.
 *
 * This is the ScoringContext.upcomingEvents source — gives the scorer a stable
 * "what's coming up" anchor so referencedCalendarEvents can be populated.
 */
async function loadUpcomingEvents(dataDir: string, days: number): Promise<CalendarEvent[]> {
  const files = await fs.readdir(dataDir).catch(() => [] as string[]);
  const matching = files.filter((f) => /^catalyst-flags-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  const all: CalendarEvent[] = [];
  for (const f of matching) {
    const content = await fs.readFile(path.join(dataDir, f), "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (t.length === 0) continue;
      try {
        all.push(JSON.parse(t) as CalendarEvent);
      } catch {
        /* skip malformed */
      }
    }
  }
  const byId = new Map<string, CalendarEvent>();
  for (const c of all) {
    const existing = byId.get(c.id);
    const cTs = Date.parse(c.lastRefinedAt ?? c.firstSeenAt);
    const eTs = existing ? Date.parse(existing.lastRefinedAt ?? existing.firstSeenAt) : -Infinity;
    if (!existing || cTs > eTs) byId.set(c.id, c);
  }
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0]!;
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;
  return Array.from(byId.values()).filter((c) => {
    if (c.archived === true) return false;
    const day = c.expectedDate.split("T")[0] ?? "";
    return day >= todayIso && day <= horizon;
  });
}

/** Same scan as loadUpcomingEvents but returns ALL catalyst flags (no horizon filter). */
async function loadAllCatalysts(dataDir: string): Promise<CatalystFlag[]> {
  const files = await fs.readdir(dataDir).catch(() => [] as string[]);
  const matching = files.filter((f) => /^catalyst-flags-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  const all: CatalystFlag[] = [];
  for (const f of matching) {
    const content = await fs.readFile(path.join(dataDir, f), "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (t.length === 0) continue;
      try {
        all.push(JSON.parse(t) as CatalystFlag);
      } catch {
        /* skip malformed */
      }
    }
  }
  const byId = new Map<string, CatalystFlag>();
  for (const c of all) {
    const existing = byId.get(c.id);
    const cTs = Date.parse(c.lastRefinedAt ?? c.firstSeenAt);
    const eTs = existing ? Date.parse(existing.lastRefinedAt ?? existing.firstSeenAt) : -Infinity;
    if (!existing || cTs > eTs) byId.set(c.id, c);
  }
  return Array.from(byId.values());
}
