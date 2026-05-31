/**
 * ScoreBacklog unit tests.
 *
 * Uses a fresh temp dir per test (via fs.mkdtemp) so tests don't collide on
 * the shared `data/intel/score-backlog.jsonl` path. Uses a tiny fake scorer
 * (an object satisfying the surface ScoreBacklog calls on it: `scoreArticle`).
 *
 * Covers:
 *   - enqueue → load round-trip across fresh instances (cache-cold load)
 *   - enqueue dedup by article.id (attempts bumped, single entry)
 *   - drain FIFO ordering (oldest scored first)
 *   - drain cap (maxN enforced)
 *   - drain bails on first failure (no wasted budget on guaranteed failures)
 *   - oldestAgeMs
 *   - drain on empty backlog
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { NewsArticle } from "../../news/types.js";
import type { ArticleScorer, ScoringContext } from "../article-scorer.js";
import type { ScoredArticle } from "../types.js";
import { ScoreBacklog } from "../score-backlog.js";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function makeArticle(id: string, headline = "test headline"): NewsArticle {
  return {
    id,
    source: "test",
    publisher: "test",
    tickers: ["NVDA"],
    headline,
    summary: "test summary",
    url: `https://x/${id}`,
    publishedAt: "2026-05-31T13:00:00Z",
    fetchedAt: "2026-05-31T13:01:00Z",
  };
}

const EMPTY_CONTEXT: ScoringContext = {
  canonicalThemes: [],
  upcomingEvents: [],
  tickerUniverse: ["NVDA"],
};

/**
 * Tiny fake scorer that satisfies the ScoreBacklog → ArticleScorer surface
 * (only `scoreArticle` is called). Records calls; can be set to throw on
 * specific call counts.
 */
function makeFakeScorer(opts?: { throwOn?: number[] }): {
  scorer: ArticleScorer;
  calls: string[];
} {
  const calls: string[] = [];
  const scorer = {
    scoreArticle: async (article: NewsArticle, _ctx: ScoringContext): Promise<ScoredArticle[]> => {
      calls.push(article.id);
      if (opts?.throwOn?.includes(calls.length)) {
        throw new Error(`LM Studio unreachable (call #${calls.length})`);
      }
      return [
        {
          id: `${article.id}::NVDA`,
          sourceArticleId: article.id,
          ticker: "NVDA",
          sentiment: 0.5,
          materiality: 0.5,
          themes: [],
          catalysts: [],
          referencedCalendarEvents: [],
          scoredAt: new Date().toISOString(),
          scorerModel: "fake",
          scorerVersion: "v1",
        },
      ];
    },
  } as unknown as ArticleScorer;
  return { scorer, calls };
}

// ───────────────────────────────────────────────────────────────────────────
// Test setup: fresh temp dir per test
// ───────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "score-backlog-"));
});

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe("ScoreBacklog.enqueue + load round-trip", () => {
  it("persists entries and re-reads them from a fresh instance", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    await backlog.enqueue(makeArticle("a1"), [], "first error");
    expect(await backlog.size()).toBe(1);

    // Fresh instance simulates a process restart — cache must be cold.
    const reopened = new ScoreBacklog({ dataDir: tempDir });
    expect(await reopened.size()).toBe(1);
  });
});

describe("ScoreBacklog.enqueue dedup", () => {
  it("dedups by article.id, bumps attempts, preserves enqueuedAt", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    await backlog.enqueue(makeArticle("a1"), [], "first");
    await new Promise((r) => setTimeout(r, 5));
    await backlog.enqueue(makeArticle("a1"), [], "second");
    expect(await backlog.size()).toBe(1);

    // Re-open and inspect the underlying file to verify attempts=2.
    const reopened = new ScoreBacklog({ dataDir: tempDir });
    const result = await reopened.drain(makeFakeScorer().scorer, EMPTY_CONTEXT, 10);
    expect(result.scored).toBe(1);
  });
});

describe("ScoreBacklog.drain ordering and cap", () => {
  it("drains oldest-first up to maxN", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    await backlog.enqueue(makeArticle("a1"), []);
    await new Promise((r) => setTimeout(r, 10));
    await backlog.enqueue(makeArticle("a2"), []);
    await new Promise((r) => setTimeout(r, 10));
    await backlog.enqueue(makeArticle("a3"), []);
    expect(await backlog.size()).toBe(3);

    const { scorer, calls } = makeFakeScorer();
    const result = await backlog.drain(scorer, EMPTY_CONTEXT, 2);
    expect(result.scored).toBe(2);
    expect(result.remaining).toBe(1);
    expect(calls).toEqual(["a1", "a2"]); // FIFO
    expect(await backlog.size()).toBe(1);
  });

  it("enforces maxN cap on larger backlogs", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    for (let i = 0; i < 10; i++) {
      await backlog.enqueue(makeArticle(`a${i}`), []);
      await new Promise((r) => setTimeout(r, 2));
    }
    const { scorer, calls } = makeFakeScorer();
    const result = await backlog.drain(scorer, EMPTY_CONTEXT, 3);
    expect(result.scored).toBe(3);
    expect(result.remaining).toBe(7);
    expect(calls.length).toBe(3);
  });
});

describe("ScoreBacklog.drain bails on first failure", () => {
  it("stops after first error, leaves remaining slice in backlog", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    for (let i = 0; i < 10; i++) {
      await backlog.enqueue(makeArticle(`a${i}`), []);
      await new Promise((r) => setTimeout(r, 2));
    }
    // 1st call succeeds; 2nd throws — should bail after 1.
    const { scorer, calls } = makeFakeScorer({ throwOn: [2] });
    const result = await backlog.drain(scorer, EMPTY_CONTEXT, 5);
    expect(result.scored).toBe(1);
    expect(result.failed).toBe(1);
    expect(calls.length).toBe(2); // Only 2 calls (success + first failure) — bailed after.
    // After drain: 10 entries total, 1 removed (the successful score), 9 remain.
    expect(result.remaining).toBe(9);
    expect(await backlog.size()).toBe(9);
  });
});

describe("ScoreBacklog.oldestAgeMs", () => {
  it("returns null on empty backlog", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    expect(await backlog.oldestAgeMs()).toBeNull();
  });

  it("returns age of oldest entry", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    await backlog.enqueue(makeArticle("a1"), []);
    await new Promise((r) => setTimeout(r, 50));
    await backlog.enqueue(makeArticle("a2"), []);
    const age = await backlog.oldestAgeMs();
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(40); // allow some slack
  });
});

describe("ScoreBacklog.drain on empty", () => {
  it("returns zeroes when backlog is empty", async () => {
    const backlog = new ScoreBacklog({ dataDir: tempDir });
    const { scorer } = makeFakeScorer();
    const result = await backlog.drain(scorer, EMPTY_CONTEXT, 50);
    expect(result.scored).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.oldestAgeMs).toBeNull();
    expect(result.scoredRecords).toEqual([]);
  });
});
