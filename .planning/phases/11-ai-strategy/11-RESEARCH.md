# Phase 11 (M2-05): AI-Augmented Strategy Engine — Research

**Researched:** 2026-06-02 (substrate + design) — **refreshed 2026-08-27** (data availability, backtest approach, validation architecture, package audit)
**Domain:** Multi-signal candidate generation, ranking, sizing, and CLI/dashboard surface on top of M2-04 substrate
**Confidence:** HIGH on substrate (read code this session), MEDIUM on score-formula calibration (still no 30+ live days), **LOW→verified-LOW on literal backtest scope** (structural gap confirmed, not just data-thinness)

## Summary

M2-05 wires four signal-type modules to read the existing M2-04 query surface (`TickerDaySummary` per-ticker-day rollup + `CatalystFlag` calendar + PM `TickerSignal[]`), runs each module to emit per-type candidates, ranks them by pure per-type score, applies VIX-regime sizing, suggests entry/target/stop from per-type ATR multipliers, and persists accept/skip decisions to a daily JSONL stream. Surface is a `strategy` CLI subcommand group (mirroring `intel`) plus one minimal `/strategy` web route. None of this design changed since 2026-06-02 — it was CONTEXT-locked and remains sound.

**What changed since 06-02, verified this session:**
1. **The scheduler has been running M2-04 code since 2026-05-23** (news/PM) / **2026-05-31** (catalyst-flags, rollups). On disk today: 851 `ticker-day-summary` rows across 70 files (2026-05-31 → 2026-08-27), of which **427/851 (50.2%) have `articleCount > 0`** — the other half are PM-only rows from a month-long scorer outage (LM Studio off 2026-07-26 → 2026-08-27, now fixed, 15,323-article backlog queued in `score-backlog.jsonl` awaiting `intel backlog-drain`).
2. **`scored-articles-*.jsonl` covers 36 non-contiguous days** (2026-06-02 → 2026-07-26, with named gaps), not the "zero data" premise of the 06-02 doc. `news`, `polymarket-snapshots`, and `catalyst-flags` streams are effectively continuous over the full ~90-day window.
3. **A structural backtest-scope problem was found that the 06-02 doc did not surface**: `regime-segmenter.ts`'s hardcoded `REGIMES` windows (bull/bear/highVol) all fall within calendar years **2018–2025**. The real M2-04 substrate exists only in **calendar year 2026** (2026-05-23 onward). No regime window overlaps the substrate window — **at all, for any of the four signal types**, not just the three that need scored-articles. This makes CONTEXT.md's literal "Backtest covers same 2018-2025 universe + regimes as M2-01" + "uses historical M2-04 outputs" instruction structurally unsatisfiable, independent of how much scored-article data accumulates. See §8 for the full analysis and the recommended honest substitute.
4. **Two new production modules exist that the 06-02 doc didn't know about**: `src/market-intelligence/signal/rollup-backfill.ts` (exports `rebuildRollupForDay`, `loadPmSignalsForDay` — self-healing rollup rebuild) and `src/market-intelligence/signal/backlog-drain.ts` (bounded/looped scorer catch-up with a lock file). M2-05's backtest harness and any "replay history" task should reuse `rebuildRollupForDay` rather than re-implement rollup rebuilding.
5. **The LLM provider question is now live** (LM Studio vs. DeepSeek remote API) — `scorerModel` is recorded per `ScoredArticle` record, so a future model-mix in the 36-day corpus is filterable but real; M2-05's SENTIMENT_VELOCITY math (a same-model-family delta assumption) should note this as a caveat, not block on it.

