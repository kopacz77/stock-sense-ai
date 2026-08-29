---
phase: 11-ai-strategy
plan: 09
subsystem: strategy
tags: [tax-model, cost-model, backtest, cli, express, react, vitest, gap-closure]

# Dependency graph
requires:
  - phase: 11-ai-strategy (11-05)
    provides: "StrategyEngine.generateCandidates partition/ranking loop, full strategy CLI"
  - phase: 11-ai-strategy (11-06)
    provides: "live-window-runner.ts (runLiveWindow/runPass/simulateCandidate), strategy backtest CLI"
  - phase: 11-ai-strategy (11-07)
    provides: "GET/POST /api/strategy/* endpoints, StrategyPage.tsx candidate cards"
provides:
  - "config/tax-profiles.json — complete ON-CA and CA-US rule sets, every rate annotated with source/asOf/confirmWithAccountant/verified"
  - "src/strategy/costs.ts — loadTaxProfiles/resolveActiveProfile/computeNetHurdle/evaluateCandidateCosts/costsDemotionReason/findRecentLossClosures/buildWashSaleFlag/washSaleRationaleNote"
  - "StrategyEngine cost-demotion branch (D-23) and wash-sale/superficial-loss flag join (D-24), both reading the decision log/tax profiles ONCE per run"
  - "DecisionLog.recordAccept computes real afterTaxRewardUsd/costJurisdiction/costEffectiveTaxRatePct from the operator's own levels"
  - "live-window-runner.ts gross-vs-after-cost dual accounting + a forward-only tax/loss-offset-bucket/disallowed-loss walk"
  - "strategy costs --show CLI command; strategy run's hurdle line + per-candidate net R:R; strategy backtest's gross/after-cost lines + Cost impact: block"
  - "GET /api/strategy/candidates redacts costEvaluation (redactCostEvaluation) before it reaches the browser; StrategyPage.tsx renders net R:R + wash-sale flag"
affects: [11-08-phase-acceptance, M2-06-risk-gating, M2-07-live-execution]

# Actuals (#2632)
actuals:
  tokens: 42855   # chars/4 (171418 chars) over the full plan diff (3 tasks, 21 files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "costs.ts never imports StrategyCandidate/StrategyDecisionRecord — every function takes primitives or the plain TaxProfile/CostsConfig objects, the same shape as levels.ts's computeLevels; the three candidate-facing types (Jurisdiction, CandidateCostEvaluation, WashSaleFlag) live in types.ts instead and are imported into costs.ts"
    - "Cost demotion reuses WR-01's exact degenerate-levels demotion shape verbatim — push to a demoted array, mode sub-threshold, suggestedSizeUsd null, reason appended to rationale, score/target never mutated — so a reviewer who knows one demotion path already knows the other"
    - "config?: StrategyConfig injection added to LiveWindowOptions/RunPassArgs (same seam as modules/marketData/vixProvider) so tests can neutralize or exercise the cost gate without a real config/strategy-config.json read; StrategyCommandsDeps gained the equivalent configPath seam for the CLI layer"
    - "redactCostEvaluation and DecisionLog's afterTaxRewardUsd computation both build their output by naming every KEPT/computed field explicitly, never by deleting keys from a spread — a field added to CandidateCostEvaluation later fails closed (omitted) rather than leaking by default"

key-files:
  created:
    - config/tax-profiles.json
    - src/strategy/costs.ts
    - src/strategy/__tests__/costs.test.ts
  modified:
    - config/strategy-config.json
    - src/strategy/config.ts
    - src/strategy/types.ts
    - src/strategy/strategy-engine.ts
    - src/strategy/decision-log.ts
    - src/strategy/cli/strategy-commands.ts
    - src/strategy/backtest/live-window-runner.ts
    - src/web/server.ts
    - web/frontend/src/types/strategy.ts
    - web/frontend/src/pages/StrategyPage.tsx
    - src/strategy/__tests__/strategy-engine.test.ts
    - src/strategy/__tests__/decision-log.test.ts
    - src/strategy/backtest/__tests__/live-window-runner.test.ts
    - src/web/__tests__/server-strategy-decision.test.ts
    - src/strategy/__tests__/tracer-e2e.test.ts
    - src/strategy/__tests__/worked-example.test.ts
    - src/strategy/cli/__tests__/strategy-commands.test.ts
    - .planning/phases/11-ai-strategy/11-VALIDATION.md

