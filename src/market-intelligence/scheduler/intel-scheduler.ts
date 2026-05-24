import * as fs from "node:fs/promises";
import * as path from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import { runCycle, type CycleOptions, type CycleResult } from "./cycle-runner.js";

export interface SchedulerOptions extends Omit<CycleOptions, "dryRun"> {
  /**
   * Cron expression(s) to run on. Each entry: { expr, timezone, label }.
   * Defaults to:
   *   - "Every 15 minutes during US market hours (Mon-Fri 9-16 ET)"
   *   - "Hourly outside market hours (Mon-Fri off-hours + weekends)"
   */
  schedules?: SchedulerEntry[];
  /** Override data dir for the last-run timestamp file. */
  stateDir?: string;
}

export interface SchedulerEntry {
  expr: string;
  timezone?: string;
  label: string;
}

interface SchedulerState {
  lastRunAt: string | null;
  cyclesCompleted: number;
  alertsSentTotal: number;
}

const DEFAULT_SCHEDULES: SchedulerEntry[] = [
  {
    expr: "*/15 9-15 * * 1-5",
    timezone: "America/New_York",
    label: "market-hours-15min",
  },
  // 16:00-23:59 weekdays + all of Sat-Sun, hourly
  { expr: "0 16-23 * * 1-5", timezone: "America/New_York", label: "afterhours-weekday" },
  { expr: "0 0-8 * * 1-5", timezone: "America/New_York", label: "premarket-weekday" },
  { expr: "0 * * * 0,6", timezone: "America/New_York", label: "weekend-hourly" },
];

/**
 * Continuously-running scheduler that fires runCycle on configured cron expressions.
 * Persists last-run state so restarts pick up cleanly. Stops on stop() or process exit.
 */
export class IntelScheduler {
  private readonly options: SchedulerOptions;
  private readonly stateDir: string;
  private readonly stateFile: string;
  private readonly tasks: ScheduledTask[] = [];
  private running = false;

  constructor(options: SchedulerOptions) {
    this.options = options;
    this.stateDir = options.stateDir ?? options.dataDir ?? "./data/intel";
    this.stateFile = path.join(this.stateDir, "scheduler-state.json");
  }

  /** Start all schedules. Returns once cron tasks are registered. */
  async start(onCycle?: (result: CycleResult) => void): Promise<void> {
    if (this.running) return;
    this.running = true;
    await fs.mkdir(this.stateDir, { recursive: true });

    const schedules = this.options.schedules ?? DEFAULT_SCHEDULES;
    for (const sched of schedules) {
      const task = cron.schedule(
        sched.expr,
        () => {
          void this.tick(sched.label, onCycle);
        },
        { timezone: sched.timezone },
      );
      this.tasks.push(task);
    }
  }

  /** Stop all schedules. */
  stop(): void {
    for (const t of this.tasks) {
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    this.tasks.length = 0;
    this.running = false;
  }

  /** Force one cycle to run immediately (e.g. on startup). */
  async runNow(onCycle?: (result: CycleResult) => void): Promise<CycleResult> {
    return this.tick("manual", onCycle);
  }

  private async tick(label: string, onCycle?: (result: CycleResult) => void): Promise<CycleResult> {
    try {
      const result = await runCycle(this.options);
      await this.persistState(result);
      if (onCycle) onCycle(result);
      return result;
    } catch (err) {
      console.error(
        `[intel-scheduler:${label}] cycle failed:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }

  private async persistState(result: CycleResult): Promise<void> {
    const prev = await this.readState();
    const next: SchedulerState = {
      lastRunAt: new Date().toISOString(),
      cyclesCompleted: (prev?.cyclesCompleted ?? 0) + 1,
      alertsSentTotal: (prev?.alertsSentTotal ?? 0) + result.alertsSent,
    };
    await fs.writeFile(this.stateFile, JSON.stringify(next, null, 2), "utf8");
  }

  private async readState(): Promise<SchedulerState | null> {
    try {
      const raw = await fs.readFile(this.stateFile, "utf8");
      return JSON.parse(raw) as SchedulerState;
    } catch {
      return null;
    }
  }
}
