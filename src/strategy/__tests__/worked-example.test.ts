/**
 * The canonical M2-05 worked example (Plan 11-08, Task 1): an Iran-family
 * Polymarket signal on XLE walks the whole operator loop end to end —
 * PM signal -> ranked SECTOR_ROTATION_FROM_PM candidate -> suggested
 * entry/target/stop/size -> operator accepts with an override -> decision
 * logged -> operator closes the position -> realized outcome recorded and
 * reconciled on read-back.
 *
 * CONTEXT.md's own words (`<specifics>`): "The Iran worked example from
 * M2-04's acceptance fixture should land naturally in M2-05 ... M2-05's
 * worked example test should walk it." This test is that walk.
 *
 * Fixture shape follows `tracer-e2e.test.ts`'s `fs.mkdtemp` pattern (two
 * isolated scratch dirs standing in for `data/intel` and `data/strategy` —
 * this test never touches real project data) and reuses the real 36-ticker
 * substrate universe from `11-RESEARCH.md` §0 so "no candidate for the
 * other 35 tickers" is a meaningful assertion, not a vacuous one.
 *
 * The Iran-family market used here is one of the LIVE `config/pm-market-mappings.json`
 * rules (`will-the-us-invade-iran`, `yesPp` interpretation, XLE weight 1.0,
 * direction "long") rather than the `iran-ceasefire-continues-through` slug
 * the M2-04 pm-mapping-engine test fixture used — that exact slug is not in
 * the live production config; this test's shape matches what the live
 * config actually maps today, per the plan's own instruction to use the
 * live Iran-family rules.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { OHLCVData } from "../../data/types.js";
import type { TickerDaySummary } from "../../market-intelligence/signal/types.js";
import { DEFAULT_STRATEGY_CONFIG } from "../config.js";
import { DecisionLog } from "../decision-log.js";
import type { MarketDataSource, VixSource } from "../strategy-engine.js";
import { StrategyEngine } from "../strategy-engine.js";
import type { VixQuote } from "../vix-provider.js";

/**
 * Plan 11-09 (D-23): every non-shadow candidate now runs through the
 * after-tax/after-fees net hurdle before it can rank. The shipped default
 * `costs.minRewardRisk` (1.5) combined with this fixture's 2x ATR target ÷
 * 1.5x ATR stop (a 1.333 gross reward:risk) would otherwise cost-demote the
 * very candidate this worked example exists to walk — neutralized the same
 * way `strategy-engine.test.ts`'s `baseConfig()` does, since this test is
 * about the phase-level operator loop, not the cost model.
 */
function relaxedCostsConfig() {
  return {
    ...DEFAULT_STRATEGY_CONFIG,
    costs: {
      ...DEFAULT_STRATEGY_CONFIG.costs,
      spreadSlippageBps: 0,
      fxSpreadBps: 0,
      minRewardRisk: 0.01,
    },
  };
}

// The real 36-ticker substrate universe (11-RESEARCH.md §0) — used so
// "tickers outside the fixture's PM contribution stay silent" exercises the
// actual production universe, not an invented one.
const UNIVERSE = [
  "AAPL",
  "AMZN",
  "COIN",
  "GLD",
  "GOOGL",
  "IBIT",
  "IEF",
  "IWM",
  "JETS",
  "JPM",
  "LMT",
  "META",
  "MSFT",
  "MSTR",
  "NFLX",
  "NVDA",
  "QQQ",
  "RTX",
  "SLV",
  "SPY",
  "TLT",
  "TSLA",
  "UNG",
  "USO",
  "V",
  "XLB",
  "XLC",
  "XLE",
  "XLF",
  "XLI",
  "XLK",
  "XLP",
  "XLRE",
  "XLU",
  "XLV",
  "XLY",
];

const ASOF_ISO = "2026-06-25";

// The live `will-the-us-invade-iran` rule (config/pm-market-mappings.json):
// yesPp interpretation, XLE weight 1.0, direction "long". A rising "Yes"
// probability (movePp positive) is bullish XLE under this rule.
const IRAN_SLUG = "will-the-us-invade-iran-by-dec-31-2026";
const IRAN_MOVE_PP = 12;
const IRAN_WEIGHT = 1.0;
const IRAN_VOLUME_24HR = 2_000_000;
// contributedScore = movePp * dirSign(long=+1) * weight * interpSign(yesPp=+1)
const IRAN_NET_SCORE = IRAN_MOVE_PP * 1 * IRAN_WEIGHT * 1;

let intelDataDir: string;
let strategyDataDir: string;

beforeEach(async () => {
  intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "worked-example-intel-"));
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "worked-example-strategy-"));
});

afterEach(async () => {
  await fs.rm(intelDataDir, { recursive: true, force: true });
  await fs.rm(strategyDataDir, { recursive: true, force: true });
});