key-decisions:
  - "DecisionLog.recordAccept writes afterTaxRewardUsd:null whenever the tax rate is unknown, even though the underlying formula (grossReward * (1 - effectiveTaxRate)) would compute a real positive number with effectiveTaxRate=0 — a decision-log row's afterTaxRewardUsd is explicitly nulled together with costEffectiveTaxRatePct so the pairing itself signals 'no bracket was guessed here', rather than risk a pre-tax number being misread as after-tax in a permanent record with no other label attached. This differs from CandidateCostEvaluation.afterTaxRewardUsd (live UI/CLI), which DOES report the pre-tax number because it always sits next to a 'pre-tax' label."
  - "The real shipped defaults (jurisdiction ON-CA, costs.minRewardRisk 1.5) combined with the pre-11-09 target/stop formula (2x ATR target / 1.5x ATR stop = a 1.333 gross reward:risk, uniform across CATALYST_ANCHORED's default case and locked into Plan 11-02) mean essentially no CATALYST_ANCHORED candidate can ever clear the hurdle, even pre-tax. This is flagged as THE most important operational finding below, not silently absorbed."
  - "WashSaleFlag gained a ticker field beyond what buildWashSaleFlag's own <action> text enumerated, because washSaleRationaleNote's single-argument signature (per the plan's own artifact list) needs the ticker and buildWashSaleFlag already receives it as a parameter — a small, load-bearing self-consistency fix, not a scope add."
  - "StrategyCommandsDeps.configPath and LiveWindowOptions.config were added as DI seams (not in either task's literal file/artifact list) because the real config/strategy-config.json's new cost gate broke five pre-existing test files that reach StrategyEngine.generateCandidates/runLiveWindow through the real on-disk config with no way to neutralize it — documented fully in Deviations."

