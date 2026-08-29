import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import ora from "ora";
import { SecureConfig } from "../../config/secure-config.js";
import { TelegramService } from "../../notifications/telegram-service.js";
import { LlmCorrelator } from "../correlator/llm-correlator.js";
import { NewsPoller } from "../news/news-poller.js";
import { runCycle } from "../scheduler/cycle-runner.js";
import { IntelScheduler } from "../scheduler/intel-scheduler.js";
import { PolymarketClient } from "../polymarket/polymarket-client.js";
import {
  DEFAULT_TOPICS,
  filterRelevantMarkets,
  topicsForMarket,
} from "../polymarket/relevance-filter.js";
import { ArticleScorer, type ScoringContext } from "../signal/article-scorer.js";
import { CalendarRefresher } from "../signal/calendar/index.js";
import { loadUpcomingCatalysts } from "../signal/catalyst-loader.js";
import { runStabilityTest } from "../signal/stability-test.js";
import { backfillMissingRollups } from "../signal/rollup-backfill.js";
import { drainBacklog, releaseDrainLock } from "../signal/backlog-drain.js";
import { ScoreBacklog } from "../signal/score-backlog.js";
import { endpointUp, ensureServerUp, findLms, shutdownServer } from "./lm-studio-control.js";
import { resolveLlmGuardFromEnv } from "../scheduler/llm-guard.js";
import {
  evaluatePrescreen,
  extractFeedId,
  matchedPrescreenTopics,
  predictMateriality,
  type PrescreenLabelledArticle,
  type PrescreenTopic,
} from "../signal/materiality-prescreen.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type {
  CalendarEvent,
  PmMappingProposal,
  ScoredArticle,
  TickerDaySummary,
} from "../signal/types.js";
import type { NewsArticle } from "../news/types.js";
import {
  aggregateThemeCandidates,
  readRejectedConfig,
  readThemesConfig,
  writeRejectedConfig,
  writeThemesConfig,
} from "./themes-review-helpers.js";

const DATA_DIR = "./data/intel";
const CONFIG_DIR = "./config";
const WATCHLIST_PATH = "./watchlist.txt";

async function loadWatchlist(): Promise<string[]> {
  try {
    const content = await fs.readFile(WATCHLIST_PATH, "utf8");
    return content
      .split("\n")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && !s.startsWith("#"));
  } catch (err) {
    console.warn(`Could not read ${WATCHLIST_PATH}; using empty watchlist.`);
    return [];
  }
}

function resolveFinnhubKey(): string | null {
  try {
    const config = SecureConfig.getInstance();
    const fromConfig = config.get<string>("apis.finnhub");
    if (fromConfig) return fromConfig;
  } catch {
    // SecureConfig may not be initialized
  }
  return process.env.FINNHUB_API_KEY ?? null;
}

interface LlmConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  provider: "local" | "remote";
}

/**
 * Resolve LLM endpoint + model from env vars (with sensible defaults for LM Studio).
 *
 * Env vars:
 *   LLM_ENDPOINT  — OpenAI-compatible base URL, default http://localhost:1234/v1
 *                   (LM Studio defaults; for WSL2 + Windows host you may need
 *                    the Windows host IP: see /etc/resolv.conf nameserver)
 *   LLM_MODEL     — model id, default "qwen/qwen3-14b" (LM Studio's id for the
 *                   official Qwen 3 14B repo)
 *   LLM_API_KEY   — optional; ignored by local servers
 */
function resolveLlmConfig(): LlmConfig {
  const endpoint = process.env.LLM_ENDPOINT ?? "http://localhost:1234/v1";
  const model = process.env.LLM_MODEL ?? "qwen/qwen3-14b";
  const apiKey = process.env.LLM_API_KEY ?? "lm-studio";
  const isLocal =
    endpoint.includes("localhost") ||
    endpoint.includes("127.0.0.1") ||
    /^http:\/\/(?:\d+\.){3}\d+/.test(endpoint);
  return { endpoint, model, apiKey, provider: isLocal ? "local" : "remote" };
}

/** Initialize SecureConfig (matches the pattern used by every other CLI action). */
async function ensureConfig(): Promise<void> {
  await SecureConfig.getInstance().initialize();
}

/** Resolve FRED API key from SecureConfig or env. Optional (only powers macro releases). */
function resolveFredKey(): string | undefined {
  try {
    const config = SecureConfig.getInstance();
    const fromConfig = config.get<string | undefined>("apis.fred");
    if (fromConfig) return fromConfig;
  } catch {
    // SecureConfig may not be initialized
  }
  return process.env.FRED_API_KEY;
}

/** Load canonical theme names (canonical strings only) from config/themes.json. */
async function loadCanonicalThemes(configDir = CONFIG_DIR): Promise<string[]> {
  const cfg = await readThemesConfig(configDir);
  return cfg.themes.map((t) => t.canonical);
}

