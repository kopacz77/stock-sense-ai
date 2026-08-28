# M2-05 Backtest Gap: Why the Per-Regime Bar Was Replaced

**Status:** the CONTEXT-locked "same 2018-2025 universe + regimes as M2-01" backtest was found
structurally unevaluable during Phase 11 (M2-05) planning refresh (2026-08-27) and replaced with a
live-window gate over the real 2026 substrate for v1. This document is the durable record of that
gap — the ROADMAP.md success criterion it replaces, the structural reason it cannot be evaluated,
why the obvious workaround doesn't rescue it, what shipped instead (with the actual numbers), and
the two paths that would unlock the original bar. Per RESEARCH.md §10 (E3), this is written as a
standalone deliverable rather than left inside a phase-planning archive, so the decision stays
recoverable without anyone having to dig through `.planning/`.

## 1. What the ROADMAP asked for

`.planning/ROADMAP.md`'s M2-05 section, Success Criterion 2, reads:

> Backtest covers same 2018-2025 universe + regimes as M2-01

CONTEXT.md locked the acceptance bar for that backtest:

- **Per-regime Sharpe > 0.5** (bull, bear, highVol regimes individually)
- **Per-regime MaxDD < 25%**
- **Negative Sharpe in the bull regime = automatic FAIL** — a strategy that loses money when the
  market is going up is not a strategy worth shipping, regardless of its other-regime numbers
- **Combined-strategy Sharpe should be > standalone-best-signal-type Sharpe** — the four-signal
  ensemble has to justify its own complexity over just running the best single type alone

This is the same regime-segmented methodology M2-01 used to formally DISCARD both
`MomentumStrategy` and `MeanReversionStrategy` (`.planning/phases/07-strategy-reality-check/RECOMMENDATION.md`),
reusing `src/backtesting/analytics/regime-segmenter.ts` and the M2-01 8-year OHLCV prefetch under
`data/cache/historical/`.

## 2. Why it cannot be evaluated

`src/backtesting/analytics/regime-segmenter.ts:86-101` hardcodes the `REGIMES` constant:

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

Every window ends **2025-12-31**. The real M2-04 signal substrate this engine's four signal types
read from — `news`, `polymarket-snapshots`, `catalyst-flags`, `ticker-day-summary`,
`scored-articles` — begins **2026-05-23** at the earliest, and the per-ticker rollup stream
(`ticker-day-summary`, the primary query surface every signal type reads) begins **2026-05-31**.
Calendar 2026 is not represented anywhere in `REGIMES`.

This means CONTEXT.md's two instructions — "backtest covers the same 2018-2025 universe +
regimes as M2-01" and "backtest uses historical M2-04 outputs" — are **mutually exclusive as
written**, for every one of the four v1 signal types, not just the ones that need scored-article
sentiment. There is no date range in which both conditions hold. This is a **structural** gap: it
is not fixed by accumulating more scored-article days, running the scheduler longer, or waiting —
the M2-04 substrate will never retroactively acquire 2018-2025 history, and `REGIMES`'s windows
will never retroactively acquire a 2026 entry on their own.

## 3. Why fetching Polymarket history does not rescue it

The obvious workaround — fetch historical Polymarket prices for 2018-2025 and re-run the same
signal types against that period — was checked directly during the 2026-08-27 research refresh
and does not close the gap, for a curation reason rather than a data-availability reason:

1. **The endpoint exists and needs no auth.** Polymarket's CLOB API exposes
   `GET https://clob.polymarket.com/prices-history`, which returns a `{ t: unix_timestamp, p: price }`
   series per market/asset id. Historical PM price data for 2023-2025 (Polymarket's own operating
   history) is technically fetchable today.
