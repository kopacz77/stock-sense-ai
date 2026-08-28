# Phase 11 (M2-05): AI-Augmented Strategy Engine — Research

**Researched:** 2026-06-02
**Domain:** Multi-signal candidate generation, ranking, sizing, and CLI/dashboard surface on top of M2-04 substrate
**Confidence:** HIGH on substrate (read code), MEDIUM on score-formula calibration (no live data yet), LOW on backtest fidelity (structural data gap)

## Summary

M2-05 wires four signal-type modules to read the existing M2-04 query surface (`TickerDaySummary` per-ticker-day rollup + `CatalystFlag` calendar + `TickerSignal[]` from `PmMappingEngine`), runs each module to emit per-type candidates, ranks them by pure per-type score, applies VIX-regime sizing, suggests entry/target/stop from per-type ATR multipliers, and persists accept/skip decisions to a daily JSONL stream. Surface is a `strategy` CLI subcommand group (mirroring `intel`) plus one minimal `/strategy` web route.

The M2-04 substrate **exists in code and is correctly typed**. The data layer (`TickerDaySummary` rows, `scored-articles-*.jsonl`) does **NOT exist in production** — the scheduler is still running pre-M2-04 code as of 2026-06-02, and the only on-disk `ticker-day-summary-*.jsonl` file is the M2-04 acceptance fixture (2026-05-31). Backtest validation must therefore choose between expensive historical re-scoring (Option A), PM-only partial validation (Option B), or ship-now-validate-after-30-days (Option C). **Recommendation: Option B + C hybrid.**

VIX is **NOT wired**. ATR **IS** in the codebase (via `technicalindicators` library, default period 14) but only via a *private static method* on `TechnicalIndicators`; M2-05 needs ATR_3 / ATR_5 / ATR_10 — small extraction work required. Yahoo Finance provider supports arbitrary tickers including `^VIX`; the existing `fetchHistoricalDataRange` method handles it without new code.

**Primary recommendation:** Build `src/strategy/` as a parallel module to `src/market-intelligence/signal/` (sibling-of, not nested-in). Four signal-type modules implement a common `SignalTypeModule` interface; a `StrategyEngine` orchestrates the read/score/rank/size pipeline; persistence via the existing `JsonlStore` pattern. Backtest path uses a `MultiSignalBacktestStrategy` that wraps the engine for the `BacktestStrategy` interface (Option B uses real PM history; Options A/C scope it later).

## 1. M2-04 Substrate Inventory

The planner can name these concrete symbols in tasks. All shapes confirmed by direct read of `src/market-intelligence/signal/`.

### `TickerDaySummary` (primary query surface)
- File: `src/market-intelligence/signal/types.ts:121-154`
- Persisted at: `data/intel/ticker-day-summary-YYYY-MM-DD.jsonl` (one row per ticker per day; idempotently rewritten by `RollupBuilder`)
- Fields M2-05 reads:
  - `date`, `ticker`, `weightedSentiment ∈ [-1,+1]`, `totalMateriality`, `articleCount`, `themes[]`
  - `activeCatalystIds[]` — string ids that join to `CatalystFlag` records
  - `pmContribution.netScore` (signed) and `pmContribution.sources[]` (per-market breakdown with `marketId`, `slug`, `movePp`, `direction`, `weight`, `contributedScore`, `volume24hr`)
- Reading: use `JsonlStore<TickerDaySummary>(dataDir, "ticker-day-summary").readDay(date)` — no custom parsing needed. See `src/market-intelligence/storage/jsonl-store.ts`.

### `CatalystFlag` (the calendar)
- File: `src/market-intelligence/signal/types.ts:90-108`
- Persisted at: `data/intel/catalyst-flags-YYYY-MM-DD.jsonl` (append-only; dedup at read by `id` taking latest `lastRefinedAt ?? firstSeenAt`)
- Fields M2-05 reads: `id`, `type` (`CatalystType` union — 22 cases), `tickers[]`, `affectedSectors[]`, `expectedDate`, `expectedTimeEt`, `magnitudePrior 1-5`, `direction` (`up|down|uncertain|binary`), `confidence ∈ [0,1]`, `archived`
- Reading pattern: there is no shared loader API; copy the dedup+filter logic from either `RollupBuilder.loadActiveCatalysts` (`src/market-intelligence/signal/rollup-builder.ts:163-191`) OR `loadAllUpcomingCalendarEvents` in `src/market-intelligence/cli/intel-commands.ts:133-169`. **Recommend extracting to a shared helper** (e.g. `src/market-intelligence/signal/catalyst-loader.ts`) as the first task — both M2-05 and the CLI need it, and the intel CLI comment explicitly notes the duplication: "replicated here to avoid coupling the CLI to RollupBuilder's private API."

### PM `TickerSignal[]` (from `PmMappingEngine.mapMarkets`)
- File: `src/market-intelligence/signal/pm-mapping-engine.ts:53-69`
- Shape: `{ ticker, direction, weight, contributedScore, movePp, sourceMarketId, sourceSlug, sourceEventSlug?, sourceQuestion, sourceVolume24hr, matchedBy }`
- This is the in-memory shape that flows through `runCycle` — `pmMapResult.tickerSignals` at `cycle-runner.ts:229`. M2-05 does **not** need to call the engine itself if it reads `TickerDaySummary.pmContribution.sources[]`, which already encodes the per-market contributions for that ticker (just lacks `sourceQuestion` and `matchedBy` — both omittable for v1).

