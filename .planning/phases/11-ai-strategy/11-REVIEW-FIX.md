---
phase: 11-ai-strategy
fixed_at: 2026-08-28T17:12:00Z
review_path: .planning/phases/11-ai-strategy/11-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-28T17:12:00Z
**Source review:** .planning/phases/11-ai-strategy/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (2 critical, 3 warning)
- Fixed: 5
- Skipped: 0

**Verification (all in the main checkout — `workflow.use_worktrees` is `false` in this project's
`.planning/config.json`, so no isolated worktree was created; edits and commits happened directly on
`main`):**
- `pnpm tsc --noEmit` — clean after every commit
- `pnpm vitest run` — 586/586 tests passing (579 baseline + 7 new: 2 in `strategy-engine.test.ts`
  for CR-01/WR-01, 5 in the new `server-strategy-decision.test.ts` for CR-02)
- `cd web/frontend && npx tsc --noEmit -p .` — clean
- `pnpm build:frontend` — clean production build

## Fixed Issues

### CR-01: A single ticker's market-data fetch failure aborts the entire day's candidate run

**Files modified:** `src/strategy/types.ts`, `src/strategy/strategy-engine.ts`,
`src/strategy/cli/strategy-commands.ts`, `src/strategy/__tests__/strategy-engine.test.ts`
**Commit:** `167695b`
**Applied fix:** Wrapped the per-ticker `fetchHistoricalData` call in `generateCandidates` in a
try/catch. On failure, the ticker is recorded in a new `StrategyRunResult.skippedTickers` array
(same shape/spirit as `skippedTypes`) and its raw signals are excluded from
`ranked`/`subThreshold`/`shadow` entirely rather than letting the exception propagate and abort the
whole run. The CLI's `strategy run` command now prints "Skipped tickers (market-data fetch failed)"
the same way it prints skipped signal types. Added a unit test injecting a throwing `MarketDataSource`
for one ticker among two and asserting the other ticker's candidate survives and ranks normally.

### CR-02: Web `/strategy` accept/skip status is not fetched from the server — a page reload lets an operator silently overwrite an already-accepted decision

**Files modified:** `src/web/server.ts`, `src/web/__tests__/server-strategy-decision.test.ts` (new),
`web/frontend/src/pages/StrategyPage.tsx`, `web/frontend/src/types/strategy.ts`
**Commit:** `29b162e`
**Applied fix:**
- Server: `GET /api/strategy/candidates` now joins each candidate against
  `DecisionLog.readDedupedByCandidateId(asOfDate, today)` — the same `[asOfDate, today]` range used
  by `list-candidates` in `strategy-commands.ts` (decisions are filed under `decidedAt`'s day, not the
  candidate's `asOfDate`) — and attaches `decision: 'accept' | 'skip' | null` to every returned
  candidate via a new exported `attachDecisionStatus` helper.
- Server: `POST /api/strategy/candidates/:id/accept` and `.../skip` now look up any existing live
  decision via a new exported `findLiveDecisionForCandidate` helper and return `409` (with the
  existing decision in the response body) unless the request body includes `force: true`. Both Zod
  schemas gained an optional `force` field. The CLI's `accept`/`skip` commands are untouched — they
  call `DecisionLog.recordAccept`/`recordSkip` directly and still permit re-accept, per the
  orchestrator's explicit instruction to keep CLI behavior unchanged.
- Frontend: `StrategyPage.load()` now hydrates its local `decisions` state from the server's joined
  `decision` field on every load (mount, refresh, `?date=` change), so a reload correctly renders
  already-decided cards without Accept/Skip buttons instead of resetting to a pristine, re-acceptable
  state.
- **Deviation from the literal instruction to "add a server test for the 409 and a test for the
  decision join":** `WebServer` has no isolated HTTP test harness in this codebase — no route-level
  test exists anywhere in `src/web/`, `this.app` is private, and `start()` also initializes
  `SecureConfig`/`MarketDataService` (network/keychain dependent), making it unsafe to spin up in a
  unit test without a larger, out-of-scope refactor. Instead, the two pieces of logic the 409 guard
  and the decision join actually depend on (`attachDecisionStatus`, `findLiveDecisionForCandidate`)
  were extracted as exported, independently testable functions and covered directly against a real
  `DecisionLog` in `src/web/__tests__/server-strategy-decision.test.ts` (5 tests: no-decision case,
  post-accept lookup, post-skip lookup, join with no decision, join with a decision present) —
  functionally equivalent coverage of the same conditions the route handlers gate on, without adding
  a new test-infrastructure dependency (e.g. `supertest`) mid-fix.

### WR-01: Zero/insufficient ATR data silently produces a degenerate entry=target=stop candidate that still gets ranked and sized

**Files modified:** `src/strategy/strategy-engine.ts`, `src/strategy/__tests__/strategy-engine.test.ts`
**Commit:** `e6a3d98`
**Applied fix:** Added an exported `hasDegenerateLevels(candidate)` helper (true when `atrValue <= 0`,
or `suggestedTarget === suggestedEntry`, or `suggestedStop === suggestedEntry`). Candidates that fail
this check are demoted straight into `subThreshold` (never `ranked`, `suggestedSizeUsd` forced to
`null`) with an explicit "(demoted: degenerate levels — ...)" reason appended to their rationale,
mirroring the gated/skipped reason pattern elsewhere in the engine. Added a unit test with a ticker
that returns zero bars (insufficient history) scoring highest (0.95) among two candidates: it never
ranks, is never sized, and its rationale names the demotion.

### WR-02: Web accept form always sends `entry`/`target`/`stop`, even when unedited, collapsing the override-vs-suggestion distinction

**File modified:** `web/frontend/src/pages/StrategyPage.tsx`
**Commit:** `6e8dbc7`
**Applied fix:** `submitAccept` now compares each field's current numeric value against
`candidate.suggestedEntry`/`suggestedTarget`/`suggestedStop`/`suggestedSizeUsd` and only includes it
in the POST body when it differs — mirroring the CLI's optional-flag semantics. Unedited fields are
recorded server-side as the engine's own suggestion (`decision-log.ts`'s `operatorX ?? suggestedX`
fallback), preserving the distinction between "operator explicitly confirmed this number" and
"operator just clicked through."

### WR-03: Clearing a numeric field on the Accept form sends `0` to the API instead of surfacing inline validation

**File modified:** `web/frontend/src/pages/StrategyPage.tsx`
**Commit:** `250334a`
**Applied fix:** Added `isPositiveNumberString`, computed per-field validity for
entry/target/stop (required, must be a finite positive number) and size (optional, but must be a
finite positive number when non-empty). Invalid fields show an inline red error message
(`aria-invalid` set on the input), and the "Confirm Accept" button is disabled while the form is
invalid. `submitAccept` also short-circuits on an invalid form as defense in depth, so client-side
`disabled` state is never the sole gate before the network call.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-08-28T17:12:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
