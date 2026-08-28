# Phase M2-05: AI-Augmented Strategy Engine - Context

**Gathered:** 2026-06-02
**Status:** ⏸ DEFERRED until 2026-07-02 (30-day M2-04 data accumulation)
**Reason for defer:** M2-04 substrate code is complete but the running scheduler is on pre-M2-04 code, so no historical scored-articles / rollup / catalyst data exists. Backtest validation (CONTEXT-locked: Sharpe > 0.5 + MaxDD < 25% per regime) can't be honestly satisfied without real historical M2-04 outputs to test against. Operator decision 2026-06-02: wait the 30 days, then build M2-05 with real data to validate. Re-enter `/gsd:plan-phase 11` once `data/intel/scored-articles-*.jsonl` and `ticker-day-summary-*.jsonl` cover at least 25 trading days.

**Re-entry checklist:**
1. Confirm scheduler is running M2-04 code (cycle-runner.ts includes steps 3.5-3.9)
2. Verify `data/intel/scored-articles-*.jsonl` exists for ≥25 trading days
3. Verify `data/intel/ticker-day-summary-*.jsonl` exists for same window
4. Verify `data/intel/calendar-*.jsonl` has been refreshed at least weekly
5. Then resume `/gsd:plan-phase 11` — the decisions below are still valid; only the backtest acceptance criterion changes (now uses real M2-04 history)

<domain>
## Phase Boundary

Turn the M2-04 per-ticker-day rollup + active calendar catalysts + PM-derived signals into a **ranked daily list of trade ideas with rationale + suggested entry/target/stop/size**, surfaced via CLI + web dashboard. Operator accepts or skips each candidate; system logs the decision + chosen levels. This is the layer that finally makes the system tradeable — everything before built the data substrate; this is where data becomes "BUY X at $Y, size Z%, stop at $W, target $V."

**In scope**: candidate generation across 4 signal types, type-agnostic ranking, VIX-regime sizing, entry/target/stop suggestion per type, accept/skip decision log, CLI surface, basic web-dashboard surface, backtest validation against M2-01 universe + regimes.

**Out of scope** (downstream phases): broker order submission (M2-02 paper / M2-07 live), pre-trade risk gating (M2-06), tax-lot tracking (M2-07), live position management with auto-exits (deferred to v2 of M2-05 after operator has 30+ days of accept/skip data to train against), ML-learned ranking (also v2 after enough decision history).

**Critical context from M2-01 (DISCARD verdict)**: M2-05's "technical layer" is NOT the discarded MomentumStrategy / MeanReversionStrategy. It's a set of fresh signal modules designed from M2-04 data. The original roadmap framing of "technical filters + LLM overlay" is dead; M2-05 IS the strategy, with M2-04 as its data substrate.

</domain>

<decisions>
## Implementation Decisions

### Signal Generation
- **Separate signal types, ranked together across types.** Each type emits its own candidates with a type tag + per-type score. Top-N across all types compete for the daily slots.
- **Four signal types ship in v1:**
  - **CATALYST_ANCHORED** — pre-position before a scheduled or emerging catalyst on the M2-04 60-day calendar (Fed / CPI / NFP / PCE / earnings / FDA PDUFA / OPEC / EIA / Treasury / M&A rumors / lawsuits / geopolitical escalations). Closest analog to the operator's COVID-era style: anticipate the known event, position before, ride the reaction. Direction = catalyst.direction (refined by `CatalystRefiner`); confidence = catalyst.confidence.
  - **SENTIMENT_VELOCITY** — ticker's materiality-weighted rolling sentiment turns sharply positive or negative over 1-3 days (Δsentiment magnitude × materiality). Catches narrative shifts (e.g., NVDA moving from "meh" to "AI-leader" over a week). Trend-following on the news-tone derivative.
  - **SECTOR_ROTATION_FROM_PM** — PM macro signal translates via M2-04's `PmMappingEngine` into sector/ETF bias. Iran ceasefire → +XLE / +USO / -JETS; Fed-rate-cut market → +XLF / +IWM / -TLT-short. Pure macro-driven.
  - **FADE_OVERSHOOT** — PM market or rolling sentiment over-reacted to a single comment / headline (e.g., probability spikes 15pp on one Powell quote; 3-day sentiment-velocity exceeds 90th-percentile and reverses on day 2). Counter-trend bet. Higher-risk; sized 50% smaller per Sizing rules below.

