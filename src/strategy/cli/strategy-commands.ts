/**
 * `strategy` CLI subcommand group (M2-05 Plan 11-02 Task 1 — `run`,
 * `accept`, `skip`. Task 3 adds `list-candidates`, `close`,
 * `decisions-summary`, `show-vix`.)
 *
 * Commander naming convention: hyphenated single-word subcommand names
 * only — `.command("list candidates")` would be interpreted as one
 * literal command name, not a nested subcommand (RESEARCH §6, same
 * precedent as `intel backlog-drain` / `intel themes-review`).
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import chalk from "chalk";
import type { Command } from "commander";

import { JsonlStore } from "../../market-intelligence/storage/jsonl-store.js";
import { DecisionLog } from "../decision-log.js";
import { StrategyEngine } from "../strategy-engine.js";
import type { StrategyCandidate } from "../types.js";

/**
 * `candidateId` always starts with its `asOfDate` (`YYYY-MM-DD-...`), so
 * the day's `candidates-YYYY-MM-DD.jsonl` file can be resolved directly
 * from the id without scanning every file. Task 3's `DecisionLog` grows a
 * fuller `findCandidate` that scans a range for callers that don't have
 * the date embedded; this is Task 1's minimal resolver for `accept`/`skip`.
 */
async function findCandidateById(
  strategyDataDir: string,
  candidateId: string,
): Promise<StrategyCandidate | undefined> {
  const dateMatch = candidateId.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!dateMatch) return undefined;
  const store = new JsonlStore<StrategyCandidate>(strategyDataDir, "candidates");
  const rows = await store.readDay(new Date(`${dateMatch[1]}T00:00:00.000Z`));
  return rows.find((c) => c.candidateId === candidateId);
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

export function registerStrategyCommands(program: Command): void {
  const strategy = program.command("strategy").description("AI-augmented strategy engine (M2-05)");

  strategy
    .command("run")
    .description("Generate today's (or a given date's) ranked trade-idea candidates")
    .option("--date <YYYY-MM-DD>", "Date to generate candidates for (default: today)")
    .option("--max-candidates <n>", "Override maxCandidatesPerDay from config")
    .option("--dry-run", "Print candidates without writing candidates-*.jsonl", false)
    .action(async (opts: { date?: string; maxCandidates?: string; dryRun: boolean }) => {
      let asOfDate = new Date();
      if (opts.date !== undefined) {
        const parsed = new Date(`${opts.date}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
          console.error(chalk.red(`--date must be YYYY-MM-DD (got "${opts.date}")`));
          process.exit(2);
        }
        asOfDate = parsed;
      }

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

        const candidate = await findCandidateById("./data/strategy", candidateId);
        if (!candidate) {
          console.error(chalk.red(`No candidate found with id "${candidateId}"`));
          process.exit(1);
        }

        const log = new DecisionLog();
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
      const candidate = await findCandidateById("./data/strategy", candidateId);
      if (!candidate) {
        console.error(chalk.red(`No candidate found with id "${candidateId}"`));
        process.exit(1);
      }

      const log = new DecisionLog();
      const record = await log.recordSkip(candidate, opts.note);
      console.log(chalk.gray(`Skipped ${record.candidateId}`));
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
