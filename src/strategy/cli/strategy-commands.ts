/**
 * `strategy` CLI subcommand group (M2-05 Plan 11-02). Ships all seven
 * subcommands: `run`, `list-candidates`, `accept`, `skip`, `close`,
 * `decisions-summary`, `show-vix`.
 *
 * Commander naming convention: hyphenated single-word subcommand names
 * only — `.command("list candidates")` would be interpreted as one
 * literal command name, not a nested subcommand (RESEARCH §6, same
 * precedent as `intel backlog-drain` / `intel themes-review`).
 *
 * Input validation (ASVS V5): every numeric option goes through
 * `Number.isFinite` + a positivity check with `process.exit(2)` on
 * failure — same shape as `intel backlog-drain`. An unknown
 * `candidateId` prints a clear not-found error and exits 1 rather than
 * silently no-op'ing. `--note` is always an opaque display string —
 * never interpolated into a shell command or a regular expression.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import chalk from "chalk";
import type { Command } from "commander";

import { JsonlStore } from "../../market-intelligence/storage/jsonl-store.js";
import { loadStrategyConfig } from "../config.js";
import { DecisionLog } from "../decision-log.js";
import { suggestSizeUsd } from "../sizing.js";
import { StrategyEngine } from "../strategy-engine.js";
import type { StrategyCandidate, StrategyDecisionRecord } from "../types.js";
import { VixProvider } from "../vix-provider.js";

const DEFAULT_STRATEGY_DATA_DIR = "./data/strategy";

/** Shared `--date` parsing/validation for `run`, `list-candidates`, `show-vix`. */
function parseDateOption(raw: string | undefined): Date {
  if (raw === undefined) return new Date();
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(chalk.red(`--date must be YYYY-MM-DD (got "${raw}")`));
    process.exit(2);
  }
  return parsed;
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

export function registerStrategyCommands(program: Command): void {
  const strategy = program.command("strategy").description("AI-augmented strategy engine (M2-05)");

  strategy
    .command("run")
    .description("Generate today's (or a given date's) ranked trade-idea candidates")
    .option("--date <YYYY-MM-DD>", "Date to generate candidates for (default: today)")
    .option("--max-candidates <n>", "Override maxCandidatesPerDay from config")
    .option("--dry-run", "Print candidates without writing candidates-*.jsonl", false)
    .action(async (opts: { date?: string; maxCandidates?: string; dryRun: boolean }) => {
      const asOfDate = parseDateOption(opts.date);

      let maxCandidates: number | undefined;
      if (opts.maxCandidates !== undefined) {
        maxCandidates = Number(opts.maxCandidates);
        if (!Number.isFinite(maxCandidates) || maxCandidates <= 0) {
          console.error(chalk.red("--max-candidates must be a positive number"));
          process.exit(2);
        }
      }

      const result = opts.dryRun
        ? await runDryRun(asOfDate)
        : await new StrategyEngine().generateCandidates(asOfDate);

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

      console.log(chalk.bold(`Sub-threshold (${result.subThreshold.length}):`));
      if (result.subThreshold.length === 0) {
        console.log(chalk.gray("  (none)"));
      } else {
        for (const c of result.subThreshold) console.log(formatCandidateLine(c));
      }

      if (result.skippedTypes.length > 0) {
        console.log(chalk.bold("\nSkipped signal types:"));
        for (const s of result.skippedTypes) {
          console.log(`  ${chalk.yellow(s.signalType)}: ${s.reason}`);
        }
      }
    });

  strategy
    .command("list-candidates")
    .description("List a date's candidates; hides skipped/closed ones unless asked")
    .option("--date <YYYY-MM-DD>", "Date to list (default: today)")
    .option("--include-skipped", "Also show skipped candidates", false)
    .option("--include-closed", "Also show accepted-and-closed candidates", false)
    .action(async (opts: { date?: string; includeSkipped: boolean; includeClosed: boolean }) => {
      const date = parseDateOption(opts.date);
      const dateIso = date.toISOString().split("T")[0] ?? "";

      const candidatesStore = new JsonlStore<StrategyCandidate>(
        DEFAULT_STRATEGY_DATA_DIR,
        "candidates",
      );
      const candidates = await candidatesStore.readDay(date);

      const log = new DecisionLog();
      const decisions = await log.readDedupedByCandidateId(dateIso, dateIso);
      const decisionById = new Map(decisions.map((d) => [d.candidateId, d]));

      const rows = candidates.filter((c) => {
        const decision = decisionById.get(c.candidateId);
        if (!decision) return true;
        if (decision.closedAt) return opts.includeClosed;
        if (decision.decision === "skip") return opts.includeSkipped;
        return true; // accepted, not yet closed
      });

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
    });

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

        const log = new DecisionLog();
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
      const log = new DecisionLog();
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

        const log = new DecisionLog();
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

      const log = new DecisionLog();
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
      const provider = new VixProvider();
      const quote = await provider.getForDate(date);
      console.log(
        `${quote.date}: VIX ${quote.close.toFixed(2)} (${quote.regime}, source=${quote.source})`,
      );
    });
}

/**
 * `--dry-run` needs to compute candidates WITHOUT persisting them.
 * `StrategyEngine.generateCandidates` always persists, so a dry run points
 * the engine's `strategyDataDir` at a scratch dir under the OS temp dir and
 * discards it — this keeps `generateCandidates` itself simple
 * (always-persist) rather than threading a `dryRun` flag through every
 * layer. Candidates still read the REAL `data/intel` substrate (`intelDataDir`
 * is left at its default) — only the write side is scratch.
 */
async function runDryRun(asOfDate: Date) {
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategy-dry-run-"));
  try {
    const engine = new StrategyEngine({ strategyDataDir: scratchDir });
    return await engine.generateCandidates(asOfDate);
  } finally {
    await fs.rm(scratchDir, { recursive: true, force: true });
  }
}
