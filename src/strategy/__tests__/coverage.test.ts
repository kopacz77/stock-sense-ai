import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import { hasTrailingCoverage, scoredDayCoverage, trailingDayIsos } from "../coverage.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "coverage-"));
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

function summaryRow(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: "2026-06-22",
    ticker: "SPY",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: "2026-06-22T12:00:00.000Z",
    ...overrides,
  };
}

async function writeScoredArticlesFile(day: string, content = ""): Promise<void> {
  await fs.writeFile(path.join(dataDir, `scored-articles-${day}.jsonl`), content, "utf8");
}

async function writeSummaryFile(day: string, rows: TickerDaySummary[]): Promise<void> {
  const lines = rows.map((r) => JSON.stringify(r)).join("\n");
  await fs.writeFile(
    path.join(dataDir, `ticker-day-summary-${day}.jsonl`),
    rows.length > 0 ? `${lines}\n` : "",
    "utf8",
  );
}

describe("trailingDayIsos", () => {
  it("returns the N days strictly before asOfDate, oldest first", () => {
    expect(trailingDayIsos("2026-06-25", 3)).toEqual([
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
    ]);
  });
});

describe("scoredDayCoverage", () => {
  it("reports fileExists: false for a day with no scored-articles file, distinct from fileExists: true / totalRows: 0", async () => {
    // Day A: no scored-articles file, no ticker-day-summary file at all.
    // Day B: scored-articles file present (empty content), empty ticker-day-summary file.
    await writeScoredArticlesFile("2026-06-23", "");
    await writeSummaryFile("2026-06-23", []);

    const result = await scoredDayCoverage(dataDir, ["2026-06-22", "2026-06-23"]);

    expect(result[0]).toEqual({
      day: "2026-06-22",
      fileExists: false,
      rowsWithArticles: 0,
      totalRows: 0,
    });
    expect(result[1]).toEqual({
      day: "2026-06-23",
      fileExists: true,
      rowsWithArticles: 0,
      totalRows: 0,
    });
  });

  it("counts rowsWithArticles from ticker-day-summary rows with articleCount > 0 (PM-only day)", async () => {
    // Scorer never ran this day (no scored-articles file), but the rollup
    // still rebuilt from PM/catalyst data — exactly the real outage shape.
    await writeSummaryFile("2026-06-23", [
      summaryRow({ date: "2026-06-23", ticker: "XLE", articleCount: 0 }),
      summaryRow({ date: "2026-06-23", ticker: "USO", articleCount: 0 }),
    ]);

    const [result] = await scoredDayCoverage(dataDir, ["2026-06-23"]);

    expect(result).toEqual({
      day: "2026-06-23",
      fileExists: false,
      rowsWithArticles: 0,
      totalRows: 2,
    });
  });
});

describe("hasTrailingCoverage", () => {
  const days = ["2026-06-22", "2026-06-23", "2026-06-24"];

  async function writeFullyCoveredDay(day: string): Promise<void> {
    await writeScoredArticlesFile(day, JSON.stringify({ id: "a1" }));
    await writeSummaryFile(day, [summaryRow({ date: day, articleCount: 3 })]);
  }

  it("returns ok: true against a fixture with all three trailing days scored", async () => {
    for (const day of days) await writeFullyCoveredDay(day);

    const result = await hasTrailingCoverage(dataDir, "2026-06-25", 3);
    expect(result).toEqual({
      ok: true,
      reason: expect.stringContaining("Trailing 3-day scored-article coverage present"),
      missingDays: [],
    });
  });

  it("returns ok: false and lists exactly the two uncovered days for a partially-covered window", async () => {
    await writeFullyCoveredDay("2026-06-23");
    // 2026-06-22 and 2026-06-24 are left uncovered.

    const result = await hasTrailingCoverage(dataDir, "2026-06-25", 3);

    expect(result.ok).toBe(false);
    expect(result.missingDays).toEqual(["2026-06-22", "2026-06-24"]);
  });

  it("names each missing day's ISO date in the reason string", async () => {
    const result = await hasTrailingCoverage(dataDir, "2026-06-25", 3);

    expect(result.ok).toBe(false);
    for (const day of days) {
      expect(result.reason).toContain(day);
    }
    expect(result.reason).toContain("intel backlog-drain");
  });
});

describe.skipIf(!existsSync("./data/intel"))("live data probe (real data/intel tree)", () => {
  it("reports ok: false for 2026-08-15 (inside the 2026-07-27 -> 08-27 outage window)", async () => {
    const result = await hasTrailingCoverage("./data/intel", "2026-08-15", 3);
    expect(result.ok).toBe(false);
    expect(result.missingDays.length).toBeGreaterThan(0);
  });

  it("reports ok: true for 2026-06-25 (a real fully-scored June window)", async () => {
    const result = await hasTrailingCoverage("./data/intel", "2026-06-25", 3);
    expect(result.ok).toBe(true);
    expect(result.missingDays).toEqual([]);
  });
});