/** Load macro-ticker symbols from config/macro-tickers.json. Returns [] when file missing. */
async function loadMacroTickers(configDir = CONFIG_DIR): Promise<string[]> {
  const file = path.join(configDir, "macro-tickers.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { tickers?: Array<{ ticker: string }> };
    return (parsed.tickers ?? []).map((t) => t.ticker.toUpperCase());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Non-archived catalyst flags with expectedDate in `[today, today + days]`.
 * Delegates to the shared `catalyst-loader.ts` scan/dedup/filter.
 */
async function loadAllUpcomingCalendarEvents(
  days: number,
  dataDir = DATA_DIR,
): Promise<CalendarEvent[]> {
  const todayIso = new Date().toISOString().split("T")[0]!;
  return loadUpcomingCatalysts(dataDir, todayIso, days);
}

/**
 * Load PM-mapping proposal records across the last N days, deduped by marketId.
 * Merges the engine-side stream (unmatched markets) AND the scorer-side stream
 * (LLM-extracted suggestions). Last-write-wins per marketId; if a proposal has
 * non-empty proposedTickers it's preferred over an empty shell.
 */
async function loadPmMappingProposals(
  days: number,
  dataDir = DATA_DIR,
): Promise<PmMappingProposal[]> {
  const allProposals: PmMappingProposal[] = [];

  // 1) The dedicated pm-mappings-proposed JSONL stream (engine + scorer both write here).
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const file = path.join(
      dataDir,
      `pm-mappings-proposed-${d.toISOString().split("T")[0]}.jsonl`,
    );
    const content = await fs.readFile(file, "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        allProposals.push(JSON.parse(t) as PmMappingProposal);
      } catch {
        // skip malformed
      }
    }
  }

  // 2) Also harvest proposedPmMappings embedded in scored-articles-*.jsonl.
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const file = path.join(dataDir, `scored-articles-${d.toISOString().split("T")[0]}.jsonl`);
    const content = await fs.readFile(file, "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const row = JSON.parse(t) as { proposedPmMappings?: PmMappingProposal[] };
        if (Array.isArray(row.proposedPmMappings)) allProposals.push(...row.proposedPmMappings);
      } catch {
        // skip malformed
      }
    }
  }

  // Dedup by marketId, preferring entries with non-empty proposedTickers.
  const byMarket = new Map<string, PmMappingProposal>();
  for (const p of allProposals) {
    const existing = byMarket.get(p.marketId);
    if (!existing) {
      byMarket.set(p.marketId, p);
      continue;
    }
    const existingHasTickers = (existing.proposedTickers ?? []).length > 0;
    const candidateHasTickers = (p.proposedTickers ?? []).length > 0;
    if (!existingHasTickers && candidateHasTickers) {
      // Merge: prefer the candidate's tickers but keep existing question if it's filled.
      byMarket.set(p.marketId, { ...p, question: p.question || existing.question });
    }
  }
  return Array.from(byMarket.values());
}

/**
 * Append a new PM mapping to config/pm-market-mappings.json. Reads the current
 * file, appends, writes via temp-rename.
 */
interface PmMappingFileShape {
  version: number;
  lastUpdated: string;
  mappings: Array<{
    match: { eventSlug: string | null; slugPrefix: string | null; questionContains: string | null };
    tickers: Array<{ ticker: string; direction: "long" | "short"; weight: number }>;
    interpretation: "yesPp" | "noPp";
    rationale?: string;
    addedBy?: string;
    addedAt?: string;
  }>;
  proposed: unknown[];
}

async function readPmMappingConfig(configDir = CONFIG_DIR): Promise<PmMappingFileShape> {
  const file = path.join(configDir, "pm-market-mappings.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as PmMappingFileShape;
}

async function writePmMappingConfig(
  cfg: PmMappingFileShape,
  configDir = CONFIG_DIR,
): Promise<void> {
  const file = path.join(configDir, "pm-market-mappings.json");
  const tmp = `${file}.tmp`;
  cfg.lastUpdated = new Date().toISOString().split("T")[0]!;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

/** Build a readline async-question helper from a single rl instance. */
function makeAsker(rl: readline.Interface): (q: string) => Promise<string> {
  return (q: string) =>
    new Promise<string>((res) => rl.question(q, (a) => res(a.trim())));
}

/** Inclusive UTC day range, matching JsonlStore's `${dir}/${stream}-YYYY-MM-DD.jsonl` bucketing. */
function enumerateDaysUtc(startMs: number, endMs: number): Date[] {
  const days: Date[] = [];
  for (let t = startMs; t <= endMs; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t));
  }
  return days;
}

/**
 * Same tier classification `predictMateriality`'s internal `sourceWeight`
 * uses, replicated here for the `intel prescreen-eval` per-bucket breakdown
 * only (operator display, not part of the scoring contract).
 */
function classifySourceTier(
  article: Pick<PrescreenLabelledArticle, "id" | "source" | "tickers">,
  watchlist: Set<string>,
): string {
  if (article.source === "finnhub") {
    const hasWatchlistTicker = article.tickers.some((t) => watchlist.has(t.toUpperCase()));
    if (hasWatchlistTicker) return "finnhub:watchlist";
    if (article.tickers.length > 0) return "finnhub:tickered";
    return "finnhub:untickered";
  }
  if (article.source === "rss") {
    const feedId = extractFeedId(article.id);
    return feedId ? `rss:${feedId}` : "unknown";
  }
  return "unknown";
}

/**
 * Matched topic buckets for the `intel prescreen-eval` per-topic breakdown.
 * Delegates to `matchedPrescreenTopics` so the diagnostic breakdown uses the
 * exact same word-boundary matcher `predictMateriality` scores with — no
 * second, possibly-drifting keyword-matching implementation (Rule 1 fix).
 */
function matchedTopics(
  article: Pick<PrescreenLabelledArticle, "headline" | "summary">,
): PrescreenTopic[] {
  return matchedPrescreenTopics(article.headline, article.summary);
}

interface PrescreenBucketStats {
  count: number;
  high: number;
}

function bumpBucket(map: Map<string, PrescreenBucketStats>, key: string, isHigh: boolean): void {
  const cur = map.get(key) ?? { count: 0, high: 0 };
  cur.count += 1;
  if (isHigh) cur.high += 1;
  map.set(key, cur);
}

function printBucketBreakdown(label: string, map: Map<string, PrescreenBucketStats>): void {
  console.log(chalk.bold(`  ${label}:`));
  const entries = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [key, stats] of entries) {
    const hitRate = stats.count > 0 ? stats.high / stats.count : 0;
    console.log(
      chalk.gray(
        `    ${key.padEnd(20)} count=${String(stats.count).padStart(5)} high=${String(stats.high).padStart(4)} hitRate=${hitRate.toFixed(3)}`,
      ),
    );
  }
}

