/**
 * Thin "as needed" control over a local LM Studio server via its `lms` CLI.
 *
 * The operator keeps LM Studio OFF by default (the loaded model holds ~9 GB
 * of RAM). `intel backlog-drain --manage-server` uses this to bring the
 * server up for the drain and tear it down afterwards.
 *
 * Location of `lms`: `LMS_BIN` env var, else the first
 * `/mnt/c/Users/<user>/.lmstudio/bin/lms.exe` (WSL2 → Windows host). Returns
 * `null` from `findLms` when nothing is found so callers can degrade to a
 * clear error instead of a spawn failure.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function findLms(): Promise<string | null> {
  const fromEnv = process.env.LMS_BIN;
  if (fromEnv) return fromEnv;
  const users = await fs.readdir("/mnt/c/Users").catch(() => [] as string[]);
  for (const u of users) {
    const candidate = `/mnt/c/Users/${u}/.lmstudio/bin/lms.exe`;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

async function lms(bin: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 60_000 });
  return `${stdout}${stderr}`.replace(/\r/g, "").trim();
}

/** True if the OpenAI-compatible endpoint answers /models. */
export async function endpointUp(endpoint: string, timeoutMs = 3_000): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Start the server (idempotent) and wait until the endpoint answers. */
export async function ensureServerUp(
  bin: string,
  endpoint: string,
  waitMs = 90_000,
): Promise<{ started: boolean }> {
  if (await endpointUp(endpoint)) return { started: false };
  const port = new URL(endpoint).port || "1234";
  // Bind address is deliberately NOT forced to 0.0.0.0 here: LM Studio keeps
  // its own "serve on local network" setting, and the operator already chose
  // it (WSL2 in NAT mode cannot reach the Windows host's loopback, so the
  // server must listen on the host's LAN/vEthernet address for this project
  // to work at all — an unauthenticated endpoint the whole LAN can see).
  // Leave that choice with LM Studio's config; `LMS_BIND` overrides when set.
  const args = ["server", "start", "--port", port];
  if (process.env.LMS_BIND) args.push("--bind", process.env.LMS_BIND);
  await lms(bin, args);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await endpointUp(endpoint)) return { started: true };
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`LM Studio server did not answer at ${endpoint} within ${waitMs / 1000}s`);
}

/** Unload every model (frees RAM) and stop the server. Best-effort. */
export async function shutdownServer(bin: string): Promise<string[]> {
  const log: string[] = [];
  for (const args of [["unload", "--all"], ["server", "stop"]]) {
    try {
      log.push(`lms ${args.join(" ")}: ${(await lms(bin, args)) || "ok"}`);
    } catch (err) {
      log.push(`lms ${args.join(" ")} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return log;
}
