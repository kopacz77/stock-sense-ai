/**
 * StabilityTest unit tests — Plan 10-07
 *
 * Stages synthetic `scored-articles-YYYY-MM-DD.jsonl` + `news-YYYY-MM-DD.jsonl`
 * files in a temp dir, runs `runStabilityTest` with a fake scorer that returns
 * deterministic (or configurable-jitter) results, and asserts on the report.
 *
 * The ArticleScorer is constructed with a `clientOverride` so no live LM Studio
 * is needed — same pattern as article-scorer.test.ts.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

import {
  computeWeightedSentByBucket,
  percentile,
  runStabilityTest,
} from "../stability-test.js";
import { ArticleScorer, type ScoringContext } from "../article-scorer.js";
import type { NewsArticle } from "../../news/types.js";
import type { ScoredArticle } from "../types.js";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures + helpers
// ───────────────────────────────────────────────────────────────────────────

const TODAY = new Date();
const TODAY_ISO = TODAY.toISOString().split("T")[0]!;

function makeScored(overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  return {
    id: "art-1::NVDA",
    sourceArticleId: "art-1",
    ticker: "NVDA",
    sentiment: 0.5,
    materiality: 0.8,
    themes: ["ai-infra"],
    catalysts: [],
    referencedCalendarEvents: [],
    scoredAt: `${TODAY_ISO}T14:00:00Z`,
    scorerModel: "qwen/qwen3-14b",
    scorerVersion: "v1",
    ...overrides,
  };
}

function makeArticle(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: "art-1",
    source: "finnhub",
    publisher: "Reuters",
    tickers: ["NVDA"],
    headline: "NVDA test headline",
    summary: "Synthetic summary.",
    url: "https://example.com",
    publishedAt: `${TODAY_ISO}T13:00:00Z`,
    fetchedAt: `${TODAY_ISO}T13:05:00Z`,
    ...overrides,
  };
}

async function stageScored(dataDir: string, records: ScoredArticle[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  // Group by scoredAt date.
  const byDate = new Map<string, ScoredArticle[]>();
  for (const r of records) {
    const day = r.scoredAt.split("T")[0]!;
    const arr = byDate.get(day) ?? [];
    arr.push(r);
    byDate.set(day, arr);
  }
  for (const [day, rs] of byDate) {
    const file = path.join(dataDir, `scored-articles-${day}.jsonl`);
    await fs.writeFile(file, rs.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }
}

async function stageNews(dataDir: string, articles: NewsArticle[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  // Group by publishedAt date.
  const byDate = new Map<string, NewsArticle[]>();
  for (const a of articles) {
    const day = a.publishedAt.split("T")[0]!;
    const arr = byDate.get(day) ?? [];
    arr.push(a);
    byDate.set(day, arr);
  }
  for (const [day, as] of byDate) {
    const file = path.join(dataDir, `news-${day}.jsonl`);
    await fs.writeFile(file, as.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
  }
}

/**
 * Construct an ArticleScorer with an injected fake client that returns a
 * scripted sentiment/materiality for each call (round-robin through `script`).
 *
 * Each entry in `script` may also specify a `ticker` override that fakes out
 * fan-out (we set it via the `affected_tickers` field combined with the
 * incoming `tickers` in the prompt).
 */
function makeScorer(
  script: Array<{ sentiment: number; materiality: number; themes?: string[] }>,
): ArticleScorer {
  let i = 0;
  const fakeClient = {
    chat: {
      completions: {
        create: (async () => {
          const entry = script[i % script.length]!;
          i++;
          const body = JSON.stringify({
            sentiment: entry.sentiment,
            materiality: entry.materiality,
            themes: entry.themes ?? ["ai-infra"],
            catalysts: [],
            referenced_calendar_events: [],
          });
          return { choices: [{ message: { content: body } }] };
        }) as unknown,
      },
    },
    models: { list: (async () => ({ data: [{ id: "qwen/qwen3-14b" }] })) as unknown },
  } as unknown as Pick<OpenAI, "chat" | "models">;
  return new ArticleScorer(
    { endpoint: "http://fake", model: "qwen/qwen3-14b" },
    fakeClient,
  );
}

