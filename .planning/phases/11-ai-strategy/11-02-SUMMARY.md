---
phase: 11-ai-strategy
plan: 02
subsystem: strategy
tags: [strategy-engine, polymarket, vix, atr, technical-indicators, jsonl, cli, commander]

# Dependency graph
requires:
  - phase: 10-llm-trade-signal
    provides: "TickerDaySummary rollups (pmContribution.sources[]), JsonlStore, PmMappingEngine sign math"
  - phase: 11-ai-strategy (11-01)
    provides: "materiality pre-screen wired into cycle-runner (independent, no file overlap with this plan)"
provides:
  - "src/strategy/ module skeleton: types.ts (SignalTypeModule/RawSignal/StrategyCandidate contract), config.ts, substrate.ts, vix-provider.ts, levels.ts, sizing.ts, strategy-engine.ts, decision-log.ts"
  - "SectorRotationModule — the one signal type wired end-to-end this plan"
  - "public TechnicalIndicators.calculateATRSeries"
  - "strategy CLI (7 subcommands) registered in src/index.ts"
  - "config/strategy-config.json"
affects: [11-03-catalyst-anchored, 11-04-sentiment-fade, 11-05-engine-integration, 11-06-live-window-backtest, 11-07-web-route]

# Actuals (#2632)
actuals:
  tokens: 25688
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural (duck-typed) interfaces — MarketDataSource, VixSource — used in place of concrete classes (MarketDataService, VixProvider) for StrategyEngineOptions, so tests can inject stubs without fighting TypeScript's private-member nominal typing"
    - "StrategyDecisionRecord extends StrategyCandidate rather than redeclaring ~20 fields — RESEARCH §5's schema stays DRY and can never drift from the candidate shape"
    - "Append + reconcile-at-read-time for JSONL decision logs (same precedent as backlog-drain.ts) — recordClose appends a new row sharing candidateId; readers dedup by latest closedAt ?? decidedAt"
    - "CLI --dry-run via a scratch strategyDataDir rather than threading a dryRun flag through the engine — generateCandidates stays always-persist and simple"

key-files:
  created:
    - config/strategy-config.json
    - src/strategy/types.ts
    - src/strategy/config.ts
    - src/strategy/substrate.ts
    - src/strategy/vix-provider.ts
    - src/strategy/levels.ts
    - src/strategy/sizing.ts
    - src/strategy/signals/sector-rotation.ts
    - src/strategy/strategy-engine.ts
    - src/strategy/decision-log.ts
    - src/strategy/cli/strategy-commands.ts
  modified:
    - src/analysis/technical-indicators.ts
    - src/index.ts
    - package.json

key-decisions:
  - "StrategyDecisionRecord extends StrategyCandidate (not a hand-copied field list) — RESEARCH §5's schema is a superset of the candidate shape plus decision fields"
  - "MarketDataSource/VixSource structural interfaces in StrategyEngineOptions, not the concrete MarketDataService/VixProvider classes — private class fields make concrete-class types unassignable from plain test-stub object literals"
  - "TYPE_SIZE_MODIFIER hardcoded table is a fallback for config/strategy-config.json's typeSizeModifier, not the sole source of truth — config stays authoritative and test-overridable"
  - "findCandidate / latestDecisionForCandidate resolve via the candidateId's embedded YYYY-MM-DD prefix as the fast path, falling back to a 30/90-day backward scan — JsonlStore has no file-listing API"
  - "--dry-run points StrategyEngine at a scratch OS-temp strategyDataDir rather than adding a dryRun flag to generateCandidates itself"