patterns-established:
  - "Any future cost-model-adjacent test that needs a StrategyEngine/runLiveWindow candidate to actually rank must inject a relaxed costs config (spreadSlippageBps:0, fxSpreadBps:0, minRewardRisk near-zero) rather than relying on the real on-disk default, which now legitimately fails ~1.333:1 setups."

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "config/tax-profiles.json ships both ON-CA and CA-US fully specified (gain characterisation, dated inclusion rate, business-income/trader-tax-status risk flags, the correctly-named 30-day loss rule, FX applicability, regulatory sell fees, NIIT), every number annotated with source/asOf/confirmWithAccountant/verified; costs.ts validates it (rejects __proto__/constructor/prototype at any depth, rejects non-finite/negative/>100%-for-pct rates, requires both jurisdictions)"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/costs.test.ts — describe('loadTaxProfiles / resolveActiveProfile — both jurisdictions') and describe('computeNetHurdle') (18 cases)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy costs --show against real config/tax-profiles.json, both ON-CA and CA-US (transcripts below)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every ranked candidate clears BOTH the fee/slippage/FX/regulatory-fee break-even and the after-tax-reward/pre-tax-risk minimum; a failing candidate is demoted to sub-threshold with an explicit (demoted: costs — ...) reason, target and score never mutated; with marginalRatePct unset the engine applies no tax haircut and prints the degradation warning on strategy run / strategy costs --show / strategy backtest"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/strategy-engine.test.ts — describe('StrategyEngine — costs demotion (Plan 11-09, D-23)') (2 cases: break-even failure, reward:risk failure)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy run --date 2026-08-26 --dry-run against real ./data/intel — every real CATALYST_ANCHORED candidate demoted with the token, NVDA example in transcript below"
        status: pass
    human_judgment: false
  - id: D3
    description: "A candidate whose ticker was closed at a loss inside the active profile's 30-day loss window is flagged (rule name from the active profile — superficial-loss under ON-CA, wash-sale under CA-US) without demoting it — still ranked, still sized; the decision log is read exactly once per generateCandidates run, not once per candidate"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/costs.test.ts — describe('findRecentLossClosures / buildWashSaleFlag / washSaleRationaleNote') (5 cases) + describe('StrategyEngine — wash-sale flag integration (Plan 11-09 Task 2)') (1 full-engine case: still ranked, still sized)"
        status: pass
    human_judgment: false
  - id: D4
    description: "DecisionLog.recordAccept records afterTaxRewardUsd/costJurisdiction/costEffectiveTaxRatePct computed from the OPERATOR's own entry/target/size, null-pairing afterTaxRewardUsd+costEffectiveTaxRatePct when the tax rate is unknown, and degrading to null (never throwing, never losing the accept) on a cost-config failure; recordSkip nulls all three unconditionally"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/decision-log.test.ts — describe('DecisionLog.recordAccept — afterTaxRewardUsd (Plan 11-09)') (3 cases), describe('DecisionLog.recordSkip — cost fields always null (Plan 11-09)') (1 case), describe('DecisionLog.recordAccept — a cost-config failure never loses the decision (Plan 11-09)') (1 case, missing tax-profiles file)"
        status: pass
    human_judgment: false
  - id: D5
    description: "strategy backtest reports a gross line (zero commissions/slippage/tax) and an after-cost line (now including tax with the disallowed-loss rule applied) per type plus a Cost impact: block; a same-ticker re-entry inside the loss window is excluded from the loss-offset bucket and counted in disallowedLossUsd, outside the window it is not; adding the gross path does not increase engine-replay count"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/backtest/__tests__/live-window-runner.test.ts — describe('runLiveWindow — gross vs after-cost + tax + disallowed loss (Plan 11-09)') (6 cases covering all 6 <behavior> bullets)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy backtest --start 2026-08-15 --end 2026-08-19 against real ./data/intel — before/after comparison against 11-06's SUMMARY numbers, below"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/strategy/candidates returns each candidate's costEvaluation with netRewardRisk/minRewardRisk/breakEvenPct/jurisdiction/washSaleFlag present and the operator's tax-rate fields (effectiveTaxRatePct, and every dollar figure that inverts back to it) absent; the web card shows net R:R against the minimum with a (pre-tax) label when the rate is unset, plus the wash-sale flag line"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/web/__tests__/server-strategy-decision.test.ts — 'redacts costEvaluation...' and 'redactCostEvaluation returns null for a null costEvaluation' (2 cases)"
        status: pass
      - kind: other
        ref: "cd web/frontend && npx tsc --noEmit -p . && pnpm build:frontend — both clean with the new StrategyPage.tsx net R:R / wash-sale rendering"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h58min
completed: 2026-08-29
status: complete
---

# Phase 11 Plan 09: After-Tax/After-Fees Net Hurdle Gap Closure Summary

**Both ON-CA/CA-US tax profiles fully specified and validated, a two-part net hurdle (fee/slippage/FX break-even + after-tax reward:risk) demotes candidates without ever re-targeting them, a wash-sale/superficial-loss flag reads the decision log once per run, `DecisionLog.recordAccept` now writes real `afterTaxRewardUsd`, the live-window backtest reports gross-vs-after-cost with a forward-only disallowed-loss walk, and the web card shows net R:R while the operator's tax bracket never leaves the server — verified against real `./data/intel`, where it surfaced that the shipped-default hurdle now legitimately fails every real CATALYST_ANCHORED candidate at its current 1.333:1 gross reward:risk.**

## Performance

- **Duration:** ~2h58min
- **Started:** 2026-08-28T21:27Z (session start, immediately after the plan commit)
- **Completed:** 2026-08-29T00:25Z
- **Tasks:** 3
- **Files modified:** 21 (3 created, 18 modified)

