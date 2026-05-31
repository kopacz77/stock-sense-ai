---
phase: 10-llm-trade-signal
plan: 01
subsystem: market-intelligence
tags: [m2-04, types, zod, config-seed, polymarket, news, llm-signal]

# Dependency graph
requires:
  - phase: 09-market-intelligence-bot
    provides: NewsArticle and MarketSnapshot types; relevance-filter topic keys used to seed canonical themes
provides:
  - Shared M2-04 type vocabulary (ScoredArticle, TickerDaySummary, CatalystFlag, CalendarEvent alias, ThemeCandidate, PmMapping, PmMappingProposal, DigestPayload, ScoreBacklogEntry)
  - 6 config seed JSON files (themes, themes-rejected, macro-tickers, pm-market-mappings, fda-pdufa-seed, opec-schedule-seed)
  - FRED API key as recognized optional field in ConfigSchema
affects: [10-02, 10-03, 10-04, 10-05, 10-06, 10-07, m2-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single shared types module under src/market-intelligence/signal/types.ts — Wave 2 modules import from it, never from each other"
    - "Config JSON seeds carry version: 1 + lastUpdated ISO date for forward-compat"
    - "_hint underscore-prefixed key as agreed 'ignore this, documentation' convention in JSON seeds"
    - "Composite-id strings (template-literal-typed source field: `calendar:${string}` | `article:${string}`) enforce origin at the type level"

key-files:
  created:
    - config/themes.json
    - config/themes-rejected.json
    - config/macro-tickers.json
    - config/pm-market-mappings.json
    - config/fda-pdufa-seed.json
    - config/opec-schedule-seed.json
    - src/market-intelligence/signal/types.ts
  modified:
    - src/config/secure-config.ts

key-decisions:
  - "24 canonical themes seeded — matches relevance-filter topic coverage (macro/policy/geopolitics/crypto/markets/ai/elections) with finer-grained per-domain splits (e.g. fed-rate-cuts vs fed-rate-hikes, crypto-rally vs crypto-selloff)"
  - "CalendarEvent emitted as type alias of CatalystFlag rather than a distinct interface — fewer types, same shape, source-prefix discriminator already encodes origin"
  - "ScoreBacklogEntry stores a snapshot of the full NewsArticle + MarketSnapshot[] context so the LLM retry path doesn't depend on the live news/PM streams surviving"
  - "scorerVersion field on ScoredArticle enables prompt-change re-scoring (stability tests can identify which prompt produced a given score)"

patterns-established:
  - "Wave 2+ M2-04 modules import shared types from src/market-intelligence/signal/types.ts only — keeps the type graph shallow and prevents parallel work from churning contracts"
  - "PM-to-ticker mapping table uses match: {eventSlug | slugPrefix | questionContains} discriminated union; interpretation: yesPp | noPp encodes direction inversion explicitly"

# Metrics
duration: 8min
completed: 2026-05-31
---

# Phase 10 Plan 01: M2-04 Foundation Summary

**Seeded 6 config JSON files + shared types module (258 lines, 12 exports) + FRED Zod key, locking the M2-04 contract for Wave 2 parallel execution**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 1

## Accomplishments

- All 6 M2-04 config files exist on disk and validate as JSON with version=1 each
- 24 canonical themes seeded from relevance-filter topic vocabulary (per-article scorer's first calls have non-empty themes to bias toward)
- 24 sector/macro ETFs registered (XLE/XLF/XLK/.../IWM/QQQ/SPY/VIXY)
- 3 seed PM-to-ticker mappings (Iran ceasefire, BTC threshold, Fed rate decision) + empty proposed[] for the review CLI to write into
- 9 (12 counting unions/util types) exported types in `src/market-intelligence/signal/types.ts`, all required by Wave 2 modules
- `apis.fred?` added to ConfigSchema as an optional string — FRED key is now a recognized optional secret
- `pnpm tsc --noEmit` passes clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create config/ seed files** — `c5a957d` (chore)
2. **Task 2: Extend ConfigSchema with apis.fred and create signal/types.ts module** — `7c41a06` (feat)

## Files Created/Modified

- `config/themes.json` — 24 canonical themes with aliases (seeded from relevance-filter topic keys + finer-grained per-domain splits)
- `config/themes-rejected.json` — empty rejected-themes registry (review CLI writes here on operator reject)
- `config/macro-tickers.json` — 24 sector/macro ETFs (the universe PM mappings + macro flags pick from)
- `config/pm-market-mappings.json` — 3 seed mappings (Iran ceasefire, BTC threshold, Fed decision) + empty proposed[]
- `config/fda-pdufa-seed.json` — empty PDUFA seed file with operator hint (refresh quarterly)
- `config/opec-schedule-seed.json` — empty OPEC schedule seed file with operator hint (refresh annually)
- `src/market-intelligence/signal/types.ts` — 258-line types module with 12 exported names
- `src/config/secure-config.ts` — added `fred: z.string().optional()` to `apis` z.object

## Decisions Made

### Canonical themes — 24 seeded (final list)

Derived from `src/market-intelligence/polymarket/relevance-filter.ts` topic keys with finer-grained per-domain splits where directional bias matters:

| # | Canonical theme | Aliases |
|---|---|---|
| 1 | fed-rate-cuts | rate-cut, rate-cuts, fed-cut |
| 2 | fed-rate-hikes | rate-hike, rate-hikes |
| 3 | inflation | cpi, ppi, pce-inflation |
| 4 | jobs-report | nfp, nonfarm-payrolls, unemployment |
| 5 | recession-risk | recession, yield-curve-inversion |
| 6 | ai-infra | ai-buildout, datacenter-buildout, stargate |
| 7 | ai-bubble | ai-overvaluation, ai-correction |
| 8 | china-decoupling | china-tariff, china-trade-war |
| 9 | tariff-exposure | tariff, trade-war |
| 10 | sanctions | sanction, export-controls |
| 11 | energy-supply-shock | opec-cut, oil-supply-shock, iran-strike |
| 12 | geopolitical-conflict | war, invasion, ceasefire |
| 13 | regulation-tech | antitrust, doj-tech |
| 14 | regulation-bank | bank-stress, basel |
| 15 | crypto-rally | btc-rally, btc-strength |
| 16 | crypto-selloff | btc-tank, crypto-crash |
| 17 | etf-flows | spot-etf, etf-approval |
| 18 | earnings-beat | beat, guidance-raise |
| 19 | earnings-miss | miss, guidance-cut |
| 20 | ma-confirmed | acquisition, merger, buyout |
| 21 | ma-rumor | takeover-rumor |
| 22 | fda-approval | pdufa-approval |
| 23 | fda-rejection | pdufa-rejection, crl |
| 24 | lawsuit-major | class-action, doj-suit |

Rationale: same domain often needs opposite-direction theme labels (e.g. `fed-rate-cuts` vs `fed-rate-hikes`, `crypto-rally` vs `crypto-selloff`). Collapsing into a single "fed" or "crypto" theme would lose the directional signal the per-article scorer needs to emit. Catalyst types like `earnings-beat`/`earnings-miss` and `fda-approval`/`fda-rejection` are intentionally split for the same reason.

### CalendarEvent emitted as type alias of CatalystFlag

`export type CalendarEvent = CatalystFlag` rather than a distinct interface. Both shapes are identical and the discriminator (`source: 'calendar:${string}' | 'article:${string}'`) already encodes origin at the type level. Two names for the same shape gives Plan 04 (CalendarFetchers) the naming clarity it needs without doubling the type vocabulary Plan 06 (RollupBuilder) has to reason about.

### ScoreBacklogEntry snapshots full article + PM context

When the LLM is unreachable, the backlog stores a snapshot of the full `NewsArticle` plus the `MarketSnapshot[]` PM context the article was paired with at score-time. This means the retry path doesn't depend on the live news/PM streams surviving — if the daily news/PM JSONL files get rotated or cleaned up before the LLM comes back, the backlog still has everything needed to score.

### scorerVersion field on ScoredArticle

Lets future re-scoring identify which prompt produced a given score. When the scorer prompt changes, bump `scorerVersion` and the stability test can flag rows that need re-scoring (rather than re-scoring everything blindly).

## Deviations from Plan

None — plan executed exactly as written. All 6 JSON seeds, the types module, and the Zod schema diff match the plan's specifications byte-for-byte. No bugs surfaced during verification, no missing critical functionality discovered, no blocking issues.

## Issues Encountered

None.

## Wave 2 Dependency Map (for downstream executors)

Wave 2 plan executors can sanity-check at start by confirming the types they need are exported from `src/market-intelligence/signal/types.ts`:

| Wave 2+ Plan | Module | Reads | Writes |
|---|---|---|---|
| 10-03 | ArticleScorer | `NewsArticle`, `MarketSnapshot`, calendar context (`CatalystFlag`), `PmMapping[]` | `ScoredArticle`, `ThemeCandidate`, `PmMappingProposal`, `ExtractedCatalyst` (inline in ScoredArticle), `ScoreBacklogEntry` |
| 10-04 | CalendarFetchers | (config seeds: fda-pdufa, opec-schedule + FRED API key) | `CalendarEvent` (= `CatalystFlag` with `source: 'calendar:*'`) |
| 10-05 | PmMappingEngine | `MarketSnapshot[]`, `PmMapping[]` from `config/pm-market-mappings.json`, `proposed[]` slot | `PmMapping` proposals back into `pm-market-mappings.json.proposed[]`, contributes to `TickerDaySummary.pmContribution` |
| 10-06 | RollupBuilder | `ScoredArticle[]`, `CatalystFlag[]`, PM contributions | `TickerDaySummary` (M2-05's primary query surface) |
| 10-07 | DigestBuilder | `ScoredArticle[]`, `CatalystFlag[]`, PM movers | `DigestPayload` (consumed by TelegramService) |

If any Wave 2+ executor finds a type they need is missing or wrong-shaped, that's a structural break — escalate as a Rule 4 architectural decision rather than patching downstream.

## Next Phase Readiness

- Wave 2 plans (10-02, 10-03, 10-04, 10-05) unblocked — all foundation contracts are in place
- 10-02 (LLM client) is the next Wave 1 sibling and depends only on the Zod schema diff being landed (which it now is)
- No external services need configuration (FRED key is *optional*, so its absence doesn't block calendar fetchers — those that need FRED will fail gracefully at runtime when the key is missing)
- Operator action items (deferred to operator workflow, not blockers):
  - Fill `config/fda-pdufa-seed.json` with upcoming PDUFA dates from biopharmcatalyst.com (quarterly cadence)
  - Fill `config/opec-schedule-seed.json` with announced 2026 OPEC/JMMC meetings (annual cadence)
  - Add FRED API key to encrypted config if/when macro-print scheduling needs it

---
*Phase: 10-llm-trade-signal*
*Completed: 2026-05-31*