patterns-established:
  - "Signal-type modules implement SignalTypeModule { signalType, mode, generate(ctx), gate?(ctx) } — 11-03/11-04 plug in without touching engine internals"
  - "computeLevels/suggestSizeUsd are pure functions taking StrategyConfig — no hidden state, fully unit-testable"

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "A PM-derived SECTOR_ROTATION_FROM_PM candidate flows from a real ticker-day-summary row to a ranked, sized, level-bearing CLI line and an accepted decisions-*.jsonl record, end to end"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/tracer-e2e.test.ts#ranks, sizes, and levels a PM-derived candidate; accept logs the operator override"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy run --date 2026-08-26 --dry-run against real data/intel, plus a real (non-dry-run) run + strategy accept round-trip verified manually this session"
        status: pass
    human_judgment: false
  - id: D2
    description: "Score floor 0.4, top-5 cap, next-3 sub-threshold reporting, and the honest empty-ranked state (D-05/D-14)"
    verification:
      - kind: unit
        ref: "src/strategy/signals/__tests__/sector-rotation.test.ts (score formula + skip conditions)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy run --date 2026-08-26 --dry-run printed the real 'No candidates above threshold today' empty state plus 3 sub-threshold rows"
        status: pass
    human_judgment: true
    rationale: "The engine's own top-5-cap / 3-sub-threshold-cap boundary logic in strategy-engine.ts is exercised by the tracer test (1 ranked, 1 sub-threshold) and the real-data smoke, but no unit test forces exactly 6+ above-floor candidates to prove the cap truncates at 5 — worth a human spot-check before this partition logic is trusted at higher candidate volume."
  - id: D3
    description: "VIX-regime sizing produces $1875/$937/$468 on $7500 assumed equity; FADE_OVERSHOOT is exactly 50% of the same-regime size"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/sizing.test.ts (all suggestSizeUsd + TYPE_SIZE_MODIFIER + grossExposureMultiple cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Entry/target/stop cover all four signal types' formulas (pullback entry, per-CatalystType target table, uniform ATR_5 stop) with Pitfall-5 clamps applied only to ATR-derived levels"
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/levels.test.ts (entry/stop/target clamp cases + targetPriceForCatalyst table)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The decision log is append-only and reconciles by candidateId at read time, including close records with a realized P&L computed from the operator's entry/size"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/decision-log.test.ts (skip-then-accept reconcile, recordClose long/short P&L, DecisionLogError cases, acceptSkipStats bands)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy close does-not-exist --exit-price 10 (exit 1, not-found message); pnpm dev strategy accept some-id --entry abc (exit 2)"
        status: pass
    human_judgment: false
  - id: D6
    description: "SignalTypeModule is a stable contract 11-03/11-04 can implement without editing engine internals"
    verification: []
    human_judgment: true
    rationale: "Contract stability can only be proven by a future plan (11-03/11-04) actually implementing against it without modifying strategy-engine.ts or types.ts — not verifiable within this plan's own test suite."

# Metrics
duration: 30min
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 02: SECTOR_ROTATION_FROM_PM Tracer Summary

**One PM-derived sector-rotation signal wired end to end — real `data/intel` rollup to VIX-sized, ATR-leveled candidate to an accepted `decisions-*.jsonl` record — plus the full four-type levels/sizing math and the complete 7-command `strategy` operator CLI.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-28T01:49:00-04:00 (approx, first tool call)
- **Completed:** 2026-08-28T02:00:57-04:00
- **Tasks:** 3
- **Files modified:** 19 (16 created, 3 modified)

## Accomplishments

- `src/strategy/` module skeleton stood up: `types.ts` establishes the `SignalTypeModule`/`RawSignal`/`StrategyCandidate`/`StrategyDecisionRecord` contract that Plans 11-03 and 11-04 build against without touching engine internals
- `SectorRotationModule` implements the exact D-03 score formula (`min(1, Σ|movePp×weight|/10) × min(1, log10(totalVolume)/7)`) and generates a real candidate from the live `data/intel` substrate — verified via `pnpm dev strategy run --date 2026-08-26 --dry-run` (VIX header, honest empty-ranked state, sub-threshold rows) and a real non-dry-run accept round-trip
- `TechnicalIndicators.calculateATRSeries` added as a public sibling of the existing private `calculateATR`
- `levels.ts`/`sizing.ts` generalized to all four v1 signal types: pullback entries, the per-`CatalystType` target table (`fda`/`fda_pdufa` 25% of close, `earnings` avg-historical-move with 2×ATR_5 fallback, `treasury_auction` 1×ATR_5, generic 2×ATR_5), the Pitfall-5 5%/15% clamps on ATR-derived stop/target only, and `FADE_OVERSHOOT`'s 50% size modifier
- `DecisionLog` completes the operator loop: `recordAccept`/`recordSkip`/`recordClose` (append-only, P&L computed from the operator's own entry/size), `readDedupedByCandidateId` (latest `closedAt ?? decidedAt` wins), `acceptSkipStats` (D-13's low/sweet-spot/high band)
- `strategy` CLI ships all 7 subcommands (`run`, `list-candidates`, `accept`, `skip`, `close`, `decisions-summary`, `show-vix`), all hyphenated single-word names, all numeric options validated with `process.exit(2)` on bad input

## Task Commits

Each task was committed atomically (Tasks 2 and 3 used TDD RED/GREEN):

1. **Task 1: End-to-end "PM signal to sized trade idea"** — `7371200` (feat)
2. **Task 2: Generalize levels/sizing to all four signal types** — `cf3cf91` (test, RED) → `22e04d2` (feat, GREEN)
3. **Task 3: Decision-log reconcile + operator CLI loop** — `c0dbb38` (test, RED) → `d05829e` (feat, GREEN)

No refactor commits were needed — GREEN implementations passed `tsc`/`biome` clean on the first pass.

## Files Created/Modified

- `config/strategy-config.json` — provenance-tagged config (`scoreFloor: 0.4`, `maxCandidatesPerDay: 5`, `assumedEquity: 7500`, `signalModes`, VIX thresholds, regime size %s)
- `src/strategy/types.ts` — the `SignalTypeModule`/`RawSignal`/`StrategyCandidate`/`StrategyDecisionRecord` contract
- `src/strategy/config.ts` — `loadStrategyConfig` with named-key validation errors
- `src/strategy/substrate.ts` — `loadRollupsForDay`/`loadRollupsForRange`/`isSubstrateHot` (read-only `data/intel` access)
- `src/strategy/vix-provider.ts` — cached VIX regime classification, never defaults to `"calm"` on failure
- `src/strategy/levels.ts` — `computeLevels`, `targetPriceForCatalyst`, the Pitfall-5 clamps, shared `round2`
- `src/strategy/sizing.ts` — `suggestSizeUsd`, `regimeSizePct`, `grossExposureMultiple`, `TYPE_SIZE_MODIFIER`
- `src/strategy/signals/sector-rotation.ts` — `scoreSectorRotation` + `SectorRotationModule`
- `src/strategy/strategy-engine.ts` — `StrategyEngine.generateCandidates`, `buildCandidateId`
- `src/strategy/decision-log.ts` — `DecisionLog` (accept/skip/close/reconcile/stats/findCandidate)
- `src/strategy/cli/strategy-commands.ts` — `registerStrategyCommands` (all 7 subcommands)
- `src/analysis/technical-indicators.ts` — added public `calculateATRSeries`
- `src/index.ts` — registered `registerStrategyCommands(program)`
- `package.json` — added `"strategy": "tsx src/index.ts strategy"` script
- Test files: `src/strategy/__tests__/tracer-e2e.test.ts`, `levels.test.ts`, `sizing.test.ts`, `decision-log.test.ts`, `src/strategy/signals/__tests__/sector-rotation.test.ts`

## Shipped Signatures (downstream plans depend on these verbatim)

**`SignalTypeModule`** (`src/strategy/types.ts`):
```typescript
export interface SignalTypeModule {
  readonly signalType: SignalType;
  readonly mode: SignalMode;
  generate(ctx: SignalContext): Promise<RawSignal[]>;
  gate?(ctx: SignalContext): Promise<{ ok: boolean; reason: string }>;
}
```

**`RawSignal`**:
```typescript
export interface RawSignal {
  signalType: SignalType;
  ticker: string;
  score: number; // [0,1]
  direction: "long" | "short";
  rationale: string;
  entryStyle: "close" | "pullback";
  targetSpec: TargetSpec;
  timeHorizonDays: number;
  sizeModifier?: number; // defaults to 1
  sourceArticleIds: string[];
  sourcePmMarkets: Array<{ marketId: string; slug: string; movePp: number }>;
  sourceCatalystId?: string;
}
```

**`candidates-YYYY-MM-DD.jsonl`** record shape: `StrategyCandidate` = `RawSignal` + `candidateId`, `generatedAt`, `asOfDate`, `mode: "ranked" | "sub-threshold" | "shadow"`, `vixRegime`, `vixCloseAtGeneration`, `vixSource`, `suggestedEntry/Target/Stop`, `suggestedSizeUsd: number | null`, `atrPeriodUsed`, `atrValue`.

**`decisions-YYYY-MM-DD.jsonl`** record shape: `StrategyDecisionRecord` = `StrategyCandidate` + `decision: "accept" | "skip"`, `decidedAt`, `operatorEntry/Target/Stop/SizeUsd: number | null`, `operatorNote?`, and on a close-append row: `closedAt`, `closeExitPrice`, `closeRealizedPnlUsd`, `closeRealizedPnlPct`, `closeOperatorNote?`.

## Observed Real-Data Smoke (2026-08-26, `data/intel`)

```
VIX: 15.45 (elevated, live)
As of 2026-08-26

No candidates above threshold today.

Sub-threshold (3):
SECTOR_ROTATION_FROM_PM  IBIT   score=0.02 short entry=44.72 target=42.15 stop=47.01 size=—
SECTOR_ROTATION_FROM_PM  MSTR   score=0.02 short entry=126.83 target=112.10 stop=139.50 size=—
SECTOR_ROTATION_FROM_PM  COIN   score=0.02 short entry=187.16 target=165.16 stop=206.10 size=—
```

A real (non-dry-run) `strategy run` + `strategy accept <id> --note "smoke test"` round-trip against the real `data/intel`/`data/strategy` trees confirmed the full write path (`data/strategy/candidates-2026-08-26.jsonl`, `data/strategy/decisions-2026-08-28.jsonl`, `data/strategy/vix-cache.json` all created and gitignored under the existing `/data/` rule).

## Decisions Made

- **`StrategyDecisionRecord extends StrategyCandidate`** rather than a hand-copied field list — RESEARCH §5's decision-log schema is exactly "every candidate field plus decision fields"; extending keeps the two shapes from ever drifting apart.
- **`MarketDataSource`/`VixSource` structural interfaces** in `StrategyEngineOptions`, not the concrete `MarketDataService`/`VixProvider` classes — both concrete classes have private fields, which makes TypeScript treat them nominally; a plain stub object literal can't satisfy a concrete-class-typed parameter, only a structural interface. Real class instances still satisfy the narrower interface with zero extra code.
- **`TYPE_SIZE_MODIFIER` is a fallback, not the source of truth** — `suggestSizeUsd` checks `config.typeSizeModifier[signalType]` first, falling back to the hardcoded table only when the config file doesn't list that type. Keeps the config file authoritative and lets tests override it.
- **`findCandidate`/`latestDecisionForCandidate` resolve via the id's embedded date** as the fast path (candidate ids are always `${asOfDate}-${signalType}-${ticker}-${hash}`) with a 30/90-day backward scan as a defensive fallback — `JsonlStore` has no "list all files" API, so a full scan isn't cheap or necessary for the common case.
- **`--dry-run` uses a scratch `strategyDataDir`** rather than threading a `dryRun` boolean through `StrategyEngine.generateCandidates` — keeps the engine's persistence path unconditional and simple; the CLI is the only caller that needs the no-write behavior.

## Deviations from Plan

None — plan executed as written. One clarification worth recording: Task 1's plan text describes `levels.ts`/`sizing.ts` as "minimal versions sufficient for this one type," and Task 2 fully replaces them per its own `<action>` — this is the plan's own designed two-step build, not a deviation.

## Known Stubs

None. `CATALYST_ANCHORED`, `SENTIMENT_VELOCITY`, and `FADE_OVERSHOOT` remain **type-only** unions in `SignalType` with no corresponding `SignalTypeModule` implementation — this is not a stub but the explicit scope boundary of this plan (the phase tracer proves one path with `SECTOR_ROTATION_FROM_PM`; Plans 11-03 and 11-04 implement the other three signal-type modules against the contract this plan ships).

## Issues Encountered

- `pnpm biome check` surfaced pre-existing lint debt across the wider `src/` tree (e.g. `technical-indicators.ts`'s `noStaticOnlyClass`/`noThisInStatic`, `intel-commands.ts`'s `console.log` usage) unrelated to this plan's diff — confirmed via `git diff --stat` that these errors exist on files this plan did not touch (or touched only additively). Per the scope-boundary rule, these were left alone; `pnpm biome check src/strategy/` and the specific files this plan modified are clean (0 errors, only pre-existing-style `console.log` warnings matching the codebase's `intel-commands.ts` convention).
- Two Biome auto-fixes applied during Task 3 GREEN: a formatter reflow in `decision-log.ts`/`strategy-commands.ts`, and merging a broken-up template-literal concatenation into one literal in the `--size` fat-finger warning (`lint/style/useTemplate` + `noUnusedTemplateLiteral`).

## User Setup Required

None — no external service configuration required. `VixProvider` reuses the existing `YahooFinanceProvider` (no new credential); no new package was installed (RESEARCH's Package Legitimacy Audit confirmed zero new packages needed, verified again this session).

## Next Phase Readiness

- The `SignalTypeModule` contract, `StrategyEngine`, `levels.ts`, `sizing.ts`, and `DecisionLog` are all stable and fully generalized to the four v1 signal types — Plans 11-03 (`CATALYST_ANCHORED`) and 11-04 (`SENTIMENT_VELOCITY`/`FADE_OVERSHOOT`) can implement `SignalTypeModule` and register their module with `StrategyEngine`'s `modules` option without editing `strategy-engine.ts`, `levels.ts`, or `sizing.ts`.
- `targetPriceForCatalyst` is already built and tested against the full `CatalystType` union, ready for 11-03 to call directly.
- No blockers. The `strategy` CLI, config, and data directories (`data/strategy/`) are live and gitignored on this tree.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 16 created files and 5 task commit hashes verified present on disk / in `git log --oneline --all`.
