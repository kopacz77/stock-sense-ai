/**
 * ArticleScorer unit tests.
 *
 * Tests inject a fake OpenAI client via the `clientOverride` constructor arg
 * so we don't need a live LM Studio. Covers:
 *   - parseScorerResponse: bare JSON, fenced JSON, leading prose, errors, clamps, canonicalization
 *   - fanOutScoredArticle: per-ticker fan-out, affected_tickers ∩ universe, themed-only fallback
 *   - ArticleScorer.scoreArticle: end-to-end with canned client + sequential gating + error propagation
 */

import { describe, it, expect } from "vitest";
import type OpenAI from "openai";
import type { NewsArticle } from "../../news/types.js";
import {
  ArticleScorer,
  type ArticleScorerOptions,
  type ParsedScorerResponse,
  type ScoringContext,
  SCORER_VERSION,
  canonicalizeTheme,
  fanOutScoredArticle,
  parseScorerResponse,
} from "../article-scorer.js";

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

const baseArticle: NewsArticle = {
  id: "art-1",
  source: "finnhub",
  publisher: "Reuters",
  tickers: ["NVDA", "GOOGL"],
  headline: "OpenAI commits $50B to Stargate buildout",
  summary: "Massive datacenter expansion through 2027.",
  url: "https://reuters.com/x",
  publishedAt: "2026-05-31T13:00:00Z",
  fetchedAt: "2026-05-31T13:05:00Z",
};

const macroArticle: NewsArticle = {
  id: "art-macro",
  source: "rss",
  publisher: "CNBC",
  tickers: [],
  headline: "Fed signals 25bp cut likely at June meeting",
  summary: "Powell hints at easing in semi-annual testimony.",
  url: "https://cnbc.com/x",
  publishedAt: "2026-05-31T14:00:00Z",
  fetchedAt: "2026-05-31T14:05:00Z",
};

const baseContext: ScoringContext = {
  canonicalThemes: ["fed-rate-cuts", "ai-infra", "tariff-exposure"],
  upcomingEvents: [],
  tickerUniverse: ["NVDA", "GOOGL", "XLE", "USO", "TLT"],
};

const CANNED_RESPONSE = JSON.stringify({
  sentiment: 0.5,
  materiality: 0.7,
  themes: ["ai-infra"],
  catalysts: [],
  referenced_calendar_events: [],
});

// Build a minimal fake OpenAI-shaped client.
function makeFakeClient(
  content: string,
  opts?: { delayMs?: number; throwOn?: number },
): Pick<OpenAI, "chat" | "models"> {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: (async () => {
          calls++;
          if (opts?.throwOn === calls) {
            throw new Error("LM Studio unreachable");
          }
          if (opts?.delayMs) {
            await new Promise((r) => setTimeout(r, opts.delayMs));
          }
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 0, completion_tokens: 0 },
          };
        }) as unknown,
      },
    },
    models: {
      list: (async () => ({ data: [{ id: "qwen/qwen3-14b" }] })) as unknown,
    },
  } as unknown as Pick<OpenAI, "chat" | "models">;
}

const DEFAULT_OPTIONS: ArticleScorerOptions = {
  endpoint: "http://localhost:1234/v1",
  model: "qwen/qwen3-14b",
};

// ───────────────────────────────────────────────────────────────────────────
// parseScorerResponse
// ───────────────────────────────────────────────────────────────────────────

