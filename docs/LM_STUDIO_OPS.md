# LLM layer operations — LM Studio "as needed" mode

The M2-04 article scorer and the LLM correlator call an OpenAI-compatible
endpoint (`LLM_ENDPOINT`, default `http://localhost:1234/v1`). In production
that is LM Studio on the Windows host (`192.168.50.226:1234`, model
`qwen/qwen3-14b`, ~9 GB RAM while loaded).

**The scheduler keeps running when the LLM is down.** Digests, PM mapping,
calendar and rollups all continue — only article scoring stops, and every
unscored article is queued in `data/intel/score-backlog.jsonl`. This is by
design (no data is lost), but it is invisible unless you look. Between
2026-07-26 and 2026-08-27 LM Studio was off and 15k articles queued before
anyone noticed; every `ticker-day-summary` row in that window has
`articleCount: 0`.

## How you find out

1. **Every Telegram digest** ends with a scorer-health line:
   - `_Scorer ok — backlog 0, last scored 2.1h ago_`
   - `⚠️ Scorer down — backlog 1,234 (oldest 3d), last scored 30h ago. Start LM Studio, then pnpm intel backlog-drain.`

   "Down" = backlog non-empty **and** nothing scored in 24h. A non-empty
   backlog with recent scoring is "ok" (catching up).
2. **Journal** (`journalctl --user -u stock-sense-intel`): each cycle line now
   carries `scored=N backlogged=N backlog=N`, and a cycle that scores nothing
   while backlogging logs `SCORER DOWN: … Is LM Studio running at …?`.
3. `intel backlog-drain` with no LLM up exits 2 with the backlog size.

## Catching up

```bash
# LM Studio already running:
pnpm intel backlog-drain                 # drain everything (~2.5 s/article on Qwen3-14B)
pnpm intel backlog-drain --max 500       # bounded

# Let the command manage LM Studio (WSL2 → Windows `lms.exe` via interop):
pnpm intel backlog-drain --manage-server # starts the server if down, drains,
                                         # then `lms unload --all` + `lms server stop`
```

- Ctrl-C once: finish the current batch, rebuild rollups, exit. Twice: force.
- Each scored record is filed into `scored-articles-<publish day>.jsonl`, not
  today's file, and every touched day's `ticker-day-summary` is rebuilt. The
  scheduler's own in-cycle drain (50/cycle) does the same.
- The command holds `data/intel/score-backlog.lock`; the scheduler skips its
  in-cycle drain while the lock is fresh (< 2 h), so both can run at once.
  Fresh-article scoring in the scheduler still runs and shares the GPU.
- `lms` lookup: `LMS_BIN` env, else `/mnt/c/Users/*/.lmstudio/bin/lms.exe`. Bind address is left to LM Studio's own setting (the server must be reachable from WSL2, which rules out host loopback in NAT mode — that is an unauthenticated LAN-visible endpoint, so keep the machine on a trusted network); set `LMS_BIND` to override.

The scheduler resumes scoring on its own the moment the endpoint answers —
no restart needed (a new client is built every cycle).

## Not done on purpose

No autostart / watchdog for LM Studio: the loaded model costs ~9 GB RAM and
the operator wants it up only when needed. If that changes, the pieces are
trivial: a Windows logon task running `lms server start --port 1234 --bind
0.0.0.0` (the model itself JIT-loads on first request and unloads after its
TTL), plus optionally a WSL `systemd --user` timer that pings `/v1/models`
and re-runs the same command via interop (verified working from a systemd
unit). A remote OpenAI-compatible API (e.g. DeepSeek) removes the problem
entirely — see STATE.md for the current thinking.

## RDNA4 / Adrenalin VRAM-eviction crash (2026-08-28) — why the model must never sit idle in VRAM

The operator's RX 9060 XT on Adrenalin 26.5.1–26.8.1 hits llama.cpp #23443:
after inference the driver evicts VRAM to system RAM (fully when Windows
turns the displays off) and the machine hard-crashes (`VIDEO_TDR_FAILURE`
0x116 / 0x7E, `amdkmdag.sys`). Every crash on record coincided with LM Studio
holding `qwen3-14b` resident while this scheduler kept calling it overnight;
LM Studio's 1 h idle TTL is far too long. Rolling back to 26.7.1 does not help
(it is inside the affected range); 26.3.1 is the last build users report clean.

**Scheduler-side guard (`src/market-intelligence/scheduler/llm-guard.ts`),
set in `.env`:**

- `LLM_UNLOAD_AFTER_CYCLE=true` (default) — after any cycle that used the
  LLM, run `lms unload --all` so nothing is resident while idle. The next
  cycle JIT-reloads (~30–60 s). Logged as `[cycle-runner] llm-guard: unloaded`.
- `LLM_QUIET_HOURS_ET=22:00-07:00` — inside the window the cycle makes **no**
  LLM calls: correlator falls back to rules, fresh articles are queued to the
  score backlog (reason `quiet-hours`) and drained during the day. Logged as
  `[cycle-runner] LLM quiet hours (...): skipping correlator + scorer`.

**Durable fixes (operator side):** run the model on LM Studio's CPU backend
(5800X / 64 GB handles Qwen3-14B Q4 at a few tok/s — fine for scoring), or
move scoring to a remote OpenAI-compatible API (DeepSeek) so the GPU is out
of the loop. Do not test sleep/hibernate until one of those is in place.
Reported useless for this bug: TDR delay, `DisableGpuMemoryTrim`,
`KMD_EnableContextBasedPowerManagement`, PCIe ASPM, dummy HDMI plugs.
