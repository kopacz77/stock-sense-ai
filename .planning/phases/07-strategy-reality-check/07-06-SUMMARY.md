---
phase: 07-strategy-reality-check
plan: 06
subsystem: backtesting
tags: [recommendation, verdict, aggregation, momentum, mean-reversion, m2-01, regime-segmentation]

# Dependency graph
requires:
  - phase: 07-strategy-reality-check
    provides: "Plan 05 results.jsonl (1050 backtests, 35 tickers x 2 strategies x 15 params, full + per-regime metrics)"
  - phase: 07-strategy-reality-check
    provides: "Plan 03 prefetch report (data-quality caveats for RECOMMENDATION.md narrative)"
  - phase: 07-strategy-reality-check
    provides: "07-CONTEXT.md locked KEEP/MODIFY/DISCARD thresholds + regime definitions"
provides:
  - "scripts/m201-build-recommendation.ts — reusable generator that re-creates RECOMMENDATION.md from any results.jsonl"
  - ".planning/phases/07-strategy-reality-check/RECOMMENDATION.md — M2-01 final deliverable: per-strategy KEEP/MODIFY/DISCARD verdict with evidence tables + narrative + downstream implications"
  - "Empirical finding: MomentumStrategy ignores shortMA parameter (invariance detected via sweep)"
  - "Strategy-level path forward for M2-04 / M2-05 (both DISCARD → design fresh signals, prioritize catalyst-driven entries)"
affects:
  - "M2-04 LLM Trade-Signal Layer (informs scope: LLM is doing useful work regardless of technical verdict)"
  - "M2-05 AI-Augmented Strategy Engine (verdict expands phase scope: fresh signal design needed BEFORE AI layering)"
  - "Any future strategy work — sweeping these two strategies' parameters further is wasted effort per the recommendation"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-record + per-aggregate verdict logic with single judgeRegimes() source of truth"
    - "Math.abs(maxDrawdown) at every threshold comparison (RESEARCH pitfall #8 mitigation)"
    - "Sensitivity analysis with invariance detection (max-min Sharpe spread < 0.01) — surfaces strategy bugs as a side-effect of sweeping"
    - "Aggregate verdict uses universe-median Sharpe/|MaxDD| (not all-tickers-must-pass) — matches CONTEXT.md intent of 'does the strategy have edge'"

key-files:
  created:
    - "scripts/m201-build-recommendation.ts (~700 lines)"
    - ".planning/phases/07-strategy-reality-check/RECOMMENDATION.md (214 lines)"
  modified: []

key-decisions:
  - "MomentumStrategy verdict: DISCARD. Best config (shortMA=10, longMA=75, minConfidence=65) has 0/35 tickers passing all 3 regimes, bear Sharpe -0.70, high-vol Sharpe only +0.12. No param sweep saves it."
  - "MeanReversionStrategy verdict: DISCARD. Best config (rsiOversold=20, rsiOverbought=70) has 1/35 KEEP (LLY, likely sample noise), bear Sharpe -0.35, high-vol |MaxDD| 32.8% — fails on drawdown control in the operator's edge regime."
  - "Strategy-level aggregation: best-config = highest KEEP-count across universe with tiebreak by median bull Sharpe. Aggregate verdict from universe-median Sharpe/|MaxDD| at that config. This matches CONTEXT.md intent of 'does the strategy have edge across the median ticker' (more permissive than per-ticker bar)."
  - "Surfaced engine finding: MomentumStrategy ignores shortMA — sweeping 5 values produces byte-identical Sharpe on every ticker. The parameter is in the options interface but not consumed by indicator computation. Effective dimensionality of grid is 1, not 2. Flagged in RECOMMENDATION 'Engine / Strategy Findings' section."
  - "Recommended M2-05 path: Option 1 (design fresh signals from scratch — catalyst-driven, vol-breakout, sector-rotation), reflecting operator's actual COVID-era discretionary edge. Both strategies DISCARD'd, so layering AI on broken signals is not the right shape."

patterns-established:
  - "RECOMMENDATION.md as the M2-01 deliverable format: TL;DR table + per-strategy section (verdict / best-config / evidence / top-bottom tickers / narrative) + sensitivity + data-quality + methodology + downstream implications"
  - "Generator script (vs hand-curated markdown): re-runnable from results.jsonl, every number is reproducible, narrative is data-driven not template-string-filled"
  - "Engine finding surfacing — when sweep results expose a structural problem (param invariance), document it inline rather than burying it in code comments"

# Metrics
duration: 9min
completed: 2026-05-30
---

# Phase 07 Plan 06: M2-01 Recommendation Summary

**Both MomentumStrategy and MeanReversionStrategy formally DISCARD'd via 1,050-backtest sweep aggregation: neither strategy survives the CONTEXT.md pass/fail bar at its best config; M2-05 path forward is fresh signal design (catalyst-driven), not AI layering on broken technicals.**

## Performance