## THE MOST IMPORTANT OPERATIONAL FINDING

Running `pnpm dev strategy run --date 2026-08-26 --dry-run` against the real `./data/intel` substrate under the **shipped default config** (`costs.jurisdiction: "ON-CA"`, `costs.minRewardRisk: 1.5`, `costs.marginalRatePct: null`) now prints:

```
Hurdle: net R:R >= 1.50 | break-even 3.10% | ON-CA | effective tax pre-tax (marginalRatePct unset)
WARNING: costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)

No candidates above threshold today.
```

Every one of that day's real `CATALYST_ANCHORED` candidates — including the 1.00-scoring NVDA M&A catalyst — was cost-demoted with `net reward:risk 1.33 is below the required 1.50`. This is **not a bug**: `levels.ts`'s stop is always `1.5 × ATR_5` and `CATALYST_ANCHORED`'s default target formula is `2 × ATR_5` (same period) — a gross reward:risk of exactly `2 / 1.5 = 1.333`, locked in by Plan 11-02, *before tax and before this plan's fee/FX break-even are even applied*. The operator's real setups were never actually 1.5:1 trades; Plan 11-09 is now honestly saying so instead of showing a number that quietly wasn't true. `SECTOR_ROTATION_FROM_PM` uses different ATR periods for target (`ATR_10`) vs. stop (`ATR_5`), so its ratio varies and some candidates DO clear 1.5 — visible in the before/after backtest numbers below.

This is out of this plan's scope to "fix" (it owns the cost model, not `levels.ts`'s ATR multiples), but it is the single most consequential real-world effect of this gap-closure plan and belongs in front of the operator, not buried in a deviation note.

## `strategy costs --show` — Real Transcripts, Both Jurisdictions

**ON-CA:**

```
Active jurisdiction: ON-CA
Ontario, Canada — individual resident, non-registered account, swing horizons
Gain characterisation: capital_gain
Loss rule: superficial-loss (30-day window) — A capital loss is denied (superficial loss) if the same or
  identical property is repurchased within 30 days before or after the disposition and still held 30
  days after. The engine only flags a same-ticker repurchase within the trailing 30 days as informational.

elevated regime (size $937):
  Fee/slippage break-even: 3.101%
    fee+slippage leg: 0.1000%
    fx leg: 3.0000%
    regulatory sell-fee leg: 0.0010%
  Minimum after-tax reward:risk: 1.50
  Effective tax rate: pre-tax (marginalRatePct unset)

WARNING: costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)

Sources (confirm with your accountant):
  inclusionRatePct: 50% (asOf 2026-08-28, source: CRA — capital gains inclusion rate for individuals) [UNVERIFIED]
  regulatorySellFees.secSection31FeeBps: 0.08 bps (asOf 2026-08-28, source: SEC Section 31 transaction fee) [UNVERIFIED]
  regulatorySellFees.finraTafBps: 0.02 bps (asOf 2026-08-28, source: FINRA Trading Activity Fee) [UNVERIFIED]

This file encodes a simplified cost/tax model for RANKING AND LEVEL decisions only — it is not tax advice
... every number in it is written 'confirm with your accountant' for a reason: confirm with your accountant
before trusting any rate here for a real filing. Rates marked verified: false were written from general
knowledge at the dated asOf, not confirmed against a primary source on that date.
```

**CA-US:**

