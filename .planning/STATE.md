---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 11
status: executing
stopped_at: Completed 11-04-PLAN.md
last_updated: "2026-08-28T14:29:04.534Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
current_phase_name: ai-strategy
---

# Stock Sense AI - Development State

## Current Status

| Field | Value |
|-------|-------|
| Active Milestone | M2 — AI-Augmented Swing Trading |
| Current Phase | 11 |
| Status | Executing Phase 11 |
| Last Pivot | 2026-05-23 |
| Last Updated | 2026-08-27 (scorer outage fixed; backlog-drain shipped; M2-05 planning next) |

---

## Milestone Progress

### Milestone 1 — Production-Ready Trading Platform

| Phase | Name | Status | Started | Completed |
|-------|------|--------|---------|-----------|
| 1 | Backtesting Fix | ✅ COMPLETE | 2026-01-16 | 2026-01-17 |
| 2 | Paper Trading | ✅ COMPLETE | 2026-01-17 | 2026-01-17 |
| 3 | Redis Infrastructure | ⏸ DEFERRED | — | — |
| 4 | Risk Integration | ⏸ DEFERRED | — | — |
| 5 | Code Quality | ⏸ DEFERRED | — | — |
| 6 | Testing | ⏸ DEFERRED | — | — |

### Milestone 2 — AI-Augmented Swing Trading (Active)

| Phase | Name | Status | Started | Completed |
|-------|------|--------|---------|-----------|
| M2-01 | Strategy Reality Check | ✅ COMPLETE | 2026-05-30 | 2026-05-30 |
| M2-02 | Alpaca Paper Integration | pending | — | — |
| M2-03 | Market Intelligence Bot | ✅ COMPLETE | 2026-05-23 | 2026-05-28 |
| M2-04 | LLM Trade-Signal Layer | ✅ COMPLETE | 2026-05-31 | 2026-05-31 |
| M2-05 | AI-Augmented Strategy Engine | 🔄 IN PROGRESS (4/8 plans: 11-01..11-04 done) | 2026-08-27 | — |
| M2-06 | Hard Risk Management | pending | — | — |
| M2-07 | Live Execution + Tax Tracking | pending | — | — |

---

## Active Work

**Current Focus**: **M2-05 planning** on the substrate as it actually exists (see data reality below), then draining the 15k-article backlog so June–August rollups carry article sentiment.

**Data reality (2026-08-27)** — what M2-05 can actually train/validate on:

- `scored-articles-*.jsonl`: 36 days, 2026-06-02 → 07-26 (gaps 06-27/28, 07-01, 07-04/05, 07-09→21), ~30k records. **Nothing 07-26 → 08-27** until the backlog is drained (~10 h at ~2.5 s/article on local Qwen3-14B; `pnpm intel backlog-drain`).
- `ticker-day-summary-*.jsonl`: continuous 05-31 → today (851 rows), but PM-only (`articleCount: 0`) for 07-26 → 08-27 until rebuilt by the drain.
- `polymarket-snapshots` (78k), `news` (254k), `catalyst-flags` (3.6k), `alerts-fired` (6.4k; `correlator` stamp only from 07-26) — continuous 05-23 → today.
- Telegram is one-way (bot → operator); every message is rendered from these files. No extra data lives in Telegram.

**Open decision — LLM provider**: operator keeps LM Studio off by default (~9 GB RAM) and is considering DeepSeek's API (OpenAI-compatible; `LLM_ENDPOINT=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat` flips `provider: "remote"` and engages the $5/day cap). Needed before switching: (1) lift the `concurrency: 1` clamp in `ArticleScorer` for remote providers, (2) apply the daily USD cap to scoring (today only the correlator checks it), (3) run `intel stability-test` on a shared window to measure Qwen→DeepSeek drift before the corpus mixes models (`scorerModel` is recorded per record, so it stays filterable either way).

**Blocking Issues**: None.

**Next Actions**:

1. Drain the backlog when LM Studio can be up for ~10 h (`pnpm intel backlog-drain --manage-server`), or switch provider first and drain via API.
2. `/gsd-execute-phase 11` — M2-05 is planned: 8 plans in 5 waves (wave 1: `11-01` article-intake pre-screen ∥ `11-02` tracer; wave 2: `11-03` CATALYST_ANCHORED ∥ `11-04` SENTIMENT/FADE; wave 3: `11-05` engine integration; wave 4: `11-06` live-window backtest ∥ `11-07` web route; wave 5: `11-08` worked example + acceptance). Backtest scope changed by operator decision 2026-08-27: the per-regime 2018-2025 bar is structurally unevaluable, so v1 ships a live-window gate over the real 2026 substrate, labelled interim (see the M2-05 section of ROADMAP.md).
3. Decide the LLM provider question (above) — it changes how fast the corpus grows and whether the scorer-down failure mode can recur.
4. Operator manual setup carried over: FRED_API_KEY (8 macro feeds), `config/fda-pdufa-seed.json` quarterly, `config/opec-schedule-seed.json` + `EIA_HOLIDAY_SHIFTS` each December.
5. Weekly: `intel themes-review` + `intel pm-mappings-review`.

**M2-05 scope grows** (carried over from M2-01 verdict): previous assumption was "layer AI on top of MomentumStrategy + MeanReversionStrategy". With both DISCARD'd, M2-05 must design fresh signals first (catalyst-driven entries from M2-04, volatility-breakout, sector-rotation rules). Plan M2-05 phase scoping when M2-04 is closer to done.

---

