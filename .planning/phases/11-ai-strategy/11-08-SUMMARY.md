---
phase: 11-ai-strategy
plan: 08
subsystem: strategy
tags: [vitest, worked-example, backtest-acceptance, prescreen, operator-checkpoint, phase-close]

# Dependency graph
requires:
  - phase: 11-ai-strategy (11-02, 11-05, 11-06, 11-07)
    provides: "StrategyEngine.generateCandidates, DecisionLog, live-window backtest runner, full strategy CLI, /strategy web route — everything this plan verifies end to end and accepts"
provides:
  - "src/strategy/__tests__/worked-example.test.ts — deterministic regression test proving the canonical Iran-family PM signal -> XLE candidate -> accept -> close -> reconcile loop"
  - "11-VALIDATION.md fully populated per-task map, Wave 0 checkboxes, sign-off checklist, and approved Manual-Only Verifications rows"
  - "The phase's real acceptance numbers (full suite, backtest verdict, pre-screen retention, live run) recorded and adjudicated by the operator"
  - "Phase 11 (M2-05) closed — operator approved shipping v1 with documented gaps, not blockers"
affects: [12-risk-hardening, 11-09-gap-plan]

# Actuals (#2632)
actuals:
  tokens: 8700   # chars/4 (34655 diff chars) over worked-example.test.ts (Task 1) + 11-VALIDATION.md (Task 2) across the plan's 2 non-checkpoint commits
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worked-example regression tests should assert the hand-computed formula literal (with the arithmetic shown in a comment) rather than a range, and use fs.mkdtemp scratch dirs against the real universe/config shape rather than an invented fixture — same shape as tracer-e2e.test.ts, now the second test in src/strategy/__tests__/ following it"
    - "A phase's own honest acceptance-gate misses (retention below bar, Sharpe below bar) are recorded as ⚠️ flaky (automated command runs correctly and truthfully reports a number that misses its own stated target) rather than forced to ✅ or ❌ — the validation map's Status column is a truth report, not a pass/fail gate on its own"

key-files:
  created:
    - src/strategy/__tests__/worked-example.test.ts
  modified:
    - .planning/phases/11-ai-strategy/11-VALIDATION.md
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Operator accepted the live-window backtest FAIL (combined Sharpe -5.01, thin-sample, 1 closed trade) and the pre-screen retention miss (0.696 vs >=0.85) as documented gaps rather than blockers — both were honestly measured and neither is fixable within v1's data reality (Yahoo 429 rate-limiting on the full-window re-run; pre-screen's feature-space ceiling ~0.86 per 11-01's own finding)."
  - "0.4 score floor and VIX 15/25 regime boundaries kept as-is — insufficient live evidence (two VIX readings, two accepted decisions) to recalibrate responsibly; revisit after a real week of live trading data."
  - "Phase 11 (M2-05) formally closed: operator's verbatim verdict was 'Approved — close the phase.'"