export function registerIntelCommands(program: Command): void {
  const intel = program
    .command("intel")
    .description("Market intelligence bot: news + Polymarket + Telegram alerts");

  intel
    .command("ping-llm")
    .description("Verify the configured LLM endpoint is reachable and lists the expected model")
    .action(async () => {
      await ensureConfig();
      const llm = resolveLlmConfig();
      const spinner = ora(`Pinging ${llm.endpoint}...`).start();
      try {
        const correlator = new LlmCorrelator({
          endpoint: llm.endpoint,
          model: llm.model,
          apiKey: llm.apiKey,
        });
        const result = await correlator.ping();
        spinner.succeed(
          `LLM endpoint reachable (${llm.provider}). ${result.models.length} model(s) loaded.`,
        );
        console.log(chalk.gray("  Expected model:"), chalk.bold(llm.model));
        console.log(chalk.gray("  Available:"));
        for (const m of result.models) {
          const match = m === llm.model;
          console.log("    " + (match ? chalk.green("✓") : chalk.dim("•")) + " " + m);
        }
        const hasExpected = result.models.some((m) => m === llm.model);
        if (!hasExpected) {
          console.log(
            chalk.yellow(
              `\nWarning: '${llm.model}' is not currently loaded. Either load it in LM Studio or set LLM_MODEL to one of the loaded ids above.`,
            ),
          );
          process.exit(2);
        }
      } catch (err) {
        spinner.fail(`Could not reach ${llm.endpoint}: ${err instanceof Error ? err.message : String(err)}`);
        console.log(
          chalk.gray(
            "\nIf running LM Studio on Windows from WSL2, you may need to use the Windows host IP " +
              "(see /etc/resolv.conf nameserver) and ensure 'Serve on local network' is ON in LM Studio.",
          ),
        );
        process.exit(1);
      }
    });

  intel
    .command("test-telegram")
    .description("Send a test message to confirm Telegram is configured correctly")
    .action(async () => {
      const spinner = ora("Sending test Telegram message...").start();
      try {
        await ensureConfig();
        const telegram = new TelegramService();
        const ok = await telegram.sendTestMessage();
        if (ok) {
          spinner.succeed("Test message sent. Check Telegram.");
        } else {
          spinner.fail("Telegram not configured or send failed. Check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.");
          process.exit(1);
        }
      } catch (err) {
        spinner.fail(`Telegram test failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  intel
    .command("polymarket")
    .description("Fetch and display top trade-relevant Polymarket markets (sanity check)")
    .option("-l, --limit <number>", "Number of markets to show", "10")
    .option("-v, --min-volume <number>", "Minimum 24h volume", "10000")
    .option(
      "--topics <list>",
      `Comma-separated topics to filter to (default: all). Available: ${DEFAULT_TOPICS.join(",")}`,
    )
    .option("--all", "Show all markets (skip relevance filter)", false)
    .action(async (opts: { limit: string; minVolume: string; topics?: string; all?: boolean }) => {
      const spinner = ora("Fetching Polymarket markets...").start();
      try {
        await ensureConfig();
        const client = new PolymarketClient();
        const raw = await client.fetchActiveMarkets({
          limit: 500,
          minVolume24hr: Number(opts.minVolume),
        });
        const filtered = opts.all
          ? raw
          : filterRelevantMarkets(raw, {
              topics: opts.topics?.split(",").map((t) => t.trim()),
            });
        spinner.succeed(
          `Fetched ${raw.length} markets, ${filtered.length} relevant after filter.`,
        );
        const top = filtered.slice(0, Number(opts.limit));
        for (const m of top) {
          const topics = topicsForMarket(m);
          console.log("");
          console.log(chalk.bold(m.question));
          console.log(
            chalk.gray(`  yes=${(m.yesPrice * 100).toFixed(0)}%`) +
              chalk.gray(`  1h=${(m.oneHourPriceChange * 100).toFixed(1)}pp`) +
              chalk.gray(`  24h=${(m.oneDayPriceChange * 100).toFixed(1)}pp`) +
              chalk.gray(`  vol24h=$${m.volume24hr.toFixed(0)}`) +
              (topics.length > 0 ? chalk.cyan(`  [${topics.join(",")}]`) : ""),
          );
          console.log(chalk.dim(`  slug: ${m.slug}`));
        }
      } catch (err) {
        spinner.fail(`Polymarket fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  intel
    .command("news")
    .description("Fetch headlines for watchlist tickers (sanity check)")
    .option("--hours <number>", "Lookback hours", "24")
    .action(async (opts: { hours: string }) => {
      await ensureConfig();
      const apiKey = resolveFinnhubKey();
      if (!apiKey) {
        console.error("Finnhub API key not found (apis.finnhub or FINNHUB_API_KEY).");
        process.exit(1);
      }
      const watchlist = await loadWatchlist();
      if (watchlist.length === 0) {
        console.error(`Watchlist empty. Add tickers to ${WATCHLIST_PATH}.`);
        process.exit(1);
      }
      const spinner = ora(`Fetching news for ${watchlist.length} tickers...`).start();
      try {
        const poller = new NewsPoller({
          finnhubApiKey: apiKey,
          lookbackHours: Number(opts.hours),
        });
        const articles = await poller.fetchWatchlistNews(watchlist);
        spinner.succeed(`Fetched ${articles.length} unique articles.`);
        const top = articles.slice(0, 20);
        for (const a of top) {
          console.log("");
          console.log(chalk.bold(a.headline));
          console.log(
            chalk.gray(
              `  [${a.tickers.join(", ")}] ${a.publisher ?? a.source} • ${new Date(a.publishedAt).toLocaleString()}`,
            ),
          );
          console.log(chalk.dim(`  ${a.url}`));
        }
      } catch (err) {
        spinner.fail(`News fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  intel
    .command("start")
    .description("Start the continuous intelligence scheduler (polls on cron cadences)")
    .option("--min-move <number>", "Minimum 1h Polymarket move in pp", "3")
    .option("--daily-cap <usd>", "Daily LLM spend cap in USD", "5")
    .option("--no-llm", "Skip LLM correlator; use rule-based keyword matching")
    .option("--run-now", "Run one cycle immediately on start", false)
    .action(async (opts: {
      minMove?: string;
      dailyCap?: string;
      llm?: boolean;
      runNow?: boolean;
    }) => {
      await ensureConfig();
      const finnhubKey = resolveFinnhubKey();
      if (!finnhubKey) {
        console.error("Finnhub API key not found (apis.finnhub or FINNHUB_API_KEY).");
        process.exit(1);
      }
      const watchlist = await loadWatchlist();
      const useLlm = opts.llm !== false;
      const llmCfg = useLlm ? resolveLlmConfig() : null;

      const llmGuard = resolveLlmGuardFromEnv();
      if (llmCfg) {
        console.log(
          chalk.gray(
            `LLM guard: quiet hours ${llmGuard.quietHours?.label ?? "off"}; unload after cycle ${llmGuard.unloadAfterCycle ? "on" : "off"}`,
          ),
        );
      }
      const scheduler = new IntelScheduler({
        finnhubApiKey: finnhubKey,
        llm: llmCfg ?? undefined,
        llmGuard,
        watchlist,
        minMovePp: Number(opts.minMove ?? 3),
        dailyCapUsd: Number(opts.dailyCap ?? 5),
        dataDir: DATA_DIR,
      });

      const printResult = (label: string, r: { articles: number; relevantMarkets: number; alerts: { length: number }; alertsSent: number; correlator: string; llmUsedUsd: number; durationMs: number; scoredArticles: number; backloggedArticles: number; backlogSize: number; prescreenTop: number; prescreenCut: number }) => {
        const at = new Date().toLocaleString();
        // scored/backlog are on the line so a dead scorer is visible in the
        // journal without grepping for warnings. prescreenTop/prescreenCut
        // (D-16) show the pre-screen working: the best-ranked article's score
        // vs. the score sitting at the soft-cap boundary this cycle.
        console.log(
          chalk.cyan(`[${at}] ${label}`) +
            chalk.gray(
              ` articles=${r.articles} markets=${r.relevantMarkets} alerts=${r.alerts.length} sent=${r.alertsSent} via=${r.correlator}` +
                ` scored=${r.scoredArticles} backlogged=${r.backloggedArticles} backlog=${r.backlogSize}` +
                ` prescreenTop=${r.prescreenTop.toFixed(2)} prescreenCut=${r.prescreenCut.toFixed(2)}` +
                (r.llmUsedUsd > 0 ? ` cost=$${r.llmUsedUsd.toFixed(4)}` : "") +
                ` (${r.durationMs}ms)`,
            ),
        );
      };

      await scheduler.start((result) => printResult("scheduled", result));
      console.log(chalk.green("Intel scheduler started. Press Ctrl+C to stop."));
      console.log(chalk.dim("Default schedule: every 15 min during US market hours, hourly off-hours."));

      if (opts.runNow) {
        try {
          const result = await scheduler.runNow();
          printResult("startup-cycle", result);
        } catch (err) {
          console.error(`Startup cycle failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Keep process alive until SIGINT
      const shutdown = () => {
        console.log(chalk.gray("\nStopping scheduler..."));
        scheduler.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });

  intel
    .command("run-once")
    .description("Run one full intelligence cycle: poll news + Polymarket, correlate, send alerts")
    .option("--dry-run", "Skip Telegram send; print alerts to console instead", false)
    .option("--min-move <number>", "Minimum 1h Polymarket move in pp", "3")
    .option("--no-llm", "Skip LLM correlator; use rule-based keyword matching instead")
    .option("--daily-cap <usd>", "Daily LLM spend cap in USD", "5")
    .action(async (opts: {
      dryRun?: boolean;
      minMove?: string;
      llm?: boolean;
      dailyCap?: string;
    }) => {
      await ensureConfig();
      const apiKey = resolveFinnhubKey();
      if (!apiKey) {
        console.error("Finnhub API key not found (apis.finnhub or FINNHUB_API_KEY).");
        process.exit(1);
      }

      const watchlist = await loadWatchlist();
      const minMove = Number(opts.minMove ?? 3);
      const useLlm = opts.llm !== false; // commander turns --no-llm into llm: false
      const llmCfg = useLlm ? resolveLlmConfig() : null;

      const spinner = ora("Polling news and Polymarket...").start();

      try {
        const result = await runCycle({
          finnhubApiKey: apiKey,
          llm: llmCfg ?? undefined,
          llmGuard: resolveLlmGuardFromEnv(),
          watchlist,
          minMovePp: minMove,
          dailyCapUsd: Number(opts.dailyCap ?? 5),
          dataDir: DATA_DIR,
          dryRun: opts.dryRun,
        });

        const correlatorUsed =
          result.correlator === "llm" && llmCfg ? `llm:${llmCfg.model}` : "rule-based";
        const costSuffix =
          result.llmUsedUsd > 0
            ? ` Cost: $${result.llmUsedUsd.toFixed(4)} (today $${result.llmDailyUsedUsd.toFixed(2)}/$${result.llmDailyCapUsd}).`
            : "";
        spinner.succeed(
          `Cycle complete. ${result.articles} articles, ${result.relevantMarkets} markets, ${result.alerts.length} alerts via ${correlatorUsed}.${costSuffix}`,
        );

        if (result.alerts.length === 0) {
          console.log(chalk.gray("No alert-worthy correlations found this cycle."));
          return;
        }

        if (opts.dryRun) {
          console.log(chalk.yellow("\nDry-run mode — alerts not sent to Telegram:\n"));
          for (const a of result.alerts) {
            console.log(chalk.bold(`[${a.kind}]`));
            console.log(JSON.stringify(a, null, 2));
            console.log("");
          }
          return;
        }

        console.log(chalk.green(`Sent ${result.alertsSent}/${result.alerts.length} alerts to Telegram.`));
      } catch (err) {
        spinner.fail(`Cycle failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // M2-04 Plan 10-07 operator-facing surface
  // ─────────────────────────────────────────────────────────────────────────

  intel
    .command("scorer-ping")
    .description("Verify the configured LLM endpoint can complete a real scoring call on a test article")
    .action(async () => {
      await ensureConfig();
      const llm = resolveLlmConfig();
      const spinner = ora("Building scorer + test article...").start();
      try {
        const scorer = new ArticleScorer({
          endpoint: llm.endpoint,
          model: llm.model,
          apiKey: llm.apiKey,
        });
        const testArticle: NewsArticle = {
          id: "stability-ping-1",
          source: "synthetic",
          publisher: "Test",
          tickers: ["NVDA"],
          headline:
            "NVIDIA reports record Q3 data center revenue, beats estimates by 15%",
          summary:
            "Hyperscaler demand for H200 GPUs drove the quarter; management raised FY guidance.",
          url: "https://example.com",
          publishedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
        };
        const themes = await loadCanonicalThemes();
        const ctx: ScoringContext = {
          canonicalThemes: themes,
          upcomingEvents: [],
          tickerUniverse: ["NVDA"],
        };
        spinner.text = "Calling LLM (may take 5-15s)...";
        const t0 = Date.now();
        const result = await scorer.scoreArticle(testArticle, ctx);
        const dt = Date.now() - t0;
        spinner.succeed(`Scorer ping OK in ${dt}ms. ${result.length} record(s) emitted.`);
        console.log(chalk.gray("Result:"));
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail(
          `Scorer ping FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(2);
      }
    });

  intel
    .command("calendar-refresh")
    .description("Force a one-off calendar refresh (FRED / Finnhub / Treasury / EIA / seeds)")
    .action(async () => {
      await ensureConfig();
      const finnhub = resolveFinnhubKey();
      if (!finnhub) {
        console.error("Finnhub key required (apis.finnhub or FINNHUB_API_KEY).");
        process.exit(2);
      }
      const watchlist = await loadWatchlist();
      const macro = await loadMacroTickers();
      const universe = Array.from(new Set([...watchlist, ...macro]));
      const refresher = new CalendarRefresher({
        fredApiKey: resolveFredKey(),
        finnhubApiKey: finnhub,
        tickerUniverse: universe,
        dataDir: DATA_DIR,
      });
      const spinner = ora("Refreshing calendar (60d window)...").start();
      try {
        const result = await refresher.refreshAll(60);
        const failedNote = result.failed.length > 0 ? result.failed.join(",") : "none";
        spinner.succeed(
          `${result.totalEvents} events refreshed in ${result.durationMs}ms; failed sources: ${failedNote}`,
        );
        const bySourceLine = Object.entries(result.bySource)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        console.log(chalk.gray("By source:"), bySourceLine || "(none)");
      } catch (err) {
        spinner.fail(
          `Calendar refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  intel
    .command("calendar-list")
    .description("Print upcoming catalysts sorted by date")
    .option("-d, --days <n>", "Look ahead N days", "14")
    .option(
      "-t, --ticker <symbol>",
      "Filter to events affecting this ticker (or its sector)",
      "",
    )
    .action(async (opts: { days: string; ticker: string }) => {
      const days = Number.parseInt(opts.days, 10);
      const tickerFilter = String(opts.ticker || "").toUpperCase();
      const events = await loadAllUpcomingCalendarEvents(days);
      const filtered = tickerFilter
        ? events.filter(
            (e) =>
              (e.tickers ?? []).includes(tickerFilter) ||
              (e.affectedSectors ?? []).includes(tickerFilter),
          )
        : events;
      filtered.sort((a, b) => Date.parse(a.expectedDate) - Date.parse(b.expectedDate));
      const label = tickerFilter ? ` for ${tickerFilter}` : "";
      console.log(chalk.bold(`Upcoming catalysts (next ${days} days${label}):\n`));
      for (const e of filtered) {
        const when = e.expectedTimeEt
          ? `${e.expectedDate.split("T")[0]} ${e.expectedTimeEt} ET`
          : (e.expectedDate.split("T")[0] ?? e.expectedDate);
        const targets =
          [...(e.tickers ?? []), ...(e.affectedSectors ?? [])].join(",") || "—";
        console.log(
          `${chalk.cyan(when.padEnd(22))} ${chalk.yellow(e.type.padEnd(20))} ` +
            `m=${e.magnitudePrior} dir=${e.direction.padEnd(10)} [${targets}]`,
        );
      }
      if (filtered.length === 0) console.log(chalk.gray("(none)"));
    });

  intel
    .command("rollup-today")
    .description("Print today's per-ticker rollup")
    .requiredOption("-t, --ticker <symbol>", "Ticker symbol")
    .action(async (opts: { ticker: string }) => {
      const ticker = String(opts.ticker).toUpperCase();
      const dayIso = new Date().toISOString().split("T")[0]!;
      const file = path.join(DATA_DIR, `ticker-day-summary-${dayIso}.jsonl`);
      let rows: TickerDaySummary[] = [];
      try {
        const raw = await fs.readFile(file, "utf8");
        for (const line of raw.split("\n")) {
          const t = line.trim();
          if (!t) continue;
          try {
            rows.push(JSON.parse(t) as TickerDaySummary);
          } catch {
            // skip malformed
          }
        }
      } catch {
        console.error(`No rollup for ${dayIso} yet (${file}).`);
        process.exit(2);
      }
      const match = rows.find((r) => r.ticker === ticker);
      if (!match) {
        console.log(chalk.gray(`No rollup row for ${ticker} on ${dayIso} (yet).`));
        return;
      }
      console.log(JSON.stringify(match, null, 2));
    });

  intel
    .command("backlog-drain")
    .description(
      "Score every article queued in score-backlog.jsonl (LLM was down), filing each into its publish day and rebuilding those days' rollups",
    )
    .option("--max <n>", "Stop after N articles (default: drain everything)")
    .option("--batch <n>", "Articles per batch", "50")
    .option(
      "--manage-server",
      "Start LM Studio's server via `lms` if the endpoint is down, and unload the model + stop it when done (frees RAM)",
      false,
    )
    .action(async (opts: { max?: string; batch: string; manageServer: boolean }) => {
      await ensureConfig();
      const llm = resolveLlmConfig();
      const max = opts.max === undefined ? undefined : Number(opts.max);
      const batchSize = Number(opts.batch);
      if ((max !== undefined && (!Number.isFinite(max) || max <= 0)) || !Number.isFinite(batchSize) || batchSize <= 0) {
        console.error("--max and --batch must be positive numbers.");
        process.exit(2);
      }

      const backlog = new ScoreBacklog({ dataDir: DATA_DIR });
      const size = await backlog.size();
      if (size === 0) {
        console.log(chalk.green("Backlog is empty — nothing to drain."));
        return;
      }
      const oldest = await backlog.oldestAgeMs();
      console.log(
        chalk.cyan(`Backlog: ${size} article(s), oldest ${oldest === null ? "?" : (oldest / 3_600_000 / 24).toFixed(1)}d. ` +
          `Endpoint ${llm.endpoint} (${llm.model}).`),
      );

      // Optional LM Studio lifecycle ("as needed" mode — model holds ~9 GB RAM).
      let lmsBin: string | null = null;
      let weStartedIt = false;
      if (opts.manageServer) {
        lmsBin = await findLms();
        if (lmsBin === null) {
          console.error("--manage-server: `lms` not found (set LMS_BIN or install LM Studio's CLI).");
          process.exit(2);
        }
        const spinner = ora("Ensuring LM Studio server is up...").start();
        try {
          weStartedIt = (await ensureServerUp(lmsBin, llm.endpoint)).started;
          spinner.succeed(weStartedIt ? "LM Studio server started." : "LM Studio server already up.");
        } catch (err) {
          spinner.fail(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
      } else if (!(await endpointUp(llm.endpoint))) {
        console.error(
          chalk.red(`LLM endpoint ${llm.endpoint} is not answering. Start LM Studio (or pass --manage-server).`),
        );
        process.exit(2);
      }

      const scorer = new ArticleScorer({ endpoint: llm.endpoint, model: llm.model, apiKey: llm.apiKey });
      const watchlist = await loadWatchlist();
      const macro = await loadMacroTickers();
      const ctx: ScoringContext = {
        canonicalThemes: await loadCanonicalThemes(),
        upcomingEvents: await loadAllUpcomingCalendarEvents(14),
        tickerUniverse: Array.from(new Set([...watchlist, ...macro])),
      };

      // Ctrl-C: finish the current batch, then stop and rebuild rollups.
      // Second Ctrl-C: drop the lock and exit immediately.
      const ac = new AbortController();
      const onSigint = () => {
        if (ac.signal.aborted) {
          console.log(chalk.yellow("\nForced exit — releasing lock."));
          void releaseDrainLock(DATA_DIR).finally(() => process.exit(130));
          return;
        }
        console.log(chalk.yellow("\nStopping after the current batch (Ctrl-C again to force)..."));
        ac.abort();
      };
      process.on("SIGINT", onSigint);

      const t0 = Date.now();
      const spinner = ora(`Draining (batch ${batchSize})...`).start();
      try {
        const result = await drainBacklog({
          dataDir: DATA_DIR,
          scorer,
          context: ctx,
          batchSize,
          signal: ac.signal,
          ...(max !== undefined ? { max } : {}),
          onBatch: (b) => {
            const perArticle = b.scored > 0 ? (b.ms / b.scored / 1000).toFixed(1) : "?";
            const etaMin = b.scored > 0 ? ((b.remaining * (b.ms / b.scored)) / 60_000).toFixed(0) : "?";
            spinner.text = `scored ${b.totalScored} · remaining ${b.remaining} · ${perArticle}s/article · ~${etaMin} min left`;
          },
        });
        const mins = ((Date.now() - t0) / 60_000).toFixed(1);
        const why = {
          empty: "backlog empty",
          max: `--max ${max} reached`,
          failure: `stopped on failure: ${result.lastError ?? "unknown"}`,
          aborted: "interrupted",
        }[result.stoppedBecause];
        (result.stoppedBecause === "failure" ? spinner.fail : spinner.succeed).call(
          spinner,
          `Scored ${result.scored} in ${mins} min — ${why}. ${result.remaining} remaining.`,
        );
        if (result.rollupsRebuilt.length > 0) {
          console.log(chalk.green(`Rebuilt ${result.rollupsRebuilt.length} rollup day(s): ${result.rollupsRebuilt.sort().join(", ")}`));
        }
        for (const f of result.rollupsFailed) {
          console.error(chalk.red(`Rollup rebuild failed for ${f.date}: ${f.error}`));
        }
        if (result.stoppedBecause === "failure") process.exitCode = 1;
      } finally {
        process.off("SIGINT", onSigint);
        if (lmsBin !== null && weStartedIt) {
          const shutdownSpinner = ora("Unloading model + stopping LM Studio server...").start();
          const log = await shutdownServer(lmsBin);
          shutdownSpinner.succeed("LM Studio server stopped.");
          for (const l of log) console.log(chalk.gray(`  ${l}`));
        }
      }
    });

  intel
    .command("rollup-backfill")
    .description(
      "Rebuild any day that has scored-articles but a missing ticker-day-summary (silently-dropped rollup recovery)",
    )
    .option("--days <n>", "Only rebuild missing days within the last N days (default: all)")
    .action(async (opts: { days?: string }) => {
      const backfillOpts: { dataDir: string; lookbackDays?: number } = { dataDir: DATA_DIR };
      if (opts.days !== undefined) {
        const n = Number(opts.days);
        if (!Number.isFinite(n) || n <= 0) {
          console.error(`--days must be a positive number, got "${opts.days}".`);
          process.exit(2);
        }
        backfillOpts.lookbackDays = n;
      }
      const result = await backfillMissingRollups(backfillOpts);
      if (result.rebuilt.length === 0 && result.failed.length === 0) {
        console.log(chalk.green("No missing rollups — all scored-article days have a rollup."));
      }
      if (result.rebuilt.length > 0) {
        console.log(
          chalk.green(`Rebuilt ${result.rebuilt.length} rollup(s): ${result.rebuilt.join(", ")}`),
        );
      }
      if (result.failed.length > 0) {
        console.error(
          chalk.red(
            `Failed to rebuild ${result.failed.length}: ${result.failed
              .map((f) => `${f.date} (${f.error})`)
              .join(", ")}`,
          ),
        );
        process.exit(1);
      }
    });

  intel
    .command("themes-review")
    .description("Review LLM-proposed themes from the last 7 days; accept / alias / reject each")
    .option("--days <n>", "Window in days", "7")
    .option("--min-mentions <n>", "Minimum mentions to surface", "5")
    .action(async (opts: { days: string; minMentions: string }) => {
      const days = Number.parseInt(opts.days, 10);
      const minMentions = Number.parseInt(opts.minMentions, 10);
      const candidates = await aggregateThemeCandidates({
        days,
        minMentions,
        dataDir: DATA_DIR,
        configDir: CONFIG_DIR,
      });
      if (candidates.length === 0) {
        console.log(chalk.gray("No candidate themes meet the threshold."));
        return;
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = makeAsker(rl);
      let canonicalConfig = await readThemesConfig(CONFIG_DIR);
      let rejectedConfig = await readRejectedConfig(CONFIG_DIR);
      try {
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i]!;
          console.log(
            `\n[${i + 1}/${candidates.length}] ${chalk.bold(c.theme)}  ` +
              `${c.mentions} mentions  •  tickers: ${c.tickers.join(", ") || "—"}`,
          );
          for (const s of c.samples) {
            console.log(chalk.gray(`    Sample: "${s.headline}" (${s.publisher})`));
          }
          const ans = await ask(
            "[a]ccept  [r]eject  [l] alias to existing (type: l <theme>)  [s]kip > ",
          );
          if (ans === "a") {
            canonicalConfig.themes.push({ canonical: c.theme, aliases: [] });
            await writeThemesConfig(canonicalConfig, CONFIG_DIR);
            console.log(chalk.green(`  ✓ Accepted "${c.theme}"`));
          } else if (ans === "r") {
            if (!rejectedConfig.rejected.includes(c.theme)) {
              rejectedConfig.rejected.push(c.theme);
              await writeRejectedConfig(rejectedConfig, CONFIG_DIR);
            }
            console.log(chalk.yellow(`  ✓ Rejected`));
          } else if (ans.startsWith("l ")) {
            const target = ans.slice(2).trim();
            const existing = canonicalConfig.themes.find((t) => t.canonical === target);
            if (!existing) {
              console.log(chalk.red(`  ✗ No canonical theme "${target}" — skipped`));
              continue;
            }
            if (!existing.aliases.includes(c.theme)) existing.aliases.push(c.theme);
            await writeThemesConfig(canonicalConfig, CONFIG_DIR);
            console.log(chalk.green(`  ✓ Aliased to "${target}"`));
          } else {
            console.log(chalk.gray("  (skipped)"));
          }
        }
      } finally {
        rl.close();
      }
    });

  intel
    .command("pm-mappings-review")
    .description("Review LLM-proposed PM-to-ticker mappings; accept (canonicalize) / reject / skip")
    .option("--days <n>", "Window in days", "14")
    .action(async (opts: { days: string }) => {
      const days = Number.parseInt(opts.days, 10);
      const proposals = await loadPmMappingProposals(days, DATA_DIR);
      if (proposals.length === 0) {
        console.log(chalk.gray("No PM-mapping proposals in window."));
        return;
      }
      // Filter to proposals that actually have proposedTickers (shell records with
      // an empty array are noise until the LLM enriches them).
      const reviewable = proposals.filter((p) => (p.proposedTickers ?? []).length > 0);
      if (reviewable.length === 0) {
        console.log(
          chalk.gray(
            `${proposals.length} unmatched markets in window, but no LLM-enriched proposals yet.`,
          ),
        );
        return;
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = makeAsker(rl);
      let pmCfg = await readPmMappingConfig(CONFIG_DIR);
      try {
        for (let i = 0; i < reviewable.length; i++) {
          const p = reviewable[i]!;
          console.log(
            `\n[${i + 1}/${reviewable.length}] ${chalk.bold(p.slug)}  ` +
              `(${p.proposedTickers.length} proposed ticker(s))`,
          );
          if (p.question) console.log(chalk.gray(`    Question: ${p.question}`));
          const interpLabel =
            p.interpretationSuggestion === "noPp"
              ? "noPp (Yes rising = bearish for the listed tickers — inversion)"
              : "yesPp (Yes rising = bullish for the listed tickers)";
          console.log(chalk.gray(`    Interpretation: ${interpLabel}`));
          for (const t of p.proposedTickers) {
            console.log(
              chalk.gray(
                `    -> ${t.ticker} ${t.direction} (confidence ${t.confidence.toFixed(2)})`,
              ),
            );
          }
          const ans = await ask("[a]ccept  [r]eject  [s]kip > ");
          if (ans === "a") {
            pmCfg.mappings.push({
              match: {
                eventSlug: p.eventSlug ?? null,
                slugPrefix: null,
                questionContains: null,
              },
              tickers: p.proposedTickers.map((t) => ({
                ticker: t.ticker,
                direction: t.direction,
                weight: 1.0,
              })),
              interpretation: p.interpretationSuggestion,
              rationale: `Accepted from LLM proposal (sourceArticleId=${p.sourceArticleId ?? "n/a"})`,
              addedBy: "intel-pm-mappings-review",
              addedAt: new Date().toISOString().split("T")[0]!,
            });
            await writePmMappingConfig(pmCfg, CONFIG_DIR);
            console.log(chalk.green(`  ✓ Accepted — added to config/pm-market-mappings.json`));
          } else if (ans === "r") {
            console.log(chalk.yellow(`  ✓ Rejected (no-op — proposal stays in JSONL stream)`));
          } else {
            console.log(chalk.gray("  (skipped)"));
          }
        }
      } finally {
        rl.close();
      }
    });

  intel
    .command("stability-test")
    .description("Re-score the last N days of articles; report sentiment-delta percentiles + pass/fail")
    .option("-d, --days <n>", "Window in days", "7")
    .option("--article-threshold <x>", "Article P95 sentiment-delta threshold (PASS if <=)", "0.15")
    .option("--rollup-threshold <x>", "Rollup P95 sentiment-delta threshold (PASS if <=)", "0.08")
    .action(
      async (opts: {
        days: string;
        articleThreshold: string;
        rollupThreshold: string;
      }) => {
        await ensureConfig();
        const llm = resolveLlmConfig();
        const scorer = new ArticleScorer({
          endpoint: llm.endpoint,
          model: llm.model,
          apiKey: llm.apiKey,
        });
        const themes = await loadCanonicalThemes();
        const watchlist = await loadWatchlist();
        const macro = await loadMacroTickers();
        const ctx: ScoringContext = {
          canonicalThemes: themes,
          upcomingEvents: [],
          tickerUniverse: Array.from(new Set([...watchlist, ...macro])),
        };
        const spinner = ora("Re-scoring articles...").start();
        try {
          const report = await runStabilityTest({
            days: Number.parseInt(opts.days, 10),
            scorer,
            context: ctx,
            dataDir: DATA_DIR,
            articleP95Threshold: Number.parseFloat(opts.articleThreshold),
            rollupP95Threshold: Number.parseFloat(opts.rollupThreshold),
            onProgress: (done, total) => {
              spinner.text = `Re-scoring articles... ${done}/${total}`;
            },
          });
          if (report.passed) spinner.succeed(report.reason);
          else spinner.fail(report.reason);
          console.log("\n" + chalk.bold("Stability report"));
          console.log(`  Window: ${report.windowDays} days`);
          console.log(`  Articles: ${report.articlesEvaluated}`);
          console.log(`  Rollup rows: ${report.rollupRowsEvaluated}`);
          console.log(
            `  Article sent-delta P50/P95: ${report.articleP50.toFixed(3)} / ${report.articleP95.toFixed(
              3,
            )}  (threshold ${report.articleThreshold})`,
          );
          console.log(
            `  Rollup sent-delta P50/P95:  ${report.rollupP50.toFixed(3)} / ${report.rollupP95.toFixed(
              3,
            )}  (threshold ${report.rollupThreshold})`,
          );
          console.log(`  Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
          process.exit(report.passed ? 0 : 1);
        } catch (err) {
          spinner.fail(
            `Stability test failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(2);
        }
      },
    );

  intel
    .command("prescreen-eval")
    .description(
      "Offline D-16 retention metric: join news + scored-articles over a window, rank with predictMateriality, report retention at --top-fraction. No LLM calls, no network.",
    )
    .requiredOption("--start <YYYY-MM-DD>", "Window start (inclusive, UTC)")
    .requiredOption("--end <YYYY-MM-DD>", "Window end (inclusive, UTC)")
    .option("--top-fraction <n>", "Fraction of ranked articles to score", "0.5")
    .option("--data-dir <path>", "Data directory to read news-*.jsonl / scored-articles-*.jsonl from", DATA_DIR)
    .option("--emit-fixture <path>", "Write the projected, labelled rows as JSONL to this path")
    .action(
      async (opts: {
        start: string;
        end: string;
        topFraction: string;
        dataDir: string;
        emitFixture?: string;
      }) => {
        const topFraction = Number(opts.topFraction);
        if (!Number.isFinite(topFraction) || topFraction <= 0 || topFraction > 1) {
          console.error(`--top-fraction must be a number in (0, 1], got "${opts.topFraction}".`);
          process.exit(2);
        }
        const startMs = Date.parse(opts.start);
        const endMs = Date.parse(opts.end);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
          console.error(
            `--start/--end must be valid YYYY-MM-DD dates with start <= end (got "${opts.start}".."${opts.end}").`,
          );
          process.exit(2);
        }

        const dataDir = opts.dataDir;
        const days = enumerateDaysUtc(startMs, endMs);
        const newsStore = new JsonlStore<NewsArticle>(dataDir, "news");
        const scoredStore = new JsonlStore<ScoredArticle>(dataDir, "scored-articles");
        const watchlist = new Set((await loadWatchlist()).map((t) => t.toUpperCase()));

        // Pass 1: max materiality per sourceArticleId across the whole window — a
        // backlog-drained article can land in a different file than the day it was
        // scored, so build the label map across the full window before joining.
        const labelBySourceArticleId = new Map<string, number>();
        for (const day of days) {
          const rows = await scoredStore.readDay(day);
          for (const r of rows) {
            const prev = labelBySourceArticleId.get(r.sourceArticleId) ?? 0;
            if (r.materiality > prev) labelBySourceArticleId.set(r.sourceArticleId, r.materiality);
          }
        }

        // Pass 2: dedup news articles by id (news-*.jsonl re-appends the same
        // article across cycles), keep only articles that have a label, project
        // to PrescreenLabelledArticle with a freshly-derived score.
        const seenNews = new Set<string>();
        const labelled: PrescreenLabelledArticle[] = [];
        let rawNewsRows = 0;
        for (const day of days) {
          const articles = await newsStore.readDay(day);
          rawNewsRows += articles.length;
          for (const a of articles) {
            if (seenNews.has(a.id)) continue;
            seenNews.add(a.id);
            const maxMateriality = labelBySourceArticleId.get(a.id);
            if (maxMateriality === undefined) continue; // unscored tail — can't score retention
            const row: PrescreenLabelledArticle = {
              id: a.id,
              source: a.source,
              tickers: a.tickers,
              headline: a.headline,
              publishedAt: a.publishedAt,
              maxMateriality,
              score: predictMateriality(a, watchlist),
            };
            if (a.publisher !== undefined) row.publisher = a.publisher;
            if (a.category !== undefined) row.category = a.category;
            if (a.summary !== undefined) row.summary = a.summary.slice(0, 240);
            labelled.push(row);
          }
        }

        const result = evaluatePrescreen(labelled, topFraction);
        const verdict = result.retention >= 0.85 ? chalk.green("PASS") : chalk.red("FAIL");

        console.log(chalk.bold(`\nprescreen-eval window=${opts.start}..${opts.end} top-fraction=${topFraction}`));
        console.log(
          `  rawNewsRows=${rawNewsRows} distinctLabelled=${result.total} highTotal=${result.highTotal} ` +
            `cutoffIndex=${result.cutoffIndex} highRetained=${result.highRetained} retention=${result.retention.toFixed(4)} ${verdict}`,
        );

        const tierMap = new Map<string, PrescreenBucketStats>();
        const topicMap = new Map<string, PrescreenBucketStats>();
        for (const row of labelled) {
          const isHigh = row.maxMateriality >= 0.5;
          bumpBucket(tierMap, classifySourceTier(row, watchlist), isHigh);
          const topics = matchedTopics(row);
          if (topics.length === 0) {
            bumpBucket(topicMap, "(none)", isHigh);
          } else {
            for (const topic of topics) bumpBucket(topicMap, topic, isHigh);
          }
        }
        printBucketBreakdown("By source tier", tierMap);
        printBucketBreakdown("By matched topic", topicMap);

        if (opts.emitFixture) {
          const resolved = path.resolve(opts.emitFixture);
          const repoRoot = path.resolve(".");
          if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
            console.error(`--emit-fixture must resolve inside the repo root (got ${resolved}).`);
            process.exit(2);
          }
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          const lines = labelled.map((r) => JSON.stringify(r)).join("\n");
          await fs.writeFile(resolved, labelled.length > 0 ? `${lines}\n` : "", "utf8");
          console.log(chalk.green(`\nWrote ${labelled.length} row(s) to ${resolved}`));
        }
      },
    );
}
