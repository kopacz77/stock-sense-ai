/**
 * `strategy` CLI integration test (M2-05 Plan 11-05, Task 3).
 *
 * Builds a real Commander `program`, registers `registerStrategyCommands`
 * with an injected scratch `intelDataDir`/`strategyDataDir` and stub
 * VIX/market-data sources, and drives each subcommand via
 * `program.parseAsync`. `process.exit` is mocked to throw instead of
 * killing the test process, so exit codes are asserted rather than
 * observed as a process death.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OHLCVData } from "../../../data/types.js";
import type { TickerDaySummary } from "../../../market-intelligence/signal/types.js";
import type { MarketDataSource, VixSource } from "../../strategy-engine.js";
import type { StrategyCandidate } from "../../types.js";
import type { VixQuote } from "../../vix-provider.js";
import type { StrategyCommandsDeps } from "../strategy-commands.js";
import { registerStrategyCommands } from "../strategy-commands.js";

const DATE = "2026-06-25";

class ProcessExitSignal extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

let intelDataDir: string;
let strategyDataDir: string;
let logLines: string[];
let errorLines: string[];

beforeEach(async () => {
  intelDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-cli-intel-"));
  strategyDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-cli-strategy-"));
  logLines = [];
  errorLines = [];
  vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    logLines.push(String(msg));
  });
  vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
    errorLines.push(String(msg));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(intelDataDir, { recursive: true, force: true });
  await fs.rm(strategyDataDir, { recursive: true, force: true });
});

function rollup(overrides: Partial<TickerDaySummary> = {}): TickerDaySummary {
  return {
    date: DATE,
    ticker: "XLE",
    weightedSentiment: 0,
    totalMateriality: 0,
    articleCount: 0,
    themes: [],
    activeCatalystIds: [],
    pmContribution: { netScore: 0, sources: [] },
    builtAt: `${DATE}T12:00:00.000Z`,
    ...overrides,
  };
}

async function writeRollupFixture(dir: string, date: string, rows: TickerDaySummary[]): Promise<void> {
  await fs.writeFile(
    path.join(dir, `ticker-day-summary-${date}.jsonl`),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8",
  );
}

/** A strong PM-derived rollup — same shape as the tracer-e2e/11-02 fixture — reliably scores above the 0.4 floor. */
function strongPmRollup(ticker: string): TickerDaySummary {
  return rollup({
    ticker,
    pmContribution: {
      netScore: 9.6,
      sources: [
        {
          marketId: `m-${ticker}`,
          slug: `${ticker.toLowerCase()}-strong-move`,
          movePp: 12,
          direction: "long",
          weight: 0.8,
          contributedScore: 9.6,
          volume24hr: 2_000_000,
        },
      ],
    },
  });
}

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

function buildProgram(deps: StrategyCommandsDeps): Command {
  const program = new Command();
  program.exitOverride();
  registerStrategyCommands(program, deps);
  return program;
}

/** Drive the CLI via Commander's parseAsync; captures process.exit as a thrown signal instead of killing the test worker. */
async function runCli(program: Command, args: string[]): Promise<number | null> {
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      throw new ProcessExitSignal(code ?? 0);
    }) as never);
  try {
    await program.parseAsync(["strategy", ...args], { from: "user" });
    return null;
  } catch (err) {
    if (err instanceof ProcessExitSignal) return err.code;
    throw err;
  } finally {
    exitSpy.mockRestore();
  }
}

function defaultDeps(): StrategyCommandsDeps {
  return {
    intelDataDir,
    strategyDataDir,
    vixProvider: new StubVixProvider(),
    marketData: new StubMarketData(),
  };
}

async function readPersistedCandidates(): Promise<StrategyCandidate[]> {
  const file = path.join(strategyDataDir, `candidates-${DATE}.jsonl`);
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as StrategyCandidate);
}

async function writeRollupFixtureRange(
  dir: string,
  startIso: string,
  endIso: string,
  build: (dateIso: string) => TickerDaySummary[],
): Promise<void> {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  for (
    const cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const iso = cursor.toISOString().split("T")[0] ?? "";
    await writeRollupFixture(dir, iso, build(iso));
  }
}

