# Phase M2-04: LLM Trade-Signal Layer — Research

**Researched:** 2026-05-31
**Domain:** LLM-driven news scoring + structured signal extraction on top of an already-running M2-03 intelligence pipeline
**Confidence:** HIGH (substrate is in-tree and inspected; external API claims cross-verified)

## Summary

M2-04 lands on a mature, already-shipping M2-03 substrate. The full polling loop (Finnhub + RSS news, Polymarket markets, LLM correlation, Telegram dispatch with daily-cap + cooldown, JSONL persistence, self-healing scheduler) is in `src/market-intelligence/` and producing signal today — `data/intel/scheduler-state.json` shows 147 cycles completed with 236 alerts sent, and `alert-cooldown.json` shows the bare 4/day cap already enforcing. M2-04 does **not** rewrite this loop; it **extends** it with:

1. A new **per-article scorer** module reusing `LlmCorrelator`'s LM Studio call surface (same OpenAI-compatible client, same Qwen 3 14B model, same `/no_think` directive) but with a different prompt + JSON schema.
2. A new **rollup builder** that aggregates the per-article scored stream into the M2-05-facing `ticker-day-summary` shape.
3. A new **calendar layer** seeded from FRED, Finnhub `/calendar/earnings`, Treasury Fiscal Data, EIA, plus manual seed files for FDA PDUFA + OPEC. All flow into the same catalyst-flag JSONL stream used by emerging catalysts.
4. A new **PM-to-ticker mapping engine** keyed off the existing `MarketSnapshot.slug` + `eventSlug`.
5. A new **theme registry** + weekly review CLI (Telegram digest is achievable but heavier; recommend CLI-first).
6. An **upgrade to the alert delivery model** that replaces the bare 4/day hard cap with 3 scheduled digest slots + 1 break-glass slot, while keeping the existing audit-log of suppressed alerts intact.

**Primary recommendation:** Build the per-article scorer as a sibling to `LlmCorrelator` (not a fork — they have different responsibilities). Reuse the cost-tracker, JsonlStore, and scheduler heartbeat as-is. Seed the calendar from FRED + Finnhub + Treasury free-tier APIs (no new auth needed for FRED if we ask the operator for one free key); manual-seed FDA PDUFA quarterly and OPEC annually. Hook the digest builder into a new "scheduled tick" pathway on the existing heartbeat.

## M2-03 Substrate Inventory

All paths absolute under `/home/kopacz/projects/stock-sense-ai/`.

### Reusable as-is (do not modify)

| Module | File | Why reuse |
|--------|------|-----------|
| OpenAI-compatible LLM client + cost accounting | `src/market-intelligence/correlator/llm-correlator.ts` (constructor + `ping()`) | LM Studio call surface is correct, timeouts/retries already tuned (60s, retries=0, `/no_think` directive). Used by 147+ cycles in production. |
| `LlmCostTracker` | `src/market-intelligence/correlator/cost-tracker.ts` | Already daily-totals usage. Reframe to track call volume + token count for AI-04 (CONTEXT says drop USD focus). The existing `record()` already captures input/output tokens; the cap-check site moves from `dailyCapUsd` to a `dailyCapCalls` or `dailyCapTokens`. |
| `JsonlStore<T>` | `src/market-intelligence/storage/jsonl-store.ts` | Daily-rotated, append-only, handles `readDay()` and `readRecent(hours)`. Sufficient for `scored-articles`, `ticker-day-summary`, `catalyst-flags`, `pm-mappings-proposed`, `themes-proposed`. **Concurrent-write caveat:** the store uses `fs.appendFile` which is atomic for small writes on POSIX but does **not** guarantee inter-process ordering. We run a single scheduler process today, so this is fine. Document it. |
| `IntelScheduler` heartbeat | `src/market-intelligence/scheduler/intel-scheduler.ts` | Self-healing 60s tick, market-hours-aware cadence. Add a second responsibility — fire scheduled digests at 8:30/12:30/15:30 ET — without rewriting the heartbeat. |
| `TelegramService` | `src/notifications/telegram-service.ts` | Already supports `DAILY_DIGEST` message type (lines 134-137). Extend to handle three flavors (MORNING/MIDDAY/CLOSE) by widening the existing `DigestAlert.flavor` union. |
| `IntelligenceAlerter.send()` cooldown + daily-cap state file | `src/market-intelligence/alerts/intelligence-alerter.ts` | Cooldown logic stays; ET-day counter stays; **add** digest-slot tracking inside the same `alert-cooldown.json` state file (extend the schema with `digestSlotsFired: { morning: boolean, midday: boolean, close: boolean, breakGlass: boolean }`). |
| `runCycle()` orchestration | `src/market-intelligence/scheduler/cycle-runner.ts` | Insert two new steps after step 3 ("Correlate"): step 3.5 = "Score each new article" (LLM call per article subject to deprioritization + backlog), step 3.6 = "Update catalyst flags from scored articles + recompute today's rollup." |

### Existing data shapes (inspected on disk, 2026-05-31)

- `news-YYYY-MM-DD.jsonl` rows match `NewsArticle` (id, source, publisher, tickers, headline, summary, url, publishedAt, fetchedAt, category) — example confirmed has all fields populated.
- `polymarket-snapshots-YYYY-MM-DD.jsonl` rows match `MarketSnapshot` — confirmed `slug`, `eventSlug`, `eventTitle`, `eventContext`, prices, `volume24hr`, all the `*PriceChange` fields are present.
- `alerts-fired-YYYY-MM-DD.jsonl` rows match `IntelligenceAlert & { suppressed?: boolean }` — already capturing suppressed alerts (the BTC MicroStrategy 3.55pp row I sampled is `suppressed: true`).
- `alert-cooldown.json` has the live shape: `{ records: [...], dailyCap: { etDate, sentCount } }` with 4/4 burned today.
- `scheduler-state.json`: `{ lastRunAt, cyclesCompleted, alertsSentTotal }`.

### Extends, but does not replace

