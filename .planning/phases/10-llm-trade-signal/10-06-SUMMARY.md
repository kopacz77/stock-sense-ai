---
phase: 10-llm-trade-signal
plan: 06
subsystem: market-intelligence
tags: [m2-04, digest, telegram, alerter, scheduler, break-glass, et-timezone]

# Dependency graph
requires:
  - phase: 10-05
    provides: ticker-day-summary JSONL + cycle-runner step 3.95 slot left clean
  - phase: 10-04
    provides: PmMappingEngine (used transitively via rollup pmContribution)
  - phase: 10-03
    provides: catalyst-flags JSONL (read for digest 24h calendar + break-glass)
  - phase: 10-02
    provides: scored-articles JSONL (read for digest top stories)
  - phase: 10-01
    provides: DigestPayload + CatalystFlag + ScoredArticle types
provides:
  - DigestBuilder.build(flavor) producing DigestPayload from scored-articles + catalyst-flags + polymarket-snapshots
  - renderDigestMarkdown stateless renderer (Telegram MarkdownV1)
  - IntelligenceAlerter.sendDigest with per-ET-day slot tracking (morning/midday/close)
  - IntelligenceAlerter.sendBreakGlass with at-most-once-per-ET-day slot
  - IntelligenceAlerter.absoluteCapPerDay hard backstop (default 8)
  - IntelScheduler heartbeat-driven digest tick (ET 8:30/12:30/15:30, ±1 min tolerance)
  - cycle-runner step 3.95 (evaluateBreakGlass) with 3 trigger criteria
  - DAILY_DIGEST flavor union widened from MORNING|EVENING to MORNING|MIDDAY|CLOSE
affects: [m2-05-ai-augmented-strategy, m2-06-risk-management, operator-telegram-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-ET-day slot tracking pattern: alert-cooldown.json now carries digestSlots + totalSentToday + dailyCap, each keyed by etDate. Resets via etDate-roll check at read time."
    - "Decoupled cycle + digest heartbeat gates: digests fire on any tick within ±1 min of ET targets, even when no cycle ran. Each path has independent try/catch."
    - "Stateless DigestPayload renderer: DigestBuilder produces structured payload; renderDigestMarkdown is a pure function. Two callers (alerter + future tests) without coupling."

key-files:
  created:
    - src/market-intelligence/alerts/digest-builder.ts (~330 lines)
    - src/market-intelligence/alerts/__tests__/digest-builder.test.ts (6 tests)
    - src/market-intelligence/alerts/__tests__/intelligence-alerter.test.ts (6 tests)
  modified:
    - src/market-intelligence/alerts/types.ts (DigestAlert.flavor widened + payload field)
    - src/market-intelligence/alerts/intelligence-alerter.ts (sendDigest + sendBreakGlass + absoluteCapPerDay)
    - src/market-intelligence/scheduler/intel-scheduler.ts (digest tick + matchDigestFlavor)
    - src/market-intelligence/scheduler/cycle-runner.ts (step 3.95 evaluateBreakGlass + CycleResult fields)
    - src/notifications/telegram-service.ts (flavor-specific digest emoji)

key-decisions:
  - "Digest tick is heartbeat-driven, not cron-driven — sleep-resilience inherited from existing scheduler."
  - "Slot tracking lives in alert-cooldown.json (single state file) rather than separate digest-state.json — keeps the ET-midnight reset logic in one place."
  - "Daily cap (4) for CONFIRMED/DIVERGENCE kept in place as backstop; absolute cap (8) added on top of all paths."
  - "Break-glass at-most-once-per-ET-day is enforced at the alerter, not cycle-runner — multiple criteria can co-fire but only the first per day gets through."
  - "send() now defensively rejects DAILY_DIGEST routed through it (was a backdoor that bypassed the per-slot tracking)."

patterns-established:
  - "ET-time-of-day matching via Intl.DateTimeFormat with timeZone='America/New_York' — DST handled by runtime tzdata, same Intl call as etDateString in alerter for clock consistency."
  - "Read-time state coercion: readCooldownState preserves all known fields (digestSlots, totalSentToday). Adding a new persisted field requires adding it to the explicit pluck-list."
  - "Audit-log decoration with suppressReason — every suppressed/promoted alert carries a reason string in the JSONL for forensic traceability."

# Metrics
duration: ~25 min
completed: 2026-05-31
---

# Phase 10 Plan 06: DigestBuilder + Scheduled Digest Delivery + Break-Glass Summary

**3 scheduled Telegram digests (ET 8:30 / 12:30 / 15:30) + 1 break-glass slot/day replaces the M2-03 bare 4-alert cap; per-(market,kind) cooldown untouched, absolute backstop of 8/day protects against bugs**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-31T15:25Z (approx)
- **Completed:** 2026-05-31T15:50Z (approx)
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified, 2 test files created)

