/**
 * `strategy` CLI subcommand group (M2-05 Plan 11-02; completed to the full
 * nine-subcommand RESEARCH §6 surface by Plan 11-05 Task 3 + Plan 11-06
 * Task 2's `backtest`). Ships all nine subcommands: `run`,
 * `list-candidates`, `accept`, `skip`, `close`, `decisions-summary`,
 * `show-vix`, `show-substrate`, `backtest`.
 *
 * Commander naming convention: hyphenated single-word subcommand names
 * only — `.command("list candidates")` would be interpreted as one
 * literal command name, not a nested subcommand (RESEARCH §6, same
 * precedent as `intel backlog-drain` / `intel themes-review`).
 *
 * Input validation (ASVS V5): every numeric option goes through
 * `Number.isFinite` + a positivity check with `process.exit(2)` on
 * failure — same shape as `intel backlog-drain`. `--types` is validated
 * against the `SignalType` union with `process.exit(2)` on an unknown
 * name. An unknown `candidateId` prints a clear not-found error and exits
 * 1 rather than silently no-op'ing. `--note` is always an opaque display
 * string — never interpolated into a shell command or a regular
 * expression.
 *
 * `StrategyCommandsDeps` lets a caller (the integration test, mainly)
 * inject a scratch `intelDataDir`/`strategyDataDir` and stub VIX/market-data
 * sources so the CLI can be exercised end-to-end without touching real
 * project data or the network. Production usage (`src/index.ts`) omits
 * `deps` entirely and gets the real `./data/intel` / `./data/strategy`
 * paths and real providers, matching the pre-11-05 behavior exactly.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import chalk from "chalk";
import type { Command } from "commander";
import ora from "ora";

import { loadActiveCatalysts } from "../../market-intelligence/signal/catalyst-loader.js";
import { JsonlStore } from "../../market-intelligence/storage/jsonl-store.js";
import type { LiveWindowReport, TypeReport } from "../backtest/live-window-runner.js";
import {
  LIVE_WINDOW_LABEL,
  THIN_SAMPLE_TRADE_THRESHOLD,
  runLiveWindow,
} from "../backtest/live-window-runner.js";
import { loadStrategyConfig } from "../config.js";
import { hasTrailingCoverage } from "../coverage.js";
import { DecisionLog } from "../decision-log.js";
import { catalystTickers } from "../signals/catalyst-anchored.js";
import { defaultSignalModules } from "../signals/index.js";
import { suggestSizeUsd } from "../sizing.js";
import type { MarketDataSource, VixSource } from "../strategy-engine.js";
import { StrategyEngine } from "../strategy-engine.js";
import { isSubstrateHot, loadRollupsForDay } from "../substrate.js";
import type { SignalType, StrategyCandidate, StrategyDecisionRecord } from "../types.js";
import { VixProvider } from "../vix-provider.js";

const DEFAULT_INTEL_DATA_DIR = "./data/intel";
const DEFAULT_STRATEGY_DATA_DIR = "./data/strategy";
const SUBSTRATE_COVERAGE_WINDOW_DAYS = 3;
/**
 * First calendar day any real `ticker-day-summary-*.jsonl` file exists on
 * this substrate (RESEARCH §0). RESEARCH §8's usable-range table gives
 * SECTOR_ROTATION_FROM_PM an earlier aspirational start of 2026-05-23 (raw
 * `polymarket-snapshots` go back that far), but reaching it would require
 * writing a rebuilt rollup file into `data/intel/` for the eight days before
 * this one — this execution runs under an explicit "never modify
 * `data/intel/`" directive, so the default window starts here for every
 * type uniformly instead. An explicit `--start` overrides this.
 */
const DEFAULT_BACKTEST_START_ISO = "2026-05-31";

/** All four v1 `SignalType`s — the valid set for `--types`. */
const ALL_SIGNAL_TYPES: readonly SignalType[] = [
  "CATALYST_ANCHORED",
  "SENTIMENT_VELOCITY",
  "SECTOR_ROTATION_FROM_PM",
  "FADE_OVERSHOOT",
];

