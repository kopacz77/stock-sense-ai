---
phase: 11
slug: ai-strategy
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
- **Before `/gsd-verify-work`:** Full suite green **and** `pnpm intel strategy backtest` (live-window gate) completes without throwing **and** the E3 gap write-up exists
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-XX-XX | TBD | B | INCOME-01 (ext) — CATALYST_ANCHORED scoring | — | N/A | unit | `pnpm vitest run src/strategy/signals/__tests__/catalyst-anchored.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | B | INCOME-01 (ext) — SECTOR_ROTATION_FROM_PM scoring | — | N/A | unit | `pnpm vitest run src/strategy/signals/__tests__/sector-rotation.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | B | INCOME-01 (ext) — SENTIMENT_VELOCITY scoring (gated on scored-day coverage) | — | N/A | unit | `pnpm vitest run src/strategy/signals/__tests__/sentiment-velocity.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | B | INCOME-01 (ext) — FADE_OVERSHOOT scoring (shadow mode, never ranked) | — | N/A | unit | `pnpm vitest run src/strategy/signals/__tests__/fade-overshoot.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | C | INCOME-01 (ext) — cross-type ranking: top-5, 0.4 floor, sub-threshold-3, same-ticker dedup | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/strategy-engine.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | B/C | INCOME-01 (ext) — VIX-regime sizing | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/sizing.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | B/C | INCOME-01 (ext) — entry/target/stop math | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/levels.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | C | INCOME-01 (ext) — decision log append/dedup/reconcile | — | N/A | unit | `pnpm vitest run src/strategy/__tests__/decision-log.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | D | INCOME-01 (ext) — CLI surface | — | N/A | integration | `pnpm vitest run src/strategy/cli/__tests__/strategy-commands.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | E | INCOME-01 (ext) — live-window backtest gate (2026 window, labelled interim) | — | N/A | integration | `pnpm vitest run src/strategy/backtest/__tests__/live-window-runner.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | A/pre | Article-intake pre-screen: top-50% by rank retains ≥ 85% of high-materiality articles on a held-out June–July week | — | N/A | integration (offline, data/intel fixtures) | `pnpm vitest run src/market-intelligence/signal/__tests__/materiality-prescreen.test.ts` | ❌ W0 | ⬜ pending |
| 11-XX-XX | TBD | G | INCOME-01 (ext) — worked example end-to-end | — | N/A | integration | `pnpm vitest run src/strategy/__tests__/worked-example.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/strategy/` — greenfield module; all test files above are created by their tasks
- [ ] `config/strategy-config.json` — `assumedEquity` default (planner's discretion)
- [ ] No framework install needed — vitest already configured project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Web dashboard `/strategy` route renders today's candidates | INCOME-01 (ext) | visual | `pnpm dev dashboard --port 3001`, open `/strategy`, confirm top-5 + sub-threshold-3 + shadow section |
| Operator confirms `config/fomc-schedule-seed.json` 2026 dates against federalreserve.gov | CATALYST_ANCHORED input quality | external source | compare the 8 statement days to the Fed's published calendar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
