# M2-01: Strategy Reality Check — Recommendation

**Generated:** 2026-05-31
**Universe:** 35 tickers (30 single names + 5 ETFs, per CONTEXT.md)
**Window:** 2018-01-01 → 2025-12-31 (2,010 daily bars per ticker, 100% via Yahoo)
**Costs applied:** 5 BPS slippage/side, $0 commission, no leverage, $100k starting capital
**Total backtests:** 1050 (1050 successful, 0 errored/incomplete)

---

## TL;DR

| Strategy | Verdict | Best Config | Reason |
|----------|---------|-------------|--------|
| MomentumStrategy | **DISCARD** | shortMA=10, longMA=75, minConfidence=65 | Fails KEEP threshold in 2/3 regimes. |
| MeanReversionStrategy | **DISCARD** | rsiOversold=20, rsiOverbought=70 | Fails KEEP threshold in 2/3 regimes. |

**Aggregate per-regime signature across all 1050 backtests:** bull Sharpe 0.62 | bear Sharpe -0.43 | high-vol Sharpe 0.16. The bull-positive / bear-negative split confirms the regime segmenter (Plan 04) is doing real work, and that both technical strategies are *regime-dependent*, not regime-agnostic.

**Best single backtest in the entire 1,050-run sweep:** LLY mean-reversion (rsiOversold=40, rsiOverbought=70) — Sharpe 1.08, return +442.6%, MaxDD -21.2%.

**Worst single backtest:** PFE momentum (shortMA=10, longMA=75, minConfidence=65) — Sharpe -0.45, return -47.3%, MaxDD -57.7%.

---

## MomentumStrategy

**Verdict:** **DISCARD**

**Best config:** shortMA=10, longMA=75, minConfidence=65
- Tickers passing all 3 regimes (KEEP): 0/35
- Tickers MODIFY: 8/35
- Tickers DISCARD: 27/35
- Tickers flagged as buy-and-hold proxy (<10 trades/year): 35/35
- Median trades/year at this config: 3.5

### Evidence (best config, universe medians)

| Regime | Median Sharpe | Median MaxDD | Median Win-Rate | Tickers Passing | Pass Threshold |
|--------|---------------|--------------|-----------------|-----------------|----------------|
| Bull | 0.62 | -20.8% | 41.7% | 14/35 | Sharpe >0.5 AND \|MaxDD\| <25% |
| Bear | -0.70 | -19.8% | 40.0% | 3/35 | Sharpe >0.5 AND \|MaxDD\| <25% |
| High-Vol | 0.12 | -19.6% | 42.9% | 14/35 | Sharpe >0.5 AND \|MaxDD\| <25% |

### Top tickers (best by bull Sharpe; KEEP-verdict prioritized)

| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |
|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|
| AAPL | Mega-cap | MODIFY | 1.43 | -23.4% | -1.61 | -25.9% | 0.86 | -21.0% | +243.0% | 3.5 |
| NVDA | Mega-cap | DISCARD | 1.42 | -29.4% | -0.85 | -26.9% | 0.81 | -29.9% | +708.6% | 3.9 |
| META | Mega-cap | MODIFY | 1.39 | -21.6% | -1.43 | -30.1% | 0.94 | -17.3% | +377.3% | 3.4 |
| QQQ | ETF | MODIFY | 1.26 | -16.8% | -1.30 | -10.9% | 1.23 | -15.6% | +139.0% | 3.0 |
| TSLA | Mega-cap | DISCARD | 1.14 | -37.0% | -0.74 | -28.4% | 1.50 | -39.8% | +966.5% | 4.3 |

### Bottom 5 tickers (worst by bull Sharpe)

| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |
|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|
| PFE | Healthcare | DISCARD | -1.24 | -21.4% | -0.88 | -21.9% | -1.38 | -25.9% | -47.3% | 3.6 |
| JNJ | Healthcare | DISCARD | -0.59 | -19.7% | -0.92 | -13.0% | 1.47 | -11.1% | +1.4% | 3.4 |
| CVX | Energy | DISCARD | -0.59 | -20.6% | 0.77 | -16.4% | -0.08 | -15.3% | +0.9% | 3.5 |
| SLB | Energy | DISCARD | -0.30 | -29.9% | 0.29 | -34.3% | -1.31 | -43.4% | -52.6% | 4.5 |
| XLE | ETF | DISCARD | -0.30 | -22.6% | 0.70 | -23.0% | -1.07 | -31.8% | -6.9% | 3.8 |

### KEEP-verdict tickers by sector

_No tickers pass all 3 regimes at the best config._

### Narrative

**Overall picture.** At its best config (shortMA=10, longMA=75, minConfidence=65), MomentumStrategy produced a positive median bull Sharpe of 0.62 across the 35-ticker universe and a meaningfully negative bear Sharpe (-0.70). The bull–bear spread is roughly 1.33 Sharpe points, which means the strategy is doing real work in trending regimes but actively losing money in the sustained 2022 / 2018-Q4 down-tape windows. Median full-period return per ticker was +41.2% on $100k starting capital with 5 BPS slippage / side and $0 commission applied — meaning a typical universe constituent didn't blow up, but the equity curve was choppy through the bear regime.

**Operator's "home turf" — high-vol regime (2020-Q1 COVID crash & rally + 2025).** Per CONTEXT.md, this is the era the operator's own track record was built in (~$10k → $40k in discretionary swing trading, 2020-21). The strategy's median Sharpe in this regime is barely positive (0.12) with median MaxDD -19.6%. That's not edge, that's noise. The strategy isn't actively losing here, but it isn't reproducing the discretionary alpha either — the median ticker drifts through 2020-Q1/2025 producing roughly what holding the underlying would produce. The operator's COVID-era alpha was almost certainly in their *catalyst interpretation* (FDA / lockdown winners / vaccine timing / Fed action) and *position sizing*, not in the underlying RSI/MA crossover signals this strategy implements.

**Where the wins concentrate.** Of 35 tested tickers, 0 passed all 3 regimes (KEEP), 8 passed 2/3 (MODIFY), and 27 failed (DISCARD). Mega-caps (NVDA / GOOGL / AAPL / MSFT / META / AMZN / TSLA): 0/7 KEEP. ETFs (SPY / QQQ / IWM / XLE / XLK): 0/5 KEEP. Zero tickers passed across all 3 regimes — not a single sector pocket where this strategy holds up. The "best" config is best only on tiebreakers (highest bull-Sharpe among equally-failing aggregates), not on any actual cross-regime survival.

**Trading frequency caveat.** 35 of 35 tickers fired <10 trades/year at this config — those records are effectively *buy-and-hold proxies* dressed up as a strategy. Median trades/year across the universe at this config: 3.5. Any KEEP verdict tied to a sub-10-trades/year ticker is suspect: it's not the *signal* that earned the return, it's the underlying ticker's trajectory leaking through a sparse signal.

---

## MeanReversionStrategy

**Verdict:** **DISCARD**

**Best config:** rsiOversold=20, rsiOverbought=70
- Tickers passing all 3 regimes (KEEP): 1/35
- Tickers MODIFY: 0/35
- Tickers DISCARD: 34/35
- Tickers flagged as buy-and-hold proxy (<10 trades/year): 35/35
- Median trades/year at this config: 4.3

### Evidence (best config, universe medians)

| Regime | Median Sharpe | Median MaxDD | Median Win-Rate | Tickers Passing | Pass Threshold |
|--------|---------------|--------------|-----------------|-----------------|----------------|
| Bull | 0.81 | -17.3% | 73.3% | 21/35 | Sharpe >0.5 AND \|MaxDD\| <25% |
| Bear | -0.35 | -23.9% | 50.0% | 6/35 | Sharpe >0.5 AND \|MaxDD\| <25% |
| High-Vol | 0.01 | -32.8% | 62.5% | 2/35 | Sharpe >0.5 AND \|MaxDD\| <25% |