### Ranking
- **Pure per-type score, type-agnostic ranking.** Each signal type produces a 0-1 normalized score using its native scale:
  - CATALYST: `magnitude / 5 * confidence` (magnitude is 1-5 per M2-04 CatalystFlag)
  - SENTIMENT_VELOCITY: `min(1, |Δsentiment|) * materiality` (Δsentiment is per-ticker 3-day delta in materiality-weighted mean)
  - SECTOR_ROTATION_FROM_PM: `min(1, |pp| / 10) * min(1, log10(volume24hr) / 7)` (caps at 10pp move and $10M volume)
  - FADE_OVERSHOOT: `min(1, overshoot_pp / 15) * recency_decay` (overshoot relative to 7-day rolling mean; recency_decay = 1.0 at hour 0, 0.3 at hour 24)
- **No operator-tunable type weights in v1.** Trust per-type math to produce honest cross-type comparisons. Operator-tunable weights deferred to v2 once 30+ days of accept/skip data shows what they actually prefer.
- **Daily output limit:** top 5 candidates max. If fewer than 5 score above the floor (default 0.4), emit only those that pass. Show next-3 sub-threshold candidates with their scores for transparency (no surprise gaps in the data).

### Sizing
- **VIX-regime % of equity, account-aware.** Engine reads broker account balance from config (M2-02 Alpaca paper integration) and emits a $ amount, not just %.
  - **Calm** (VIX < 15): 25% of equity per position
  - **Elevated** (VIX 15-25): 12.5% per position
  - **Stressed** (VIX > 25): 6.25% per position
- **Max 4 simultaneous positions** — 1.00× equity in calm regime (4 × 25%); 0.50× in elevated; 0.25× in stressed.
- **Per-type adjustment:** FADE_OVERSHOOT trades sized at 50% of the regime size (counter-trend = higher risk). Other types use the regime size unmodified.
- **Engine emits a $ amount per candidate**. Operator's broker decides share count from the $ amount and current price.
- Until M2-02 ships Alpaca paper integration, sizing falls back to a config-set "assumed equity" value (e.g., `assumedEquity: 7500`) so M2-05 can still emit candidates with realistic $ sizes.

### Position Management
- **Suggest entry/target/stop, operator executes and manages.** Engine emits per candidate:
  - **entryPrice**: latest close OR a limit-at-pullback (entry = max(close - 0.5 * ATR_5, close * 0.99) for momentum/sentiment; entry = close for catalyst plays that need to be in before the event)
  - **targetPrice**: per signal type:
    - CATALYST: derived from catalyst type — earnings: close + (avg-historical-earnings-move * direction); Fed/CPI: close + 2 * ATR_5 * direction; FDA binary: close + 25% * direction
    - SENTIMENT_VELOCITY: close + 2.5 * ATR_5 * direction
    - SECTOR_ROTATION: close + 2 * ATR_10 * direction (longer horizon, larger ATR window)
    - FADE_OVERSHOOT: close + 1.5 * ATR_3 * (-direction-of-overshoot) (counter-trend, smaller target)
  - **stopPrice**: `entry - 1.5 * ATR_5 * direction` (uniform across types — keep losses small)
  - **timeHorizonDays**: CATALYST: days-until-event + 1; SENTIMENT: 5-10; SECTOR: 10-15; FADE: 2-5
- **Operator can override** entry/target/stop when accepting. Engine logs the operator's chosen levels (not its own suggestions) into the decision log.
- **No exit signals in v1.** Once a position is open, the operator manages it manually. Engine does not emit "take profits" or "stop out." Deferred to v2 once operator trust + accept-rate data exist.

### Decision Tracking
- **Decision log file:** `data/strategy/decisions-YYYY-MM-DD.jsonl` — one record per accept or skip event.
- **Record shape:**
  ```
  {
    candidateId, generatedAt, signalType, ticker, score,
    suggestedEntry, suggestedTarget, suggestedStop, suggestedSizeUsd, timeHorizonDays,
    rationale,           // human-readable why
    sourceArticleIds,    // for catalyst/sentiment signals
    sourcePmMarkets,     // for sector-rotation/fade signals
    sourceCatalystId,    // for catalyst-anchored signals

    decision: "accept" | "skip",
    decidedAt,
    operatorEntry, operatorTarget, operatorStop, operatorSizeUsd,  // null if skip
    operatorNote,        // optional free-text reason
  }
  ```
- **Outcome tracking is operator-driven** in v1. Operator can run `intel decision close <id> --exit-price X --exit-date YYYY-MM-DD` to log a realized close manually. The engine doesn't try to infer outcomes from price data because we don't have broker fills yet.
- **30-day accept/skip rate** computed weekly and surfaced via `strategy decisions-summary`. Below 10% accept rate = signal types may be wrong; above 60% = engine isn't being selective enough; sweet spot 20-40%.

### Empty State
- **Honest "no candidates above threshold today" output.** No forced top-3. Emit empty list + next-3 sub-threshold candidates for transparency.
- Saving capital on quiet days IS a position. Engine should not train operator to trade noise.