describe("strategy CLI — full subcommand surface", () => {
  it("every subcommand exits 0 on valid input and completes the accept/close + skip round-trip", async () => {
    await writeRollupFixture(intelDataDir, DATE, [strongPmRollup("XLE"), strongPmRollup("IWM")]);
    const deps = defaultDeps();
    const program = buildProgram(deps);

    const runExit = await runCli(program, ["run", "--date", DATE]);
    expect(runExit).toBeNull();
    expect(logLines.join("\n")).toContain("VIX: 18.00");
    expect(logLines.join("\n")).toContain("Ranked (2):");

    const persisted = await readPersistedCandidates();
    const ranked = persisted.filter((c) => c.mode === "ranked");
    expect(ranked).toHaveLength(2);
    const xle = ranked.find((c) => c.ticker === "XLE");
    const iwm = ranked.find((c) => c.ticker === "IWM");
    expect(xle).toBeDefined();
    expect(iwm).toBeDefined();

    const listExit = await runCli(program, ["list-candidates", "--date", DATE]);
    expect(listExit).toBeNull();
    expect(logLines.join("\n")).toContain("XLE");

    const acceptExit = await runCli(program, [
      "accept",
      xle!.candidateId,
      "--note",
      "integration test",
    ]);
    expect(acceptExit).toBeNull();
    expect(logLines.some((l) => l.includes(`Accepted ${xle!.candidateId}`))).toBe(true);

    const closeExit = await runCli(program, ["close", xle!.candidateId, "--exit-price", "95"]);
    expect(closeExit).toBeNull();
    expect(logLines.some((l) => l.includes(`Closed ${xle!.candidateId}`))).toBe(true);

    const skipExit = await runCli(program, ["skip", iwm!.candidateId, "--note", "pass"]);
    expect(skipExit).toBeNull();
    expect(logLines.some((l) => l.includes(`Skipped ${iwm!.candidateId}`))).toBe(true);

    const summaryExit = await runCli(program, ["decisions-summary"]);
    expect(summaryExit).toBeNull();
    expect(logLines.join("\n")).toContain("Accept/skip over the trailing");

    const vixExit = await runCli(program, ["show-vix", "--date", DATE]);
    expect(vixExit).toBeNull();
    expect(logLines.some((l) => l.includes("VIX 18.00"))).toBe(true);

    const substrateExit = await runCli(program, ["show-substrate", "--date", DATE]);
    expect(substrateExit).toBeNull();
    expect(logLines.join("\n")).toContain("Trailing 3-day scored-article coverage:");
    expect(logLines.join("\n")).toContain("XLE");
  });

  it("all nine subcommands are registered, including backtest (M2-05 Plan 11-06)", () => {
    const program = buildProgram(defaultDeps());
    const strategyCmd = program.commands.find((c) => c.name() === "strategy");
    const subcommandNames = strategyCmd?.commands.map((c) => c.name()) ?? [];

    expect(subcommandNames).toEqual([
      "run",
      "list-candidates",
      "accept",
      "skip",
      "close",
      "decisions-summary",
      "show-vix",
      "show-substrate",
      "backtest",
    ]);
  });
});