```
Active jurisdiction: CA-US
California, USA — individual resident, taxable brokerage account, swing horizons
Gain characterisation: ordinary_income_short_term
Loss rule: wash-sale (30-day window) — IRC §1091 wash-sale rule: a loss is disallowed if a substantially
  identical security is purchased within 30 days before or after the loss-realizing sale...

elevated regime (size $937):
  Fee/slippage break-even: 0.101%
    fee+slippage leg: 0.1000%
    regulatory sell-fee leg: 0.0010%
  Minimum after-tax reward:risk: 1.50
  Effective tax rate: pre-tax (marginalRatePct unset)

WARNING: costs.marginalRatePct is unset — hurdle degraded to fees-only (no tax haircut applied, reward:risk reported pre-tax)

Sources (confirm with your accountant):
  inclusionRatePct: 100% (asOf 2026-08-28, source: IRC §1(h) short-term capital gain treatment) [UNVERIFIED]
  shortTermThresholdDays: 365 days (asOf 2026-08-28, source: IRC §1222) [UNVERIFIED]
  longTerm.federalPreferentialRatePct: 15% (asOf 2026-08-28, source: IRC §1(h) long-term capital gains federal preferential rate) [UNVERIFIED]
  regulatorySellFees.secSection31FeeBps: 0.08 bps (asOf 2026-08-28, source: SEC Section 31 transaction fee) [UNVERIFIED]
  regulatorySellFees.finraTafBps: 0.02 bps (asOf 2026-08-28, source: FINRA Trading Activity Fee) [UNVERIFIED]
  niit.ratePct: 3.8% (asOf 2026-08-28, source: IRC §1411 Net Investment Income Tax) [UNVERIFIED]
```

Confirming ON-CA's FX leg (3.000%) is present and CA-US's is absent — proving D-24's "switching jurisdiction changes the hurdle for identical inputs" — verified live, not just in unit tests.

## Every Rate Written Into `config/tax-profiles.json` (operator's checklist for their accountant)

All 10 annotated rates ship with `verified: false` — the loader accepts this ("written from general knowledge, not confirmed against a primary source on this date"); `strategy costs --show` marks every one `[UNVERIFIED]`.

| Rate | Value | Source |
|---|---|---|
| ON-CA `inclusionRatePct` | 50% | CRA capital gains inclusion rate (dated, post-2024 proposal not enacted) |
| ON-CA `regulatorySellFees.secSection31FeeBps` | 0.08 bps | SEC §31 fee, ~$8/$1M proceeds |
| ON-CA `regulatorySellFees.finraTafBps` | 0.02 bps | FINRA TAF, ~$0.000166/share approximated to bps |
| CA-US `inclusionRatePct` | 100% | IRC §1(h) short-term ordinary-income treatment |
| CA-US `shortTermThresholdDays` | 365 | IRC §1222 one-year threshold |
| CA-US `longTerm.federalPreferentialRatePct` | 15% | IRC §1(h) federal LTCG preferential rate |
| CA-US `regulatorySellFees.secSection31FeeBps` | 0.08 bps | SEC §31 fee |
| CA-US `regulatorySellFees.finraTafBps` | 0.02 bps | FINRA TAF |
| CA-US `niit.ratePct` | 3.8% | IRC §1411 Net Investment Income Tax |
| ON-CA `marginalRateSource` | "operator" | Operator-entered via `costs.marginalRatePct` — never inferred |

## Before/After `strategy backtest` — Same Window (`2026-08-15 → 2026-08-19`)

| | Before (11-06 SUMMARY) | After (this plan) |
|---|---|---|
| Combined Sharpe | -5.01 | -7.10 |
| Combined MaxDD | -1.7% | -2.7% |
| Combined trades (closed) | 1 | 0 |
| Verdict | FAIL | FAIL |

The gap is **not** the tax layer (`marginalRatePct` is still `null` in both runs) — it is the cost-demotion gate itself. `CATALYST_ANCHORED` (uniform `2×ATR_5` target / `1.5×ATR_5` stop, always 1.333 gross R:R) now demotes 100% of its 90 candidates in this window, producing flat `0.00` metrics. `SECTOR_ROTATION_FROM_PM` (different ATR periods for target/stop, so its ratio varies) still opens some positions — its `-7.10`/`-2.7%` unrealized mark-to-market drag (0 *closed* trades, positions still open at window end, same pattern 11-06 documented) now drives the combined numbers alone. `strategy backtest`'s own new output confirms this split: `CATALYST_ANCHORED sharpe=0.00` / `SECTOR_ROTATION_FROM_PM sharpe=-7.10` / `COMBINED sharpe=-7.10`.