## Accomplishments

- **DigestBuilder + renderDigestMarkdown** stateless module that ingests today's scored-articles + catalyst-flags + (MIDDAY/CLOSE) polymarket-snapshots and produces a flavor-specific brief: top stories with rationale, next-24h calendar, PM movers.
- **3 scheduled digest slots + 1 break-glass slot per ET trading day** via `alert-cooldown.json` digestSlots tracker. Idempotent across process restarts.
- **`send()` cap math fixed**: only CONFIRMED + DIVERGENCE consume `dailyCap.sentCount`. Digests + break-glass have their own slots. Absolute backstop (default 8) blocks runaway-bug fan-out across all paths.
- **Break-glass step 3.95** in cycle-runner with 3 trigger criteria: |pmMovePp| ≥ 15, scored materiality ≥ 0.9 + |sentiment| ≥ 0.7, imminent (12h) high-magnitude catalyst with high confidence + non-uncertain direction.
- **ET-time-of-day matching** via `Intl.DateTimeFormat` with `timeZone='America/New_York'` — DST handled by the runtime's tzdata.

## Task Commits

Each task was committed atomically:

1. **Task 1: DigestBuilder + widen DigestAlert.flavor + TelegramService digest rendering** — `2f8d6e2` (feat)
2. **Task 2: IntelligenceAlerter sendDigest/sendBreakGlass + IntelScheduler digest tick + cycle-runner step 3.95** — `343485c` (feat)

## Files Created/Modified

- `src/market-intelligence/alerts/digest-builder.ts` (NEW) — `DigestBuilder.build(flavor)` + `renderDigestMarkdown` + `digestTitle`
- `src/market-intelligence/alerts/__tests__/digest-builder.test.ts` (NEW) — 6 tests, fs.mkdtemp per case
- `src/market-intelligence/alerts/__tests__/intelligence-alerter.test.ts` (NEW) — 6 tests covering digest + break-glass + caps
- `src/market-intelligence/alerts/types.ts` (MODIFIED) — `DigestAlert.flavor` widened, optional `payload` field added
- `src/market-intelligence/alerts/intelligence-alerter.ts` (MODIFIED) — sendDigest, sendBreakGlass, absoluteCapPerDay, suppressReason, defensive send() guard
- `src/market-intelligence/scheduler/intel-scheduler.ts` (MODIFIED) — `digestTimes` option, `checkDigests` method on heartbeat, `etHourMinute` + `matchDigestFlavor` helpers
- `src/market-intelligence/scheduler/cycle-runner.ts` (MODIFIED) — step 3.95 break-glass evaluation, CycleResult gains `digestsFiredThisCycle` + `breakGlassFiredThisCycle` + `breakGlassReason`
- `src/notifications/telegram-service.ts` (MODIFIED) — DAILY_DIGEST emoji per flavor (🌅 Morning / ☀️ Mid-Day / 🔔 Pre-Close)

## Decisions Made

### Per-ET-day slot tracking in `alert-cooldown.json` (single state file)

`digestSlots: { etDate, slots: { morning, midday, close, breakGlass } }` lives alongside `dailyCap` + `totalSentToday`. The ET-midnight reset logic stays in one place (`etDateString` is the source of truth). Splitting these into separate state files would have created clock-drift hazards.

