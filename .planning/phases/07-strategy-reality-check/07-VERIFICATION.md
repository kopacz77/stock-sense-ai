---
status: passed
phase: 07-strategy-reality-check
verified: 2026-05-30T23:17:00Z
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Read RECOMMENDATION.md narrative end-to-end and confirm the DISCARD verdict reads as actionable rather than as a planning artifact"
    expected: "The decision document should leave the operator clear-eyed about next steps (Option 1: fresh signal design before M2-05, per buildDownstream output)"
    why_human: "Verdict legitimacy is established by the evidence path; whether the narrative serves the operator's decision-making is a judgment call"
  - test: "Decide whether the shortMA wiring bug in MomentumStrategy gets a dedicated fix phase before M2-05, or stays as a documented research artifact"
    expected: "Phase decision — fix-and-rerun would not change the DISCARD verdict (per RECOMMENDATION.md 'Engine / Strategy Findings' note), but a future strategy redesign should not inherit the broken parameter contract"
    why_human: "Scope/sequencing call only the operator can make"
---

# Phase 7: M2-01 Strategy Reality Check — Verification Report

**Phase Goal:** Empirically determine whether `MomentumStrategy` and `MeanReversionStrategy` have positive expectancy across 2018-2025 (mix of bull/bear/high-vol regimes) on a representative US equity universe, after realistic costs. Produce KEEP/MODIFY/DISCARD recommendation per strategy backed by evidence.

**Verified:** 2026-05-30T23:17:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped from ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backtests run on 35 liquid tickers, daily bars 2018-01-01 → 2025-12-31 | VERIFIED | `results.jsonl` has 1050 records covering all 35 CONTEXT.md tickers (30 records each = 15 momentum + 15 mean-rev); prefetch report confirms 2010 bars/ticker spanning 2018-01-02 → 2025-12-30 (0.30% gap = NYSE calendar rounding, not data degradation); 35 cache files at `data/cache/historical/` totalling 14 MB |
| 2 | Realistic costs applied: $0 commission, 0.05% slippage per side, no leverage | VERIFIED | `scripts/m201-reality-check.ts:130-131` defines `SLIPPAGE_BPS = 5` and `COMMISSION_PER_TRADE = 0`; `:255-256` instantiates `FixedCommissionModel(0)` + `FixedBPSSlippageModel(5)`; no leverage or shorting hooks present; `INITIAL_CAPITAL = 100_000` per CONTEXT.md |
| 3 | Reports show separate metrics for bull / bear / high-vol regimes with locked windows | VERIFIED | `regime-segmenter.ts:86-101` defines `REGIMES` const matching CONTEXT.md windows exactly (bull = 2019/2020-H2/2023/2024, bear = 2018-Q4/2022, highVol = 2020-Q1/2025); every results.jsonl row has `regimeMetrics.{bull,bear,highVol}`; 12/12 vitest tests pass including the explicit "100k → 180k cross-window jump" test that proves Sharpe is not blown up by splicing artifacts |
| 4 | Pass-criterion outcome: KEEP OR formal rejection with documented evidence | VERIFIED | Both strategies formally DISCARDED in RECOMMENDATION.md with full evidence tables (per-regime medians + per-ticker tables for top/bottom 5 + sector breakdown). This is the second branch of SC-4 — the "formally rejected with documented evidence" path — explicitly allowed in ROADMAP.md |
| 5 | Document recommends KEEP/MODIFY/DISCARD per strategy | VERIFIED | RECOMMENDATION.md TL;DR table issues explicit `DISCARD` verdict for both strategies; per-strategy sections include verdict header, best-config row, evidence table, top/bottom ticker tables, and narrative |
| 6 | Pitfall mitigations from RESEARCH.md actually applied | VERIFIED | (a) `Math.abs(maxDrawdown)` sign-flip mitigation applied in `m201-build-recommendation.ts:137-144` (lines comparing to 25%/35% bars); (b) `<10 trades/year` "buy-and-hold proxy" flag implemented at `:307` and surfaces in RECOMMENDATION.md per-strategy block (`Tickers flagged as buy-and-hold proxy: 35/35`) and in narrative ("Trading frequency caveat"); (c) cross-window jump test at `regime-segmenter.test.ts:235-299` asserts `volatility < 1.0` (a naive splice would yield >3.0 from a 65% jump return) |

**Score:** 6/6 truths verified

