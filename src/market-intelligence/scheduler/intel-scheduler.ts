import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runCycle, type CycleOptions, type CycleResult } from "./cycle-runner.js";

export interface SchedulerOptions extends Omit<CycleOptions, "dryRun"> {
  /**
   * Cadence in minutes for market hours and off-hours. Defaults:
   *   - 15 minutes during US market hours (9:00-15:59 ET, Mon-Fri)
   *   - 60 minutes otherwise (off-hours weekdays + weekends)
   */
  marketHoursCadenceMin?: number;
  offHoursCadenceMin?: number;
  /** Heartbeat interval in seconds. Defaults to 60. */
  heartbeatSec?: number;
  /** Override data dir for the last-run timestamp file. */
  stateDir?: string;
}

interface SchedulerState {
  lastRunAt: string | null;
  cyclesCompleted: number;
  alertsSentTotal: number;
}

/**
 * Self-healing intelligence scheduler.
 *
 * Uses a periodic heartbeat (setInterval) that, on each tick, computes whether
 * enough wall-clock time has elapsed since the last successful cycle to fire
 * another one. This is robust to WSL2 / VM sleep events that compress or skip
 * cron timers — on wake, the heartbeat sees a stale lastRunAt and fires once,
 * bringing the intel state current without trying to catch up on every missed
 * fire.
 *
 * Persists last-run state so restarts pick up cleanly.
 */
export class IntelScheduler {
  private readonly options: SchedulerOptions;
  private readonly stateDir: string;
  private readonly stateFile: string;
  private readonly marketHoursCadenceMs: number;
  private readonly offHoursCadenceMs: number;
  private readonly heartbeatMs: number;
  private running = false;
  private cycleInProgress = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(options: SchedulerOptions) {
    this.options = options;
    this.stateDir = options.stateDir ?? options.dataDir ?? "./data/intel";
    this.stateFile = path.join(this.stateDir, "scheduler-state.json");
    this.marketHoursCadenceMs = (options.marketHoursCadenceMin ?? 15) * 60_000;
    this.offHoursCadenceMs = (options.offHoursCadenceMin ?? 60) * 60_000;
    this.heartbeatMs = (options.heartbeatSec ?? 60) * 1_000;
  }

  /** Start the heartbeat. Returns once the timer is registered. */
  async start(onCycle?: (result: CycleResult) => void): Promise<void> {
    if (this.running) return;
    this.running = true;
    await fs.mkdir(this.stateDir, { recursive: true });

    const heartbeat = (): void => {
      void this.heartbeat(onCycle);
    };
    this.interval = setInterval(heartbeat, this.heartbeatMs);
  }

  /** Stop the heartbeat. */
  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Force one cycle to run immediately (e.g. on startup). */
  async runNow(onCycle?: (result: CycleResult) => void): Promise<CycleResult> {
    return this.tick("manual", onCycle);
  }

  private async heartbeat(onCycle?: (result: CycleResult) => void): Promise<void> {
    if (!this.running || this.cycleInProgress) return;
    try {
      const state = await this.readState();
      const lastRunAt = state?.lastRunAt ? Date.parse(state.lastRunAt) : null;
      const now = Date.now();
      const cadenceMs = isMarketHours(new Date(now))
        ? this.marketHoursCadenceMs
        : this.offHoursCadenceMs;
      const due = lastRunAt === null || now - lastRunAt >= cadenceMs;
      if (!due) return;

      this.cycleInProgress = true;
      try {
        await this.tick("heartbeat", onCycle);
      } finally {
        this.cycleInProgress = false;
      }
    } catch (err) {
      this.cycleInProgress = false;
      console.error(
        "[intel-scheduler] heartbeat error:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async tick(
    label: string,
    onCycle?: (result: CycleResult) => void,
  ): Promise<CycleResult> {
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

/**
 * Returns true if `d` falls within US equity market hours (9:00-15:59 ET, Mon-Fri).
 * Uses the cron-style 9-15 hour window — same semantics as the old `*\/15 9-15`
 * cron expression, which covers the regular session plus the open-auction prep.
 * Holidays are NOT excluded here; over-polling during a closed session is cheap
 * (the Polymarket and RSS feeds still produce signal) so we don't filter them.
 */
function isMarketHours(d: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = Number(hourStr) % 24;
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= 9 && hour <= 15;
}