function silentRollup(ticker: string): TickerDaySummary {
  return {
    date: ASOF_ISO,
    ticker,
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: `${ASOF_ISO}T12:00:00.000Z`,
  };
}

function xleRollup(): TickerDaySummary {
  return {
    date: ASOF_ISO,
    ticker: "XLE",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: {
      netScore: IRAN_NET_SCORE,
      sources: [
        {
          marketId: "pm-iran-invade-2026",
          eventSlug: "will-the-us-invade-iran",
          slug: IRAN_SLUG,
          movePp: IRAN_MOVE_PP,
          direction: "long",
          weight: IRAN_WEIGHT,
          contributedScore: IRAN_NET_SCORE,
          volume24hr: IRAN_VOLUME_24HR,
        },
      ],
    },
    builtAt: `${ASOF_ISO}T12:00:00.000Z`,
  };
}

async function writeRollupFixture(rows: TickerDaySummary[]): Promise<void> {
  await fs.writeFile(
    path.join(intelDataDir, `ticker-day-summary-${ASOF_ISO}.jsonl`),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8",
  );
}

/**
 * Deterministic 120-bar OHLCV series ending on `asOfDate`, returned
 * NEWEST-first (mirrors Yahoo's real ordering, same as `tracer-e2e.test.ts`)
 * so the engine's own ascending-sort step is genuinely exercised rather
 * than trusted.
 */
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
  return bars.reverse();
}

class StubMarketData implements MarketDataSource {
  async fetchHistoricalData(
    _symbol: string,
    _from: Date,
    to: Date = new Date(),
  ): Promise<OHLCVData[]> {
    return stubBars(to);
  }
}

// Deterministic "elevated" VIX regime so suggestedSizeUsd is a literal, not
// a range depending on the real market's VIX close today.
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

