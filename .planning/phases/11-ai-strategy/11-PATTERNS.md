# Phase 11 (M2-05): AI-Augmented Strategy Engine - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 20 (Wave A-G from RESEARCH.md §10)
**Analogs found:** 18 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/market-intelligence/signal/catalyst-loader.ts` (extract, Wave A1) | utility | CRUD (read) | `src/market-intelligence/signal/rollup-builder.ts` (`loadActiveCatalysts`, private method to extract) | exact |
| `src/analysis/technical-indicators.ts` (add public `calculateATRSeries`, Wave A2) | utility | transform | same file, existing private `calculateATR` | exact |
| `src/strategy/vix-provider.ts` (Wave A3) | service | request-response (cached fetch) | `src/data/providers/yahoo-finance-provider.ts` (`fetchHistoricalDataRange`) | role-match |
| `src/strategy/types.ts` (Wave B1) | model | transform | `src/market-intelligence/signal/types.ts` | exact |
| `src/strategy/signals/catalyst-anchored.ts` (Wave B2) | service | transform | `src/market-intelligence/signal/catalyst-refiner.ts` | exact |
| `src/strategy/signals/sentiment-velocity.ts` (Wave B3) | service | transform | `src/market-intelligence/signal/rollup-builder.ts` | role-match |
| `src/strategy/signals/sector-rotation.ts` (Wave B4) | service | transform | `src/market-intelligence/signal/pm-mapping-engine.ts` | exact |
| `src/strategy/signals/fade-overshoot.ts` (Wave B5, shadow-only per CONTEXT) | service | transform | `src/market-intelligence/signal/pm-mapping-engine.ts` | role-match |
| `src/strategy/strategy-engine.ts` (Wave C1) | service | CRUD (orchestrator) | `src/market-intelligence/signal/rollup-builder.ts` (`RollupBuilder`) | role-match |
| `src/strategy/decision-log.ts` (Wave C2) | model/store | event-driven (append + reconcile) | `src/market-intelligence/signal/backlog-drain.ts` (append-by-day + lock precedent) + `src/market-intelligence/storage/jsonl-store.ts` | exact |
| `src/strategy/cli/strategy-commands.ts` (Wave D1) | route (CLI) | request-response | `src/market-intelligence/cli/intel-commands.ts` | exact |
| `src/index.ts` (register `registerStrategyCommands`, Wave D2) | config | — | same file, existing `registerIntelCommands(program)` / `registerBacktestCommands(program)` calls | exact |
| `src/strategy/backtest/live-window-runner.ts` (Wave E1) | service | batch | `src/market-intelligence/signal/rollup-backfill.ts` (`backfillMissingRollups` day-iteration) + `src/backtesting/strategies/strategy-adapter.ts` | role-match |
| `strategy backtest` CLI action (Wave E2, in `strategy-commands.ts`) | route (CLI) | batch | `intel-commands.ts` `backlog-drain` command (progress-reporting CLI wrapping a batch op) | exact |
| `web/frontend/src/pages/StrategyPage.tsx` (Wave F1) | component | request-response | *(no direct analog found — see below)* | no-analog |
| `src/web/server.ts` (`/api/strategy/*` routes, Wave F2) | route | CRUD | existing `/api/monitoring/*` routes in same file (not read this session — grep-confirmed to exist; use `optionalAuthMiddleware`) | role-match |
| `src/strategy/__tests__/*.test.ts`, `src/strategy/signals/__tests__/*.test.ts` | test | — | `src/market-intelligence/signal/__tests__/rollup-backfill.test.ts` | exact |
| `config/strategy-config.json` (Wave A/B) | config | — | `config/pm-market-mappings.json` (JSON config, `addedBy`/`addedAt` provenance convention) | role-match |
| `data/strategy/` directory (created on first write) | — | file-I/O | `data/intel/` (JsonlStore-managed) | exact |
| Article-intake materiality pre-screen (replaces `isPriorityArticle`, CONTEXT.md "Article intake thrift") | utility | transform | `src/market-intelligence/scheduler/cycle-runner.ts` (`isPriorityArticle`, lines 73-80) | exact |

## Pattern Assignments

### `src/strategy/types.ts` (model, transform)

**Analog:** `src/market-intelligence/signal/types.ts`

**File-header + import pattern** (lines 1-14):
```typescript
/**
 * M2-04 LLM Trade-Signal Layer — shared types.
 * ... (contract-between-modules doc comment, single-writer JsonlStore note)
 */
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
```
Mirror this shape for `src/strategy/types.ts`: doc comment stating this is the contract between `src/strategy/signals/*`, `strategy-engine.ts`, `decision-log.ts`, and the CLI; import `TickerDaySummary`, `CatalystFlag`, `CatalystType`, `CatalystDirection` from `../market-intelligence/signal/types.js` (cross-module reuse — do not redefine).

**Union-type pattern** (lines 20-44): `CatalystType`/`CatalystDirection` are plain string-literal unions, each documented member on its own line. Use identical style for `SignalType = "CATALYST_ANCHORED" | "SENTIMENT_VELOCITY" | "SECTOR_ROTATION_FROM_PM" | "FADE_OVERSHOOT"` and `VixRegime = "calm" | "elevated" | "stressed"`.

**Record-interface pattern** (lines 121-154, `TickerDaySummary`): every field has an inline `//` comment stating units/range (e.g. `weightedSentiment: number; // [-1,+1]`). `StrategyCandidate` and `StrategyDecisionRecord` (schema already fully specified in CONTEXT.md §Decision Tracking / RESEARCH.md §5) must follow the same per-field comment convention, and state "Persisted to `data/strategy/...-YYYY-MM-DD.jsonl`" in a doc comment above the interface, exactly as `TickerDaySummary` does at lines 117-120.

---

### `src/strategy/signals/catalyst-anchored.ts` (service, transform)

**Analog:** `src/market-intelligence/signal/catalyst-refiner.ts` (152 lines — read in full is cheap; also cross-reference `pm-mapping-engine.ts`'s `TickerSignal` output-array pattern for the candidate-array return shape)

**Constructor / options pattern** (from `pm-mapping-engine.ts` lines 77-108 — this is the canonical `{ dataDir }` options-object shape referenced by the hint, verified this session):
```typescript
export interface PmMappingEngineOptions {
  /** Path to the JSON mapping config. Default: ./config/pm-market-mappings.json */
  configPath?: string;
  /** Directory for proposal JSONL persistence. Default: ./data/intel */
  dataDir?: string;
}

