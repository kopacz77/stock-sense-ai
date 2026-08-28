---
phase: 11-ai-strategy
plan: 07
subsystem: web
tags: [express, zod, react, react-router, decision-log, dashboard]

# Dependency graph
requires:
  - phase: 11-ai-strategy (11-05)
    provides: "StrategyEngine.generateCandidates, DecisionLog (recordAccept/recordSkip/findCandidate), StrategyCandidate/VixQuote types, full strategy CLI"
provides:
  - "GET /api/strategy/candidates, POST /api/strategy/candidates/:id/accept, POST /api/strategy/candidates/:id/skip in src/web/server.ts, registered after the /api auth-middleware block"
  - "web/frontend/src/pages/StrategyPage.tsx — the /strategy route: header (VIX/regime/source), ranked/sub-threshold/shadow sections, full untruncated rationale, inline editable accept, skip, honest empty state"
  - "web/frontend/src/types/strategy.ts hand-mirrors StrategyCandidate/VixQuote for the browser build"
  - "A generic React Router deep-link/tab-sync fix (TabRouteSync in App.tsx) that stops any two-way tab<->URL ping-pong, not just /strategy's"
  - "A list-candidates CLI fix so decisions filed on a later day than the candidate day are reflected instead of showing [pending]"
affects: [11-08-phase-acceptance]

# Actuals (#2632)
actuals:
  tokens: 10800   # chars/4 (43204 chars) over the 9 files this plan created/modified across all 4 commits
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GET /api/strategy/candidates reads the persisted candidates-YYYY-MM-DD.jsonl rather than calling generateCandidates(), so a browser GET can never trigger a multi-second live engine run with real provider fetches (T-11-07-05) — same 'read the disk artifact, don't re-run the pipeline' shape as /api/monitoring/*"
    - "Both accept/skip handlers call the exact DecisionLog.recordAccept/recordSkip the CLI calls — zero duplicate record-construction logic in the web layer, so a web decision and a CLI decision are byte-identical in decisions-*.jsonl apart from timestamps"
    - "A useRef flag in TabRouteSync marks URL-originated tab changes so the tab->URL navigate effect skips re-navigating on the same commit — the general fix for any two-effects-racing-on-one-state ping-pong, not just this route's"

key-files:
  created:
    - web/frontend/src/pages/StrategyPage.tsx
    - web/frontend/src/types/strategy.ts
  modified:
    - src/web/server.ts
    - web/frontend/src/App.tsx
    - web/frontend/src/components/layout/Layout.tsx
    - web/frontend/src/stores/useUIStore.ts
    - web/frontend/src/services/api.ts
    - src/strategy/cli/strategy-commands.ts
    - src/strategy/cli/__tests__/strategy-commands.test.ts

key-decisions:
  - "sizeUsd above 2x the largest regime size (for the configured assumedEquity) is rejected outright with a 400 naming both numbers — the web form has no confirmation step, so unlike the CLI (which warns and proceeds) this boundary is hard-enforced, per the plan's own T-11-07-02 mitigation."
  - "skippedTypes is always [] in the GET response today — StrategyRunResult.skippedTypes is a run-time-only field the CLI prints from its own in-process engine call; StrategyEngine never persists it to candidates-*.jsonl. Documented as deferred item 3 rather than silently shipped as if the section were populated."
  - "The checkpoint-found TabRouteSync ping-pong was pre-existing (a /discovery deep link looped identically before 11-07 ever touched App.tsx) and was exposed, not introduced, by this plan's new /strategy deep link. Fixed in place rather than deferred, since an operator opening the checkpoint URL is the whole point of the checkpoint."

