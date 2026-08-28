/**
 * Scorer-health line in the digest — the operator-facing heartbeat for the
 * LLM layer. Covers: unhealthy (backlog + stale scoring), healthy (empty
 * backlog), never-scored, and the markdown rendering of each.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScoredArticle, ScorerHealth } from "../../signal/types.js";
import { DigestBuilder, renderDigestMarkdown } from "../digest-builder.js";

const NOW = new Date("2026-08-28T12:30:00Z");
const H = 60 * 60 * 1000;

let dataDir: string;
beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "digest-health-"));
});
afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

async function stageBacklog(n: number, enqueuedAt: Date): Promise<void> {
  const lines = Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      enqueuedAt: enqueuedAt.toISOString(),
      attempts: 3,
      lastErrorMessage: "Connection error.",
      article: { id: `a${i}`, source: "t", tickers: [], headline: "h", url: "", publishedAt: enqueuedAt.toISOString(), fetchedAt: enqueuedAt.toISOString() },
      pmContext: [],
    }),
  );
  await fs.writeFile(path.join(dataDir, "score-backlog.jsonl"), lines.join("\n") + "\n");
}

async function stageScored(scoredAt: Date): Promise<void> {
  const day = scoredAt.toISOString().split("T")[0];
  const rec: ScoredArticle = {
    id: "x::XLE", sourceArticleId: "x", ticker: "XLE", sentiment: 0, materiality: 0.1,
    themes: [], catalysts: [], referencedCalendarEvents: [],
    scoredAt: scoredAt.toISOString(), scorerModel: "m", scorerVersion: "v1",
  };
  await fs.writeFile(path.join(dataDir, `scored-articles-${day}.jsonl`), JSON.stringify(rec) + "\n");
}

describe("DigestBuilder scorerHealth", () => {
  it("reports unhealthy when the backlog is non-empty and nothing scored in 24h", async () => {
    await stageBacklog(2, new Date(NOW.getTime() - 72 * H));
    await stageScored(new Date(NOW.getTime() - 30 * H));
    const p = await new DigestBuilder({ dataDir }).build("MORNING", NOW);
    expect(p.scorerHealth).toMatchObject({ backlogSize: 2, healthy: false });
    expect(p.scorerHealth?.oldestBacklogAgeHours).toBeCloseTo(72, 0);
    expect(p.scorerHealth?.lastScoredAt).toBe(new Date(NOW.getTime() - 30 * H).toISOString());
    const md = renderDigestMarkdown(p);
    expect(md).toContain("Scorer down");
    expect(md).toContain("backlog 2");
    expect(md).toContain("backlog-drain");
  });

  it("reports healthy when the backlog is empty", async () => {
    await stageScored(new Date(NOW.getTime() - 2 * H));
    const p = await new DigestBuilder({ dataDir }).build("MIDDAY", NOW);
    expect(p.scorerHealth).toMatchObject({ backlogSize: 0, oldestBacklogAgeHours: null, healthy: true });
    expect(renderDigestMarkdown(p)).toContain("Scorer ok");
  });

  it("is healthy while catching up: backlog non-empty but scored within 24h", async () => {
    await stageBacklog(500, new Date(NOW.getTime() - 400 * H));
    await stageScored(new Date(NOW.getTime() - 1 * H));
    const p = await new DigestBuilder({ dataDir }).build("CLOSE", NOW);
    expect(p.scorerHealth?.healthy).toBe(true);
    expect(renderDigestMarkdown(p)).toContain("backlog 500");
  });

  it("renders 'never' when nothing has ever been scored", () => {
    const health: ScorerHealth = { backlogSize: 3, oldestBacklogAgeHours: 5, lastScoredAt: null, healthy: false };
    const md = renderDigestMarkdown({ flavor: "MORNING", builtAt: NOW.toISOString(), topStories: [], upcomingCalendar: [], scorerHealth: health });
    expect(md).toContain("never");
  });
});
