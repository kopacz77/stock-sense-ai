# Phase M2-04: LLM Trade-Signal Layer - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the M2-03 raw alert stream into a **machine-readable signal layer** that the M2-05 strategy engine can query: per-article scored sentiment + materiality, per-ticker rolling rollups, structured catalyst flags (scheduled + emerging), LLM-discovered theme tags (with operator review gate), PM-macro-to-ticker translations, and a **calendar layer** of scheduled market-moving events that get the same catalyst-flag treatment as news-derived ones.

**In scope**: scoring, persistence, theme + catalyst extraction, PM→ticker mapping, the ticker-universe expansion required to make macro signals actionable, **scheduled-event calendar (Fed / CPI / NFP / PCE / earnings / FDA PDUFA / OPEC)**, budget/cap guards, and an upgraded alert-delivery model that respects a hard 4/day Telegram budget.

**Out of scope** (downstream phases): the actual trade-decision engine (M2-05), risk gating (M2-06), execution (M2-07), and broader strategy backtesting against the signal (also M2-05).

</domain>

<decisions>
## Implementation Decisions

### LLM Strategy
- **Local Qwen 3 14B only** (via existing LM Studio at 192.168.50.226:1234, same instance M2-03 correlator uses).
- Zero ongoing API cost. Commits the project to keeping LM Studio reliably available — operationally already true.
- Roadmap default (Claude API) explicitly **rejected** in favor of cost-zero + local-network speed. Quality validation can happen later as a measurement step (not required for M2-04 to ship).
- AI-04 budget cap is reframed: track local-LLM call **volume** (article count, token count) rather than USD spend. The "cap" guards against runaway scoring on news floods, not cost.

### Cadence
- **Per-article as ingested** (near-real-time). Each article entering the JSONL store triggers scoring within the same polling cycle.
- Daily/hourly batching explicitly **rejected** — same-day news drives same-day swing trades; 24h lag would have made today's Iran signal stale.
- Scoring runs inside the scheduler tick alongside the existing M2-03 correlate step (or immediately after), so the entire pipeline stays in one process.

### LLM Failure Handling
- **Queue + drain on recovery.** When local LLM is unreachable, failed articles persist to a backlog file (`data/intel/score-backlog.jsonl` or similar). When LLM recovers, the next tick drains the backlog before scoring new arrivals.
- No silent skip, no rule-based fallback, no halt — articles are *delayed*, not lost.
- Backlog age surfaces in scheduler logs / state file so operator can see scoring fall behind.

### Volume Cap
- **Soft cap ~500 articles/day with deprioritization.**
- Past the cap: score only articles tagged with a watchlist ticker or matching a macro keyword set (Fed / CPI / earnings / Iran / China / tariff / OPEC / etc.).
- Tail articles unscored but **persisted** — they remain auditable and could be back-scored later if needed.

### Persistence Model
- **Both: raw per-article scored stream + per-ticker-day rollup.**
  - Raw: `data/intel/scored-articles-YYYY-MM-DD.jsonl` — append-only, one record per (article_id × ticker_id) pair. Includes the LLM's raw sentiment, materiality, theme tags, catalyst extractions, and source article id for full traceability.
  - Rollup: `data/intel/ticker-day-summary-YYYY-MM-DD.jsonl` — computed at cycle end (or nightly), one record per (ticker × day). Materiality-weighted mean sentiment, theme tag union, active catalyst list. **This is the query surface M2-05 reads.**
- M2-05 should never have to read the raw stream for normal queries — only for audit / debug.

### Scoring Shape
- **Sentiment: continuous float in [-1.0, +1.0]** (negative = bearish for the ticker, positive = bullish).
- **Materiality: continuous float in [0.0, 1.0]** (0 = pure noise, 1 = guaranteed price-moving). Lets aggregation use materiality as a weight, so a single guidance-cut headline can dominate a wash of routine PR releases.
- Rollup aggregation: `weighted_sentiment = sum(sentiment_i * materiality_i) / sum(materiality_i)` over the ticker's articles in the day.

### Theme Enum
- **LLM-discovered with weekly operator review.**
- During scoring the LLM may propose any theme tag (free string). Tags are canonicalized to lowercase-kebab-case on persist.
- Themes that appear ≥ N times in a week (default N=5) and aren't already in the canonical enum are surfaced for operator review (Telegram digest or a simple CLI: `intel themes review`).
- Operator accepts (canonicalize into `config/themes.json`), aliases (map to existing canonical), or rejects (block).
- Once a theme is in the canonical enum, scoring biases toward using it (prompt includes the current enum as preferred vocabulary).
- This avoids both the brittleness of a fully-static list and the drift of pure free-text. Captures emerging themes ("stargate-buildout", "small-cap-rotation") without manual prediction.