patterns-established:
  - "Web mutation endpoints that also exist as CLI commands should resolve their identifier and call the exact same domain-object method the CLI calls (DecisionLog.recordAccept/recordSkip here), never a parallel record-construction path in the HTTP layer."

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "Three /api/strategy/* endpoints (GET candidates, POST accept, POST skip) registered after the /api auth-middleware block, inheriting the same access level as /api/monitoring/*"
    requirement: INCOME-01
    verification:
      - kind: e2e
        ref: "curl transcript below: GET returns 200 with ranked/subThreshold/shadow/generated; POST .../nope/skip returns 404; POST .../accept with entry:-5 returns 400"
        status: pass
      - kind: unit
        ref: "pnpm tsc --noEmit && pnpm vitest run (578/578)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/strategy route renders ranked/sub-threshold/shadow sections, full untruncated rationale, inline editable accept/skip, and an honest empty state on a day with no run"
    requirement: INCOME-01
    verification:
      - kind: manual_procedural
        ref: "Operator checkpoint (Task 3), approved 2026-08-28"
        status: pass
    human_judgment: true
    rationale: "Visual/functional rendering and UX correctness (rationale not truncated, empty state reads as honest, accept flow round-trips) requires a human looking at the rendered page — exactly what the plan's checkpoint:human-verify task exists for."
  - id: D3
    description: "Accepting from the browser with an edited entry persists the operator's number, verified on disk through the same DecisionLog the CLI uses"
    requirement: INCOME-01
    verification:
      - kind: e2e
        ref: "data/strategy/decisions-2026-08-28.jsonl last record: decision=accept, decidedAt=2026-08-28T19:55:47.521Z, candidateId=2026-08-26-CATALYST_ANCHORED-NVDA-ce885e82, operatorEntry=213.05; pnpm dev strategy list-candidates --date 2026-08-26 shows [accepted]"
        status: pass
    human_judgment: false
  - id: D4
    description: "The deferred-polish boundary holds: no chart embed, socket subscription, filter control, or undo in StrategyPage.tsx"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "node -e regex check for import of charts/|socket|recharts at top of StrategyPage.tsx (Task 2 acceptance criteria) — exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h10min (includes checkpoint diagnosis + operator round-trip)
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 07: Minimal /strategy Web Route Summary

**Three `/api/strategy/*` endpoints reading the persisted candidate/decision files (never re-running the engine live) plus a minimal `/strategy` React page with inline editable accept/skip — operator-verified end-to-end including a real on-disk accepted decision, after the checkpoint surfaced and fixed a pre-existing React Router deep-link ping-pong and a decisions-lookup date-window bug.**

## Performance

- **Duration:** ~2h10min (Tasks 1-2 implementation + Task 3 checkpoint diagnosis/fix/operator verification)
- **Started:** 2026-08-28 (Wave 4, parallel with 11-06)
- **Completed:** 2026-08-28
- **Tasks:** 3 (2 auto/tracer + 1 checkpoint:human-verify)
- **Files modified:** 9 across 4 commits

## Accomplishments