describe("strategy backtest", () => {
  it("runs the live-window gate over a short fixture window and writes the JSON report", async () => {
    await writeRollupFixtureRange(intelDataDir, "2026-06-01", "2026-06-05", (iso) => [
      { ...strongPmRollup("XLE"), date: iso, builtAt: `${iso}T12:00:00.000Z` },
    ]);
    const deps = defaultDeps();
    const program = buildProgram(deps);
    const outPath = path.join(strategyDataDir, "backtest-out.json");

    const exit = await runCli(program, [
      "backtest",
      "--start",
      "2026-06-01",
      "--end",
      "2026-06-05",
      "--types",
      "SECTOR_ROTATION_FROM_PM",
      "--out",
      outPath,
    ]);
    expect(exit).toBeNull();

    const output = logLines.join("\n");
    expect(output).toContain("single continuous 2026 window — interim, not the per-regime bar");
    expect(output).toContain("SECTOR_ROTATION_FROM_PM");
    expect(output).toContain("Verdict (D-15 thresholds");
    expect(output).toContain("Combined Sharpe > 0:");
    expect(output).toContain("Combined MaxDD < 25%:");

    const raw = await fs.readFile(outPath, "utf8");
    const report = JSON.parse(raw) as {
      label: string;
      perType: Record<string, unknown>;
      combined: unknown;
      window: { startIso: string; endIso: string };
    };
    expect(report.label).toBe("single continuous 2026 window — interim, not the per-regime bar");
    expect(report.window).toEqual({ startIso: "2026-06-01", endIso: "2026-06-05" });
    expect(report.perType.SECTOR_ROTATION_FROM_PM).toBeDefined();
    expect(report.combined).toBeDefined();
  });

  it("exits 2 on an unparseable --start", async () => {
    const deps = defaultDeps();
    const program = buildProgram(deps);
    const exit = await runCli(program, ["backtest", "--start", "not-a-date"]);
    expect(exit).toBe(2);
  });
});

describe("strategy CLI — validation and error paths", () => {
  it("accept --entry abc exits 2", async () => {
    await writeRollupFixture(intelDataDir, DATE, [strongPmRollup("XLE")]);
    const deps = defaultDeps();
    const program = buildProgram(deps);

    await runCli(program, ["run", "--date", DATE]);
    const persisted = await readPersistedCandidates();
    const ranked = persisted.find((c) => c.mode === "ranked");
    expect(ranked).toBeDefined();

    const exitCode = await runCli(program, ["accept", ranked!.candidateId, "--entry", "abc"]);
    expect(exitCode).toBe(2);
    expect(errorLines.some((l) => l.includes("--entry must be a positive number"))).toBe(true);
  });

  it("an unknown candidateId exits non-zero with a not-found message", async () => {
    const deps = defaultDeps();
    const program = buildProgram(deps);

    const exitCode = await runCli(program, ["accept", "2026-06-25-CATALYST_ANCHORED-ZZZ-deadbeef"]);
    expect(exitCode).toBe(1);
    expect(errorLines.some((l) => l.includes("No candidate found with id"))).toBe(true);
  });

  it("run --types NOT_A_TYPE exits 2", async () => {
    const deps = defaultDeps();
    const program = buildProgram(deps);

    const exitCode = await runCli(program, ["run", "--date", DATE, "--types", "NOT_A_TYPE"]);
    expect(exitCode).toBe(2);
    expect(errorLines.some((l) => l.includes("unknown signal type"))).toBe(true);
  });

  it("run --types SECTOR_ROTATION_FROM_PM filters to only the requested type", async () => {
    await writeRollupFixture(intelDataDir, DATE, [strongPmRollup("XLE")]);
    const deps = defaultDeps();
    const program = buildProgram(deps);

    const exitCode = await runCli(program, [
      "run",
      "--date",
      DATE,
      "--types",
      "SECTOR_ROTATION_FROM_PM",
    ]);
    expect(exitCode).toBeNull();

    const persisted = await readPersistedCandidates();
    expect(persisted.every((c) => c.signalType === "SECTOR_ROTATION_FROM_PM")).toBe(true);
  });
});

describe("strategy CLI — honest empty state", () => {
  it("a run with nothing above the floor prints the no-candidates line and still prints the sub-threshold header", async () => {
    // No rollup fixture at all -> zero raw signals from every module.
    const deps = defaultDeps();
    const program = buildProgram(deps);

    const exitCode = await runCli(program, ["run", "--date", DATE]);
    expect(exitCode).toBeNull();

    const output = logLines.join("\n");
    expect(output).toContain("No candidates above threshold today.");
    expect(output).toContain("Sub-threshold (0)");
    expect(output).toContain("Shadow (0)");
  });
});