### Catalyst Structure
- **Scheduled + emerging.** Both flavors emit the same record shape.
- Per catalyst record: `{ type, ticker, expected_date | null, magnitude (1-5), direction ("up" | "down" | "uncertain"), confidence (0-1), source_article_id | null, first_seen_at }`.
- Scheduled catalysts (earnings, Fed, CPI, NFP) are pre-seeded from existing M2-03 calendar wiring. The LLM enriches them with magnitude + direction estimates as relevant news arrives.
- Emerging catalysts (M&A rumors, lawsuit filings, FDA decisions, geopolitical escalations) come purely from LLM extraction on article scoring.
- A catalyst with `expected_date < now` is auto-archived (still queryable for backtest, but flagged inactive).

### Calendar Layer (added 2026-05-30)
- **Pre-load the next 60 days of scheduled market-moving events** into the same data layer that catalyst-flag records use. Each calendar event is treated as a catalyst with a known date and a pre-LLM magnitude estimate; news arriving in the days before the event refines magnitude/direction.
- Event types to seed (priority order):
  - **Fed**: FOMC meetings, Powell speeches, FOMC minutes, Beige Book — drives discount-rate signal stream
  - **Macro prints**: CPI, PPI, PCE, NFP, JOLTS, retail sales, ISM, GDP — drives both rate and broad equity reaction
  - **Earnings**: per-ticker dates from earnings calendar for watchlist + macro-ETF underlyings (XLE constituents, XLF constituents, etc.) — drives single-name volatility
  - **OPEC + EIA**: OPEC meetings + weekly EIA crude inventory — drives energy sector + crude
  - **FDA PDUFA**: drug-decision dates for pharma watchlist tickers — drives single-name binary moves
  - **Treasury auctions**: 10y / 30y auction dates — drives rates + risk premium
- Data sources: FRED API (free, comprehensive macro), Earnings Whisper or Yahoo earnings calendar (free), FDA PDUFA list (manual seed + monthly refresh from public sources), OPEC schedule (manual seed annually).
- Calendar records share the catalyst-flag shape: `{ type, ticker(s) or sector, expected_date, magnitude (1-5 pre-LLM estimate), direction ("up" / "down" / "uncertain" / "binary"), confidence, source ("calendar:fred" | "calendar:earnings" | etc.), first_seen_at }`.
- News scoring runs the LLM on relevant articles in the days leading up to an event — the calendar entry's magnitude / direction / confidence get refined as news arrives ("rumored CPI hot at 3.2%, would push markets lower" raises magnitude on the upcoming CPI catalyst).
- M2-05 queries: "show me catalysts in the next 7 days affecting my watchlist + macro ETFs, sorted by magnitude × proximity-decay."

**Why this folds into M2-04 instead of being its own phase**: the catalyst-flag shape and persistence model are M2-04's anyway. Without calendar events, M2-04's catalyst output is half-built (only emerging news catalysts, no scheduled). Operator-stated themes (politics, fossil fuels, conflicts, AI) all have scheduled events as their primary drivers — Fed for politics/rates, OPEC + EIA for fuels, sanction deadlines for conflicts, earnings for AI single names.

### Alert Delivery — 4/day Cap, Digest-First Model (added 2026-05-30)
- **Operator constraint: at most 4 Telegram alerts per ET trading day.** This is hard. Counter rolls at ET midnight.
- **Interim implementation (shipped 2026-05-30 ahead of M2-04)**: hard daily-cap counter in `IntelligenceAlerter` + within-cycle priority sort (`|pmMovePp| * log10(volume24hr) + confirmedBonus`) so the 4 slots go to the biggest signals. Cap state persisted in `alert-cooldown.json` alongside the per-market cooldown.
- **M2-04 target model**: replace the bare hard-cap with a **scheduled-digest** delivery model that uses M2-04's per-article scoring for ranking:
  - **3 scheduled digest slots**: morning brief (~8:30 ET pre-open), mid-day update (~12:30 ET), end-of-day (~3:30 ET pre-close). Each digest contains the top 1-2 stories from the elapsed window plus what's on the next 24h calendar.
  - **1 break-glass slot** reserved per day for an extreme outlier: PM move ≥ 15pp, OR LLM-rated criticality ≥ 0.9, OR scheduled mega-catalyst (FOMC surprise, NFP miss, geopolitical shock) hitting in real time. Only fires if not already used; resets at ET midnight.
  - All other proposed alerts are suppressed at the Telegram layer but **persisted with `suppressed: true`** in the audit log so M2-04 scoring + M2-05 strategy can still consume them.
- Rationale: predictable rhythm matches how a swing trader actually consumes signal (morning prep → trade → end-of-day review). Real "alert me right now" events are rare; one reserved slot covers them.