- Three `/api/strategy/*` endpoints landed in `src/web/server.ts`, registered in the same block as `/api/monitoring/*` so they inherit the existing `/api` auth middleware (`authMiddleware` when `AUTH_REQUIRED`, `optionalAuthMiddleware` otherwise) with no separate mount path (T-11-07-01).
- `GET /api/strategy/candidates` reads `candidates-YYYY-MM-DD.jsonl` directly rather than calling `generateCandidates()`, so a browser request can never trigger a multi-second live engine run with real provider fetches (T-11-07-05). It returns `generated: false` with empty arrays when no run has persisted for the date — the web equivalent of D-14's honest empty state — versus `generated: true` with real (possibly empty) `ranked`/`subThreshold`/`shadow` when a run did happen. VIX is read from `vix-cache.json` first, falling back to reconstructing it from any persisted candidate's own `vix*` fields.
- `POST /api/strategy/candidates/:id/accept` and `.../skip` validate bodies with `StrategyAcceptSchema` (`entry`/`target`/`stop`/`sizeUsd` each optional positive finite number, `note` capped at 500 chars) and `StrategySkipSchema` (`note` only), returning `400` with `{ error, details }` on parse failure — the same shape as `MonitoringStartSchema`. `:id` resolves through `DecisionLog.findCandidate`; unknown ids return `404` and write nothing. `accept` additionally rejects any `sizeUsd` above 2x the largest regime size for `assumedEquity` with a `400` naming both numbers, since the web form has no confirmation step (T-11-07-02). Both handlers call the exact `DecisionLog.recordAccept`/`recordSkip` the CLI calls — no duplicate record-construction logic in the web layer.
- `web/frontend/src/pages/StrategyPage.tsx` (509 lines) renders the header (as-of date, VIX close, regime, live/cached/fallback marker), ranked cards with full untruncated rationale + entry/target/stop/size/horizon + inline Accept (editable number inputs pre-filled with the engine's suggestions, per D-09) / Skip with toast feedback, a sub-threshold section (next three, real scores), a visually de-emphasised shadow section, the skipped-types list, and an `EmptyState` for a day with nothing above the floor. `web/frontend/src/types/strategy.ts` hand-mirrors `StrategyCandidate`/`VixQuote` for the browser. `App.tsx`, `Layout.tsx`, and `useUIStore.ts` wire the `/strategy` route, `Strategy` tab, and `'strategy'` `TabType` entry.
- **Checkpoint-found fix 1** (`2eb7a32`): `TabRouteSync` in `App.tsx` had a pre-existing bug — on a direct load of any non-default route, the URL→tab effect scheduled `setActiveTab(path)` while the tab→URL effect (same commit) still saw the stale `activeTab` and navigated back, ping-ponging the URL (`/strategy` ↔ `/monitoring`; a `/discovery` deep link looped identically, 647 navigations in 8s, before 11-07 ever existed). Fixed with a `useRef` flag marking URL-originated tab changes so the navigate effect skips them. Verified headlessly with playwright-core + system Chrome: 343 navigations/8s → 2 (React StrictMode double-mount), 0×429, across `/strategy`, `/discovery`, `/strategy?date=2026-08-26`; tab clicks still navigate; `tsc --noEmit` and `pnpm build:frontend` clean.
- **Checkpoint-found fix 2** (`b58d200`): `strategy-commands.ts`'s `list-candidates` called `readDedupedByCandidateId(dateIso, dateIso)`, but decisions file under their `decidedAt` day — an operator accepting a 2026-08-26 candidate on 2026-08-28 showed `[pending]`. Now reads `[dateIso, today]`. Regression test added; CLI suite 10/10.
- Operator completed the full round-trip: clicked Accept + Confirm on the NVDA `CATALYST_ANCHORED` card, verified on disk (`decisions-2026-08-28.jsonl` last record `decision: "accept"`, `operatorEntry: 213.05`) and via CLI (`list-candidates --date 2026-08-26` → `[accepted] CATALYST_ANCHORED NVDA score=1.00 ...`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Three /api/strategy endpoints behind the existing auth middleware** — `4ce4046` (feat)
2. **Task 2: The minimal /strategy page** — `753e4e6` (feat)
3. **Task 3: Operator confirms the /strategy route** — checkpoint:human-verify, **APPROVED** 2026-08-28 (no direct commit; produced the two checkpoint-found fixes below)

**Checkpoint-found fixes** (committed during Task 3's verification, before operator sign-off):

- `2eb7a32` (fix) — stop tab/URL sync ping-pong on deep links
- `b58d200` (fix) — list-candidates reads decisions through today, not only the candidate day

## `curl` Verification Transcript (Task 1)

Against a locally started dashboard (`pnpm dev:all`, API on 3001):

```
$ curl -s "http://localhost:3001/api/strategy/candidates?date=2026-08-26"
200 OK — { "asOfDate": "2026-08-26", "generated": true, "vix": {...}, "ranked": [...], "subThreshold": [...], "shadow": [...], "skippedTypes": [] }

$ curl -s -X POST http://localhost:3001/api/strategy/candidates/nope/skip -H 'content-type: application/json' -d '{}'
404 Not Found — { "error": "Unknown candidateId \"nope\"" }

$ curl -s -X POST http://localhost:3001/api/strategy/candidates/<real-id>/accept -H 'content-type: application/json' -d '{"entry":-5}'
400 Bad Request — { "error": "Invalid request parameters", "details": [{ "code": "too_small", "path": ["entry"], ... }] }
```

All three match the plan's acceptance criteria exactly (200/404/400).

## Endpoint Signatures and Response Shapes

**`GET /api/strategy/candidates?date=YYYY-MM-DD`** (date optional, defaults to today)
```ts
// no persisted run for date:
{ asOfDate: string, generated: false, vix: null, ranked: [], subThreshold: [], shadow: [], skippedTypes: [] }
// persisted run exists:
{
  asOfDate: string,
  generated: true,
  vix: VixQuote | null,       // { date, close, regime, source, fetchedAt }
  ranked: StrategyCandidate[],       // mode === "ranked"
  subThreshold: StrategyCandidate[], // mode === "sub-threshold"
  shadow: StrategyCandidate[],       // mode === "shadow"
  skippedTypes: Array<{ signalType: string; reason: string }>, // always [] today — see deferred item 3
}
```

**`POST /api/strategy/candidates/:id/accept`** — body `{ entry?, target?, stop?, sizeUsd?, note? }` (all optional, positive finite numbers; `note` <= 500 chars)
- `400 { error, details }` on Zod parse failure
- `404 { error: 'Unknown candidateId "<id>"' }` if `:id` doesn't resolve via `DecisionLog.findCandidate`
- `400 { error }` if `sizeUsd` exceeds 2x the largest regime size for `assumedEquity`
- `200 { success: true, record }` — `record` is the `DecisionLog.recordAccept` return value

**`POST /api/strategy/candidates/:id/skip`** — body `{ note? }` (optional, <= 500 chars)
- `400 { error, details }` / `404 { error }` same as above
- `200 { success: true, record }` — `record` is the `DecisionLog.recordSkip` return value

## Files Created/Modified

- `src/web/server.ts` — `StrategyAcceptSchema`, `StrategySkipSchema`, three `/api/strategy/*` route handlers, registered post-auth-middleware
- `web/frontend/src/pages/StrategyPage.tsx` — the `/strategy` page (509 lines, new)
- `web/frontend/src/types/strategy.ts` — hand-mirrored browser types (new)
- `web/frontend/src/services/api.ts` — `getStrategyCandidates`, `acceptCandidate`, `skipCandidate` through `handleResponse<T>`
- `web/frontend/src/App.tsx` — `/strategy` route + `TabRouteSync` ping-pong fix
- `web/frontend/src/components/layout/Layout.tsx` — `Strategy` tab entry
- `web/frontend/src/stores/useUIStore.ts` — `'strategy'` added to `TabType`
- `src/strategy/cli/strategy-commands.ts` — `list-candidates` decision-lookup date-window fix
- `src/strategy/cli/__tests__/strategy-commands.test.ts` — regression test for the date-window fix

## Decisions Made

- `sizeUsd` above 2x the largest regime size is a hard `400`, not a soft warning — the web form has no confirmation step the CLI has, so this boundary can't be "warn and proceed" the way the CLI's is (T-11-07-02).
- `skippedTypes` stays `[]` in the GET response rather than being backfilled by re-running the engine or fabricating data — `StrategyRunResult.skippedTypes` is genuinely not persisted anywhere today, and pretending otherwise would misrepresent what the endpoint can honestly report. Logged as deferred item 3.
- The `TabRouteSync` ping-pong fix was applied in place during the checkpoint rather than deferred — it directly blocked the operator's ability to verify this plan's own deliverable (the page couldn't stay open long enough to look at), and it's a general routing fix (not `/strategy`-specific) that also happened to fix a pre-existing `/discovery` bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, found via operator checkpoint] React Router tab/URL sync ping-pong on deep links**
- **Found during:** Task 3 checkpoint verification — operator reported the page "running like a madman" (react-router "Throttling navigation" warnings, HTTP 429 flood on `/api/strategy/candidates`)
- **Issue:** `TabRouteSync` in `App.tsx`: on a direct load of a non-default route, the URL→tab effect scheduled `setActiveTab(path)` while the tab→URL effect, in the same commit, still saw the stale `activeTab` and navigated back — the two effects ping-ponged. Pre-existing (a `/discovery` deep link looped identically before 11-07: 647 navigations in 8s), exposed by 11-07's new `/strategy` deep link.
- **Fix:** A `useRef` flag marks URL-originated tab changes so the navigate effect skips them.
- **Files modified:** `web/frontend/src/App.tsx`
- **Verification:** Headless playwright-core + system Chrome: 343 navigations/8s → 2 (React StrictMode double-mount), 0×429, across `/strategy`, `/discovery`, `/strategy?date=2026-08-26`; tab clicks still navigate; `tsc --noEmit` and `pnpm build:frontend` clean.
- **Commit:** `2eb7a32`

**2. [Rule 1 - Bug, found via operator checkpoint] list-candidates only read decisions filed on the exact candidate day**
- **Found during:** Task 3 checkpoint verification — operator's web Accept of a 2026-08-26 candidate (made 2026-08-28) showed `[pending]` in `list-candidates --date 2026-08-26`
- **Issue:** `list-candidates` called `readDedupedByCandidateId(dateIso, dateIso)`; decisions are filed under their `decidedAt` day, not the candidate's day, so a decision made on a later day than the candidate's `asOfDate` was never read.
- **Fix:** Read the window `[dateIso, today]` instead of a single day.
- **Files modified:** `src/strategy/cli/strategy-commands.ts`, `src/strategy/cli/__tests__/strategy-commands.test.ts` (new regression test)
- **Verification:** CLI suite 10/10; `pnpm dev strategy list-candidates --date 2026-08-26` → `[accepted] CATALYST_ANCHORED NVDA score=1.00 ...` after the operator's real accept
- **Commit:** `b58d200`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs, both found during the operator checkpoint, both necessary for the checkpoint's own verification to succeed)
**Impact on plan:** Both fixes were required for the operator to actually see and interact with the page this plan built. No scope creep — neither touches `/api/strategy/*` or `StrategyPage.tsx` itself.

## Issues Encountered

- The checkpoint's first pass surfaced a page that was effectively unusable (navigation loop + rate-limited API) before the operator could evaluate any of Task 1/2's actual deliverables. Diagnosed and fixed both root causes (routing ping-pong, decision-lookup date window) before asking the operator to re-verify; both fixes are documented above with commit hashes rather than folded silently into Task 1/2's commits.
- `pnpm vitest run` (578/578) and `pnpm tsc --noEmit` (clean) re-confirmed after the two checkpoint fixes, before writing this SUMMARY.

## Known Stubs

None. `skippedTypes` returning `[]` is not a stub in the sense of unwired UI — the section renders correctly and will populate once the engine persists the field (deferred item 3); it is not blocking this plan's own goal (D-18's route with rationale, sub-threshold, and shadow sections all render real persisted data).

## User Setup Required

None — no new external service configuration. No new packages installed (T-11-07-SC held: zero new dependencies).

## Follow-ups (not part of this plan)

- Operator requested an "after-tax, after-fees hurdle on targets" feature during the checkpoint session, captured in `11-CONTEXT.md` (commit `9f57408`). This is explicitly **not** part of 11-07 — it will be scoped as a gap plan after phase verification (11-08).
- Deferred item 3 (`skippedTypes` always `[]`) should be picked up alongside the next `strategy-engine.ts`/CLI touch.

## Next Phase Readiness

- All three `/api/strategy/*` endpoints and the `/strategy` route are live, tested, and operator-verified with a real on-disk accepted decision.
- No blockers for 11-08 (phase acceptance) — 11-06 and 11-07 both closed in Wave 4 with no file overlap between them.
- 11-08 should be aware of deferred item 3 and the after-tax/after-fees follow-up when scoping the next gap plan.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 4 commit hashes
(`4ce4046`, `753e4e6`, `2eb7a32`, `b58d200`) verified present in `git log --oneline --all`.
