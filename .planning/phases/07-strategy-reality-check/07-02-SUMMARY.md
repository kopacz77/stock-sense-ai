---
phase: 07-strategy-reality-check
plan: 02
subsystem: backtesting
tags: [refactor, typescript, strategy-adapter, backtesting, momentum, mean-reversion]

# Dependency graph
requires:
  - phase: 01-backtesting-fix
    provides: BacktestStrategy interface, BacktestEngine, SimpleBacktestEngine
provides:
  - Reusable StrategyAdapter class importable outside of CLI
  - Reusable createStrategyFactory function with correct constructor-key mapping
  - src/backtesting/strategies/strategy-adapter.ts (new module)
affects:
  - 07-strategy-reality-check (Plan 05 reality-check runner will import these)
  - any future module that needs to bridge MomentumStrategy/MeanReversionStrategy into BacktestStrategy

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adapter pattern: wrap .analyze()-style strategies as BacktestStrategy"
    - "Factory function returns parameterized strategy constructors for optimization"
    - "Bypass-the-registry: build factories directly, ignore strategy-registry.ts whose defaultParams keys are broken"

key-files:
  created:
    - src/backtesting/strategies/strategy-adapter.ts
  modified:
    - src/cli/backtest-commands.ts

key-decisions:
  - "Extract to src/backtesting/strategies/ rather than fix strategy-registry — registry's broken defaultParams are explicitly out of scope for M2-01"
  - "Pure file relocation, no behavior changes — preserves all existing CLI semantics"
  - "createStrategyFactory bypasses strategy-registry entirely (constructor-key mapping is local to the factory)"

patterns-established:
  - "Reusable adapters live in src/backtesting/strategies/, not in src/cli/"
  - "CLI files import from backtesting modules, never the reverse"

# Metrics
duration: 3min
completed: 2026-05-30
---

# Phase 07 Plan 02: Extract StrategyAdapter & createStrategyFactory Summary

**Moved StrategyAdapter class and createStrategyFactory function out of `src/cli/backtest-commands.ts` into a new reusable module at `src/backtesting/strategies/strategy-adapter.ts` so the M2-01 reality-check runner can construct strategies without depending on the CLI layer.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-31T01:56:23Z
- **Completed:** 2026-05-31T01:59:22Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created `src/backtesting/strategies/strategy-adapter.ts` (111 lines) exporting `StrategyAdapter` class + `createStrategyFactory` function
- Removed both local definitions from `src/cli/backtest-commands.ts` (1 insertion / 94 deletions); all 4 internal call sites now resolve to the imported symbols
- Plan 05 reality-check runner can now `import { StrategyAdapter, createStrategyFactory } from '../backtesting/strategies/strategy-adapter.js'` without any upward dependency on the CLI layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/backtesting/strategies/strategy-adapter.ts** — `920c0dc` (refactor)
2. **Task 2: Update src/cli/backtest-commands.ts to import from new module** — `0b5370e` (refactor)

## Files Created/Modified

- `src/backtesting/strategies/strategy-adapter.ts` (NEW, 111 lines) — Exports `StrategyAdapter` class (adapts `MomentumStrategy`/`MeanReversionStrategy` `.analyze()` into the `BacktestStrategy` interface) and `createStrategyFactory(strategyName: string)` (factory returning parameterized constructors). JSDoc explicitly notes the intentional bypass of `strategy-registry.ts`'s broken momentum defaults.
- `src/cli/backtest-commands.ts` (MODIFIED, −93 net lines) — Removed local `class StrategyAdapter` (was lines 28-83) and local `function createStrategyFactory` (was lines 837-865); added `import { StrategyAdapter, createStrategyFactory } from '../backtesting/strategies/strategy-adapter.js';`. All 4 internal usages (lines 99, 202, 283, 382 of new file) preserved.

### Confirmed Export Signatures

```typescript
export class StrategyAdapter implements BacktestStrategy {
  constructor(
    private strategy: MeanReversionStrategy | MomentumStrategy,
    private strategyName: string
  )
  getName(): string
  async generateSignal(symbol: string, _currentData: HistoricalDataPoint, historicalData: HistoricalDataPoint[]): Promise<Signal>
  async onBar(symbol: string, _bar: HistoricalDataPoint, historicalData: HistoricalDataPoint[]): Promise<Signal | null>
  async initialize(): Promise<void>
  async cleanup(): Promise<void>
}

export function createStrategyFactory(
  strategyName: string
): (params: Record<string, unknown>) => BacktestStrategy
```

### Smoke Test Result

```bash
$ pnpm tsx -e "import { StrategyAdapter, createStrategyFactory } from './src/backtesting/strategies/strategy-adapter.js'; const f = createStrategyFactory('momentum'); const s = f({}); console.log('name:', s.getName());"
name: momentum
StrategyAdapter: function
```

(Note: plan's example used `s.name` but the adapter exposes `.getName()` — used the correct accessor.)

### CLI Regression Test Result

Ran both `pnpm start backtest run SPY --strategy momentum` and `pnpm start backtest compare SPY`. Both commands:
- Loaded without `TypeError` / `undefined function` (proves symbol resolution works)
- Reached the data-fetch stage (proves the action handler executed)
- Failed only at "Insufficient historical data" / Finnhub 403 — pre-existing data infrastructure issue unrelated to this refactor (Yahoo fallback hit "minimum 50 periods required")

Per the plan's explicit verification criteria: "errors only acceptable if they're data-fetch related, not symbol resolution" — this is the acceptable failure mode.

## Decisions Made

- **Followed plan as specified.** No design choices made beyond what the plan dictated.
- **One minor deviation from the plan's verification example:** Used `s.getName()` instead of the example's `s.name` in the smoke test, because `StrategyAdapter` implements the `BacktestStrategy` interface via the method form (`getName(): string`). The interface allows both, but only the method form is implemented on this class.

## Deviations from Plan

None - plan executed exactly as written. The only adjustment was using `s.getName()` instead of `s.name` in the verification smoke test command (the property `s.name` would have returned `undefined` because this adapter uses the method form). This is a fix to the plan's example command, not a deviation from the work specified.

## Issues Encountered

- **Edit revert mid-flight on Task 2:** After applying the first edit (remove class, add import), a snapshot showed the class still present. Verified via grep that the edit had actually taken effect — the snapshot was stale. Continued with the second edit (remove function) without issue.
- **Unrelated unstaged change in `src/data/market-data-service.ts`:** Pre-existing in-flight work referencing an M2-01 universe prefetch. Left unstaged and uncommitted — not part of plan 07-02 scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05 (M2-01 reality-check runner) can now `import { StrategyAdapter, createStrategyFactory } from '../backtesting/strategies/strategy-adapter.js'` without depending on the CLI layer.
- No blockers introduced. Build clean. Existing CLI behavior preserved.
- `strategy-registry.ts` still has the broken momentum `defaultParams` keys (`emaPeriod`, `rsiPeriod` instead of `shortMA`, `longMA`) — intentionally left as-is per plan scope. A future cleanup phase should address this.

---
*Phase: 07-strategy-reality-check*
*Completed: 2026-05-30*