export class PmMappingEngine {
  private readonly configPath: string;
  private readonly proposalStore: JsonlStore<PmMappingProposal>;
  private mappings: PmMapping[] | null = null;

  constructor(options: PmMappingEngineOptions = {}) {
    this.configPath =
      options.configPath ?? path.resolve("./config/pm-market-mappings.json");
    this.proposalStore = new JsonlStore<PmMappingProposal>(
      options.dataDir ?? "./data/intel",
      "pm-mappings-proposed",
    );
  }
  // ...
}
```
Every `src/strategy/signals/*.ts` module class should take an `Options = {}` object defaulting `dataDir` to `"./data/strategy"` (or read substrate from `"./data/intel"` where the analog is M2-04 data — signal modules need BOTH: `dataDir` for their own writes, and a separate default path for reading `ticker-day-summary`/`catalyst-flags`; follow `RollupBuilder`'s constructor at `rollup-builder.ts:58` for the two-directory case if applicable), and stateless `score()`/`generateCandidates()` methods with no LLM calls inside (`PmMappingEngine`'s file-header explicitly documents "Stateless engine — no LLM call inside").

**Score-formula-as-pure-function pattern:** CONTEXT.md's §Ranking formulas (reproduced verbatim in RESEARCH.md §3) should be implemented as small, independently-testable pure functions (`score(catalyst: CatalystFlag): number`), matching the doc-comment-with-worked-example style at `pm-mapping-engine.ts` lines 16-35 ("Sign math" table + "Worked example (M2-03 canonical Iran ceasefire signal)"). Each signal module's score function should carry a similar worked-example comment using the Iran/XLE fixture CONTEXT.md calls out as the canonical happy path.

---

### `src/strategy/decision-log.ts` (model/store, event-driven append + reconcile)

**Analog:** `src/market-intelligence/storage/jsonl-store.ts` (persistence primitive, use directly — do not reimplement) + `src/market-intelligence/signal/backlog-drain.ts` (day-bucketed append precedent)

**Persistence primitive — use as-is, do not hand-roll** (`jsonl-store.ts` lines 15-45):
```typescript
export class JsonlStore<T extends object> {
  constructor(dir: string, streamName: string) { ... }
  async append(record: T): Promise<void> { ... }          // appends to today's file
  async appendMany(records: T[]): Promise<void> { ... }
  async appendManyOn(records: T[], date: Date): Promise<void> { ... } // day-bucketed
  async readDay(date: Date): Promise<T[]> { ... }
  async readRecent(hours: number): Promise<T[]> { ... }
  private fileFor(date: Date): string {                    // ${dir}/${streamName}-YYYY-MM-DD.jsonl
    ...
  }
}
```
`decision-log.ts` should wrap `new JsonlStore<StrategyDecisionRecord>(dataDir, "decisions")` and add domain methods (`recordAccept`, `recordSkip`, `recordClose`, `readDay`, `readRecentDedupedByCandidateId`) — mirror the "thin domain wrapper over JsonlStore" shape used by `pm-mapping-engine.ts`'s `proposalStore` field.

**Append + reconcile-at-read-time pattern** (RESEARCH.md §5, precedented by `backlog-drain.ts`'s day-bucketed writes at lines 74-98): append-only writes for accept/skip/close (never rewrite past records); readers must dedup by `candidateId`, taking the record with the latest `closedAt ?? decidedAt`. Follow `persistDrainedRecords`'s day-bucketing style (`byDay` Map keyed by ISO date, `store.appendManyOn(records, new Date(...))` per day) if `decision-log.ts` ever needs to backfill or replay records across days (e.g. for the live-window backtest's decision reconstruction).

**Lock-file precedent** (only if `decision-log.ts` or the backtest runner needs mutual exclusion with a live `strategy run`): `backlog-drain.ts` lines 34-131 — `DRAIN_LOCK_FILE`/`DRAIN_LOCK_STALE_MS` constants, `isDrainLocked`/`acquireLock`/`releaseDrainLock` functions, 2-hour staleness window, `finally { await release(); }` around the guarded work. Reuse this exact shape (`isDrainLocked(dataDir)` check per Pitfall #4 in RESEARCH.md) rather than inventing a new lock mechanism.

---

### `src/strategy/cli/strategy-commands.ts` (route/CLI, request-response)

**Analog:** `src/market-intelligence/cli/intel-commands.ts`

**Imports pattern** (lines 1-33):
```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import ora from "ora";
import { SecureConfig } from "../../config/secure-config.js";
// ... local module imports with relative .js extensions (NodeNext ESM)
```

**Registration function pattern** (line 282):
```typescript
export function registerIntelCommands(program: Command): void {
  program
    .command("intel")
    ...
}
```
`strategy-commands.ts` should export `registerStrategyCommands(program: Command): void`, with each subcommand as its own `.command("...")` block — note the Commander gotcha documented in RESEARCH.md §6: hyphenated single-word names only (`list-candidates`, `decisions-summary`, `show-substrate`), never `.command("list candidates")` (interpreted as one literal command name, not nested subcommands).

**Subcommand shape — option/action/progress pattern** (`backlog-drain` command, lines 739-780):
```typescript
.command("backlog-drain")
.description("Score every article queued in score-backlog.jsonl (LLM was down), filing each into its publish day and rebuilding those days' rollups")
.option("--max <n>", "Stop after N articles (default: drain everything)")
.option("--batch <n>", "Articles per batch", "50")
.option("--manage-server", "...", false)
.action(async (opts: { max?: string; batch: string; manageServer: boolean }) => {
  await ensureConfig();
  const llm = resolveLlmConfig();
  const max = opts.max === undefined ? undefined : Number(opts.max);
  const batchSize = Number(opts.batch);
  if ((max !== undefined && (!Number.isFinite(max) || max <= 0)) || !Number.isFinite(batchSize) || batchSize <= 0) {
    console.error("--max and --batch must be positive numbers.");
    process.exit(2);
  }
  // ... chalk.cyan/chalk.green status lines, size checks before doing work
})
```
Use this exact shape for `strategy run`, `strategy accept <candidateId>`, `strategy backtest`, etc.: numeric CLI args validated with `Number.isFinite` + explicit `process.exit(2)` on bad input (this is also the ASVS V5 input-validation control RESEARCH.md flags for `--entry/--target/--stop/--size`), `chalk` for status coloring, early-return on empty-state ("Backlog is empty" → mirror for "No candidates above threshold today").

**Registration site** (`src/index.ts`):
```typescript
import { registerBacktestCommands } from "./cli/backtest-commands.js";
import { registerIntelCommands } from "./market-intelligence/cli/intel-commands.js";
...
registerBacktestCommands(program);   // line 1030
registerIntelCommands(program);      // line 1041
```
Add `import { registerStrategyCommands } from "./strategy/cli/strategy-commands.js";` and `registerStrategyCommands(program);` alongside these two calls.

---

### `src/strategy/backtest/live-window-runner.ts` (service, batch)

**Analog:** `src/market-intelligence/signal/rollup-backfill.ts` (day-iteration + reuse-don't-reimplement pattern) + `src/backtesting/analytics/performance-metrics.ts` (`PerformanceMetricsCalculator.calculate`, use directly)

**Day-iteration + rebuild-helper reuse pattern** (`backlog-drain.ts` lines 176-190, same shape `rollup-backfill.ts` uses internally):
```typescript
const engine = new PmMappingEngine({ dataDir });
const builder = new RollupBuilder({ dataDir });
for (const day of Array.from(touched).sort()) {
  try {
    await rebuildRollupForDay(dataDir, day, engine, builder);
    rollupsRebuilt.push(day);
  } catch (err) {
    rollupsFailed.push({ date: day, error: err instanceof Error ? err.message : String(err) });
  }
}
```
`live-window-runner.ts` should iterate real dates 2026-05-23→today per the per-signal-type usable-range table in RESEARCH.md §8, calling `StrategyEngine.generateCandidates(asOfDate)` per day, and reuse `loadPmSignalsForDay(dataDir, date, engine)` (`rollup-backfill.ts:125`) for any day needing PM-signal re-derivation — do not reimplement PM-signal reconstruction (RESEARCH.md's "Don't Hand-Roll" table, row 4).

**Metrics-calculation entry point — call directly, skip regime windowing** (`performance-metrics.ts` lines 12-27):
```typescript
export class PerformanceMetricsCalculator {
  static calculate(
    equityCurve: EquityCurvePoint[],
    trades: Trade[],
    initialCapital: number,
    startDate: Date,
    endDate: Date,
    totalCommissions: number,
    totalSlippage: number
  ): PerformanceMetrics {
    if (equityCurve.length === 0) return this.getEmptyMetrics(startDate, endDate);
    ...
  }
}
```
Per RESEARCH.md §8, call `PerformanceMetricsCalculator.calculate()` directly on a synthetic equity curve built from candidate entry/target/stop outcomes — do **not** route through `regime-segmenter.ts`'s `sliceByRegime`/`metricsByRegime` (no 2026 window exists in `REGIMES`). Label output "single continuous 2026 window — interim, not the per-regime bar" per CONTEXT.md's 2026-08-27 backtest-acceptance decision.

**Adapter precedent (bar-order gotcha)** — `strategy-adapter.ts` lines 1-50: documents the newest-first vs. oldest-first bar-ordering trap that silently broke M2-01's SELL conditions (`STRATEGY_HISTORY_WINDOW = 300` trimming, explicit reverse-with-rationale comment). If `live-window-runner.ts` or any signal module consumes `HistoricalData`/bars from `MarketDataService`, copy this file's doc-comment discipline: state explicitly which order the data arrives in and which order the consumer expects, with a one-line rationale, not just a bare `.reverse()`.

---

### Article intake materiality pre-screen (utility, transform)

**Analog:** `src/market-intelligence/scheduler/cycle-runner.ts` lines 73-80 (`isPriorityArticle`, the hook this replaces)

```typescript
function isPriorityArticle(article: NewsArticle, watchlist: Set<string>): boolean {
  if (article.tickers.some((t) => watchlist.has(t.toUpperCase()))) return true;
  const hay = `${article.headline} ${article.summary ?? ""}`.toLowerCase();
  for (const kw of MACRO_KEYWORDS) {
    if (hay.includes(kw)) return true;
  }
  return false;
}
```
Used at (lines 485-489) as a stable sort comparator:
```typescript
const pa = isPriorityArticle(a, watchlistSet);
const pb = isPriorityArticle(b, watchlistSet);
if (pa !== pb) return pa ? -1 : 1;
return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
```
Per CONTEXT.md's "Article intake thrift" decision (2026-08-27), the new pre-screen replaces the boolean `isPriorityArticle` with a ranked `predictMateriality(article): number` (P(materiality ≥ 0.5) proxy from source-feed + ticker-tag + topic-bucket features) used the same way — as a sort key feeding the existing 500/day soft cap — not as a hard filter. Keep the function pure/synchronous (no LLM calls) exactly like `isPriorityArticle`, and keep the call site's stable-sort-then-slice shape unchanged; only the ranking function's internals change.

---

## Shared Patterns

### Module class shape (`{ dataDir }` options + JsonlStore field)
**Source:** `src/market-intelligence/signal/pm-mapping-engine.ts` lines 77-108 (constructor), `src/market-intelligence/storage/jsonl-store.ts` (persistence primitive)
**Apply to:** every `src/strategy/signals/*.ts` module, `strategy-engine.ts`, `decision-log.ts`, `vix-provider.ts`
```typescript
export interface XOptions {
  dataDir?: string; // Default: ./data/strategy (or ./data/intel for substrate reads)
}
export class X {
  private readonly store: JsonlStore<SomeRecord>;
  constructor(options: XOptions = {}) {
    this.store = new JsonlStore<SomeRecord>(options.dataDir ?? "./data/strategy", "stream-name");
  }
}
```

### JsonlStore — the only persistence primitive to use
**Source:** `src/market-intelligence/storage/jsonl-store.ts`
**Apply to:** `decision-log.ts` (`decisions` stream), any new candidate-cache stream under `data/strategy/`
Do not hand-roll file I/O — `append`, `appendManyOn` (day-bucketed), `readDay`, `readRecent` cover every access pattern M2-05 needs (RESEARCH.md "Don't Hand-Roll" table, row 3).

### Lock file for concurrent-writer safety
**Source:** `src/market-intelligence/signal/backlog-drain.ts` lines 34-131
**Apply to:** `live-window-runner.ts` / `strategy backtest` (Pitfall #4 — check `isDrainLocked(dataDir)` before reading a "hot" recent-day `ticker-day-summary`), and to `strategy run` if it's ever made concurrent with itself.

### CLI registration + Commander naming convention
**Source:** `src/market-intelligence/cli/intel-commands.ts` (`registerIntelCommands`), `src/index.ts` (registration site)
**Apply to:** `strategy-commands.ts`'s `registerStrategyCommands`, and all 9 subcommands listed in RESEARCH.md §6. Hyphenated single-word command names only.

### Config-file provenance convention (`addedBy`/`addedAt`)
**Source:** `config/pm-market-mappings.json` (`PmMapping.addedBy`/`addedAt` fields, `types.ts` lines 196-197)
**Apply to:** `config/strategy-config.json` — if it grows beyond a flat `{ assumedEquity: 7500 }`, follow the same `addedBy: "manual-<date>"` provenance convention for any hand-curated entries (e.g. future custom ATR multiplier overrides).

### Vitest test structure (`fs.mkdtemp` isolated data dir)
**Source:** `src/market-intelligence/signal/__tests__/rollup-backfill.test.ts`
**Apply to:** every `src/strategy/**/__tests__/*.test.ts`
```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
let dataDir: string;
beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "<module>-"));
});
afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
function fixture(overrides: Partial<T> = {}): T {
  return { /* realistic defaults */ ...overrides };
}
async function writeFixtureFile(date: string, rows: T[]): Promise<void> {
  await fs.writeFile(path.join(dataDir, `<stream>-${date}.jsonl`), rows.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
}
```
Use the real 36-ticker universe from RESEARCH.md §0 (`AAPL, AMZN, COIN, GLD, ..., XLY`) and the Iran-ceasefire canonical fixture shape in signal-module and worked-example tests, not an invented universe.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/frontend/src/pages/StrategyPage.tsx` | component | request-response | No existing React page in this codebase was read this session to confirm a card-list/empty-state pattern; RESEARCH.md §7 scopes this file's fields (candidate cards, VIX/regime header, empty-state copy) but no analog page was located in the time budget. Planner should grep `web/frontend/src/pages/*.tsx` for the nearest existing SPA page (likely a monitoring or dashboard page consuming `/api/monitoring/*`) before writing this file from scratch. |

## Metadata

**Analog search scope:** `src/market-intelligence/signal/`, `src/market-intelligence/cli/`, `src/market-intelligence/storage/`, `src/market-intelligence/scheduler/`, `src/backtesting/strategies/`, `src/backtesting/analytics/`, `src/data/providers/`, `config/`
**Files read in full or targeted this session:** `types.ts`, `jsonl-store.ts`, `backlog-drain.ts`, `pm-mapping-engine.ts` (header + constructor), `intel-commands.ts` (imports + `backlog-drain` command + registration), `cycle-runner.ts` (`isPriorityArticle`), `strategy-adapter.ts` (header), `performance-metrics.ts` (header + `calculate` signature), `rollup-backfill.test.ts` (fixture pattern), `src/index.ts` (registration lines)
**Pattern extraction date:** 2026-08-27
