/**
 * RollupBackfill unit tests.
 *
 * Each case uses `fs.mkdtemp` for an isolated data dir, stages
 * `scored-articles-*.jsonl` (and optionally `polymarket-snapshots-*.jsonl` +
 * a PM mapping config), runs `backfillMissingRollups`, and asserts on the
 * returned result + the persisted `ticker-day-summary-*.jsonl` files.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ScoredArticle } from "../types.js";
import type { MarketSnapshot } from "../../polymarket/types.js";
import { backfillMissingRollups } from "../rollup-backfill.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rollup-backfill-"));
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

function scored(overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  return {
    id: "art-1::NVDA",
    sourceArticleId: "art-1",
    ticker: "NVDA",
    sentiment: 0.5,
    materiality: 0.9,
    themes: ["ai-infra"],
    catalysts: [],
    referencedCalendarEvents: [],
    scoredAt: "2026-07-02T14:00:00Z",
    scorerModel: "qwen/qwen3-14b",
    scorerVersion: "v1",
    ...overrides,
  };
}

async function writeScored(date: string, rows: ScoredArticle[]): Promise<void> {
  await fs.writeFile(
    path.join(dataDir, `scored-articles-${date}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
}

async function writeRollupStub(date: string): Promise<void> {
  await fs.writeFile(
    path.join(dataDir, `ticker-day-summary-${date}.jsonl`),
    JSON.stringify({ date, ticker: "AAPL" }) + "\n",
    "utf8",
  );
}

function readRollupTickers(date: string): Promise<string[]> {
  return fs
    .readFile(path.join(dataDir, `ticker-day-summary-${date}.jsonl`), "utf8")
    .then((c) =>
      c
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => (JSON.parse(l) as { ticker: string }).ticker),
    );
}

describe("backfillMissingRollups", () => {
  it("rebuilds a day that has scored-articles but no rollup", async () => {
    await writeScored("2026-07-02", [scored()]);

    const result = await backfillMissingRollups({ dataDir });

    expect(result.rebuilt).toEqual(["2026-07-02"]);
    expect(result.failed).toEqual([]);
    expect(await readRollupTickers("2026-07-02")).toContain("NVDA");
  });

  it("skips a day that already has a rollup (idempotent, no overwrite)", async () => {
    await writeScored("2026-07-02", [scored()]);
    await writeRollupStub("2026-07-02");

    const result = await backfillMissingRollups({ dataDir });

    expect(result.rebuilt).toEqual([]);
    expect(result.skipped).toContain("2026-07-02");
    // Existing stub is untouched (still the AAPL placeholder, not rebuilt to NVDA).
    expect(await readRollupTickers("2026-07-02")).toEqual(["AAPL"]);
  });

  it("only rebuilds days within lookbackDays of `now`", async () => {
    await writeScored("2026-06-01", [scored({ scoredAt: "2026-06-01T14:00:00Z" })]);
    await writeScored("2026-07-08", [scored({ scoredAt: "2026-07-08T14:00:00Z" })]);

    const result = await backfillMissingRollups({
      dataDir,
      lookbackDays: 7,
      now: new Date("2026-07-10T12:00:00Z"),
    });

    expect(result.rebuilt).toEqual(["2026-07-08"]);
    // The old day is out of window — not rebuilt, not failed.
    expect(result.rebuilt).not.toContain("2026-06-01");
  });

  it("folds in PM signals re-derived from the day's snapshots", async () => {
    await writeScored("2026-07-02", [scored()]);
    // Minimal hermetic mapping: a bitcoin market → COIN long.
    const cfg = {
      version: 1,
      lastUpdated: "2026-07-02",
      mappings: [
        {
          match: { eventSlug: null, slugPrefix: "will-bitcoin-reach-", questionContains: null },
          tickers: [{ ticker: "COIN", direction: "long", weight: 1.0 }],
          interpretation: "yesPp",
          rationale: "test",
          addedBy: "test",
          addedAt: "2026-07-02",
        },
      ],
      proposed: [],
    };
    const cfgPath = path.join(dataDir, "test-mappings.json");
    await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

    const snap: MarketSnapshot = {
      id: "mkt-1",
      slug: "will-bitcoin-reach-100k-in-july-2026",
      question: "Will Bitcoin reach $100k in July 2026?",
      active: true,
      outcomes: ["Yes", "No"],
      prices: [0.4, 0.6],
      yesPrice: 0.4,
      volume24hr: 500000,
      volume1wk: 1000000,
      liquidity: 100000,
      oneHourPriceChange: 0.04,
      oneDayPriceChange: 0.1,
      oneWeekPriceChange: 0.2,
      competitive: 0.5,
      fetchedAt: "2026-07-02T14:00:00Z",
    };
    await fs.writeFile(
      path.join(dataDir, "polymarket-snapshots-2026-07-02.jsonl"),
      JSON.stringify(snap) + "\n",
      "utf8",
    );

    const result = await backfillMissingRollups({ dataDir, pmConfigPath: cfgPath });

    expect(result.rebuilt).toEqual(["2026-07-02"]);
    const tickers = await readRollupTickers("2026-07-02");
    // Article ticker + PM-only ticker both get rows.
    expect(tickers).toContain("NVDA");
    expect(tickers).toContain("COIN");
  });

  it("rebuilds from articles alone when the snapshots file is absent (no throw)", async () => {
    await writeScored("2026-07-02", [scored()]);
    // No polymarket-snapshots file staged.

    const result = await backfillMissingRollups({ dataDir });

    expect(result.rebuilt).toEqual(["2026-07-02"]);
    expect(result.failed).toEqual([]);
    expect(await readRollupTickers("2026-07-02")).toEqual(["NVDA"]);
  });

  it("returns empty result when data dir has no scored-articles files", async () => {
    const result = await backfillMissingRollups({ dataDir });
    expect(result).toEqual({ rebuilt: [], skipped: [], failed: [] });
  });
});