- **`MacroNewsPoller`** (`src/market-intelligence/news/macro-news-poller.ts`): keep all 5 default feeds. Per CONTEXT, articles past the daily soft cap (~500) still get persisted by this poller; scoring just deprioritizes them.
- **`relevance-filter.ts`**: `RELEVANT_TOPIC_KEYWORDS` (lines 11-103) is the deprioritization gate — articles tagged with these topics get scored even past the cap. **Reuse this list directly** rather than maintaining a parallel "macro keyword set."
- **`HeadlinePmCorrelator`** (rule-based, `src/market-intelligence/correlator/headline-pm-correlator.ts`): keep as the LLM-unreachable fallback for alert generation. M2-04 scoring stays separate (queued, not fallback-substituted).

### Worth noting (don't fix in M2-04, flag for later)

- `secure-config.ts` calls in `intel-commands.ts` use `apis.finnhub` — when we add FRED, we'll need to extend the Zod `ConfigSchema` to include `apis.fred?: z.string().optional()`. **One-line schema diff in `src/config/secure-config.ts`.**
- `config/` directory at repo root is empty. CONTEXT says new config files (`config/themes.json`, `config/pm-market-mappings.json`, `config/macro-tickers.json`) live there. We'll need to create the dir.
- `watchlist.txt` at repo root (10 tickers, plain text) is the existing watchlist source. CONTEXT proposes `config/watchlist.json` — either migrate or keep both. **Recommendation: keep `watchlist.txt` and add `config/macro-tickers.json` as a separate file**; rollup union = `loadWatchlist() ∪ loadMacroTickers()`. Minimizes blast radius.

## LM Studio Call Surface

### Current patterns from `llm-correlator.ts`

- **HTTP API:** OpenAI-compatible (`POST /v1/chat/completions`). Uses the official `openai` npm SDK with `baseURL` override.
- **Default model:** `qwen/qwen3-14b` (resolved by `intel-commands.ts` line 65).
- **Default endpoint:** `http://localhost:1234/v1` in code default; CONTEXT pins production at `http://192.168.50.226:1234/v1` (WSL2 → Windows host).
- **API key:** stub string `"lm-studio"` (LM Studio ignores; SDK requires non-empty).
- **Timeout:** 60s default (line 77 `timeoutMs ?? 60_000`).
- **Retries:** `maxRetries: 0` — explicit, because the SDK's default retry on a 60s local-inference timeout would burn 3x the time budget.
- **`response_format`:** **omitted**. Comment on line 117-119: LM Studio rejects `{ type: "json_object" }` (wants `json_schema` or `text`). Code instead asks the model to output bare JSON in the system prompt and uses a lenient `parseDecisions()` that strips markdown fences. **Carry this pattern forward — don't experiment with `response_format` in M2-04.**
- **Failure handling today:** caught in `cycle-runner.ts` line 100-109, logs warning, falls back to rule-based correlator. **M2-04 needs different behavior: queue the article for backlog drain, do not silently substitute a rule-based score.**

### Throughput estimates (Qwen 3 14B local, single-call)

Confidence: MEDIUM (combination of public benchmarks + our observed cycle duration).