- **Duration:** ~9 min (script dev + verification + RECOMMENDATION inspection + 2 narrative-tightening iterations)
- **Started:** 2026-05-31T03:01:18Z
- **Completed:** 2026-05-31T03:09:36Z
- **Tasks:** 1/1
- **Files created:** 2 (generator script + RECOMMENDATION.md)

## Accomplishments

- Built `scripts/m201-build-recommendation.ts` (~700 lines): reads `results.jsonl`, applies per-record + per-aggregate KEEP/MODIFY/DISCARD logic from 07-CONTEXT.md with all `Math.abs(maxDrawdown)` sign-flip mitigations (pitfall #8) and `<10 trades/year` buy-and-hold-proxy flags (pitfall #6), and writes the final markdown deliverable
- Produced `RECOMMENDATION.md` (214 lines) with: TL;DR table, per-strategy section (verdict + best-config + evidence-table + top-5/bottom-5 tickers + KEEP-list-by-sector + 4-paragraph narrative), parameter sensitivity with invariance detection, engine/strategy findings, data-quality caveats from Plan 03 prefetch report, methodology section documenting full pipeline, and downstream implications for M2-04/M2-05
- Caught a real engine finding as a side-effect of the sensitivity analysis: **MomentumStrategy ignores `shortMA` entirely** — sweeping 5 values produces byte-identical Sharpe per ticker, meaning the parameter is exposed in the strategy options interface but never consumed by the indicator computation. Surfaced in `RECOMMENDATION.md` `Engine / Strategy Findings` section so it doesn't get lost
- Final verdicts: **MomentumStrategy = DISCARD** (0/35 tickers KEEP, bear Sharpe -0.70 invariant to params, high-vol Sharpe only +0.12), **MeanReversionStrategy = DISCARD** (1/35 KEEP — LLY, almost certainly sample noise; bear Sharpe -0.35, high-vol |MaxDD| 32.8%)
- M2-05 path forward documented: design fresh signals from scratch (catalyst-driven entries, volatility-breakout, sector-rotation) reflecting operator's actual COVID-era discretionary edge, rather than AI-layering on top of broken mechanical signals

## Task Commits

Each task was committed atomically:

1. **Task 1: m201 recommendation generator + RECOMMENDATION.md** — `9d8c78a` (feat)

**Plan metadata commit:** added after STATE.md update.

## Files Created/Modified

- `scripts/m201-build-recommendation.ts` — Reads JSONL, groups by `(strategy|JSON.stringify(params))`, computes per-aggregate medians of Sharpe / `Math.abs(maxDrawdown)` / win-rate / trades-per-year, applies single-source-of-truth `judgeRegimes()` per record AND per aggregate, picks best config per strategy via `keepCount → bull Sharpe` tiebreak, builds evidence tables + top/bottom ticker lists + KEEP-by-sector lists + data-driven narrative (not template-string-filled) + sensitivity analysis with invariance detection, parses the Plan 03 prefetch report's Summary section verbatim, and writes the full markdown document. ~700 lines.
- `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` — Final M2-01 deliverable. 214 lines.

## Verification

- `pnpm build` clean (TypeScript strict + `noUncheckedIndexedAccess` happy with the new script)
- Script runs end-to-end: `1050 successful records, 0 errored, 0 malformed, 30 unique (strategy x params) combinations` → writes 214-line RECOMMENDATION.md in <2s
- All required RECOMMENDATION.md sections present and verified via grep (`## TL;DR`, `## MomentumStrategy`, `## MeanReversionStrategy`, `## Parameter Sensitivity`, `## Data-Quality Caveats`, `## Methodology`, `## Downstream Implications`)
- Cross-checked verdict logic with NVDA momentum (shortMA=10, minConfidence=55):
  - bull Sharpe 1.52 but |DD| 26.8% → bull regime fails (DD bar)
  - bear Sharpe -0.91 |DD| 37.6% → bear regime fails (both Sharpe AND DD)
  - hv Sharpe 0.91 |DD| 31.2% → hv regime fails (DD bar)
  - anyDDover35=true (bear |DD|=37.6%) → DISCARD verdict matches script output ✓
- Headline-data sanity check from execution context: aggregate bull Sharpe +0.62, bear -0.43, highVol +0.16 across all 1,050 — matches script's computed values byte-for-byte
- LLY mean-reversion (rsiOversold=40, rsiOverbought=70) confirmed as the best single backtest: Sharpe 1.077, return +442.6%, |MaxDD| 21.15% — surfaces in TL;DR

## Decisions Made

See `key-decisions` in frontmatter. The five substantive ones:

1. **MomentumStrategy verdict: DISCARD.** Best config (shortMA=10, longMA=75, minConfidence=65) has 0/35 KEEPs. Universe-median bull Sharpe +0.62 (passes) but bear Sharpe -0.70 (fails) and high-vol Sharpe +0.12 (fails). No parameter combination from the sweep changes this — the strategy fundamentally doesn't work in bear or high-vol regimes.

2. **MeanReversionStrategy verdict: DISCARD.** Best config (rsiOversold=20, rsiOverbought=70) has 1/35 KEEP (LLY — the operator's only mean-reversion survivor). Universe-median bull Sharpe +0.81 (passes) but bear Sharpe -0.35 (fails) and high-vol |MaxDD| 32.8% (fails — drawdown bar). At 1/35 the "survivor" is sample noise, not a sector pattern.

3. **Strategy-level aggregation method.** Per-record verdicts use the strict CONTEXT.md bar (all 3 regimes pass). Strategy-level verdict uses universe-median metrics at the best config — more permissive bar matching the "does the strategy have edge" intent. Both strategies still DISCARD at the more permissive bar, which is the strongest possible signal (if even the median ticker can't pass at the best-config, individual tickers won't recover the result).

4. **Engine finding: MomentumStrategy ignores shortMA.** Discovered while building the param-sensitivity section — 5 values × 35 tickers × 3 minConfidence levels = 525 backtests with byte-identical Sharpe within each (ticker, minConfidence) tuple as shortMA varies. The param is in the options interface but not consumed by the indicator computation. Doesn't change the verdict (the verdict is bad regardless) but documents reality: the sweep's effective dimensionality is 1, not 2. Plan 06 surfaces this in a dedicated "Engine / Strategy Findings" section so it doesn't get buried.

5. **Recommended M2-05 path: Option 1 (fresh signal design).** Both DISCARDs → AI-layering on broken signals has nothing to amplify. Operator's actual COVID-era discretionary edge was catalyst-driven (FDA approvals, lockdown winners, vaccine news, Fed action), not MA-crossover-driven. M2-05 should design new signals reflecting that pattern; M2-04 (LLM news/event layer) is doing useful work regardless of this verdict — its output becomes input to M2-05 rather than overlay-on-top-of-M2-01.

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed end-to-end as written. Two minor narrative-quality iterations (not deviations):
1. Initial pass had "encouraging signal" phrasing fire on bare-positive Sharpe (0.12, 0.01) — tightened the threshold so "marginal" and "fails" cases get appropriate phrasing rather than overclaiming.
2. Initial pass had param-sensitivity using KEEP-count alone, which was flat-zero everywhere for momentum — added median bull Sharpe as a second source so the table has actual signal, and added invariance detection that caught the shortMA finding.

Both iterations were within-scope refinement of the same script, not unplanned work.

### Method Notes (not bug fixes)

- **CSV equity curves**: CONTEXT.md flagged these as nice-to-have and Plan 06 marked them as "skip if >30 min". Not produced — `results.jsonl` is the authoritative downstream input and the operator can pivot the JSONL for any equity-curve analysis. Saves complexity, no information loss.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan was executed as written. Two narrative-quality refinements within the same task scope.

## Issues Encountered

None.

## User Setup Required

None — fully autonomous.

## Next Phase Readiness

**M2-01 phase is complete.** Final deliverable produced. All 6 plans (07-01..07-06) executed end-to-end with 100% success rate.

**For M2-04 (LLM Trade-Signal Layer):**
- Charter unchanged — the LLM news/event layer is valuable regardless of whether the technical strategies passed. The DISCARD verdict actually strengthens the case for M2-04: with no working technical baseline, LLM-derived catalyst signals are doing more of the load-bearing work.
- Existing M2-03 alerts (Iran peace / BTC threshold divergence) are the right shape — they confirm catalyst-driven signals can be sourced and surfaced. M2-04 builds out per-ticker mapping + theme tagging + conviction-weighted alerts on top of M2-03.

**For M2-05 (AI-Augmented Strategy Engine):**
- **Phase scope grows materially.** Previous assumption was "layer AI on top of MomentumStrategy + MeanReversionStrategy". With both DISCARD'd, M2-05 needs to design fresh signals first.
- Recommended approach (per RECOMMENDATION.md downstream section): catalyst-driven entries (earnings, FDA, Fed-action events from M2-04), volatility-breakout entries (real-time vol regime detection), sector-rotation rules (rotate into sectors where M2-04 catalyst flow is densest).
- M2-05 should consume M2-04 output as primary signal, not as filter.

**Carry-over for STATE.md:**
- M2-01 phase complete; both strategies DISCARD; M2-05 scope expansion documented.
- The engine-fix work from Plan 05 (SimpleBacktestEngine history-to-date, StrategyAdapter newest-first contract, 300-bar history cap) remains in `src/` as a permanent improvement — any future SimpleBacktestEngine + StrategyAdapter usage now produces correct results at a reasonable performance budget.
- MomentumStrategy `shortMA` is an exposed-but-ignored param. If M2-05 borrows from MomentumStrategy's structure, this is a bug worth fixing first (or just not relying on `shortMA` exposure). Tracked in RECOMMENDATION.md but not auto-fixed (out of scope for Plan 06).

**RECOMMENDATION.md path:** `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md`

---
*Phase: 07-strategy-reality-check*
*Completed: 2026-05-30*