describe("Worked example: Iran-family PM signal -> XLE candidate -> accept -> close", () => {
  it("walks the canonical happy path end to end, deterministically", async () => {
    // --- Step 1: PM signal ---------------------------------------------
    // A ticker-day-summary fixture carrying a live-config Iran-family PM
    // contribution for XLE, plus the other 35 real-universe tickers with no
    // PM contribution at all (silent).
    const rows = UNIVERSE.map((ticker) => (ticker === "XLE" ? xleRollup() : silentRollup(ticker)));
    await writeRollupFixture(rows);

    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir,
      vixProvider: new StubVixProvider(),
      marketData: new StubMarketData(),
      config: relaxedCostsConfig(),
    });

    const asOfDate = new Date(`${ASOF_ISO}T00:00:00.000Z`);
    const result = await engine.generateCandidates(asOfDate);

    // --- Step 2: candidate -----------------------------------------------
    // Exactly one ranked SECTOR_ROTATION_FROM_PM XLE long candidate — the
    // other 35 universe tickers produced nothing (no PM contribution, no
    // active catalysts, no scored-article coverage, no 3-day PM trailing
    // history for FADE_OVERSHOOT to compute an overshoot from).
    expect(result.ranked).toHaveLength(1);
    expect(result.subThreshold).toHaveLength(0);
    expect(result.shadow).toHaveLength(0);
    const allSurfacedTickers = [...result.ranked, ...result.subThreshold, ...result.shadow].map(
      (c) => c.ticker,
    );
    expect(allSurfacedTickers).toEqual(["XLE"]);

    const xle = result.ranked[0];
    expect(xle).toBeDefined();
    expect(xle?.ticker).toBe("XLE");
    expect(xle?.signalType).toBe("SECTOR_ROTATION_FROM_PM");
    expect(xle?.direction).toBe("long");

    // Hand-computed D-03 score formula (src/strategy/signals/sector-rotation.ts):
    //   ppNorm  = min(1, Σ|movePp × weight| / 10) = min(1, |12 × 1.0| / 10) = min(1, 1.2) = 1
    //   volNorm = min(1, log10(totalVolume) / 7)  = min(1, log10(2_000_000) / 7)
    //           = min(1, 6.301029995663981 / 7)   = min(1, 0.9001471422376973) = 0.9001471422376973
    //   score   = ppNorm × volNorm                = 1 × 0.9001471422376973    = 0.9001471422376973
    const ppNorm = Math.min(1, Math.abs(IRAN_MOVE_PP * IRAN_WEIGHT) / 10);
    const volNorm = Math.min(1, Math.log10(IRAN_VOLUME_24HR) / 7);
    const expectedScore = ppNorm * volNorm;
    expect(ppNorm).toBe(1); // capped — confirms the arithmetic above, not a coincidence
    expect(xle?.score).toBeCloseTo(expectedScore, 10);
    expect(xle?.score).toBeCloseTo(0.9001471422376973, 10);

    // The operator can see WHY XLE: the source market slug and its pp move
    // are named in the rationale.
    expect(xle?.rationale).toContain(IRAN_SLUG);
    expect(xle?.rationale).toContain(`+${IRAN_MOVE_PP}pp`);

    // --- Step 3: suggested levels -----------------------------------------
    // suggestedSizeUsd matches the "elevated" VIX regime the stub returns
    // (12.5% of the $7500 assumed equity, SECTOR_ROTATION_FROM_PM has no
    // type-size modifier so it's the regime size unmodified) — a literal,
    // not a range, per the plan's own acceptance criterion.
    expect(xle?.suggestedSizeUsd).toBe(Math.floor(7500 * 0.125));

    // Long direction: stop < entry < target.
    expect(xle?.suggestedStop as number).toBeLessThan(xle?.suggestedEntry as number);
    expect(xle?.suggestedEntry as number).toBeLessThan(xle?.suggestedTarget as number);

    expect(xle?.candidateId).toMatch(/^2026-06-25-SECTOR_ROTATION_FROM_PM-XLE-[0-9a-f]{8}$/);

    // Candidate persisted to data/strategy/candidates-2026-06-25.jsonl —
    // this is the same on-disk artifact `strategy list-candidates` reads.
    const candidatesFile = path.join(strategyDataDir, `candidates-${ASOF_ISO}.jsonl`);
    const persistedCandidates = await fs.readFile(candidatesFile, "utf8");
    expect(persistedCandidates).toContain("XLE");
    expect(persistedCandidates).not.toContain("AAPL");

    // --- Step 4: operator accepts with an override -------------------------
    // The operator's own entry number is persisted; the engine's own
    // suggestion stays intact in its own field (StrategyCandidate fields are
    // spread onto the decision record verbatim — D-09).
    const decisionLog = new DecisionLog({ strategyDataDir });
    const engineSuggestedEntry = xle?.suggestedEntry as number;
    const operatorEntry = engineSuggestedEntry + 5;
    const acceptRecord = await decisionLog.recordAccept(xle!, { entry: operatorEntry });

    expect(acceptRecord.decision).toBe("accept");
    expect(acceptRecord.operatorEntry).toBe(operatorEntry);
    expect(acceptRecord.operatorEntry).not.toBe(engineSuggestedEntry);
    // The engine's own suggestion is untouched by the override.
    expect(acceptRecord.suggestedEntry).toBe(engineSuggestedEntry);

    // --- Step 5: decision logged --------------------------------------------
    const acceptDayIso = acceptRecord.decidedAt.split("T")[0] ?? "";
    const decisionsFile = path.join(strategyDataDir, `decisions-${acceptDayIso}.jsonl`);
    const decisionsRaw = await fs.readFile(decisionsFile, "utf8");
    const decisionRows = decisionsRaw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
    expect(decisionRows).toHaveLength(1);
    expect(decisionRows[0].candidateId).toBe(xle?.candidateId);
    expect(decisionRows[0].operatorEntry).toBe(operatorEntry);

    // --- Step 6: operator closes at a profitable exit -----------------------
    // No exit *signal* is asserted anywhere in this test — v1 emits none
    // (D-10). This close is the operator's own manual action.
    const exitPrice = operatorEntry + 10; // long, profitable exit
    const closeRecord = await decisionLog.recordClose(xle!.candidateId, { exitPrice });

    expect(closeRecord.candidateId).toBe(xle?.candidateId);
    expect(closeRecord.closeExitPrice).toBe(exitPrice);
    expect(closeRecord.closeRealizedPnlUsd as number).toBeGreaterThan(0);
    // P&L consistent with the OPERATOR's entry, not the engine's suggestion:
    // pnlPct = (exitPrice - operatorEntry) / operatorEntry * 100 (long).
    const expectedPnlPct = Math.round((((exitPrice - operatorEntry) / operatorEntry) * 100) * 100) / 100;
    expect(closeRecord.closeRealizedPnlPct).toBeCloseTo(expectedPnlPct, 8);

    // --- Step 7: outcome recorded and reconciled on read-back -------------
    const closeDayIso = (closeRecord.closedAt ?? closeRecord.decidedAt).split("T")[0] ?? "";
    const startIso = acceptDayIso < closeDayIso ? acceptDayIso : closeDayIso;
    const endIso = acceptDayIso > closeDayIso ? acceptDayIso : closeDayIso;
    const reconciled = await decisionLog.readDedupedByCandidateId(startIso, endIso);

    const reconciledForCandidate = reconciled.filter((r) => r.candidateId === xle?.candidateId);
    expect(reconciledForCandidate).toHaveLength(1);
    const reconciledRecord = reconciledForCandidate[0];
    expect(reconciledRecord?.decision).toBe("accept");
    expect(reconciledRecord?.closeExitPrice).toBe(exitPrice);
    expect(reconciledRecord?.closeRealizedPnlUsd).toBe(closeRecord.closeRealizedPnlUsd);
    expect(reconciledRecord?.closeRealizedPnlPct).toBe(closeRecord.closeRealizedPnlPct);
  });
});
