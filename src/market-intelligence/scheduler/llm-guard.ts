/**
 * LLM guard — keeps the local model OUT of VRAM whenever it is not actively
 * being used, and optionally keeps the scheduler off the LLM entirely during
 * quiet hours.
 *
 * Why this exists (2026-08-28): the operator's GPU (RX 9060 XT, RDNA4) on
 * Adrenalin 26.5.1–26.8.1 hits llama.cpp #23443 — after inference the driver
 * evicts VRAM to system RAM, fully so when Windows turns the displays off,
 * and the box hard-crashes (VIDEO_TDR_FAILURE 0x116 / 0x7E). Every crash on
 * record coincided with LM Studio holding qwen3-14b resident while this
 * scheduler kept calling it overnight. LM Studio's own 1h idle TTL is far too
 * long: a display-off inside that hour is enough.
 *
 * Two independent mitigations, both opt-in via env (see resolveLlmGuardFromEnv):
 *   - LLM_UNLOAD_AFTER_CYCLE (default true for local providers): after any
 *     cycle that used the LLM, run `lms unload --all` so nothing is resident
 *     while idle. The next cycle JIT-reloads (~30-60 s).
 *   - LLM_QUIET_HOURS_ET="22:00-07:00": inside the window the cycle makes NO
 *     LLM calls — correlator falls back to rules, fresh articles are queued to
 *     the score backlog (reason "quiet-hours") for the daytime drain.
 *
 * The durable fix is to take the GPU out of the loop (LM Studio CPU backend,
 * or a remote provider); this module makes the interim safe.
 */

import { findLms, unloadAllModels } from "../cli/lm-studio-control.js";

export interface QuietWindow {
  /** Minutes after midnight, ET. */
  startMin: number;
  endMin: number;
  /** Original "HH:MM-HH:MM" for logging. */
  label: string;
}

export interface LlmGuardOptions {
  quietHours: QuietWindow | null;
  unloadAfterCycle: boolean;
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Parse "HH:MM-HH:MM" (ET). Returns null for empty/invalid input. */
export function parseQuietHours(spec: string | undefined | null): QuietWindow | null {
  if (!spec) return null;
  const parts = spec.trim().split("-");
  if (parts.length !== 2) return null;
  const toMin = (s: string): number | null => {
    const m = HHMM.exec(s.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const startMin = toMin(parts[0] ?? "");
  const endMin = toMin(parts[1] ?? "");
  if (startMin === null || endMin === null || startMin === endMin) return null;
  return { startMin, endMin, label: `${parts[0]!.trim()}-${parts[1]!.trim()} ET` };
}

/** Minutes after midnight in America/New_York for `d`. */
export function etMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** True when `now` (ET) falls inside the window; windows may wrap midnight. */
export function isWithinQuietHours(now: Date, window: QuietWindow | null): boolean {
  if (!window) return false;
  const cur = etMinutesOfDay(now);
  if (window.startMin < window.endMin) {
    return cur >= window.startMin && cur < window.endMin;
  }
  // Wraps midnight, e.g. 22:00-07:00.
  return cur >= window.startMin || cur < window.endMin;
}

/**
 * Env → options. `LLM_UNLOAD_AFTER_CYCLE` defaults to true; set "false" to
 * keep the model resident (only safe on hardware without the eviction bug).
 */
export function resolveLlmGuardFromEnv(
  env: Record<string, string | undefined> = process.env,
): LlmGuardOptions {
  const quietHours = parseQuietHours(env.LLM_QUIET_HOURS_ET);
  if (env.LLM_QUIET_HOURS_ET && !quietHours) {
    console.warn(
      `[llm-guard] LLM_QUIET_HOURS_ET="${env.LLM_QUIET_HOURS_ET}" is not HH:MM-HH:MM — ignoring`,
    );
  }
  const raw = (env.LLM_UNLOAD_AFTER_CYCLE ?? "true").trim().toLowerCase();
  const unloadAfterCycle = !(raw === "false" || raw === "0" || raw === "no");
  return { quietHours, unloadAfterCycle };
}

/**
 * Best-effort `lms unload --all` via the Windows-side CLI. Never throws;
 * returns a one-line status for the cycle log.
 */
export async function unloadLocalModels(): Promise<string> {
  const bin = await findLms();
  if (!bin) return "lms not found (LMS_BIN unset, no /mnt/c/Users/*/.lmstudio/bin/lms.exe) — model left resident";
  try {
    const out = await unloadAllModels(bin);
    return `unloaded (${out || "ok"})`;
  } catch (err) {
    return `unload failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