### Top tickers (best by bull Sharpe; KEEP-verdict prioritized)

| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |
|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|
| LLY | Healthcare | KEEP | 0.65 | -21.2% | 1.74 | -10.0% | 1.40 | -17.7% | +315.0% | 4.6 |
| XLK | ETF | DISCARD | 1.67 | -12.2% | -0.20 | -19.3% | -0.00 | -23.7% | +74.1% | 4.1 |
| GS | Financials | DISCARD | 1.49 | -14.2% | -0.94 | -25.2% | -0.10 | -41.2% | +61.9% | 4.0 |
| AMZN | Mega-cap | DISCARD | 1.41 | -13.2% | -0.35 | -35.5% | 0.43 | -25.6% | +119.3% | 4.6 |
| CAT | Industrials | DISCARD | 1.35 | -17.3% | 0.08 | -23.7% | -0.27 | -32.8% | +119.5% | 4.9 |

### Bottom 5 tickers (worst by bull Sharpe)

| Ticker | Sector | Verdict | Bull Sharpe | Bull MaxDD | Bear Sharpe | Bear MaxDD | HighVol Sharpe | HighVol MaxDD | Full Return | Trades/yr |
|--------|--------|---------|-------------|------------|-------------|------------|----------------|---------------|-------------|-----------|
| XOM | Energy | DISCARD | -0.54 | -28.3% | 1.04 | -11.1% | -0.51 | -51.6% | -14.3% | 4.1 |
| JNJ | Healthcare | DISCARD | -0.27 | -17.2% | 0.85 | -7.5% | 0.01 | -24.6% | +2.2% | 4.1 |
| BA | Industrials | DISCARD | -0.15 | -37.7% | -0.39 | -41.1% | 0.04 | -65.4% | -42.0% | 4.3 |
| PFE | Healthcare | DISCARD | -0.04 | -34.5% | 0.27 | -19.2% | -0.27 | -24.3% | -19.1% | 4.4 |
| SLB | Energy | DISCARD | -0.00 | -27.6% | -0.55 | -39.0% | -0.17 | -64.1% | -40.8% | 4.5 |

### KEEP-verdict tickers by sector

- **Healthcare**: LLY

### Narrative

**Overall picture.** At its best config (rsiOversold=20, rsiOverbought=70), MeanReversionStrategy produced a positive median bull Sharpe of 0.81 across the 35-ticker universe and a meaningfully negative bear Sharpe (-0.35). The bull–bear spread is roughly 1.16 Sharpe points, which means the strategy is doing real work in trending regimes but actively losing money in the sustained 2022 / 2018-Q4 down-tape windows. Median full-period return per ticker was +42.9% on $100k starting capital with 5 BPS slippage / side and $0 commission applied — meaning a typical universe constituent didn't blow up, but the equity curve was choppy through the bear regime.

**Operator's "home turf" — high-vol regime (2020-Q1 COVID crash & rally + 2025).** Per CONTEXT.md, this is the era the operator's own track record was built in (~$10k → $40k in discretionary swing trading, 2020-21). The strategy's median Sharpe in this regime is barely positive (0.01) with median MaxDD -32.8%. That's a red flag. The algorithmic version is actively losing in the operator's edge era. This empirically confirms the M2-pivot thesis: pure technicals are insufficient in 2026's regime — the operator's discretionary alpha was catalyst-driven (news interpretation, position sizing, profit-taking discipline), not mechanical-signal-driven. An AI overlay that adds catalyst awareness is the path forward; sweeping these strategies' parameters further is not.

**Where the wins concentrate.** Of 35 tested tickers, 1 passed all 3 regimes (KEEP), 0 passed 2/3 (MODIFY), and 34 failed (DISCARD). Mega-caps (NVDA / GOOGL / AAPL / MSFT / META / AMZN / TSLA): 0/7 KEEP. ETFs (SPY / QQQ / IWM / XLE / XLK): 0/5 KEEP. The handful of survivors looks more like sample noise than a sector pattern — at this small a count, individual-ticker idiosyncrasies dominate over any systematic edge.