2. **But `config/pm-market-mappings.json`'s 12 rules are all keyed to 2026-specific event slugs.**
   Every rule in the file matches on a Polymarket market slug or question string that only exists
   because of this project's simulated 2026 storylines:

   | Slug / match | `addedBy` |
   |---|---|
   | `will-the-us-invade-iran` | `manual-2026-07-14` |
   | `us-announces-blockade-on-iran` | `manual-2026-07-14` |
   | `iran-full-airspace-closure` | `manual-2026-07-14` |
   | `israel-closes-its-airspace` | `manual-2026-07-14` |
   | `iran-charges-hormuz-fees` | `manual-2026-07-14` |
   | `iran-announces-withdrawal-from-mou-negotiations` | `manual-2026-07-14` |
   | `us-iran-final-nuclear-deal` | `manual-2026-07-14` |
   | `next-round-of-us-iran-peace-talks` | `manual-2026-07-14` |
   | `fed-decision-in-*` (rate decrease) | `manual-2026-07-14` |
   | `fed-decision-in-*` (rate increase) | `manual-2026-07-14` |
   | `fed-rate-hike-in-2026` | `manual-2026-07-14` |
   | `will-bitcoin-reach-*` | `manual-seed` |

   None of these specific markets existed on Polymarket in 2023-2025 — this project's Iran-conflict
   and 2026 Fed-decision storylines are, by construction, 2026 events. A 2023-2025 replay would need
   an **entirely different, hand-curated mapping set** keyed to whatever markets Polymarket actually
   ran in that period (2024 US election markets, 2023-2024 Fed-decision markets, earlier
   geopolitical events, etc.).

   That curation work is comparable in size and effort to the original `PmMappingEngine` seeding
   effort (Plan 10-04) — reading real historical Polymarket market listings, deciding which markets
   are ticker-relevant, assigning tickers/directions/weights, and validating sign math against real
   historical price moves. It is not a fetch-and-go task, and it is **not in scope for M2-05 v1**.

## 4. What shipped instead

`src/strategy/backtest/live-window-runner.ts` (this plan, 11-06) replays
`StrategyEngine.generateCandidates` day-by-day across the real, continuous 2026 substrate, prices
the resulting candidates against real OHLCV via `MarketDataService`, and reports Sharpe / Sortino /
MaxDD / trade count per signal type and combined through `PerformanceMetricsCalculator.calculate()`
**directly** — no `regime-segmenter` windowing of any kind, because no `REGIMES` window overlaps
2026. Every output is labelled, verbatim:

> single continuous 2026 window — interim, not the per-regime bar

Thresholds evaluated (D-15, the operator's 2026-08-27 acceptance decision): **combined Sharpe > 0**
and **combined MaxDD < 25%**, with CATALYST_ANCHORED and SECTOR_ROTATION_FROM_PM also reported
individually. Any Sharpe computed from fewer than 20 closed trades is marked `thin-sample` and
treated as directional only, not a pass/fail signal on its own (Sharpe's standard error scales with
`1/sqrt(N)`, and this substrate has at most ~90 calendar days of history).

### Live-window run (`pnpm dev strategy backtest --start 2026-08-15 --end 2026-08-19`)

A note on the window before the numbers: RESEARCH §8's usable-range table gives
SECTOR_ROTATION_FROM_PM an aspirational start of 2026-05-23 — but reaching it would require
writing a rebuilt rollup file into `data/intel/` for the eight days (05-23→05-30) before any real
`ticker-day-summary` file exists, and this execution ran under an explicit "never modify
`data/intel/`" constraint. The runner's default window therefore starts 2026-05-31 (the first day
any rollup file exists) for every type uniformly. Separately, the window recorded below
(2026-08-15 → 2026-08-19, 5 real trading days) is narrower than a full default-window run because a
live, real-time Yahoo Finance rate-limit was hit repeatedly during this execution when replaying
the full ~90-day default window across all four signal types (`data/intel/` is read-only and
untouched by this; the rate limit is on outbound OHLCV price fetches to `query1.finance.yahoo.com`,
confirmed via direct `curl` returning `HTTP/2 429`) — see
`.planning/phases/11-ai-strategy/deferred-items.md` item 2 for the full diagnosis. 11-08's own
acceptance step re-runs the full default window separately as its own gate (per
`11-08-PLAN.md`); the numbers below are this plan's real, honest measurement over a smaller
real window, produced by the exact same code path.

Real output, `pnpm dev strategy backtest --start 2026-08-15 --end 2026-08-19` (803.0s replay):