- Public benchmarks for Qwen 3 14B Q4_K_M quantization on consumer hardware: 24-30 tok/s on mobile, much higher on dedicated GPU (a 4090-class card lands ~70-110 tok/s for generation, ~200+ tok/s for prefill).
- The M2-03 correlator burns one ~1200-2400-token prompt per cycle (10 markets + 30 articles) and gets a ~200-600 token JSON response. Single call wall time on our LM Studio host: typically 5-15s based on existing cycle durations in `scheduler-state.json`.
- **For M2-04's per-article scoring:** much smaller prompt per call (~250-600 input tokens: one article + theme enum + JSON-schema-as-prose) and ~150-300 output tokens (sentiment, materiality, themes, catalysts).
- **Estimated per-article latency: 3-8 seconds.** At 500 articles/day worst case, sequential scoring would consume 25-70 minutes of LM Studio time per day. Spread across cycles, this is comfortably within a 15-min cycle window even on noisy days (a single cycle averages ~30 articles new vs the prior cycle's snapshot — about 2-4 minutes of scoring per cycle).

### Concurrency

**Strongly recommended: single-call-at-a-time.**
- Local Qwen 3 14B on a single GPU has effectively one inference stream. Parallel calls compete for the same KV cache and end up slower per-call than serialized.
- Use a simple in-process semaphore (or just sequential `await` in a for-loop) to score one article at a time. This is what the M2-03 correlator does today; no reason to deviate.
- **Exception:** if the operator later moves to a multi-GPU box or a hosted inference service, the scorer should expose a `concurrency` option (default 1) so the constraint is per-deployment.

### Recommended per-article prompt structure

Lock this shape into a task — the planner should not redesign it.

**System prompt (stable, versioned in code as `SYSTEM_PROMPT_V1`):**
```
You score financial news articles for a personal swing-trading signal layer. For each article you receive, return a strict JSON object with:

- sentiment: float in [-1.0, +1.0] — bearishness/bullishness FOR THE TICKER(S) listed. Negative = price likely to fall, positive = likely to rise. If the article is not material to any specific ticker, return 0.0 with a low materiality.
- materiality: float in [0.0, 1.0] — how price-moving this is. 0 = pure noise (routine earnings preview, generic analyst opinion). 1 = guaranteed to move price (guidance cut, M&A confirmed, FDA decision).
- themes: array of short lowercase-kebab-case theme tags (max 5). PREFER tags from the provided "current canonical themes" list; only propose new tags when none fit.
- catalysts: array of catalyst records, each with { type, expected_date | null, magnitude (1-5 integer), direction ("up"|"down"|"uncertain"), confidence (0-1) }. Empty array if no catalyst is mentioned. Catalyst types: "earnings", "guidance", "ma", "regulatory", "fda", "macro_print", "fomc", "geopolitical", "lawsuit", "product", "other".
- referenced_calendar_events: array of strings — if this article refines an upcoming scheduled event (e.g., article handicaps next week's CPI), list the event_id(s) provided in the input.

Output STRICT JSON, no prose, no markdown fences. Use the exact schema:

{
  "sentiment": -0.6,
  "materiality": 0.85,
  "themes": ["fed-rate-cuts", "ai-infra"],
  "catalysts": [
    { "type": "fomc", "expected_date": "2026-06-18", "magnitude": 4, "direction": "down", "confidence": 0.7 }
  ],
  "referenced_calendar_events": ["fomc-2026-06-18"]
}
```

**User prompt (per-article, per-ticker):**
```
# Current canonical themes (prefer these)
fed-rate-cuts, fed-rate-hikes, ai-infra, ai-bubble, tariff-exposure, china-decoupling, energy-supply-shock, ...

# Upcoming calendar events (next 14 days)
- fomc-2026-06-18: FOMC rate decision, magnitude_prior=4, direction=uncertain
- cpi-2026-06-12: CPI print, magnitude_prior=4, direction=uncertain
- ...

# Article
ticker_scope: NVDA, GOOGL
headline: ...
publisher: Reuters
published: 2026-05-31T13:42:00Z
summary: ...

/no_think
```

Notes:
- The `/no_think` directive (already used in the existing correlator) disables Qwen 3's thinking mode for low-latency structured output.
- Inject the **current** theme enum on every call. This is the operational mechanism that prevents theme drift (CONTEXT acknowledges drift is the main risk). Read from `config/themes.json` at scorer-construction time.
- Inject upcoming calendar events (next 14 days) so the LLM can mark `referenced_calendar_events` — that's the stitch the planner needs for the "calendar entry's magnitude/direction/confidence refined as news arrives" flow.

### Article-to-ticker fan-out

Articles arrive with `tickers: string[]` (possibly empty — true for all RSS macro articles). The per-article score has to fan out to one record per (article × ticker) pair. For macro/RSS articles with no ticker, the scorer should:

1. Use the LLM call to extract `affected_tickers` (a separate field in the response) by asking it to match the article's content against the active ticker universe (`watchlist ∪ macro-tickers`).
2. If none match, persist a single rollup-only row keyed by the matched theme(s), not by ticker. M2-05 can query by theme.

**Alternative considered:** pre-filter the macro article through the keyword universe in `relevance-filter.ts` and only call the LLM for articles that hit. **Rejected** because keyword matching is what the LLM was meant to replace; it would re-introduce the brittleness CONTEXT is trying to eliminate.

## Calendar Layer Feasibility Per Source

### FRED API (FOMC, CPI, NFP, PCE, retail sales, JOLTS, GDP, ISM)

- **Provider:** FRED `/fred/releases/dates` endpoint (returns *upcoming* release dates) and `/fred/release/dates?release_id=X` (returns dates for a specific release).
- **Auth:** FREE, requires a 32-char alphanumeric API key (registration only — no payment, no quota worth worrying about for our volume).
- **Rate limit:** 120 requests/minute, no daily cap on the free tier. Comfortably within budget.
- **Response shape:** `{ release_id, release_name, date }` array. Map `release_id` to our event types via a static lookup table baked into the calendar fetcher.
- **Relevant `release_id`s** (verified from the public FRED release index; treat the IDs as configuration we lock into code, not magic numbers):
  - CPI: `release_id=10`
  - Employment Situation (NFP): `release_id=50`
  - Personal Income & Outlays (PCE): `release_id=21`
  - FOMC press releases: `release_id=101`
  - Retail Sales: `release_id=84`
  - JOLTS: `release_id=192`
  - ISM Manufacturing: `release_id=375` (Manufacturing PMI)
  - GDP: `release_id=53`
- **Refresh cadence:** daily (one call per release_id we care about, ~8 calls/day total).
- **Pre-load strategy:** on startup and once daily thereafter, fetch each release's next-60-day window and upsert into the catalyst-flag stream with `source: "calendar:fred"`.

### Earnings Calendar (Finnhub `/calendar/earnings`)

- **Provider:** Finnhub. We already have a Finnhub key configured (`apis.finnhub`, see `secure-config.ts`); zero new auth.
- **Endpoint:** `GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&token=...`
- **Free tier:** confirmed (60 calls/min). One call covers the entire 60-day window across all symbols.
- **Response shape (per Finnhub docs):** `{ earningsCalendar: [{ symbol, date, hour ("amc"|"bmo"|"dmh"), epsActual, epsEstimate, revenueActual, revenueEstimate, year, quarter }] }`
- **Filter:** only keep symbols in `watchlist ∪ macro-tickers`. For macro ETFs, optionally seed the dates of the top 3-5 constituents (deferred — out of scope per CONTEXT comment "earnings for ETF underlyings" but feasible).
- **Refresh cadence:** weekly is sufficient (earnings dates rarely shift inside a 60-day window); daily on the rolling-60-day frontier costs nothing extra so just do daily.

### FDA PDUFA Dates

- **Provider:** **NO clean free API.** Public aggregators (BioPharmCatalyst, BPIQ, FDA Tracker, MarketBeat, RTTNews, BioPharmaWatch) all have web pages with calendars but most lock the API behind paid plans. The FDA itself does not publish PDUFA dates as a structured feed.
- **Recommendation:** **manual seed file `config/fda-pdufa-seed.json`** with a documented quarterly refresh cadence. Operator (or a Claude-assisted batch) scrapes BioPharmCatalyst or MarketBeat quarterly and updates the file. Each entry: `{ ticker, drug_name, indication, expected_date, source_url, last_verified }`.
- **Optional enhancement:** add an RSS feed from BioPharmCatalyst if their free RSS exists (search did not confirm one). Defer to a follow-up task if needed.
- **Refresh cadence:** quarterly manual; this is acceptable per CONTEXT.

### OPEC Meetings

- **Provider:** OPEC publishes a yearly schedule on its website (no API). 8-12 meetings per year (regular + JMMC + extraordinary).
- **Recommendation:** **manual seed file `config/opec-schedule-seed.json`**. Each entry: `{ meeting_type, date, source_url }`. Refresh annually (December for next year) plus on any announced extraordinary meeting.
- **Confirmed approach** per CONTEXT — no investigation needed beyond confirming there's no API.

### EIA Weekly Petroleum Status Report

- **Provider:** EIA. Predictable cadence: **every Wednesday at 10:30 ET** (some weeks delayed one day for federal holidays — EIA publishes a yearly schedule).
- **Recommendation:** **deterministic cron-style generator** — given today's date, compute the upcoming Wednesdays in the next 60 days. Bake a small holiday-shift table for known US federal holidays (8-10 dates a year) so the offsets land correctly.
- **No auth required.** The actual report data is also available via EIA's free API (`/api/weekly/petroleum/status`) but we don't need the *data* for the calendar layer — just the scheduled *event* slot. The data lands in news via the EIA RSS feed if we want to add it later.
- **Refresh cadence:** the generator runs on every calendar tick; no API call needed for the scheduling itself.

### Treasury Auctions (10-yr, 30-yr; 2-yr/5-yr if useful)

- **Provider:** US Treasury Fiscal Data API (`fiscaldata.treasury.gov`). **No auth required.**
- **Endpoint:** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions` (path inferred from the API pattern; the dataset page confirms it lives under v1/accounting/od/. **Planner: spike this endpoint with curl on the first task to confirm exact path before locking it into code.** If the exact path differs, fall back to the slightly-stale `/v2/accounting/od/auctions_query` which has historical + recent dates.)
- **Response shape:** auction_date, announcement_date, issue_date, security_type, security_term, etc.
- **Filter:** keep `security_type IN ("Note", "Bond")` and `security_term IN ("10-Year", "20-Year", "30-Year")` (the long end is the rate-sensitive one operators care about). Optionally also bills (4-week, 8-week) but those are noisier.
- **Refresh cadence:** weekly is fine — Treasury publishes the schedule weeks in advance.

### Calendar event canonical shape (locked across all sources)

```typescript
interface CalendarEvent {
  id: string;                          // e.g. "fomc-2026-06-18"
  type: "fomc" | "cpi" | "nfp" | "pce" | "retail_sales" | "jolts" | "gdp" | "ism" | "earnings" | "fda_pdufa" | "opec" | "eia_petroleum" | "treasury_auction";
  // For ticker-bound events (earnings, FDA, single-name catalysts):
  tickers: string[];                   // empty for macro events
  // For broad macro events that affect a sector:
  affectedSectors?: string[];          // e.g. ["XLE", "USO"] for OPEC
  expectedDate: string;                // ISO YYYY-MM-DD (release date) or full ISO if time matters
  expectedTimeEt?: string;             // "08:30", "10:30", "14:00" for FOMC release — null when unknown
  magnitudePrior: 1 | 2 | 3 | 4 | 5;   // pre-news estimate; refined by article scoring
  direction: "up" | "down" | "uncertain" | "binary";
  confidence: number;                  // [0,1] — starts low, grows as scored news arrives
  source: `calendar:${string}`;        // "calendar:fred", "calendar:finnhub-earnings", "calendar:eia-cron", etc.
  sourceMeta?: Record<string, unknown>; // release_id, symbol, etc.
  firstSeenAt: string;                 // ISO
  lastRefinedAt?: string;              // updated whenever an article references this event
  archived?: boolean;                  // true once expectedDate < now
}
```

This is the same shape as emerging catalysts produced by the per-article scorer, with `source: "article:<article_id>"` for those. Single stream, single query surface for M2-05.

## Theme Discovery + Review UX

### Three options evaluated

1. **CLI-only** (`intel themes review`): operator runs the command, sees a list of candidate themes with their week-over-week mention count + sample headlines, picks accept/alias/reject inline.
2. **Telegram-only** (inline-keyboard digest): bot sends "5 new themes this week" message with `Accept` / `Reject` / `Alias` inline buttons per theme. Requires a webhook listener (or long-polling) — neither of which we run today.
3. **Hybrid:** Telegram surfaces the digest (read-only, "go run `intel themes review` to action"); CLI does the actioning.

### Recommendation: CLI-first, with a Telegram nudge

- Telegram inline-keyboard callback handling requires either a webhook server (we'd need to expose a public URL — Cloudflare tunnel or similar) or a long-polling `getUpdates` worker. **Neither is in place today**; the current `TelegramService` is send-only via `bot/sendMessage`.
- A CLI command takes 30 minutes to build, fits perfectly with the existing `intel-commands.ts` pattern (see `intel polymarket`, `intel news`, `intel run-once`), and works synchronously with the operator at their terminal.
- For the Telegram nudge: the existing scheduled-digest mechanism (8:30 ET morning brief) can include a one-liner "🔖 3 themes pending review — run `intel themes review`" footer. Zero new infrastructure.

### Command shape to plan against

```
$ intel themes review
Found 7 candidate themes from the past 7 days (≥5 mentions, not yet canonical):

[1] stargate-buildout      14 mentions  •  tickers: NVDA, AMD, AVGO, GOOGL
    Sample: "OpenAI's Stargate site adds 3GW of capacity..." (CNBC, 2 days ago)
    Sample: "Microsoft pushes back on Stargate energy claims..." (Reuters, 4 days ago)
    [a]ccept  [r]eject  [l]ias to existing (type theme name)  [s]kip
> a

[2] tariff-china-q3        9 mentions  •  tickers: AAPL, NKE, BABA
    Sample: ...
    > l china-decoupling

[3] ...
```

Persist accepted themes to `config/themes.json` immediately. Persist rejected/aliased to `config/themes-rejected.json` so they don't re-surface next week.

### Discovery mechanics

- Per-article scorer writes proposed themes to `data/intel/themes-proposed-YYYY-MM-DD.jsonl` (one row per (theme × article × ticker)).
- A weekly aggregator (`themes:tally` or invoked lazily by the review CLI) reads the last 7 days, counts unique articles per proposed theme, filters to `≥5` mentions and not in `config/themes.json` and not in `config/themes-rejected.json`.

## Digest Delivery Integration

### Where to hook in

- **Trigger location:** new method on `IntelScheduler`, called from inside the heartbeat. After the existing `cycleInProgress` check but on a separate "are we due for a digest" gate.
- **Schedule check:** compute current ET hour/minute. If we're within ±1 minute of 8:30 / 12:30 / 15:30 ET AND the corresponding `digestSlotsFired.<slot>` flag is false for today, build + send the digest, then set the flag to true. Reset all flags at ET midnight (existing `alert-cooldown.json` already has ET-day rollover logic — reuse it).
- **Break-glass slot:** evaluated inside `runCycle()` after correlation. Trigger conditions (CONTEXT-locked): `|pmMovePp| ≥ 15` OR `llmCriticality ≥ 0.9` OR `referenced_calendar_events` contains a same-day FOMC/CPI/NFP event with `direction != "uncertain"` at high confidence. If triggered AND `digestSlotsFired.breakGlass === false`, send and flip the flag.

### Interaction with existing cooldown logic

- **Keep them separate.** Per-market cooldown is a market-event-level concern (don't re-alert on the same market within 4h). Digest is a curated top-N over a window — different semantics, different state.
- The current `alertPriority()` function (line 62 of `intelligence-alerter.ts`) already returns `+Infinity` for `DAILY_DIGEST` kinds, so the existing dispatch loop will not be confused by a mixed batch.
- **Daily-cap counter:** the current `sentCount >= dailyCapLimit` check fires equally for digests and confirmed/divergence alerts. In the M2-04 model, digests should **not** count against the cap (they fire on a schedule, not from cycle output). Add a `dailyCapAppliesTo` filter — only `HEADLINE_PM_CONFIRMED | HEADLINE_PM_DIVERGENCE` increment `sentCount`. The break-glass slot has its own bool, so it also doesn't burn the cap.

### Recommendation: replace the bare cap, keep a hard backstop

- Replace `dailyCapLimit: 4` semantics: from "any kind of Telegram send counts" to "non-scheduled alerts count." Scheduled digests + break-glass have their own bools.
- Keep a **hard absolute backstop** of N total sends/day (recommend 8 = 3 digests + 1 break-glass + up to 4 cooldown-overridden alerts in extreme cases). Protects against runaway bug-driven floods.
- The existing `suppressed: true` audit log behavior stays unchanged — M2-04's scorer + M2-05's strategy engine both consume the persisted-but-not-sent alerts.

### Digest content (what the builder produces)

Per CONTEXT: each digest contains "the top 1-2 stories from the elapsed window plus what's on the next 24h calendar." Concrete fields:

```typescript
interface DigestPayload {
  flavor: "MORNING" | "MIDDAY" | "CLOSE";
  topStories: Array<{
    headline: string;
    publisher: string;
    tickers: string[];
    sentiment: number;        // from the per-article scorer
    materiality: number;
    rationale: string;        // 1-2 sentence summary
    url: string;
  }>;
  upcomingCalendar: Array<{
    eventType: string;
    label: string;
    expectedDate: string;     // human-readable: "Today 14:00 ET" or "Tomorrow 08:30 ET"
    magnitudePrior: number;
    affectedTickers: string[];
  }>;
  pmMovers?: Array<{          // optional, MIDDAY/CLOSE digests only
    question: string;
    movePp: number;
    volume24hr: number;
  }>;
}
```

The builder lives in `src/market-intelligence/alerts/digest-builder.ts` (new file). It reads the day's `scored-articles-*.jsonl`, today's `catalyst-flags-*.jsonl` (filtered to next 24h), and the recent `polymarket-snapshots-*.jsonl` to populate the three sections.

## PM-to-Ticker Mapping Schema

### Join key

`MarketSnapshot.slug` (e.g. `"will-the-iran-ceasefire-continue-through-may-24-733"`) is the per-market identifier and changes when Polymarket creates a fresh weekly/monthly version. `MarketSnapshot.eventSlug` (e.g. `"iran-ceasefire-continues-through"`) is the **stable per-theme identifier** across versions. **Use `eventSlug` as the primary join key**, with `slug` as a fallback for one-off non-event markets.

### Recommended JSON schema (`config/pm-market-mappings.json`)

```json
{
  "$schema": "./pm-market-mappings.schema.json",
  "version": 1,
  "lastUpdated": "2026-05-31",
  "mappings": [
    {
      "match": {
        "eventSlug": "iran-ceasefire-continues-through",
        "slugPrefix": null,
        "questionContains": null
      },
      "tickers": [
        { "ticker": "XLE", "direction": "long",  "weight": 1.0 },
        { "ticker": "USO", "direction": "long",  "weight": 1.0 },
        { "ticker": "LMT", "direction": "long",  "weight": 0.6 },
        { "ticker": "RTX", "direction": "long",  "weight": 0.6 },
        { "ticker": "JETS","direction": "short", "weight": 0.5 }
      ],
      "interpretation": "noPp" ,
      "rationale": "Yes resolves = ceasefire continues = bearish energy / defense / bullish airlines. Treat a fall in Yes price (no = no-ceasefire = war risk back) as bullish for the long-direction tickers.",
      "addedBy": "manual-seed",
      "addedAt": "2026-05-31"
    },
    {
      "match": { "slugPrefix": "will-bitcoin-reach-", "eventSlug": null, "questionContains": null },
      "tickers": [
        { "ticker": "COIN", "direction": "long", "weight": 0.8 },
        { "ticker": "MSTR", "direction": "long", "weight": 1.0 },
        { "ticker": "IBIT", "direction": "long", "weight": 1.0 }
      ],
      "interpretation": "yesPp",
      "rationale": "Yes price rising = BTC strength = bullish all three"
    },
    {
      "match": { "slugPrefix": "fed-decision-in-", "eventSlug": null, "questionContains": "rate cut" },
      "tickers": [
        { "ticker": "TLT", "direction": "long",  "weight": 1.0 },
        { "ticker": "IEF", "direction": "long",  "weight": 0.7 },
        { "ticker": "XLF", "direction": "short", "weight": 0.5 },
        { "ticker": "IWM", "direction": "long",  "weight": 0.6 }
      ],
      "interpretation": "yesPp",
      "rationale": "Higher Yes price for rate cut = bullish duration"
    }
  ],
  "proposed": []
}
```

### Match semantics

- A market matches a mapping if **all non-null `match.*` fields match**. Multiple fields = AND.
- `slugPrefix` does case-insensitive prefix match on `MarketSnapshot.slug`.
- `eventSlug` does exact match.
- `questionContains` does case-insensitive substring match on `MarketSnapshot.question`.
- A market may match **multiple** mappings; apply all of them.
- `interpretation`:
  - `"yesPp"` — pass `oneHourPriceChange * 100 * direction_sign * weight` straight through to the rollup signal.
  - `"noPp"` — invert: the more Yes *drops*, the stronger the long-direction signal. Encodes "the bullish-for-ticker scenario is *not Yes*" without forcing the operator to flip every direction field manually.

### LLM fallback flow

For unmatched markets (no mapping hit), the per-article scorer also receives the PM snapshot context (the existing prompt already does this for the correlator). It proposes ticker affiliations in a `proposed_pm_mappings` field. These accumulate in `data/intel/pm-mappings-proposed-YYYY-MM-DD.jsonl` and surface in the same weekly review CLI (alongside themes): `intel pm-mappings review`.

### Companion file: `config/macro-tickers.json`

```json
{
  "version": 1,
  "tickers": [
    { "ticker": "XLE",  "sector": "Energy"     },
    { "ticker": "XLF",  "sector": "Financials" },
    { "ticker": "XLK",  "sector": "Technology" },
    { "ticker": "XLV",  "sector": "Healthcare" },
    { "ticker": "XLI",  "sector": "Industrials"},
    { "ticker": "XLU",  "sector": "Utilities"  },
    { "ticker": "XLY",  "sector": "Consumer Discretionary" },
    { "ticker": "XLP",  "sector": "Consumer Staples"       },
    { "ticker": "XLB",  "sector": "Materials"  },
    { "ticker": "XLRE", "sector": "Real Estate"},
    { "ticker": "XLC",  "sector": "Comm Services" },
    { "ticker": "GLD",  "sector": "Gold"       },
    { "ticker": "SLV",  "sector": "Silver"     },
    { "ticker": "TLT",  "sector": "Long Treasuries"  },
    { "ticker": "IEF",  "sector": "Mid Treasuries"   },
    { "ticker": "USO",  "sector": "Oil"        },
    { "ticker": "UNG",  "sector": "Natural Gas"},
    { "ticker": "BITO", "sector": "BTC Futures"},
    { "ticker": "IBIT", "sector": "Spot BTC"   },
    { "ticker": "JETS", "sector": "Airlines"   },
    { "ticker": "IWM",  "sector": "Small Cap"  },
    { "ticker": "QQQ",  "sector": "Nasdaq"     },
    { "ticker": "SPY",  "sector": "S&P 500"    },
    { "ticker": "VIXY", "sector": "VIX (note: VIX itself is not tradable)" }
  ]
}
```

Note: `VIX` is an index, not a ticker. Use `VIXY` or `UVXY` as the tradable proxy. Same applies to `^TNX` — use `TLT`/`IEF`.

## Concrete Pitfalls

### 1. Concurrent LLM calls saturate GPU

- **Risk:** Eager Promise.all over articles will issue 30+ parallel calls to LM Studio, all of which queue and most of which time out (60s default).
- **Mitigation:** strictly sequential scoring with `for...of` + `await`. Document in the scorer module. Add a `concurrency: number = 1` option but default it to 1.

### 2. Theme drift across LLM calls

- **Risk:** Qwen 3 calls the same concept "fed-cut", "rate-cut", "rate-cuts", "fed-rate-cuts" across articles.
- **Mitigation (primary):** inject the canonical theme enum into every prompt as the preferred vocabulary. The system prompt enforces lowercase-kebab-case.
- **Mitigation (secondary):** canonicalize themes on persist (`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")`). Persist both raw and canonical so the weekly review can show drift patterns.
- **Mitigation (tertiary):** the weekly review CLI's `alias` action maps n drift variants to one canonical, eliminating future false-positive new-theme noise.

### 3. Stability test threshold

- **Risk:** CONTEXT requires "same 7-day window scored twice → results stable" but doesn't define stable.
- **Empirical target:** Qwen 3 at temperature 0.2 (existing setting) typically produces sentiment deltas <0.05 on identical inputs ~80% of the time, <0.15 ~95% of the time. **Recommendation: stability acceptance = 95th-percentile per-article sentiment delta ≤ 0.15 AND 95th-percentile per-ticker-day rollup sentiment delta ≤ 0.08**. The rollup is tighter because materiality-weighted aggregation suppresses single-article noise.
- **Implementation:** `intel stability-test --days 7` reads `scored-articles-*.jsonl` for the window, re-scores each article via the same LLM module, computes deltas, prints percentiles + pass/fail.

### 4. Calendar lifecycle

- **Auto-archive trigger:** at the end of every cycle, scan catalyst-flag stream for entries where `expectedDate + 1 day < now` AND `archived !== true`; set `archived: true`. Don't delete — backtests need them.
- **Magnitude refinement convergence:** when multiple articles in one cycle refine the same calendar event, take the highest-confidence article's `direction` (break ties by latest `publishedAt`); set `magnitudePrior = max(prior, article-proposed magnitude)`; set `confidence = min(1.0, prior_confidence + 0.1 * article.materiality)`.

### 5. Backlog drain ordering

- **Risk:** when LLM recovers from a 1-hour outage, draining 100+ backlogged articles before scoring the current cycle's new arrivals delays the freshest signal.
- **Mitigation:** drain backlog **last** in each cycle. Score new arrivals first (they're the actionable signal); backlog gets the leftover budget. Cap backlog drain at e.g. 50 articles per cycle to avoid starving the next cycle.
- **Visibility:** `scheduler-state.json` should gain `backlogSize: number` + `backlogOldestAt: string`. Operator-visible.

### 6. PM mapping false positives

- **Risk:** A broad `slugPrefix: "iran-"` will match unrelated Iran-themed markets (e.g. World Cup standings). Polymarket does occasionally publish sports markets that mention countries.
- **Mitigation:** apply the same `EXCLUSION_KEYWORDS` regex (sports/entertainment list in `relevance-filter.ts` lines 113-150) to a market before consulting the mapping table. If the market's question contains an exclusion keyword, skip the mapping pass entirely.

### 7. Concurrent JSONL writes

- **Risk (low):** if we ever split scoring into a worker process, two writers on the same date file would interleave lines.
- **Mitigation:** JsonlStore is single-process safe today (one scheduler process). If we later add a worker, switch to `fs.open` + `O_APPEND` per write or introduce a write queue. **Out of scope for M2-04; document the constraint in the scorer's module-level comment.**

### 8. Calendar API outages

- **Risk:** FRED has had partial outages during US government shutdowns; Treasury Fiscal Data has had maintenance windows.
- **Mitigation:** calendar refresh is best-effort. If a fetch fails, log a warning, do NOT clear existing future events. Next successful fetch reconciles. The catalyst stream is append-only with `lastRefinedAt` so duplicates from re-fetch are dedupable by `id`.

## Recommended Task Decomposition

The planner should structure this into ~10 tasks across 4 waves. The dependency graph below shows what can run in parallel.

### Wave 1 — Foundations & seed data (all parallelizable)

1. **TASK-01: Config files + Zod schema additions.**
   - Create `config/themes.json` (seed with ~20 starter canonical themes from `relevance-filter.ts` keyword topics).
   - Create `config/themes-rejected.json` (empty).
   - Create `config/macro-tickers.json` (the 24 tickers from CONTEXT, formatted above).
   - Create `config/pm-market-mappings.json` (seed with the 3 example mappings: Iran, Bitcoin, Fed).
   - Create `config/fda-pdufa-seed.json` (empty array initially).
   - Create `config/opec-schedule-seed.json` (empty array initially; operator fills after task ships).
   - Extend `ConfigSchema` in `src/config/secure-config.ts` to add `apis.fred?: z.string().optional()`.
   - Touchpoints: net-new files + 1-line Zod diff.

2. **TASK-02: Types module for M2-04.** Create `src/market-intelligence/signal/types.ts` with `ScoredArticle`, `TickerDaySummary`, `CalendarEvent`, `CatalystFlag`, `ThemeCandidate`, `PmMapping`, `PmMappingProposal`. Document each field with TSDoc. No behavior, just types — unblocks parallel work in Wave 2.

### Wave 2 — Core building blocks (all parallelizable, all depend on Wave 1)

3. **TASK-03: `ArticleScorer` module.** `src/market-intelligence/signal/article-scorer.ts`. Constructor mirrors `LlmCorrelator`. `scoreArticle(article, context: { themes, upcomingEvents, tickerUniverse }): Promise<ScoredArticle[]>` (array because of (article × ticker) fanout). Includes prompt builder, response parser, sequential semaphore (concurrency=1). Persists to `scored-articles-YYYY-MM-DD.jsonl`. On LLM failure, throws — caller queues the article. Unit tests against a fake OpenAI client that returns canned JSON.

4. **TASK-04: `ScoreBacklog` queue.** `src/market-intelligence/signal/score-backlog.ts`. Methods: `enqueue(article)`, `drain(scorer, maxN=50): Promise<{ scored: number, failed: number, oldestAgeMs: number }>`. Persists to `data/intel/score-backlog.jsonl` (single rolling file, not date-rotated, because backlog is ephemeral). On successful score, removes the entry.

5. **TASK-05: Calendar fetchers (5 parallel sub-tasks).**
   - 5a: `FredCalendarFetcher` — `fetchUpcoming(days=60): Promise<CalendarEvent[]>`. Static release_id table.
   - 5b: `FinnhubEarningsCalendarFetcher` — uses existing Finnhub key.
   - 5c: `TreasuryAuctionCalendarFetcher` — Fiscal Data API; spike the exact endpoint path first.
   - 5d: `EiaCalendarGenerator` — deterministic Wednesday generator + holiday-shift table.
   - 5e: `SeedFileCalendarLoader` — loads `config/fda-pdufa-seed.json` + `config/opec-schedule-seed.json`.
   - All five emit the same `CalendarEvent` shape, persisted to `catalyst-flags-YYYY-MM-DD.jsonl` (same stream the article scorer's emerging catalysts go into).

6. **TASK-06: `PmMappingEngine`.** `src/market-intelligence/signal/pm-mapping-engine.ts`. Loads `config/pm-market-mappings.json`. `mapMarket(snapshot): { tickerSignals: Array<{ ticker, direction, weight, contributedPp }> } | { unmatched: true }`. Applies exclusion keyword filter from `relevance-filter.ts`. For unmatched, writes a row to `data/intel/pm-mappings-proposed-YYYY-MM-DD.jsonl` for weekly review.

### Wave 3 — Aggregation + delivery (depend on Wave 2)

7. **TASK-07: `RollupBuilder`.** `src/market-intelligence/signal/rollup-builder.ts`. `buildForDay(date): Promise<TickerDaySummary[]>`. Reads `scored-articles-*.jsonl`, applies materiality-weighted aggregation per (ticker × day), joins active `catalyst-flags-*.jsonl` for the same ticker, joins PM-mapped signals from today's `polymarket-snapshots-*.jsonl`. Persists to `ticker-day-summary-YYYY-MM-DD.jsonl`. Idempotent (rewrites today's file on each call). Called at end of each cycle.

8. **TASK-08: `DigestBuilder` + scheduler integration.**
   - `src/market-intelligence/alerts/digest-builder.ts` — builds the `DigestPayload` for a given flavor.
   - `IntelScheduler` extension: add a separate `digestHeartbeat()` (or interleave in the existing one) that checks ET-time-of-day and fires the morning/midday/close digests.
   - `IntelligenceAlerter` extension: extend `DigestAlert` flavor union, extend the cooldown state file with `digestSlotsFired`, change `sentCount` so digests don't burn it, add break-glass slot logic.
   - Update `formatMessage` in `TelegramService` to render `DigestPayload` (the existing handler just renders `alert.message`, so the digest builder should produce pre-formatted Markdown — same pattern as the existing alert formatters).

9. **TASK-09: `runCycle` integration.** Modify `src/market-intelligence/scheduler/cycle-runner.ts` to insert:
   - Step 3.5: instantiate `ArticleScorer`, score new articles (deprioritized past 500/day soft cap by checking topic match), persist results; on LLM failure, push to `ScoreBacklog`; at end-of-step, drain up to 50 backlog items.
   - Step 3.6: refine catalyst flags from `referenced_calendar_events` in the new scores.
   - Step 3.7: call `RollupBuilder.buildForDay(today)`.
   - Step 3.8: evaluate break-glass conditions and fire if triggered + not yet used today.
   - Also add a daily calendar-refresh step (only runs if `last_calendar_refresh_at` is >24h old).

### Wave 4 — Operator UX & validation (depend on Waves 2-3)

10. **TASK-10: CLI commands.**
    - `intel themes review` — interactive accept/alias/reject loop, persists to `config/themes.json`.
    - `intel pm-mappings review` — same UX for proposed PM mappings.
    - `intel calendar refresh` — one-shot manual refresh.
    - `intel calendar list --days 14` — print upcoming events sorted by date.
    - `intel rollup today --ticker NVDA` — print today's rollup for a ticker (debugging surface).
    - `intel stability-test --days 7` — runs the stability suite, prints percentiles and pass/fail.
    - `intel scorer ping` — same as `ping-llm` but specific to scorer (validates it can score a test article).

### Wave parallelism summary

```
Wave 1 (parallel):        TASK-01, TASK-02
                              │
Wave 2 (parallel):        TASK-03, TASK-04, TASK-05a-e, TASK-06
                              │
Wave 3 (sequential):      TASK-07 → TASK-08 → TASK-09
                              │
Wave 4 (parallel):        TASK-10 (all subcommands)
```

Wave 3 has internal sequencing because:
- TASK-08 needs the rollup format from TASK-07 to render the morning brief's "top stories"
- TASK-09 wires everything together and depends on both

Wave 2 calendar fetchers (5a-e) are fully independent of each other and can be spread across 5 subtasks for parallel execution.

### Effort estimate (rough)

Single-developer assistant pace:
- Wave 1: ~30 min (mostly file scaffolding + a Zod diff)
- Wave 2: ~3-4 hours (ArticleScorer is the bulk; calendar fetchers are ~30 min each with the Finnhub API already in-repo)
- Wave 3: ~2-3 hours (digest builder + scheduler hooks have nuanced state)
- Wave 4: ~1.5 hours

Total: **~8-10 focused hours** assuming the planner can issue Wave 2 fetchers in parallel.

## Sources

### Primary (HIGH confidence — code read in tree, today)
- `src/market-intelligence/correlator/llm-correlator.ts` (LM Studio call surface, prompt patterns)
- `src/market-intelligence/correlator/cost-tracker.ts` (LLM accounting)
- `src/market-intelligence/news/news-poller.ts`, `macro-news-poller.ts`, `types.ts` (article shapes + Finnhub call)
- `src/market-intelligence/polymarket/polymarket-client.ts`, `types.ts`, `relevance-filter.ts` (PM shapes + topic keywords)
- `src/market-intelligence/alerts/intelligence-alerter.ts`, `types.ts` (cooldown + cap + audit log)
- `src/market-intelligence/scheduler/intel-scheduler.ts`, `cycle-runner.ts` (heartbeat + cycle orchestration)
- `src/market-intelligence/storage/jsonl-store.ts` (persistence primitive)
- `src/market-intelligence/cli/intel-commands.ts` (CLI patterns to extend)
- `src/notifications/telegram-service.ts` (Telegram dispatch surface)
- `src/config/secure-config.ts` (Zod config schema to extend)
- `data/intel/scheduler-state.json`, `alert-cooldown.json`, sample JSONL rows (live production data shape)
- `.planning/phases/10-llm-trade-signal/10-CONTEXT.md` (locked decisions)

### Secondary (MEDIUM confidence — official docs)
- [FRED API releases/dates endpoint](https://fred.stlouisfed.org/docs/api/fred/releases_dates.html)
- [FRED API release/dates endpoint](https://fred.stlouisfed.org/docs/api/fred/release_dates.html)
- [FRED Economic Release Calendar](https://fred.stlouisfed.org/releases/calendar)
- [Finnhub earnings calendar API](https://finnhub.io/docs/api/earnings-calendar)
- [US Treasury Fiscal Data API docs](https://fiscaldata.treasury.gov/api-documentation/)
- [Treasury Securities Upcoming Auctions dataset](https://fiscaldata.treasury.gov/datasets/upcoming-auctions/)
- [TreasuryDirect upcoming auctions](https://www.treasurydirect.gov/auctions/upcoming/)
- [EIA Weekly Petroleum Status Report schedule](https://www.eia.gov/petroleum/supply/weekly/schedule.php)
- [Telegram Bot API: inline keyboards](https://core.telegram.org/api/bots/buttons)

### Tertiary (LOW confidence — community sources, treat as directional)
- [Qwen Speed Benchmarks](https://qwen.readthedocs.io/en/latest/getting_started/speed_benchmark.html) (informed throughput estimate)
- [Small LLM Performance Benchmark — AscentCore 2026](https://ascentcore.com/2026/04/01/small-llm-performance-benchmark/)
- FDA PDUFA calendar aggregators ([BioPharmCatalyst](https://www.biopharmcatalyst.com/calendars/pdufa-calendar), [BPIQ](https://app.bpiq.com/pdufa-calendar), [MarketBeat](https://www.marketbeat.com/fda-calendar/upcoming/)) — confirmed no clean free API, manual seed is right approach

## Metadata

**Confidence breakdown:**
- M2-03 substrate: HIGH (code read end-to-end + live data verified)
- LM Studio surface: HIGH (existing code is in production)
- Calendar feasibility — FRED, Finnhub, Treasury, EIA: HIGH (official docs + no-auth or already-have-key)
- Calendar feasibility — FDA PDUFA, OPEC: HIGH on the negative claim (no clean free API → manual seed)
- Throughput estimates: MEDIUM (public benchmarks + our own observed cycle durations; not measured on the production GPU specifically)
- Prompt structure recommendation: MEDIUM (extrapolated from existing working `LlmCorrelator` patterns + JSON-mode quirks; needs the first run to validate)
- Theme stability threshold (0.15 / 0.08): LOW (empirical target — to be validated by TASK-10's stability test, may be tightened or loosened)
- Treasury Fiscal Data exact endpoint path: LOW — planner should spike with curl in TASK-05c before locking the URL into code

**Research date:** 2026-05-31
**Valid until:** ~2026-06-30 (30 days — substrate is stable; external API contracts unlikely to shift quickly)

## RESEARCH COMPLETE
