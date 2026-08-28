/**
 * End-to-end tracer test for the phase-level slice: a PM-derived
 * SECTOR_ROTATION_FROM_PM signal on real-shaped substrate data becomes a
 * ranked, sized, level-bearing candidate, persisted to
 * `data/strategy/candidates-*.jsonl`, then accepted into
 * `data/strategy/decisions-*.jsonl` with an operator override.
 *
 * Uses the `fs.mkdtemp` isolated-dataDir pattern from
 * `rollup-backfill.test.ts` — two separate scratch dirs (one standing in
 * for `data/intel`, one for `data/strategy`) so this test never touches
 * real project data.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import type { OHLCVData } from "../../data/types.js";
import { DecisionLog } from "../decision-log.js";
import type { MarketDataSource, VixSource } from "../strategy-engine.js";
import { StrategyEngine } from "../strategy-engine.js";
import type { VixQuote } from "../vix-provider.js";

let intelDataDir: string;
let strategyDataDir: string;

beforeEach(async () => {
  intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracer-e2e-intel-"));
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracer-e2e-strategy-"));
});

afterEach(async () => {
  await fs.rm(intelDataDir, { recursive: true, force: true });
  await fs.rm(strategyDataDir, { recursive: true, force: true });
});

function rollup(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: "2026-06-25",
    ticker: "XLE",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

async function writeRollupFixture(date: string, rows: TickerDaySummary[]): Promise<void> {
  await fs.writeFile(
    path.join(intelDataDir, `ticker-day-summary-${date}.jsonl`),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8",
  );
}

/** Deterministic 120-bar OHLCV series ending on `asOfDate`, oldest-first internally
 * but returned NEWEST-first (mirrors Yahoo's real ordering) so the engine's
 * ascending-sort step is genuinely exercised. */
function stubBars(asOfDate: Date, days = 120): OHLCVData[] {
  const bars: OHLCVData[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(asOfDate.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const close = 91 + i * 0.05;
    bars.push({
      date: d.toISOString().split("T")[0] ?? "",
      open: close - 0.2,
      high: close + 1.0,
      low: close - 1.0,
      close,
      volume: 1_000_000,
    });
  }
  return bars.reverse(); // newest-first, like Yahoo
}

class StubMarketData implements MarketDataSource {
  async fetchHistoricalData(_symbol: string, _from: Date, to: Date = new Date()): Promise<OHLCVData[]> {
    return stubBars(to);
  }
}

class StubVixProvider implements VixSource {
  async getForDate(date: Date): Promise<VixQuote> {
    return {
      date: date.toISOString().split("T")[0] ?? "",
      close: 18,
      regime: "elevated",
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  }
}

describe("StrategyEngine tracer (SECTOR_ROTATION_FROM_PM only)", () => {
  it("ranks, sizes, and levels a PM-derived candidate; accept logs the operator override", async () => {
    const asOfDate = new Date("2026-06-25T00:00:00.000Z");

    await writeRollupFixture("2026-06-25", [
      rollup({
        ticker: "XLE",
        pmContribution: {
          netScore: 9.6,
          sources: [
            {
              marketId: "m1",
              slug: "iran-ceasefire-continues-through",
              movePp: 12,
              direction: "long",
              weight: 0.8,
              contributedScore: 9.6,
              volume24hr: 2_000_000,
            },
          ],
        },
      }),
      rollup({
        ticker: "USO",
        pmContribution: {
          netScore: 0.5,
          sources: [
            {
              marketId: "m2",
              slug: "minor-oil-move",
              movePp: 1,
              direction: "long",
              weight: 0.5,
              contributedScore: 0.5,
              volume24hr: 50_000,
            },
          ],
        },
      }),
    ]);

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
    });

    const result = await engine.generateCandidates(asOfDate);

    expect(result.ranked).toHaveLength(1);
    const xle = result.ranked[0];
    expect(xle?.ticker).toBe("XLE");
    expect(xle?.signalType).toBe("SECTOR_ROTATION_FROM_PM");
    expect(xle?.direction).toBe("long");

    const ppNorm = Math.min(1, Math.abs(12 * 0.8) / 10);
    const volNorm = Math.min(1, Math.log10(2_000_000) / 7);
    expect(xle?.score).toBeCloseTo(ppNorm * volNorm, 10);

    expect(xle?.suggestedSizeUsd).toBe(Math.floor(7500 * 0.125));

    expect(xle?.suggestedEntry).not.toBeNull();
    expect(xle?.suggestedTarget).not.toBeNull();
    expect(xle?.suggestedStop).not.toBeNull();
    expect(xle?.suggestedStop as number).toBeLessThan(xle?.suggestedEntry as number);
    expect(xle?.suggestedEntry as number).toBeLessThan(xle?.suggestedTarget as number);

    expect(xle?.candidateId).toMatch(/^2026-06-25-SECTOR_ROTATION_FROM_PM-XLE-[0-9a-f]{8}$/);

    expect(result.subThreshold.some((c) => c.ticker === "USO")).toBe(true);

    // Candidates persisted to data/strategy/candidates-2026-06-25.jsonl
    const candidatesFile = path.join(strategyDataDir, "candidates-2026-06-25.jsonl");
    const persisted = await fs.readFile(candidatesFile, "utf8");
    expect(persisted).toContain("XLE");
    expect(persisted).toContain("USO");

    // Accept with an operator entry override — the persisted decision must
    // carry the OPERATOR's number, not the engine's suggestion.
    const decisionLog = new DecisionLog({ strategyDataDir });
    const operatorEntry = (xle?.suggestedEntry as number) + 5;
    const record = await decisionLog.recordAccept(xle!, { entry: operatorEntry });

    expect(record.decision).toBe("accept");
    expect(record.operatorEntry).toBe(operatorEntry);
    expect(record.operatorEntry).not.toBe(xle?.suggestedEntry);

    const decisionsFile = path.join(strategyDataDir, `decisions-${record.decidedAt.split("T")[0]}.jsonl`);
    const decisionsRaw = await fs.readFile(decisionsFile, "utf8");
    const decisionRows = decisionsRaw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
    expect(decisionRows).toHaveLength(1);
    expect(decisionRows[0].operatorEntry).toBe(operatorEntry);
    expect(decisionRows[0].candidateId).toBe(xle?.candidateId);
  });
});