const baseContext: ScoringContext = {
  canonicalThemes: ["ai-infra"],
  upcomingEvents: [],
  tickerUniverse: ["NVDA", "GOOGL"],
};

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe("percentile (pure math)", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the single value for length-1 array", () => {
    expect(percentile([0.42], 50)).toBe(0.42);
    expect(percentile([0.42], 95)).toBe(0.42);
  });

  it("computes P50 of [0.1, 0.2, 0.3, 0.4, 0.5] as 0.3", () => {
    // rank = 0.5 × 4 = 2.0 → exact index 2 → 0.3
    expect(percentile([0.1, 0.2, 0.3, 0.4, 0.5], 50)).toBeCloseTo(0.3, 6);
  });

  it("computes P95 of [0.1, 0.2, 0.3, 0.4, 0.5] via linear interp (= 0.48)", () => {
    // rank = 0.95 × 4 = 3.8 → between index 3 (0.4) and 4 (0.5)
    // result = 0.4 + 0.8 × (0.5 - 0.4) = 0.48
    expect(percentile([0.1, 0.2, 0.3, 0.4, 0.5], 95)).toBeCloseTo(0.48, 6);
  });
});

describe("computeWeightedSentByBucket", () => {
  it("returns the materiality-weighted mean per (date × ticker) bucket", () => {
    const rows: ScoredArticle[] = [
      makeScored({ ticker: "NVDA", sentiment: 1.0, materiality: 0.5 }),
      makeScored({
        ticker: "NVDA",
        sentiment: -1.0,
        materiality: 0.5,
        id: "art-2::NVDA",
        sourceArticleId: "art-2",
      }),
      makeScored({
        ticker: "GOOGL",
        sentiment: 0.4,
        materiality: 1.0,
        id: "art-3::GOOGL",
        sourceArticleId: "art-3",
      }),
    ];
    const out = computeWeightedSentByBucket(rows, (s) => s.scoredAt.split("T")[0] ?? "");
    expect(out.get(`${TODAY_ISO}::NVDA`)).toBeCloseTo(0, 6); // (+1 × 0.5 - 1 × 0.5) / 1.0 = 0
    expect(out.get(`${TODAY_ISO}::GOOGL`)).toBeCloseTo(0.4, 6);
  });

  it("returns 0 when total materiality is 0", () => {
    const rows: ScoredArticle[] = [
      makeScored({ sentiment: 0.5, materiality: 0 }),
      makeScored({
        sentiment: -0.5,
        materiality: 0,
        id: "art-2::NVDA",
        sourceArticleId: "art-2",
      }),
    ];
    const out = computeWeightedSentByBucket(rows, (s) => s.scoredAt.split("T")[0] ?? "");
    expect(out.get(`${TODAY_ISO}::NVDA`)).toBe(0);
  });

  it("skips empty-ticker (themed-only) rows", () => {
    const rows: ScoredArticle[] = [
      makeScored({ ticker: "", sentiment: 0.9, materiality: 1.0, id: "art-1::__theme__" }),
    ];
    const out = computeWeightedSentByBucket(rows, (s) => s.scoredAt.split("T")[0] ?? "");
    expect(out.size).toBe(0);
  });
});