### Backtest Validation
- **Backtest covers same 2018-2025 universe + regimes as M2-01.** Re-uses regime-segmenter and prefetch infrastructure from phase 07.
- **Validation bar (M2-01 baseline is zero — both strategies DISCARD'd, so the "outperforms" success criterion is reinterpreted):**
  - Per-regime Sharpe > 0.5 (matches M2-01 KEEP bar)
  - Per-regime MaxDD < 25%
  - Negative Sharpe in bull regime = automatic FAIL (can't make money in easy environment = engine is broken)
  - Combined-strategy Sharpe should be > standalone-best-signal-type Sharpe (proves combination adds value, not just one type carrying the rest)
- **Backtest uses historical M2-04 outputs.** Since M2-04 has only been running ~24h (and only post-restart), the backtest needs to synthesize historical scored-articles / rollups by re-running the scorer over historical news. This is expensive — accept that the backtest may be lower-fidelity than M2-01's (which used real OHLCV directly). Document this clearly in the recommendation.

### Claude's Discretion
- Exact ATR multipliers for entry pullback / stop / target per signal type — proposed above, but planner may tune based on the actual ATR distributions in the universe
- Score-floor threshold (proposed 0.4) — to be calibrated against the first week of live data
- VIX classification thresholds (proposed calm<15 / elevated 15-25 / stressed>25 from standard market convention) — revisit if 2018-2025 backtest shows different regime boundaries work better
- Web-dashboard layout — CLI surface is the primary v1 deliverable; dashboard is a nice-to-have that planner can scope minimally (one route showing today's top-N)
- Candidate id format (suggested: `${YYYY-MM-DD}-${signalType}-${ticker}-${shortHash}`)
- File paths under `data/strategy/` and module paths under `src/strategy/`
- Whether to wire the engine into the existing scheduler `runCycle` or run it as a separate "strategy tick" (e.g., once per market open). Planner decides based on cost.


### Article intake thrift (operator direction, 2026-08-27)
- **Operator's framing:** "find a pattern from all of these articles so we pull the minimum number of data points without being wasteful." The big global movers are US companies (clearly first), China a big second, then war-zone actions. Not an oversimplification to encode — a prioritisation to encode.
- **Evidence (18,139 LLM-scored articles, 2026-06-02 → 07-26, dedup by article, "high" = materiality ≥ 0.5):** only **7%** of everything we score is high-materiality. **73%** of the high-materiality mass comes from ticker-tagged Finnhub (US company) news; macro RSS supplies 26%. By topic: China keywords have the best hit-rate (12%, n=667), earnings 10%, war/geo 6% (10% of all high), Fed/rates 9%, oil 7%. Low-yield feeds: `marketwatch-top` 2%, `google-world` 3%, crypto keywords 2%, `cnbc-markets` 0% — together ~15% of intake for ~6% of signal. Articles matching no topic keyword and no ticker: 43% of intake, 4% hit-rate.
- **Decision:** M2-05 plans MUST include a cheap, pre-LLM **materiality pre-screen** trained/validated on the existing scored corpus (no new LLM calls): rank incoming articles by predicted P(materiality ≥ 0.5) from source feed + ticker-tag + topic-bucket features (US-company > China > war-zone > Fed/rates > oil; demote crypto / world-general / marketwatch-top), and feed the scorer highest-ranked first under the existing 500/day soft cap (`isPriorityArticle` in `cycle-runner.ts` is the hook to replace). Acceptance: on a held-out June–July week, scoring only the top 50% by pre-screen rank retains ≥ 85% of high-materiality articles.
- **Boundary:** the pre-screen decides *what to score*; it must not alter scores or invent sentiment. Scoring stays LLM-only (local Qwen3-14B for now; DeepSeek evaluated after M2-05 ships).

### v1 signal set (operator decision, 2026-08-27 — supersedes "Four signal types ship in v1" above)
- **Core, ranked + sized in v1:** CATALYST_ANCHORED and SECTOR_ROTATION_FROM_PM — both have continuous substrate data (catalyst-flags 05-31→today; PM snapshots 05-23→today, unaffected by the LLM outage) and both match the operator's event-anticipation style.
- **Gated:** SENTIMENT_VELOCITY ranks and sizes only once `intel backlog-drain` has extended `scored-articles` through the present (engine checks scored-day coverage for the trailing 3-day window; emits nothing for that type when coverage is missing — never a silent zero-delta).
- **Shadow-only:** FADE_OVERSHOOT computes candidates and writes them to the decision log with `mode: "shadow"`, but never enters the top-5 ranking and never receives a size. Purpose: accumulate evidence for v2 without v1 taking counter-trend risk.
- **FRED macro calendar:** `FRED_API_KEY` was installed 2026-08-27 (previously never configured, which is why scheduled CPI/NFP/PCE/FOMC events were ~5% of the catalyst corpus). CATALYST_ANCHORED fixtures and the live-window backtest must include scheduled macro prints, not only LLM-emergent product/lawsuit/M&A catalysts.

### Backtest acceptance (operator decision, 2026-08-27 — supersedes the per-regime bar for v1)
- The CONTEXT-locked "Sharpe > 0.5 + MaxDD < 25% per M2-01 regime (2018–2025)" bar is **structurally unevaluable** for M2-05: `REGIMES` in `src/backtesting/analytics/regime-segmenter.ts` covers 2018–2025 only and every M2-04 data stream starts 2026-05-23. Confirmed by the operator on 2026-08-27.
- **v1 acceptance = live-window gate:** run the engine day-by-day over the real substrate window (2026-05-23 → run date; per-type sub-ranges per RESEARCH §8) and report per-signal-type and combined Sharpe / MaxDD / trade count via `PerformanceMetricsCalculator.calculate()` directly (no regime slicing). Output must be labelled "single continuous 2026 window — interim, not the per-regime bar". Thresholds for v1: combined Sharpe > 0 and MaxDD < 25% over the window, and each *core* type (CATALYST_ANCHORED, SECTOR_ROTATION_FROM_PM) reported individually.
- **Deferred (new):** a true per-regime backtest, unlocked by either a 2023–2025 Polymarket re-mapping project (separate phase) or enough live 2026 history to be regime-classified.
</decisions>

<specifics>
## Specific Ideas

- The operator's COVID 2020-21 edge ($10k → $40k) was discretionary swing trading with **disciplined profit-taking**. The "suggest entry/target/stop, operator executes" model amplifies that exact pattern — the system enforces the discipline-before-emotion commitment without overriding the operator's judgment.
- The Iran worked example from M2-04's acceptance fixture should land naturally in M2-05: Iran ceasefire PM signal → SECTOR_ROTATION_FROM_PM candidate for XLE long → entry/target/stop suggested → operator accepts → decision logged → outcome closed manually when operator exits. End-to-end this is the canonical happy path; M2-05's worked example test should walk it.
- Fade-overshoot is "expert mode" — explicitly user-flagged as a higher-risk signal type. Sizing it at 50% of regime size is the system's way of saying "we'll surface it because you asked, but we won't let you blow up on it."
- The 4-signal-type architecture is intentionally chosen for *transparency*, not just performance. When the operator sees "this candidate is CATALYST_ANCHORED with score 0.82," they can evaluate whether they want to take that kind of bet today — not just trust a black-box combined score.
- 5 candidates/day cap matches the operator's stated 4/day Telegram preference (M2-04 digest model) — the system shouldn't surface more decisions than the operator can meaningfully evaluate in a morning.

</specifics>

<deferred>
## Deferred Ideas

Captured during discussion but explicitly out of scope for M2-05 v1:

- **Operator-tunable type weights in ranking** — defer until 30+ days of accept/skip data shows what types the operator actually favors. Then either expose weights via config OR auto-learn them.
- **ML-learned ranking from accept/skip history** — fully ML-driven candidate scoring. Needs accumulated decision data. Plausible v2 once we have it.
- **Exit-signal emission** ("take profits on NVDA" / "stop out on TSLA") — defer to v2. Adds risk of over-automation and harder to backtest correctly. Operator-managed exits in v1.
- **Auto-execution via broker** — out of scope for M2-05. M2-07 (live execution) handles this once Alpaca live is wired and risk gating (M2-06) is in place.
- **Pre-trade risk gating** (concentration limits, sector exposure caps, drawdown breakers) — M2-06's explicit charter. M2-05 emits the candidate; M2-06 decides whether the operator can actually trade it.
- **Tax-lot tracking on the decision log** — M2-07's charter. M2-05's decision log just records the operator's chosen entry/target/stop and outcome-on-close; tax-lot specifics (FIFO basis, wash-sale detection) layer in M2-07.
- **Web-dashboard polish** — minimal route in v1. A real candidate-cards UI with chart embeds is a follow-up once the operator has used the CLI for a few weeks and knows what dashboard layout they actually want.
- **Custom signal types** beyond the 4 in v1 (e.g., options-implied-vol-breakout, dark-pool-flow, insider transactions) — additional types can be added later with the same module pattern. v1 ships 4; not 14.
- **Forced top-N output** on quiet days — explicitly rejected as anti-pattern.

</deferred>

---

*Phase: 11-ai-strategy*
*Context gathered: 2026-06-02*
