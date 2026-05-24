import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import ora from "ora";
import { SecureConfig } from "../../config/secure-config.js";
import { TelegramService } from "../../notifications/telegram-service.js";
import { IntelligenceAlerter } from "../alerts/intelligence-alerter.js";
import { HeadlinePmCorrelator } from "../correlator/headline-pm-correlator.js";
import { LlmCorrelator } from "../correlator/llm-correlator.js";
import { LlmCostTracker } from "../correlator/cost-tracker.js";
import { NewsPoller } from "../news/news-poller.js";
import { IntelScheduler } from "../scheduler/intel-scheduler.js";
import { PolymarketClient } from "../polymarket/polymarket-client.js";
import {
  DEFAULT_TOPICS,
  filterRelevantMarkets,
  topicsForMarket,
} from "../polymarket/relevance-filter.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";

const DATA_DIR = "./data/intel";
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
        // 1. Fetch in parallel
        const poller = new NewsPoller({ finnhubApiKey: apiKey, lookbackHours: 6 });
        const pmClient = new PolymarketClient();
        const [articles, rawMarkets] = await Promise.all([
          watchlist.length > 0 ? poller.fetchWatchlistNews(watchlist) : Promise.resolve([] as NewsArticle[]),
          pmClient.fetchActiveMarkets({ limit: 500, minVolume24hr: 10_000 }),
        ]);
        const markets = filterRelevantMarkets(rawMarkets);
        spinner.text = `Fetched ${articles.length} articles, ${rawMarkets.length} → ${markets.length} relevant markets — persisting...`;

        // 2. Persist
        await persistStreams(articles, markets);

        // 3. Correlate (LLM if reachable + under daily cap, else rule-based)
        spinner.text = "Correlating headlines ↔ Polymarket moves...";

        let alerts;
        let cycleCost = 0;
        let correlatorUsed = "rule-based";
        const costTracker = new LlmCostTracker(DATA_DIR);
        const dailyCap = Number(opts.dailyCap ?? 5);
        const usedToday = await costTracker.todayUsd();

        const remoteCapHit = llmCfg?.provider === "remote" && usedToday >= dailyCap;
        if (llmCfg && !remoteCapHit) {
          try {
            const llm = new LlmCorrelator({
              endpoint: llmCfg.endpoint,
              model: llmCfg.model,
              apiKey: llmCfg.apiKey,
              minMovePp: minMove,
            });
            const result = await llm.correlate(markets, articles);
            alerts = result.alerts;
            cycleCost = result.cost.usdEstimate;
            if (cycleCost > 0) await costTracker.record(result.cost);
            correlatorUsed = `llm:${llmCfg.model}`;
          } catch (err) {
            spinner.warn(
              `LLM correlator failed: ${err instanceof Error ? err.message : String(err)}. Falling back to rule-based.`,
            );
            if (err instanceof Error && err.stack) {
              console.log(chalk.gray(err.stack.split("\n").slice(0, 5).join("\n")));
            }
            const rules = new HeadlinePmCorrelator({ minMovePp: minMove });
            alerts = rules.correlate(markets, articles);
          }
        } else {
          if (remoteCapHit) {
            spinner.text = `Daily LLM cap $${dailyCap} reached ($${usedToday.toFixed(2)} used). Using rule-based.`;
          }
          const rules = new HeadlinePmCorrelator({ minMovePp: minMove });
          alerts = rules.correlate(markets, articles);
        }

        spinner.succeed(
          `Cycle complete. ${articles.length} articles, ${markets.length} markets, ${alerts.length} alerts via ${correlatorUsed}.` +
            (cycleCost > 0 ? ` Cost: $${cycleCost.toFixed(4)} (today $${(usedToday + cycleCost).toFixed(2)}/$${dailyCap}).` : ""),
        );

        if (alerts.length === 0) {
          console.log(chalk.gray("No alert-worthy correlations found this cycle."));
          return;
        }

        // 4. Dispatch
        if (opts.dryRun) {
          console.log(chalk.yellow("\nDry-run mode — alerts not sent to Telegram:\n"));
          for (const a of alerts) {
            console.log(chalk.bold(`[${a.kind}]`));
            console.log(JSON.stringify(a, null, 2));
            console.log("");
          }
          return;
        }

        const alerter = new IntelligenceAlerter(DATA_DIR);
        let sent = 0;
        for (const alert of alerts) {
          const ok = await alerter.send(alert);
          if (ok) sent++;
        }
        console.log(chalk.green(`Sent ${sent}/${alerts.length} alerts to Telegram.`));
      } catch (err) {
        spinner.fail(`Cycle failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

async function persistStreams(articles: NewsArticle[], markets: MarketSnapshot[]): Promise<void> {
  await fs.mkdir(path.resolve(DATA_DIR), { recursive: true });
  const newsStore = new JsonlStore<NewsArticle>(DATA_DIR, "news");
  const pmStore = new JsonlStore<MarketSnapshot>(DATA_DIR, "polymarket-snapshots");
  await Promise.all([newsStore.appendMany(articles), pmStore.appendMany(markets)]);
}
