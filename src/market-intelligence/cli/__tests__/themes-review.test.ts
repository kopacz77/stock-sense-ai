/**
 * Themes-review aggregator unit tests — Plan 10-07 Task 2.
 *
 * Stages synthetic scored-articles + news files + themes.json + themes-rejected.json
 * in a temp dir, runs `aggregateThemeCandidates`, and asserts on the returned list.
 *
 * The interactive accept/alias/reject readline loop lives in intel-commands.ts
 * and is exercised by operators during real use, not unit tested here.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aggregateThemeCandidates,
  readThemesConfig,
  readRejectedConfig,
  writeThemesConfig,
  writeRejectedConfig,
  type ThemesConfigShape,
  type ThemesRejectedShape,
} from "../themes-review-helpers.js";
import type { ScoredArticle } from "../../signal/types.js";
import type { NewsArticle } from "../../news/types.js";

const TODAY = new Date();
const TODAY_ISO = TODAY.toISOString().split("T")[0]!;

function makeScored(theme: string, overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  const base: ScoredArticle = {
    id: "art-1::NVDA",
    sourceArticleId: "art-1",
    ticker: "NVDA",
    sentiment: 0.5,
    materiality: 0.5,
    themes: [theme],
    catalysts: [],
    referencedCalendarEvents: [],
    scoredAt: `${TODAY_ISO}T14:00:00Z`,
    scorerModel: "qwen/qwen3-14b",
    scorerVersion: "v1",
  };
  return { ...base, ...overrides };
}

function makeArticle(id: string, headline: string, publisher = "Reuters"): NewsArticle {
  return {
    id,
    source: "finnhub",
    publisher,
    tickers: ["NVDA"],
    headline,
    summary: "",
    url: "https://example.com",
    publishedAt: `${TODAY_ISO}T13:00:00Z`,
    fetchedAt: `${TODAY_ISO}T13:05:00Z`,
  };
}

async function stage(
  tmpDir: string,
  scored: ScoredArticle[],
  articles: NewsArticle[],
  themesCfg: ThemesConfigShape,
  rejectedCfg: ThemesRejectedShape,
): Promise<{ dataDir: string; configDir: string }> {
  const dataDir = path.join(tmpDir, "data");
  const configDir = path.join(tmpDir, "config");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  if (scored.length > 0) {
    const scoredFile = path.join(dataDir, `scored-articles-${TODAY_ISO}.jsonl`);
    await fs.writeFile(scoredFile, scored.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }
  if (articles.length > 0) {
    const newsFile = path.join(dataDir, `news-${TODAY_ISO}.jsonl`);
    await fs.writeFile(newsFile, articles.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
  }
  await fs.writeFile(path.join(configDir, "themes.json"), JSON.stringify(themesCfg, null, 2), "utf8");
  await fs.writeFile(
    path.join(configDir, "themes-rejected.json"),
    JSON.stringify(rejectedCfg, null, 2),
    "utf8",
  );

  return { dataDir, configDir };
}

const EMPTY_THEMES: ThemesConfigShape = {
  version: 1,
  lastUpdated: TODAY_ISO,
  themes: [],
};
const EMPTY_REJECTED: ThemesRejectedShape = { version: 1, rejected: [] };

// ───────────────────────────────────────────────────────────────────────────

describe("aggregateThemeCandidates", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "themes-review-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("filters to themes with mention count >= minMentions (6/3/4/5/6/7 with min=5 -> 3 survive)", async () => {
    // Themes: aaa (mentions=2), bbb (3), ccc (4), ddd (5), eee (6), fff (7)
    const scored: ScoredArticle[] = [];
    const mentions: Record<string, number> = { aaa: 2, bbb: 3, ccc: 4, ddd: 5, eee: 6, fff: 7 };
    let i = 0;
    for (const [theme, count] of Object.entries(mentions)) {
      for (let n = 0; n < count; n++) {
        scored.push(
          makeScored(theme, {
            id: `art-${i}::NVDA`,
            sourceArticleId: `art-${i}`,
          }),
        );
        i++;
      }
    }
    const articles: NewsArticle[] = scored.map((s) => makeArticle(s.sourceArticleId, "h"));
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, EMPTY_THEMES, EMPTY_REJECTED);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates.map((c) => c.theme)).toEqual(["fff", "eee", "ddd"]); // 7,6,5
  });

  it("excludes themes that match a canonical name in themes.json", async () => {
    const scored: ScoredArticle[] = [];
    for (let n = 0; n < 6; n++) {
      scored.push(
        makeScored("ai-infra", {
          id: `art-${n}::NVDA`,
          sourceArticleId: `art-${n}`,
        }),
      );
    }
    const articles = scored.map((s) => makeArticle(s.sourceArticleId, "h"));
    const themesCfg: ThemesConfigShape = {
      version: 1,
      lastUpdated: TODAY_ISO,
      themes: [{ canonical: "ai-infra", aliases: [] }],
    };
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, themesCfg, EMPTY_REJECTED);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates).toEqual([]);
  });

  it("excludes themes already listed as an alias of a canonical theme", async () => {
    const scored: ScoredArticle[] = [];
    for (let n = 0; n < 6; n++) {
      scored.push(
        makeScored("stargate", {
          id: `art-${n}::NVDA`,
          sourceArticleId: `art-${n}`,
        }),
      );
    }
    const articles = scored.map((s) => makeArticle(s.sourceArticleId, "h"));
    const themesCfg: ThemesConfigShape = {
      version: 1,
      lastUpdated: TODAY_ISO,
      themes: [{ canonical: "ai-infra", aliases: ["stargate", "datacenter-buildout"] }],
    };
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, themesCfg, EMPTY_REJECTED);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates).toEqual([]);
  });

  it("excludes themes that are in themes-rejected.json", async () => {
    const scored: ScoredArticle[] = [];
    for (let n = 0; n < 6; n++) {
      scored.push(
        makeScored("doge-pump", {
          id: `art-${n}::NVDA`,
          sourceArticleId: `art-${n}`,
        }),
      );
    }
    const articles = scored.map((s) => makeArticle(s.sourceArticleId, "h"));
    const rejected: ThemesRejectedShape = { version: 1, rejected: ["doge-pump"] };
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, EMPTY_THEMES, rejected);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates).toEqual([]);
  });

  it("enriches with up to 2 sample headlines per candidate, picking highest-materiality first", async () => {
    // 5 articles for "spac-mania"; vary materiality so highest-2 should be picked.
    const scored: ScoredArticle[] = [
      makeScored("spac-mania", {
        id: "art-0::NVDA",
        sourceArticleId: "art-0",
        materiality: 0.1,
      }),
      makeScored("spac-mania", {
        id: "art-1::NVDA",
        sourceArticleId: "art-1",
        materiality: 0.9,
      }),
      makeScored("spac-mania", {
        id: "art-2::NVDA",
        sourceArticleId: "art-2",
        materiality: 0.5,
      }),
      makeScored("spac-mania", {
        id: "art-3::NVDA",
        sourceArticleId: "art-3",
        materiality: 0.7,
      }),
      makeScored("spac-mania", {
        id: "art-4::NVDA",
        sourceArticleId: "art-4",
        materiality: 0.2,
      }),
    ];
    const articles: NewsArticle[] = [
      makeArticle("art-0", "headline 0"),
      makeArticle("art-1", "headline 1 (highest mat)"),
      makeArticle("art-2", "headline 2"),
      makeArticle("art-3", "headline 3 (second highest)"),
      makeArticle("art-4", "headline 4"),
    ];
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, EMPTY_THEMES, EMPTY_REJECTED);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates).toHaveLength(1);
    const cand = candidates[0]!;
    expect(cand.theme).toBe("spac-mania");
    expect(cand.mentions).toBe(5);
    expect(cand.samples).toHaveLength(2);
    expect(cand.samples[0]!.articleId).toBe("art-1");
    expect(cand.samples[0]!.headline).toBe("headline 1 (highest mat)");
    expect(cand.samples[1]!.articleId).toBe("art-3");
    expect(cand.samples[1]!.headline).toBe("headline 3 (second highest)");
  });

  it("aggregates unique tickers across mentions of a candidate theme", async () => {
    const scored: ScoredArticle[] = [
      makeScored("quantum-hype", {
        id: "art-0::IBM",
        sourceArticleId: "art-0",
        ticker: "IBM",
      }),
      makeScored("quantum-hype", {
        id: "art-1::GOOGL",
        sourceArticleId: "art-1",
        ticker: "GOOGL",
      }),
      makeScored("quantum-hype", {
        id: "art-2::IBM",
        sourceArticleId: "art-2",
        ticker: "IBM",
      }),
      makeScored("quantum-hype", {
        id: "art-3::RGTI",
        sourceArticleId: "art-3",
        ticker: "RGTI",
      }),
      makeScored("quantum-hype", {
        id: "art-4::IONQ",
        sourceArticleId: "art-4",
        ticker: "IONQ",
      }),
    ];
    const articles = scored.map((s) => makeArticle(s.sourceArticleId, "h"));
    const { dataDir, configDir } = await stage(tmpDir, scored, articles, EMPTY_THEMES, EMPTY_REJECTED);

    const candidates = await aggregateThemeCandidates({
      days: 7,
      minMentions: 5,
      dataDir,
      configDir,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.tickers.sort()).toEqual(["GOOGL", "IBM", "IONQ", "RGTI"]);
  });
});

describe("themes config I/O round-trip", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "themes-cfg-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("readThemesConfig returns empty default when file missing", async () => {
    const cfg = await readThemesConfig(tmpDir);
    expect(cfg.themes).toEqual([]);
  });

  it("writeThemesConfig + readThemesConfig round-trips structured data", async () => {
    const cfg: ThemesConfigShape = {
      version: 1,
      lastUpdated: "2020-01-01",
      themes: [{ canonical: "ai-infra", aliases: ["stargate"] }],
    };
    await writeThemesConfig(cfg, tmpDir);
    const read = await readThemesConfig(tmpDir);
    expect(read.themes).toEqual([{ canonical: "ai-infra", aliases: ["stargate"] }]);
    // writer should bump lastUpdated to today; we don't pin the exact value.
    expect(read.lastUpdated).not.toBe("2020-01-01");
  });

  it("readRejectedConfig returns empty default when file missing", async () => {
    const cfg = await readRejectedConfig(tmpDir);
    expect(cfg.rejected).toEqual([]);
  });

  it("writeRejectedConfig + readRejectedConfig round-trips", async () => {
    await writeRejectedConfig({ version: 1, rejected: ["doge-pump"] }, tmpDir);
    const read = await readRejectedConfig(tmpDir);
    expect(read.rejected).toEqual(["doge-pump"]);
  });
});
