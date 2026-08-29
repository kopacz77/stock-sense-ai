---
phase: 11
slug: ai-strategy
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-27
---

# Phase 11 (M2-05) — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `11-RESEARCH.md` § Validation Architecture (2026-08-27). Task IDs are filled in by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project-wide, `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run src/strategy` |
| **Full suite command** | `pnpm vitest run` (380/380 green at seed time) + `pnpm tsc --noEmit` |
| **Estimated runtime** | ~60 seconds full suite; < 10 s scoped |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/strategy && pnpm tsc --noEmit`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite green **and** `pnpm dev strategy backtest` (live-window gate) completes without throwing **and** the E3 gap write-up (`docs/M2-05_BACKTEST_GAP.md`) exists
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Wave column now carries the real numeric execution wave assigned at plan time (the seed used the RESEARCH §10 letters A–G; the mapping is A/B → 1–2, C → 3, D/E/F → 3–4, G → 5).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 11-01 | 1 | INCOME-01 (ext) — article-intake pre-screen ranking is pure and correctly ordered | T-11-01-01 | no RegExp built from article text; no shell interpolation | unit | `pnpm vitest run src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts` | ✅ | ✅ green |
| 11-01-02 | 11-01 | 1 | Article-intake pre-screen: top-50% by rank retains ≥ 85% of high-materiality articles on the held-out 2026-07-22 → 07-26 week | T-11-01-03 | `--emit-fixture` path confined to the repo root | integration (offline, committed held-out fixture) | `pnpm vitest run src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts` | ✅ | ⚠️ flaky |
| 11-01-03 | 11-01 | 1 | Scheduler admits past the 500/day soft cap only at or above `PRESCREEN_HARD_ADMIT` | T-11-01-02 | keyword stuffing cannot breach the daily cap | unit | `pnpm vitest run src/market-intelligence/scheduler/__tests__/cycle-runner-prescreen.test.ts` | ✅ | ✅ green |
| 11-02-01 | 11-02 | 1 | INCOME-01 (ext) — end-to-end tracer: PM signal → ranked, sized candidate → decision log | T-11-02-03, T-11-02-04 | collision-free `candidateId`; VIX fallback never `calm` | integration | `pnpm vitest run src/strategy/__tests__/tracer-e2e.test.ts` | ✅ | ✅ green |
| 11-02-01 | 11-02 | 1 | INCOME-01 (ext) — SECTOR_ROTATION_FROM_PM scoring | — | N/A | unit | `pnpm vitest run src/strategy/signals/__tests__/sector-rotation.test.ts` | ✅ | ✅ green |
| 11-02-02 | 11-02 | 1 | INCOME-01 (ext) — entry/target/stop math (per-type ATR tables + Pitfall-5 clamps) | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/levels.test.ts` | ✅ | ✅ green |
| 11-02-02 | 11-02 | 1 | INCOME-01 (ext) — VIX-regime sizing (25/12.5/6.25%, FADE 50% modifier, max 4 positions) | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/sizing.test.ts` | ✅ | ✅ green |
| 11-02-03 | 11-02 | 1 | INCOME-01 (ext) — decision log append/dedup/reconcile + realized-close P&L | T-11-02-01, T-11-02-07 | numeric CLI overrides validated; append-only writes | unit | `pnpm vitest run src/strategy/__tests__/decision-log.test.ts` | ✅ | ✅ green |
| 11-03-01 | 11-03 | 2 | Shared catalyst loader: dedup-by-id-take-latest, malformed-line tolerance, date windows | T-11-03-01, T-11-03-03 | malformed JSONL skipped, not thrown on | unit | `pnpm vitest run src/market-intelligence/signal/__tests__/catalyst-loader.test.ts` | ✅ | ✅ green |
| 11-03-02 | 11-03 | 2 | INCOME-01 (ext) — CATALYST_ANCHORED scoring, direction mapping, binary split | T-11-03-02 | uncertain emits nothing; binary halved per leg | unit | `pnpm vitest run src/strategy/signals/__tests__/catalyst-anchored.test.ts` | ✅ | ✅ green |
| 11-03-03 | 11-03 | 2 | CATALYST_ANCHORED covers BOTH scheduled macro prints and LLM-emergent catalysts (D-17) | T-11-03-02 | provenance (`calendar:` vs `article:`) named in every rationale | integration (live `data/intel`) | `pnpm vitest run src/strategy/signals/__tests__/catalyst-anchored.test.ts` | ✅ | ✅ green |
| 11-04-01 | 11-04 | 2 | Scored-day coverage gate detects the real 2026-07-27 → 08-27 outage window | T-11-04-01 | data hole announces itself; no silent zero-delta | integration (live `data/intel`) | `pnpm vitest run src/strategy/__tests__/coverage.test.ts` | ✅ | ✅ green |
| 11-04-02 | 11-04 | 2 | INCOME-01 (ext) — SENTIMENT_VELOCITY scoring (gated on scored-day coverage) | T-11-04-01, T-11-04-02 | `totalMateriality: 0` prior rejected, not read as zero sentiment | unit | `pnpm vitest run src/strategy/signals/__tests__/sentiment-velocity.test.ts` | ✅ | ✅ green |
| 11-04-03 | 11-04 | 2 | INCOME-01 (ext) — FADE_OVERSHOOT scoring (shadow mode, never ranked, never sized) | T-11-04-03, T-11-04-04 | module imports nothing from `sizing.ts` | unit | `pnpm vitest run src/strategy/signals/__tests__/fade-overshoot.test.ts` | ✅ | ✅ green |
| 11-05-01 | 11-05 | 3 | INCOME-01 (ext) — core / gated / shadow modes honored end to end; module failure isolated | T-11-05-01, T-11-05-02, T-11-05-04 | shadow forced `suggestedSizeUsd: null`; config-vs-module mode drift throws | unit | `pnpm vitest run src/strategy/__tests__/strategy-engine.test.ts` | ✅ | ✅ green |
| 11-05-02 | 11-05 | 3 | INCOME-01 (ext) — cross-type ranking: top-5, 0.4 floor, sub-threshold-3, same-ticker dedup | T-11-05-01 | no per-type weight in the comparator | unit | `pnpm vitest run src/strategy/__tests__/strategy-engine.test.ts` | ✅ | ✅ green |
| 11-05-03 | 11-05 | 3 | INCOME-01 (ext) — CLI surface (all nine `strategy` subcommands) | T-11-05-03 | `--types` validated against the union; bad numerics exit 2 | integration | `pnpm vitest run src/strategy/cli/__tests__/strategy-commands.test.ts` | ✅ | ✅ green |
| 11-06-01 | 11-06 | 4 | INCOME-01 (ext) — live-window backtest gate (2026 window, labelled interim) | T-11-06-01, T-11-06-02, T-11-06-03 | drain-lock checked; bars sorted ascending; label constant | integration | `pnpm vitest run src/strategy/backtest/__tests__/live-window-runner.test.ts` | ✅ | ✅ green |
| 11-06-02 | 11-06 | 4 | INCOME-01 (ext) — `strategy backtest` reports per-core-type and combined vs D-15 thresholds | T-11-06-05 | thin-sample marker below 20 closed trades | integration (CLI, real substrate) | `pnpm dev strategy backtest --start 2026-08-01 --end 2026-08-20 --out /tmp/m2-05-backtest-smoke.json` | ✅ | ⚠️ flaky |
| 11-07-01 | 11-07 | 4 | `/api/strategy/*` endpoints validate input and inherit the existing auth posture | T-11-07-01, T-11-07-02 | Zod schemas; routes registered after the `/api` auth middleware | integration (curl, see plan acceptance criteria) | `pnpm tsc --noEmit && pnpm biome check src/` | ✅ | ⚠️ flaky |
| 11-08-01 | 11-08 | 5 | INCOME-01 (ext) — worked example end-to-end (Iran ceasefire → XLE → accept → close) | T-11-08-03 | deterministic stubs; hand-computed literal score | integration | `pnpm vitest run src/strategy/__tests__/worked-example.test.ts` | ✅ | ✅ green |
| 11-08-02 | 11-08 | 5 | Phase acceptance gate: full suite + live-window backtest + pre-screen retention re-confirmed | T-11-08-01, T-11-08-02 | numbers recorded with the interim label, tuned or not | integration (phase gate) | `pnpm vitest run && pnpm tsc --noEmit && pnpm biome check src/ && pnpm intel prescreen-eval --start 2026-07-22 --end 2026-07-26` | ✅ | ⚠️ flaky |

| 11-09-01 | 11-09 | 6 | INCOME-01 (ext) — net hurdle: fee/slippage break-even + after-tax reward÷pre-tax risk, both jurisdictions, cost demotion without re-targeting | T-11-09-02, T-11-09-03, T-11-09-04, T-11-09-08 | tax-profiles.json validated (no `__proto__`, no NaN/negative rates); `marginalRatePct` never guessed; demoted candidate keeps its target and score | unit | `pnpm vitest run src/strategy/__tests__/costs.test.ts src/strategy/__tests__/strategy-engine.test.ts` | ✅ | ✅ green |
| 11-09-02 | 11-09 | 6 | INCOME-01 (ext) — wash-sale / superficial-loss flag from the decision log (trailing 30 days, same ticker, closed at a loss) + `afterTaxRewardUsd` on accept | T-11-09-05, T-11-09-06 | decision log read once per run, not per candidate; accept never lost to a cost-config failure | unit | `pnpm vitest run src/strategy/__tests__/costs.test.ts src/strategy/__tests__/decision-log.test.ts` | ✅ | ✅ green |
| 11-09-03 | 11-09 | 6 | INCOME-01 (ext) — backtest reports gross AND after-cost (incl. tax + disallowed loss); net R:R on the API and the web card | T-11-09-01, T-11-09-07, T-11-09-SC | `redactCostEvaluation` allowlist keeps the operator's tax rate out of the HTTP response; zero new packages | integration | `pnpm vitest run src/strategy/backtest/__tests__/live-window-runner.test.ts src/web/__tests__/server-strategy-decision.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Status-column convention (11-08 clarification):** ✅ green means the row's automated command executes and (where the row asserts a numeric acceptance bar) the bar is met. ⚠️ flaky here does NOT mean intermittent — it means the automated command runs correctly and honestly reports a number that misses its own stated bar (11-01-02: pre-screen retention 0.6960 vs the ≥0.85 target, unchanged from 11-01's own finding; 11-06-02: combined Sharpe -5.01 vs the D-15 >0 target; 11-08-02: the literal chained command breaks at `pnpm biome check src/`, which is pre-existing project-wide lint debt outside every M2-05 plan's `files_modified` — `src/strategy/` itself is 0 errors). 11-07-01 is ⚠️ flaky for the same `biome check src/` reason (its own touched files — `src/web/server.ts` — carry pre-existing findings from before 11-07: `noUnusedVariables`, `noConsoleLog`, `noExplicitAny`; `pnpm tsc --noEmit` alone is clean). See `11-08-SUMMARY.md` for the full transcript and the operator's checkpoint adjudication of each miss.

**11-08-02's own full-default-window re-run:** attempted twice this session (the literal `pnpm dev strategy backtest` default 2026-05-31→today window, then a widened `--start 2026-08-15 --end 2026-08-26`); both were still in progress and were stopped after confirmed live Yahoo Finance rate-limiting (`curl -sI https://query1.finance.yahoo.com` → `HTTP/2 429`, verified again at the start of this task) reproduced the identical multi-minute per-ticker stall 11-06-SUMMARY.md already documented. Neither produced a completed report this session. `11-06-SUMMARY.md`'s own real, complete 2026-08-15→2026-08-19 result (combined Sharpe -5.01, MaxDD -1.7%, FAIL) is the acceptance-gate evidence carried into the 11-08-03 checkpoint. See `11-08-SUMMARY.md` for the full disclosure.

---

## Wave 0 Requirements

- [x] `src/strategy/` — greenfield module; all test files above are created by their tasks (first files land in task 11-02-01)
- [x] `config/strategy-config.json` — created in task 11-02-01 with `assumedEquity: 7500`, `scoreFloor: 0.4`, `maxCandidatesPerDay: 5`, `signalModes` (planner's discretion per CONTEXT) — confirmed on disk verbatim
- [x] `src/market-intelligence/signal/__tests__/fixtures/prescreen-holdout.jsonl` — emitted and committed in task 11-01-02 (1,154,259 bytes on disk)
- [x] `data/strategy/` — created on first write by task 11-02-01 (candidates-*.jsonl, decisions-*.jsonl, vix-cache.json all present, gitignored)
- [x] No framework install needed — vitest already configured project-wide; zero new npm packages in this phase (confirmed across every plan's own SUMMARY)

---

## Manual-Only Verifications

| Behavior | Requirement | Task | Why Manual | Test Instructions |
|----------|-------------|------|------------|-------------------|
| Web dashboard `/strategy` route renders today's candidates | INCOME-01 (ext) | 11-07-03 (`checkpoint:human-verify`, blocking) | visual | `pnpm dev strategy run --date <today>` then `pnpm dev:all`, open `/strategy`, confirm ranked + sub-threshold-3 + de-emphasised shadow section + skipped-type reasons, then accept with an edited entry and confirm the operator's number lands in `data/strategy/decisions-*.jsonl` — **DONE, approved 2026-08-28 (see 11-07-SUMMARY.md; two checkpoint-found bugs fixed before sign-off)** |
| Operator adjudicates the live-window backtest numbers and the two calibration questions (0.4 floor, VIX 15/25 boundaries) | INCOME-01 (ext) / D-15 | 11-08-03 (`checkpoint:human-verify`, blocking) | judgement | read `11-08-SUMMARY.md`'s recorded numbers and `docs/M2-05_BACKTEST_GAP.md`, run `pnpm dev strategy run`, answer both calibration questions — **APPROVED 2026-08-28. Backtest FAIL and pre-screen miss accepted as documented gaps, not blockers. 0.4 floor and VIX 15/25 boundaries kept as-is pending a real week of live data. Verbatim: "Approved — close the phase." See `11-08-SUMMARY.md`.** |
| Operator confirms `config/fomc-schedule-seed.json` 2026 dates against federalreserve.gov | CATALYST_ANCHORED input quality | 11-08-03 | external source | compare the 8 statement days to the Fed's published calendar — **DEFERRED as a standing follow-up (not yet independently confirmed by the operator); tracked in `11-08-SUMMARY.md`'s Follow-ups list, not blocking phase close** | **✅ confirmed 2026-08-28 (orchestrator web check against federalreserve.gov FOMC pages)**

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter — left `false` deliberately: 3 rows (11-01-02, 11-06-02, 11-08-02) are ⚠️ flaky, not ✅ green, because their own stated numeric bar is honestly unmet (pre-screen retention, live-window Sharpe). Per the plan's own instruction, `nyquist_compliant` is set `true` only when every row is green — that condition does not hold, so it stays `false` on purpose, not as an oversight.

**Approval:** ✅ Operator approved 2026-08-28 at the 11-08-03 checkpoint — "Approved — close the phase." Backtest FAIL and pre-screen retention miss accepted as documented gaps, not blockers; calibration (0.4 floor, VIX 15/25) kept as-is pending more live data. See `11-08-SUMMARY.md` for the full transcript and follow-ups. `nyquist_compliant` remains `false` per this document's own convention (3 rows honestly report a miss against their stated bar) — this reflects measurement honesty, not phase-close status.