describe("parseScorerResponse", () => {
  it("parses bare JSON", () => {
    const result = parseScorerResponse(CANNED_RESPONSE);
    expect(result.sentiment).toBe(0.5);
    expect(result.materiality).toBe(0.7);
    expect(result.themes).toEqual(["ai-infra"]);
  });

  it("parses JSON wrapped in ```json ... ``` fences", () => {
    const wrapped = "```json\n" + CANNED_RESPONSE + "\n```";
    const result = parseScorerResponse(wrapped);
    expect(result.sentiment).toBe(0.5);
    expect(result.themes).toEqual(["ai-infra"]);
  });

  it("parses JSON with leading prose", () => {
    const withProse = "Here is the analysis:\n\n" + CANNED_RESPONSE + "\n\nThanks.";
    const result = parseScorerResponse(withProse);
    expect(result.sentiment).toBe(0.5);
  });

  it("throws on missing required field (sentiment)", () => {
    const broken = JSON.stringify({
      materiality: 0.5,
      themes: [],
      catalysts: [],
      referenced_calendar_events: [],
    });
    expect(() => parseScorerResponse(broken)).toThrow(/sentiment/);
  });

  it("throws on no JSON found", () => {
    expect(() => parseScorerResponse("just some prose, no JSON")).toThrow(/no JSON object/);
  });

  it("canonicalizes themes to lowercase-kebab-case", () => {
    const raw = JSON.stringify({
      sentiment: 0,
      materiality: 0.1,
      themes: ["Fed Rate Cuts", "AI/Infra", "  --crypto-rally--  "],
      catalysts: [],
      referenced_calendar_events: [],
    });
    const result = parseScorerResponse(raw);
    expect(result.themes).toEqual(["fed-rate-cuts", "ai-infra", "crypto-rally"]);
  });

  it("clamps sentiment to [-1,1] and materiality to [0,1]", () => {
    const raw = JSON.stringify({
      sentiment: 2.5,
      materiality: -0.3,
      themes: [],
      catalysts: [],
      referenced_calendar_events: [],
    });
    const result = parseScorerResponse(raw);
    expect(result.sentiment).toBe(1);
    expect(result.materiality).toBe(0);
  });

  it("caps themes array at 5 entries", () => {
    const raw = JSON.stringify({
      sentiment: 0,
      materiality: 0.1,
      themes: ["a", "b", "c", "d", "e", "f", "g"],
      catalysts: [],
      referenced_calendar_events: [],
    });
    const result = parseScorerResponse(raw);
    expect(result.themes).toHaveLength(5);
    expect(result.themes).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("filters invalid catalysts (unknown type, out-of-range magnitude)", () => {
    const raw = JSON.stringify({
      sentiment: 0,
      materiality: 0.2,
      themes: [],
      catalysts: [
        { type: "fomc", expected_date: "2026-06-18", magnitude: 4, direction: "down", confidence: 0.8 },
        { type: "nonsense", expected_date: null, magnitude: 3, direction: "up", confidence: 0.5 },
        { type: "earnings", expected_date: "2026-08-21", magnitude: 7, direction: "up", confidence: 0.5 },
      ],
      referenced_calendar_events: [],
    });
    const result = parseScorerResponse(raw);
    expect(result.catalysts).toHaveLength(1);
    expect(result.catalysts[0]?.type).toBe("fomc");
  });
});

describe("canonicalizeTheme", () => {
  it("kebabs and lowercases", () => {
    expect(canonicalizeTheme("Fed Rate Cuts")).toBe("fed-rate-cuts");
    expect(canonicalizeTheme("AI/Infra")).toBe("ai-infra");
    expect(canonicalizeTheme("  ---hello---")).toBe("hello");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// fanOutScoredArticle
// ───────────────────────────────────────────────────────────────────────────

describe("fanOutScoredArticle", () => {
  const parsedBase: ParsedScorerResponse = {
    sentiment: 0.3,
    materiality: 0.6,
    themes: ["ai-infra"],
    catalysts: [],
    referenced_calendar_events: [],
  };

  it("emits one record per ticker when article.tickers is non-empty", () => {
    const records = fanOutScoredArticle(baseArticle, parsedBase, baseContext, "qwen/qwen3-14b");
    expect(records).toHaveLength(2);
    expect(records[0]?.id).toBe("art-1::NVDA");
    expect(records[0]?.ticker).toBe("NVDA");
    expect(records[1]?.id).toBe("art-1::GOOGL");
    expect(records[1]?.ticker).toBe("GOOGL");
    expect(records[0]?.scorerVersion).toBe(SCORER_VERSION);
    expect(records[0]?.scorerModel).toBe("qwen/qwen3-14b");
  });

  it("emits one record per LLM-proposed ticker intersected with universe when article.tickers is empty", () => {
    const parsed: ParsedScorerResponse = {
      ...parsedBase,
      affected_tickers: ["XLE", "USO", "FAKE"], // FAKE not in universe → filtered
    };
    const records = fanOutScoredArticle(macroArticle, parsed, baseContext, "qwen/qwen3-14b");
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.ticker).sort()).toEqual(["USO", "XLE"]);
    expect(records[0]?.id).toBe("art-macro::XLE");
  });

  it("emits a single themed row with ticker='' when no ticker scope and no universe match", () => {
    const parsed: ParsedScorerResponse = {
      ...parsedBase,
      affected_tickers: ["UNKNOWN"], // not in universe
    };
    const records = fanOutScoredArticle(macroArticle, parsed, baseContext, "qwen/qwen3-14b");
    expect(records).toHaveLength(1);
    expect(records[0]?.ticker).toBe("");
    expect(records[0]?.id).toBe("art-macro::__theme__");
    expect(records[0]?.proposedAffectedTickers).toEqual(["UNKNOWN"]);
  });

  it("only populates proposedPmMappings on first record", () => {
    const parsed: ParsedScorerResponse = {
      ...parsedBase,
      proposed_pm_mappings: [
        {
          market_slug: "will-x-happen",
          proposed_tickers: [{ ticker: "NVDA", direction: "long", confidence: 0.8 }],
          interpretation_suggestion: "yesPp",
        },
      ],
    };
    const records = fanOutScoredArticle(baseArticle, parsed, baseContext, "qwen/qwen3-14b");
    expect(records[0]?.proposedPmMappings).toHaveLength(1);
    expect(records[1]?.proposedPmMappings).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ArticleScorer.scoreArticle (end-to-end with fake client)
// ───────────────────────────────────────────────────────────────────────────

describe("ArticleScorer.scoreArticle", () => {
  it("scores an article end-to-end and fans out per ticker", async () => {
    const scorer = new ArticleScorer(DEFAULT_OPTIONS, makeFakeClient(CANNED_RESPONSE));
    const records = await scorer.scoreArticle(baseArticle, baseContext);
    expect(records).toHaveLength(2);
    expect(records[0]?.sentiment).toBe(0.5);
    expect(records[0]?.materiality).toBe(0.7);
    expect(records[0]?.themes).toEqual(["ai-infra"]);
    expect(records[0]?.scorerModel).toBe("qwen/qwen3-14b");
    expect(records[0]?.scorerVersion).toBe(SCORER_VERSION);
  });

  it("serializes concurrent scoreArticle calls (sequential gate)", async () => {
    // Use a shared counter inside the fake client to count concurrent in-flight calls.
    // If two calls were in flight simultaneously, maxConcurrent would be > 1.
    let inFlight = 0;
    let maxConcurrent = 0;
    const fakeClient: Pick<OpenAI, "chat" | "models"> = {
      chat: {
        completions: {
          create: (async () => {
            inFlight++;
            if (inFlight > maxConcurrent) maxConcurrent = inFlight;
            await new Promise((r) => setTimeout(r, 30));
            inFlight--;
            return {
              choices: [{ message: { content: CANNED_RESPONSE } }],
              usage: { prompt_tokens: 0, completion_tokens: 0 },
            };
          }) as unknown,
        },
      },
      models: { list: (async () => ({ data: [] })) as unknown },
    } as unknown as Pick<OpenAI, "chat" | "models">;

    const scorer = new ArticleScorer(DEFAULT_OPTIONS, fakeClient);
    // Issue 3 parallel calls WITHOUT await between them.
    const promises = [
      scorer.scoreArticle(baseArticle, baseContext),
      scorer.scoreArticle(baseArticle, baseContext),
      scorer.scoreArticle(baseArticle, baseContext),
    ];
    await Promise.all(promises);
    expect(maxConcurrent).toBe(1);
  });

  it("propagates LLM errors (caller is responsible for backlog enqueue)", async () => {
    const scorer = new ArticleScorer(
      DEFAULT_OPTIONS,
      makeFakeClient(CANNED_RESPONSE, { throwOn: 1 }),
    );
    await expect(scorer.scoreArticle(baseArticle, baseContext)).rejects.toThrow(
      /LM Studio unreachable/,
    );
  });

  it("clamps concurrency > 1 to 1 with a warn", () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-new
      new ArticleScorer({ ...DEFAULT_OPTIONS, concurrency: 4 }, makeFakeClient(CANNED_RESPONSE));
      expect(warnings.some((w) => /clamped to 1/.test(w))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });
});
