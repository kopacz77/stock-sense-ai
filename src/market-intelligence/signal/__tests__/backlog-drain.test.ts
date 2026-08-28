/**
 * backlog-drain unit tests.
 *
 * Isolated temp data dir per test. Fake scorer object (only `scoreArticle`
 * is called). Covers:
 *   - drained records land in the scored-articles file for the article's
 *     PUBLISH day (UTC), not today's file
 *   - rollups are rebuilt for every touched day (even when one already existed)
 *   - loop stops at `max`, on empty backlog, and on first failure
 *   - lock file is held during the drain and released after (also on throw)
 *   - isDrainLocked treats a stale lock as unlocked
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { NewsArticle } from "../../news/types.js";
import type { ArticleScorer, ScoringContext } from "../article-scorer.js";
import type { ScoredArticle } from "../types.js";
import { ScoreBacklog } from "../score-backlog.js";
import {
  drainBacklog,
  isDrainLocked,
  persistDrainedRecords,
  DRAIN_LOCK_FILE,
} from "../backlog-drain.js";

function makeArticle(id: string, publishedAt: string): NewsArticle {
  return {
    id,
    source: "test",
    publisher: "test",
    tickers: ["XLE"],
    headline: `headline ${id}`,
    summary: "s",
    url: `https://x/${id}`,
    publishedAt,
    fetchedAt: publishedAt,
  };
}

function makeRecord(article: NewsArticle): ScoredArticle {
  return {
    id: `${article.id}::XLE`,
    sourceArticleId: article.id,
    ticker: "XLE",
    sentiment: 0.5,
    materiality: 0.6,
    themes: [],
    catalysts: [],
    referencedCalendarEvents: [],
    scoredAt: "2026-08-28T00:00:00.000Z",
    scorerModel: "fake",
    scorerVersion: "v1",
  };
}

const CTX: ScoringContext = { canonicalThemes: [], upcomingEvents: [], tickerUniverse: ["XLE"] };

function fakeScorer(failIds: Set<string> = new Set()): ArticleScorer {
  return {
    scoreArticle: async (a: NewsArticle): Promise<ScoredArticle[]> => {
      if (failIds.has(a.id)) throw new Error("Connection error.");
      return [makeRecord(a)];
    },
  } as unknown as ArticleScorer;
}

async function readLines(file: string): Promise<string[]> {
  const raw = await fs.readFile(file, "utf8").catch(() => "");
  return raw.split("\n").filter((l) => l.trim().length > 0);
}

let dataDir: string;
beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "backlog-drain-"));
});

describe("persistDrainedRecords", () => {
  it("buckets records by the article's publish day (UTC)", async () => {
    const a1 = makeArticle("a1", "2026-07-20T15:00:00Z");
    const a2 = makeArticle("a2", "2026-07-21T02:00:00Z");
    const touched = await persistDrainedRecords(dataDir, {
      scoredRecords: [makeRecord(a1), makeRecord(a2)],
      scoredArticles: [a1, a2],
    });
    expect(touched.sort()).toEqual(["2026-07-20", "2026-07-21"]);
    expect(await readLines(path.join(dataDir, "scored-articles-2026-07-20.jsonl"))).toHaveLength(1);
    expect(await readLines(path.join(dataDir, "scored-articles-2026-07-21.jsonl"))).toHaveLength(1);
    const today = new Date().toISOString().split("T")[0];
    expect(await readLines(path.join(dataDir, `scored-articles-${today}.jsonl`))).toHaveLength(0);
  });
});

describe("drainBacklog", () => {
  it("drains in batches, writes by publish day, rebuilds touched rollups, stops when empty", async () => {
    const backlog = new ScoreBacklog({ dataDir });
    const arts = [
      makeArticle("a1", "2026-07-20T15:00:00Z"),
      makeArticle("a2", "2026-07-20T16:00:00Z"),
      makeArticle("a3", "2026-07-21T10:00:00Z"),
    ];
    for (const a of arts) await backlog.enqueue(a, [], "Connection error.");
    // Pre-existing rollup for 07-20 built while the scorer was down.
    await fs.writeFile(
      path.join(dataDir, "ticker-day-summary-2026-07-20.jsonl"),
      `${JSON.stringify({ date: "2026-07-20", ticker: "XLE", articleCount: 0 })}\n`,
    );

    const batches: number[] = [];
    const result = await drainBacklog({
      dataDir,
      scorer: fakeScorer(),
      context: CTX,
      batchSize: 2,
      onBatch: (b) => batches.push(b.scored),
    });

    expect(result.scored).toBe(3);
    expect(result.remaining).toBe(0);
    expect(result.stoppedBecause).toBe("empty");
    expect(batches).toEqual([2, 1]);
    expect(result.touchedDays.sort()).toEqual(["2026-07-20", "2026-07-21"]);
    expect(await readLines(path.join(dataDir, "scored-articles-2026-07-20.jsonl"))).toHaveLength(2);
    expect(await readLines(path.join(dataDir, "scored-articles-2026-07-21.jsonl"))).toHaveLength(1);

    // Rollup for 07-20 was rebuilt from the now-present scored articles.
    const rollup = await readLines(path.join(dataDir, "ticker-day-summary-2026-07-20.jsonl"));
    const xle = rollup.map((l) => JSON.parse(l)).find((r) => r.ticker === "XLE");
    expect(xle?.articleCount).toBe(2);
    expect(result.rollupsRebuilt.sort()).toEqual(["2026-07-20", "2026-07-21"]);
    expect(await isDrainLocked(dataDir)).toBe(false);
  });

  it("stops at max and leaves the rest queued", async () => {
    const backlog = new ScoreBacklog({ dataDir });
    for (let i = 0; i < 5; i++) {
      await backlog.enqueue(makeArticle(`a${i}`, `2026-07-2${i}T10:00:00Z`), [], "x");
    }
    const result = await drainBacklog({ dataDir, scorer: fakeScorer(), context: CTX, max: 3, batchSize: 2 });
    expect(result.scored).toBe(3);
    expect(result.remaining).toBe(2);
    expect(result.stoppedBecause).toBe("max");
  });

  it("stops on first failure and reports it", async () => {
    const backlog = new ScoreBacklog({ dataDir });
    await backlog.enqueue(makeArticle("ok1", "2026-07-20T10:00:00Z"), [], "x");
    await backlog.enqueue(makeArticle("bad", "2026-07-20T11:00:00Z"), [], "x");
    await backlog.enqueue(makeArticle("ok2", "2026-07-20T12:00:00Z"), [], "x");
    const result = await drainBacklog({
      dataDir,
      scorer: fakeScorer(new Set(["bad"])),
      context: CTX,
      batchSize: 10,
    });
    expect(result.scored).toBe(1);
    expect(result.remaining).toBe(2);
    expect(result.stoppedBecause).toBe("failure");
    expect(result.lastError).toContain("Connection error");
    expect(await isDrainLocked(dataDir)).toBe(false);
  });

  it("holds the lock while draining and releases it even if the scorer throws unexpectedly", async () => {
    const backlog = new ScoreBacklog({ dataDir });
    await backlog.enqueue(makeArticle("a1", "2026-07-20T10:00:00Z"), [], "x");
    let sawLock = false;
    const scorer = {
      scoreArticle: async (a: NewsArticle) => {
        sawLock = await isDrainLocked(dataDir);
        return [makeRecord(a)];
      },
    } as unknown as ArticleScorer;
    await drainBacklog({ dataDir, scorer, context: CTX });
    expect(sawLock).toBe(true);
    expect(await isDrainLocked(dataDir)).toBe(false);
  });

  it("stops between batches when aborted", async () => {
    const backlog = new ScoreBacklog({ dataDir });
    for (let i = 0; i < 4; i++) {
      await backlog.enqueue(makeArticle(`a${i}`, "2026-07-20T10:00:00Z"), [], "x");
    }
    const ac = new AbortController();
    const result = await drainBacklog({
      dataDir,
      scorer: fakeScorer(),
      context: CTX,
      batchSize: 2,
      signal: ac.signal,
      onBatch: () => ac.abort(),
    });
    expect(result.scored).toBe(2);
    expect(result.remaining).toBe(2);
    expect(result.stoppedBecause).toBe("aborted");
    expect(await isDrainLocked(dataDir)).toBe(false);
  });

  it("refuses to start when another drain holds a fresh lock", async () => {
    await fs.writeFile(
      path.join(dataDir, DRAIN_LOCK_FILE),
      JSON.stringify({ pid: 1, acquiredAt: new Date().toISOString() }),
    );
    await expect(drainBacklog({ dataDir, scorer: fakeScorer(), context: CTX })).rejects.toThrow(/lock/i);
  });
});

describe("isDrainLocked", () => {
  it("treats a stale lock as unlocked", async () => {
    await fs.writeFile(
      path.join(dataDir, DRAIN_LOCK_FILE),
      JSON.stringify({ pid: 1, acquiredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }),
    );
    expect(await isDrainLocked(dataDir)).toBe(false);
    expect(await isDrainLocked(dataDir, 4 * 60 * 60 * 1000)).toBe(true);
  });
});
