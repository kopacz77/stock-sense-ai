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
import { runStabilityTest } from "../signal/stability-test.js";
import { backfillMissingRollups } from "../signal/rollup-backfill.js";
import type { CalendarEvent, PmMappingProposal, TickerDaySummary } from "../signal/types.js";
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
 * Scan catalyst-flags-*.jsonl across all days, dedup by id (taking latest
 * lastRefinedAt/firstSeenAt), filter to non-archived with expectedDate
 * between (today - 1d) and (today + days).
 *
 * Same dedup/filter logic as RollupBuilder.loadActiveCatalysts; replicated
 * here to avoid coupling the CLI to RollupBuilder's private API.
 */
async function loadAllUpcomingCalendarEvents(
  days: number,
  dataDir = DATA_DIR,
): Promise<CalendarEvent[]> {
  const files = await fs.readdir(dataDir).catch(() => [] as string[]);
  const matching = files.filter((f) => /^catalyst-flags-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  const all: CalendarEvent[] = [];
  for (const f of matching) {
    const content = await fs.readFile(path.join(dataDir, f), "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        all.push(JSON.parse(t) as CalendarEvent);
      } catch {
        // skip malformed
      }
    }
  }
  const byId = new Map<string, CalendarEvent>();
  for (const e of all) {
    const existing = byId.get(e.id);
    const cTs = Date.parse(e.lastRefinedAt ?? e.firstSeenAt);
    const eTs = existing ? Date.parse(existing.lastRefinedAt ?? existing.firstSeenAt) : -Infinity;
    if (!existing || cTs > eTs) byId.set(e.id, e);
  }
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0]!;
  const cutoffEnd = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;
  return Array.from(byId.values()).filter((c) => {
    if (c.archived) return false;
    const ed = c.expectedDate.split("T")[0] ?? "";
    return ed >= todayIso && ed <= cutoffEnd;
  });
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

      const scheduler = new IntelScheduler({
        finnhubApiKey: finnhubKey,
        llm: llmCfg ?? undefined,
        watchlist,
        minMovePp: Number(opts.minMove ?? 3),
        dailyCapUsd: Number(opts.dailyCap ?? 5),
        dataDir: DATA_DIR,
      });

      const printResult = (label: string, r: { articles: number; relevantMarkets: number; alerts: { length: number }; alertsSent: number; correlator: string; llmUsedUsd: number; durationMs: number }) => {
        const at = new Date().toLocaleString();
        console.log(
          chalk.cyan(`[${at}] ${label}`) +
            chalk.gray(
              ` articles=${r.articles} markets=${r.relevantMarkets} alerts=${r.alerts.length} sent=${r.alertsSent} via=${r.correlator}` +
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
}