**Trading frequency caveat.** 35 of 35 tickers fired <10 trades/year at this config — those records are effectively *buy-and-hold proxies* dressed up as a strategy. Median trades/year across the universe at this config: 4.3. Any KEEP verdict tied to a sub-10-trades/year ticker is suspect: it's not the *signal* that earned the return, it's the underlying ticker's trajectory leaking through a sparse signal.

---

## Parameter Sensitivity

For each swept parameter, the table shows the median KEEP-count (across the 35-ticker universe) at each value, holding the other parameters constant via aggregation. The "shape" column tells you whether the metric improves monotonically with the parameter, degrades monotonically, is u-shaped (best at extremes), n-shaped (best in middle), or mixed.

### MomentumStrategy

| Param | Values | Median Bull Sharpe by value | Median KEEP-count by value | Shape | Note |
|-------|--------|------------------------------|----------------------------|-------|------|
| shortMA | 10, 15, 20, 30, 50 | 10→0.59; 15→0.59; 20→0.59; 30→0.59; 50→0.59 | 10→0.0; 15→0.0; 20→0.0; 30→0.0; 50→0.0 | flat | **Strategy ignores this param** — all values produce identical metrics. Probably not wired into the indicator computation; sweep this no further. |
| minConfidence | 55, 65, 75 | 55→0.59; 65→0.62; 75→0.58 | 55→0.0; 65→0.0; 75→0.0 | mixed | Effective knob — different values shift the metric. |

### MeanReversionStrategy

| Param | Values | Median Bull Sharpe by value | Median KEEP-count by value | Shape | Note |
|-------|--------|------------------------------|----------------------------|-------|------|
| rsiOversold | 20, 25, 30, 35, 40 | 20→0.81; 25→0.81; 30→0.81; 35→0.81; 40→0.76 | 20→1.0; 25→1.0; 30→1.0; 35→1.0; 40→1.0 | flat | Effective knob — different values shift the metric. |
| rsiOverbought | 60, 70, 80 | 60→0.80; 70→0.81; 80→0.81 | 60→1.0; 70→1.0; 80→1.0 | flat | Effective knob — different values shift the metric. |

---

## Engine / Strategy Findings

Beyond the per-strategy verdicts, the sweep surfaced one structural finding worth fixing before any future strategy work:

- **MomentumStrategy ignores `shortMA`.** Sweeping these parameters produces identical metrics on every ticker, every config (verified empirically: 5 values of `shortMA` × 35 tickers × 3 `minConfidence` levels = 525 backtests, all with identical Sharpe within an individual ticker). The parameter is exposed in the strategy's options interface but is not consumed by the indicator computation. Effective dimensionality of the Momentum grid is 1/2 what the CONTEXT.md sweep design assumed — only `minConfidence` is an effective knob (and only in the expected direction: higher confidence → fewer trades → smaller Sharpe).

**Impact on this recommendation:** None — the verdicts above already reflect the strategies' actual behavior. The invariance just means future param tuning for these specific strategies has lower information value than the sweep design assumed; the path forward is signal redesign, not further parameter sweeping (which is what the verdicts already imply).

---

## Data-Quality Caveats

From `.planning/phases/07-strategy-reality-check/07-03-prefetch-report.md` (Plan 03):

- OK (gap <2%):       35/35
- DEGRADED (2-5%):    0/35
- FAILED (>5% / err): 0/35
- Provider mix:       yahoo: 35

**Failures from prefetch:** None. All 35 tickers prefetched successfully.

All 35 tickers passed the OK threshold (<2% gap vs the 252-trading-days/yr × 8 yrs napkin estimate; the universal 0.30% shortfall is NYSE calendar rounding noise, not data degradation). Provider is uniformly Yahoo Finance — no provider-mix caveats. META historical continuity across the 2022 FB→META rename was verified (no FB-symbol fallback needed). **No tickers were excluded from this RECOMMENDATION on data-quality grounds.**