patterns-established:
  - "A blocking checkpoint that surfaces an honest FAIL should still let the phase close if the operator judges the underlying cause (rate-limited external dependency, sample size) as non-blocking and records it as a named, tracked gap rather than silently accepting a green number."

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "The canonical Iran-ceasefire-shaped happy path (PM signal -> SECTOR_ROTATION_FROM_PM XLE candidate -> suggested levels -> operator accept override -> decision logged -> manual close -> reconciled realized P&L) is an automated, deterministic regression test"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/worked-example.test.ts (full narrative, hand-computed D-03 score literal 0.9001471422376973 asserted via toBeCloseTo, stop<entry<target, operator override persisted separately from engine suggestion, positive realized P&L, readDedupedByCandidateId reconciliation)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The phase's own acceptance criteria (full suite, backtest verdict, pre-screen retention, live strategy run showing all three v1 modes) were executed against real data and the results recorded honestly, pass or fail"
    requirement: INCOME-01
    verification:
      - kind: integration
        ref: "pnpm vitest run (579/579) && pnpm tsc --noEmit (clean) && pnpm intel prescreen-eval --start 2026-07-22 --end 2026-07-26 (0.6960, below >=0.85 bar) && pnpm dev strategy backtest (11-06's real 2026-08-15->08-19 run: combined Sharpe -5.01 FAIL, MaxDD -1.7% PASS) && pnpm dev strategy run --date 2026-08-28 (5 ranked CATALYST_ANCHORED, 3 sub-threshold, 12 FADE shadow, SENTIMENT_VELOCITY gated, SECTOR_ROTATION_FROM_PM zero signals on a quiet PM day)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Operator adjudicates the honest numbers (backtest FAIL, pre-screen miss) and the two open calibration questions (0.4 floor, VIX 15/25 boundaries), and decides whether the phase closes"
    requirement: INCOME-01
    verification:
      - kind: manual_procedural
        ref: "Operator checkpoint (Task 3), approved 2026-08-28: 'Approved — close the phase.' Evidence accepted as documented gaps; calibration kept as-is pending a real week of live data."
        status: pass
    human_judgment: true
    rationale: "Deciding whether a FAIL on a thin-sample live-window backtest and a below-bar pre-screen retention are shippable gaps versus phase-blocking failures is an operator risk/trust judgment call, not something a test can decide — exactly what the plan's blocking checkpoint exists for."

# Metrics
duration: ~1h40min (Tasks 1-2 implementation + Task 3 checkpoint review + operator round-trip)
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 08: Phase Close-Out — Worked Example, Acceptance Gate, Operator Sign-Off Summary

**The canonical Iran-family PM signal -> XLE -> accept -> close loop is now a deterministic regression test, the phase's real acceptance numbers (579/579 tests, backtest FAIL on a thin 1-trade sample, pre-screen retention 0.696) are recorded honestly, and the operator approved closing Phase 11 (M2-05) with those numbers as documented gaps rather than blockers.**

## Performance

- **Duration:** ~1h40min (Tasks 1-2 implementation + Task 3 checkpoint review + operator round-trip)
- **Started:** 2026-08-28 (Wave 5, after 11-06/11-07 closed in Wave 4)
- **Completed:** 2026-08-28
- **Tasks:** 3 (1 tracer/tdd + 1 auto + 1 checkpoint:human-verify, blocking)
- **Files modified:** 3 (1 created, 2 modified) across 2 pre-checkpoint commits, plus this SUMMARY and STATE/ROADMAP/VALIDATION close-out

## Accomplishments