/**
 * Injected dependencies, mainly for the integration test — omit entirely
 * in production to get the real `./data/intel` / `./data/strategy` paths
 * and real VIX/market-data providers.
 */
export interface StrategyCommandsDeps {
  intelDataDir?: string;
  strategyDataDir?: string;
  vixProvider?: VixSource;
  marketData?: MarketDataSource;
}

/** Shared `--date` parsing/validation for `run`, `list-candidates`, `show-vix`, `show-substrate`. */
function parseDateOption(raw: string | undefined): Date {
  if (raw === undefined) return new Date();
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(chalk.red(`--date must be YYYY-MM-DD (got "${raw}")`));
    process.exit(2);
  }
  return parsed;
}

/** `--types <csv>` -> `SignalType[]`, or `undefined` when the flag is omitted (run every registered module). */
function parseTypesOption(raw: string | undefined): SignalType[] | undefined {
  if (raw === undefined) return undefined;
  const requested = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  const invalid = requested.filter((t) => !ALL_SIGNAL_TYPES.includes(t as SignalType));
  if (invalid.length > 0) {
    console.error(
      chalk.red(
        `--types: unknown signal type(s): ${invalid.join(", ")}. Valid: ${ALL_SIGNAL_TYPES.join(", ")}`,
      ),
    );
    process.exit(2);
  }
  return requested as SignalType[];
}

function formatCandidateLine(c: StrategyCandidate): string {
  const sizeText = c.suggestedSizeUsd !== null ? `$${c.suggestedSizeUsd}` : "—";
  return (
    `${chalk.yellow(c.signalType.padEnd(24))} ${chalk.bold(c.ticker.padEnd(6))} ` +
    `score=${c.score.toFixed(2)} ${c.direction.padEnd(5)} ` +
    `entry=${c.suggestedEntry.toFixed(2)} target=${c.suggestedTarget.toFixed(2)} ` +
    `stop=${c.suggestedStop.toFixed(2)} size=${sizeText}\n` +
    `  ${chalk.gray(c.candidateId)}\n` +
    `  ${chalk.gray(c.rationale)}`
  );
}

function decisionStatusLabel(decision: StrategyDecisionRecord | undefined): string {
  if (!decision) return chalk.yellow("pending");
  if (decision.closedAt) return chalk.gray("closed");
  return decision.decision === "accept" ? chalk.green("accepted") : chalk.gray("skipped");
}

