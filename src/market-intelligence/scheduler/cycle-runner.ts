import * as fs from "node:fs/promises";
import * as path from "node:path";
import { IntelligenceAlerter } from "../alerts/intelligence-alerter.js";
import { HeadlinePmCorrelator } from "../correlator/headline-pm-correlator.js";
import { LlmCorrelator } from "../correlator/llm-correlator.js";
import { LlmCostTracker } from "../correlator/cost-tracker.js";
import { NewsPoller } from "../news/news-poller.js";
import { PolymarketClient } from "../polymarket/polymarket-client.js";
import { filterRelevantMarkets } from "../polymarket/relevance-filter.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type { IntelligenceAlert } from "../alerts/types.js";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";

export interface LlmConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  provider: "local" | "remote";
}

export interface CycleOptions {
  finnhubApiKey: string;
  /** Optional LLM config. If omitted, the rule-based correlator is used. */
  llm?: LlmConfig;
  watchlist: string[];
  minMovePp?: number;
  dailyCapUsd?: number;
  dataDir?: string;
  /** When true, only print alerts to stdout; do not send to Telegram. */
  dryRun?: boolean;
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
}

/**
 * Reusable polling cycle. Called from both the CLI's `intel run-once` action
 * and the scheduler's tick handler. Idempotent (safe to call repeatedly).
 */
export async function runCycle(options: CycleOptions): Promise<CycleResult> {
  const start = Date.now();
  const dataDir = options.dataDir ?? "./data/intel";
  const minMovePp = options.minMovePp ?? 3;
  const dailyCap = options.dailyCapUsd ?? 5;

  // 1. Fetch
  const poller = new NewsPoller({ finnhubApiKey: options.finnhubApiKey, lookbackHours: 6 });
  const pm = new PolymarketClient();
  const [articles, rawMarkets] = await Promise.all([
    options.watchlist.length > 0
      ? poller.fetchWatchlistNews(options.watchlist)
      : Promise.resolve([] as NewsArticle[]),
    pm.fetchActiveMarkets({ limit: 500, minVolume24hr: 10_000 }),
  ]);
  const markets = filterRelevantMarkets(rawMarkets);

  // 2. Persist
  await persistStreams(dataDir, articles, markets);

  // 3. Correlate (LLM if reachable + under daily cap for remote, else rule-based)
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

  // 4. Dispatch
  let alertsSent = 0;
  if (!options.dryRun && alerts.length > 0) {
    const alerter = new IntelligenceAlerter(dataDir);
    for (const alert of alerts) {
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
  };
}

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