- **Task 1 — the canonical worked example.** `src/strategy/__tests__/worked-example.test.ts` (334 lines) walks the entire operator loop in one narrative test: an `fs.mkdtemp`-scoped fixture carrying the live `config/pm-market-mappings.json` `will-the-us-invade-iran-by-dec-31-2026` rule (yesPp, XLE weight 1.0, direction long, `movePp: 12`) against the real 36-ticker substrate universe produces exactly one ranked `SECTOR_ROTATION_FROM_PM` XLE candidate; its score is asserted to the literal `0.9001471422376973` with the D-03 formula's arithmetic shown in a comment (`ppNorm × volNorm`, `ppNorm` capped at 1); `suggestedStop < suggestedEntry < suggestedTarget` holds for the long direction; an operator entry override persists separately from the engine's own suggestion; a profitable manual close writes a positive `closeRealizedPnlUsd` and a `closeRealizedPnlPct` consistent with the operator's entry; `readDedupedByCandidateId` returns exactly one reconciled record carrying the close fields; and the fixture's other 35 universe tickers produce no candidate. Deterministic VIX/market-data stubs keep every assertion a literal, never a range. Committed `55255df`.
- **Task 2 — the acceptance gate, run for real.** `.planning/phases/11-ai-strategy/11-VALIDATION.md`'s per-task map, Wave 0 checklist, and sign-off checklist were filled in from this session's real evidence: full suite 579/579 (was 380/380 at seed time), `tsc --noEmit` clean, pre-screen retention re-confirmed at `0.6960` (unchanged shortfall against the `>=0.85` bar — same finding as 11-01's own held-out run), and 11-06's real live-window backtest result (`combined Sharpe -5.01`, `MaxDD -1.7%`, 1 closed trade) carried forward as the acceptance evidence after this session's own two attempts at the full-default-window re-run (the literal default window, then a widened `--start 2026-08-15 --end 2026-08-26`) were both interrupted by confirmed, live Yahoo Finance rate-limiting (`curl -sI https://query1.finance.yahoo.com` -> `HTTP/2 429`, reproducing 11-06's own documented finding at these call volumes). `nyquist_compliant` left `false` on purpose — 3 rows (`11-01-02`, `11-06-02`, `11-08-02`) are `⚠️ flaky`, meaning their automated command runs correctly and honestly reports a number below its own stated bar, not that the automation itself is broken. Committed `2e582e2`.
- **Task 3 — the operator checkpoint.** Presented the full acceptance transcript, `docs/M2-05_BACKTEST_GAP.md`'s structural per-regime-gap writeup, and a live `pnpm dev strategy run --date 2026-08-28` (VIX 14.51, calm) showing 5 ranked `CATALYST_ANCHORED` candidates (NVDA 1.00, LMT 0.90, MSFT 0.90, AAPL 0.80, GOOGL 0.72, $1,875 each), 3 sub-threshold at 0.64 (cap-limited, above the 0.4 floor), 12 `FADE_OVERSHOOT` shadow entries unsized, `SENTIMENT_VELOCITY` gated with its stated coverage reason, and `SECTOR_ROTATION_FROM_PM` producing zero signals (a quiet Polymarket day — it fired on 08-26). The operator approved closing the phase with all three findings recorded as documented gaps, kept the 0.4 floor and VIX 15/25 boundaries unchanged pending more live data, and gave the verbatim verdict **"Approved — close the phase."**

## Task Commits

Each task was committed atomically:

1. **Task 1: The canonical worked example — Iran ceasefire to a closed XLE trade** — `55255df` (test)
2. **Task 2: Run the acceptance gate for real and complete the validation map** — `2e582e2` (docs)
3. **Task 3: Operator accepts the phase and its honest numbers** — checkpoint:human-verify, **APPROVED** 2026-08-28 (no direct commit; produced the operator decisions recorded below)

**Plan metadata:** this commit (docs: complete plan)

## Acceptance Transcript

### Full suite and typecheck (re-confirmed at SUMMARY time, post-approval)

```
pnpm vitest run   -> 50 files, 579 passed (579)
pnpm tsc --noEmit -> clean (no output)
```

### Live-window backtest (D-15 acceptance gate)

The literal full-default-window `pnpm dev strategy backtest` re-run (this session, both the plain default window and a widened `--start 2026-08-15 --end 2026-08-26`) could not complete: live Yahoo Finance rate-limiting was independently re-confirmed (`curl -sI https://query1.finance.yahoo.com` / `query2.finance.yahoo.com` -> `HTTP/2 429`), reproducing the identical multi-minute per-ticker stall `deferred-items.md` item 2 and `docs/M2-05_BACKTEST_GAP.md` already documented from 11-06. Per the operator's decision, 11-06's real, complete 2026-08-15 -> 08-19 result is the acceptance-gate evidence carried into this checkpoint:

| Signal type | Usable range | Candidates | Trades | Sharpe | MaxDD | Win rate |
|---|---|---|---|---|---|---|
| CATALYST_ANCHORED | 2026-08-15 -> 2026-08-19 | 40 | 1 | -5.01 | -1.7% | 0.0% (thin-sample) |
| SENTIMENT_VELOCITY | gated, no coverage in August | 0 | 0 | 0.00 | 0.0% | — |
| SECTOR_ROTATION_FROM_PM | 2026-08-15 -> 2026-08-19 | 15 | 0 (open at window end) | -7.10 | -3.4% | — (thin-sample) |
| FADE_OVERSHOOT | 2026-08-15 -> 2026-08-19 | 57 | 0 | — | — | shadow-only |
| **Combined** | 2026-08-15 -> 2026-08-19 | 97 | **1** | **-5.01** | **-1.7%** | 0.0% (thin-sample) |

**Verdict against D-15's thresholds:** Combined Sharpe > 0 -> **FAIL** (-5.01). Combined MaxDD < 25% -> **PASS** (-1.7%). **Overall: FAIL**, on exactly one real closed trade over a 5-trading-day sample. See `docs/M2-05_BACKTEST_GAP.md` §4 for the full context.

### Pre-screen retention (D-16)

```
pnpm intel prescreen-eval --start 2026-07-22 --end 2026-07-26
-> retention: 0.6960 (bar: >= 0.85) — unchanged shortfall vs 11-01-SUMMARY.md's original finding
```

### Live strategy run (2026-08-28, VIX 14.51, calm regime)

```
pnpm dev strategy run --date 2026-08-28
```

- **Ranked (5, all core type):** CATALYST_ANCHORED — NVDA 1.00, LMT 0.90, MSFT 0.90, AAPL 0.80, GOOGL 0.72, all sized $1,875 (calm-regime sizing on the $7,500 assumed equity).
- **Sub-threshold (3):** score 0.64, cap-limited (above the 0.4 floor, excluded only by the top-5 cap).
- **Shadow (12):** all FADE_OVERSHOOT, unsized by design (D-04/T-11-04-04 — shadow mode never imports from `sizing.ts`).
- **Gated:** SENTIMENT_VELOCITY, with its coverage-gap reason printed verbatim.
- **Zero signals:** SECTOR_ROTATION_FROM_PM — a quiet Polymarket day; it fired on 2026-08-26.

All three v1 modes (ranked/sized core, gated-with-reason, unsized shadow) are observable in this single output, satisfying the plan's success criterion 4.

## Operator Decisions (2026-08-28, verbatim intent)

1. **Evidence accepted as documented gaps, not blockers.** The thin live-window backtest FAIL (1 closed trade, external Yahoo 429 rate-limiting blocking the full re-run this session and 11-06's session before it), the pre-screen retention shortfall (0.696 vs 0.85, a feature-space ceiling ~0.86 per 11-01's own finding, not a regression), and today's single-core-type live run (a quiet Polymarket day, not a bug) were all reviewed and accepted as honestly-labelled, tracked gaps.
2. **Calibration kept as-is.** The 0.4 score floor and VIX 15/25 regime boundaries are unchanged — two VIX readings (14.51, 15.45) and two accepted decisions is insufficient evidence to recalibrate responsibly. Revisit after a real week of live trading data.
3. **Phase closed.** Verbatim: **"Approved — close the phase."**

## Follow-ups (not part of this plan, not implemented here)

1. Drain the score backlog (`pnpm intel backlog-drain`) to unblock `SENTIMENT_VELOCITY`/`FADE_OVERSHOOT` input coverage.
2. Build a Yahoo rate-limit-aware historical fetcher so `strategy backtest` can complete the full default window (`deferred-items.md` item 2).
3. Pre-screen v2 — either a learned model or a re-set bar; tracked as an `unmet-truth` entry in `.planning/WINDOWS.md` (see below).
4. The after-tax/after-fees target hurdle, locked in `11-CONTEXT.md` (commits `9f57408`, `b5404ca`), to be planned as gap plan **11-09** immediately after this phase's verification.
5. Operator to confirm the 8 FOMC seed dates in `config/fomc-schedule-seed.json` against federalreserve.gov.
6. `MarketDataService` logs the Finnhub API key in a fallback error path (`deferred-items.md` item 1) — a small hardening pass.

