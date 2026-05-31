---
phase: 10-llm-trade-signal
plan: 03
subsystem: market-intelligence
tags: [m2-04, calendar, fred, finnhub, treasury, eia, pdufa, opec, catalyst-flag]

# Dependency graph
requires:
  - phase: 10-llm-trade-signal
    provides: CalendarEvent / CatalystFlag shared types (10-01), apis.fred? optional Zod field (10-01), config/fda-pdufa-seed.json + config/opec-schedule-seed.json operator-maintained seeds (10-01)
provides:
  - 5 calendar fetchers (FRED 8-release macro / Finnhub earnings / Treasury 10-30Y auctions / EIA Wednesday-cron / FDA+OPEC seed loader) unified under a single CalendarRefresher.refreshAll(days) orchestrator
  - CalendarEvent[] persisted append-only to data/intel/catalyst-flags-YYYY-MM-DD.jsonl, dedupe-by-id at read-time
  - Live-confirmed TreasuryDirect Fiscal Data endpoint (v1/upcoming_auctions) + reopening-aware regex for 10Y/20Y/30Y duration filtering
  - Pure-deterministic EIA Wednesday generator with operator-maintained holiday-shift table (EIA_HOLIDAY_SHIFTS, currently empty — annual update)
affects: [10-05, 10-06, 10-07, m2-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Calendar fetchers are pure data producers returning CalendarEvent[] — persistence is the orchestrator's job. Keeps fetchers independently testable and lets the refresher own dedup + JSONL write semantics."
    - "Best-effort orchestrator via Promise.allSettled — a single source failing contributes 0 events but does NOT clear other sources' contributions for the day."
    - "Graceful missing-key degradation: fetchers requiring an API key log a single warning + return [] when the key is absent, rather than throwing. Matches the pattern Wave 1 established with apis.fred being an optional Zod field."
    - "Live-spike documentation pattern: when a third-party endpoint shape is inferred from research rather than confirmed, run a curl spike FIRST, write the result to a *-spike.md doc next to the plan, and bake the confirmed schema into the fetcher."

key-files:
  created:
    - src/market-intelligence/signal/calendar/fred-fetcher.ts
    - src/market-intelligence/signal/calendar/finnhub-earnings-fetcher.ts
    - src/market-intelligence/signal/calendar/treasury-auction-fetcher.ts
    - src/market-intelligence/signal/calendar/eia-cron-generator.ts
    - src/market-intelligence/signal/calendar/seed-file-loader.ts
    - src/market-intelligence/signal/calendar/index.ts
    - src/market-intelligence/signal/calendar/__tests__/eia-cron-generator.test.ts
    - src/market-intelligence/signal/calendar/__tests__/seed-file-loader.test.ts
    - .planning/phases/10-llm-trade-signal/10-03-treasury-spike.md
  modified: []

key-decisions:
  - "Treasury endpoint confirmed: v1/upcoming_auctions with sort=-auction_date (without -auction_date sort the first page is 2024-vintage record_date ascending — operator would see stale rows and assume the API is broken)"
  - "Treasury security_term regex covers reopenings: '9-Year 10/11-Month', '19-Year 10/11-Month', '29-Year 10/11-Month' alongside the canonical '10-Year' / '20-Year' / '30-Year' (reopenings are ~half of 60-day-window long-duration auctions and price off the same dynamics)"
  - "Bills (4W/8W/13W/52W) intentionally excluded from Treasury fetcher — front-of-curve tail dynamics don't materially move TLT/IEF"
  - "FRED fetcher uses Promise.allSettled across the 8 release IDs so one release-call failure doesn't cascade — preserves the other 7 in the same cycle"
  - "EIA generator is pure-deterministic (no network), holiday-shift table is operator-maintained because EIA publishes the annual schedule as a static HTML page, not a structured feed. Default behavior (empty table) is correct for ~90% of weeks; operator updates each December for the ~5 Mon/Tue federal holidays that shift the report to Thursday"
  - "Earnings fetcher maps Finnhub 'amc' -> '16:30' ET and 'bmo' -> '08:00' ET (conservative pre-open mark); 'dmh' (during-market-hours, rare) leaves expectedTimeEt undefined since the exact intraday slot isn't given"
  - "Seed loader normalizes PDUFA tickers to uppercase before composing the stable id — operator can put 'lly' or 'LLY' in the seed file and the id is canonical either way"
  - "CalendarRefresher uses append-only semantics — the same event id will appear multiple times in the daily JSONL across N refreshes; rollup builder and digest builder are responsible for dedup-by-id at read time (taking the latest firstSeenAt / lastRefinedAt). This matches the JsonlStore pattern in src/market-intelligence/storage/"

patterns-established:
  - "Calendar-layer module structure: 5 single-purpose fetchers + 1 index orchestrator + 1 catch-all barrel re-export. Each fetcher returns CalendarEvent[] (no I/O side effects); the index owns dedup + JSONL persistence."
  - "Live-spike doc colocated with plan: when a third-party endpoint must be verified before code-write, the doc lives at .planning/phases/<phase>/<phase>-<plan>-<topic>-spike.md and is referenced from the source file headers."

# Metrics
duration: ~22min
completed: 2026-05-31
---

# Phase 10 Plan 03: Calendar Layer Summary

**5-fetcher M2-04 calendar layer (FRED macro / Finnhub earnings / Treasury 10-30Y / EIA Wednesday-cron / FDA+OPEC seed) unified under CalendarRefresher.refreshAll(60) — end-to-end smoke produces 17 events written to catalyst-flags JSONL in 523ms**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Source files created:** 6 (4 fetchers + seed loader + orchestrator/barrel)
- **Test files created:** 2 (EIA generator + seed loader)
- **Spike docs:** 1 (Treasury endpoint confirmation)
- **Lines written:** ~1,100 (source + tests + docs)
- **Unit tests:** 11 / 11 passing (`pnpm vitest run src/market-intelligence/signal/calendar/__tests__/`)
- **TypeScript:** `pnpm tsc --noEmit` clean (exit 0)

## Accomplishments

- **Treasury endpoint confirmed via live curl spike** before any code was written. The inferred `v1/accounting/od/upcoming_auctions` path returns 200 with parseable JSON; sample response captured + reopening-term nuance documented at `.planning/phases/10-llm-trade-signal/10-03-treasury-spike.md`.
- **All 5 fetchers emit the same CalendarEvent shape** (CatalystFlag alias) — Wave 3 RollupBuilder + DigestBuilder can iterate over a single uniform stream.
- **CalendarRefresher orchestrator** composes all 5 fetchers via `Promise.allSettled`, dedups by event id, and appends to `data/intel/catalyst-flags-YYYY-MM-DD.jsonl`. Best-effort: a failed source contributes 0 events but does not clear the other sources' contributions.
- **End-to-end smoke** (no FRED key in env, 10-ticker universe, 60-day window) produced 17 events in 523ms — 6 finnhub-earnings + 2 treasury + 9 eia-cron. FRED degraded gracefully (warning logged, no entry in `failed[]` because the no-key branch returns `[]` cleanly rather than throwing).
- **Live API confirmation** for both networked fetchers: Finnhub returned upcoming earnings for AMZN, AAPL, MSFT, NVDA, GOOGL, META in the next 60 days; Treasury returned 2 upcoming auctions (Bond reopening 2026-06-11, Note reopening 2026-06-10).

## Task Commits

Each task was committed atomically:

1. **Task 1: Spike Treasury Fiscal Data endpoint + build FRED, Finnhub, Treasury, EIA fetchers** — `9afc3e6` (feat)
2. **Task 2: Build SeedFileCalendarLoader + CalendarRefresher orchestrator** — `129b31c` (feat)

## Files Created

- `src/market-intelligence/signal/calendar/fred-fetcher.ts` (122 lines) — 8 release IDs locked in `FRED_RELEASE_IDS`; per-release `Promise.allSettled` so one release failing doesn't abort the others; graceful no-op when `apis.fred` is missing.
- `src/market-intelligence/signal/calendar/finnhub-earnings-fetcher.ts` (110 lines) — 1 call covers the window, client-side filter by uppercase symbol; `amc` -> 16:30 ET, `bmo` -> 08:00 ET, `dmh` -> undefined time.
- `src/market-intelligence/signal/calendar/treasury-auction-fetcher.ts` (102 lines) — `v1/upcoming_auctions?sort=-auction_date&page[size]=200&filter=security_type:in:(Note,Bond)`; reopening-aware regex for 10Y/20Y/30Y duration families; `magnitudePrior: 2`, affectedSectors: `["TLT", "IEF"]`.
- `src/market-intelligence/signal/calendar/eia-cron-generator.ts` (95 lines) — pure deterministic Wednesday emitter; operator-maintained `EIA_HOLIDAY_SHIFTS` table (currently empty); test-injectable `now` and `shifts`.
- `src/market-intelligence/signal/calendar/seed-file-loader.ts` (94 lines) — reads FDA PDUFA + OPEC seed JSONs; ENOENT returns []; ticker normalized to uppercase.
- `src/market-intelligence/signal/calendar/index.ts` (113 lines) — barrel re-export + `CalendarRefresher.refreshAll(days)` orchestrator.
- `src/market-intelligence/signal/calendar/__tests__/eia-cron-generator.test.ts` (7 tests) — Wednesday-start, Sunday-start, ~8-9 Wednesdays in 60d, holiday-shift override, unique-id invariant, edge-cases at days=0.
- `src/market-intelligence/signal/calendar/__tests__/seed-file-loader.test.ts` (4 tests) — empty seeds, missing seeds, 2-entry PDUFA mapping (incl. uppercase normalization), 1-entry OPEC mapping with affectedSectors.
- `.planning/phases/10-llm-trade-signal/10-03-treasury-spike.md` — confirmed endpoint, sample response, reopening-term nuance + fetcher decisions baked into TreasuryAuctionCalendarFetcher.

## Treasury endpoint — confirmed schema

```
GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions
    ?sort=-auction_date
    &page[size]=200
    &filter=security_type:in:(Note,Bond)
```

Sample row (live response captured 2026-05-31):

```json
{
  "record_date": "2026-05-29",
  "security_type": "Bond",
  "security_term": "29-Year 11-Month",
  "reopening": "Yes",
  "cusip": "912810UU0",
  "offering_amt": "null",
  "announcemt_date": "2026-06-04",
  "auction_date": "2026-06-11",
  "issue_date": "2026-06-15"
}
```

**Important nuance** (baked into the duration-family regex):

| Initial issue (new CUSIP) | Reopening (`reopening: "Yes"`)              |
| ------------------------- | ------------------------------------------- |
| `10-Year` Note            | `9-Year 10-Month` or `9-Year 11-Month` Note |
| `20-Year` Bond            | `19-Year 10-Month` or `19-Year 11-Month`    |
| `30-Year` Bond            | `29-Year 10-Month` or `29-Year 11-Month`    |

The naive `security_term IN ("10-Year","20-Year","30-Year")` filter misses ~half of upcoming long-duration auctions on a 60-day window. The reopening-aware regex captures both forms.

## EIA holiday-shift table — state

`EIA_HOLIDAY_SHIFTS` is currently `{}` (empty). The default Wednesday cadence is correct for ~90% of weeks; the override table needs operator-curated entries each December for the ~5 Mon/Tue federal holidays that shift the petroleum release to Thursday (MLK / Presidents / Memorial / July 4 weeks). Source of truth: <https://www.eia.gov/petroleum/supply/weekly/schedule.php>.

The empty default does NOT cause the generator to crash on holiday weeks — it just emits a Wednesday event that won't fire on time. M2-05 can read `sourceMeta.shiftedFromWednesday` to know whether a given event was overridden.

## FRED smoke result — deferred to first run

FRED smoke could not run during plan execution: `FRED_API_KEY` is not set in `.env`. The fetcher correctly degraded:

```
[FredCalendarFetcher] FRED_API_KEY not configured — returning [] (graceful degradation)
```

This is intentional behavior per the plan's escape hatch — the fetcher logs a warning and returns `[]` rather than throwing. The empty return is NOT recorded in `result.failed[]` because the no-key branch is a clean no-op, not a failure. The first cycle after the operator adds the FRED key to the encrypted config (or to `.env`) will produce 8 release feeds in the same `bySource` map.

## Finnhub earnings smoke result

10-ticker universe (`NVDA, GOOGL, XLE, XLF, SPY, AAPL, MSFT, META, TSLA, AMZN`) over 60-day window: **6 earnings events** returned, all 6 tickers with reportable quarters in the window (AMZN, AAPL, MSFT, NVDA, GOOGL, META). One representative row:

```json
{
  "id": "earnings-GOOGL-2026-07-21",
  "type": "earnings",
  "tickers": ["GOOGL"],
  "expectedDate": "2026-07-21",
  "expectedTimeEt": "16:30",
  "magnitudePrior": 4,
  "direction": "uncertain",
  "confidence": 0.4,
  "source": "calendar:finnhub-earnings",
  "sourceMeta": {
    "hour": "amc",
    "epsEstimate": 2.9567,
    "revenueEstimate": 120172819684,
    "year": 2026,
    "quarter": 2
  }
}
```

The 4 ETFs (XLE/XLF/SPY/TSLA — TSLA being a single-name but no reportable date in window) contribute 0 to the earnings stream, which is correct.

## CalendarRefresher end-to-end smoke

```json
{
  "totalEvents": 17,
  "bySource": {
    "finnhub-earnings": 6,
    "treasury": 2,
    "eia-cron": 9
  },
  "failed": [],
  "durationMs": 523
}
```

- 17 events total in 523ms (most of it network latency for the 2 remote calls).
- `failed: []` despite FRED having no key — the fetcher returns `[]` cleanly rather than throwing, so it's not classified as a failure.
- 9 EIA Wednesdays in the 60-day window starting 2026-05-31 (Sunday) — matches the napkin math (60/7 = 8.57 weeks).
- JSONL persisted to the smoke-isolated dir, 17 lines / ~6.6KB.

## Decisions Made

### Treasury endpoint locked to v1/upcoming_auctions

Spike confirmed the inferred path is correct. The `v2/auctions_query` historical endpoint was not exercised — `v1/upcoming_auctions` already returns forward-dated rows (as of 2026-05-31, latest auction in response was 2026-06-11), so the simpler endpoint is sufficient.

### Sort=-auction_date is required, not optional

Default sort is `record_date` ascending, which means the first page of results is 2024-vintage rows. `sort=-auction_date` returns the newest auctions first, which is what we want for a forward-looking calendar. Documented in the spike doc.

### Reopening-term regex (not exact match)

The intuition "filter `security_term IN ('10-Year','20-Year','30-Year')`" misses ~half of upcoming long-duration auctions because reopenings shift the term to "9-Year 10-Month" / etc. Solution: 3 regexes (`NOTE_10Y`, `BOND_20Y`, `BOND_30Y`) that match both the initial form and the reopening forms.

### Bills excluded from Treasury fetcher

4-Week, 8-Week, 13-Week, 52-Week Bills appear in the upcoming-auctions feed but trade at the front of the curve and don't materially move TLT/IEF on tail/strength dynamics. Filtered out via `security_type IN ("Note","Bond")`.

### FRED Promise.allSettled per release

Each of the 8 release-id calls runs in parallel via `Promise.allSettled`. One release failing (e.g. FOMC release rate-limited momentarily) contributes 0 events for that release but the other 7 still land in the cycle.

### EIA holiday-shift table starts empty

The plan called for operator-maintained `EIA_HOLIDAY_SHIFTS` populated annually. Initial state is `{}`. This is correct for ~90% of weeks; the operator needs to populate the table each December for the ~5 Mon/Tue federal holidays that shift the release to Thursday. The generator emits a `sourceMeta.shiftedFromWednesday: true` marker on overridden events so downstream code can detect the shift.

### Earnings hour mapping conservative for bmo

Finnhub's `hour` field is `"amc" | "bmo" | "dmh"`. Mapping:
- `amc` -> `16:30` ET (after market close; reports usually drop 16:00-16:30, conservative late mark)
- `bmo` -> `08:00` ET (before market open; reports usually drop 06:30-08:00, conservative pre-open mark)
- `dmh` -> `undefined` (during market hours is rare and the intraday slot isn't given)

### Append-only JSONL with read-time dedup

Each call to `refreshAll()` appends N events to today's JSONL file. The same event id (e.g. `eia-petroleum-2026-06-03`) will appear in the file multiple times across N daily refreshes. The rollup builder and digest builder (Wave 3) are responsible for deduping by `id` and taking the latest `firstSeenAt` / `lastRefinedAt`. This matches the established `JsonlStore` pattern in `src/market-intelligence/storage/` and avoids needing rewrite semantics in the storage layer.

### Calendar fetchers are pure data producers

None of the 5 fetchers write to disk. Persistence is exclusively the orchestrator's job. This keeps fetchers trivially testable (no fs cleanup needed) and lets the orchestrator own the dedup + JSONL append semantics in one place.

## Deviations from Plan

None. Plan executed exactly as written. All 6 source files, 2 test files, and 1 spike doc match the plan's specifications. No bugs surfaced, no missing critical functionality discovered, no blocking issues encountered.

The only nuance that emerged during execution — and was anticipated by the plan's "spike first, lock schema second" instruction — was the reopening security_term variation. The spike caught it before code-write and the regex handles both forms cleanly.

## Issues Encountered

None during planned work.

One smoke-test infrastructure note (not a plan deviation): top-level await is not supported by `pnpm tsx -e '...'` in CJS mode. Worked around by writing a temporary `.mts` file with explicit `import` and running via `pnpm tsx /tmp/foo.mts`. This is a one-time pattern for live smoke validation and does not affect production code.

## Next Phase Readiness

- **Wave 3 RollupBuilder (10-06) unblocked on the calendar side** — can read `data/intel/catalyst-flags-YYYY-MM-DD.jsonl` and join CalendarEvents by ticker/sector against the article scorer's emerging catalysts. Dedup-by-id semantics documented above.
- **Wave 3 DigestBuilder (10-07) unblocked on the calendar side** — can populate `DigestPayload.upcomingCalendar` from the same JSONL stream.
- **Cycle-runner integration** is a one-liner per cycle: `await new CalendarRefresher({ fredApiKey: cfg.apis.fred, finnhubApiKey: cfg.apis.finnhub, tickerUniverse: union(watchlist, macroTickers) }).refreshAll(60)`. Recommended cadence: once daily during pre-market (06:00 ET), since most of these schedules don't change intraday.

### Operator-pending items (deferred, not blockers)

- Add `FRED_API_KEY` to `.env` (or via `pnpm start setup` into encrypted config) — unlocks 8 macro release feeds in the same `bySource` map. Sign up at <https://fred.stlouisfed.org/docs/api/api_key.html> (free, 32-char key).
- Quarterly: refresh `config/fda-pdufa-seed.json` from biopharmcatalyst.com PDUFA calendar.
- Annually (December): refresh `config/opec-schedule-seed.json` from opec.org press calendar; refresh `EIA_HOLIDAY_SHIFTS` map in `eia-cron-generator.ts` for the next year's MLK/Presidents/Memorial/July-4 weeks.

None of the above block Wave 3 development — they only affect the breadth of catalyst flags produced at runtime.

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
