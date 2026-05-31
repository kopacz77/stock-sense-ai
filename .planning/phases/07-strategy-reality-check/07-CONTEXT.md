# Phase M2-01: Strategy Reality Check - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Run the existing backtester (mature, built in M1 Phase 1 — `BacktestEngine`, `GridSearchOptimizer`, `WalkForwardAnalyzer`, slippage + commission models all exist) against `MomentumStrategy` and `MeanReversionStrategy` across a defined ticker universe + 2018-2025 daily bars. Segment results by market regime (bull / bear / high-vol). Produce a KEEP / MODIFY / DISCARD recommendation per strategy backed by evidence.

**In scope**: universe definition, parameter sweep configuration, regime segmentation, per-regime aggregation, recommendation doc.

**Out of scope** (downstream phases): designing new strategies if these fail (own phase if needed), the AI overlay (M2-04), execution wiring (M2-02), the strategy engine that combines layers (M2-05).

The output of this phase is a *decision*, not new strategy code. If the strategies pass: M2-05 layers AI on top. If they fail: separate phase to design fresh signals from scratch.

</domain>

<decisions>
## Implementation Decisions

### Universe
- **Hybrid: operator watchlist + sector breadth + macro ETFs.** 30 single names + 5 ETFs.
- **Mega-caps the operator follows**: NVDA, GOOGL, AAPL, MSFT, META, AMZN, TSLA (7)
- **Energy**: XOM, CVX, COP, SLB (4)
- **Financials**: JPM, BAC, GS, MS (4)
- **Healthcare**: UNH, LLY, JNJ, PFE (4)
- **Industrials**: CAT, DE, BA (3)
- **Consumer discretionary**: HD, NKE, MCD (3)
- **Consumer staples**: PG, KO (2)
- **Communications**: NFLX, DIS, T (3)
- **ETFs**: SPY (broad market), QQQ (tech-heavy), IWM (small-cap), XLE (energy), XLK (tech sector)
- Total: 30 equities + 5 ETFs = 35 tickers
- Rationale: tests on names operator would actually trade (relevance) while covering enough sectors that the result generalizes (representativeness). Tilts slightly toward what's liquid and trade-worthy rather than a random S&P cross-section.

### Parameter Sweep Scope
- **Modest grid**: strategy defaults + 2-3 nearby points per parameter.
- For each strategy's primary numeric parameter (e.g., momentum lookback window): 3-5 values centered on default at roughly ±50% spread. Example: if default lookback is 20 days, sweep `[10, 15, 20, 30, 50]`.
- Expected scale: ~9-27 runs per (ticker × strategy) combination. ~35 tickers × 2 strategies × ~15 grid points = ~1,000 backtests. Should finish in hours on the local machine.
- **No full grid search** — exhaustive sweep risks finding overfit configs that won't generalize out-of-sample.
- **No walk-forward** for this phase — it's a sanity-check pass, not a research-paper validation. Walk-forward is appropriate later if a strategy is borderline and we want to confirm it isn't overfit.

### Pass/Fail Bar
- **KEEP**: Sharpe > 0.5 AND MaxDrawdown < 25% in **all 3 regimes** (bull, bear, high-vol).
- **MODIFY**: Strategy passes the KEEP bar in **2 of 3 regimes**, AND no regime has MaxDD > 35%. Modification = add a regime filter (e.g., VIX-based) so the strategy only fires in regimes where it works. Filter design is part of the recommendation but separate phase work.
- **DISCARD**: Strategy fails in 2+ regimes, OR any regime hits MaxDD > 35%, OR Sharpe is negative in bull regime (a strategy that can't even make money in the easy environment is broken).
- Costs applied: $0 commission (Alpaca), 0.05% slippage per side, no leverage. Per roadmap.

### Regime Segmentation (Claude's Discretion — default below)
- **Bull**: 2019, 2020-H2 (2020-07-01 → 2020-12-31), 2023, 2024
- **Bear**: 2022, 2018-Q4 (2018-10-01 → 2018-12-31)
- **High-vol**: 2020-Q1 (2020-01-01 → 2020-06-30 — COVID crash & rally), 2025
- Per-regime aggregation: combine all dates in that regime into one continuous equity curve for metrics.
- Date windows from roadmap; can revisit if VIX-based classification gives meaningfully different boundaries.

### Output Format (Claude's Discretion)
- Primary deliverable: `.planning/phases/07-strategy-reality-check/RECOMMENDATION.md` — per-strategy KEEP/MODIFY/DISCARD with evidence table (Sharpe, MaxDD, win-rate per regime per strategy), short narrative on what went right/wrong, and specific modification recommendation if MODIFY.
- Secondary: machine-readable backtest result archive (JSONL) for downstream phases to query if needed.
- Equity curves as CSV per strategy per regime (so the operator can eyeball them or plot in Excel later) — nice-to-have, planner can decide if it adds time.

### Claude's Discretion
- Exact parameter-grid choices for each strategy (depends on what the strategies actually expose — research will inspect the strategy classes and propose sensible grids)
- Regime date-window boundaries (default above; revisit only if VIX classification disagrees materially)
- Output format details beyond `RECOMMENDATION.md` (CSVs, charts, JSONL)
- Backtest execution mode (sequential vs parallel) — depends on existing engine capability
- Whether to extend `MomentumStrategy` parameter exposure if the default class hides a knob worth testing (small refactor if needed)

</decisions>

<specifics>
## Specific Ideas

- The point of M2-01 isn't to prove momentum works in academic terms — it's to prove that *this operator's existing strategies* are worth layering AI on top of (M2-04+) or not. A negative result is just as useful as a positive one: it tells us we need to design fresh signals before building infrastructure around them.
- Operator's COVID-era track record (~$10k → $40k in 2020-21) was discretionary momentum-style swing trading with disciplined profit-taking. If `MomentumStrategy` matches the temperament (entry on breakout, exit on trailing stop), it should at least show signs of life on the 2020-Q1 high-vol regime which mirrors the operator's edge era. If it doesn't, that's a strong signal the strategy is broken even relative to a known-working discretionary version.
- The existing `MomentumStrategy` and `MeanReversionStrategy` were built in M1 without M2-aware design — they're naive technical signals. Expectation is honest skepticism: probably 1 of 2 passes as MODIFY, both passing as KEEP is generous, both DISCARDING is plausible.
- A DISCARD outcome doesn't mean the project pivots. It means M2-05 (AI-Augmented Strategy Engine) is the place where new signal design happens, and M2-04 (LLM Trade-Signal Layer) is doing useful work regardless.

</specifics>

<deferred>
## Deferred Ideas

- **Designing new technical strategies if both fail** — separate phase if needed. Don't pre-judge before seeing M2-01 results.
- **Walk-forward validation** as a follow-up if a strategy lands in MODIFY territory — confirms a configuration isn't overfit before committing. Run later, not in M2-01.
- **VIX-based regime classification** as an alternative to date-window regimes — useful if M2-01 results suggest date windows are misleading. Default is date windows for this phase.
- **Backtest the strategies on the operator's actual 2020-21 trade list** as a reproducibility check (can the engine recreate the historical edge?) — interesting but selection-biased (only winners survive in memory). Don't muddy M2-01 results with this.
- **Cross-asset universe expansion** (commodities ETFs like GLD/USO, bonds like TLT) — out of scope; M2-01 universe is equities + sector ETFs only.
- **Options/derivatives strategy testing** — out of scope per roadmap; equity-only.

</deferred>

---

*Phase: 07-strategy-reality-check*
*Context gathered: 2026-05-30*