| Signal type | Usable range | Candidates | Trades | Sharpe | Sortino | MaxDD | Win rate |
|---|---|---|---|---|---|---|---|
| CATALYST_ANCHORED | 2026-08-15 → 2026-08-19 | 40 | 1 | -5.01 | -4.65 | -1.7% | 0.0% (thin-sample) |
| SENTIMENT_VELOCITY | (no candidates — gated, no scored-article coverage in August) | 0 | 0 | 0.00 | 0.00 | 0.0% | — |
| SECTOR_ROTATION_FROM_PM | 2026-08-15 → 2026-08-19 | 15 | 0 (positions still open at window end) | -7.10 | -3.17 | -3.4% | — (thin-sample) |
| FADE_OVERSHOOT | 2026-08-15 → 2026-08-19 | 57 | 0 | — | — | — | shadow-only, never sized |
| **Combined** | 2026-08-15 → 2026-08-19 | 97 | 1 | **-5.01** | -4.65 | **-1.7%** | 0.0% (thin-sample) |

**Verdict against D-15's thresholds:** Combined Sharpe > 0 → **FAIL** (-5.01). Combined MaxDD < 25% → **PASS** (-1.7%). **Overall: FAIL.** Per the plan's own instruction, this failing number is recorded honestly rather than tuned to pass — every metric here comes from exactly one real closed trade over a 5-trading-day window, which is the expected shape of a window this short (CATALYST_ANCHORED's single loss dominates every combined statistic; SECTOR_ROTATION_FROM_PM's candidates simply hadn't reached their `timeHorizonDays` exit by the window's end, so they show real unrealized mark-to-market drag with zero *closed* trades). `shadowCandidateCount: 57` (all FADE_OVERSHOOT); `skippedDays: []` (the real substrate has no holes in this window). This is flagged for the 11-08 acceptance checkpoint, which re-runs the full default window separately and is where the operator adjudicates whether an interim FAIL on a 5-day sample changes anything about shipping v1.

## 5. What would unlock the original bar

Two paths, either of which is out of scope for M2-05 v1:

**Path A — a 2023-2025 Polymarket re-mapping project, as its own phase.** Curate a hand-built
`PmMapping` set for whatever markets Polymarket actually ran in 2023-2025 (2024 US election
markets, 2023-2024 Fed-decision cycles, earlier geopolitical events), fetch their historical price
series via `/prices-history`, and re-run `SECTOR_ROTATION_FROM_PM`/`FADE_OVERSHOOT` against that
window. **Prerequisite:** the same order of curation effort as Plan 10-04's original
`PmMappingEngine` seeding — reading real market listings and hand-assigning ticker/direction/weight
per rule, not a fetch-and-go task. `CATALYST_ANCHORED`/`SENTIMENT_VELOCITY` would still need a
separate historical news/catalyst corpus for the same window (this project's `news`/`catalyst-flags`
streams also only go back to 2026), so Path A alone does not fully close the gap for all four
types — it closes it for the two PM-driven types.

**Path B — accumulate enough live 2026-onward history for calendar 2026 to itself be
regime-classified.** Once enough of 2026 has traded live, an operator (not an automated
process — regime classification is a market-character judgment, the same kind CONTEXT.md's
locked 2019/2020H2/2023/2024 bull windows and 2018Q4/2022 bear windows represent) can label
2026's own months as bull/bear/highVol and add them to `REGIMES`. **Prerequisite:** enough
elapsed calendar time for 2026 to have a real, judgeable market character — this is a "wait and
then decide" path, not a technical build.

Neither path is scheduled. This document exists so a future planner or operator can pick one up
without re-deriving the structural finding from scratch.

## 6. Decision record

The operator confirmed this substitution on **2026-08-27**, recorded verbatim in
`.planning/phases/11-ai-strategy/11-CONTEXT.md` under `### Backtest acceptance (operator decision,
2026-08-27)`: the live-window gate over the real 2026 substrate replaces the CONTEXT-locked
per-regime bar as the v1 acceptance check, explicitly labelled interim, with the true per-regime
backtest deferred per this document. `.planning/ROADMAP.md`'s M2-05 section links this document
under both the "Backtest-scope change" note and a dedicated "Future work" bullet, so the decision
is recoverable without reading a phase-planning archive.