describe("runStabilityTest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty report when no scored articles in window", async () => {
    const scorer = makeScorer([{ sentiment: 0.5, materiality: 0.7 }]);
    const report = await runStabilityTest({
      days: 7,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    expect(report.passed).toBe(false);
    expect(report.articlesEvaluated).toBe(0);
    expect(report.reason).toMatch(/No scored articles/);
  });

  it("zero drift -> articleP95=0, rollupP95=0, passed=true", async () => {
    await stageScored(tmpDir, [makeScored({ sentiment: 0.5, materiality: 0.8 })]);
    await stageNews(tmpDir, [makeArticle()]);
    // Scorer returns identical sentiment.
    const scorer = makeScorer([{ sentiment: 0.5, materiality: 0.8 }]);
    const report = await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    expect(report.articlesEvaluated).toBe(1);
    expect(report.articleP95).toBeCloseTo(0, 6);
    expect(report.rollupP95).toBeCloseTo(0, 6);
    expect(report.passed).toBe(true);
    expect(report.reason).toMatch(/^PASS/);
  });

  it("small uniform drift (+0.05) -> articleP95 ~= 0.05, passes (<=0.15)", async () => {
    const baselineRows: ScoredArticle[] = [];
    const articles: NewsArticle[] = [];
    for (let i = 0; i < 5; i++) {
      baselineRows.push(
        makeScored({
          id: `art-${i}::NVDA`,
          sourceArticleId: `art-${i}`,
          sentiment: 0.3,
          materiality: 0.5,
        }),
      );
      articles.push(makeArticle({ id: `art-${i}` }));
    }
    await stageScored(tmpDir, baselineRows);
    await stageNews(tmpDir, articles);
    // Rerun: every call returns 0.35 (delta +0.05).
    const scorer = makeScorer([{ sentiment: 0.35, materiality: 0.5 }]);
    const report = await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    expect(report.articlesEvaluated).toBe(5);
    expect(report.articleP95).toBeCloseTo(0.05, 5);
    expect(report.passed).toBe(true);
  });

  it("large drift (+0.30) fails article threshold and reason mentions article violation", async () => {
    const baselineRows: ScoredArticle[] = [];
    const articles: NewsArticle[] = [];
    for (let i = 0; i < 5; i++) {
      baselineRows.push(
        makeScored({
          id: `art-${i}::NVDA`,
          sourceArticleId: `art-${i}`,
          sentiment: 0.3,
          materiality: 0.5,
        }),
      );
      articles.push(makeArticle({ id: `art-${i}` }));
    }
    await stageScored(tmpDir, baselineRows);
    await stageNews(tmpDir, articles);
    // Rerun: every call returns 0.6 (delta +0.30).
    const scorer = makeScorer([{ sentiment: 0.6, materiality: 0.5 }]);
    const report = await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    expect(report.articleP95).toBeCloseTo(0.3, 5);
    expect(report.passed).toBe(false);
    expect(report.reason).toMatch(/FAIL/);
    expect(report.reason).toMatch(/article P95/);
  });

  it("article passes but rollup fails when materiality=1.0 and rerun sentiment shifts 0.12", async () => {
    // One article, ticker NVDA, materiality=1.0, baseline sentiment=0.
    // Rerun returns 0.12 -> articleDelta=0.12 (<=0.15 passes), but rollup weighted
    // mean shifts identically (single article, materiality=1.0) -> rollup delta=0.12 (>0.08 fails).
    const baseline = makeScored({ sentiment: 0.0, materiality: 1.0 });
    await stageScored(tmpDir, [baseline]);
    await stageNews(tmpDir, [makeArticle()]);
    const scorer = makeScorer([{ sentiment: 0.12, materiality: 1.0 }]);
    const report = await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    expect(report.articleP95).toBeCloseTo(0.12, 5);
    expect(report.rollupP95).toBeCloseTo(0.12, 5);
    expect(report.passed).toBe(false);
    expect(report.reason).toMatch(/rollup P95/);
    expect(report.reason).not.toMatch(/article P95 /); // article side did not violate
  });

  it("progress callback fires N times where N = articles evaluated", async () => {
    const rows: ScoredArticle[] = [];
    const articles: NewsArticle[] = [];
    for (let i = 0; i < 3; i++) {
      rows.push(makeScored({ id: `art-${i}::NVDA`, sourceArticleId: `art-${i}` }));
      articles.push(makeArticle({ id: `art-${i}` }));
    }
    await stageScored(tmpDir, rows);
    await stageNews(tmpDir, articles);
    const scorer = makeScorer([{ sentiment: 0.5, materiality: 0.8 }]);
    const progressCalls: Array<[number, number]> = [];
    await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
      onProgress: (done, total) => progressCalls.push([done, total]),
    });
    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("skips articles that throw on re-score (does not skew the delta as a false 0)", async () => {
    // 2 articles: art-0 succeeds with same score; art-1 throws on re-score.
    // Only 1 delta should be in articleSentDeltas (the successful one).
    const rows: ScoredArticle[] = [
      makeScored({ id: "art-0::NVDA", sourceArticleId: "art-0", sentiment: 0.5 }),
      makeScored({ id: "art-1::NVDA", sourceArticleId: "art-1", sentiment: 0.5 }),
    ];
    await stageScored(tmpDir, rows);
    await stageNews(tmpDir, [
      makeArticle({ id: "art-0" }),
      makeArticle({ id: "art-1" }),
    ]);
    // Scorer throws on the 2nd call.
    let callCount = 0;
    const fakeClient = {
      chat: {
        completions: {
          create: (async () => {
            callCount++;
            if (callCount === 2) throw new Error("LM Studio unreachable");
            const body = JSON.stringify({
              sentiment: 0.5,
              materiality: 0.8,
              themes: ["ai-infra"],
              catalysts: [],
              referenced_calendar_events: [],
            });
            return { choices: [{ message: { content: body } }] };
          }) as unknown,
        },
      },
      models: { list: (async () => ({ data: [] })) as unknown },
    } as unknown as Pick<OpenAI, "chat" | "models">;
    const scorer = new ArticleScorer(
      { endpoint: "http://fake", model: "qwen/qwen3-14b" },
      fakeClient,
    );
    // Silence the warn for cleaner test output.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await runStabilityTest({
      days: 1,
      scorer,
      context: baseContext,
      dataDir: tmpDir,
    });
    warnSpy.mockRestore();
    // 2 articles evaluated (we tried both), but only 1 delta recorded.
    expect(report.articlesEvaluated).toBe(2);
    expect(report.articleSentDeltas).toHaveLength(1);
    expect(report.articleSentDeltas[0]).toBeCloseTo(0, 6);
  });
});
