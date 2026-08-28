---
phase: 11-ai-strategy
reviewed: 2026-08-28T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - config/strategy-config.json
  - package.json
  - src/analysis/technical-indicators.ts
  - src/index.ts
  - src/market-intelligence/alerts/digest-builder.ts
  - src/market-intelligence/cli/intel-commands.ts
  - src/market-intelligence/scheduler/cycle-runner.ts
  - src/market-intelligence/signal/catalyst-loader.ts
  - src/market-intelligence/signal/materiality-prescreen.ts
  - src/market-intelligence/signal/rollup-builder.ts
  - src/strategy/backtest/live-window-runner.ts
  - src/strategy/cli/strategy-commands.ts
  - src/strategy/config.ts
  - src/strategy/coverage.ts
  - src/strategy/decision-log.ts
  - src/strategy/levels.ts
  - src/strategy/signals/catalyst-anchored.ts
  - src/strategy/signals/fade-overshoot.ts
  - src/strategy/signals/index.ts
  - src/strategy/signals/sector-rotation.ts
  - src/strategy/signals/sentiment-velocity.ts
  - src/strategy/sizing.ts
  - src/strategy/strategy-engine.ts
  - src/strategy/substrate.ts
  - src/strategy/types.ts
  - src/strategy/vix-provider.ts
  - src/web/server.ts
  - web/frontend/src/App.tsx
  - web/frontend/src/components/layout/Layout.tsx
  - web/frontend/src/pages/StrategyPage.tsx
  - web/frontend/src/services/api.ts
  - web/frontend/src/stores/useUIStore.ts
  - web/frontend/src/types/strategy.ts
findings:
  critical: 2
  warning: 3
  info: 0
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-08-28
**Depth:** standard
**Files Reviewed:** 33 (17 additional `__tests__/` files read for context, not separately findings-scoped)
**Status:** issues_found

## Summary

Reviewed the full new `src/strategy/*` engine (types, config, levels, sizing, decision-log,
substrate, coverage, vix-provider, the four signal modules, the live-window backtest runner, the
CLI), the new `/api/strategy/*` web route + `/strategy` React page, and the diff-scoped changes to
pre-existing files this phase touched (`cycle-runner.ts`, `intel-commands.ts`, `digest-builder.ts`,
`rollup-builder.ts`, `technical-indicators.ts`, `index.ts`, `server.ts`, `App.tsx`, `Layout.tsx`,
`useUIStore.ts`, `api.ts`, `package.json`).

The math in `levels.ts`/`sizing.ts`/`decision-log.ts` (the parts money actually depends on) is
careful and internally consistent — clamps, rounding, and dedup/rank tie-breaks all check out
against their doc comments. The catalyst-loader consolidation and D-16 materiality pre-screen are
clean refactors with no behavior regression found. Two real correctness gaps stand out, both with a
plausible path to silently losing or corrupting real trading-decision data, plus three lower-severity
robustness/UX gaps in the same area. Already-logged items (`deferred-items.md` 1 and 3, and the
`skippedTypes: []` gap) are not re-reported below.

## Critical Issues

### CR-01: A single ticker's market-data fetch failure aborts the entire day's candidate run

**File:** `src/strategy/strategy-engine.ts:305-329`
**Issue:** `generateCandidates` fetches ATR/price history per ticker with no error handling:

```ts
for (const ticker of tickers) {
  const from = new Date(asOfDate.getTime() - ATR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const bars = await this.marketData.fetchHistoricalData(ticker, from, asOfDate); // <-- unguarded
  ...
}
```