## Session History

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-16 | M1 Initialized | Created roadmap, state, phase directories, requirements traceability |
| 2026-01-16 | Plan 01-01 | Enabled CLI backtest commands (commit: a30153c) |
| 2026-01-16 | Plan 01-02 | Fixed StrategyAdapter type safety (commit: 47837f4) |
| 2026-01-16 | Plan 01-04 | Added comprehensive performance reports with 30+ metrics (commit: 2354f4b) |
| 2026-01-17 | Plan 01-03 | Added grid search optimization and walk-forward analysis CLI commands (commit: 6482458) |
| 2026-01-17 | Phase 01 | Backtesting Fix phase COMPLETE |
| 2026-01-17 | Plan 02-01 | Real market data integration for paper trading (5 commits) |
| 2026-01-17 | Plan 02-02 | Strategy loading API (5 commits) |
| 2026-01-17 | Plan 02-03 | Trailing stop fixes (5 commits) |
| 2026-01-17 | Plan 02-04 | Order type verification (3 commits) |
| 2026-01-17 | Phase 02 | Paper Trading phase COMPLETE |
| 2026-05-23 | **Milestone Pivot** | M1 paused after Phase 2; M2 (AI-Augmented Swing Trading) begun. PROJECT.md, ROADMAP.md, REQUIREMENTS.md rewritten. |
| 2026-05-23 | M2-03 begun | Built news + Polymarket + rule-based + LLM correlator + Telegram alerts; node-cron scheduler; persisted JSONL streams. |
| 2026-05-26 | M2-03 commit 4aed303 | First full end-to-end commit — pipeline producing alerts via local Qwen 3 14B + Telegram. |
| 2026-05-28 | M2-03 commit be4107c | Follow-up: macro RSS news source (CNBC/Google/MarketWatch), Polymarket volume-desc sort fix, CLI/scheduler pipeline consolidation. Pipeline started firing real Iran-peace + BTC-divergence alerts. |
| 2026-05-28 | M2-03 commit 0aff0e5 | Scheduler fix: replaced node-cron with sleep-resilient setInterval heartbeat (WSL2 host-sleep was silently dropping `*/15` cron fires during market hours). |
| 2026-05-28 | **Phase M2-03 COMPLETE** | Acceptance: 7 Telegram alerts validated in production (Iran peace ÷ oil-strike confirm, BTC threshold divergences). Known limitation: PM markets are macro-only — translation layer to single-ticker actions is the M2-04 gap. |
| 2026-05-30 | Plan 07-02 | Extracted StrategyAdapter + createStrategyFactory from CLI into reusable `src/backtesting/strategies/strategy-adapter.ts` (commits 920c0dc, 0b5370e). Pure refactor — Plan 05 runner can now construct strategies without depending on `src/cli/`. |
| 2026-05-31 | Plan 07-01 | Added `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` (commit 84d4a55) and wired Yahoo as the third fallback in `MarketDataService.fetchHistoricalData` with cache write-through (commit 81a1d19). M2-01 universe prefetch (35 tickers × 8 years) now fits in one batch run instead of multi-day slicing around the Alpha Vantage 25-req/day quota. |
| 2026-05-31 | Plan 07-04 | Built `regime-segmenter.ts` (commit ff925db) with REGIMES constant + sliceByRegime + metricsByRegime. Per-sub-window daily-return recomputation drops cross-window jump returns (Sharpe stays sane on discontinuous bull = 2019+2020-H2+2023+2024 windows); maxDrawdown selected as worst per-sub-window. 12 vitest unit tests landed (commit ea9c40d), including a "100k→180k cross-window jump" test that demonstrably proves volatility stays <1.0. Plan 05 reality-check runner now has its per-regime metrics dependency. |
| 2026-05-31 | Plan 07-03 | Prefetched 35-ticker M2-01 universe across 2018-01-01 -> 2025-12-31 via Yahoo fallback (commits 6f531f3 + 428033f). Added `scripts/m201-prefetch-universe.ts` (batched 10/10/10/5 runner, per-symbol retry-once) and `scripts/m201-prefetch-report.ts` (cache-hit-only analyzer). 35/35 tickers came back OK with 2010 bars each, gap 0.30% (NYSE-calendar-vs-252/yr rounding noise, not data degradation). META historical continuity confirmed across the 2022 FB->META rename — no symbol-switch needed. Total cache: 14MB under `data/cache/historical/`. Per-ticker quality report at `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md`. |
| 2026-05-30 | Plan 07-05 | Built `scripts/m201-reality-check.ts` (~445 lines) and ran the full 1050-backtest sweep (35 tickers × 2 strategies × 15 params, 2018-2025, FixedBPSSlippageModel(5) + FixedCommissionModel(0)) in 35:24 with 100% success and 0 errors (commits be06560, 748db48). Output `.planning/phases/07-strategy-reality-check/results.jsonl` 3.5 MB. Fixed 3 latent bugs inline (Rule 1): SimpleBacktestEngine was passing `[bar]` instead of history-to-date to strategy.onBar (every indicator-based strategy threw "Insufficient historical data" → 0 trades), StrategyAdapter was passing bars in engine order but strategies expect newest-first (SELL signals fired against 2018 prices in 2025 → 0 closed trades), and the adapter passed full 2010-bar history per call (O(N²) work, sweep would take 140 min). Capped history at 300 bars → 4× speedup. Aggregate result: avg bull Sharpe +0.62, bear -0.43, highVol +0.16 across all 1050 backtests — clean per-regime signature that confirms Plan 04's regime segmenter is doing real work. Plan 06 (RECOMMENDATION.md) is now unblocked. |
| 2026-05-30 | Plan 07-06 | Built `scripts/m201-build-recommendation.ts` (~700 lines) and produced `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` (214 lines, commit 9d8c78a). Both MomentumStrategy + MeanReversionStrategy formally DISCARD'd against the CONTEXT.md pass/fail bar. Momentum: 0/35 KEEP at best config (shortMA=10, minConfidence=65), bear Sharpe -0.70 invariant to params. MeanRev: 1/35 KEEP (LLY — sample noise) at best config (rsiOversold=20, rsiOverbought=70), bear Sharpe -0.35, high-vol \|MaxDD\| 32.8%. Engine finding surfaced as side-effect of sensitivity analysis: MomentumStrategy ignores `shortMA` entirely (5 values produce byte-identical Sharpe — param exposed but not consumed). M2-05 scope grows: design fresh signals (catalyst-driven, vol-breakout, sector-rotation) BEFORE AI layering. **M2-01 phase ✅ COMPLETE — 6/6 plans done with 100% success rate.** |
| 2026-05-30 | **Phase M2-01 COMPLETE** | Acceptance: per CONTEXT.md success criterion 4 ("at least one strategy demonstrates Sharpe>0.5 and MaxDD<25% across all regimes — OR — both are formally rejected with documented evidence"), the second branch is satisfied. RECOMMENDATION.md documents both rejections with per-regime Sharpe / MaxDD / win-rate medians across the 35-ticker universe. Operator can now move forward with the M2-04 / M2-05 path. |
| 2026-05-31 | Plan 10-01 | M2-04 foundation: 6 config JSON seeds in `config/` (themes×24, themes-rejected, macro-tickers×24, pm-market-mappings×3+proposed[], fda-pdufa-seed, opec-schedule-seed), shared types module `src/market-intelligence/signal/types.ts` (258 lines, 12 exports including 9 named contracts ScoredArticle / CatalystFlag / CalendarEvent / TickerDaySummary / ThemeCandidate / PmMapping / PmMappingProposal / DigestPayload / ScoreBacklogEntry), and `apis.fred?` added to ConfigSchema (commits c5a957d, 7c41a06). `pnpm tsc --noEmit` clean. Wave 2 plans (10-03/04/05) unblocked — they all import from this types module only, no cross-imports between Wave 2 modules. |
| 2026-05-31 | Plan 10-04 | PmMappingEngine landed (commit 65a3144). `src/market-intelligence/signal/pm-mapping-engine.ts` (~230 lines) with `mapMarket()` / `mapMarkets()` / `invalidateCache()` / `mappingCount()`. Match precedence eventSlug → slugPrefix → questionContains, all populated criteria must match, all-null rules refuse to fire. Sign math as single 4-factor product `movePp × dirSign × weight × interpSign` — noPp inversion is a single ±1 flip. EXCLUSION_KEYWORDS bypass runs before mapping (sports/entertainment markets generate neither signals nor proposals). Unmatched markets persist as `PmMappingProposal` shell records with `proposedTickers: []` for the Plan 10-02 article scorer's LLM fallback to enrich. 8 vitest cases all green on first run, covering: Iran ceasefire noPp inversion (-4pp → +4 XLE), BTC slugPrefix, Fed multi-field, unmatched → proposal persist, EXCLUSION_KEYWORDS bypass, all-null refusal, multi-rule stacking, cache + invalidateCache reload. `pnpm tsc --noEmit` clean. Plan 10-05 RollupBuilder unblocked on the PM-contribution side. |
| 2026-05-31 | Plan 10-02 | ArticleScorer + ScoreBacklog landed (commits 2ed987e, 4c0b2eb). `src/market-intelligence/signal/article-scorer.ts` (~530 lines) mirrors LlmCorrelator's LM Studio call surface byte-for-byte: OpenAI SDK with baseURL override, `apiKey: "lm-studio"` default, `timeout: 60_000`, `maxRetries: 0`, `/no_think` directive, `response_format` omitted (LM Studio rejects `"json_object"`). SCORER_VERSION="v1" + SYSTEM_PROMPT_V1 frozen. Sequential gate via `this.inFlight` promise chain — empirically proven serialized via maxConcurrent counter test (3 parallel calls without await between → maxConcurrent stays at 1). `concurrency > 1` clamped to 1 with console.warn (single-GPU saturation). On LLM failure throws — caller queues to backlog (no rule-based fallback substitution). `parseScorerResponse` tolerant of bare JSON, ```json fenced```, and leading-prose+JSON; clamps sentiment to [-1,1], materiality to [0,1], caps themes at 5, drops invalid catalysts. `fanOutScoredArticle` handles per-ticker, affected_tickers ∩ universe, and themed-only ticker="" cases. `src/market-intelligence/signal/score-backlog.ts` (~160 lines) — single-file rolling backlog at `data/intel/score-backlog.jsonl` with atomic temp-file-rename writes, FIFO drain ordering, maxN cap (default 50), bail-on-first-failure semantics. 26 vitest tests (18 article-scorer + 8 score-backlog), all green. Auto-fixed inline (Rule 2): SYSTEM_PROMPT_V1 catalyst-type list expanded from plan's 10 to types.ts's 22 — narrower prompt enum would have caused silent runtime drops of valid LLM-emitted catalysts (cpi/nfp/pce/jolts/ism/opec/etc). Plan 10-05 RollupBuilder now unblocked on the scored-article side. |
| 2026-05-31 | Plan 10-03 | M2-04 Calendar Layer landed (commits 9afc3e6, 129b31c). 5 fetchers + 1 orchestrator under `src/market-intelligence/signal/calendar/`: FredCalendarFetcher (8 release IDs locked, `Promise.allSettled` per release, graceful no-op when `apis.fred` missing), FinnhubEarningsCalendarFetcher (1 call per window, client-side filter by uppercase symbol, `amc`→16:30 / `bmo`→08:00 ET), TreasuryAuctionCalendarFetcher (live-spike-confirmed `v1/upcoming_auctions?sort=-auction_date`, reopening-aware regex for 10Y/20Y/30Y including `9-Year 10/11-Month` etc.), EiaCalendarGenerator (pure-deterministic Wednesday emitter, operator-maintained `EIA_HOLIDAY_SHIFTS` currently empty), SeedFileCalendarLoader (FDA PDUFA + OPEC seeds, ENOENT→[]). CalendarRefresher composes all 5 via `Promise.allSettled`, dedups by id, appends to `data/intel/catalyst-flags-YYYY-MM-DD.jsonl`. Live curl spike of TreasuryDirect Fiscal Data API documented at `.planning/phases/10-llm-trade-signal/10-03-treasury-spike.md` — confirmed endpoint + reopening-term nuance before code-write. 11 vitest tests (7 EIA + 4 seed loader), all green. End-to-end smoke (10-ticker universe, 60d window, no FRED key): 17 events written in 523ms = 6 finnhub-earnings + 2 treasury + 9 eia-cron. FRED degraded gracefully — warning logged, NOT in `failed[]` because no-key branch returns `[]` cleanly. `pnpm tsc --noEmit` clean. **M2-04 Wave 1+2 COMPLETE — Wave 3 (10-05/06/07) fully unblocked on all dependencies.** |
| 2026-05-31 | Plan 10-07 | M2-04 Wave 4 operator CLI surface COMPLETE (commits 5b7e060, f234d6f). 7 new `intel` subcommands: `scorer-ping` (real scoring call diagnostic), `calendar-refresh` (bypasses cycle-runner 24h gate), `calendar-list --days N --ticker T` (dedup-by-id scan of catalyst-flags-*.jsonl), `rollup-today --ticker T` (prints today's TickerDaySummary row), `themes-review --days N --min-mentions N` (interactive accept/alias/reject loop over LLM-proposed themes), `pm-mappings-review --days N` (interactive accept/reject loop over PM-mapping proposals), `stability-test -d N --article-threshold X --rollup-threshold X` (M2-04 success criterion 6 acceptance gate). New `signal/stability-test.ts` (~290 lines) re-scores window through ArticleScorer + computes P50/P95 percentile-test on per-article + per-(date × ticker) rollup sentiment deltas; weighted-sent computed inline rather than calling RollupBuilder.buildForDay (which writes to disk; stability test must be read-only against data dir). Skips articles that error on re-score so failures don't masquerade as false-0 deltas. New `cli/themes-review-helpers.ts` (~210 lines) with `aggregateThemeCandidates()` (tally + canonical/alias/rejected exclusion + sample-headline enrichment by materiality) + atomic temp-rename config writers. 24 new vitest cases (14 stability-test + 10 themes-review), 97/97 market-intelligence tests green project-wide. `pnpm tsc --noEmit` clean. Auto-fixed inline (Rule 3 blocking): hyphenated single-word command names (`themes-review` vs plan's `themes review`) because Commander.js treats space-separated names as a single command with a space, not nested subcommands. Note: ran in parallel with 10-06 DigestBuilder agent; no file overlap. |
| 2026-05-31 | Plan 10-06 | M2-04 DigestBuilder + scheduled digest delivery + break-glass COMPLETE (commits 2f8d6e2, 343485c). `src/market-intelligence/alerts/digest-builder.ts` (~330 lines) ingests today's scored-articles + catalyst-flags + (MIDDAY/CLOSE) polymarket-snapshots and produces a flavor-specific `DigestPayload` (top stories by materiality DESC tiebreak |sentiment| DESC, dedup by sourceArticleId joined with news-*.jsonl; 24h calendar window dedup-by-id; PM movers ranked by |oneHourPriceChange| × log10(volume24hr+1)). `renderDigestMarkdown` is a stateless renderer producing Telegram MarkdownV1. `IntelligenceAlerter` gains `sendDigest` (per-ET-day slot tracking via `alert-cooldown.json` digestSlots), `sendBreakGlass` (at-most-once-per-ET-day; synthesizes a DigestAlert for catalyst-only triggers with reason embedded in body), `absoluteCapPerDay` (default 8 — hard backstop across all paths). `send()` now defensively rejects DAILY_DIGEST routed through it. `IntelScheduler` heartbeat now runs cycle + digest gates independently — digests fire on any tick within ±1 min of ET targets via `Intl.DateTimeFormat("America/New_York")` (DST handled by runtime tzdata, same Intl call as `etDateString` for clock consistency). `cycle-runner.ts` step 3.95 (between rollup-build 3.9 and dispatch 4) evaluates 3 break-glass criteria first-match-wins: |pmMovePp|≥15 → critical scored article (mat≥0.9 + |sent|≥0.7) → imminent (12h) high-mag scheduled catalyst (mag≥4, conf≥0.7, dir!=uncertain). 12 new vitest tests (6 digest-builder + 6 intelligence-alerter via FakeTelegram), 103/103 market-intelligence tests green project-wide. `pnpm tsc --noEmit` clean. Auto-fixed inline (Rule 1 bug): `readCooldownState` was silently dropping new persisted fields (digestSlots + totalSentToday) on disk read — would have broken at-most-once-per-day semantics across process restarts. Fix preserves all fields; pattern note added: adding a new persisted field requires updating the explicit pluck-list. Linter-race noted: working-tree state of intel-scheduler/intelligence-alerter/cycle-runner files reverted mid-execution to their pre-edit content during parallel agent activity; caught via grep + reapplied verbatim, no code lost. **Plan 10-06 closes M2-04 — phase COMPLETE.** |
| 2026-05-31 | Plan 10-05 | M2-04 RollupBuilder + CatalystRefiner + cycle-runner integration COMPLETE (commits 351e8d8, ef7abad). `src/market-intelligence/signal/rollup-builder.ts` (~195 lines) materially-weights scored articles per ticker, joins active catalysts (tickers ∩ affectedSectors, dedup-by-id-take-latest, archived/expectedDate filtered), joins PM signals (post-noPp-inversion from PmMappingEngine.mapMarkets), atomic temp-rename writes for idempotent rebuilds. `src/market-intelligence/signal/catalyst-refiner.ts` (~135 lines) refines existing calendar events from `scored.referencedCalendarEvents` (confidence + 0.1×materiality capped at 1.0; magnitudePrior max-merge; direction tie-break by materiality then scoredAt), spawns emerging catalysts from `scored.catalysts[]` with `source: article:{id}`, archives entries whose expectedDate < (now-1day). cycle-runner.ts (now ~530 lines, was ~155) gains 5 new steps (3.5 scoring + 3.6 PM mapping + 3.7 catalyst refine + 3.8 24h-guarded calendar refresh via separate calendar-refresh-state.json + 3.9 rollup build), 5 new optional CycleOptions (fredApiKey, scoreDailyCap, backlogDrainCap, macroTickers, skipRollup), 5 new CycleResult fields (scoredArticles, backloggedArticles, backlogSize, rollupTickerCount, pmTickerSignalCount). Soft-cap 500/day with watchlist+macro-keyword priority via isPriorityArticle(); backlog drain LAST (≤50) so fresh articles aren't starved per RESEARCH pitfall #5. Helper-local JSONL scans (loadAllCatalysts/loadUpcomingEvents) instead of a query layer — files are KB-scale, <10ms scans. M2-05 boundary comment lives in cycle-runner.ts: signal data substrate is M2-04's deliverable; strategy logic stays out. Iran worked example end-to-end fixture confirmed: article (-0.7 sentiment, 0.85 materiality, XLE) + PM (-4pp Iran ceasefire, noPp inversion, contributedScore=+4) + OPEC catalyst (affectedSectors=[XLE,USO]) → XLE rollup row weightedSentiment=-0.7, totalMateriality=0.85, articleCount=1, pmContribution.netScore=+4, activeCatalystIds=[opec-2026-06-01]. 67/67 signal-module tests green (22 new: 12 rollup + 10 refiner). `pnpm tsc --noEmit` clean. Plan 10-06 DigestBuilder slot (step 3.95) intentionally left clean for next plan. |
| 2026-08-27 | Scorer outage + fixes | Found LM Studio off since ~07-26 (15,343-article backlog, month of `articleCount: 0` rollups, no Telegram symptom). Merged `fix/llm-correlator-retry-provenance` into main; committed 11-RESEARCH.md. Built `intel backlog-drain` (`signal/backlog-drain.ts`: publish-day bucketing via `JsonlStore.appendManyOn`, `rebuildRollupForDay`, lock file, abort), scorer-health in digests (`ScorerHealth` on `DigestPayload`), cycle-line `scored=/backlogged=/backlog=` + `SCORER DOWN` warn, `--manage-server` via `cli/lm-studio-control.ts` (`lms.exe` interop). 12 new tests; 380/380 green. Docs: `docs/LM_STUDIO_OPS.md`. Operator direction: LM Studio only "as needed" (RAM); evaluating DeepSeek API. |
| 2026-08-27 | M2-05 planned | 8 plans in 5 waves committed to `.planning/phases/11-ai-strategy/` (11-01 pre-screen, 11-02 tracer, 11-03 CATALYST, 11-04 SENTIMENT/FADE, 11-05 engine, 11-06 backtest, 11-07 web, 11-08 acceptance). COVERAGE.md declares no new external API. Backtest bar replaced by a live-window gate per operator decision; per-regime backtest deferred with a written gap doc planned in 11-06. |
| 2026-08-27 | Phase 11 (M2-05) planned | Research refreshed against real data (46e8f4c), VALIDATION.md seeded, PATTERNS.md mapped, 8 plans / 5 waves / 24 tasks written (cebdcb2), plan-checker PASSED with 2 non-blocking warnings (11-02 tracer at 95% of budget; all estimates low-confidence). Operator decisions recorded in CONTEXT.md: materiality pre-screen (≥85% retention bar), v1 signal set (catalyst + PM core, sentiment gated, fade shadow), live-window backtest gate (per-regime bar deferred). FRED key installed + release-id fix + FOMC seed (cb41390). Gate note: GSD `check.decision-coverage-plan` could not parse this CONTEXT.md (no `- **D-NN:**` bullets — project convention predates it); checker independently traced all 22 decisions via each plan's `<decision_map>`. Override recorded here per plan-phase §13a. |
| 2026-08-28 | Plan 11-04 | Scored-day coverage gate (`coverage.ts`: trailingDayIsos/scoredDayCoverage/hasTrailingCoverage) + SENTIMENT_VELOCITY (gated, `mode: "gated"`, gate() decoupled from generate()) + FADE_OVERSHOOT (shadow-only, `mode: "shadow"`, no import from sizing.ts) landed (commits 588240f, 2aa14a0, ee31cd7). Live regression against real `data/intel`: `hasTrailingCoverage("./data/intel", "2026-08-15", 3)` → `ok:false` (inside the real 2026-07-27→08-27 outage); `hasTrailingCoverage("./data/intel", "2026-06-25", 3)` → `ok:true` (real scored June window). 43 new vitest cases, full suite 537/537 green, `pnpm tsc --noEmit` clean. Both modules exported but not yet registered into `StrategyEngine` — 11-05 owns registry wiring. See 11-04-SUMMARY.md. |

---

## Metrics

| Metric | Current | Target |
|--------|---------|--------|
| M1 phases complete | 2/6 | (deferred) |
| M2 phases complete | 3/7 (M2-01, M2-03, M2-04; M2-05 planning) | 7/7 |
| Live broker integrated | No | Yes (M2-02) |
| News + AI layer | Yes — but scorer needs LM Studio up or a remote API (see LM_STUDIO_OPS.md) | Yes (M2-03/04) |
| Hard risk limits enforced at execution | No | Yes (M2-06) |
| Tax-lot tracking | No | Yes (M2-07) |

---

## Decisions

- [Phase ?]: 11-01: D-16 materiality pre-screen shipped (predictMateriality/comparePrescreen wired into cycle-runner); retention bar (>=0.85) not met — 0.81 training / 0.69 held-out, flagged for operator review, see 11-01-SUMMARY.md
- [Phase ?]: 11-02: SECTOR_ROTATION_FROM_PM tracer shipped end-to-end; src/strategy/ contract stable for 11-03/11-04
- [Phase ?]: 11-03: CATALYST_ANCHORED signal module + shared catalyst-loader shipped; both core-type contract and D-17 both-population coverage complete; live-data smoke found 0/30 active calendar:-sourced catalysts currently refined (all-uncertain), reported honestly rather than gamed — see 11-03-SUMMARY.md
- [Phase ?]: 11-04: scored-day coverage gate + SENTIMENT_VELOCITY (gated) + FADE_OVERSHOOT (shadow) shipped; live regression confirmed ok:false for 2026-08-15 (inside outage) and ok:true for 2026-06-25 (real scored day) — see 11-04-SUMMARY.md

### 2026-05-31: Plan 10-06 — Scheduled Digest Delivery + Break-Glass (Replacing M2-03 Bare 4-Cap)

**Decision**: Replace the M2-03 unconditional 4/day Telegram cap with a structured delivery model: 3 scheduled digests at fixed ET times (08:30 / 12:30 / 15:30) + 1 break-glass slot per ET day for extreme outliers, with the M2-03 per-(market,kind) cooldown preserved untouched and a new absolute backstop of 8 sends/day across ALL paths to defend against runaway-bug fan-out.

**Rationale**:

- **Match the operator's actual swing-trading workflow**: morning prep (digest before open) → trade (mid-day update tells them what shifted intraday) → end-of-day review (pre-close recap before they make EOD decisions). Live "alert me right now" events are rare — one break-glass slot covers them. CONTEXT.md called this out as the M2-04 target model.
- **Slot tracking via a single state file**: extending `alert-cooldown.json` with `digestSlots: { etDate, slots }` + `totalSentToday: { etDate, count }` rather than splitting state across multiple files keeps ET-midnight reset logic in one place. `etDateString` is the source of truth for the date roll; if it changes, all three counters reset coherently.
- **Daily cap (4) kept; absolute cap (8) added on top**: planner's note left the 4/day cap as an operator choice. I kept it as a per-kind throttle for noisy CONFIRMED/DIVERGENCE cycles, and added the absolute cap on top as runaway-bug defense. Math: 4 CONFIRMED/DIVERGENCE + 3 digests + 1 break-glass = 8 sends/day at full burn; absolute cap of 8 has no headroom by design — if anything tries to send a 9th, something is wrong.
- **Digests do NOT consume the CONFIRMED/DIVERGENCE cap**: per-CONTEXT note. The scheduled brief must always reach the operator even on a noisy day where the daily cap was spent on 4 actual market events. Different counters, different semantics.
- **`send()` defensively rejects DAILY_DIGEST routed through it**: the pre-Plan-10-06 alerter let digests bypass the cooldown via `send()`. With per-slot tracking now mandatory, that path becomes a backdoor — a future contributor calling `alerter.send(digest)` would skip slot tracking entirely. Loud rejection (audit-logged with suppressReason) makes the contract explicit.
- **Digest tick decoupled from cycle gate in heartbeat**: original heartbeat early-returned if no cycle was due. Digests fire on a different cadence than cycles (12:30 ET digest doesn't need a fresh cycle — last-known JSONLs are sufficient). Splitting the two gates into independent try/catch blocks means a failure in one doesn't suppress the other.
- **Break-glass at-most-once-per-ET-day enforced at alerter, not cycle-runner**: multiple criteria can co-fire (a +18pp Iran market AND a critical scored article in the same cycle). Letting cycle-runner decide which fires would re-implement slot logic. Instead, cycle-runner picks the first match (priority 1→2→3 in `evaluateBreakGlass`) and sends it; alerter's slot is the source of truth.
- **DigestBuilder reads scored-articles directly, not the rollup**: top-story selection needs per-article materiality + sentiment; rollup aggregates those away. Reading both upstream JSONLs keeps DigestBuilder transparent and means rollup file remains M2-05's downstream contract (not double-consumed by M2-04 itself).
- **ET-time-of-day matching via `Intl.DateTimeFormat` with timeZone='America/New_York'**: runtime tzdata handles DST automatically (EST→EDT second Sunday in March, EDT→EST first Sunday in November). Same Intl call as `etDateString` keeps the digest-tick clock and the cap-reset clock in sync.

**Auto-fixed inline (Rule 1 — bug)**: `readCooldownState` was returning `{ records: fresh, dailyCap: parsed.dailyCap }` and silently dropping any field I added to `CooldownState`. After the refactor, `digestSlots` and `totalSentToday` were being written to disk but discarded on the next read — every call started with a fresh slot bag, breaking the at-most-once-per-day guarantee. 3/6 integration tests caught it. Fix preserves all fields explicitly; pattern note added: adding a new persisted field requires updating the pluck-list.

**Verification**: 6 vitest cases for digest-builder (empty inputs, top-story ranking with dedup, 24h calendar window, MORNING-omits-pmMovers + MIDDAY-ranks-correctly, missing-news-meta fallback, render smoke) + 6 vitest cases for alerter (5-CONFIRMED daily-cap math, digest slot idempotence, break-glass at-most-once, absolute-cap saturates all paths, send-defends-against-DAILY_DIGEST, DIVERGENCE shares cap with CONFIRMED) = 12 new tests. 103/103 market-intelligence tests green project-wide. `pnpm tsc --noEmit` clean.

**Carry-over for M2-05**: digest model is operator-facing — M2-05 strategies should NOT depend on Telegram dispatch happening. M2-05 reads `ticker-day-summary-*.jsonl` directly (Plan 10-05's deliverable) for trading decisions. The digest is for operator awareness, not for the strategy engine's signal input.

**Carry-over for operator**:

- 3 ET targets are overridable via `SchedulerOptions.digestTimes` (default { morning: "08:30", midday: "12:30", close: "15:30" }).
- Absolute cap default 8 is overridable via `AlerterOptions.absoluteCapPerDay`.
- Live-validation TODO (when LM Studio + Finnhub key configured): start scheduler, confirm morning digest fires within ±1 min of 08:30 ET, confirm `data/intel/alert-cooldown.json` shows slot flipped to true, wait for next tick at 08:32 ET, confirm second tick is suppressed in audit log with `suppressReason: "MORNING slot already used today"`.
- DST validation: on March 8 2026, the morning digest should fire at 08:30 ET regardless of operator machine timezone. If it skips, check `etHourMinute(new Date())` returns the expected "08:30".

### 2026-05-31: Plan 10-07 — Operator CLI Surface for M2-04 (Review + Inspection + Stability-Test)

**Decision**: Land the 7 M2-04 operator-facing CLI subcommands (`scorer-ping`, `calendar-refresh`, `calendar-list`, `rollup-today`, `themes-review`, `pm-mappings-review`, `stability-test`) using Commander.js hyphenated single-word names rather than space-separated multi-word names. Build `signal/stability-test.ts` as the reusable engine that re-scores a frozen window and percentile-tests the result, and `cli/themes-review-helpers.ts` as a pure-logic aggregator the readline loop wraps.

**Rationale**:

- **Hyphenated names over multi-word names**: Commander.js's `.command("themes review")` interprets the space as part of a single command name (invoke literally as `intel "themes review"`), NOT as nested subcommand. True nesting needs `.command("themes").command("review")` which would also require restructuring the existing flat layout. Hyphenation gives identical operator UX with clean `--help` output and tab completion.
- **Pure-logic helpers separated from readline loops**: `aggregateThemeCandidates()` is unit-testable in isolation (10 cases); the interactive accept/alias/reject loop is exercised by operators. Same separation applies to `runStabilityTest()` — the engine takes any `ArticleScorer` (real or fake-injected) so the percentile math is tested independently of LM Studio availability.
- **Stability test computes weighted-sent inline**: Don't call `RollupBuilder.buildForDay` — it writes to disk via atomic temp-rename, which would race with a running scheduler. A stability test should be read-only. The math is the same materiality-weighted mean, extracted to `computeWeightedSentByBucket` as a re-usable pure function alongside `percentile`.
- **Skip articles that error on re-score**: If LM Studio drops mid-test, the failed articles should NOT contribute to the deltas (a 0-delta between baseline and "no rerun" would look perfect). Skipping means the percentile reflects genuine stability on the articles that did re-score; operator sees `articlesEvaluated` count and can infer skip rate.
- **`pm-mappings-review` filters out empty-proposedTickers shells**: PmMappingEngine writes one shell per unmatched market it sees; the ArticleScorer LLM-fallback is responsible for enriching them with ticker suggestions. Reviewing the empty shells would surface dozens of unmatched markets weekly with no actionable proposals. Reviewable subset = "shells the LLM has touched".
- **Themes-review aggregates from `scored-articles-*.jsonl`** (not a separate `themes-proposed-*.jsonl` stream): themes live inside `ScoredArticle.themes: string[]` — that IS the proposal stream. No separate emission needed; the aggregator counts theme occurrences across scored rows and surfaces ones not in canonical/alias/rejected.
- **Per-action atomic writes during the interactive loop** (not batched at end): Ctrl+C mid-loop must not lose accepted decisions. Per-action writes are dwarfed by human keystroke latency.
- **`stability-test` exits 1 on FAIL, 2 on internal error**: lets operator wire into CI gating — 0=ship, 1=scoring drift detected (investigate), 2=scaffold broken (alert).
- **Defaults `articleP95Threshold=0.15` / `rollupP95Threshold=0.08`** come from RESEARCH and are starting points, not contracts. Operator should tighten or loosen based on real per-window data once 1-7 days of scored articles exist on disk.

**Auto-fixed inline**:

- **(Rule 3 — blocking)** Commander.js multi-word command names: switched all 7 to hyphenated single-word names. Smoke-tested `intel --help` listing + `intel calendar-list --days 14` returning live data.
- **(Rule 1 — bug)** Plan referenced `loadAllUpcomingCalendarEvents` "helper using same logic as digest builder" but Plan 10-06's DigestBuilder uses internal scan logic, not a shared helper. Replicated dedup-by-id-take-latest + non-archived + expectedDate-in-window scan locally in `intel-commands.ts` (~30 lines, mirrors `RollupBuilder.loadActiveCatalysts`). Live smoke: 4 events returned from real `catalyst-flags-2026-05-31.jsonl`.

**Verification**: 24 new vitest cases (14 stability-test: percentile math + bucket weighting + 7 end-to-end scenarios; 10 themes-review: threshold filter + canonical/alias/rejected exclusion + sample enrichment + config round-trips). 97/97 market-intelligence module tests green project-wide. `pnpm tsc --noEmit` clean. CLI `--help` confirms all 7 commands register; smoke-tested `intel calendar-list --days 14` returns real catalyst data from disk; `intel rollup-today --ticker NVDA` correctly reports "No rollup row" for the empty-data case.

**Operator workflow** (committed to SUMMARY.md):

- Weekly: `intel themes-review`, `intel pm-mappings-review` to curate LLM proposals.
- Daily post-AM: `intel calendar-list --days 14` to spot-check upcoming catalysts.
- Ad-hoc: `intel rollup-today --ticker T`, `intel scorer-ping`, `intel calendar-refresh`.
- Acceptance gate: `intel stability-test --days 7` once 1-7 days of scored articles exist.

**Carry-over for next phases (M2-04 close + M2-05)**:

- The 7 CLI subcommands + 10-06 alerter/digest work close the operator-facing surface for M2-04.
- M2-05 can assume scoring stability within the thresholds the stability test enforces. If those thresholds slip (FAIL exit), the gate catches bad-data-reaches-strategy-layer drift before it lands.

### 2026-05-31: Plan 10-05 — RollupBuilder + CatalystRefiner + cycle-runner Integration (M2-04 Data Substrate Goes Live)

**Decision**: Build RollupBuilder as a materially-weighted per-ticker-day aggregator with atomic-temp-rename idempotent writes. Build CatalystRefiner as a stateless function that refines existing calendar events from scored article references AND spawns emerging catalysts from `scored.catalysts[]`. Integrate everything into `runCycle` as 5 new steps (3.5–3.9) between Correlate (3) and Dispatch (4), keeping the step 3.95 slot intentionally clean for Plan 10-06 DigestBuilder.

**Rationale**:

- **Materiality-weighted aggregation as a single fraction** (`Σ(s_i × m_i) / Σ(m_i)`, defaults to 0 when denominator is 0): defensive math, not branching. A wash of materiality-zero articles is exactly the case where weightedSentiment SHOULD be 0 — high-materiality articles dominate noise washes mechanically without piecewise rules.
- **Atomic temp-rename idempotent writes for rollup file**: rerunning `buildForDay` with the same inputs produces byte-identical content (sorted tickers; sorted theme/catalyst arrays). The only non-deterministic field is `builtAt`. This pattern should be used for any derived file that should rebuild deterministically (vs append-only for raw streams). Idempotence test (#5) strips `builtAt` before comparing — same scored+catalyst+pmSignal inputs → identical file body.
- **Themed-only rows (ticker === "") excluded from per-ticker rollup**: TickerDaySummary is by definition per-ticker. Macro-only articles (no ticker scope, no LLM-proposed ticker match) stay in the scored-articles stream where M2-05 can theme-query them. Including them in the rollup with `ticker=""` would corrupt the per-ticker contract — and silently break downstream code that doesn't expect an empty-ticker row.
- **Magnitude max-merge (never revise down) in CatalystRefiner**: a scheduled FOMC has `magnitudePrior=3` by default. A single low-conviction article shouldn't deflate that prior. To express weakening consensus, the operator/LLM increments confidence on the existing higher prior, OR re-prices via fresh emergent catalysts (which get their own ids and won't collide with the scheduled event's id).
- **Archive cutoff = (now - 1 day), not (now)**: gives a 1-day grace so events scheduled FOR today don't drop out of the active set during the trading day they actually fire. Plan 10-03's catalyst stream uses the same semantic.
- **Soft-cap deprioritization inside scoring step, not as a pre-filter**: priority articles past the 500/day cap STILL get scored. Operator's watchlist tickers and macro-keyword headlines (Iran/China/OPEC/Fed/CPI/tariff/etc.) are the cycle's signal. The cap protects against routine analyst PR floods (low-materiality, often duplicative), not against missing the macro signal. Raw articles always remain in `news-*.jsonl`, fully auditable.
- **Calendar refresh state in its own file** (`calendar-refresh-state.json` separate from `scheduler-state.json`): respects the surgical boundary noted in `intel-scheduler.ts.persistState`. Cycle metadata (cyclesCompleted, alertsSentTotal) stays distinct from calendar metadata (lastRefreshedAt). If we ever want to migrate the scheduler to a more sophisticated state shape, calendar-refresh isn't entangled.
- **Helper-local JSONL scans (loadAllCatalysts / loadUpcomingEvents) instead of a query layer**: KB-scale files, <10ms scans, ~30 LoC each. A query layer would add coupling and abstraction overhead for no operational benefit. M2-05 may build a typed range-query layer when it actually needs one. YAGNI.
- **CycleOptions.skipRollup default false** (opt-out, not opt-in): operator's happy path is "everything wired together". Tests and edge-case rule-based-only runs opt out. Setting it `true` makes sense if no LLM is configured (then no scored articles exist for the rollup builder to consume), but the rollup builder handles that case gracefully too (returns `[]`).
- **M2-05 boundary comment lives in cycle-runner.ts** at the top of the signal section: "do not embed strategy logic in scoring or rollup — that's M2-05's job; M2-04 provides the data substrate". Future contributors who try to score-and-rank in one pass will see this and reroute.
- **NO `Promise.all` over scoring calls**: two safeguards — ArticleScorer's internal `inFlight` chain (Plan 10-02), AND a `for...of` loop in `runArticleScoring`. Both remain regardless of operator config. The empirical proof is in `article-scorer.test.ts` (maxConcurrent counter never exceeds 1 even with 3 unawait'd parallel calls).
- **24h-guard via state file (not in-memory)**: refresh state survives process restarts. Operator restarting the scheduler at 14:00 ET won't accidentally re-refresh the calendar if it already refreshed at 06:00 ET that morning.

**Iran worked example end-to-end**:

- scored-articles JSONL: `{ ticker: "XLE", sentiment: -0.7, materiality: 0.85, themes: ["geopolitical-conflict", "energy-supply-shock"] }`
- catalyst-flags JSONL: `{ id: "opec-2026-06-01", type: "opec", affectedSectors: ["XLE","USO"], expectedDate: "2026-06-01" }`
- pmSignals (from PmMappingEngine on -4pp Iran ceasefire snapshot, noPp inversion applied): `{ ticker: "XLE", direction: "long", weight: 1.0, contributedScore: 4, movePp: -4 }`
- Result: `TickerDaySummary { ticker: "XLE", weightedSentiment: -0.7, totalMateriality: 0.85, articleCount: 1, pmContribution.netScore: 4, activeCatalystIds: ["opec-2026-06-01"], themes: ["energy-supply-shock", "geopolitical-conflict"] }`

This was the explicit acceptance fixture for M2-04 and it passes. The data substrate is alive.

**Verification**: 67/67 signal-module tests green project-wide (22 new from this plan: 12 rollup-builder + 10 catalyst-refiner). `pnpm tsc --noEmit` clean across the project. CycleResult callers in `intel-scheduler.ts` and `cli/intel-commands.ts` both accept the extended type without modification (additive, optional fields only). Live smoke deferred to operator (requires LM Studio + Finnhub key) — instructions documented in `10-05-SUMMARY.md`.

**Carry-over for Plan 10-06 (DigestBuilder)**:

- Step 3.95 slot in cycle-runner.ts is clean — insert between `rollupBuilder.buildForDay` (line ~232) and the dispatch sort (line ~241).
- Read inputs: `data/intel/ticker-day-summary-{today}.jsonl` (this plan's output) + `data/intel/scored-articles-{today}.jsonl` for top-stories selection.
- Add `digest: DigestPayload` to CycleResult and emit via TelegramService.
- Plan 10-06 should NOT modify the rollup writer — the JSONL is the contract.

**Carry-over for Plan 10-07 (review CLI)**:

- Read `data/intel/pm-mappings-proposed-*.jsonl` (PmMappingEngine + ArticleScorer both write to this stream).
- Approved mappings write to `config/pm-market-mappings.json`; subsequent process restarts pick them up automatically (no live-reload needed; operator confirmed acceptable cadence).

### 2026-05-31: Plan 10-02 — ArticleScorer + ScoreBacklog (LM Studio Sibling with Sequential Gate and Bail-on-First-Failure Drain)

**Decision**: Build `ArticleScorer` as a sibling to `LlmCorrelator` (not a fork or subclass), mirroring the LM Studio call surface byte-for-byte. Implement sequential-gate via promise chain (`this.inFlight` field) rather than a semaphore library. Build `ScoreBacklog` as a single-file rolling backlog with atomic temp-rename writes and bail-on-first-failure drain semantics.

**Rationale**:

- **Sibling pattern**: ArticleScorer and LlmCorrelator have different responsibilities (per-article scoring vs market-headline correlation) but identical infrastructure needs (OpenAI SDK with baseURL override, `apiKey: "lm-studio"` default, `timeout: 60_000`, `maxRetries: 0`, `/no_think`, `response_format` omitted). Forking would couple them; subclassing would force shared base-class evolution. Sibling means copy the constructor pattern verbatim and let each module own its prompt + parser. New modules under `src/market-intelligence/` needing LM Studio should follow this pattern.
- **Promise-chain sequential gate** (vs `p-limit` library): zero dependency cost, naturally FIFO, O(1) per-call overhead (one promise allocation), trivially testable. The proof-of-correctness test (maxConcurrent counter inside fake client, 3 parallel calls without await between) is 30 lines and is the kind of empirical demonstration that catches regressions when the gate is later "optimized".
- **`concurrency > 1` clamped to 1 with warn** (not rejected): operator who sets it to 4 isn't trying to break things, they just don't know the constraint. Warn loudly, clamp silently, keep the pipeline running.
- **Throw on failure, no rule-based fallback**: Plan 10-06's cycle-runner will catch the throw and enqueue to `ScoreBacklog`. If we silently substituted a rule-based score (the M2-03 correlator pattern), downstream rollups would see records shaped exactly like LLM-scored records but with different distributional properties — exactly the kind of bug that wouldn't surface until M2-05 strategies started reading the data.
- **Atomic temp-rename writes**: a process kill mid-drain (Ctrl+C, OS reap, WSL2 sleep) on a non-atomic append would leave the backlog with a half-written line that breaks the JSON parser on reload. Temp-rename is one extra syscall per write — cheap insurance.
- **Bail-on-first-failure drain**: LM Studio outage is a binary state. If call N+1 fails with connection-refused or timeout, call N+2 within seconds will almost certainly fail the same way. Burning all 50 backlog slots × 60s = 50 minutes of wall time on guaranteed failures is wasteful — bail and let the next cycle's heartbeat retry from the same FIFO head. The `failed` counter in `DrainResult` is always 0 or 1 by construction; operator dashboards read it as "did the LLM come back?".
- **SCORER_VERSION="v1"** captures both prompt and output schema together. Bump rules in 10-02-SUMMARY.md "What triggers a bump" section. Future stability test (`intel stability-test`) uses this to identify which rows need re-scoring after a prompt change rather than blanket re-scoring everything.
- **Themed-only fallback (`ticker=""`)**: when an article has no scope and no LLM-proposed-ticker matches the universe, emit one row with `ticker=""` instead of dropping. M2-05 may query by theme even without ticker dimension — losing the article entirely would erase the theme signal.
- **PM proposals + affected_tickers populated only on FIRST record** in a multi-ticker fan-out. They're article-level metadata, not per-ticker. Replicating across fan-out would cause double-counting in Plan 10-06's RollupBuilder.

**Auto-fixed inline (Rule 2 — missing critical functionality)**:

- **SYSTEM_PROMPT_V1 catalyst-type enum expanded from plan's 10 to types.ts's 22**: the plan-level prompt enumerated `"earnings", "guidance", "ma", "regulatory", "fda", "macro_print", "fomc", "geopolitical", "lawsuit", "product", "other"` (10 types), but `signal/types.ts` `CatalystType` union declares 22 (adds `fda_pdufa`, `cpi`, `nfp`, `pce`, `retail_sales`, `jolts`, `gdp`, `ism`, `opec`, `eia_petroleum`, `treasury_auction`). If the prompt told the LLM only the smaller set, the scorer's runtime validation (`VALID_CATALYST_TYPES.has(...)`) would silently drop any LLM-emitted catalyst of the fine-grained types that the calendar fetchers (Plan 10-03) and rollup builder (Plan 10-05) actually need to refine. Fix: SYSTEM_PROMPT_V1 now enumerates the full 22-type union, matching the type contract.

**Verification**: 18/18 ArticleScorer tests + 8/8 ScoreBacklog tests + 8/8 PmMappingEngine tests (concurrent Wave 2 work, untouched here) = 34/34 signal-module tests pass. `pnpm tsc --noEmit` exits 0. Sequential gate proven via maxConcurrent counter test (3 parallel calls → maxConcurrent stays at 1). Bail-on-first-failure proven via test enqueueing 10 articles, throwing on call #2 → 1 scored + 1 failed + 9 remaining + only 2 total calls made. Backlog round-trip across fresh ScoreBacklog instances proves cold-load works (cache not assumed).

**Carry-over for Plan 10-06 (cycle-runner integration)**:

- Construct ArticleScorer with the same env vars LlmCorrelator uses (`LLM_ENDPOINT`, `LLM_MODEL`, `LLM_API_KEY`).
- `ScoringContext` requires the caller to assemble: `canonicalThemes` (from `config/themes.json`), `upcomingEvents` (from catalyst-flags stream, next 14 days), `tickerUniverse` (from `watchlist.txt ∪ config/macro-tickers.json`), `pmContext` (optional, from today's polymarket-snapshots).
- On scorer throw: `await backlog.enqueue(article, pmContext, err.message)`. Do NOT silently substitute a rule-based score.
- AT END of cycle (after fresh-article scoring): `await backlog.drain(scorer, ctx, 50)` — drain LAST per RESEARCH pitfall #5 so backlog doesn't starve fresh signal.
- Scheduler state should gain `backlogSize` + `backlogOldestAt` for operator visibility.

### 2026-05-31: Plan 10-03 — Calendar Layer (5 Fetchers + Refresher with Live-Spike-Confirmed Treasury Endpoint)

**Decision**: Build the calendar layer as 5 single-purpose fetchers + 1 orchestrator. Fetchers are pure data producers (`fetchUpcoming(days): Promise<CalendarEvent[]>`, no I/O side effects); the orchestrator owns dedup + JSONL persistence. Confirm the TreasuryDirect Fiscal Data endpoint via live curl spike BEFORE writing the Treasury fetcher, documenting the result at `.planning/phases/10-llm-trade-signal/10-03-treasury-spike.md`.

**Rationale**:

- **Pure fetcher pattern**: each fetcher is trivially testable (no fs cleanup), independently mockable, and the orchestrator centralizes the only side effects (dedup + JSONL append). Future calendar sources slot in by following the same shape.
- **Live-spike doc**: the RESEARCH.md endpoint URL was *inferred*, not confirmed. Curl-first caught a subtle nuance — default sort returns 2024-vintage `record_date` ascending order; we must pass `sort=-auction_date` to get forward-looking rows. Spike doc records this so the next maintainer doesn't re-discover it as a "data feed is broken" bug.
- **Reopening-aware regex** (vs exact-match security_term): the naive `IN ("10-Year","20-Year","30-Year")` filter misses ~half of upcoming long-duration auctions because Treasury reopenings shift the term string to "9-Year 10-Month" / "29-Year 11-Month" / etc. Three regexes (`NOTE_10Y`, `BOND_20Y`, `BOND_30Y`) capture both forms.
- **Bills excluded**: 4W/8W/13W/52W Bills appear in upcoming_auctions but front-of-curve tail dynamics don't materially move TLT/IEF; filter via `security_type IN ("Note","Bond")`.
- **FRED `Promise.allSettled` per release**: one release-id failing (rate-limit, transient 5xx) contributes 0 events but the other 7 still land in the cycle. Avoids the cascading-failure mode where one slow release tanks the whole macro stream.
- **Graceful missing-key degradation**: `apis.fred` is optional per the Wave 1 Zod schema. FredCalendarFetcher logs a single warning + returns `[]` when the key is absent rather than throwing. CalendarRefresher's `failed[]` array captures hard exceptions only — a clean no-op is not a failure. Operator can run the pipeline with or without FRED configured.
- **EIA generator is pure deterministic** (no network) because EIA publishes the annual petroleum schedule as a static HTML page, not a structured feed. Operator-maintained `EIA_HOLIDAY_SHIFTS` table starts empty (default Wednesday cadence correct for ~90% of weeks); needs ~5 annual entries each December for MLK/Presidents/Memorial/July-4 weeks when Tuesday is the federal holiday.
- **Earnings hour mapping** conservative: Finnhub's `amc` → 16:30 ET (after-close conservative late mark), `bmo` → 08:00 ET (pre-open conservative late mark), `dmh` → undefined (during-market-hours is rare, exact slot not given).
- **Seed loader ticker uppercase normalization**: operator can write 'lly' or 'LLY' in `fda-pdufa-seed.json` and the composite id is canonical either way.
- **Append-only JSONL + read-time dedup**: each `refreshAll()` call appends N events to the daily JSONL. Same id will appear multiple times across N refreshes; rollup builder (Plan 10-05) and digest builder (Plan 10-06) dedup by `id` and take the latest `firstSeenAt`/`lastRefinedAt`. Matches the existing `JsonlStore` pattern; avoids needing rewrite semantics in the storage layer.

**Verification**: 11/11 vitest tests green (7 EIA generator + 4 seed loader); `pnpm tsc --noEmit` clean. End-to-end smoke with no FRED key + 10-ticker universe + 60-day window: 17 CalendarEvents written to JSONL in 523ms (6 finnhub-earnings + 2 treasury + 9 eia-cron). FRED degraded gracefully — warning logged, `failed: []` because no-key branch returns `[]` cleanly. Live API confirmation for both networked fetchers: Finnhub returned upcoming earnings for AMZN/AAPL/MSFT/NVDA/GOOGL/META; Treasury returned 2 long-duration auctions (Bond 29Y-11M reopening 2026-06-11, Note 9Y-11M reopening 2026-06-10). EIA emitted 9 Wednesdays in the 60-day window starting Sunday 2026-05-31 (matches napkin math 60/7=8.57).

**Carry-over for Wave 3 (10-05/06/07)**:

- `CalendarRefresher.refreshAll(60)` runs once per cycle (recommended cadence: pre-market 06:00 ET daily) and writes the unified stream.
- Wave 3 modules read `data/intel/catalyst-flags-YYYY-MM-DD.jsonl` and dedup-by-id at read time (taking latest `firstSeenAt`/`lastRefinedAt`).
- Cycle-runner integration is a one-liner: `await new CalendarRefresher({ fredApiKey: cfg.apis.fred, finnhubApiKey: cfg.apis.finnhub, tickerUniverse: union(watchlist, macroTickers) }).refreshAll(60)`.

**Operator-pending items** (deferred, not blockers for Wave 3 dev — only affect breadth of catalyst flags at runtime):

- Add `FRED_API_KEY` to `.env` or encrypted config (unlocks 8 macro release feeds: FOMC/CPI/NFP/PCE/Retail/JOLTS/ISM/GDP). Free 32-char key at <https://fred.stlouisfed.org/docs/api/api_key.html>.
- Quarterly: refresh `config/fda-pdufa-seed.json` from biopharmcatalyst.com PDUFA calendar.
- Annually (December): refresh `config/opec-schedule-seed.json` from opec.org press calendar; refresh `EIA_HOLIDAY_SHIFTS` map in `eia-cron-generator.ts` for the next year's MLK/Presidents/Memorial/July-4 weeks.

### 2026-05-31: Plan 10-04 — PmMappingEngine (Table-Driven PM-to-Ticker Signals with noPp Inversion)

**Decision**: Build `PmMappingEngine` (`src/market-intelligence/signal/pm-mapping-engine.ts`) as a stateless, LLM-free, table-driven matcher. Match precedence: `eventSlug` exact → `slugPrefix` case-insensitive → `questionContains` case-insensitive substring; all populated criteria must match for a rule to fire. Sign math factored as a single 4-factor product `contributedScore = movePp × dirSign × weight × interpSign` where `interpSign = noPp ? -1 : +1`. Unmatched markets persist as `PmMappingProposal` shell records (empty `proposedTickers: []`) for the Plan 10-02 article scorer's LLM fallback to enrich later.

**Rationale**:

- Single-product sign math (vs branching on interpretation) means noPp inversion is a single ±1 factor like direction sign — easier to reason about, harder to invert one branch and not the other when the operator adds new mappings.
- All-null mapping rules refuse to match anything. A `{ eventSlug: null, slugPrefix: null, questionContains: null }` rule would otherwise saturate every ticker; operator could land it by accident via JSON edit. Defense at the matcher rather than at config-validation time so this safety holds even if config validation regresses.
- EXCLUSION_KEYWORDS filter runs BEFORE the mapping pass (not after). Plan 10-07's review CLI reads the proposals stream; if excluded markets created proposals, the operator would wade through Iran-FIFA / Super-Bowl-Trump / Oscars-AI noise weekly. Filtering before keeps the proposals queue high-signal.
- Engine deliberately LLM-free. Plan 10-02's article scorer is the LLM proposal source (it already sees PM context per article); both writers persist to the same `pm-mappings-proposed-*.jsonl` stream, and Plan 10-07's review CLI dedupes by `marketId` and merges `proposedTickers` arrays. Keeping the engine deterministic means no model warmup, no rate limit, and the engine can run on every scheduler tick.
- `invalidateCache()` escape hatch exists for the post-review-CLI write-back flow. Long-running pipeline shouldn't re-read JSON every call but the review CLI must be able to force reload after writing.
- Result type is a discriminated union `{ excluded } | { unmatched } | { tickerSignals[] }` rather than a nullable list — caller switches on the discriminator rather than parsing a null-vs-empty distinction.

**Sign math worked example (Iran ceasefire)**: mapping `noPp` with XLE long w=1.0; snapshot oneHourPriceChange=-0.04 (-4pp). `contributedScore = -4 × +1 × 1.0 × -1 = +4` (bullish XLE because Yes resolves = ceasefire holds = bearish energy, so Yes falling is bullish). Matches the canonical M2-03 alert that fired live 2026-05-27.

**Verification**: 8/8 vitest cases pass on first run in 27ms; covers eventSlug+noPp inversion, slugPrefix+yesPp, multi-field (slugPrefix AND questionContains), no-match → proposal persistence to JSONL, EXCLUSION_KEYWORDS bypass with no proposal, all-null catch-all refusal, multi-rule stacking on one market (AAA appearing in two rules sums correctly), and cache + `invalidateCache()` reload semantics. `pnpm tsc --noEmit` exit 0.

**Carry-over for Wave 3**:

- Plan 10-05 `RollupBuilder` integration shape: `const { tickerSignals, proposals, excludedCount } = await pmEngine.mapMarkets(todaysSnapshots);` — group by ticker, sum `contributedScore` per group → `TickerDaySummary.pmContribution.netScore`. Proposals are already persisted to disk; the rollup builder doesn't need to handle them.
- Plan 10-07 `intel pm-mappings review` CLI should display `interpretation` as a labeled badge ("Yes rising = bearish for the listed tickers (noPp inversion)") rather than just printing the raw string — otherwise operator may approve a mapping whose sign they misread. The Iran ceasefire mapping is the canonical example where the inversion is non-obvious.
- Seed mappings as of this plan: 3 (Iran ceasefire eventSlug, will-bitcoin-reach-* slugPrefix, fed-decision-in-* + "rate cut" combined). Operator can extend `config/pm-market-mappings.json` directly; engine will pick up new mappings on next process restart or after explicit `invalidateCache()`.

### 2026-05-31: Plan 10-01 — M2-04 Foundation (Types + Config Seeds + FRED Zod Diff)

**Decision**: Land all M2-04 foundation files in one plan so Wave 2 can fan out without contract churn — 6 config JSON seeds in `config/`, one shared types module `src/market-intelligence/signal/types.ts` with 9 named contracts + util unions, and a one-line Zod schema extension (`apis.fred?: z.string().optional()`).

**Rationale**:

- Wave 2 plans (10-03 ArticleScorer, 10-04 CalendarFetchers, 10-05 PmMappingEngine) all need to read/write these contracts. If types or config shapes drift mid-phase, parallel work explodes.
- One shared types module (rather than each Wave 2 module owning its own types) keeps the type graph shallow — only news/types and polymarket/types are imported transitively, no cross-imports between Wave 2 modules.
- 24 canonical themes derived from `relevance-filter.ts` topic keys with finer-grained per-domain splits where directional bias matters (e.g. `fed-rate-cuts` vs `fed-rate-hikes`, `crypto-rally` vs `crypto-selloff`, `earnings-beat` vs `earnings-miss`). Collapsing into single per-domain themes would lose the directional signal the per-article scorer needs.
- `CalendarEvent` emitted as type alias of `CatalystFlag` rather than distinct interface — same shape, the `source: 'calendar:${string}' | 'article:${string}'` template-literal discriminator encodes origin at the type level. Two names give Plan 04 naming clarity without doubling the Plan 06 type vocabulary.
- `ScoreBacklogEntry` snapshots the full `NewsArticle` + `MarketSnapshot[]` PM context so LLM retry doesn't depend on live news/PM streams surviving rotation.
- `scorerVersion` on `ScoredArticle` enables prompt-change re-scoring identification (stability tests can flag rows that need re-scoring rather than blanket re-scoring).
- `_hint` underscore-prefixed key in FDA/OPEC JSON seeds as agreed "ignore this, it's documentation" convention (JSON has no comment syntax).

**Verification**: All 6 config files parse, version=1 each; `pnpm tsc --noEmit` exits 0; types module is 258 lines with 12 exports covering all 9 named contracts the plan listed (ScoredArticle, CatalystFlag, CalendarEvent alias, TickerDaySummary, ThemeCandidate, PmMapping, PmMappingProposal, DigestPayload, ScoreBacklogEntry) plus CatalystType / CatalystDirection unions and ExtractedCatalyst inline interface. `apis.fred?: z.string().optional()` at line 25 of secure-config.ts.

**Carry-over for Wave 2 (10-03 / 10-04 / 10-05)**:

- All three Wave 2 plans import from `src/market-intelligence/signal/types.ts` ONLY. If an executor finds a needed type missing or wrong-shaped, that's a structural break — escalate as Rule 4 (architectural) not patch downstream.
- Operator deferred work (not blocking Wave 2 dev, blocking Wave 2 production-fill): quarterly PDUFA refresh into `config/fda-pdufa-seed.json`, annual OPEC schedule refresh into `config/opec-schedule-seed.json`, FRED API key added to encrypted config when 10-04 needs it.
- Full Wave 2 dependency map in `.planning/phases/10-llm-trade-signal/10-01-SUMMARY.md` (which types each Wave 2 plan reads and writes).

### 2026-05-30: Plan 07-06 — M2-01 RECOMMENDATION.md Produced; Both Strategies DISCARD; M2-05 Scope Grows

**Decision**: Build `scripts/m201-build-recommendation.ts` as a results.jsonl-driven generator that applies the CONTEXT.md verdict logic (KEEP / MODIFY / DISCARD) per-record AND per-aggregate, and writes the M2-01 final deliverable `RECOMMENDATION.md`. Both MomentumStrategy and MeanReversionStrategy are formally DISCARD'd. M2-05 path forward: design fresh signals from scratch (catalyst-driven, vol-breakout, sector-rotation) rather than AI-layering on broken technical signals.

**Rationale**:

- Per CONTEXT.md success criterion 4 ("at least one strategy demonstrates Sharpe>0.5 and MaxDD<25% across all regimes — OR — both are formally rejected with documented evidence"), the *evidence* matters as much as the verdict. A generator script makes the verdict reproducible from raw JSONL (re-run on any future sweep), and uses a single `judgeRegimes()` source of truth for both per-record and aggregate verdicts.
- Strategy-level aggregation uses universe-median Sharpe / |MaxDD| at the best config (most permissive form of the bar — "does the strategy have edge across the median ticker"). Both strategies still DISCARD at this more permissive bar, which is the strongest possible negative signal: if even the median ticker fails at the best config, individual tickers won't recover the result.
- `Math.abs(maxDrawdown)` applied at every threshold comparison (RESEARCH pitfall #8 — `PerformanceMetricsCalculator` emits maxDrawdown as signed-negative).
- Low-trade-flag (<10 trades/year) per RESEARCH pitfall #6 — at 35/35 momentum and 35/35 mean-rev tickers under 10 trades/year, all "winning" KEEPs are buy-and-hold proxies, further weakening the case for these strategies.
- Best-config picker: highest keepCount across universe, tiebreak by highest median bull Sharpe. For DISCARD strategies (zero KEEPs everywhere) the tiebreaker carries — which is why the chosen "best" configs report 0/35 and 1/35 KEEPs but represent the least-bad parameter setting.

**Final verdicts**:

- **MomentumStrategy: DISCARD.** Best config (shortMA=10, longMA=75, minConfidence=65). Universe-median bull Sharpe +0.62 (passes the 0.5 bar) but bear Sharpe -0.70 with |DD| 19.8% (fails on Sharpe) and high-vol Sharpe only +0.12 (fails on Sharpe). No parameter combination from the sweep changes the bear-regime failure — it's invariant across all 15 configs.
- **MeanReversionStrategy: DISCARD.** Best config (rsiOversold=20, rsiOverbought=70). Universe-median bull Sharpe +0.81 (passes), bear Sharpe -0.35 (fails on Sharpe), high-vol |MaxDD| 32.8% (fails on drawdown). Only LLY passes all 3 regimes (1/35), which at this scale is almost certainly sample noise — LLY's pharma-driven trajectory leaks through the sparse signal rather than the signal earning the return.

**Engine finding surfaced as side-effect**: **MomentumStrategy ignores `shortMA` entirely.** Sweeping 5 values × 35 tickers × 3 minConfidence levels = 525 backtests with byte-identical Sharpe per (ticker, minConfidence) tuple as shortMA varies. The parameter is in the strategy's options interface but not consumed by the indicator computation. Effective dimensionality of the Momentum grid was 1, not 2. Documented in RECOMMENDATION.md `Engine / Strategy Findings` section. Not auto-fixed (out of scope; the verdict is bad regardless and future strategy work should design fresh signals, not patch MomentumStrategy).

**Downstream implications**:

- **M2-04 (LLM Trade-Signal Layer)**: charter unchanged but importance grows. With no working technical baseline, M2-04's LLM-derived catalyst signals are doing more load-bearing work. M2-03's live alerts (Iran peace, BTC threshold divergences) prove catalyst-driven signals can be sourced.
- **M2-05 (AI-Augmented Strategy Engine)**: phase scope materially grows. Previous assumption was "layer AI on top of MomentumStrategy + MeanReversionStrategy" — both DISCARD'd, so this isn't the right shape. M2-05 needs to design fresh signals first: catalyst-driven entries (from M2-04), volatility-breakout (real-time vol regime detection), sector-rotation rules (rotate into sectors where M2-04 catalyst flow is densest). M2-04 output becomes M2-05's primary signal source.

**Verification**: 1,050/1,050 records consumed cleanly. NVDA momentum (shortMA=10, minConfidence=55) hand-cross-checked: bear |DD|=37.6% > 35% → DISCARD by `anyRegimeMaxDDover35` rule, matches script output. Aggregate per-regime Sharpe across all records: bull +0.62, bear -0.43, highVol +0.16 — matches the headline numbers reported by Plan 05 byte-for-byte.

**Carry-over for next phases**:

- `RECOMMENDATION.md` at `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` is the M2-01 deliverable. Operator should read this before scoping M2-04 / M2-05.
- M2-01 phase **COMPLETE** (6/6 plans, 100% success rate end-to-end).

### 2026-05-30: Plan 07-05 — Reality-Check Sweep Complete (1050/1050) + Engine/Adapter Bugs Fixed Inline

**Decision**: Build `scripts/m201-reality-check.ts` as a standalone tsx runner that sweeps the 35-ticker universe × Momentum + MeanReversion × 15 param combos each (= 1050 backtests) against the Plan 03 cache, persisting one JSONL record per backtest at `.planning/phases/07-strategy-reality-check/results.jsonl` with full-period + per-regime (bull/bear/highVol) metrics. Use append-only JSONL with key-based dedup for resumability. Locked costs: `FixedBPSSlippageModel(5)` per side + `FixedCommissionModel(0)`, $100k initial capital.

**Rationale**:

- 1050 backtests against 35 cached files × 2010 bars each is infeasible to fan out across CLI invocations; one in-process loop is the only sane approach.
- Append-only JSONL is the cheapest possible "resumable parameter sweep" — every backtest writes one line, a restart scans existing lines to build a Set of processed `(ticker|strategy|paramKey)` keys and skips them.
- Hardcoded universe + grids in the script (vs reading from CONTEXT.md) keeps the sweep auditable in one file. CONTEXT.md and the runner are pinned to each other manually — diff one, diff the other.
- Standalone scripts in `scripts/` are the established pattern (see Plan 03's prefetch). Importing directly from `src/` avoids the broken `backtest data` CLI command from the unrelated Commander double-registration issue.

**Three bugs auto-fixed inline (all Rule 1)**:

1. **SimpleBacktestEngine bug**: `engine.run()` passed `[bar]` to `strategy.onBar()` on every iteration instead of `filteredBars.slice(0, i + 1)`. Every indicator-based strategy threw "Insufficient historical data (minimum N periods required)" on the first bar, aborting the entire backtest. This was true for the legacy `backtest run` CLI command too — that command simply reported the error rather than masking it. Fix: pass history-to-date; wrap in try/catch so warm-up throws degrade to "no signal this bar" rather than terminate.

2. **StrategyAdapter contract bug**: Strategies (Momentum, MeanReversion) assume `historicalData[0]` is the CURRENT price and internally `[...data].reverse()` before feeding the technical-indicators library. Passing engine-order (oldest-first) meant 2018 was treated as current and indicators were computed backward. SELL conditions (RSI > overbought, etc.) evaluated against 2018 prices in 2025 → no SELL signal ever fired → 0 closed trades, 0 strategic information. Fix: adapter reverses bars to newest-first before mapping to HistoricalData[]. Boundary made explicit.

3. **Per-call perf bug**: Adapter passed all 2010 history bars on every call. Technical-indicators library recomputes all rolling windows over the full input each call → O(N²) work per backtest. Each backtest took ~8s; sweep would have taken 140 min. Fix: cap the slice to most recent 300 bars (>> any indicator window we use — longMA=75, MACD slow=26, etc., max ~100). Indicators only read most-recent N values; trimming older bars produces identical signals. Backtest cost dropped to ~2s. Sweep total: 35:24 min (4× speedup).

**Verification**:

- Smoke test (3 tickers × 1 combo per strategy): 6 successes / 0 errors in 12s after all three fixes; resumability check produced 0 new records on rerun.
- Full sweep: 1050/1050 successes, 0 errors, 0 retries, 0 network calls in 2124s (35:24 min).
- Spot-check AAPL momentum (shortMA=10, longMA=75, minConfidence=55): full Sharpe 0.926, return 259%, maxDD -26%, 31 trades, winRate 48%. Per-regime: bull Sharpe 1.38 / bear -1.51 / highVol 1.16 — exactly the textbook contrast we wanted.
- Aggregate over all 1050: avg bull Sharpe **+0.62**, bear **-0.43**, highVol **+0.16**. Per-regime segmentation is delivering real signal.

**Carry-over for Plan 06**:

- `.planning/phases/07-strategy-reality-check/results.jsonl` is the input — 3.5 MB, 1050 records, schema documented in `07-05-SUMMARY.md`.
- All three bugs are now FIXED. Any future SimpleBacktestEngine + StrategyAdapter usage (M2-05 ai-augmented strategy engine, future tuning, etc.) inherits the fixes.
- Best raw-technical result: LLY mean-reversion (rsiOversold=40, rsiOverbought=70) — full Sharpe 1.077, return +442%, maxDD -21%. Plan 06 should highlight.
- Worst: PFE momentum at minConfidence=65 — Sharpe -0.45 invariant to shortMA setting. Plan 06 should call out as a "no parameter sweep saves this" DISCARD.

### 2026-05-31: Plan 07-03 — M2-01 Universe Prefetched via Yahoo (35/35 OK)

**Decision**: Prefetch the 35-ticker M2-01 universe (30 single names + 5 ETFs per `07-CONTEXT.md`) across 2018-01-01 -> 2025-12-31 using a tsx runner (`scripts/m201-prefetch-universe.ts`) that calls `MarketDataService.fetchHistoricalData` directly, bypassing the unreachable `backtest data download` CLI. Persist results in `data/cache/historical/` (gitignored). Generate a per-ticker quality report at `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md`.

**Rationale**:

- Plan 05 will run ~1,050 backtests (35 tickers × 2 strategies × ~15 grid points). Network fetches per run are infeasible; cache-once is the only sane approach.
- The plan's intended `pnpm start backtest data download` path is shadowed by the Commander double-registration bug in `src/index.ts` (Plan 07-01 carry-over). Plan 07-01 already validated the direct-MarketDataService approach as a workable substitute; this plan formalizes it into a committed runner.
- Runner script (vs one-shot inline command) makes the prefetch reproducible: if the cache TTL expires or the universe needs re-fetching, it's `pnpm tsx scripts/m201-prefetch-universe.ts`.
- Yahoo fallback (Plan 07-01) is the unlimited free path. With no local AV key, the chain auto-routes 35/35 fetches to Yahoo cleanly.
- META was the only ticker at risk of pre-2022 coverage issues due to the FB->META rename. Yahoo back-fills under the META symbol continuously (verified: 2018-01-02 open ~$177 matches FB-era price), so no FB-fallback code was needed.

**Verification**:

- Runner: 35/35 succeeded on first attempt, no retries triggered, total wall time <1 min via Yahoo.
- Report: 35/35 OK, 0 DEGRADED, 0 FAILED. All tickers returned exactly 2010 bars for 2018-01-02 -> 2025-12-30 (0.30% under the napkin-math 2016 = 252×8, which is just the NYSE-calendar rounding).
- Cache: 14MB under `data/cache/historical/`, 35 files named `{symbol}_2018-01-01_2025-12-31.json` with `provider: 'yahoo'` metadata.

**Carry-over for Plan 05**:

- `DataCacheManager.historicalCacheTTL = 24h`. Plan 05 should run within 24h of this prefetch, OR bump the TTL before starting. The runner makes re-prefetching trivial regardless.
- All 35 tickers are uniformly Yahoo-sourced, so no provider-mix caveats are needed in `RECOMMENDATION.md`.

### 2026-05-31: Plan 07-04 — Regime Segmenter with Per-Sub-Window Return Recomputation

**Decision**: Build `src/backtesting/analytics/regime-segmenter.ts` exposing `REGIMES`, `sliceByRegime`, `metricsByRegime`. Use `PerformanceMetricsCalculator` for baseline trade-statistics and aggregate-return fields, then override Sharpe / Sortino / volatility / maxDrawdown using per-sub-window recomputation. Add 12 vitest unit tests at `src/backtesting/analytics/__tests__/regime-segmenter.test.ts`.

**Rationale**:

- Naively splicing the 4 bull-regime sub-windows (2019, 2020-H2, 2023, 2024) and feeding the result to `PerformanceMetricsCalculator.calculate()` produces two correctness bugs: (a) the cross-window equity "jump" (e.g., 2019-12-31 equity → 2020-07-01 equity, skipping 6 months of high-vol) becomes a single "daily return" that catastrophically inflates volatility and distorts Sharpe; (b) `maxDrawdown` over the spliced curve reflects the absence-of-data gap, not a sustained decline.
- Fix (a): recompute daily returns per contiguous sub-window. The inter-window jump return is implicitly dropped because each sub-window starts at index 1 of its own series. Concatenate the resulting per-sub-window returns into a single array for Sharpe/Sortino/volatility.
- Fix (b): compute drawdown per sub-window via `PerformanceMetricsCalculator.calculateDrawdowns()`, select the worst (most negative).
- `totalReturn`/`cagr`/`annualizedReturn` left as the calculator computes them — they use first-point equity, last-point equity, and the regime date span, which is a defensible "what did the operator earn during this regime" read.
- Empty regime returns zero metrics rather than throwing (Plan 05 runner will sweep ~1050 (ticker × strategy × params) combos × 3 regimes; a single sparse-data ticker must not abort the sweep).

**Verification**: 12/12 vitest tests pass; key test "metricsByRegime does NOT include cross-window jump in Sharpe" empirically proves volatility stays <1.0 (decimal terms) even with a 100k→180k inter-window gap that would yield >3.0 under naive splicing.

**Carry-over**: Plan 05 reality-check runner is now unblocked. Plan 06 recommendation generator can read per-regime metrics from the JSONL Plan 05 produces.

### 2026-05-31: Plan 07-01 — Yahoo Finance as Unlimited Fallback in fetchHistoricalData

**Decision**: Add `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` and wire it as the third fallback in `MarketDataService.fetchHistoricalData` (after Alpha Vantage and Finnhub), with cache write-through. Keep the legacy `fetchHistoricalData(symbol, days)` method untouched for backwards compatibility.

**Rationale**:

- M2-01 Plan 03 (universe prefetch) needs 35 tickers × 8 years of daily bars. Alpha Vantage's free-tier 25 req/day quota would stretch that to ≥2 calendar days. Finnhub's `/stock/candle` for US equities is widely reported as premium-only. Yahoo's chart endpoint is free, undocumented but functional, and accepts arbitrary `period1/period2` windows in a single call per symbol.
- The pre-existing Yahoo provider only exposed a days-based `fetchHistoricalData(symbol, days)` method (legacy path used by `getHistoricalData`'s "ultimate fallback"). Range-based fetching for backtest data needed a new method, not a signature change.
- Wrapped the Finnhub block in try/catch (previously rethrew) so any Finnhub failure falls through to Yahoo instead of bubbling up — necessary for the chain to function as intended (auto-fixed per Rule 3).

**Verification**: Direct provider call returns 21 SPY bars for Jan 2018 (2018-01-02..2018-01-31). MarketDataService end-to-end test with AV+Finnhub nulled writes a `provider='yahoo'` cache entry with `dataPoints=21`.

**Carry-over**: Pre-existing Commander double-registration bug in `src/index.ts` (lines 1030-1031: both `registerBacktestCommands` and `registerBacktestDataCommands` call `program.command('backtest')`, second wins) means the `backtest data download/list/import/clear` CLI subcommands are unreachable. If 07-03 wants to invoke `data download` as a CLI step, this needs fixing first. Otherwise, calling `MarketDataService` directly from a prefetch script works.

### 2026-05-30: Plan 07-02 — StrategyAdapter Extracted to Reusable Module

**Decision**: Move `StrategyAdapter` class and `createStrategyFactory` function out of `src/cli/backtest-commands.ts` into new `src/backtesting/strategies/strategy-adapter.ts`. Bypass `strategy-registry.ts` rather than fix its broken momentum `defaultParams` keys.

**Rationale**:

- M2-01 reality-check runner (Plan 05) must instantiate `MomentumStrategy`/`MeanReversionStrategy` and adapt them to `BacktestStrategy`. Importing from a CLI command file creates an awkward upward dependency from a script to the CLI layer.
- `strategy-registry.ts`'s defaultParams use wrong keys for momentum (`emaPeriod`, `rsiPeriod` instead of `shortMA`, `longMA`) — fixing the registry is research pitfall #2 and is explicitly out of scope for this plan.
- Pure refactor: no behavior change, all existing CLI semantics preserved.

**Verification**: Build clean, smoke test confirms exports work, both `backtest run` and `backtest compare` CLI commands load and execute the action handler (only data-fetch errors remain, which are pre-existing infrastructure issues unrelated to this refactor).

### 2026-05-28: M2-03 Closed — Pipeline Validated, Translation Gap Surfaced

**Decision**: Mark M2-03 complete despite the live pipeline only producing macro-level alerts (not single-ticker ones). The remaining gap — turning "Iran peace -4pp" into "buy XLE" — is a separate concern that belongs in M2-04, not in re-scoping M2-03.

**What works (validated in production)**:

- News pipeline pulls 50/50 ticker-tagged (Finnhub) + macro (CNBC / Google News / MarketWatch RSS)
- Polymarket client filters by volume to focus on high-conviction macro markets ($1M+ volume)
- LLM correlator (local Qwen 3 14B via LM Studio) emits HEADLINE_PM_CONFIRMED + HEADLINE_PM_DIVERGENCE alerts
- Scheduler fires reliably on a sleep-resilient heartbeat (cron replaced 2026-05-28 after WSL2 host-sleep caused silent fire-drops)
- Real alert caught: Iran peace -4pp DIVERGENCE → 2min later CNBC published "Oil jumps 3% after fresh Iran strikes" CONFIRMED (textbook front-run pattern)

**Known limitations carried into M2-04**:

- PM markets are macro (Iran / BTC / Fed / Trump) — they map to ETFs (XLE / GLD / QQQ), not single tickers
- No dedup across related-threshold markets (BTC tanking fires 3 alerts on 3 thresholds)
- No volume/depth weighting — a 4pp move on $6M market is treated same as 4pp on $300k
- CONFIRMED alerts fire AFTER the news is public — the alpha is in the prior DIVERGENCE
- No "fade" frame — every alert is "look here," none is "this is overreaction, fade it"

**Verification**: 13 Telegram alerts fired live across 5/27-5/28. Operator confirmed signal quality matches the architectural intent (PM-as-oracle); the missing piece is per-ticker actionability, which is the explicit M2-04 charter.

### 2026-05-23: Milestone Pivot (M1 → M2)

**Decision**: Pause Milestone 1's remaining production-cleanup phases (Redis / Risk CLI / Code Quality / Tests) and start Milestone 2: AI-Augmented Swing Trading for Family Income.

**Rationale**:

- Operator's underlying goal (family income via calculated growth + day trading) was not actually served by the M1 roadmap — completing M1 produces a polished simulator, not income.
- Operator at $5-10k capital is structurally blocked from day trading by PDT rule; swing trading is the appropriate mode.
- Pure technical strategies (RSI / MACD) in `src/strategies/` are insufficient in 2026 — policy shocks invert signals, mega-cap concentration distorts indices, algorithmic arbitrage extracts textbook patterns fast.
- AI as an analyst layer (LLM-scored news, theme tagging, catalyst detection) is where retail can compete in 2026 — speed is dominated by algos, but interpretation is not.
- Operator has demonstrated discipline (COVID 2020-2021: $10k → $40k via disciplined swing trading with profit-taking). The platform should amplify discipline, not replace judgment.

**Implementation**:

- M1 Phases 3-6 marked DEFERRED (still on roadmap, lower priority)
- M2 defined with 7 new phases: Strategy Reality Check → Alpaca Paper → News & Events → LLM Analysis → AI-Augmented Strategy → Risk Hardening → Live + Tax Tracking
- New requirements added: INCOME, EXEC, NEWS, AI, and extended RISK
- PROJECT.md, ROADMAP.md, REQUIREMENTS.md fully rewritten

**Verification**: pending operator sign-off on direction before starting M2-01 work.

### 2026-01-17: Order Type Verification (Plan 02-04)

**Decision**: Implement comprehensive test coverage for all 5 order types and integration testing.
**Outcome**: 82 paper trading tests, OrderManager coverage 91.49%.

### 2026-01-17: Trailing Stop Implementation (Plan 02-03)

**Decision**: Implement proper peak price tracking for trailing stops using order-level peakPrice field.
**Outcome**: 9 test cases covering long/short positions, percentage/fixed trailing; all pass.

### 2026-01-17: Strategy Loading API (Plan 02-02)

**Decision**: Implement reusable StrategyAdapter and dynamic strategy loading in POST /api/paper/start.
**Outcome**: API returns 200 with valid strategy; 13 adapter/registry tests pass.

### 2026-01-17: Real Market Data Integration (Plan 02-01)

**Decision**: Integrate MarketDataService into PaperTradingEngine to replace mock data.
**Outcome**: Real prices confirmed (AAPL $255.53, MSFT $459.86, GOOGL $330.00); invalid symbols handled gracefully.

---

## Notes

- M1 Phase 1 & 2 work is foundational for M2 — backtesting engine validates M2 strategies, paper-trading engine becomes one consumer of the new strategy + risk layer.
- M1 deferred work (Redis / Code Quality / Tests) remains tracked but will not block M2.
- Token blacklist and rate limiting are still in-memory (lost on restart) — acceptable for personal-tool stage.
- Risk CLI commands still use placeholder data — superseded by M2-06 risk hardening.

---

*Last updated: 2026-05-31 — **M2-04 phase ✅ COMPLETE (7/7 plans done).** Plan 10-06 DigestBuilder + scheduled delivery + break-glass landed (commits 2f8d6e2, 343485c) with 12/12 new vitest cases green. Pipeline shape: cycle-runner steps 1 → 2 → 3 → 3.5 (scoring) → 3.6 (PM mapping) → 3.7 (catalyst refine) → 3.8 (24h-guarded calendar refresh) → 3.9 (rollup build) → 3.95 (break-glass evaluation) → 4 (dispatch). Operator surface: 7 `intel` CLI subcommands + 3 ET-scheduled Telegram digests (08:30 / 12:30 / 15:30) + 1 break-glass slot/day, all with per-ET-day slot tracking and absolute backstop of 8 sends/day. 103/103 market-intelligence tests green; `pnpm tsc --noEmit` clean. M2-04 success criterion 6 acceptance gate (article P95 ≤ 0.15, rollup P95 ≤ 0.08) is operator-callable via `intel stability-test --days 7` after 1-7 days of live cycle data accumulates. Next: operator live smoke + M2-05 phase planning.*

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 11 P01 | 55min | 3 tasks | 6 files |
| Phase 11 P02 | 30min | 3 tasks | 19 files |
| Phase 11 P03 | 50min | 3 tasks | 8 files |
| Phase 11 P04 | 45min | 3 tasks | 6 files |

## Session

**Last session:** 2026-08-28T14:29:04.513Z
**Stopped at:** Completed 11-04-PLAN.md
**Resume file:** None