VIX is still **NOT wired** (confirmed by fresh `grep -rn "VIX" src/`). ATR is still present but **private** (`TechnicalIndicators.calculateATR` is `private static`, `src/analysis/technical-indicators.ts:248`) — same Wave-A extraction task as 06-02 still applies. `catalyst-loader.ts` still has **not** been extracted (the duplication the 06-02 doc flagged is still live between `RollupBuilder.loadActiveCatalysts` and `intel-commands.ts`'s local scan).

**Primary recommendation (unchanged in shape, backtest section reworked):** Build `src/strategy/` as a parallel module to `src/market-intelligence/signal/`. Four signal-type modules implement a common `SignalTypeModule` interface; a `StrategyEngine` orchestrates read/score/rank/size/suggest; persistence via `JsonlStore`. For validation, **do not attempt the literal 2018-2025-regime backtest** (§8) — build a **live-window backtest gate** using `PerformanceMetricsCalculator.calculate()` directly (no `regime-segmenter` windowing) over the real, continuous 2026-05-23→today substrate, present it as an interim, explicitly-partial gate, and surface the regime-window conflict to the operator as a planning-time decision before the engine ships.

<user_constraints>
## User Constraints (from CONTEXT.md)

**Note:** CONTEXT.md's header (`⏸ DEFERRED until 2026-07-02 ... Re-enter /gsd:plan-phase 11 once scored-articles / ticker-day-summary cover ≥25 trading days`) is now satisfied per STATE.md's 2026-08-27 entry — deferral window is over, planning is proceeding. The decisions below are copied verbatim; they are still locked.

### Locked Decisions

**Signal Generation**
- Separate signal types, ranked together across types. Each type emits its own candidates with a type tag + per-type score. Top-N across all types compete for the daily slots.
- Four signal types ship in v1: **CATALYST_ANCHORED** (pre-position before scheduled/emerging catalysts from the M2-04 60-day calendar; direction = `catalyst.direction`, confidence = `catalyst.confidence`), **SENTIMENT_VELOCITY** (ticker's materiality-weighted rolling sentiment turns sharply positive/negative over 1-3 days), **SECTOR_ROTATION_FROM_PM** (PM macro signal translates via `PmMappingEngine` into sector/ETF bias), **FADE_OVERSHOOT** (PM market or rolling sentiment over-reacted to a single comment/headline; counter-trend; sized 50% smaller).

**Ranking**
- Pure per-type score, type-agnostic ranking, native 0-1 scale per type (formulas in CONTEXT.md — reproduced in §3 below).
- No operator-tunable type weights in v1.
- Daily output limit: top 5 candidates max. Score floor 0.4 default. Show next-3 sub-threshold candidates for transparency.

**Sizing**
- VIX-regime % of equity, account-aware: Calm (VIX<15) 25%/position, Elevated (15-25) 12.5%, Stressed (>25) 6.25%. Max 4 simultaneous positions.
- FADE_OVERSHOOT sized at 50% of regime size. Other types unmodified.
- Engine emits a $ amount; operator's broker decides share count.
- Until M2-02 ships Alpaca, sizing falls back to a config `assumedEquity` value (e.g. 7500).

**Position Management**
- Suggest entry/target/stop, operator executes and manages. Per-type formulas in CONTEXT.md (reproduced in §4 below).
- Operator can override entry/target/stop when accepting; engine logs the operator's chosen levels.
- No exit signals in v1.

**Decision Tracking**
- Decision log file: `data/strategy/decisions-YYYY-MM-DD.jsonl`, one record per accept/skip event. Full schema in CONTEXT.md (reproduced in §5 below).
- Outcome tracking is operator-driven: `intel decision close <id> --exit-price X --exit-date Y-M-D` (or `strategy close`).
- 30-day accept/skip rate computed weekly; sweet spot 20-40%.

**Empty State**
- Honest "no candidates above threshold today" output. No forced top-3.

**Backtest Validation**
- Backtest covers same 2018-2025 universe + regimes as M2-01. Re-uses regime-segmenter and prefetch infrastructure from phase 07.
- Validation bar (M2-01 baseline is zero — both strategies DISCARD'd): per-regime Sharpe > 0.5; per-regime MaxDD < 25%; negative Sharpe in bull regime = automatic FAIL; combined-strategy Sharpe should be > standalone-best-signal-type Sharpe.
- Backtest uses historical M2-04 outputs. Since M2-04 had only been running ~24h as of 06-02, the backtest may need to synthesize historical scored-articles/rollups by re-running the scorer over historical news. Document lower fidelity clearly.
- **⚠️ Refresh note (2026-08-27):** this instruction is now shown (§8) to be structurally unsatisfiable as written — no `regime-segmenter.ts` window overlaps the real M2-04 substrate's calendar-2026 window, for any signal type. This must go back to the operator as an explicit decision before backtest work starts.

### Claude's Discretion
- Exact ATR multipliers for entry pullback / stop / target per signal type.
- Score-floor threshold (proposed 0.4) — to be calibrated against the first week of live data.
- VIX classification thresholds (calm<15 / elevated 15-25 / stressed>25) — revisit if backtest shows different regime boundaries work better.
- Web-dashboard layout — CLI surface is the primary v1 deliverable.
- Candidate id format (suggested: `${YYYY-MM-DD}-${signalType}-${ticker}-${shortHash}`).
- File paths under `data/strategy/` and module paths under `src/strategy/`.
- Whether to wire the engine into the scheduler `runCycle` or run as a separate "strategy tick."

### Deferred Ideas (OUT OF SCOPE)
- Operator-tunable type weights in ranking (needs 30+ days of accept/skip data).
- ML-learned ranking from accept/skip history.
- Exit-signal emission ("take profits" / "stop out") — v2.
- Auto-execution via broker — M2-07's charter.
- Pre-trade risk gating (concentration limits, sector caps, drawdown breakers) — M2-06's charter.
- Tax-lot tracking on the decision log — M2-07's charter.
- Web-dashboard polish beyond one minimal route.
- Custom signal types beyond the 4 in v1.
- Forced top-N output on quiet days — explicitly rejected as anti-pattern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INCOME-01 (extended) | Combined strategy outperforms standalone technicals in backtest | Reinterpreted per CONTEXT.md: M2-01 baseline is zero (both legacy strategies formally DISCARD'd), so the bar becomes an absolute one (per-regime Sharpe>0.5, MaxDD<25%, combined>best-single-type) rather than a relative "beats MomentumStrategy" comparison. §8 documents why the literal 2018-2025-regime bar cannot be evaluated today and proposes the honest interim gate (live-window backtest over the real 2026-05-23→today substrate) plus the exact operator decision needed to unblock the full CONTEXT-locked bar later. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Signal-type candidate generation (4 types) | API / Backend | Database/Storage (reads JSONL) | Pure computation over persisted M2-04 substrate; no UI concern |
| Ranking + score-floor + top-N cap | API / Backend | — | Deterministic post-processing on candidates already in memory |
| VIX regime detection + classification | API / Backend | External data provider (Yahoo) | New provider call, cached; belongs beside `MarketDataService`, not in a UI layer |
| Entry/target/stop (ATR-based) computation | API / Backend | Database/Storage (reads price cache) | Reuses existing `MarketDataService`/`TechnicalIndicators`; no browser math |
| Decision-log persistence (accept/skip/close) | Database / Storage | API / Backend (writer) | File-based JSONL, same tier as all M2-04 streams |
| CLI surface (`strategy ...`) | API / Backend | — | Commander.js process, same tier as `intel` commands |
| Web dashboard `/strategy` route | Frontend Server (SSR-less SPA) / Browser | API / Backend (new `/api/strategy/*` endpoints) | Vite+React SPA renders cards; Express serves JSON; no server-rendering tier in this stack |
| Backtest harness | API / Backend (batch/offline) | Database/Storage (reads price cache + M2-04 substrate) | Runs as a CLI subcommand, not a live-request path |

## 0. Data Reality Inventory — refreshed 2026-08-27 (supersedes the 06-02 "no data" premise)

This section replaces the 06-02 doc's Summary claim ("the data layer does NOT exist in production"). It is now stale; the numbers below are verified by direct shell inspection of `data/intel/` on 2026-08-27.

### Per-stream date coverage (row/file counts verified via `ls` + `wc -l` this session)

| Stream | Files | Date range | Notes |
|--------|-------|-----------|-------|
| `news-*.jsonl` | 80 | 2026-05-23 → 2026-08-28 | 254,326 total rows. Effectively continuous. |
| `polymarket-snapshots-*.jsonl` | 80 | 2026-05-23 → 2026-08-28 | 78,242 total rows. Effectively continuous. |
| `catalyst-flags-*.jsonl` | 68 | 2026-05-31 → 2026-08-28 | 1,560 distinct catalyst ids (dedup by id); raw append count is higher (calendar refresher re-appends unarchived events on every 24h-gated refresh — raw ≠ distinct). |
| `alerts-fired-*.jsonl` | 74 | 2026-05-27 → 2026-08-28 | `correlator` provenance field (`"rule-based"` / presumably `"llm"`) present sparsely from **2026-07-24** (1/197 records), ramps to 10/10 on 07-25, 50/59 on 07-26, and is present on ~85-95% of records from 07-27 onward. This is more gradual than the "only from 07-26" framing in the task brief — [VERIFIED: grep across all 74 `alerts-fired-*.jsonl` files this session, exact per-day counts tabulated]. |
| `pm-mappings-proposed-*.jsonl` | 70 | 2026-05-31 → 2026-08-28 | Tracks catalyst-flags start date (both landed in Plan 10-04/10-05). |
| `ticker-day-summary-*.jsonl` | 70 | 2026-05-31 → 2026-08-27 | 851 total rows. **427/851 (50.2%) have `articleCount > 0`**; the rest are PM-only. |
| `scored-articles-*.jsonl` | 37 files, **36 distinct days with content** | 2026-06-02 → 2026-07-26 | Gaps: 06-27/28, 07-01, 07-04/05, 07-09→07-21 (13 missing days in that stretch), then **nothing at all 07-27 → 08-27** (34 consecutive days) — the LM Studio outage window. A `scored-articles-2026-08-28.jsonl` file exists (likely 1 test/smoke record from the fix-branch work, not backfilled history). |
| `score-backlog.jsonl` | 1 file | n/a | **15,323 lines** [VERIFIED: `wc -l data/intel/score-backlog.jsonl` this session] — queued articles awaiting `intel backlog-drain`. |

### `ticker-day-summary` articleCount breakdown by period (verified per-file this session)

- **2026-05-31 → 2026-07-24**: every row has `articleCount > 0` except the 5 rows on 05-31 itself (before scoring landed same-day) — i.e. the scorer was working normally.
- **2026-07-22 → 2026-07-26**: partial (23/25, 33/36, 33/36, 0/12, 21/26) — the outage started mid-window.
- **2026-07-27 → 2026-08-27** (34 files): **every single row has `articleCount: 0`** — full PM-only outage, exactly matching STATE.md's account. This is the block `intel backlog-drain` needs to repair via `rebuildRollupForDay`.

### Universe actually observed in the substrate

36 distinct tickers appear across all `ticker-day-summary` rows [VERIFIED: `data/intel/ticker-day-summary-*.jsonl`, this session]: `AAPL, AMZN, COIN, GLD, GOOGL, IBIT, IEF, IWM, JETS, JPM, LMT, META, MSFT, MSTR, NFLX, NVDA, QQQ, RTX, SLV, SPY, TLT, TSLA, UNG, USO, V, XLB, XLC, XLE, XLF, XLI, XLK, XLP, XLRE, XLU, XLV, XLY`. This is a mix of the watchlist (single names) and macro-proxy ETFs from `config/macro-tickers.json` and `config/pm-market-mappings.json`'s `tickers[]` (XLE/USO/LMT/RTX/JETS/TLT/IEF/XLF/IWM/COIN/MSTR/IBIT). Planner should size the SECTOR_ROTATION_FROM_PM / CATALYST_ANCHORED signal-module fixtures against this real list, not an assumed 35-ticker M2-01 universe (which is stock-only, no ETFs beyond the 5 M2-01 sector ETFs, and doesn't include COIN/MSTR/IBIT/JETS/LMT/RTX/TLT/IEF).

### Catalyst-type distribution (distinct ids, deduped by id, verified this session)

```
product: 451   lawsuit: 244   ma: 263   earnings: 243   fomc: 65
geopolitical: 91   regulatory: 62   guidance: 46   eia_petroleum: 32
fda: 16   other: 16   treasury_auction: 11   nfp: 6   pce: 7
macro_print: 3   ism: 1   cpi: 1   opec: 1   jolts: 1
```

**Implication for CATALYST_ANCHORED:** the corpus is dominated by LLM-emergent (`CatalystRefiner`-spawned from `scored.catalysts[]`) `product`/`lawsuit`/`ma`/`earnings`/`fomc`/`geopolitical` catalysts — 1,110 of 1,560 distinct catalysts (71%) — not by the scheduled FRED macro calendar. The macro-print subtypes CONTEXT.md calls out as "closest to the operator's COVID-era style" (`fomc`, `cpi`, `nfp`, `pce`, `ism`, `jolts`, `gdp`) are comparatively sparse (65+1+6+7+1+1+0 = 81 distinct events, 5% of the corpus). This is either (a) genuinely low release frequency for monthly/quarterly macro prints over a ~90-day window, or (b) partial `FRED_API_KEY` coverage — **not resolved this session** (`.env` read was denied by the permission boundary; flagging as `[ASSUMED]`, not decided). Planner should not assume CATALYST_ANCHORED will be macro-print-heavy; it will skew toward earnings/M&A/lawsuit/product catalysts unless the operator confirms FRED coverage is complete.

## 1. M2-04 Substrate Inventory — re-verified 2026-08-27

All symbols below re-confirmed by direct `grep -n` / `Read` this session; line numbers matched the 06-02 doc almost exactly (substrate code has been stable since M2-04 shipped).

### `TickerDaySummary` (primary query surface)
- File: `src/market-intelligence/signal/types.ts:121-154` [VERIFIED: re-read this session]
- Persisted at: `data/intel/ticker-day-summary-YYYY-MM-DD.jsonl`
- Fields M2-05 reads: `date`, `ticker`, `weightedSentiment ∈ [-1,+1]`, `totalMateriality`, `articleCount`, `themes[]`, `activeCatalystIds[]`, `pmContribution.netScore` + `pmContribution.sources[]` (`marketId`, `slug`, `movePp`, `direction`, `weight`, `contributedScore`, `volume24hr`)
- Reading: `JsonlStore<TickerDaySummary>(dataDir, "ticker-day-summary").readDay(date)` — `src/market-intelligence/storage/jsonl-store.ts:15` (class), `:48` (`readDay`) [VERIFIED]

### `CatalystFlag` (the calendar)
- File: `src/market-intelligence/signal/types.ts:90-108` [VERIFIED]
- Persisted at: `data/intel/catalyst-flags-YYYY-MM-DD.jsonl` (append-only; dedup at read by `id` taking latest)
- Fields: `id`, `type` (22-case union — see §0 distribution), `tickers[]`, `affectedSectors[]`, `expectedDate`, `expectedTimeEt`, `magnitudePrior 1-5`, `direction` (`up|down|uncertain|binary`), `confidence ∈ [0,1]`, `archived`
- **`catalyst-loader.ts` still does NOT exist** [VERIFIED: `ls src/market-intelligence/signal/catalyst-loader.ts` → not found, 2026-08-27]. The duplication the 06-02 doc flagged is still live: `RollupBuilder.loadActiveCatalysts` (private, `rollup-builder.ts:163`) and `intel-commands.ts`'s local scan both independently implement dedup-by-id-take-latest + non-archived + in-window filtering. **Recommend extracting to a shared helper as Wave A task, same as before** — now with a third consumer: `rollup-backfill.ts`'s `rebuildRollupForDay` also needs active-catalyst loading (currently delegates to `RollupBuilder.buildForDay` internally, so it's not duplicated there, but M2-05's `strategy show-substrate` debug command will want the same loader).

### PM `TickerSignal[]` (from `PmMappingEngine.mapMarkets` / `mapMarket`)
- File: `src/market-intelligence/signal/pm-mapping-engine.ts:59` (`interface TickerSignal`) [VERIFIED, line moved from 53 → 59 since 06-02, shape unchanged]
- Shape: `{ ticker, direction, weight, contributedScore, movePp, sourceMarketId, sourceSlug, sourceEventSlug?, sourceQuestion, sourceVolume24hr, matchedBy }`
- M2-05 does not need to call the engine directly if reading `TickerDaySummary.pmContribution.sources[]` (already encodes per-market contributions).
- **New (2026-08-27): `rollup-backfill.ts:125` `loadPmSignalsForDay(dataDir, date, engine)`** re-derives a day's PM ticker signals from the persisted `polymarket-snapshots-{date}.jsonl` file via `engine.mapMarket()` (no proposal side-effects, unlike `mapMarkets`). This is a ready-made helper for M2-05's backtest harness to re-derive historical PM signals for any day that has a snapshots file on disk — **use this instead of re-implementing PM-signal reconstruction**.

### `ScoredArticle` (for `SENTIMENT_VELOCITY` 3-day Δ math)
- File: `src/market-intelligence/signal/types.ts:53-71` [VERIFIED — includes `scorerModel: string` at line 69 and `scorerVersion: string` at line 70, confirmed this session]
- Persisted at: `data/intel/scored-articles-YYYY-MM-DD.jsonl` — **36 distinct days of real content** as of 2026-08-27 (see §0), not zero.
- For SENTIMENT_VELOCITY, read `ticker-day-summary-*.jsonl` for the last 3-7 days and compute Δ in `weightedSentiment × totalMateriality` — same recommendation as 06-02, now backed by 36 real days to validate against for the sub-window where scored data exists (see §8 for exactly which window).
- **Model-mix caveat (new):** if the operator switches from LM Studio (Qwen3-14B) to DeepSeek mid-corpus, `scorerModel` will differ across days in the same 3-day Δ window. `intel stability-test` measures cross-model drift (STATE.md's open decision item) but SENTIMENT_VELOCITY's math assumes a stable scoring distribution; document this as a known caveat, not a blocker — the operator has not yet switched providers.

### `PmMapping` config (for SECTOR_ROTATION_FROM_PM rationale text)
- File: `src/market-intelligence/signal/types.ts:174-190` [VERIFIED]
- Loaded from `config/pm-market-mappings.json` — **read in full this session**: 12 mapping rules, all `addedBy: "manual-2026-07-14"` or `"manual-seed"` (2026-05-31), all matched on **2026-specific event slugs** (`will-the-us-invade-iran`, `fed-decision-in-`, `fed-rate-hike-in-2026`, `will-bitcoin-reach-`, etc.) [VERIFIED: `config/pm-market-mappings.json:1-169`, quoted in §8]. This is directly relevant to the backtest recommendation in §8.

### Data directory conventions
- All M2-04 streams live under `./data/intel/`. M2-05 writes under `./data/strategy/` per CONTEXT.md — **confirmed this directory does not exist yet** [VERIFIED: `ls data/strategy/` → not found, 2026-08-27]. Create in the first task.

## 2. VIX + ATR + Price-Data Gap Analysis — re-verified 2026-08-27, no change

### VIX — still NOT wired
- **Re-confirmed:** `grep -rn "VIX\|\^VIX\|VixProvider\|classifyRegime" src/` returns zero data-fetcher/regime-classifier hits [VERIFIED, 2026-08-27].
- Recommendation unchanged from 06-02: `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` (`src/data/providers/yahoo-finance-provider.ts:63`, [VERIFIED line still matches]) accepts `^VIX`. Build `src/strategy/vix-provider.ts` with cache + `classifyRegime(vixClose): "calm"|"elevated"|"stressed"` per CONTEXT-locked thresholds. Cache via `DataCacheManager`; conservative fallback to `"elevated"` on fetch failure.

### ATR — still present but private
- **Re-confirmed:** `TechnicalIndicators.calculateATR` is still `private static async` at `src/analysis/technical-indicators.ts:248` [VERIFIED — same line as 06-02, unchanged]. No public `calculateATRSeries` has been added.
- Recommendation unchanged: add a public `static calculateATRSeries(data: PriceData, period: number): number[]` returning the full series. Small task, ~30 LOC + tests.
- Price source for ATR: `MarketDataService.fetchHistoricalData(symbol, from, to)` (`src/data/market-data-service.ts:473`, [VERIFIED — line matches 06-02]) and `getFullAnalysisData(symbol)` (`:377`, [VERIFIED]). Yahoo fallback confirmed still wired at `:513` (`fetchHistoricalDataRange`) [VERIFIED].

### Price data for entry/target/stop math
- No new plumbing needed — same conclusion as 06-02. Cache at `data/cache/historical/{symbol}_2018-01-01_2025-12-31.json` still exists from the M2-01 prefetch (37 files, unchanged).

## 3. Per-Signal-Type Score Formulas — retained verbatim from 06-02 (CONTEXT-locked, unchanged)

```typescript
// CATALYST_ANCHORED
score(catalyst: CatalystFlag): number {
  const magNorm = catalyst.magnitudePrior / 5;  // 1..5 → 0.2..1.0
  return Math.min(1, magNorm * catalyst.confidence);
}
// Tie-break: prefer closer expectedDate. Direction: catalyst.direction.

// SENTIMENT_VELOCITY
score(today: TickerDaySummary, threeDaysPrior: TickerDaySummary | undefined): number {
  if (!threeDaysPrior || today.totalMateriality === 0) return 0;
  const delta = today.weightedSentiment - threeDaysPrior.weightedSentiment;
  const materialityFloor = Math.min(today.totalMateriality, 2.0) / 2.0;
  return Math.min(1, Math.abs(delta) * materialityFloor);
}
// Direction: sign(delta).

// SECTOR_ROTATION_FROM_PM
score(rollup: TickerDaySummary): number {
  const totalMovePp = rollup.pmContribution.sources.reduce(
    (acc, s) => acc + Math.abs(s.movePp * s.weight), 0);
  const totalVolume = rollup.pmContribution.sources.reduce(
    (acc, s) => acc + s.volume24hr, 0);
  const ppNorm = Math.min(1, totalMovePp / 10);
  const volNorm = totalVolume > 0 ? Math.min(1, Math.log10(totalVolume) / 7) : 0;
  return ppNorm * volNorm;
}
// Direction: sign(netScore).

// FADE_OVERSHOOT
score(overshootPp: number, hoursSinceOvershoot: number): number {
  const magnitude = Math.min(1, Math.abs(overshootPp) / 15);
  const recencyDecay = Math.max(0.3, 1.0 - 0.7 * (hoursSinceOvershoot / 24));
  return magnitude * recencyDecay;
}
// Direction: OPPOSITE of overshoot sign (counter-trend).
```

**Score floor:** 0.4. **Top-N cap:** 5/day, ticker-dedup logic per Pitfall #1 (§9).

**Calibration note (unchanged from 06-02, now with real numbers to calibrate against):** the 0.4 floor and 3-day/7-day windows were educated guesses. With 36 real scored days and continuous PM/catalyst data now on disk, the planner can run these formulas retroactively over `data/intel/*` (not a full backtest, just a distribution check) as a first task to sanity-check the floor before shipping — e.g., "what fraction of ticker-days would have scored ≥0.4 for SENTIMENT_VELOCITY over the 36 scored days?" This is cheap (single script, minutes) and should be one of the first Wave B tasks.

## 4. Entry / Target / Stop Math — retained verbatim from 06-02 (CONTEXT-locked, unchanged)

| Type | Entry | Target | Stop | Horizon (days) |
|------|-------|--------|------|----------------|
| CATALYST_ANCHORED | `close` | type-conditional* | `entry - 1.5 * ATR_5 * dirSign` | `daysUntilEvent + 1` |
| SENTIMENT_VELOCITY | `max(close - 0.5*ATR_5, close*0.99)` | `close + 2.5 * ATR_5 * dirSign` | `entry - 1.5 * ATR_5 * dirSign` | 5-10 |
| SECTOR_ROTATION_FROM_PM | `close` (or pullback) | `close + 2.0 * ATR_10 * dirSign` | `entry - 1.5 * ATR_5 * dirSign` | 10-15 |
| FADE_OVERSHOOT | `close` | `close + 1.5 * ATR_3 * fadeSign` | `entry - 1.5 * ATR_5 * fadeSign` | 2-5 |

*CATALYST target table (by `catalyst.type`, using the 22-case union from `types.ts`):
- `earnings`: `close + (avgHistoricalEarningsMove * dirSign)`, fallback `close + 2*ATR_5*dirSign`
- `fomc, cpi, nfp, pce, gdp, ism, jolts, retail_sales, macro_print`: `close + 2*ATR_5*dirSign`
- `fda, fda_pdufa`: `close + 0.25*close*dirSign`
- `opec, eia_petroleum`: `close + 2*ATR_5*dirSign`
- `treasury_auction`: `close + 1*ATR_5*dirSign`
- `ma, lawsuit, regulatory, product, guidance, geopolitical, other`: `close + 2*ATR_5*dirSign` (generic default — **this is the majority-case path now that §0 shows `product`/`lawsuit`/`ma` dominate the real catalyst distribution**)

**dirSign:** +1 `"up"`, -1 `"down"`, 0 `"uncertain"` (skip), `"binary"` emits two opposite-direction candidates at 50% size each.

**Sizing:**
```typescript
function suggestSizeUsd(regime: VixRegime, type: SignalType, equity: number): number {
  const regimePct = { calm: 0.25, elevated: 0.125, stressed: 0.0625 }[regime];
  const typeModifier = type === "FADE_OVERSHOOT" ? 0.5 : 1.0;
  return Math.floor(equity * regimePct * typeModifier);
}
```
`equity` from `config/strategy-config.json` (planner creates; `assumedEquity: 7500` default per CONTEXT) — **confirmed does not exist yet** [VERIFIED: `ls config/strategy-config.json` → not found].

## 5. Decision-Log JSONL Schema — retained verbatim from 06-02 (CONTEXT-locked shape)

```typescript
interface StrategyDecisionRecord {
  candidateId: string;                // `${YYYY-MM-DD}-${signalType}-${ticker}-${shortHash}`
  generatedAt: string;
  signalType: "CATALYST_ANCHORED" | "SENTIMENT_VELOCITY" | "SECTOR_ROTATION_FROM_PM" | "FADE_OVERSHOOT";
  ticker: string;
  score: number;
  direction: "long" | "short";
  vixRegime: "calm" | "elevated" | "stressed";
  vixCloseAtGeneration: number;
  suggestedEntry: number;
  suggestedTarget: number;
  suggestedStop: number;
  suggestedSizeUsd: number;
  atrPeriodUsed: 3 | 5 | 10;
  atrValue: number;
  timeHorizonDays: number;
  rationale: string;
  sourceArticleIds: string[];
  sourcePmMarkets: Array<{ marketId: string; slug: string; movePp: number }>;
  sourceCatalystId?: string;
  decision: "accept" | "skip";
  decidedAt: string;
  operatorEntry: number | null;
  operatorTarget: number | null;
  operatorStop: number | null;
  operatorSizeUsd: number | null;
  operatorNote?: string;
  closedAt?: string;
  closeExitPrice?: number;
  closeRealizedPnlUsd?: number;
  closeRealizedPnlPct?: number;
  closeOperatorNote?: string;
}
```

Append-only for accept/skip; `close` appends a new record with the same `candidateId`. Reader dedups by `candidateId` taking most-recent (`closedAt ?? decidedAt`) — **same pattern the 2026-08-27 fix-branch used for `backlog-drain.ts`'s day-bucketed writes**, so the precedent for "append + reconcile at read time" is well-established in this codebase, not a new pattern M2-05 is inventing.

## 6. CLI Command Surface — retained from 06-02, naming convention re-confirmed

```
strategy run [--date YYYY-MM-DD] [--max-candidates 5] [--dry-run]
strategy list-candidates [--date YYYY-MM-DD] [--include-skipped] [--include-closed]
strategy accept <candidateId> [--entry N] [--target N] [--stop N] [--size N] [--note "..."]
strategy skip <candidateId> [--note "..."]
strategy close <candidateId> --exit-price N [--exit-date YYYY-MM-DD] [--note "..."]
strategy decisions-summary [--days 30]
strategy backtest --start YYYY-MM-DD --end YYYY-MM-DD [--types ...] [--out path]
strategy show-vix
strategy show-substrate [--ticker TSLA] [--date YYYY-MM-DD]
```

**Naming convention re-confirmed 2026-08-27:** the 2026-05-31 `intel` CLI decision log (STATE.md) explicitly documents Commander.js hyphenated single-word names (`themes-review`, not `themes review`) because `.command("themes review")` is interpreted as one literal command name, not nested subcommands. `intel backlog-drain` (shipped 2026-08-27) follows the same convention. **`strategy list-candidates` and `strategy decisions-summary` already match this pattern correctly** — no change needed from the 06-02 draft, just confirming it against the now-two production precedents.

Register via `registerStrategyCommands(program)` from `src/index.ts` alongside the existing `registerBacktestCommands(program)` (line 1030) and `registerIntelCommands(program)` (line 1041) [VERIFIED: both lines re-confirmed this session].

## 7. Web Dashboard Minimal Scope — retained from 06-02, no changes

One route `/strategy`. Backend: `GET /api/strategy/candidates`, `POST /api/strategy/candidates/:id/accept`, `POST /api/strategy/candidates/:id/skip` in `src/web/server.ts`. Frontend: `web/frontend/src/pages/StrategyPage.tsx`, card layout, VIX/regime header, empty-state copy. Out of scope for v1: chart embeds, undo, socket.io real-time, mobile polish, filtering. `optionalAuthMiddleware` for consistency with `/api/monitoring/*`.

## 8. Backtest Approach — REWRITTEN 2026-08-27 (structural finding, not just data-thinness)

The 06-02 doc's framing was "historical M2-04 outputs don't exist yet, choose Option A/B/C to work around thin data." That framing is now **obsolete in a more fundamental way** than "we now have 36 days instead of 0": the CONTEXT-locked backtest scope has a **date-range/regime-window conflict** that no amount of scored-article accumulation fixes.

### The structural finding (verified this session)

`src/backtesting/analytics/regime-segmenter.ts:86-101` hardcodes `REGIMES`:

```typescript
export const REGIMES: Record<RegimeName, RegimeWindow[]> = {
  bull: [
    { start: new Date("2019-01-01"), end: new Date("2019-12-31") },
    { start: new Date("2020-07-01"), end: new Date("2020-12-31") },
    { start: new Date("2023-01-01"), end: new Date("2023-12-31") },
    { start: new Date("2024-01-01"), end: new Date("2024-12-31") },
  ],
  bear: [
    { start: new Date("2018-10-01"), end: new Date("2018-12-31") },
    { start: new Date("2022-01-01"), end: new Date("2022-12-31") },
  ],
  highVol: [
    { start: new Date("2020-01-01"), end: new Date("2020-06-30") },
    { start: new Date("2025-01-01"), end: new Date("2025-12-31") },
  ],
};
```
[VERIFIED: `src/backtesting/analytics/regime-segmenter.ts:86-101`, quoted verbatim]

Every window ends `2025-12-31`. The real M2-04 substrate (`news`, `polymarket-snapshots`, `catalyst-flags`, `ticker-day-summary`, `scored-articles`) begins `2026-05-23` at the earliest (§0) — **calendar year 2026, which is not represented anywhere in `REGIMES`**. This means:

- CONTEXT.md's instruction "Backtest covers same 2018-2025 universe + regimes as M2-01" and "Backtest uses historical M2-04 outputs" are **mutually exclusive as written**. M2-04 outputs only exist for 2026; `REGIMES` only classifies 2018-2025. There is no date range where both conditions hold, for **any** signal type — this is stronger than the 06-02 doc's conclusion (which thought SECTOR_ROTATION_FROM_PM might be partially rescuable via a 2023-2025 PM-history fetch).

### Why the 06-02 doc's "Option B" (fetch PM history for 2023-2025) does not rescue this

Two things checked this session that weren't checked in June:

1. **The endpoint exists.** Polymarket's CLOB API exposes `GET /prices-history` (`clob.polymarket.com/prices-history`), no auth required, returns `{ t: unix_timestamp, p: price }` series per market/asset id [CITED: https://docs.polymarket.com/api-reference/markets/get-prices-history]. So historical PM price data for 2023-2025 is *technically fetchable* — the 06-02 doc's uncertainty about that specific question is resolved.
2. **But `config/pm-market-mappings.json`'s 12 rules are all keyed to 2026-specific market slugs.** Read in full this session — every rule matches on strings like `will-the-us-invade-iran`, `us-announces-blockade-on-iran`, `iran-full-airspace-closure`, `israel-closes-its-airspace`, `iran-charges-hormuz-fees`, `fed-rate-hike-in-2026`, `will-bitcoin-reach-`, all `addedBy: "manual-2026-07-14"` or `"manual-seed"` (2026-05-31) [VERIFIED: `config/pm-market-mappings.json:1-169`, quoted]. These specific markets (this project's simulated 2026 Iran-conflict / rate-decision storylines) did not exist on Polymarket in 2023-2025. A real backtest against that period would need an **entirely different, hand-curated set of mapping rules** for whatever markets Polymarket actually ran in 2023-2025 (2024 US election markets, 2023-2024 Fed-decision markets, etc.) — this is net-new curation work comparable in size to the original `PmMappingEngine` seeding effort (Plan 10-04), not a data-fetch task. It is **not in scope for M2-05 v1** and should not be attempted casually.

### Recommendation: live-window backtest gate, not a literal regime backtest

**Do not build a 2018-2025-regime-segmented backtest for M2-05 v1.** Instead:

1. **Build a "live-window" validation path** that runs `StrategyEngine.generateCandidates(asOfDate)` for each day in the real substrate window (2026-05-23 → today, or the sub-range where the needed data exists per type — see table below), computes an equity curve from the emitted candidates' entry/target/stop math, and feeds it through `PerformanceMetricsCalculator.calculate(equityCurve, trades, ...)` directly — **not** through `regime-segmenter.sliceByRegime`/`metricsByRegime`, since there is no regime-window overlap to slice against. `PerformanceMetricsCalculator` (`src/backtesting/analytics/performance-metrics.ts:14`, static `calculate` at `:18` [VERIFIED]) computes full-period Sharpe/Sortino/volatility/maxDrawdown without any windowing dependency, so this reuses existing, already-tested calculation code.
2. **Report per-signal-type and combined Sharpe/MaxDD over the live window**, explicitly labeled "single continuous 2026 window — not the CONTEXT-locked per-regime bull/bear/highVol bar." This is the honest interim acceptance gate.
3. **Per-signal-type data availability for this live-window backtest** (verified in §0):

| Signal type | Needs `scored-articles`? | Usable date range today | After `intel backlog-drain` |
|---|---|---|---|
| SECTOR_ROTATION_FROM_PM | No (PM snapshots only) | 2026-05-23 → today (continuous) | Same — unaffected by the outage |
| CATALYST_ANCHORED | No (catalyst-flags only) | 2026-05-31 → today (continuous) | Same |
| SENTIMENT_VELOCITY | Yes | 2026-06-02 → 2026-07-26, with named gaps (36 days, non-contiguous) | Extends through 2026-08-27 once backlog is drained; still has the 06-27/28, 07-01, 07-04/05, 07-09→21 gaps unless those articles are separately re-fetched (they were never scored — the backlog only covers the 07-26→08-27 outage window, not the earlier gaps) |
| FADE_OVERSHOOT | Yes (needs 7-day rolling PM/sentiment history) | Same as SENTIMENT_VELOCITY | Same |

4. **Explicitly surface to the operator, before the backtest task ships**, that:
   - The CONTEXT-locked "per-regime Sharpe>0.5, MaxDD<25%, bull-positive, combined>best-single-type" bar **cannot be evaluated today** for any signal type, and won't become evaluable by waiting for more scored-article days — it requires either (a) a policy decision to treat 2026-05-23→today as its own ad-hoc "regime" (added to `REGIMES` or handled via a parallel un-windowed calculator, which is what §8.1 already proposes) and accept operator-classified labeling of what kind of market calendar-2026 has been (the operator, per MEMORY.md, tracks a market thesis around "geopolitical/policy volatility + AI regime change" — that's a qualitative read, not the same as backtested Sharpe evidence), or (b) building the 2023-2025 PM-history + re-mapping project described above as separate, larger scoped work, likely a follow-up phase, not M2-05 v1.
   - Recommend: **ship M2-05 v1 with the live-window gate as an explicit "interim, not the CONTEXT bar" acceptance check**, and add a **new deferred item** (parallel to the existing "exit-signal emission" / "ML-learned ranking" deferrals) for "true per-regime backtest, pending either 2023-2025 PM-market re-mapping work or enough live 2026 trading history to itself be regime-classified." This is a genuine scope/acceptance-criteria question for the operator, not something research can silently resolve — **flag prominently in the plan-phase discussion**, same urgency as the 06-02 doc's Open Question #1, but now backed by a structural (not just thin-data) reason.

### Backtest engine integration (mechanically unchanged from 06-02)
- `BacktestStrategy` interface confirmed at `src/backtesting/types/backtest-types.ts:553` [VERIFIED — `generateSignal`, optional `onBar`]. Implement `MultiSignalBacktestStrategy implements BacktestStrategy` per the `strategy-adapter.ts` pattern (`src/backtesting/strategies/strategy-adapter.ts:1-40`, class doc re-read this session, confirms the 300-bar history-window trimming precedent and the newest-first/oldest-first bar-order gotcha that bit M2-01 — reuse the same STRATEGY_HISTORY_WINDOW pattern for consistency, not because M2-05's signals need 300 bars, but because the adapter contract expects it).
- For the live-window backtest, `SimpleBacktestEngine.run(symbol, bars)` (`src/backtesting/engine/simple-backtest-engine.ts:20,46` [VERIFIED]) is a lighter integration point than the full `BacktestEngine` — worth considering since M2-05's live-window run doesn't need multi-symbol portfolio simulation, just per-candidate P&L against real OHLCV. Planner's call.
- `rollup-backfill.ts`'s `rebuildRollupForDay(dataDir, date, engine, builder)` and `loadPmSignalsForDay` are the correct helpers for any day the live-window backtest needs to re-derive PM signals from raw snapshots (rather than trusting a possibly-stale `ticker-day-summary` row) — **reuse, don't reimplement**.

## 9. Pitfalls Specific to M2-05

### Pitfall 1: Same-ticker collisions across signal types
*(unchanged from 06-02)* Dedup at ranking by `(ticker, direction)`; same-direction → keep higher score + augment rationale; opposite-direction → emit both.

### Pitfall 2: VIX feed down → conservative default
*(unchanged from 06-02)* Default to `"elevated"`, persist last-known + timestamp, never default to `"calm"`.

### Pitfall 3: Live-window backtest survivorship / thin-history bias (rewritten from "backtest survivorship bias")
**What:** Unlike M2-01's 8-year universe, the live-window backtest (§8) only has ~90 calendar days of substrate, and only 36 (non-contiguous) of those have article-level scoring. Sharpe computed over ~36-90 daily observations is statistically noisy — a handful of lucky/unlucky trades will dominate the ratio.
**Why:** Sharpe's standard error scales with `1/sqrt(N)`; N≈36-90 is thin.
**Mitigation:** Report trade count alongside Sharpe/MaxDD in every backtest output; treat any Sharpe from <20 closed trades as directional only, not a pass/fail signal on its own. Document this explicitly in the `strategy backtest` output header, same spirit as CONTEXT's "may be lower-fidelity" acknowledgment but sharper now that real thinness is measured (36 days, not "some future accumulation").

### Pitfall 4: Backlog-drain timing races with a live scheduler
**What:** `intel backlog-drain` and the scheduler's in-cycle drain both mutate `score-backlog.jsonl` and `ticker-day-summary-*.jsonl`. If M2-05's backtest harness runs concurrently with a `backlog-drain --manage-server` invocation, rollup files could be mid-rewrite.
**Why:** `rebuildRollupForDay` writes are atomic-temp-rename per file, but the *set* of touched days is not transactionally isolated across the two processes.
**Mitigation:** `backlog-drain.ts` already has a lock file (`DRAIN_LOCK_FILE = "score-backlog.lock"`, `isDrainLocked`/`acquireLock`/`releaseDrainLock`, 2-hour staleness) [VERIFIED: `src/market-intelligence/signal/backlog-drain.ts:34-131`]. M2-05's backtest/live-run tasks should check `isDrainLocked(dataDir)` before reading `ticker-day-summary` for a "hot" (recent) day and either wait or read the pre-drain snapshot — this is a new pitfall the 06-02 doc could not have known about since the lock file didn't exist yet.

### Pitfall 5: ATR for low-priced stocks
*(unchanged from 06-02)* Cap stop-loss at `max(entry - 1.5*ATR_5, entry*0.95)`, mirror cap on target at `min(entry + 2.5*ATR_5, entry*1.15)`.

### Pitfall 6: Stale prior-day rollup for SENTIMENT_VELOCITY
*(unchanged from 06-02, now with a concrete real-world trigger)* Walk backward up to 7 calendar days for a non-empty rollup. **The 07-27→08-27 all-PM-only-rollup window (§0) is a live example of this exact failure mode** — if SENTIMENT_VELOCITY had been running during the outage, every 3-day Δ lookup in that window would have found `totalMateriality: 0` priors and correctly scored 0 (not crashed) — worth a specific fixture test using real files from this window.

### Pitfall 7: Operator-equity drift
*(unchanged from 06-02)*

### Pitfall 8: Binary catalyst handling
*(unchanged from 06-02)*

### Pitfall 9: Decision-log dedup at read time
*(unchanged from 06-02)*

### Pitfall 10 (new): CATALYST_ANCHORED corpus skew toward LLM-emergent catalysts
**What:** §0's verified distribution shows 71% of distinct catalysts are `product`/`lawsuit`/`ma`/`earnings`/`guidance` (LLM-emergent, spawned by `CatalystRefiner` from `scored.catalysts[]`), while the scheduled macro-print types CONTEXT.md highlights as the closest analog to the operator's trading style are only 5% of the corpus.
**Why:** Either FRED macro-release coverage is incomplete (unresolved this session — `.env` inspection denied by permission boundary) or monthly/quarterly release cadence genuinely produces few events per 90-day window.
**Mitigation:** Don't assume CATALYST_ANCHORED will primarily fire on FOMC/CPI/NFP-style events in early production. Fixture tests should include realistic `product`/`lawsuit`/`ma` catalyst samples (which use the generic `close + 2*ATR_5*dirSign` target formula), not just the FOMC/FDA-heavy examples in CONTEXT.md's worked description. Confirm `FRED_API_KEY` presence with the operator as part of plan-phase discussion (research could not verify this — read access to `.env` was denied under the untrusted-input/permission boundary).

## 10. Recommended Task Decomposition — updated 2026-08-27

Same wave shape as 06-02; adjustments noted inline.

### Wave A — Foundation (sequential)
- **A1.** Extract `catalyst-loader.ts` — **still needed**, confirmed not done (§1). Now has 2 known consumers to update (RollupBuilder, intel-commands.ts) plus M2-05's `strategy show-substrate`.
- **A2.** Extract public `TechnicalIndicators.calculateATRSeries(data, period)` — **still needed**, confirmed still private (§2).
- **A3.** Build `src/strategy/vix-provider.ts` — **still needed**, confirmed VIX still unwired (§2).
- **A4 (new).** Quick distribution check: run the §3 score formulas retroactively over the 36 real scored days + continuous PM/catalyst data to sanity-check the 0.4 floor before it's hardcoded. Cheap script, not a full task — fold into A1-A3's PR if trivial, or its own small task.

### Wave B — Engine core (parallel after A)
- **B1-B5** unchanged from 06-02: `types.ts`, then the four signal modules in parallel.

### Wave C — Orchestration (sequential, depends on B*)
- **C1, C2** unchanged: `strategy-engine.ts`, `decision-log.ts`.

### Wave D — CLI (parallel after C)
- **D1, D2** unchanged, naming convention re-confirmed (§6).

### Wave E — Backtest harness (reworked)
- **E1.** `src/strategy/backtest/live-window-runner.ts` — NOT `MultiSignalBacktestStrategy` wired to `regime-segmenter` (that path is blocked per §8). Instead: iterate real dates in the substrate window, call `StrategyEngine.generateCandidates`, build a synthetic equity curve from candidate entry/target/stop outcomes (using real OHLCV via `MarketDataService`), feed to `PerformanceMetricsCalculator.calculate()` directly. Reuse `rebuildRollupForDay`/`loadPmSignalsForDay` from `rollup-backfill.ts` for any day needing PM-signal re-derivation.
- **E2.** `strategy backtest` CLI action — runs E1's runner, reports full-period (not per-regime) Sharpe/MaxDD/trade-count per signal type + combined, with the Pitfall-3 thin-sample caveat printed in the output header.
- **E3 (new).** Document, in the phase's SUMMARY/handoff, the exact structural gap from §8 and the operator decision needed to unlock the CONTEXT-locked per-regime bar later (2023-2025 PM re-mapping project, or wait-and-classify-2026 approach). This is a deliverable, not optional.

### Wave F — Web dashboard minimal route
- **F1, F2** unchanged from 06-02.

### Wave G — Worked example / acceptance
- **G1.** Iran-ceasefire-style end-to-end happy path — still valid as a fixture pattern, but note the *specific* Iran fixture from M2-04's acceptance test used 2026-06-01-era data; reuse that fixture shape, not the exact record (dates have moved on).
- **G2.** Phase summary: report live-window backtest numbers (not per-regime), document the validation gap honestly per E3, update STATE.md + ROADMAP.md.

### Parallelism summary
Same shape as 06-02: Wave B max-parallel (5 after A), Waves D+E+F together after C. A1 blocks B2+B5; A2 blocks C1; C1+C2 block everything downstream. Backtest rework (E1-E3) doesn't change the critical path length, just what E1/E2 build.

## Standard Stack

No new external packages required. M2-05 is entirely additive Node/TypeScript code reusing already-installed dependencies:

| Library | Version (installed) | Purpose | Why reused, not new |
|---------|---------|---------|--------------|
| `technicalindicators` | `^3.1.0` [VERIFIED: `npm view technicalindicators version` → `3.1.0`; `package.json` pins `^3.1.0`] | ATR series for entry/target/stop math | Already the ATR source for `TechnicalIndicators`; M2-05 just needs a public wrapper (§2, Wave A2) |
| `commander` | (existing, used by `intel`/`backtest` CLIs) | `strategy` CLI subcommand group | Same pattern as `registerIntelCommands`/`registerBacktestCommands` |
| `chalk`, `ora` | (existing, used by `intel` CLI) | CLI output formatting | Same pattern as `intel-commands.ts` |
| Node `fs/promises` | built-in | JSONL persistence via `JsonlStore` | Existing pattern, no new I/O library |

### Alternatives Considered
None — the project's established pattern (sibling module to `market-intelligence/signal/`, reusing `JsonlStore`, `MarketDataService`, `PerformanceMetricsCalculator`) is a direct fit; introducing a new library (e.g. a dedicated technical-analysis or strategy-framework package) would duplicate infrastructure this codebase already has working and tested.

## Package Legitimacy Audit

**No new external packages are proposed for this phase.** M2-05 is built entirely on already-installed, already-audited dependencies (`technicalindicators@3.1.0`, `commander`, `chalk`, `ora`, Node built-ins). No `npm view`/registry legitimacy check was needed since nothing new is being added to `package.json`.

If the planner later decides to add a VIX-specific data library (instead of the recommended `YahooFinanceProvider.fetchHistoricalDataRange("^VIX", ...)` reuse) or a dedicated statistics library for Sharpe/Sortino (instead of reusing `PerformanceMetricsCalculator`), that package would need to go through the full Package Legitimacy Gate at that time — not needed for the plan as researched, since both needs are met by existing code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sharpe/Sortino/MaxDD calculation | A new stats module | `PerformanceMetricsCalculator.calculate()` (`src/backtesting/analytics/performance-metrics.ts:14,18`) [VERIFIED] | Already tested against M2-01's 1050-backtest sweep; reimplementing risks reintroducing the cross-window-jump bug M2-01 found and fixed |
| ATR computation | A new ATR implementation | `technicalindicators` `ATR` class via a new public wrapper on `TechnicalIndicators` | Library already vetted, already a dependency; just needs a public accessor (Wave A2) |
| JSONL append/read/dedup | A new file-storage layer | `JsonlStore<T>` (`src/market-intelligence/storage/jsonl-store.ts`) | Exact same shape M2-05's decision log and candidate files need; already atomic-write-safe |
| Historical PM-signal reconstruction | A new PM-signal-from-snapshot function | `loadPmSignalsForDay` (`rollup-backfill.ts:125`) [VERIFIED, new since 06-02] | Purpose-built for exactly this (re-derive TickerSignal[] from a day's snapshots file), landed 2026-08-27, don't duplicate it |
| Rollup rebuild for a historical day | A new rebuild function | `rebuildRollupForDay` (`rollup-backfill.ts:115`) [VERIFIED, new since 06-02] | Same reasoning — purpose-built, atomic, already used by production `backlog-drain.ts` |

**Key insight:** Two of the five "don't hand-roll" items are new since 06-02 — the 2026-08-27 scorer-outage fix work built exactly the self-healing/backfill primitives M2-05's backtest harness needs. This is a direct, unplanned synergy: the bug-fix branch (`fix/llm-correlator-retry-provenance`, merged to main) reduces M2-05's scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All of M2-05 | ✓ [VERIFIED: `node -v`] | v24.16.0 | — |
| pnpm | Build/test/install | ✓ [VERIFIED: `pnpm -v`] | 8.15.0 | — |
| `technicalindicators` npm package | ATR series (Wave A2) | ✓ [VERIFIED: `npm view` + `package.json`] | 3.1.0 installed | — |
| LM Studio (local LLM) | SENTIMENT_VELOCITY / FADE_OVERSHOOT data density | ✗ (off by default, RAM) [VERIFIED: `pgrep -fl lms` found nothing, 2026-08-27] | — | Operator runs `intel backlog-drain --manage-server` on demand, or switches to DeepSeek remote API (open decision, not this phase's to make) |
| DeepSeek remote API | Same, if operator switches providers | Unknown — not this session's decision | — | LM Studio remains the default fallback |
| Yahoo Finance (`^VIX`, historical OHLCV) | VIX regime, ATR price data | Not tested this session (network calls not exercised); unofficial API, no SLA | — | Cache last-known VIX regime; default to `"elevated"` on fetch failure (Pitfall #2) |
| `FRED_API_KEY` | CATALYST_ANCHORED macro-print density | **Unresolved** — `.env` read denied by permission boundary this session | — | Confirm with operator during plan-phase discussion; corpus already usable without it (§0/Pitfall 10) since most catalysts are LLM-emergent, not FRED-sourced |
| `config/strategy-config.json` | `assumedEquity` sizing fallback | ✗ does not exist yet [VERIFIED: `ls` this session] | — | Planner creates it (Claude's Discretion per CONTEXT.md) |
| `data/strategy/` directory | Decision-log/candidate persistence | ✗ does not exist yet [VERIFIED: `ls` this session] | — | Create in first task |

**Missing dependencies with no fallback:** None — every gap above has a documented fallback or is explicitly deferred to the operator's own decision (LLM provider, FRED key).

**Missing dependencies with fallback:** LM Studio (backlog-drain on demand), Yahoo VIX (conservative regime default), FRED (corpus already catalyst-rich without it).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest [VERIFIED: `package.json` `"test": "vitest"`, `vitest.config.ts` present] |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/strategy/**/*.test.ts` (once M2-05 tests exist) |
| Full suite command | `pnpm vitest run` (currently 380/380 green per STATE.md 2026-08-27 entry) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INCOME-01 (ext) — CATALYST_ANCHORED scoring | `score()` formula produces 0-1 output, direction from `catalyst.direction`, `"uncertain"` skips, `"binary"` emits two candidates | unit | `pnpm vitest run src/strategy/signals/__tests__/catalyst-anchored.test.ts` | ❌ Wave B2 |
| INCOME-01 (ext) — SENTIMENT_VELOCITY scoring | Δ-sentiment × materiality-floor math; missing/stale 3-day prior falls back to backward-walk (Pitfall #6) | unit | `pnpm vitest run src/strategy/signals/__tests__/sentiment-velocity.test.ts` | ❌ Wave B3 |
| INCOME-01 (ext) — SECTOR_ROTATION_FROM_PM scoring | `pmContribution.sources[]` aggregation, zero-PM-row filter (Pitfall #5 in 06-02) | unit | `pnpm vitest run src/strategy/signals/__tests__/sector-rotation.test.ts` | ❌ Wave B4 |
| INCOME-01 (ext) — FADE_OVERSHOOT scoring | overshoot-magnitude × recency-decay math, counter-trend direction | unit | `pnpm vitest run src/strategy/signals/__tests__/fade-overshoot.test.ts` | ❌ Wave B5 |
| INCOME-01 (ext) — Cross-type ranking | Top-5 cap, 0.4 floor, sub-threshold-3 diagnostic, same-ticker dedup (Pitfall #1) | unit | `pnpm vitest run src/strategy/__tests__/strategy-engine.test.ts` | ❌ Wave C1 |
| INCOME-01 (ext) — VIX-regime sizing | Regime→pct table, FADE 50% modifier, max-4-positions cap | unit | `pnpm vitest run src/strategy/__tests__/sizing.test.ts` | ❌ Wave B/C |
| INCOME-01 (ext) — Entry/target/stop math | Per-type ATR multiplier table, price-relative caps (Pitfall #6 in 06-02 renumbered #5 here) | unit | `pnpm vitest run src/strategy/__tests__/levels.test.ts` | ❌ Wave B/C |
| INCOME-01 (ext) — Decision log append/dedup | Skip→re-accept→close reconciliation (Pitfall #9 in 06-02) | unit | `pnpm vitest run src/strategy/__tests__/decision-log.test.ts` | ❌ Wave C2 |
| INCOME-01 (ext) — CLI surface | All 9 `strategy` subcommands register and run against fixture data | integration | `pnpm vitest run src/strategy/cli/__tests__/strategy-commands.test.ts` | ❌ Wave D1 |
| INCOME-01 (ext) — Live-window backtest gate | Full-period Sharpe/MaxDD/trade-count computed via `PerformanceMetricsCalculator.calculate()` over real substrate window; thin-sample caveat surfaced (Pitfall #3 rewritten) | integration | `pnpm vitest run src/strategy/backtest/__tests__/live-window-runner.test.ts` | ❌ Wave E1 |
| INCOME-01 (ext) — worked example (Iran-style happy path) | End-to-end: fixture PM snapshot → candidate → CLI accept → CLI close → decision-log record exact | integration | `pnpm vitest run src/strategy/__tests__/worked-example.test.ts` | ❌ Wave G1 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/strategy/**/*.test.ts` (scoped to new module) + `pnpm tsc --noEmit`
- **Per wave merge:** `pnpm vitest run` (full 380+ suite, must stay green — matches the project's established discipline per every M2-04 SUMMARY entry)
- **Phase gate:** Full suite green + `strategy backtest` live-window run completes without throwing + E3's documented gap write-up exists, before `/gsd-verify-work`

### Wave 0 Gaps
- `src/strategy/` directory and all listed test files — none exist yet; this is a greenfield module.
- `config/strategy-config.json` — needs creation with `assumedEquity` default (planner's discretion per CONTEXT.md).
- No framework install needed — Vitest is already configured project-wide.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` [VERIFIED: config.json contains only `mode`, `parallelization`, `createdAt`, `granularity` keys — no `workflow` block, so treat as enabled per default].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — CLI is a local personal tool; web route reuses existing `optionalAuthMiddleware`, no new auth surface | — |
| V3 Session Management | No — no new session state introduced | — |
| V4 Access Control | Marginal — `/api/strategy/*` endpoints should require the same access level as `/api/monitoring/*` (existing pattern), not looser | Reuse `optionalAuthMiddleware` exactly as-is, do not introduce a new unauthenticated path |
| V5 Input Validation | Yes — CLI args (`--entry`, `--target`, `--stop`, `--size`, dates) and web POST bodies (accept/skip overrides) are operator-supplied numbers/strings that flow into file writes and (eventually, M2-02/07) real orders | Validate numeric ranges (positive entry/target/stop, size within a sane bound) before writing to the decision log; reject malformed `candidateId` lookups with a clear error rather than silently no-op |
| V6 Cryptography | No — no new secrets/crypto introduced. Existing `secure-config.ts` pattern (used for `apis.fred`, LLM keys) is the precedent if M2-05 ever needs a new secret (e.g., a broker key) — out of scope for v1 | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/adversarial `--note` free-text flowing into JSONL then rendered in CLI/web output | Tampering / Information Disclosure (low severity — single-operator tool) | Treat `operatorNote`/`closeOperatorNote` as opaque display strings; do not `eval`/interpolate into shell commands (no evidence any existing code does this) |
| Operator-controlled `--entry/--target/--stop/--size` overrides accepted without bound checks | Tampering (self-inflicted — no adversary, but a fat-fingered `--size 750000` against a $7,500 assumed equity should not silently persist) | Validate `operatorSizeUsd` against `assumedEquity` × a sane multiple (e.g., reject >2x max regime size) with a warning, not a hard block — the operator is trusted, but this catches typos, consistent with Pitfall #7's staleness-warning philosophy |
| `candidateId` collision (same ticker+type+day+hash) | Tampering (data integrity) | The `${YYYY-MM-DD}-${signalType}-${ticker}-${shortHash}` format (CONTEXT-proposed) already includes a hash component for exactly this; verify the hash source includes enough entropy (e.g., score value + generation timestamp) that two same-day same-type same-ticker candidates (Pitfall #1's collision case) get distinct ids even before dedup logic runs |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FRED macro-calendar coverage is either genuinely sparse or partially configured — not resolved this session (`.env` read denied) | §0, Pitfall 10 | If FRED is actually fully configured and genuinely produces few events, no impact. If it's misconfigured, CATALYST_ANCHORED will under-represent the macro-print signal type CONTEXT.md calls out as closest to the operator's trading style — confirm with operator before finalizing CATALYST_ANCHORED fixtures |
| A2 | Yahoo `^VIX` endpoint viability was not live-tested this session (repeat of 06-02's tertiary-confidence flag) | §2 | If Yahoo rejects `^VIX` or rate-limits, VIX regime detection needs a fallback provider — mitigated by the conservative "elevated" default (Pitfall #2), but should be verified in the first Wave-A3 task, not assumed |
| A3 | Polymarket's real-world volume ramp ("didn't have meaningful volume until 2023") is training-knowledge, not verified via a dated source this session | §8 | Low risk — this claim only matters if the operator chooses to pursue the deferred 2023-2025 PM-remapping backtest project; it doesn't affect M2-05 v1's recommended live-window approach either way |
| A4 | DeepSeek API cost/rate-limit specifics beyond the `PROVIDER_PRICING` table already in code were not independently re-researched this session (STATE.md's existing open-decision writeup was treated as sufficient context, per the task brief's explicit instruction not to decide the provider question) | §0, §1 | Low risk to M2-05 itself — the provider decision is explicitly out of scope for this phase; only matters if the operator switches mid-M2-05-build, in which case `scorerModel` filtering already covers the mixed-corpus case |

## Open Questions

1. **Backtest scope conflict requires an explicit operator decision before Wave E ships** — the CONTEXT-locked "2018-2025 + M2-01 regimes" instruction is structurally unsatisfiable (§8, verified via direct code read of `regime-segmenter.ts`'s hardcoded windows). Recommend: ship the live-window gate as the v1 acceptance check, defer the literal per-regime bar to a follow-up (either a 2023-2025 PM-remapping project or waiting for 2026 itself to be regime-classified). **This must be surfaced and confirmed during `/gsd-plan-phase 11`'s discussion, not silently decided by the planner.**
2. **FRED_API_KEY coverage** — unresolved this session (permission boundary blocked `.env` inspection). Confirm with operator whether the 8 FRED release feeds are fully wired; affects CATALYST_ANCHORED's expected signal mix (Pitfall 10).
3. **Engine cadence** — unchanged from 06-02: separate `strategy run` invocation (manual or once-per-market-open) recommended over wiring into `runCycle`, for the same reasons (decoupling, easier debug, doesn't need 60-90s cadence).
4. **Web auth on strategy endpoints** — unchanged from 06-02: `optionalAuthMiddleware` for v1 consistency with `/api/monitoring/*`.
5. **CatalystRefiner direction/confidence trust for the now-dominant LLM-emergent catalyst types** (`product`/`lawsuit`/`ma`, §0/Pitfall 10) — worth instrumenting via `strategy show-substrate` after a week of live CATALYST_ANCHORED candidates, since these types are now known to be the majority case rather than an edge case.

## Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| M2-04 substrate types & APIs | **HIGH** | Re-read every relevant file this session; all line numbers re-confirmed, two new files (`rollup-backfill.ts`, `backlog-drain.ts`) fully read |
| Data availability inventory (§0) | **HIGH** | Direct shell inspection (`wc -l`, per-file `articleCount` scans, distinct-id dedup counts) this session, not inference from STATE.md prose |
| Backtest structural gap (§8) | **HIGH** | Verified via direct read of `regime-segmenter.ts`'s `REGIMES` constant + `config/pm-market-mappings.json`'s full 12-rule content + a live web search confirming the Polymarket `/prices-history` endpoint's existence and auth requirements |
| ATR / VIX gap analysis | **HIGH** | Re-confirmed via fresh grep this session; unchanged from 06-02 |
| Per-signal-type score formulas | **MEDIUM** | Math is CONTEXT-locked; calibration thresholds (0.4 floor, 7-day overshoot window) remain educated guesses — now with real 36-day data available to sanity-check against (Wave A4) before shipping |
| Entry/target/stop ATR multipliers | **MEDIUM** | Unchanged from 06-02 — standard practice, specific multipliers need post-launch tuning |
| Decision-log schema | **HIGH** | Direct application of existing, now twice-precedented (`JsonlStore` + `backlog-drain.ts`'s day-bucketed append) patterns |
| CLI surface | **HIGH** | Naming convention now has two production precedents (`intel themes-review`, `intel backlog-drain`), not just one |
| Web dashboard minimal scope | **MEDIUM** | Unchanged from 06-02 |
| Package legitimacy | **HIGH** | No new packages proposed; existing dependency versions verified via `npm view` |
| Validation architecture | **MEDIUM** | Test file paths are proposed (don't exist yet), naming follows established Vitest colocated `__tests__/` convention already used throughout `src/market-intelligence/` and `src/backtesting/` |
| Task decomposition | **MEDIUM** | Same shape as 06-02 with concrete updates for the two new production helpers and the reworked backtest wave |

## Sources

### Primary (HIGH confidence — direct code reads, this session, 2026-08-27)
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/types.ts` — full type catalog, `scorerModel`/`scorerVersion` fields
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/rollup-builder.ts` — `loadActiveCatalysts` still private, line confirmed
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/pm-mapping-engine.ts` — `TickerSignal` interface, `mapMarket`/`mapMarkets`
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/rollup-backfill.ts` — new file, fully read, `rebuildRollupForDay`/`loadPmSignalsForDay` exports
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/backlog-drain.ts` — new file, fully read, lock-file mechanics
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/signal/article-scorer.ts` — concurrency clamp re-confirmed at line 189
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/cli/intel-commands.ts` — `resolveLlmConfig`, CLI pattern
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/correlator/llm-correlator.ts` — `PROVIDER_PRICING`, `deepseek-chat`/`deepseek-reasoner` entries
- `/home/kopacz/projects/stock-sense-ai/src/market-intelligence/storage/jsonl-store.ts` — `readDay`, `appendManyOn`
- `/home/kopacz/projects/stock-sense-ai/src/analysis/technical-indicators.ts` — ATR still private, line confirmed
- `/home/kopacz/projects/stock-sense-ai/src/data/market-data-service.ts` — `fetchHistoricalData`, `getFullAnalysisData` lines confirmed
- `/home/kopacz/projects/stock-sense-ai/src/data/providers/yahoo-finance-provider.ts` — `fetchHistoricalDataRange` line confirmed
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/analytics/regime-segmenter.ts` — `REGIMES` constant, full content quoted (§8 structural finding)
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/analytics/performance-metrics.ts` — `PerformanceMetricsCalculator.calculate`/`calculateDrawdowns`
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/types/backtest-types.ts` — `BacktestStrategy` interface, line 553
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/strategies/strategy-adapter.ts` — 300-bar window precedent
- `/home/kopacz/projects/stock-sense-ai/src/backtesting/engine/backtest-engine.ts`, `simple-backtest-engine.ts` — engine entry points
- `/home/kopacz/projects/stock-sense-ai/config/pm-market-mappings.json` — full 12-rule content read and quoted (§8)
- `/home/kopacz/projects/stock-sense-ai/.planning/config.json` — confirmed no `workflow.nyquist_validation` override
- `/home/kopacz/projects/stock-sense-ai/data/intel/` — direct shell inspection: `wc -l`, per-file `articleCount` scans, distinct-catalyst-id dedup, correlator-provenance timeline, all tabulated in §0
- `/home/kopacz/projects/stock-sense-ai/data/strategy/`, `/home/kopacz/projects/stock-sense-ai/config/strategy-config.json` — confirmed absent

### Secondary (CONTEXT/STATE-driven)
- `/home/kopacz/projects/stock-sense-ai/.planning/phases/11-ai-strategy/11-CONTEXT.md` — locked decisions, signal types, sizing, log schema
- `/home/kopacz/projects/stock-sense-ai/.planning/STATE.md` — 2026-08-27 "Data reality" block, scorer-outage fix summary
- `/home/kopacz/projects/stock-sense-ai/.planning/REQUIREMENTS.md` — INCOME-01 status and traceability

### Tertiary (MEDIUM confidence — external, this session)
- [CITED: https://docs.polymarket.com/api-reference/markets/get-prices-history] — Polymarket CLOB `/prices-history` endpoint existence, no-auth confirmation, used to resolve §8's Option-B feasibility question
- [ASSUMED] Polymarket real-world volume ramp timing ("didn't gain meaningful volume until ~2023") — training knowledge, not independently re-verified this session, low-impact on the v1 recommendation

## Metadata

**Confidence breakdown:** see table above.
**Research date:** 2026-06-02 (original) / 2026-08-27 (this refresh).
**Valid until:** ~30 days for the substrate/code-structure findings (stable codebase area); ~7-14 days for the §0 data-availability numbers specifically, since `intel backlog-drain` is expected to run soon and will change the `articleCount` coverage picture materially — **re-run the §0 shell inspection commands before finalizing the PLAN.md if more than a few days have passed since 2026-08-27, or after any backlog-drain run.**

---

## RESEARCH COMPLETE