### Daily cap (default 4) kept; absolute cap (default 8) added on top

Per CONTEXT.md, the planner's call was either remove the 4/day cap once digests prove out, or keep it as a backstop. I kept it: digests don't consume it, so it doesn't squeeze the scheduled brief, and it remains a useful per-day-per-kind throttle for noisy CONFIRMED/DIVERGENCE cycles. The absolute cap is the runaway-bug defense — 4 + 3 digests + 1 break-glass = 8 with no headroom; if a future bug starts double-dispatching, the absolute cap catches it.

### Digest tick decoupled from cycle gate in the heartbeat

The original heartbeat early-returned if no cycle was due. Digests fire on a different cadence than cycles (a digest at 12:30 ET doesn't need a fresh cycle — last-known scored-articles + catalyst-flags are sufficient). Splitting the two gates into independent try/catch blocks means a failure in one doesn't suppress the other; digests will still fire even if the cycle errored.

### Break-glass slot fires at most once per ET day, enforced at the alerter

Multiple criteria can co-fire within a cycle (e.g., a +18pp Iran market AND a critical scored article). Letting cycle-runner decide which fires would mean re-implementing the slot logic; instead, cycle-runner picks the first match (priority 1→2→3) and sends it. The alerter is the source of truth: if the slot was already used today (e.g., morning fire), the cycle-runner call returns false silently.

### `send()` defensively rejects DAILY_DIGEST

The pre-Plan-10-06 alerter accepted DAILY_DIGEST through `send()` as a bypass-cooldown path. With per-slot tracking now mandatory, that path becomes a backdoor — a future contributor calling `alerter.send(digest)` would skip the slot tracking entirely. Rejecting it (and audit-logging the rejection) makes the contract loud.

### `DigestBuilder` is a sibling of `RollupBuilder`, not a consumer

Per CONTEXT.md, the rollup file already contains pmContribution per ticker. But DigestBuilder reads `scored-articles` directly rather than via the rollup — top-story selection needs per-article materiality + sentiment, which the rollup aggregates away. Reading both upstream JSONLs keeps DigestBuilder's logic transparent and means the rollup file remains M2-05's downstream contract (not double-consumed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `readCooldownState` was dropping new persisted fields**

- **Found during:** Task 2 (integration test failures — sendDigest didn't persist slot state across calls)
- **Issue:** The existing `readCooldownState` method returned `{ records: fresh, dailyCap: parsed.dailyCap }` and silently dropped any field I added to `CooldownState`. After my refactor, `digestSlots` and `totalSentToday` were being written to disk but discarded on the next read — every call started with a fresh slot bag, breaking the at-most-once-per-day guarantee.
- **Fix:** Updated `readCooldownState` to explicitly preserve `digestSlots` and `totalSentToday` from the parsed JSON. Added a defensive comment explaining the pattern: "Adding a new persisted field requires adding it to the explicit pluck-list."
- **Files modified:** src/market-intelligence/alerts/intelligence-alerter.ts (readCooldownState)
- **Verification:** All 6 IntelligenceAlerter integration tests pass after the fix; without the fix, 3/6 failed (slot tests + cap saturation test).
- **Committed in:** `343485c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The bug was self-inflicted during the refactor — it never reached committed code with a passing test suite. The fix preserves the at-most-once-per-day semantics that the entire Plan 10-06 architecture depends on. Documented as a pattern note for future state-shape extensions.

## Issues Encountered

- **Linter-driven file reverts mid-execution:** during Task 2, the working-tree state of `intel-scheduler.ts`, `intelligence-alerter.ts`, and `cycle-runner.ts` reverted to their pre-edit content (likely a lint --fix race with the concurrent Plan 10-07 agent that was editing CLI files). Caught immediately via `grep` post-typecheck; reapplied the changes verbatim and verified via `pnpm tsc --noEmit` + the new integration tests. No code lost.

## User Setup Required

None — no external service configuration required. The 3 digest slots + 1 break-glass slot are scheduled via the existing IntelScheduler heartbeat; operator can override the default ET targets via `SchedulerOptions.digestTimes` if their workflow differs.

## Reference: The 3 digest ET-time targets

| Slot | Default ET time | Operator override |
|---|---|---|
| Morning Brief | 08:30 | `digestTimes.morning` |
| Mid-Day Update | 12:30 | `digestTimes.midday` |
| Pre-Close Recap | 15:30 | `digestTimes.close` |

Tolerance: ±1 minute by default (configurable via `digestToleranceMin`). With a 60s heartbeat, this gives a roughly 2-tick window for the digest to fire on each target.

## Reference: Cap shape per ET trading day

| Counter | Default | Counts which paths? |
|---|---|---|
| `dailyCap.sentCount` | 4 | CONFIRMED + DIVERGENCE only |
| `digestSlots.morning/midday/close` | 1 each | The respective scheduled digest |
| `digestSlots.breakGlass` | 1 | Break-glass fires |
| `totalSentToday.count` | 8 (absolute cap) | All Telegram sends across every path |

Worst case: 4 CONFIRMED/DIVERGENCE + 3 digests + 1 break-glass = 8 sends/day, exactly at the absolute cap. Any 9th send is suppressed and audit-logged with `suppressReason: "absolute-cap reached (8/day)"`.

## Reference: Break-glass criteria (cycle-runner step 3.95)

Three trigger criteria, evaluated in this order; first match fires (only one break-glass per ET day regardless):

1. **PM move ≥ 15pp** on any CONFIRMED/DIVERGENCE alert in this cycle.
2. **Critical article**: scored article in this cycle with `materiality ≥ 0.9` AND `|sentiment| ≥ 0.7` (proxy for LLM-rated criticality ≥ 0.9).
3. **Imminent scheduled catalyst**: non-archived catalyst with `expectedDate` within next 12h AND `magnitudePrior ≥ 4` AND `confidence ≥ 0.7` AND `direction !== "uncertain"`.

When the catalyst path fires there is no underlying IntelligenceAlert — the alerter synthesizes a break-glass DigestAlert with the reason embedded in the body.

## Reference: DST handling

`etHourMinute` and `etDateString` both use `Intl.DateTimeFormat` with `timeZone='America/New_York'`. The runtime's tzdata handles the EST→EDT transition (second Sunday in March) and EDT→EST transition (first Sunday in November) automatically. No manual DST table needed.

**Operator verification:** on March 8 2026 (the next DST transition), the morning digest should fire at 08:30 ET regardless of the operator's machine timezone. If a digest skips that day, check `etHourMinute(new Date())` returns the expected "08:30" (not "07:30" or "09:30").

## Next Phase Readiness

**Plan 10-06 COMPLETE.** M2-04 Wave 3 progress:
- 10-05 ✅ (RollupBuilder + CatalystRefiner + cycle-runner)
- 10-06 ✅ (DigestBuilder + scheduled delivery + break-glass)
- 10-07 in-progress (parallel CLI commands work — themes-review + stability-test test files visible in tree, summary file present)

**Operator live-validation TODO** (when LM Studio + Finnhub key are configured):
1. Start scheduler: `LLM_ENDPOINT=http://192.168.50.226:1234/v1 pnpm start intel start`
2. Confirm morning digest fires within ±1 min of 08:30 ET (check Telegram + `data/intel/alerts-fired-YYYY-MM-DD.jsonl`)
3. Confirm `data/intel/alert-cooldown.json` shows `digestSlots.slots.morning: true` after fire
4. Wait until 08:32 ET; confirm second tick does NOT refire morning digest (suppressed in audit log with `suppressReason: "MORNING slot already used today"`)

**M2-05 readiness:** the digest model is operator-facing — M2-05 strategies should NOT depend on digests being dispatched (they're a Telegram delivery concern). M2-05 reads `ticker-day-summary-*.jsonl` directly (the Plan 10-05 deliverable) for trading decisions.

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
