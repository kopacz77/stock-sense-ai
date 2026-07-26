/**
 * LlmCorrelator unit tests.
 *
 * Injects a fake OpenAI client via the `clientOverride` constructor arg so we
 * don't need a live LM Studio. Focus: the size-aware single retry that lets a
 * cycle stay `via=llm` when the first attempt overflows the model context or
 * times out, instead of silently degrading to the rule-based correlator.
 *
 * Motivation: on 2026-07-24, 32% of live cycles ran `via=rule-based` — 8 hard
 * context-overflow errors (`n_keep 4779 >= n_ctx 4096`) and 9 request timeouts.
 * A smaller prompt is both smaller and faster, so one retry addresses both.
 */

import { describe, it, expect } from "vitest";
import type OpenAI from "openai";
import type { MarketSnapshot } from "../../polymarket/types.js";
import type { NewsArticle } from "../../news/types.js";
import { LlmCorrelator } from "../llm-correlator.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function market(i: number): MarketSnapshot {
  return {
    id: `mkt-${i}`,
    slug: `market-${i}`,
    question: `Will event ${i} happen?`,
    active: true,
    outcomes: ["Yes", "No"],
    prices: [0.6, 0.4],
    yesPrice: 0.6,
    volume24hr: 100_000,
    volume1wk: 500_000,
    liquidity: 50_000,
    // Descending move so sort order is deterministic and all clear minMovePp=3.
    oneHourPriceChange: (30 - i) / 100,
    oneDayPriceChange: 0.1,
    oneWeekPriceChange: 0.1,
    competitive: 0.5,
    fetchedAt: "2026-07-24T14:00:00Z",
  };
}

function article(i: number): NewsArticle {
  return {
    id: `art-${i}`,
    source: "finnhub",
    publisher: "Reuters",
    tickers: ["NVDA"],
    headline: `Headline number ${i}`,
    summary: "Body.",
    url: `https://example.com/${i}`,
    // Recent (survives the articleAgeMinutes filter) and strictly ordered by i so
    // art-0 is the newest — guaranteeing it stays in the top-N prompt slice even
    // after the retry halves the cap.
    publishedAt: new Date(Date.now() - (i + 1) * 1000).toISOString(),
    fetchedAt: new Date(Date.now() - (i + 1) * 1000).toISOString(),
  };
}

const CONFIRM_RESPONSE = JSON.stringify({
  decisions: [
    {
      market_id: "mkt-0",
      alert_kind: "HEADLINE_PM_CONFIRMED",
      article_id: "art-0",
      confidence: "high",
      rationale: "Headline explains the move.",
    },
  ],
});

/**
 * Fake OpenAI-shaped client. `behaviors` is consumed one entry per call: a
 * string returns that content; an Error is thrown. Records the user-message of
 * every call so tests can assert the retry prompt shrank.
 */
function fakeClient(behaviors: Array<string | Error>): {
  client: Pick<OpenAI, "chat" | "models">;
  userMessages: string[];
} {
  const userMessages: string[] = [];
  let call = 0;
  const client = {
    chat: {
      completions: {
        // biome-ignore lint/suspicious/noExplicitAny: minimal fake surface
        create: (async (params: any) => {
          const idx = call++;
          userMessages.push(
            params.messages.find((m: { role: string }) => m.role === "user")?.content ?? "",
          );
          const behavior = behaviors[idx] ?? behaviors[behaviors.length - 1];
          if (behavior instanceof Error) throw behavior;
          return {
            choices: [{ message: { content: behavior } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          };
        }) as unknown,
      },
    },
    models: { list: async () => ({ data: [] }) },
  } as unknown as Pick<OpenAI, "chat" | "models">;
  return { client, userMessages };
}

// Count how many market blocks a built user-message contains. `one_hour_move_pp`
// appears once per market and never for articles.
function marketCount(userMessage: string): number {
  return (userMessage.match(/one_hour_move_pp:/g) ?? []).length;
}

const markets = Array.from({ length: 12 }, (_, i) => market(i));
const articles = Array.from({ length: 40 }, (_, i) => article(i));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("LlmCorrelator size-aware retry", () => {
  it("retries with a smaller prompt when the first attempt overflows context, then succeeds", async () => {
    const overflow = new Error(
      '400 "The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 4779 >= n_ctx: 4096). Try to load the model with a larger context length."',
    );
    const { client, userMessages } = fakeClient([overflow, CONFIRM_RESPONSE]);
    const correlator = new LlmCorrelator(
      { endpoint: "http://fake", model: "qwen/qwen3-14b" },
      client,
    );

    const result = await correlator.correlate(markets, articles);

    // It recovered without throwing — the cycle stays via=llm.
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.kind).toBe("HEADLINE_PM_CONFIRMED");
    // Two calls: the failed full attempt, then the smaller retry.
    expect(userMessages).toHaveLength(2);
    // The retry prompt carried strictly fewer markets than the first.
    expect(marketCount(userMessages[1]!)).toBeLessThan(marketCount(userMessages[0]!));
  });

  it("retries when the first attempt times out", async () => {
    const timeout = new Error("Request timed out.");
    const { client, userMessages } = fakeClient([timeout, CONFIRM_RESPONSE]);
    const correlator = new LlmCorrelator(
      { endpoint: "http://fake", model: "qwen/qwen3-14b" },
      client,
    );

    const result = await correlator.correlate(markets, articles);

    expect(result.alerts).toHaveLength(1);
    expect(userMessages).toHaveLength(2);
  });

  it("does NOT retry on a connection error — throws after one attempt so the cycle falls back to rules", async () => {
    const connErr = new Error("Connection error.");
    const { client, userMessages } = fakeClient([connErr]);
    const correlator = new LlmCorrelator(
      { endpoint: "http://fake", model: "qwen/qwen3-14b" },
      client,
    );

    await expect(correlator.correlate(markets, articles)).rejects.toThrow("Connection error");
    // Only the single attempt — no pointless retry when a smaller prompt can't help.
    expect(userMessages).toHaveLength(1);
  });

  it("propagates the error when the retry also fails", async () => {
    const overflow = new Error("n_keep: 4779 >= n_ctx: 4096");
    const { client, userMessages } = fakeClient([overflow, overflow]);
    const correlator = new LlmCorrelator(
      { endpoint: "http://fake", model: "qwen/qwen3-14b" },
      client,
    );

    await expect(correlator.correlate(markets, articles)).rejects.toThrow();
    expect(userMessages).toHaveLength(2);
  });
});