### `ScoredArticle` (for `SENTIMENT_VELOCITY` 3-day Δ math)
- File: `src/market-intelligence/signal/types.ts:53-71`
- Persisted at: `data/intel/scored-articles-YYYY-MM-DD.jsonl`
- For SENTIMENT_VELOCITY, M2-05 must reach **past** rollups, not just today's. The simplest path: read `ticker-day-summary-*.jsonl` for the last 3-7 days and compute Δ in `weightedSentiment × totalMateriality` per ticker. Avoids touching the raw per-article stream.

### `PmMapping` config (for SECTOR_ROTATION_FROM_PM rationale text)
- File: `src/market-intelligence/signal/types.ts:174-190`
- Loaded by `PmMappingEngine` from `config/pm-market-mappings.json`. M2-05 can re-use it to render rationale ("XLE long via iran-ceasefire-continues-through mapping, noPp interpretation, weight 1.0").

### Data directory conventions
- All M2-04 streams live under `./data/intel/`. M2-05 should write under `./data/strategy/` (per CONTEXT.md). Create the directory in the first task; keep paths absolute via `path.resolve()` consistent with the rest of the codebase.

## 2. VIX + ATR + Price-Data Gap Analysis

### VIX — NOT wired
- **Search confirmation:** `grep -rn "VIX\|\^VIX" src/` returns only the polymarket relevance filter exclusion keyword (`"vix"` at `src/market-intelligence/polymarket/relevance-filter.ts:78`). No data fetcher, no regime classifier exists.
- **Effort to add:** Low. `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` (`src/data/providers/yahoo-finance-provider.ts:63`) accepts arbitrary symbols including indices. `^VIX` is a standard Yahoo symbol. Build a `VixProvider` thin wrapper that calls `fetchHistoricalDataRange("^VIX", from, to)`, caches today's close, and exposes `classifyRegime(vixClose): "calm" | "elevated" | "stressed"` with CONTEXT-locked thresholds (calm<15 / elevated 15-25 / stressed>25).
- **Cache strategy:** Reuse `DataCacheManager` (`src/data/cache-manager.ts`) so backtest reruns hit cache. Live mode: refresh once per cycle, fall back to "elevated" if fetch fails (conservative default — sizes positions smaller when VIX is unknown). Persist the latest known regime to `data/strategy/vix-regime-cache.json` for survival across process restarts.
- **Risk:** Yahoo unofficial API may rate-limit on a regulated symbol. Pre-warm by adding `^VIX` to the existing M2-01 prefetch universe for 2018-2025 backtest data — that fetches once, caches forever, and survives any future Yahoo API change.

### ATR — present but private
- **Confirmation:** `technicalindicators` package's `ATR` class is imported and wrapped in `TechnicalIndicators.calculateATR(data, period=14)` at `src/analysis/technical-indicators.ts:248-258`. **However**, the method is `private static` and only exposed indirectly through the full `TechnicalIndicators.calculate()` aggregate (which computes 13 other indicators and requires `data.open.length >= 50`).
- **M2-05 needs:** ATR_3, ATR_5, ATR_10 per ticker, on the most recent 30-60 bars. The 50-bar validation is irrelevant for short-period ATR.
- **Recommendation:** Add a public `static calculateATRSeries(data: PriceData, period: number): number[]` to `TechnicalIndicators` (returns the full ATR series rather than just the latest value). One new task, ~30 LOC, plus matching unit tests. Avoid making M2-05 reach into `technicalindicators` directly — keeps the wrapper layer consistent.
- **Source of price data for ATR:** The `MarketDataService.fetchHistoricalData(symbol, from, to)` method (`src/data/market-data-service.ts:473-535`) already returns OHLCV with Yahoo fallback; that's what M2-05 should call per candidate to compute entry/target/stop.

### Price data for entry/target/stop math
- **Live:** `marketDataService.getFullAnalysisData(symbol)` returns `{ quote, historical }` in one cached read (`src/data/market-data-service.ts:377-395`). `quote.price` is the latest close; `historical[0..N-1]` are the recent N bars (newest-first) — sufficient for ATR_3 / ATR_5 / ATR_10.
- **Backtest:** Same prefetch cache at `data/cache/historical/{symbol}_2018-01-01_2025-12-31.json` (confirmed — 37 files present). The backtest engine's `DataProvider` already wraps this.
- **No new data plumbing needed** — M2-05 layers on top of the existing market-data infrastructure.

## 3. Per-Signal-Type Score Formulas

CONTEXT.md provides high-level math; below are the recommended explicit functions the planner can codify in tasks. Each returns a 0-1 score and an attached human-readable rationale string. Each is pure — given (rollup row, history, calendar, optional reference data), produces the same output.

