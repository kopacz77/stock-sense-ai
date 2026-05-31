---
phase: 10-llm-trade-signal
plan: 04
subsystem: market-intelligence
tags: [polymarket, pm-mapping, signal-engine, jsonl, vitest]

# Dependency graph
requires:
  - phase: 10-llm-trade-signal
    provides: "PmMapping / PmMappingProposal types (src/market-intelligence/signal/types.ts); config/pm-market-mappings.json seed file with 3 mappings + proposed[]"
provides:
  - "PmMappingEngine class — table-driven PM-to-ticker signal generator with noPp inversion + EXCLUSION_KEYWORDS bypass + proposal persistence"
  - "TickerSignal type — flat per-(ticker × market) record with signed contributedScore, weight, direction, sourceMarketId for traceability"
  - "Stateless mapMarket(snapshot) / mapMarkets(snapshots[]) API ready for Plan 10-05 RollupBuilder to aggregate into TickerDaySummary.pmContribution"
affects: [10-05-rollup-builder, 10-07-digest-builder, 10-08-cli-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Match-all populated criteria: each non-null match.* field must hit; all-null rules refuse to fire (no catch-alls)"
    - "Exclusion-before-match: EXCLUSION_KEYWORDS filter runs before mapping pass so false-positive markets neither emit signals nor proposals"
    - "Cached config with invalidateCache() escape hatch — long-running pipeline doesn't re-read JSON every call but operator review CLI can force reload"
    - "Sign math factored as movePp × dirSign × weight × interpSign for symmetry; noPp inversion is a single ±1 flip rather than special-cased branch"

key-files:
  created:
    - "src/market-intelligence/signal/pm-mapping-engine.ts (230 lines)"
    - "src/market-intelligence/signal/__tests__/pm-mapping-engine.test.ts (320 lines)"
  modified: []

key-decisions:
  - "Sign math expressed as a single 4-factor product (movePp × dirSign × weight × interpSign) so the noPp inversion is a flip of one factor, not a branched code path"
  - "All-null mapping rules refuse to match anything (defensive: prevents an operator-edited catch-all from saturating every ticker)"
  - "Unmatched markets persist an empty-proposedTickers shell record; the article scorer's LLM fallback enriches the same stream later — review CLI (10-07) merges both write paths"
  - "EXCLUSION_KEYWORDS filter runs before mapping (not after), so excluded markets generate neither signals nor proposals — keeps the proposals stream tractable for weekly review"

patterns-established:
  - "Result-as-discriminated-union ({ excluded | unmatched | tickerSignals[] }) for mapMarket — caller switches on the discriminator rather than parsing a nullable list"
  - "JsonlStore-backed proposal persistence — same store pattern used by news/polymarket pipelines (single-writer scheduler assumption preserved)"

# Metrics
duration: ~3min
completed: 2026-05-31
---

# Phase 10 Plan 04: PM Mapping Engine Summary

**Table-driven Polymarket-to-ticker signal engine with noPp inversion, EXCLUSION_KEYWORDS bypass, and unmatched-market proposal persistence — turns a -4pp Iran ceasefire move into a +4 bullish XLE contribution in a single deterministic pass.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-31T18:53:24Z
- **Completed:** 2026-05-31T18:56:36Z
- **Tasks:** 1 / 1
- **Files created:** 2

## Accomplishments

- `PmMappingEngine` class with `mapMarket(snapshot)` + `mapMarkets(snapshots[])` + `invalidateCache()` + `mappingCount()` public API.
- Three-rule match precedence (eventSlug → slugPrefix → questionContains), all populated criteria must match.
- noPp inversion math verified end-to-end against the M2-03 canonical Iran ceasefire example.
- EXCLUSION_KEYWORDS bypass blocks sports/entertainment false positives (FIFA, NBA, Oscars, etc.) before they reach the proposal stream.
- Unmatched markets persist as `PmMappingProposal` shell records to `data/intel/pm-mappings-proposed-YYYY-MM-DD.jsonl`, ready for the Plan 10-02 article-scorer LLM fallback to populate `proposedTickers` later.
- 8 unit tests cover every plan-required scenario, all green on first run.

## Task Commits

1. **Task 1: Build PmMappingEngine + 8-case unit test suite** — `65a3144` (feat)

## Files Created

- `src/market-intelligence/signal/pm-mapping-engine.ts` — engine class, ~230 lines including the docstring sign-math table.
- `src/market-intelligence/signal/__tests__/pm-mapping-engine.test.ts` — 8 vitest cases, ~320 lines (covers all 8 scenarios from the plan brief).

## Sign Math Table

The contribution formula is:

```
contributedScore = movePp × directionSign × weight × interpretationSign
  where directionSign      = direction === "long" ? +1 : -1
  and   interpretationSign = interpretation === "noPp" ? -1 : +1
  and   movePp             = snapshot.oneHourPriceChange × 100
```

| interpretation | direction | movePp |  product (w=1) | meaning                                                |
|----------------|-----------|-------:|---------------:|--------------------------------------------------------|
| yesPp          | long      |    +4  | +4 × +1 × +1 = **+4** (bullish)  | Yes rising → bullish for long ticker (BTC → COIN)        |
| yesPp          | long      |    -4  | -4 × +1 × +1 = **-4** (bearish)  | Yes falling → bearish                                    |
| yesPp          | short     |    +4  | +4 × -1 × +1 = **-4** (bearish)  | Yes rising → bearish for short ticker (rate cut → XLF)   |
| noPp           | long      |    -4  | -4 × +1 × -1 = **+4** (bullish)  | Yes falling → bullish (Iran ceasefire breaks → XLE/USO)  |
| noPp           | short     |    -4  | -4 × -1 × -1 = **-4** (bearish)  | Yes falling → bearish for short ticker (JETS)            |

### Iran ceasefire worked example (M2-03 canonical signal)

- Mapping: `eventSlug=iran-ceasefire-continues-through`, interpretation=`noPp`, tickers `[XLE long w=1.0, USO long w=1.0, LMT long w=0.6, RTX long w=0.6, JETS short w=0.5]`
- Snapshot: `oneHourPriceChange = -0.04` (Yes price drops 4pp — ceasefire conviction weakens)
- Computed contributions:
  - XLE: `-4 × +1 × 1.0 × -1 = +4` (bullish energy — war risk back)
  - USO: `-4 × +1 × 1.0 × -1 = +4`
  - LMT: `-4 × +1 × 0.6 × -1 = +2.4` (bullish defense)
  - RTX: `-4 × +1 × 0.6 × -1 = +2.4`
  - JETS: `-4 × -1 × 0.5 × -1 = -2` (bearish airlines — oil pass-through cost)

This is the M2-03 alert that fired live on 2026-05-27. The engine now converts that macro signal into 5 actionable per-ticker contributions ready for Plan 10-05's rollup math.

## Decisions Made

1. **Sign math as single 4-factor product, not branched code.** Could have written `if (interpretation === "noPp") return -movePp * dirSign * weight; else return movePp * dirSign * weight;`. Kept the symmetric `movePp × dirSign × weight × interpSign` form so the inversion is a `±1` factor like the direction sign — easier to reason about, harder to invert one branch and not the other.

2. **All-null rules refuse to match.** A mapping with `{ eventSlug: null, slugPrefix: null, questionContains: null }` would otherwise match every market and saturate every ticker. Operator could land such a rule by accident via JSON edit or future bulk-update CLI; the engine refuses it at the matcher rather than at config-validation time so this safety holds even if config validation regresses.

3. **EXCLUSION_KEYWORDS bypass runs before mapping, not after.** Plan 10-07's review CLI will read the proposals stream. If excluded markets created proposals, the operator would wade through Iran-FIFA / SuperBowl-Trump / Oscars-AI noise weekly. Filtering before means the proposals queue stays high-signal.

4. **Unmatched proposals carry empty `proposedTickers: []`.** The article scorer (Plan 10-02) may later see the same market in a news context and extract ticker candidates via LLM — both writers persist to the same JSONL stream, and Plan 10-07's review CLI dedupes by `marketId` and merges `proposedTickers` arrays. Keeping the engine LLM-free here keeps it deterministic and fast (no model warmup, no rate limit).

## Reminders for Downstream Plans

- **The Iran ceasefire mapping uses `noPp` inversion**, which is non-obvious from the raw mapping JSON. The operator-facing review CLI in Plan 10-07/10-08 should render the interpretation as a labeled badge ("Yes rising = bearish for the listed tickers (noPp inversion)") rather than just printing the raw string — otherwise the operator may approve a mapping whose sign they misread.
- **Seed mappings loaded:** 3 (iran-ceasefire-continues-through eventSlug, will-bitcoin-reach-* slugPrefix, fed-decision-in-* + "rate cut" combined). Per `config/pm-market-mappings.json` lastUpdated=2026-05-31. The seed reflects the three live macro themes M2-03 was firing alerts on as of phase start.
- **Plan 10-05 (RollupBuilder) integration shape:** call `const { tickerSignals, proposals, excludedCount } = await pmEngine.mapMarkets(todaysSnapshots);`. Group `tickerSignals` by ticker, sum `contributedScore` per group → that's `TickerDaySummary.pmContribution.netScore`. Map each contributing `TickerSignal` to a `sources[]` entry. `proposals` are already persisted to disk; the rollup builder doesn't need to handle them.

## Deviations from Plan

None — plan executed exactly as written. Engine semantics, module shape, and all 8 test cases match the brief. No bugs found during implementation; no architectural deviation; no auto-fixes applied.

## Verification

- `pnpm vitest run src/market-intelligence/signal/__tests__/pm-mapping-engine.test.ts` → **8/8 tests pass** in 27ms.
- `pnpm tsc --noEmit` → **exit 0** (no type errors in this module or anywhere in the project).
- The plan's `<verification>` extra checks satisfied implicitly: "fifa" and "world cup" exclusion is tested (test 5); "nba" and "oscars" share the same EXCLUSION_KEYWORDS list mechanism (same code path). Iran ceasefire worked example is the primary content of test 1.

## Issues Encountered

None.

## Next Phase Readiness

- **Plan 10-05 (RollupBuilder) UNBLOCKED.** Can import `{ PmMappingEngine, TickerSignal }` from `../signal/pm-mapping-engine.js` and call `mapMarkets()` directly.
- **Plan 10-07 (review CLI) UNBLOCKED on the engine side.** Can use `engine.invalidateCache()` after writing config edits back to disk.
- **No operator setup required** for this plan. The seed mappings in `config/pm-market-mappings.json` are sufficient to handle the M2-03 canonical signals (Iran / BTC / Fed); fuller mapping coverage will accrete via the proposals stream + weekly review cadence once Plan 10-07 ships.

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