### Required Artifacts (level 1-3 verification)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/07-strategy-reality-check/results.jsonl` | 1050 records, 35 tickers × 30 backtests, regime metrics populated | VERIFIED | 3.5 MB; line count = 1050; all 35 tickers present at 30 records each; 0 error records; first record schema includes both `fullMetrics` (all 27 fields) and `regimeMetrics.{bull,bear,highVol}` |
| `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` | KEEP/MODIFY/DISCARD per strategy with evidence | VERIFIED | 215 lines; TL;DR table + per-strategy sections + parameter sensitivity + engine findings + data-quality caveats + methodology + downstream implications |
| `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md` | 35/35 OK, no FAILED tickers | VERIFIED | All 35 tickers OK; 2010 bars each; Yahoo provider for all; META FB-rename continuity verified |
| `data/cache/historical/` | ~35 files, ~14 MB | VERIFIED | 37 files (35 universe + 2 stray SPY variants from older runs); 14 MB total; 35 of 35 universe files present matching ticker list |
| `src/backtesting/analytics/regime-segmenter.ts` | Per-regime metrics with sub-window-aware Sharpe/MaxDD | VERIFIED | 418 lines; REGIMES const matches CONTEXT.md exactly; `computeSubWindowDailyReturns` and `worstSubWindowMaxDrawdown` correctly implemented; baseline calculator output overridden for splicing-sensitive fields only |
| `src/backtesting/analytics/__tests__/regime-segmenter.test.ts` | 12 passing tests including cross-window jump test | VERIFIED | 12/12 pass in 745ms; cross-window jump test (lines 235-299) constructs a discontinuous bull-regime curve (109k → 180k jump) and asserts `volatility < 1.0` and finite Sharpe |
| `src/backtesting/strategies/strategy-adapter.ts` | Shared StrategyAdapter + createStrategyFactory; newest-first bar contract; 300-bar window cap | VERIFIED | 149 lines; `STRATEGY_HISTORY_WINDOW = 300`; bars reversed to newest-first per documented strategy contract; `createStrategyFactory` constructs both strategies with CONTEXT.md grid keys (shortMA, longMA, minConfidence for momentum; rsiOversold, rsiOverbought for mean-rev) |
| `scripts/m201-reality-check.ts` | Locked costs + universe + grids; resumable | VERIFIED | 449 lines; FULL_UNIVERSE matches CONTEXT.md 35 tickers exactly; grids match CONTEXT.md (5×3 momentum, 5×3 mean-rev = 15 each); costs locked; resumable via `loadProcessedKeys` scan of existing JSONL |
| `scripts/m201-build-recommendation.ts` | Verdict logic + Math.abs mitigation + low-trade flag | VERIFIED | 1085 lines; `judgeRegimes` applies KEEP/MODIFY/DISCARD per CONTEXT.md; Math.abs at 7 sites guarding all threshold comparisons; low-trade flag at line 307 |
| `scripts/m201-prefetch-universe.ts` + `scripts/m201-prefetch-report.ts` | Universe prefetch + summary generator | VERIFIED | Both exist; report file regenerated and matches commit history |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| reality-check script | regime-segmenter | `metricsByRegime(result, "bull"/"bear"/"highVol")` | WIRED | `m201-reality-check.ts:51,271-273` calls per-regime; result is persisted on every JSONL record |
| reality-check script | StrategyAdapter | `createStrategyFactory(strategyName)(params)` | WIRED | `m201-reality-check.ts:246-247` |
| reality-check script | SimpleBacktestEngine | `new SimpleBacktestEngine(config, adapter); engine.run(ticker, bars)` | WIRED | `m201-reality-check.ts:249-267` |
| build-recommendation | results.jsonl | `loadRecords(RESULTS_PATH)` | WIRED | `m201-build-recommendation.ts:198-224`; consumed records drive every downstream verdict, table, and narrative |
| build-recommendation | prefetch report | `readPrefetchSummary()` reads the report's Summary + Failures sections | WIRED | `m201-build-recommendation.ts:1022-1052`; RECOMMENDATION.md Data-Quality Caveats block is sourced from prefetch report at write time |
| RECOMMENDATION numbers | results.jsonl rows | Verdict math driven by `regimeMetrics` fields | WIRED + spot-checked | (a) LLY mean-rev (40,70): Sharpe=1.08, return=+442.6%, MaxDD=-21.2% — matches results.jsonl exactly. (b) PFE momentum (10,75,65): Sharpe=-0.45, return=-47.3%, MaxDD=-57.7% — matches exactly. (c) LLY mean-rev (20,70): Bull Sharpe=0.65, MaxDD=-21.2%, Bear Sharpe=1.74, MaxDD=-10.0%, HighVol Sharpe=1.40, MaxDD=-17.7% — matches exactly |

### shortMA-Bug Cross-Check

The phase reports MomentumStrategy "ignores `shortMA`". Verifying both the empirical signal and the root cause:

**Empirical (results.jsonl):**

NVDA momentum, longMA=75, minConfidence=65, varying shortMA across {10, 15, 20, 30, 50}:

```
shortMA=10: Sharpe=0.9027, trades=31
shortMA=15: Sharpe=0.9027, trades=31
shortMA=20: Sharpe=0.9027, trades=31
shortMA=30: Sharpe=0.9027, trades=31
shortMA=50: Sharpe=0.9027, trades=31
```

Identical to 4 decimal places. The parameter is sweep-invariant.

**Root cause (code):**