## Files Created/Modified

- `src/strategy/__tests__/worked-example.test.ts` — the canonical Iran-family PM signal -> XLE -> accept -> close narrative regression test (new, 334 lines)
- `.planning/phases/11-ai-strategy/11-VALIDATION.md` — per-task map, Wave 0, sign-off checklist populated from real evidence; approval line updated with the operator's verdict
- `.planning/STATE.md` — M2-05 marked execution-complete (8/8 plans), session history, decisions
- `.planning/ROADMAP.md` — M2-05 plan checklist and status line updated

## Decisions Made

See "Operator Decisions" above — the phase's only decisions this plan produced were the operator's three checkpoint adjudications; no architectural or implementation decisions were made by the executor.

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as written; both commits landed clean on first pass with no auto-fixes. The checkpoint (Task 3) surfaced no bugs requiring a fix (unlike 11-07's checkpoint) — it was purely an adjudication of already-honest, already-recorded numbers.

## Issues Encountered

- This session's attempt to re-run the full-default-window backtest (twice: the literal default window, then a widened `--start 2026-08-15 --end 2026-08-26`) reproduced the same live Yahoo Finance 429 rate-limiting 11-06 had already documented, at the same call volumes. Neither attempt completed; both were stopped rather than left running indefinitely. `curl -sI https://query1.finance.yahoo.com` and `query2.finance.yahoo.com` both independently confirmed `HTTP/2 429` at the start of this task. 11-06's own complete 2026-08-15 -> 08-19 run stands as the acceptance-gate evidence, as anticipated in `docs/M2-05_BACKTEST_GAP.md`'s own text.

## Known Stubs

None introduced by this plan.

## User Setup Required

None — no new external service configuration, no new packages installed.

## Broken-Windows Ledger

Per issue #1950, the honestly-reported acceptance-gate misses from this plan are recorded in `.planning/WINDOWS.md` as `unmet-truth` entries (attempted via `gsd_run query windows append`; if the ledger command is unavailable this run, the misses remain fully documented above and in `11-VALIDATION.md`'s Status column regardless):

- Live-window backtest combined Sharpe -5.01 vs the D-15 `>0` bar (thin-sample, 1 closed trade) — `docs/M2-05_BACKTEST_GAP.md` §4.
- Article-intake pre-screen retention 0.6960 vs the D-16 `>=0.85` bar — `11-01-SUMMARY.md`, re-confirmed unchanged this session.

## Next Phase Readiness

- **Phase 11 (M2-05) is execution-complete: 8/8 plans done, operator-approved.** `/gsd-verify-work` and `/gsd-audit-milestone` (or the equivalent verifier flow) are the next gate, not further execution.
- Gap plan **11-09** (after-tax/after-fees target hurdle) is queued immediately after phase verification per the operator's own request, captured in `11-CONTEXT.md`.
- M2-06 (Hard Risk Management) depends on M2-05's strategy output existing to gate — that dependency is now satisfied, with the caveat that the live-window backtest is an interim, not per-regime, acceptance bar (see `docs/M2-05_BACKTEST_GAP.md` for the two unlock paths, neither scheduled).
- The 0.4 score floor and VIX 15/25 boundaries are explicitly flagged as pending recalibration once a real week of live 2026 data exists — future phases should not treat them as final-tuned constants.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*

## Self-Check: PASSED

`src/strategy/__tests__/worked-example.test.ts` — FOUND on disk.
`.planning/phases/11-ai-strategy/11-VALIDATION.md` — FOUND on disk, updated.
Commit `55255df` — FOUND in `git log --oneline --all`.
Commit `2e582e2` — FOUND in `git log --oneline --all`.
`pnpm vitest run` — 579/579 green (re-confirmed at SUMMARY time). `pnpm tsc --noEmit` — clean.
