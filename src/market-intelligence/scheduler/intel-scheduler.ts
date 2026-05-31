import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DigestBuilder } from "../alerts/digest-builder.js";
import { IntelligenceAlerter } from "../alerts/intelligence-alerter.js";
import { runCycle, type CycleOptions, type CycleResult } from "./cycle-runner.js";

export interface DigestTimes {
  /** "HH:MM" ET. Defaults — morning: "08:30", midday: "12:30", close: "15:30". */
  morning?: string;
  midday?: string;
  close?: string;
}

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
  /**
   * ET-time-of-day targets for the three scheduled digests (Plan 10-06).
   * Each tick within ±1 minute of a target fires that flavor's digest
   * (idempotent — slot is tracked per ET day in alert-cooldown.json).
   * Default: { morning: "08:30", midday: "12:30", close: "15:30" }.
   */
  digestTimes?: DigestTimes;
  /**
   * Tolerance in minutes for matching the digest target. Default 1.
   * Heartbeat tick cadence is 60s, so a tolerance of 1 minute covers
   * the typical [-30s, +30s] window without double-counting.
   */
  digestToleranceMin?: number;
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
  private readonly digestTimes: Required<DigestTimes>;
  private readonly digestToleranceMin: number;
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
    this.digestTimes = {
      morning: options.digestTimes?.morning ?? "08:30",
      midday: options.digestTimes?.midday ?? "12:30",
      close: options.digestTimes?.close ?? "15:30",
    };
    this.digestToleranceMin = options.digestToleranceMin ?? 1;
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
    if (!this.running) return;
    // Cycle and digest gates are independent: digests may fire on a tick where
    // the cycle hasn't refreshed (and vice versa). Wrap each in its own try/catch
    // so a failure in one path doesn't suppress the other.
    if (!this.cycleInProgress) {
      try {
        const state = await this.readState();
        const lastRunAt = state?.lastRunAt ? Date.parse(state.lastRunAt) : null;
        const now = Date.now();
        const cadenceMs = isMarketHours(new Date(now))
          ? this.marketHoursCadenceMs
          : this.offHoursCadenceMs;
        const due = lastRunAt === null || now - lastRunAt >= cadenceMs;
        if (due) {
          this.cycleInProgress = true;
          try {
            await this.tick("heartbeat", onCycle);
          } finally {
            this.cycleInProgress = false;
          }
        }
      } catch (err) {
        this.cycleInProgress = false;
        console.error(
          "[intel-scheduler] heartbeat error:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Always check digests, even on ticks where the cycle didn't run. Alerter
    // is idempotent per ET-day slot (already-fired returns false silently).
    try {
      await this.checkDigests();
    } catch (err) {
      console.error(
        "[intel-scheduler] digest check failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Check whether the current ET time-of-day is within tolerance of one of
   * the three scheduled targets, and fire that flavor's digest if so. The
   * alerter's per-ET-day slot tracking is the source of truth for "already
   * fired today" — this just provides the trigger.
   */
  private async checkDigests(now: Date = new Date()): Promise<void> {
    const etHM = etHourMinute(now);
    const flavor = matchDigestFlavor(etHM, this.digestTimes, this.digestToleranceMin);
    if (!flavor) return;

    const dataDir = this.options.dataDir ?? "./data/intel";
    const builder = new DigestBuilder({ dataDir });
    const payload = await builder.build(flavor, now);
    const alerter = new IntelligenceAlerter(dataDir);
    const sent = await alerter.sendDigest(payload);
    if (sent) {
      console.log(`[intel-scheduler] ${flavor} digest sent at ET ${etHM}`);
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
 * Returns current time-of-day in America/New_York as "HH:MM".
 *
 * Uses Intl.DateTimeFormat with timeZone='America/New_York', so DST handling
 * (EST -> EDT on the second Sunday in March, EDT -> EST on the first Sunday
 * in November) is handled by the runtime's tzdata. The same Intl call is used
 * to roll the daily-cap counter at ET midnight in IntelligenceAlerter, keeping
 * the two clocks consistent.
 */
function etHourMinute(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  // Intl emits "24" for midnight on some Node builds; normalize to "00".
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return `${hour}:${minute}`;
}

/**
 * Returns the matching digest flavor if `etHM` is within `toleranceMin` of one
 * of the configured targets, else null.
 */
function matchDigestFlavor(
  etHM: string,
  targets: Required<DigestTimes>,
  toleranceMin: number,
): "MORNING" | "MIDDAY" | "CLOSE" | null {
  const cur = toMinutes(etHM);
  if (cur === null) return null;
  const candidates: Array<["MORNING" | "MIDDAY" | "CLOSE", string]> = [
    ["MORNING", targets.morning],
    ["MIDDAY", targets.midday],
    ["CLOSE", targets.close],
  ];
  for (const [flavor, hm] of candidates) {
    const target = toMinutes(hm);
    if (target === null) continue;
    if (Math.abs(cur - target) <= toleranceMin) return flavor;
  }
  return null;
}

function toMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
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