export function registerStrategyCommands(program: Command, deps: StrategyCommandsDeps = {}): void {
  const intelDataDir = deps.intelDataDir ?? DEFAULT_INTEL_DATA_DIR;
  const strategyDataDir = deps.strategyDataDir ?? DEFAULT_STRATEGY_DATA_DIR;

  const strategy = program.command("strategy").description("AI-augmented strategy engine (M2-05)");

  strategy
    .command("run")
    .description("Generate today's (or a given date's) ranked trade-idea candidates")
    .option("--date <YYYY-MM-DD>", "Date to generate candidates for (default: today)")
    .option("--max-candidates <n>", "Override maxCandidatesPerDay from config")
    .option(
      "--types <csv>",
      "Comma-separated SignalType names to run (default: all registered modules)",
    )
    .option("--dry-run", "Print candidates without writing candidates-*.jsonl", false)
    .action(
      async (opts: { date?: string; maxCandidates?: string; types?: string; dryRun: boolean }) => {
        const asOfDate = parseDateOption(opts.date);
        const requestedTypes = parseTypesOption(opts.types);
        const modules = requestedTypes
          ? defaultSignalModules().filter((m) => requestedTypes.includes(m.signalType))
          : undefined;

        let maxCandidates: number | undefined;
        if (opts.maxCandidates !== undefined) {
          maxCandidates = Number(opts.maxCandidates);
          if (!Number.isFinite(maxCandidates) || maxCandidates <= 0) {
            console.error(chalk.red("--max-candidates must be a positive number"));
            process.exit(2);
          }
        }

        const result = opts.dryRun
          ? await runDryRun(asOfDate, intelDataDir, modules, deps)
          : await new StrategyEngine({
              intelDataDir,
              strategyDataDir,
              modules,
              vixProvider: deps.vixProvider,
              marketData: deps.marketData,
            }).generateCandidates(asOfDate);

        const rankedCapped =
          maxCandidates !== undefined ? result.ranked.slice(0, maxCandidates) : result.ranked;

        console.log(
          chalk.bold(
            `\nVIX: ${result.vix.close.toFixed(2)} (${result.vix.regime}, ${result.vix.source})`,
          ),
        );
        console.log(chalk.gray(`As of ${result.asOfDate}\n`));

        if (rankedCapped.length === 0) {
          console.log(chalk.yellow("No candidates above threshold today.\n"));
        } else {
          console.log(chalk.bold(`Ranked (${rankedCapped.length}):`));
          for (const c of rankedCapped) console.log(formatCandidateLine(c));
          console.log();
        }

        console.log(
          chalk.bold(
            `Sub-threshold (${result.subThreshold.length}) — below-threshold diagnostics, not tradeable:`,
          ),
        );
        if (result.subThreshold.length === 0) {
          console.log(chalk.gray("  (none)"));
        } else {
          for (const c of result.subThreshold) console.log(formatCandidateLine(c));
        }

        console.log(
          chalk.bold(
            `\nShadow (${result.shadow.length}) — logged for evidence, never ranked or sized:`,
          ),
        );
        if (result.shadow.length === 0) {
          console.log(chalk.gray("  (none)"));
        } else {
          for (const c of result.shadow) console.log(formatCandidateLine(c));
        }

        if (result.skippedTypes.length > 0) {
          console.log(chalk.bold("\nSkipped signal types:"));
          for (const s of result.skippedTypes) {
            console.log(`  ${chalk.yellow(s.signalType)}: ${s.reason}`);
          }
        }
      },
    );

  strategy
    .command("list-candidates")
    .description("List a date's candidates; hides skipped/closed/shadow ones unless asked")
    .option("--date <YYYY-MM-DD>", "Date to list (default: today)")
    .option("--include-skipped", "Also show skipped candidates", false)
    .option("--include-closed", "Also show accepted-and-closed candidates", false)
    .option("--include-shadow", "Also show shadow-mode candidates (never ranked/sized)", false)
    .action(
      async (opts: {
        date?: string;
        includeSkipped: boolean;
        includeClosed: boolean;
        includeShadow: boolean;
      }) => {
        const date = parseDateOption(opts.date);
        const dateIso = date.toISOString().split("T")[0] ?? "";

        const candidatesStore = new JsonlStore<StrategyCandidate>(strategyDataDir, "candidates");
        const candidates = await candidatesStore.readDay(date);

        const log = new DecisionLog({ strategyDataDir });
        const decisions = await log.readDedupedByCandidateId(dateIso, dateIso);
        const decisionById = new Map(decisions.map((d) => [d.candidateId, d]));

        const decisionFiltered = candidates.filter((c) => {
          const decision = decisionById.get(c.candidateId);
          if (!decision) return true;
          if (decision.closedAt) return opts.includeClosed;
          if (decision.decision === "skip") return opts.includeSkipped;
          return true; // accepted, not yet closed
        });

        const rows = decisionFiltered.filter((c) => c.mode !== "shadow");
        const shadowRows = decisionFiltered.filter((c) => c.mode === "shadow");

        console.log(
          chalk.bold(`Candidates for ${dateIso} (${rows.length} of ${candidates.length}):\n`),
        );
        if (rows.length === 0) {
          console.log(chalk.gray("  (none)"));
        }
        for (const c of rows) {
          const decision = decisionById.get(c.candidateId);
          console.log(`[${decisionStatusLabel(decision)}] ${formatCandidateLine(c)}`);
        }

        if (opts.includeShadow) {
          console.log(chalk.bold(`\nShadow (${shadowRows.length}):`));
          if (shadowRows.length === 0) {
            console.log(chalk.gray("  (none)"));
          } else {
            for (const c of shadowRows) console.log(formatCandidateLine(c));
          }
        } else if (shadowRows.length > 0) {
          console.log(
            chalk.gray(
              `\n${shadowRows.length} shadow candidate(s) not shown (use --include-shadow to view).`,
            ),
          );
        }
      },
    );

  strategy
    .command("accept")
    .description("Accept a candidate, optionally overriding entry/target/stop/size")
    .argument("<candidateId>")
    .option("--entry <n>")
    .option("--target <n>")
    .option("--stop <n>")
    .option("--size <n>")
    .option("--note <text>")
    .action(
      async (
        candidateId: string,
        opts: { entry?: string; target?: string; stop?: string; size?: string; note?: string },
      ) => {
        const overrides: { entry?: number; target?: number; stop?: number; size?: number } = {};
        for (const [key, raw] of [
          ["entry", opts.entry],
          ["target", opts.target],
          ["stop", opts.stop],
          ["size", opts.size],
        ] as const) {
          if (raw === undefined) continue;
          const n = Number(raw);
          if (!Number.isFinite(n) || n <= 0) {
            console.error(chalk.red(`--${key} must be a positive number (got "${raw}")`));
            process.exit(2);
          }
          overrides[key] = n;
        }

        const log = new DecisionLog({ strategyDataDir });
        const candidate = await log.findCandidate(candidateId);
        if (!candidate) {
          console.error(chalk.red(`No candidate found with id "${candidateId}"`));
          process.exit(1);
        }

        if (overrides.size !== undefined) {
          const config = await loadStrategyConfig();
          const maxRegimeSize = suggestSizeUsd(
            "calm",
            candidate.signalType,
            config.assumedEquity,
            config,
          );
          if (overrides.size > 2 * maxRegimeSize) {
            console.warn(
              chalk.yellow(
                `Warning: --size ${overrides.size} is more than 2x the largest regime size ` +
                  `(${maxRegimeSize}) for ${candidate.signalType} at assumedEquity=${config.assumedEquity}. Proceeding — the operator is trusted.`,
              ),
            );
          }
        }

        const record = await log.recordAccept(candidate, overrides, opts.note);
        console.log(chalk.green(`Accepted ${record.candidateId}`));
        console.log(
          `  entry=${record.operatorEntry} target=${record.operatorTarget} ` +
            `stop=${record.operatorStop} size=${record.operatorSizeUsd}`,
        );
      },
    );

  strategy
    .command("skip")
    .description("Skip a candidate")
    .argument("<candidateId>")
    .option("--note <text>")
    .action(async (candidateId: string, opts: { note?: string }) => {
      const log = new DecisionLog({ strategyDataDir });
      const candidate = await log.findCandidate(candidateId);
      if (!candidate) {
        console.error(chalk.red(`No candidate found with id "${candidateId}"`));
        process.exit(1);
      }

      const record = await log.recordSkip(candidate, opts.note);
      console.log(chalk.gray(`Skipped ${record.candidateId}`));
    });

  strategy
    .command("close")
    .description("Log a realized close against a previously accepted candidateId")
    .argument("<candidateId>")
    .requiredOption("--exit-price <n>")
    .option("--exit-date <YYYY-MM-DD>")
    .option("--note <text>")
    .action(
      async (
        candidateId: string,
        opts: { exitPrice: string; exitDate?: string; note?: string },
      ) => {
        const exitPrice = Number(opts.exitPrice);
        if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
          console.error(
            chalk.red(`--exit-price must be a positive number (got "${opts.exitPrice}")`),
          );
          process.exit(2);
        }
        if (
          opts.exitDate !== undefined &&
          Number.isNaN(new Date(`${opts.exitDate}T00:00:00.000Z`).getTime())
        ) {
          console.error(chalk.red(`--exit-date must be YYYY-MM-DD (got "${opts.exitDate}")`));
          process.exit(2);
        }

        const log = new DecisionLog({ strategyDataDir });
        try {
          const record = await log.recordClose(candidateId, {
            exitPrice,
            exitDate: opts.exitDate,
            note: opts.note,
          });
          console.log(chalk.green(`Closed ${record.candidateId}`));
          console.log(
            `  exit=${record.closeExitPrice} pnlUsd=${record.closeRealizedPnlUsd} ` +
              `pnlPct=${record.closeRealizedPnlPct}%`,
          );
        } catch (err) {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      },
    );

  strategy
    .command("decisions-summary")
    .description("Report the accept/skip rate over a trailing window (D-13 sweet spot: 20-40%)")
    .option("--days <n>", "Trailing window in days", "30")
    .action(async (opts: { days: string }) => {
      const days = Number(opts.days);
      if (!Number.isFinite(days) || days <= 0) {
        console.error(chalk.red("--days must be a positive number"));
        process.exit(2);
      }

      const log = new DecisionLog({ strategyDataDir });
      const stats = await log.acceptSkipStats(days);
      console.log(chalk.bold(`Accept/skip over the trailing ${days} days:`));
      console.log(`  accepted=${stats.accepted} skipped=${stats.skipped} total=${stats.total}`);
      console.log(`  acceptRate=${(stats.acceptRate * 100).toFixed(1)}% (${stats.band})`);
      console.log(
        chalk.gray(
          "  Sweet spot is 20-40% — below 10% may mean signal types are wrong; " +
            "above 60% may mean the engine isn't being selective enough.",
        ),
      );
    });

  strategy
    .command("show-vix")
    .description("Show the VIX close/regime for a date")
    .option("--date <YYYY-MM-DD>", "Date to resolve (default: today)")
    .action(async (opts: { date?: string }) => {
      const date = parseDateOption(opts.date);
      const provider = deps.vixProvider ?? new VixProvider({ strategyDataDir });
      const quote = await provider.getForDate(date);
      console.log(
        `${quote.date}: VIX ${quote.close.toFixed(2)} (${quote.regime}, source=${quote.source})`,
      );
    });

  strategy
    .command("show-substrate")
    .description(
      "Debug view: a date's substrate rows, active catalysts, and coverage verdict — reads the same helpers the engine uses",
    )
    .option("--ticker <SYM>", "Show only this ticker's rollup row")
    .option("--date <YYYY-MM-DD>", "Date to inspect (default: today)")
    .action(async (opts: { ticker?: string; date?: string }) => {
      const date = parseDateOption(opts.date);
      const dateIso = date.toISOString().split("T")[0] ?? "";
      const ticker = opts.ticker?.toUpperCase();

      const rollups = await loadRollupsForDay(intelDataDir, date);
      const rollupRows = ticker ? rollups.filter((r) => r.ticker === ticker) : rollups;

      console.log(chalk.bold(`\nSubstrate for ${dateIso}${ticker ? ` (${ticker})` : ""}:\n`));
      if (rollupRows.length === 0) {
        console.log(chalk.gray("  (no ticker-day-summary rows)"));
      } else {
        for (const r of rollupRows) {
          console.log(
            `${chalk.bold(r.ticker)}  weightedSentiment=${r.weightedSentiment.toFixed(2)} ` +
              `totalMateriality=${r.totalMateriality.toFixed(2)} articleCount=${r.articleCount} ` +
              `pmNetScore=${r.pmContribution.netScore.toFixed(2)}`,
          );
          console.log(`  themes: ${r.themes.length > 0 ? r.themes.join(", ") : "(none)"}`);
          console.log(
            `  activeCatalystIds: ${r.activeCatalystIds.length > 0 ? r.activeCatalystIds.join(", ") : "(none)"}`,
          );
        }
      }

      const activeCatalysts = await loadActiveCatalysts(intelDataDir, dateIso);
      const catalystRows = ticker
        ? activeCatalysts.filter((c) => catalystTickers(c).includes(ticker))
        : activeCatalysts;

      console.log(chalk.bold(`\nActive catalysts (${catalystRows.length}):`));
      if (catalystRows.length === 0) {
        console.log(chalk.gray("  (none)"));
      } else {
        for (const c of catalystRows) {
          console.log(
            `  ${c.id}  type=${c.type} direction=${c.direction} expected=${c.expectedDate} ` +
              `magnitude=${c.magnitudePrior}/5 confidence=${c.confidence.toFixed(2)} source=${c.source}`,
          );
        }
      }

      const coverage = await hasTrailingCoverage(
        intelDataDir,
        dateIso,
        SUBSTRATE_COVERAGE_WINDOW_DAYS,
      );
      console.log(chalk.bold("\nTrailing 3-day scored-article coverage:"));
      console.log(
        `  ${coverage.ok ? chalk.green("OK") : chalk.yellow("GAP")} — ${coverage.reason}`,
      );

      const hot = await isSubstrateHot(intelDataDir, date);
      if (hot) {
        console.log(
          chalk.yellow(
            "\nWarning: this date falls inside intel backlog-drain's active lock window — " +
              "substrate rows may be mid-rewrite.",
          ),
        );
      }
    });

  strategy
    .command("backtest")
    .description(
      `Live-window acceptance gate over the real 2026 substrate (D-15) — ${LIVE_WINDOW_LABEL}`,
    )
    .option(
      "--start <YYYY-MM-DD>",
      `Window start (default: ${DEFAULT_BACKTEST_START_ISO}, the first day any ticker-day-summary file exists)`,
    )
    .option("--end <YYYY-MM-DD>", "Window end (default: today)")
    .option("--types <csv>", "Comma-separated SignalType names to run (default: all four)")
    .option(
      "--out <path>",
      "Write the full LiveWindowReport JSON here (default: data/strategy/backtest-<start>_<end>.json)",
    )
    .action(async (opts: { start?: string; end?: string; types?: string; out?: string }) => {
      const startIso = parseIsoDateOrExit(opts.start ?? DEFAULT_BACKTEST_START_ISO, "--start");
      const endIso = parseIsoDateOrExit(
        opts.end ?? (new Date().toISOString().split("T")[0] ?? ""),
        "--end",
      );
      const requestedTypes = parseTypesOption(opts.types);
      const typesToRun = requestedTypes ?? ALL_SIGNAL_TYPES;

      const t0 = Date.now();
      const spinner = ora(`Replaying ${startIso} → ${endIso}...`).start();
      let report: LiveWindowReport;
      try {
        report = await runLiveWindow({
          startIso,
          endIso,
          types: requestedTypes,
          intelDataDir,
          marketData: deps.marketData,
          vixProvider: deps.vixProvider,
          onProgress: ({ pass, dayIndex, dayCount }) => {
            spinner.text = `[${pass}] day ${dayIndex}/${dayCount} (${startIso} → ${endIso})...`;
          },
        });
      } catch (err) {
        spinner.fail(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
      spinner.succeed(`Replay complete in ${elapsedSec}s.`);

      printBacktestReport(report, typesToRun);

      const outPath = path.resolve(
        opts.out ?? path.join(strategyDataDir, `backtest-${startIso}_${endIso}.json`),
      );
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
      console.log(chalk.gray(`\nFull report written to ${outPath}`));
    });
}

/** Shared `--start`/`--end` validation for `backtest` — `process.exit(2)` on an unparseable date. */
function parseIsoDateOrExit(raw: string, flagName: string): string {
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(chalk.red(`${flagName} must be YYYY-MM-DD (got "${raw}")`));
    process.exit(2);
  }
  return raw;
}

function formatVerdictLine(label: string, pass: boolean, detail: string): string {
  const tag = pass ? chalk.green("PASS") : chalk.red("FAIL");
  return `  ${label.padEnd(28)} ${tag} (${detail})`;
}

/** `PerformanceMetrics.maxDrawdown` is a negative percentage (e.g. -12.3 = -12.3%) and `winRate` a 0-100 percentage. */
function formatTypeRow(report: TypeReport): string {
  const isShadow = report.signalType === "FADE_OVERSHOOT";
  const thinTag = report.thinSample ? chalk.yellow(" thin-sample") : "";
  const name = String(report.signalType).padEnd(24);
  const range = report.usableRange.padEnd(26);
  const candidates = String(report.candidateCount).padStart(5);
  const trades = String(report.tradeCount).padStart(6);
  if (isShadow) {
    return `${name} ${range} cand=${candidates} trades=${trades}  —  —  —  —  (shadow-only, never sized)`;
  }
  const sharpe = report.metrics.sharpeRatio.toFixed(2).padStart(6);
  const sortino = report.metrics.sortinoRatio.toFixed(2).padStart(6);
  const maxDd = `${report.metrics.maxDrawdown.toFixed(1)}%`.padStart(8);
  const winRate = `${report.metrics.winRate.toFixed(1)}%`.padStart(7);
  return (
    `${name} ${range} cand=${candidates} trades=${trades} sharpe=${sharpe} ` +
    `sortino=${sortino} maxDD=${maxDd} win=${winRate}${thinTag}`
  );
}

function printBacktestReport(report: LiveWindowReport, typesToRun: readonly SignalType[]): void {
  console.log(chalk.bold(`\n${report.label}`));
  console.log(chalk.gray(`Window: ${report.window.startIso} → ${report.window.endIso}`));
  console.log(
    chalk.gray(
      `Caveat: a Sharpe computed from fewer than ${THIN_SAMPLE_TRADE_THRESHOLD} closed trades (marked thin-sample below) is directional only, not a pass/fail signal on its own.`,
    ),
  );

  console.log(chalk.bold("\nPer-type:"));
  for (const type of typesToRun) {
    const typeReport = report.perType[type];
    if (typeReport) console.log(formatTypeRow(typeReport));
  }

  console.log(chalk.bold("\nCombined:"));
  console.log(formatTypeRow(report.combined));

  const sharpePass = report.combined.metrics.sharpeRatio > 0;
  const maxDdPass = Math.abs(report.combined.metrics.maxDrawdown) < 25;
  console.log(chalk.bold("\nVerdict (D-15 thresholds — interim, not the per-regime bar):"));
  console.log(
    formatVerdictLine(
      "Combined Sharpe > 0:",
      sharpePass,
      report.combined.metrics.sharpeRatio.toFixed(2),
    ),
  );
  console.log(
    formatVerdictLine(
      "Combined MaxDD < 25%:",
      maxDdPass,
      `${report.combined.metrics.maxDrawdown.toFixed(1)}%`,
    ),
  );
  const overall = sharpePass && maxDdPass;
  console.log(
    `  ${"Overall:".padEnd(28)} ${overall ? chalk.green("PASS") : chalk.red("FAIL")} — interim gate only, not the CONTEXT-locked per-regime bar`,
  );

  console.log(chalk.bold(`\nShadow candidates observed: ${report.shadowCandidateCount}`));

  const reasonCounts = new Map<string, number>();
  for (const s of report.skippedDays) {
    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  }
  console.log(chalk.bold(`\nSkipped days: ${report.skippedDays.length}`));
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [reason, count] of topReasons) {
    console.log(chalk.gray(`  ${count}x ${reason}`));
  }
}

/**
 * `--dry-run` needs to compute candidates WITHOUT persisting them.
 * `StrategyEngine.generateCandidates` always persists, so a dry run points
 * the engine's `strategyDataDir` at a scratch dir under the OS temp dir and
 * discards it — this keeps `generateCandidates` itself simple
 * (always-persist) rather than threading a `dryRun` flag through every
 * layer. Candidates still read the REAL (or injected `deps.intelDataDir`)
 * substrate — only the write side is scratch.
 */
async function runDryRun(
  asOfDate: Date,
  intelDataDir: string,
  modules: ReturnType<typeof defaultSignalModules> | undefined,
  deps: StrategyCommandsDeps,
) {
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-dry-run-"));
  try {
    const engine = new StrategyEngine({
      intelDataDir,
      strategyDataDir: scratchDir,
      modules,
      vixProvider: deps.vixProvider,
      marketData: deps.marketData,
    });
    return await engine.generateCandidates(asOfDate);
  } finally {
    await fs.rm(scratchDir, { recursive: true, force: true });
  }
}