### Claude's Discretion
The user did not select "Translation & scope" to discuss explicitly, so the following are Claude's calls — to be revisited if planning reveals friction:

- **PM-to-ticker translation: hybrid (static table + LLM fallback).**
  - Maintain `config/pm-market-mappings.json` keyed by Polymarket market slug or theme keyword (e.g., `iran-*` → `[XLE, USO, LMT, RTX, JETS:short]`; `bitcoin-*` → `[COIN, MSTR, IBIT, BITX]`; `fed-rate-*` → `[TLT, IEF, XLF, IWM]`).
  - For PM markets that don't match the table, the local LLM proposes ticker affiliations using the same scoring pass that handles news. Proposed mappings surface in the weekly theme review flow above (same UX — operator accepts/aliases/rejects), so the table grows organically.
  - Each ticker-side mapping carries a `direction` field (`long` / `short`) and an optional `weight` (default 1.0).
  - The mapping is applied in the rollup pass: a PM market move of -4pp on `iran-permanent-peace-by-*` would contribute the move (with its direction) into the rollup signals for `XLE`, `USO`, etc.

- **Ticker universe expansion: include sector / macro ETFs.**
  - The scoring + rollup universe is the union of `config/watchlist.json` (operator's single-name tickers — NVDA, GOOGL, etc.) and a new `config/macro-tickers.json` covering ETFs that PM macro signals map to: XLE, XLF, XLK, XLV, XLI, XLU, XLY, XLP, XLB, XLRE, XLC, GLD, SLV, TLT, IEF, USO, UNG, BITO, IBIT, JETS, IWM, QQQ, SPY, VIX.
  - Without this, the PM-to-ticker translation has nothing to land on and the M2-03 macro signals remain orphaned.
  - Pure free-floating themes (no associated ticker) are still tracked at the theme level for M2-05 to query, but the primary surface is per-ticker-day.

- **Stability test approach (roadmap success criterion 6): a CLI command (`intel stability-test --days 7`) that scores a frozen 7-day window of articles twice and reports per-article sentiment/materiality delta and per-ticker rollup delta. Acceptance threshold (e.g., 95% of articles within 0.1 sentiment delta) determined empirically during planning.

</decisions>

<specifics>
## Specific Ideas

- The signal from today's Iran story (PM -4pp DIVERGENCE → 2 min later CNBC oil-strike CONFIRMED, both caught in M2-03) is the **canonical worked example** the M2-04 design should support end-to-end: the rollup for XLE on 2026-05-28 should reflect both the PM-derived signal (via the mapping table) and the article-derived sentiment, materiality-weighted appropriately.
- Stability matters more than peak quality. Qwen 3 14B occasionally drifts on subtle financial language but produces consistent outputs on the same prompt — this is acceptable because M2-05 will be doing relative ranking, not absolute thresholding.
- Operator's COVID swing-trading edge was reading themes and catalysts faster than the institutional crowd, then sizing into the trend. M2-04's output shape should *enable that same workflow* — per-ticker-day rollup with clear theme + catalyst context, queryable for ranking, not auto-firing trades.
- The weekly theme-review flow should be **low friction** — ideally surfaceable in the same Telegram channel as alerts ("New themes this week: `stargate-buildout` (12 mentions, 4 tickers). Accept? Reply Y / N / ALIAS:<name>"). Operator should not have to context-switch to a separate UI.

</specifics>

<deferred>
## Deferred Ideas

Captured during discussion but explicitly out of scope for M2-04:

- **PM signal de-duplication across related threshold markets** (e.g., BTC $70k / $72k / $74k all firing on the same BTC tank). Decision: handle at the **alert** layer in M2-05's surfacing logic, not in M2-04's data model. M2-04 records each market move faithfully; M2-05 ranks and dedups.
- **Volume / depth weighting of PM signals** ($6M Iran market vs $300k BTC threshold). Add a `pm_market_volume_24hr` field to the PM-derived signal record so M2-05 can weight by depth. Implementation of the weighting *logic* belongs in M2-05.
- **"Fade" signal frame** (PM overshoot detection: probability spiked 15pp on one comment → likely overreaction → fade). This is a strategy-engine concept, not a signal-layer one. Belongs in M2-05.
- **Validation pass with Claude API** to measure Qwen drift. Useful but not blocking — defer to a post-M2-04 quality measurement task, possibly as part of M2-05 backtest setup.
- **Cost/spend dashboard for LLM usage** — moot since local is free. If Claude API ever gets added later, revisit the AI-04 tracking shape.

</deferred>

---

*Phase: 10-llm-trade-signal*
*Context gathered: 2026-05-29*