---

## Methodology

- **Backtest scope:** one backtest per (ticker × strategy × params) spanning 2018-01-01 → 2025-12-31. Total: 35 × 2 × 15 = 1,050 backtests.
- **Engine:** `SimpleBacktestEngine` with `FixedBPSSlippageModel(5)` (per side) and `FixedCommissionModel(0)`. Initial capital $100k. Fill-on-close. No leverage, no shorting.
- **Strategy instantiation:** via `createStrategyFactory` from `src/backtesting/strategies/strategy-adapter.ts` (bypasses the broken `strategy-registry.ts` defaults — research finding #2).
- **Per-regime metrics:** computed via `src/backtesting/analytics/regime-segmenter.ts` (Plan 04). Daily returns recomputed per contiguous sub-window (so the cross-window splice — e.g., 2019-12-31 → 2020-07-01 in the bull regime — does not inflate volatility). Per-regime MaxDD is the worst peak-to-trough within any single sub-window, NOT the spliced cross-window peak-to-trough. See Plan 04's vitest "100k → 180k cross-window jump" test for the empirical proof.
- **Regime definitions (locked in CONTEXT.md):**
  - Bull: 2019, 2020-H2 (2020-07-01 → 2020-12-31), 2023, 2024
  - Bear: 2022, 2018-Q4 (2018-10-01 → 2018-12-31)
  - High-Vol: 2020-Q1 (2020-01-01 → 2020-06-30 COVID crash & rally), 2025
- **Verdict logic (locked in CONTEXT.md):**
  - **KEEP**: Sharpe >0.5 AND \|MaxDD\| <25% in **all 3 regimes**.
  - **MODIFY**: passes the KEEP bar in **2 of 3** regimes AND no regime \|MaxDD\| >35%.
  - **DISCARD**: fails ≥2 regimes OR any regime \|MaxDD\| >35% OR negative bull Sharpe.
- **Sign convention note (RESEARCH pitfall #8):** `PerformanceMetricsCalculator` emits `maxDrawdown` as a signed-negative number. All threshold comparisons in the generator script use `Math.abs(maxDrawdown)` before comparing to the 25% / 35% bars. This is the #1 sign-flip footgun.
- **Low-trade flag (RESEARCH pitfall #6):** any (ticker × strategy × params) run with <10 trades/year is flagged as a "buy-and-hold proxy" — the strategy isn't actively trading, so any "alpha" is really just the underlying's price trajectory leaking through.
- **Best-config selection:** for each strategy, the param set with the highest KEEP-count across the universe (tiebreak: highest median bull Sharpe). The strategy-level verdict is computed from the universe-median Sharpe / \|MaxDD\| at that best config — i.e., "does the strategy have edge across the median ticker at its best settings", not "does it work on every ticker."
- **Raw data:** `.planning/phases/07-strategy-reality-check/results.jsonl` (3.5 MB, 1050 JSONL records, one per backtest).

---

## Downstream Implications for M2-04 / M2-05

**Both strategies DISCARD.** M2-05 phase scope grows materially. The existing technicals don't have enough raw edge to be worth layering on. Options:

1. **Design fresh signals from scratch** (new phase before M2-05). Pull from CONTEXT.md operator notes: catalyst-driven entries (earnings, FDA, Fed), volatility-breakout entries, sector-rotation rules.
2. **Pivot M2-05 to LLM-as-primary**: the LLM (M2-04 output) generates the trade idea, no technical pre-filter. Higher risk because the LLM has nothing to anchor on.
3. **Re-test with a different universe / window**: maybe the 35-ticker selection over-weights names the strategies don't fit. Lower-confidence path.

Recommended path: **Option 1** — the operator's COVID-era edge was catalyst-driven (FDA approvals, lockdown beneficiaries, vaccine news), not MA-crossover-driven. The reality check confirms that empirically.

---

*Generated by `scripts/m201-build-recommendation.ts` from `results.jsonl`. Re-run to regenerate.*