```typescript
// CATALYST_ANCHORED
score(catalyst: CatalystFlag): number {
  const magNorm = catalyst.magnitudePrior / 5;  // 1..5 → 0.2..1.0
  return Math.min(1, magNorm * catalyst.confidence);
}
// Tie-break: prefer closer expectedDate (earlier signal value decays as event passes)
// Direction: catalyst.direction (refined by CatalystRefiner)

// SENTIMENT_VELOCITY
// Δsentiment = today's weighted sentiment - 3-day prior weighted sentiment
// (read prior summaries via JsonlStore.readDay)
score(today: TickerDaySummary, threeDaysPrior: TickerDaySummary | undefined): number {
  if (!threeDaysPrior || today.totalMateriality === 0) return 0;
  const delta = today.weightedSentiment - threeDaysPrior.weightedSentiment;
  const materialityFloor = Math.min(today.totalMateriality, 2.0) / 2.0;  // cap at 2.0 total mat
  return Math.min(1, Math.abs(delta) * materialityFloor);
}
// Direction: sign(delta) — positive Δ → long, negative → short

// SECTOR_ROTATION_FROM_PM
// Reads TickerDaySummary.pmContribution
score(rollup: TickerDaySummary): number {
  const totalMovePp = rollup.pmContribution.sources.reduce(
    (acc, s) => acc + Math.abs(s.movePp * s.weight), 0
  );
  const totalVolume = rollup.pmContribution.sources.reduce(
    (acc, s) => acc + s.volume24hr, 0
  );
  const ppNorm = Math.min(1, totalMovePp / 10);            // cap at 10pp aggregate
  const volNorm = totalVolume > 0
    ? Math.min(1, Math.log10(totalVolume) / 7)             // cap at $10M (log10 = 7)
    : 0;
  return ppNorm * volNorm;
}
// Direction: sign(netScore) — positive → long, negative → short

// FADE_OVERSHOOT
// overshoot_pp = today's PM netScore (or sentiment-velocity Δ) minus 7-day rolling mean
// Recency: time since the overshoot started (hour count)
score(overshootPp: number, hoursSinceOvershoot: number): number {
  const magnitude = Math.min(1, Math.abs(overshootPp) / 15);  // cap at 15pp
  const recencyDecay = Math.max(0.3, 1.0 - 0.7 * (hoursSinceOvershoot / 24));
  return magnitude * recencyDecay;
}
// Direction: OPPOSITE of overshoot sign (counter-trend)
```

**Score floor:** 0.4 (from CONTEXT). Below this, candidate is included in the "sub-threshold top-3" diagnostic list but NOT in the daily emit list.