## Candidate Demoted For Costs During Verification (real example)

```
CATALYST_ANCHORED  NVDA  score=1.00 long  entry=213.05 target=224.77 stop=204.26 size=— net R:R=1.33
  2026-08-26-CATALYST_ANCHORED-NVDA-f5c1ebee
  ma catalyst (emerging, ...) -> score 1.00 long (... 29 cross-type collision merges ...)
  (demoted: costs — net reward:risk 1.33 is below the required 1.50 for ON-CA (pre-tax, marginalRatePct
  unset); never silently re-targeted upward, because a wider target is a different trade)
```

Target (224.77) and score (1.00) are untouched — the candidate is reported honestly as sub-threshold, never re-targeted.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tax profiles + net hurdle + engine demotion + `strategy run` net R:R + `strategy costs --show`** — `4d1523b` (feat)
2. **Task 2: Wash-sale/superficial-loss flag from the decision log + `afterTaxRewardUsd` on accept** — `42bc1de` (feat)
3. **Task 3: Gross vs after-cost backtest reporting + net R:R on the API and the web card** — `21d3eab` (feat)

## Files Created/Modified

- `config/tax-profiles.json` — both jurisdictions, complete, annotated
- `config/strategy-config.json` — new `costs` block
- `src/strategy/costs.ts` — the whole cost model (new)
- `src/strategy/config.ts` — `CostsConfig`, per-key `costs` merge, validation
- `src/strategy/types.ts` — `Jurisdiction`, `CandidateCostEvaluation`, `WashSaleFlag`, `StrategyCandidate.costEvaluation`, `StrategyDecisionRecord`'s three new fields
- `src/strategy/strategy-engine.ts` — cost-demotion branch, decision-log-once wash-sale wiring
- `src/strategy/decision-log.ts` — real `afterTaxRewardUsd`/`costJurisdiction`/`costEffectiveTaxRatePct` computation, memoised cost-model loader
- `src/strategy/cli/strategy-commands.ts` — hurdle line, per-candidate net R:R, `strategy costs` command, gross/after-cost backtest report, `configPath` DI seam
- `src/strategy/backtest/live-window-runner.ts` — dual gross/after-cost accounting, tax/loss-offset-bucket/disallowed-loss walk, `config` DI seam
- `src/web/server.ts` — `redactCostEvaluation`, wired into `attachDecisionStatus`
- `web/frontend/src/types/strategy.ts` — redacted `CandidateCostEvaluation`/`WashSaleFlag` mirrors
- `web/frontend/src/pages/StrategyPage.tsx` — net R:R line, wash-sale flag line
- Test files: `src/strategy/__tests__/costs.test.ts` (new, 24 cases), extended `strategy-engine.test.ts`, `decision-log.test.ts`, `live-window-runner.test.ts`, `server-strategy-decision.test.ts`
- `.planning/phases/11-ai-strategy/11-VALIDATION.md` — rows `11-09-01/02/03` marked ✅ green

## Decisions Made