`src/strategies/momentum-strategy.ts:47-62` calls `TechnicalIndicators.calculate(priceData)` where `priceData` is just `{open, high, low, close, volume}` arrays — no config object. Inside `src/analysis/technical-indicators.ts:92-94`, SMAs are calculated with **hardcoded periods 20, 50, 200**:

```
this.calculateSMA(data.close, 20),
this.calculateSMA(data.close, 50),
this.calculateSMA(data.close, 200),
```

The returned `indicators.sma.short` is always SMA(20), regardless of `MomentumConfig.shortMA`. The `shortMA` config value only appears in MomentumStrategy's log-message templates (lines 115, 123, 134, 142, 203, 212) — it is purely cosmetic in the current implementation.

**Impact assessment:**

This does not invalidate the DISCARD verdict. Per RECOMMENDATION.md "Engine / Strategy Findings":

- Only `shortMA` is broken in Momentum; `minConfidence` is an effective knob (verified to shift Sharpe: 55→0.59, 65→0.62, 75→0.58).
- The effective Momentum grid is 3 unique configs (3 minConfidence values × 1 SMA configuration) rather than 15, replicated 5× per minConfidence value.
- Even at the best of those 3 effective configs, the strategy fails KEEP in 2/3 regimes (median bull Sharpe 0.62, bear -0.70, highVol 0.12) — DISCARD per the locked verdict logic.
- A fix that wires `config.shortMA` into the SMA period would change WHICH MA pair is used, not the structural finding that the strategy is regime-dependent and bear-negative. The verdict would likely still be DISCARD; the only way it changes is if a specific (shortMA, longMA) pair happens to clear KEEP in all 3 regimes, which is implausible given the universe-wide failure pattern at the default (20, 50) and the swept longMA=75.

The phase already surfaces this finding in two places (Parameter Sensitivity table marks `shortMA` as "flat" + the dedicated "Engine / Strategy Findings" block at lines 156-162 of RECOMMENDATION.md). The bug is documented as actionable for future strategy work, not papered over.

### Requirements Coverage

(No REQUIREMENTS.md row maps to phase 7; ROADMAP.md success criteria are the requirements proxy.)

| Success Criterion | Status | Blocking Issue |
|-------------------|--------|----------------|
| SC-1: 30 equities + 5 ETFs × daily 2018-2025 | SATISFIED | None |
| SC-2: $0 comm, 0.05% slippage, no leverage | SATISFIED | None |
| SC-3: Per-regime (bull/bear/high-vol) metrics with locked windows | SATISFIED | None |
| SC-4: KEEP-pass OR formal-rejection-with-evidence | SATISFIED via branch B | Both formally DISCARDED with evidence |
| SC-5: KEEP/MODIFY/DISCARD per strategy | SATISFIED | None |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/strategies/momentum-strategy.ts` | `config.shortMA` consumed only in log strings (lines 115, 123, 134, 142, 203, 212); never passed to indicator computation | Info — pre-existing bug, surfaced and documented in this phase | Does not affect verdict (still DISCARD); flagged in RECOMMENDATION.md "Engine / Strategy Findings" for future strategy work |
| `data/cache/historical/` | 2 stray cache files (`spy_2018-01-01_2018-02-01.json`, `spy_2025-05-31_2026-05-31.json`) from earlier test runs | Info | No impact — universe file `spy_2018-01-01_2025-12-31.json` is the one consumed by the sweep |

No blockers, no warnings. The shortMA finding is exactly the kind of "negative result is still useful" outcome CONTEXT.md anticipated.

### Out-of-Scope Creep Check

- `src/strategies/strategy-registry.ts` was NOT modified during phase 7 (git log confirms). The known-broken registry was correctly bypassed via the new `createStrategyFactory` in `strategy-adapter.ts`, exactly as planned in 07-02.
- Two src files were modified during 07-05 auto-fixes (`simple-backtest-engine.ts`, `strategy-adapter.ts`) — both were necessary to make the sweep run, both are documented in 07-05-SUMMARY.md, and both are downstream-beneficial (the engine fix unblocks every backtest going forward, not just M2-01).

### Build & Test Status

| Check | Result |
|-------|--------|
| `pnpm build` (tsc) | Clean, no errors |
| `pnpm vitest run src/backtesting/analytics/__tests__/regime-segmenter.test.ts` | 12/12 passing in 745ms |

### Gaps Summary

None. The phase delivers exactly what the goal demands: a decision document with traceable evidence. The DISCARD verdict is the legitimate outcome of the SC-4 second branch, not a planning shortcut.

Two items flagged for the operator's awareness (not as gaps):

1. **The shortMA bug is a pre-existing strategy issue, not a phase-7 failure.** Phase 7's job was to test the strategies as they exist; it did so and found the bug as a side effect. Whether to fix it as a separate phase before M2-05 (or carry forward into a fresh signal design pass) is an operator call.
2. **Two stray SPY cache files from older runs are harmless** but could be pruned during the next housekeeping pass.

---

*Verified: 2026-05-30T23:17:00Z*
*Verifier: Claude (gsd-verifier)*