**Top-N cap:** 5 candidates max per day, sorted by score desc, with **ticker dedup** logic (see Pitfall #1 below).

## 4. Entry / Target / Stop Math (Default ATR Multipliers per Type)

CONTEXT proposes these; below is the planner-ready concrete spec. ATR window varies by type to match the trade horizon.

| Type | Entry | Target | Stop | Horizon (days) |
|------|-------|--------|------|----------------|
| CATALYST_ANCHORED | `close` (need to be in before event) | type-conditional* | `entry - 1.5 * ATR_5 * dirSign` | `daysUntilEvent + 1` |
| SENTIMENT_VELOCITY | `max(close - 0.5*ATR_5, close*0.99)` (pullback) | `close + 2.5 * ATR_5 * dirSign` | `entry - 1.5 * ATR_5 * dirSign` | 5-10 |
| SECTOR_ROTATION_FROM_PM | `close` (or pullback if direction matches) | `close + 2.0 * ATR_10 * dirSign` | `entry - 1.5 * ATR_5 * dirSign` | 10-15 |
| FADE_OVERSHOOT | `close` (opportunistic counter-trend; speed matters) | `close + 1.5 * ATR_3 * fadeSign` | `entry - 1.5 * ATR_5 * fadeSign` | 2-5 |

*CATALYST target table:
- `earnings`: `close + (avgHistoricalEarningsMove * dirSign)` — fallback to `close + 2 * ATR_5 * dirSign` if no historical data available
- `fomc`, `cpi`, `nfp`, `pce`, `gdp`, `ism`, `jolts`, `retail_sales`, `macro_print`: `close + 2 * ATR_5 * dirSign`
- `fda`, `fda_pdufa`: `close + 0.25 * close * dirSign` (25% binary)
- `opec`, `eia_petroleum`: `close + 2 * ATR_5 * dirSign`
- `treasury_auction`: `close + 1 * ATR_5 * dirSign` (smaller move expected)
- `ma`, `lawsuit`, `regulatory`, `product`, `guidance`, `geopolitical`, `other`: `close + 2 * ATR_5 * dirSign` (generic default)

**dirSign:** +1 for `"up"`, -1 for `"down"`, **0 for `"uncertain"`** (skip — don't emit a candidate with no direction), and special handling for `"binary"`: emit TWO candidates with opposite directions if score is high enough (one long, one short, each at 50% size — operator picks one). Document this in the task.

**Sizing (regime × type-modifier):**
```typescript
function suggestSizeUsd(regime: VixRegime, type: SignalType, equity: number): number {
  const regimePct = { calm: 0.25, elevated: 0.125, stressed: 0.0625 }[regime];
  const typeModifier = type === "FADE_OVERSHOOT" ? 0.5 : 1.0;
  return Math.floor(equity * regimePct * typeModifier);
}
```

`equity` source: read `assumedEquity` from `config/strategy-config.json` (planner creates this; defaults to 7500 per CONTEXT). M2-02 later wires real Alpaca balance.

## 5. Decision-Log JSONL Schema

Matching codebase naming conventions (camelCase fields, ISO 8601 timestamps, `id` as composite key). Persisted to `data/strategy/decisions-YYYY-MM-DD.jsonl` via a new `JsonlStore<StrategyDecisionRecord>(./data/strategy, "decisions")`.

```typescript
interface StrategyDecisionRecord {
  /** Composite id: `${YYYY-MM-DD}-${signalType}-${ticker}-${shortHash}` */
  candidateId: string;
  generatedAt: string;       // ISO 8601 when StrategyEngine emitted the candidate
  signalType: "CATALYST_ANCHORED" | "SENTIMENT_VELOCITY" | "SECTOR_ROTATION_FROM_PM" | "FADE_OVERSHOOT";
  ticker: string;
  score: number;             // 0-1 (per-type, used for ranking)
  direction: "long" | "short";
  vixRegime: "calm" | "elevated" | "stressed";
  vixCloseAtGeneration: number;

  // Engine's suggested levels (immutable record of what engine proposed)
  suggestedEntry: number;
  suggestedTarget: number;
  suggestedStop: number;
  suggestedSizeUsd: number;
  atrPeriodUsed: 3 | 5 | 10;
  atrValue: number;
  timeHorizonDays: number;

  // Human-readable rationale (rendered from per-type module)
  rationale: string;
  // Traceability — which source records produced this candidate
  sourceArticleIds: string[];       // for CATALYST/SENTIMENT signals
  sourcePmMarkets: Array<{ marketId: string; slug: string; movePp: number }>;  // for SECTOR/FADE
  sourceCatalystId?: string;        // for CATALYST_ANCHORED

  // Decision (filled when operator accepts or skips)
  decision: "accept" | "skip";
  decidedAt: string;
  operatorEntry: number | null;     // null if skip
  operatorTarget: number | null;
  operatorStop: number | null;
  operatorSizeUsd: number | null;
  operatorNote?: string;             // optional free-text

  // Closing (filled by `strategy close <id> --exit-price X --exit-date Y-M-D`)
  closedAt?: string;
  closeExitPrice?: number;
  closeRealizedPnlUsd?: number;     // computed from operator levels at close time
  closeRealizedPnlPct?: number;
  closeOperatorNote?: string;
}
```

**Append vs rewrite:** The decision file is **append-only** for accept/skip events. The `close` action **appends a new record** with the same `candidateId` and `closedAt` populated — reader logic dedups by candidateId taking the most-recent. This matches the M2-04 `CatalystFlag` pattern and avoids file-rewrite race conditions.

Reader helper: `loadDecisions(days: number)` scans `decisions-*.jsonl` for the last N days, dedups by candidateId (latest-wins), returns the consolidated list.

## 6. CLI Command Surface

Mirror the `intel` subcommand pattern (`src/market-intelligence/cli/intel-commands.ts` — registered from `src/index.ts:1041` via `registerIntelCommands(program)`). Create `src/strategy/cli/strategy-commands.ts` exporting `registerStrategyCommands(program: Command)`.

```
strategy run [--date YYYY-MM-DD] [--max-candidates 5] [--dry-run]
  Generates today's candidates. Writes a draft candidates file
  data/strategy/candidates-YYYY-MM-DD.jsonl (full candidate list including
  sub-threshold). Does NOT log decisions. --dry-run skips file write.

strategy list-candidates [--date YYYY-MM-DD] [--include-skipped] [--include-closed]
  Pretty-prints today's candidate list with score, type, suggested levels,
  rationale, and decision state. Default: today, only undecided.

strategy accept <candidateId> [--entry N] [--target N] [--stop N] [--size N] [--note "..."]
  Logs an accept decision. If level overrides omitted, uses engine's suggestion.

strategy skip <candidateId> [--note "..."]
  Logs a skip decision (operator declined).

strategy close <candidateId> --exit-price N [--exit-date YYYY-MM-DD] [--note "..."]
  Logs a manual close with realized P&L computed from operator levels.

strategy decisions-summary [--days 30]
  Prints rolling stats: total candidates emitted, accept rate, skip rate,
  per-type breakdown, closed-P&L summary. Use to monitor the sweet-spot
  20-40% accept rate from CONTEXT.

strategy backtest --start YYYY-MM-DD --end YYYY-MM-DD [--types CATALYST,SECTOR_ROTATION_FROM_PM] [--out path]
  Runs the engine in backtest mode over a historical window. Default types
  = SECTOR_ROTATION_FROM_PM only (Option B — see §8). Writes per-regime
  Sharpe / MaxDD / win rate to stdout + optional JSON output.

strategy show-vix
  Prints latest VIX close + classified regime. Sanity check the wiring.

strategy show-substrate [--ticker TSLA] [--date YYYY-MM-DD]
  Prints the M2-04 substrate for one ticker on one day (rollup row,
  matched calendar events, PM contributions). Debug helper — invaluable
  when a candidate looks wrong and you need to see the raw inputs.
```

Use `ora` for spinners, `chalk` for colored output, `readline` for any prompts — all already in use by the `intel` commands.

## 7. Web Dashboard Minimal Scope

Existing frontend is a Vite + React 18 + Tailwind app at `/home/kopacz/projects/stock-sense-ai/web/frontend/` with `react-router-dom` routes for `monitoring`, `discovery`, `analysis`, `market`, `settings`, `help` (see `App.tsx`). Backend serves via Express + Socket.IO at `src/web/server.ts` with `/api/*` routes.

**v1 minimal scope (per CONTEXT.md Claude's-Discretion):**

Add **one** route `/strategy` showing today's candidates. Three API endpoints + one page.

**Backend (in `src/web/server.ts`):**
- `GET /api/strategy/candidates?date=YYYY-MM-DD` → returns `{ candidates: [...], vixRegime, generatedAt, scoreFloor }`
- `POST /api/strategy/candidates/:candidateId/accept` body `{ entry?, target?, stop?, size?, note? }` → appends accept record
- `POST /api/strategy/candidates/:candidateId/skip` body `{ note? }` → appends skip record

**Frontend (`web/frontend/src/pages/StrategyPage.tsx`):**
- Card layout per candidate: ticker, type badge (color-coded), score (0-1 bar), direction arrow, suggested entry/target/stop/size, rationale text, "Accept" / "Skip" buttons. Accepting opens a small form to override levels (defaults pre-filled).
- Header: current VIX + regime badge, "5 candidates today (3 above threshold + 2 sub-threshold)" summary.
- Empty state: explicit "No candidates above 0.4 threshold today — capital preserved." copy.

Add tab to `Layout` navigation (`web/frontend/src/components/layout/`). Tab key `strategy`. Allow `keyboard shortcut Ctrl+5` for consistency with other tabs.

**Out of scope for v1:** chart embeds, accept/skip undo, real-time updates via socket.io, mobile-responsive design polish, candidate filtering/search.

## 8. Backtest Approach Recommendation

CONTEXT.md locks: "Backtest covers same 2018-2025 universe + regimes as M2-01" and "uses historical M2-04 outputs." Reality check — **historical M2-04 outputs do not exist** and cannot be created for 2018-2025 because:
- News stream `news-*.jsonl` only goes back to 2026-05-23 (M2-03 start)
- PM snapshot stream `polymarket-snapshots-*.jsonl` same date floor
- ScoredArticle generation requires news as input; therefore can't be backfilled before 2026-05-23 either

This is a **structural data-coverage gap** that no amount of compute can fix. The backtest options are:

### Option A — Re-run ArticleScorer over historical news (May 23 → today)
- **What:** Run `ArticleScorer` over all `news-*.jsonl` files from 2026-05-23 onward (~10 days, ~1000-3000 articles), produce historical `scored-articles-*.jsonl`, then run `RollupBuilder` per day to backfill `ticker-day-summary-*.jsonl`. Then backtest the engine over this synthesized history.
- **Cost:** Hours of LM Studio GPU time (~1-2s/article × 2000 = ~40min minimum). Operator's M2-03 cost-tracker would not bill it (local LLM = free), but ties up the GPU.
- **Fidelity:** Decent for the 10-day window, but irrelevant to the 2018-2025 regime ask — you can't backtest regime fit with 10 days of data.
- **Verdict:** Worth doing once to seed history; not a substitute for regime backtest.

### Option B — Backtest only signal types that don't need scored-articles
- **What:** SECTOR_ROTATION_FROM_PM is the only type whose inputs (PM snapshots + the static `config/pm-market-mappings.json`) plausibly exist historically. We have polymarket-snapshots from 2026-05-23. For 2018-2025 we'd need to fetch PM history separately — but Polymarket only launched mid-2020 and didn't have meaningful volume until 2023, so even this is partial.
- **Fidelity:** Real for the SECTOR_ROTATION type on a 2023-2025 window. Cannot validate the other 3 types this way.
- **Verdict:** Best **partial** backtest available. Ship it.

### Option C — Ship engine; defer formal backtest to a follow-up after 30 days of live M2-04 data
- **What:** Document the backtest gap explicitly. Ship the engine, run it live, accumulate `scored-articles` + `ticker-day-summary` daily. After 30-45 days, retroactively backtest the engine over that real window.
- **Fidelity:** Highest — real production data, no synthetic re-scoring.
- **Verdict:** The honest answer for the 4-signal-type validation. Schedule it.

### Recommendation: **Hybrid B + C**, deprioritize A
- **Now (M2-05):** Build the backtest harness (one task), wire it to run **SECTOR_ROTATION_FROM_PM-only** over the M2-01 universe + regimes (2023-2025 sub-window — when Polymarket had real volume). Report per-regime Sharpe / MaxDD honestly. Acknowledge the validation is partial.
- **Deferred (follow-up phase, T+30 days):** Re-run the same harness over real 30-day production data, this time with all 4 signal types active. Compare against the CONTEXT.md bar (Sharpe > 0.5, MaxDD < 25%, bull-positive, combined > best-single-type).
- **Skip Option A** unless the operator wants to seed history for early SENTIMENT_VELOCITY validation — even then, 10 days of history doesn't validate regime fit.

**Critical:** the backtest harness itself is a real task and a real deliverable. The CONTEXT-locked "Backtest covers same 2018-2025 universe + regimes as M2-01" cannot be literally satisfied; the plan must document this constraint and the operator must explicitly accept the partial validation. **Surface this as a planning-time question to the operator before the engine ships.**

### Backtest engine integration
- Reuse `BacktestEngine` (`src/backtesting/engine/backtest-engine.ts`) and `regime-segmenter.ts` (`src/backtesting/analytics/regime-segmenter.ts`).
- Implement a `MultiSignalBacktestStrategy implements BacktestStrategy` that on each bar reads the substrate (historical OR live), runs `StrategyEngine.generateCandidates(asOfDate)`, and emits the top candidate's direction as the bar's Signal (HOLD if no candidate above floor). The strategy adapter pattern at `src/backtesting/strategies/strategy-adapter.ts` is the model.
- Slippage / commission models: reuse defaults from M2-01 phase 07 backtests (already calibrated).

## 9. Pitfalls Specific to M2-05

### Pitfall 1: Same-ticker collisions across signal types
**What:** CATALYST_ANCHORED on TSLA (earnings in 3 days, score 0.7) and SECTOR_ROTATION_FROM_PM on TSLA (PM-implied EV bullishness, score 0.55) fire on the same day.
**Why:** Per-ticker-day rollup feeds all four signal types; correlated input → correlated output is expected.
**Mitigation:** Dedup at ranking by `(ticker, direction)`. If both candidates point the same direction → keep the higher-scoring, augment its rationale with "+ secondary signal: SECTOR_ROTATION (0.55)". If they point opposite directions → emit BOTH (operator picks; this is genuinely informative — "earnings says long, macro says short, decide"). Cap is still top-5 across types.

### Pitfall 2: VIX feed down → conservative default
**What:** Yahoo `^VIX` fetch fails (rate-limit, API change).
**Why:** Unofficial API, no SLA.
**Mitigation:** Default to `"elevated"` regime (12.5% sizing) per CONTEXT recommendation. Persist last-known regime + timestamp to `data/strategy/vix-regime-cache.json`. If the cache is older than 24h, fall back to `"elevated"` regardless. Log a warning, surface in `strategy show-vix` output. Never default to `"calm"` — fail safer-not-larger.

### Pitfall 3: Backtest survivorship bias
**What:** Running over today's M2-01 universe omits delisted tickers (e.g., a 2020 catalyst trade that would have produced a 100% loss because the company went bankrupt).
**Why:** Universe is fixed today, history isn't.
**Mitigation:** Document this as a known limitation in the backtest output header. Smaller concern than M2-01 because M2-05's universe is large-cap ETFs + actively-news-traded names, which have low delist rates. Don't try to fix in v1.

### Pitfall 4: Option A LLM cost
**What:** Backfilling scored-articles via LM Studio = hours of GPU contention.
**Why:** Sequential scoring (rate-limited to one inflight call by `ArticleScorer`'s gate).
**Mitigation:** Don't recommend Option A by default. If chosen, run overnight on a separate process; pre-warn the operator the workstation will be loud and warm.

### Pitfall 5: Empty `pmContribution` rollup rows
**What:** When `PmMappingEngine` returns zero TickerSignal for a ticker, the rollup still creates a row with `pmContribution.netScore = 0` and empty `sources[]`. SECTOR_ROTATION_FROM_PM math will compute score 0 for those rows.
**Why:** Correct by-design — rollup includes all tickers with EITHER articles OR PM signal.
**Mitigation:** Filter zero-PM-contribution rows BEFORE computing SECTOR_ROTATION score. Add a pre-check `if (rollup.pmContribution.sources.length === 0) return null` in the signal module.

### Pitfall 6: ATR for low-priced stocks
**What:** ATR for a $5 stock might be $0.50 (10% of price); ATR for a $500 stock is also ~$5 (1% of price). Using `entry - 1.5 * ATR_5` produces stops 15% below entry on the cheap stock vs 1.5% on the expensive one.
**Why:** ATR is an absolute, not relative, volatility measure.
**Mitigation:** Cap stop-loss at `max(entry - 1.5*ATR_5, entry * 0.95)` (no worse than -5% on any single trade). Mirror cap on the target side: `min(entry + 2.5*ATR_5, entry * 1.15)`. Operator can override at accept time. Document the cap rationale in the rationale text.

### Pitfall 7: Stale prior-day rollup for SENTIMENT_VELOCITY
**What:** The 3-day prior rollup needed for Δ math is read from `ticker-day-summary-YYYY-MM-DD.jsonl` files. If the scheduler skipped days (e.g., the operator stopped it for the weekend), the "3 days ago" file may not exist.
**Why:** Rollup is only built on cycles that actually ran.
**Mitigation:** Walk backward up to 7 calendar days looking for a non-empty rollup. If still no prior found, skip SENTIMENT_VELOCITY for that ticker on that day (no score). Surface "skipped: no prior rollup" in diagnostic output.

### Pitfall 8: Operator-equity drift
**What:** `assumedEquity: 7500` in the config will get stale once the operator's real account grows (or shrinks). Suggested sizes will be wrong.
**Why:** Config not auto-updated.
**Mitigation:** Warn at `strategy run` startup if `config/strategy-config.json` `assumedEquity` hasn't been updated in 30+ days. Print "Last updated: X days ago — verify still accurate." After M2-02 wires Alpaca, replace the static value with a live broker-balance fetch.

### Pitfall 9: Binary catalyst handling
**What:** FDA PDUFA decisions are `direction: "binary"` per CatalystFlag schema — outcome is genuinely 50/50.
**Why:** Real binary events exist (FDA, M&A close/fail, courts).
**Mitigation:** For `"binary"` direction, emit two candidates (one long, one short) each at 50% size. Operator picks one based on outside knowledge. Skip if score < floor for both. Document in CLI output and in the rationale field.

### Pitfall 10: Decision-log dedup at read time
**What:** Operator accepts a candidate, then later closes it. Two records exist with same candidateId. Naive "load all decisions" will count it twice in accept-rate math.
**Why:** Append-only design (intentional for race-safety).
**Mitigation:** All reader helpers dedup by `candidateId` taking the record with the most-recent timestamp (`closedAt ?? decidedAt`). Test this explicitly — write 3 records (skip → re-accept → close) and verify the loader returns one consolidated record with the close fields populated.

## 10. Recommended Task Decomposition

Suggested 6-wave breakdown, ~15 tasks total. Parallelism opportunities flagged.

### Wave A — Foundation (sequential)
- **A1.** Extract `catalyst-loader.ts` from `RollupBuilder` + intel-commands duplication. New shared helper `src/market-intelligence/signal/catalyst-loader.ts`. Used by M2-05 and refactors existing callers. Tests.
- **A2.** Extract public `TechnicalIndicators.calculateATRSeries(data, period)` from the private static method. Tests against the existing `ATR` library at period 3/5/10.
- **A3.** Build `src/strategy/vix-provider.ts` — wraps `YahooFinanceProvider.fetchHistoricalDataRange("^VIX", ...)` with cache, regime classifier, fallback. Tests with mocked fetcher.

### Wave B — Engine core (mostly parallel after A1-A3)
- **B1.** Define `src/strategy/types.ts` — `Candidate`, `SignalType`, `SignalTypeModule` interface, `VixRegime`, `StrategyDecisionRecord`. No dependencies on B2-B5. **PARALLEL.**
- **B2.** `src/strategy/signals/catalyst-anchored.ts` — implements `SignalTypeModule`. Reads rollup + catalysts. **PARALLEL with B3-B5 after B1.**
- **B3.** `src/strategy/signals/sentiment-velocity.ts` — reads today rollup + 3-day prior rollup. **PARALLEL.**
- **B4.** `src/strategy/signals/sector-rotation-from-pm.ts` — reads `TickerDaySummary.pmContribution`. **PARALLEL.**
- **B5.** `src/strategy/signals/fade-overshoot.ts` — reads 7-day rollup history for the overshoot reference. **PARALLEL.**

### Wave C — Orchestration (sequential, depends on B*)
- **C1.** `src/strategy/strategy-engine.ts` — orchestrates: load substrate → run each module → dedup → rank → size → suggest levels → persist `candidates-*.jsonl`. Tests via integration with fixture rollup data.
- **C2.** `src/strategy/decision-log.ts` — `JsonlStore<StrategyDecisionRecord>` wrapper, append/load/dedup helpers, accept/skip/close action functions. Tests.

### Wave D — CLI (parallel after C1+C2)
- **D1.** `src/strategy/cli/strategy-commands.ts` — register all 8 commands (§6 above). Reuses `ora`, `chalk`, `readline`, the `intel` patterns. Tests via command-action integration tests.
- **D2.** Wire `registerStrategyCommands(program)` into `src/index.ts`. Smoke test: `node dist/index.js strategy --help`.

### Wave E — Backtest harness (parallel with D after C)
- **E1.** `src/strategy/backtest/multi-signal-backtest-strategy.ts` implements `BacktestStrategy`. Reads either live substrate OR historical substrate depending on mode. Tests with fixture.
- **E2.** `strategy backtest` CLI action in D1 — wires the backtest strategy into `BacktestEngine` + `regime-segmenter`, outputs per-regime metrics. Run actual Option-B partial backtest (SECTOR_ROTATION_FROM_PM, 2023-2025) and report numbers as part of phase acceptance.

### Wave F — Web dashboard minimal route (parallel with E)
- **F1.** Backend: add `/api/strategy/*` endpoints to `src/web/server.ts`. Auth-aware (use existing `optionalAuthMiddleware`). Tests.
- **F2.** Frontend: `web/frontend/src/pages/StrategyPage.tsx` + new tab in `Layout`. Tests via component tests + an e2e smoke test that loads the page with fixture data.

### Wave G — Worked example / acceptance
- **G1.** End-to-end Iran-ceasefire happy path test: fixture PM snapshot → engine generates SECTOR_ROTATION candidate for XLE → CLI accept → CLI close — assert decision-log records are exact. Documents the canonical operator flow.
- **G2.** Phase summary: report per-regime backtest numbers, document the validation-gap honestly, update STATE.md + ROADMAP.md.

### Parallelism summary
- **Maximum parallelism:** Wave B (5 tasks in parallel after A done), Waves D+E+F together (3 streams after C).
- **Bottlenecks:** A1 (catalyst-loader) blocks B2 + B5. A2 (ATR series) blocks C1 (engine needs it for entry/target/stop math). C1 + C2 block everything downstream.
- **Estimated wall-clock:** ~3-4 task slots if maxed parallel, 15 tasks total if sequential.

## Open Questions

1. **Backtest data scope acceptance** — CONTEXT-lock says "2018-2025 + M2-01 regimes" but historical M2-04 data doesn't exist. Hybrid B+C recommendation needs operator explicit acceptance before E2 ships. **Surface in planning phase.**
2. **Engine cadence** — CONTEXT (Claude's-Discretion) leaves this open. Recommend: separate `strategy run` invocation (manual or once-per-market-open cron) rather than wiring into `runCycle`. Reason: a) engine doesn't need to run on the 60-90s news poll cadence; b) easier to debug and rerun; c) decouples M2-05 failure from M2-03/M2-04 streaming reliability.
3. **Web auth on strategy endpoints** — current `/api/*` routes mix `authMiddleware` (required) and `optionalAuthMiddleware`. Recommend `optionalAuthMiddleware` for v1 to stay consistent with `/api/monitoring/*`; tighten in M2-06 alongside risk gating.
4. **CatalystRefiner direction trust** — CATALYST_ANCHORED score formula trusts `catalyst.confidence × magnitude`. If confidence is consistently low for refined-by-LLM catalysts (vs. high for seeded calendar events), CATALYST_ANCHORED will under-emit. Worth instrumenting in `strategy show-substrate` and revisiting after a week of live data.

## Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| M2-04 substrate types & APIs | **HIGH** | Read every relevant file directly; types confirmed |
| ATR / VIX / price-data gap analysis | **HIGH** | Read codebase + library imports; gap is concretely actionable |
| Per-signal-type score formulas | **MEDIUM** | Math derived from CONTEXT; calibration thresholds (0.4 floor, 7-day overshoot window) are educated guesses pending real data |
| Entry/target/stop ATR multipliers | **MEDIUM** | Standard practice for ATR-based exits; specific multipliers will need post-launch tuning |
| Decision-log schema | **HIGH** | Direct application of existing JsonlStore patterns |
| CLI surface | **HIGH** | Mirrors existing `intel` pattern; pure code consistency call |
| Web dashboard minimal scope | **MEDIUM** | Existing frontend conventions known; specific layout choices are Claude's-discretion per CONTEXT |
| Backtest approach | **MEDIUM** | Honest about data gap; recommendation defensible but requires operator buy-in |
| Pitfalls | **HIGH** | Each pitfall traced to a specific line of CONTEXT.md or specific behavior in the substrate code |
| Task decomposition | **MEDIUM** | Reasonable shape; planner will resize tasks based on actual coding agent capacity |

## Sources

### Primary (HIGH confidence — direct code reads)
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/types.ts` — full type catalog
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/rollup-builder.ts` — rollup aggregation logic
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/pm-mapping-engine.ts` — PM signal shape and sign math
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/calendar/index.ts` — calendar refresher
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/cli/intel-commands.ts` — CLI pattern reference
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/storage/jsonl-store.ts` — JSONL store API
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/scheduler/cycle-runner.ts` — cycle integration points
- `/home/kopacz/projects/stock-sense-ai/src/analysis/technical-indicators.ts` — ATR existence and shape
- `/home/kopacz/projects/stock-sense-ai/src/data/market-data-service.ts` — price data API
- `/home/kopacz/projects/stock-sense-ai/src/data/providers/yahoo-finance-provider.ts` — VIX feed viability
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/types/backtest-types.ts` — backtest contract
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/strategies/strategy-adapter.ts` — adapter pattern
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/analytics/regime-segmenter.ts` — regime-slicing reusable
- `/home/kopacz/projects/stock-sense-ai/src/strategies/strategy-registry.ts` — registry pattern (note: registry bug documented in adapter)
- `/home/kopacz/projects/stock-sense-ai/src/web/server.ts` — backend route patterns
- `/home/kopacz/projects/stock-sense-ai/src/paper-trading/types/paper-trading-types.ts` — eventual M2-02 integration surface
- `/home/kopacz/projects/stock-sense-ai/web/frontend/src/App.tsx` — frontend routing conventions
- `/home/kopacz/projects/stock-sense-ai/data/intel/` — confirmed scored-articles absent, ticker-day-summary fixture-only

### Secondary (CONTEXT-driven)
- `/home/kopacz/projects/stock-sense-ai/.planning/phases/11-ai-strategy/11-CONTEXT.md` — locked decisions, signal types, sizing, log schema

### Tertiary
- Yahoo Finance `^VIX` symbol support — well-documented public knowledge, not directly tested in this research (live WebFetch denied by policy). LOW risk; verify in first task by hitting the endpoint with the existing provider.

---

## RESEARCH COMPLETE