`MarketDataService.fetchHistoricalData` (`src/data/market-data-service.ts:473-535`) throws when
Alpha Vantage, Finnhub, *and* Yahoo Finance all fail for that one symbol. This is not a hypothetical
— `deferred-items.md` item 2 documents real, reproducible Yahoo Finance rate-limiting encountered
during this same phase's own backtest verification, and Finnhub's free tier already 403s on the
`/stock/candle` endpoint by design. Because this loop has no `try/catch`, one bad ticker among
today's raw signals throws out of `generateCandidates` entirely — every ranked, sub-threshold, and
shadow candidate for the day, across all four signal types, is lost (nothing gets persisted, the CLI
prints nothing or crashes with a stack trace). This directly contradicts the engine's own design
principle for the signal-generation loop one section above ("One broken signal type must not cost
the operator the whole morning's candidates from the other three," `strategy-engine.ts:292-296`) —
that isolation exists for `generate()` failures but not for this per-ticker price-fetch step, which
is exactly as likely to fail in production.

**Fix:** Wrap the per-ticker fetch in a try/catch; on failure, drop only that ticker's candidates
(or fall back to a degraded/zero-confidence entry) and record it the same way a skipped signal type
is recorded, rather than letting the exception propagate out of `generateCandidates`:

```ts
for (const ticker of tickers) {
  const from = new Date(asOfDate.getTime() - ATR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  try {
    const bars = await this.marketData.fetchHistoricalData(ticker, from, asOfDate);
    // ... existing ATR computation
  } catch (err) {
    // record ticker as unpriceable; exclude its candidates from allCandidates below
    // instead of letting the whole run throw.
  }
}
```

### CR-02: Web `/strategy` accept/skip status is not fetched from the server — a page reload lets an operator silently overwrite an already-accepted decision

**File:** `web/frontend/src/pages/StrategyPage.tsx:43,60-71`; `src/web/server.ts:556-632`
**Issue:** `GET /api/strategy/candidates` returns only `ranked`/`subThreshold`/`shadow`/`skippedTypes`
from `candidates-*.jsonl` — it never joins against `decisions-*.jsonl`, so the response carries no
"already accepted/skipped" flag. `StrategyPage` tracks decision state purely in local component
state (`const [decisions, setDecisions] = useState<Record<string, 'accept' | 'skip'>>({})`,
line 43), set only by `handleAccepted`/`handleSkipped` after a successful mutation
(lines 65-71) and never hydrated from the server. `load()` (lines 45-58) is called on mount and on
every `dateParam` change but does not restore `decisions`.

Consequence: if the operator reloads the page (or revisits `/strategy` later the same session) after
accepting a candidate, `decisions` resets to `{}` and the already-accepted card renders with live
Accept/Skip buttons again, pre-filled from `candidate.suggestedEntry/Target/Stop` — i.e. the
engine's *original* suggestion, not whatever the operator actually entered the first time. Clicking
Accept again calls `DecisionLog.recordAccept` a second time, which unconditionally appends a new
record (`decision-log.ts:72-90`, no idempotency/duplicate check). `DecisionLog.readDedupedByCandidateId`
— used by the CLI's `list-candidates`, `decisions-summary`'s accept/skip rate, and any future
close/P&L reconciliation — resolves ties by latest `closedAt ?? decidedAt`
(`decision-log.ts:191-210`), so the second, likely-default-valued accept record silently becomes the
authoritative one, discarding whatever custom entry/target/stop/size the operator actually chose the
first time. For a decision log whose correctness is the explicit top priority of this system, this
is a real risk of quietly corrupting a real trade decision, not just a UI cosmetic gap.

**Fix:** Either (a) have `GET /api/strategy/candidates` join against
`DecisionLog.readDedupedByCandidateId` for the requested date range and include a `decision` field
per candidate so the frontend can hydrate `decisions` from the server response on every load, or (b)
make `recordAccept`/`recordSkip` reject (409) when a live (non-closed) decision already exists for
that `candidateId`, forcing an explicit "amend" action instead of a silent duplicate:

```ts
// server.ts GET handler
const decisionLog = new DecisionLog({ strategyDataDir: this.strategyDataDir });
const decisions = await decisionLog.readDedupedByCandidateId(asOfDate, todayIso);
const decisionByCandidateId = new Map(decisions.map((d) => [d.candidateId, d]));
// attach `decision: decisionByCandidateId.get(c.candidateId)?.decision ?? null` to each candidate
```

## Warnings

### WR-01: Zero/insufficient ATR data silently produces a degenerate entry=target=stop candidate that still gets ranked and sized

**File:** `src/strategy/strategy-engine.ts:322-326`; `src/strategy/levels.ts:61-96`
**Issue:** `atrByPeriod[period] = series[series.length - 1] ?? 0;` falls back to `0` whenever
`TechnicalIndicators.calculateATRSeries` returns an empty series (fewer than `period` bars available
— realistic for a recently-listed ticker, a thin macro-proxy ETF, or any of the fetch degradations
described in CR-01 that return a short-but-non-throwing bar set). With `atr5 = 0`,
`computeLevels`'s stop clamp collapses to `stopPrice === entryPrice`
(`levels.ts:68-72`, `rawStop = entryPrice - 1.5*0*dirSign = entryPrice`, and the `±5%` clamp keeps
the max, which is still `entryPrice`), and for `kind: "atr"` targets the same happens to
`targetPrice` (`levels.ts:78-85`). The resulting candidate has `suggestedEntry === suggestedTarget
=== suggestedStop`, still receives a non-null `suggestedSizeUsd` from `suggestSizeUsd` (which never
looks at ATR), and can still land in `ranked` if its raw score clears `scoreFloor`. Nothing in the
engine flags this degenerate state to the operator — it looks like an ordinary candidate row with a
zero-width stop.
**Fix:** Treat `atrValue <= 0` as un-priceable — either drop the candidate into `skippedTypes`-style
diagnostics, or refuse to compute levels/size for it and log why, rather than emitting a
same-price entry/target/stop that a fast-reviewing operator could accept with an effectively
zero-distance stop.

### WR-02: Web accept form always sends `entry`/`target`/`stop`, even when unedited, collapsing the override-vs-suggestion distinction

**File:** `web/frontend/src/pages/StrategyPage.tsx:295-315`
**Issue:** `submitAccept` unconditionally builds
`{ entry: Number(entry), target: Number(target), stop: Number(stop), ... }` from state that is
pre-filled with `candidate.suggestedEntry/Target/Stop` (lines 282-284). Every web-originated accept
therefore always supplies explicit overrides equal to the suggestion unless the operator edits the
field, whereas `DecisionLog.recordAccept`'s contract (and the CLI's `--entry`/`--target`/`--stop`,
which are genuinely omitted when unset) is designed to distinguish "operator's chosen value" from
"no override, use the engine's suggestion" (`decision-log.ts:66-70`). The stored value is numerically
identical either way today, so this is not a live data-corruption risk by itself, but it silently
discards a signal (`operatorEntry === candidate.suggestedEntry` no longer distinguishes "operator
explicitly confirmed this number" from "operator just clicked through") that a future audit or
"how often does the operator override the engine" metric would want.
**Fix:** Only include a field in the POST body when its current value differs from the candidate's
suggested value, mirroring the CLI's optional-flag semantics.

### WR-03: Clearing a numeric field on the Accept form sends `0` to the API instead of surfacing inline validation

**File:** `web/frontend/src/pages/StrategyPage.tsx:298-304`
**Issue:** `Number(entry)` where `entry` is a controlled `<input type="number">` string state: if the
operator clears the Entry/Target/Stop field, `Number('')` evaluates to `0`, which is then sent as
`entry: 0` to `POST /api/strategy/candidates/:id/accept`. The backend's `StrategyAcceptSchema`
(`server.ts`) correctly rejects `0` (`z.number().positive()`), but the only feedback the operator
gets is a generic `toast.error('Failed to accept: Invalid request parameters')` — there is no
client-side indication of which field is the problem.
**Fix:** Validate `entry`/`target`/`stop`/`sizeUsd` as positive numbers before calling
`api.acceptCandidate`, and disable/flag the Confirm button with a field-level message instead of
relying on the server round-trip to surface a generic toast.

---

_Reviewed: 2026-08-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
