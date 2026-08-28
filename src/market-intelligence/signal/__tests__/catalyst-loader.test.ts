/**
 * catalyst-loader.ts unit tests (M2-05 Plan 11-03, Task 1).
 *
 * Each case uses `fs.mkdtemp` for an isolated data dir and stages
 * `catalyst-flags-YYYY-MM-DD.jsonl` fixture files directly (mirroring
 * `rollup-backfill.test.ts`'s `writeFixtureFile` shape). Fixtures span both
 * `source: "calendar:fomc-seed"` and `source: "article:..."` origins per
 * D-17.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  dedupeCatalystsById,
  loadActiveCatalysts,
  loadAllCatalystFlags,
  loadUpcomingCatalysts,
} from "../catalyst-loader.js";
import type { CatalystFlag } from "../types.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "catalyst-loader-"));
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

function makeCatalyst(overrides: Partial<CatalystFlag> = {}): CatalystFlag {
  return {
    id: "fomc-2026-06-17",
    type: "fomc",
    tickers: [],
    affectedSectors: ["TLT", "IEF", "XLF", "IWM"],
    expectedDate: "2026-06-17",
    expectedTimeEt: "14:00",
    magnitudePrior: 5,
    direction: "uncertain",
    confidence: 0.6,
    source: "calendar:fomc-seed",
    firstSeenAt: "2026-05-31T08:00:00Z",
    ...overrides,
  };
}

function makeArticleCatalyst(overrides: Partial<CatalystFlag> = {}): CatalystFlag {
  return {
    id: "article-art-1-product-2026-07-01",
    type: "product",
    tickers: ["NVDA"],
    expectedDate: "2026-07-01",
    magnitudePrior: 3,
    direction: "up",
    confidence: 0.7,
    source: "article:art-1",
    firstSeenAt: "2026-06-25T10:00:00Z",
    ...overrides,
  };
}

async function writeFixtureFile(date: string, rows: CatalystFlag[]): Promise<void> {
  await fs.writeFile(
    path.join(dataDir, `catalyst-flags-${date}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : ""),
    "utf8",
  );
}

describe("loadAllCatalystFlags", () => {
  it("returns an empty array when dataDir does not exist (no ENOENT throw)", async () => {
    const result = await loadAllCatalystFlags(path.join(dataDir, "does-not-exist"));
    expect(result).toEqual([]);
  });

  it("skips a malformed JSONL line without aborting the surrounding file", async () => {
    const good = makeCatalyst({ id: "fomc-2026-06-17" });
    const file = path.join(dataDir, "catalyst-flags-2026-06-01.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify(good)}\n{not valid json\n`,
      "utf8",
    );

    const result = await loadAllCatalystFlags(dataDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("fomc-2026-06-17");
  });

  it("scans across both calendar: and article: sourced fixture files", async () => {
    await writeFixtureFile("2026-06-01", [makeCatalyst()]);
    await writeFixtureFile("2026-06-25", [makeArticleCatalyst()]);

    const result = await loadAllCatalystFlags(dataDir);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.source).sort()).toEqual(["article:art-1", "calendar:fomc-seed"]);
  });
});

describe("dedupeCatalystsById", () => {
  it("keeps, for a repeated id, the flag with the later lastRefinedAt ?? firstSeenAt, regardless of array order", () => {
    const older = makeCatalyst({
      id: "dup-1",
      confidence: 0.5,
      firstSeenAt: "2026-06-01T08:00:00Z",
      lastRefinedAt: "2026-06-01T08:00:00Z",
    });
    const newer = makeCatalyst({
      id: "dup-1",
      confidence: 0.9,
      firstSeenAt: "2026-06-01T08:00:00Z",
      lastRefinedAt: "2026-06-10T08:00:00Z",
    });

    // Newer listed first — proves the winner is chosen by timestamp, not order.
    const resultA = dedupeCatalystsById([newer, older]);
    expect(resultA).toHaveLength(1);
    expect(resultA[0]?.confidence).toBe(0.9);

    // Older listed first — same result.
    const resultB = dedupeCatalystsById([older, newer]);
    expect(resultB).toHaveLength(1);
    expect(resultB[0]?.confidence).toBe(0.9);
  });

  it("falls back to firstSeenAt when lastRefinedAt is absent on both", () => {
    const a = makeCatalyst({ id: "dup-2", confidence: 0.3, firstSeenAt: "2026-06-01T08:00:00Z" });
    delete a.lastRefinedAt;
    const b = makeCatalyst({ id: "dup-2", confidence: 0.4, firstSeenAt: "2026-06-05T08:00:00Z" });
    delete b.lastRefinedAt;

    const result = dedupeCatalystsById([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.4);
  });
});

describe("loadActiveCatalysts", () => {
  it("excludes archived flags", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "active-1", expectedDate: "2026-06-30" }),
      makeCatalyst({ id: "archived-1", expectedDate: "2026-06-30", archived: true }),
    ]);

    const result = await loadActiveCatalysts(dataDir, "2026-06-25");
    expect(result.map((c) => c.id)).toEqual(["active-1"]);
  });

  it("excludes flags whose expectedDate is before dayIso and includes one dated exactly dayIso", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "before", expectedDate: "2026-06-24" }),
      makeCatalyst({ id: "exact", expectedDate: "2026-06-25" }),
      makeCatalyst({ id: "after", expectedDate: "2026-06-26" }),
    ]);

    const result = await loadActiveCatalysts(dataDir, "2026-06-25");
    expect(result.map((c) => c.id).sort()).toEqual(["after", "exact"]);
  });

  it("accepts a full ISO expectedDate and compares on the date part only", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "full-iso", expectedDate: "2026-06-25T14:00:00Z" }),
    ]);

    const result = await loadActiveCatalysts(dataDir, "2026-06-25");
    expect(result.map((c) => c.id)).toEqual(["full-iso"]);
  });
});

describe("loadUpcomingCatalysts", () => {
  it("includes fromIso + 60 days and excludes fromIso + 61 days", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "day-60", expectedDate: "2026-08-24" }),
      makeCatalyst({ id: "day-61", expectedDate: "2026-08-25" }),
    ]);

    const result = await loadUpcomingCatalysts(dataDir, "2026-06-25", 60);
    expect(result.map((c) => c.id)).toEqual(["day-60"]);
  });

  it("excludes archived flags within the window", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "in-window-archived", expectedDate: "2026-07-01", archived: true }),
      makeArticleCatalyst({ id: "in-window-active", expectedDate: "2026-07-01" }),
    ]);

    const result = await loadUpcomingCatalysts(dataDir, "2026-06-25", 60);
    expect(result.map((c) => c.id)).toEqual(["in-window-active"]);
  });

  it("excludes flags before fromIso", async () => {
    await writeFixtureFile("2026-06-01", [
      makeCatalyst({ id: "too-early", expectedDate: "2026-06-24" }),
    ]);

    const result = await loadUpcomingCatalysts(dataDir, "2026-06-25", 60);
    expect(result).toEqual([]);
  });
});