See `key-decisions` in frontmatter. Headline: `DecisionLog.recordAccept`'s `afterTaxRewardUsd` is deliberately `null` (not a pre-tax number) whenever the tax rate is unknown — a permanent record with no adjacent "(pre-tax)" label needs the null-pairing itself to signal that no bracket was guessed, unlike the live CLI/UI which always renders a "(pre-tax)" qualifier next to the same-shaped number.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] StrategyDecisionRecord's three new fields required a placeholder before Task 2 implemented them for real**
- **Found during:** Task 1, running `pnpm tsc --noEmit` after extending `StrategyDecisionRecord`.
- **Issue:** Adding `afterTaxRewardUsd`/`costJurisdiction`/`costEffectiveTaxRatePct` as required fields (Task 2's own artifact) broke `decision-log.ts`'s `recordAccept`/`recordSkip` object literals and four pre-existing test fixture files that build `StrategyCandidate` literals directly.
- **Fix:** Landed `costEvaluation: null,` in the four fixture builders and a null-safe placeholder for the three decision fields in `recordAccept`/`recordSkip`, with a comment marking them for Task 2's real implementation.
- **Files modified:** `src/strategy/decision-log.ts`, `src/strategy/__tests__/decision-log.test.ts`, `src/strategy/backtest/__tests__/live-window-runner.test.ts`, `src/web/__tests__/server-strategy-decision.test.ts`.
- **Verification:** `pnpm tsc --noEmit` clean; Task 2 then replaced the placeholder with the real computation.
- **Committed in:** `4d1523b` (Task 1 commit).

**2. [Rule 3 - Blocking] The real shipped-default cost gate broke five pre-existing test files with no way to neutralize it**
- **Found during:** Tasks 1 and 3, running `pnpm vitest run` for the whole suite.
- **Issue:** `costs.minRewardRisk: 1.5` (real default) combined with the pre-11-09 `2×ATR/1.5×ATR` target/stop formula (1.333 gross R:R) cost-demoted every candidate `tracer-e2e.test.ts`, `worked-example.test.ts`, two `live-window-runner.test.ts` cases, and the whole `strategy-commands.test.ts` CLI integration suite relied on reaching `ranked`. None of these tests exercise the cost model — they test the phase-level operator loop, concurrency capping, and the CLI surface.
- **Fix:** Added `config?: StrategyConfig` injection to `LiveWindowOptions`/`RunPassArgs` (threaded into every internally-constructed `StrategyEngine`) and `StrategyCommandsDeps.configPath` (threaded into all five `loadStrategyConfig`/`StrategyEngine` call sites in `strategy-commands.ts`) — the same DI pattern already used for `modules`/`marketData`/`vixProvider`. Each affected test now injects a relaxed cost config (`spreadSlippageBps:0, fxSpreadBps:0, minRewardRisk:0.01`), matching `strategy-engine.test.ts`'s own `baseConfig()` precedent. Also updated the CLI's "all subcommands registered" assertion to include the new `costs` command (9 → 10).
- **Files modified:** `src/strategy/backtest/live-window-runner.ts`, `src/strategy/cli/strategy-commands.ts`, `src/strategy/__tests__/tracer-e2e.test.ts`, `src/strategy/__tests__/worked-example.test.ts`, `src/strategy/backtest/__tests__/live-window-runner.test.ts`, `src/strategy/cli/__tests__/strategy-commands.test.ts`.
- **Verification:** Full `pnpm vitest run` — 625/625 passing, no test files failing.
- **Committed in:** `21d3eab` (Task 3 commit, with the Task-1-introduced tracer/worked-example fixes folded in since they were only discovered once Task 3's full-suite check ran).

**3. [Rule 1 - Bug] WashSaleFlag needed a `ticker` field to make `washSaleRationaleNote`'s literal single-argument signature work**
- **Found during:** Task 2, writing `washSaleRationaleNote`.
- **Issue:** The plan's `buildWashSaleFlag` field list (`{ rule, windowDays, priorCandidateId, priorClosedAt, priorRealizedPnlUsd }`) omits `ticker`, but `washSaleRationaleNote(flag)` — a single-arg function per the plan's own artifact list — needs to print the ticker.
- **Fix:** Added `ticker` to `WashSaleFlag` (already available as `buildWashSaleFlag`'s own first parameter).
- **Files modified:** `src/strategy/types.ts`, `src/strategy/costs.ts`.
- **Verification:** `washSaleRationaleNote` tests assert the ticker appears in the note text.
- **Committed in:** `42bc1de` (Task 2 commit).

**4. [Formatting] Two safe biome format/import-sort fixes on files this plan touched**
- **Found during:** Tasks 1 and 3, running `pnpm biome check` on changed files.
- **Issue:** A template-literal-concatenation lint and an import-order lint in `costs.ts`/`strategy-commands.ts`, and a line-length format issue in `server.ts`'s import block (from adding `CandidateCostEvaluation` to an existing type import) — all introduced by this plan's own edits, not pre-existing debt.
- **Fix:** Applied `biome check --write` (never `--unsafe`) plus one manual multi-line import wrap; verified against `git diff` that no pre-existing unrelated lines (e.g. `strategy-engine.ts`'s `buildCandidateId` call, `server.ts`'s unrelated `req`-unused-parameter/`any` warnings) were touched.
- **Files modified:** `src/strategy/costs.ts`, `src/strategy/cli/strategy-commands.ts`, `src/strategy/strategy-engine.ts` (incidental reformat), `src/strategy/decision-log.ts` (incidental reformat), `src/web/server.ts`.
- **Verification:** `pnpm biome check` clean on every file this plan touched; repo-wide pre-existing debt (637 errors / 211 warnings, matching prior plans' documented reality) untouched.
- **Committed in:** Split across `4d1523b`/`42bc1de`/`21d3eab` alongside the task they belonged to.

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking-compile fixes, 1 Rule 1 bug, 1 formatting cleanup)
**Impact on plan:** All four were necessary for the plan's own verification (`pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm biome check`) to pass as specified. No scope creep beyond what compiling/testing the plan's own changes required. The cost-gate collision with pre-11-02 target/stop math (deviation 2) is a real, load-bearing finding — see "THE MOST IMPORTANT OPERATIONAL FINDING" above — not something papered over.

## Issues Encountered

None beyond the deviations documented above. No auth gates, no package installs, no architectural changes.

## Known Stubs

None. Every artifact in the plan's `artifacts_this_phase_produces` list is fully implemented, tested, and verified against real `./data/intel` data and a real frontend build.

## Threat Flags

None beyond the plan's own threat register (`11-09-PLAN.md`'s `<threat_model>`), all of which are mitigated per the task-by-task verification above (T-11-09-01 through T-11-09-08, T-11-09-SC).

## User Setup Required

None — no external service configuration. Zero new packages (verified: `git diff` touches no `package.json`).

## Next Phase Readiness

- All three of D-23/D-24's deliverables are complete, tested (65 new/extended test cases across `costs.test.ts`, `strategy-engine.test.ts`, `decision-log.test.ts`, `live-window-runner.test.ts`, `server-strategy-decision.test.ts`), and verified against real `./data/intel`.
- **Flag for the operator:** the "most important operational finding" above — under the shipped defaults, `CATALYST_ANCHORED`'s uniform `2×ATR/1.5×ATR` target/stop formula never clears the 1.5 `minRewardRisk` bar, pre-tax. Two independent levers exist to close this, both explicitly OUT of this plan's scope: (a) widen `CATALYST_ANCHORED`'s target multiple (a `levels.ts`/Plan 11-02 change) or lower `costs.minRewardRisk` (an operator config choice, not a code change) — this SUMMARY takes no position on which, since that is exactly the operator judgment call D-23's hurdle exists to surface honestly rather than hide.
- **Flag for the operator:** every rate in `config/tax-profiles.json` ships `verified: false` — the "Every rate written into config/tax-profiles.json" table above is the operator's own checklist to confirm with their accountant before setting `costs.marginalRatePct`.
- No blockers for M2-06 (risk gating) or M2-07 (live execution) — both consume `costEvaluation`/`afterTaxRewardUsd` as read-only inputs, neither of which this plan's boundary crosses into (no tax-lot tracking, no FIFO basis, no FX rate feed, per D-24's explicit boundary).

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-29*

## Self-Check: PASSED

All key created files (`config/tax-profiles.json`, `src/strategy/costs.ts`,
`src/strategy/__tests__/costs.test.ts`, this SUMMARY) verified present on
disk; all 4 commit hashes (`4d1523b`, `42bc1de`, `21d3eab`, `d156b6a`)
verified present in `git log --oneline --all`.
