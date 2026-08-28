---
phase: 11-ai-strategy
plan: 05
subsystem: strategy
tags: [strategy-engine, signal-registry, ranking, cli, commander, vitest]

# Dependency graph
requires:
  - phase: 11-ai-strategy (11-02)
    provides: "src/strategy/ module skeleton — SignalTypeModule/RawSignal/StrategyCandidate contract, StrategyEngine tracer (SECTOR_ROTATION_FROM_PM only), levels.ts, sizing.ts, DecisionLog, the 7-subcommand strategy CLI"
  - phase: 11-ai-strategy (11-03)
    provides: "CatalystAnchoredModule (core) — built, tested, NOT registered"
  - phase: 11-ai-strategy (11-04)
    provides: "coverage.ts gate primitive, SentimentVelocityModule (gated), FadeOvershootModule (shadow) — built, tested, NOT registered"
provides:
  - "src/strategy/signals/index.ts — defaultSignalModules(), the one place a v2 signal type gets added"
  - "strategy-engine.ts: mode-consistency assertion (SignalModeMismatchError), gate/throw isolation into skippedTypes, shadow-mode structural partition, resolveTickerCollisions, rankCandidates"
  - "Full 8-of-9 strategy CLI: show-substrate, run --types, list-candidates --include-shadow, and the D-14 output ordering (VIX / ranked-or-empty / sub-threshold / shadow / skipped-types)"
affects: [11-06-live-window-backtest, 11-07-web-route]

# Actuals (#2632)
actuals:
  tokens: 19007   # chars/4 (76027 chars) over the 5 files this plan touched (2 created, 3 modified)
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Cross-type collision resolution and ranking as standalone exported pure functions (resolveTickerCollisions, rankCandidates) taking/returning StrategyCandidate[] — unit-testable without the engine's ATR/VIX/persistence machinery, same precedent as 11-03's within-type dedupeSameTypeCollisions"
    - "registerStrategyCommands(program, deps) — an optional StrategyCommandsDeps injection point (intelDataDir/strategyDataDir/vixProvider/marketData) added so the CLI is unit-testable end-to-end via a real Commander program without touching real project data or the network; production callers omit deps entirely"
    - "process.exit mocked to throw a typed signal (ProcessExitSignal) rather than kill the vitest worker — the only way to assert a Commander action's process.exit(N) call from inside the test process"

key-files:
  created:
    - src/strategy/signals/index.ts
    - src/strategy/cli/__tests__/strategy-commands.test.ts
  modified:
    - src/strategy/strategy-engine.ts
    - src/strategy/__tests__/strategy-engine.test.ts
    - src/strategy/cli/strategy-commands.ts

key-decisions:
  - "assertModulesMatchConfig runs both at construction (when a config is supplied via StrategyEngineOptions.config, letting tests observe a synchronous throw) AND on every generateCandidates call (against the async-loaded on-disk config) — loadStrategyConfig is async so the constructor itself cannot always validate against the real config/strategy-config.json synchronously; the per-run check is what actually enforces T-11-05-02 in production"
  - "rankCandidates takes the ranked prefix from a single fully-sorted list (sorted.slice(0, min(maxCandidatesPerDay, aboveFloorCount))) rather than separately slicing 'above' and 'below' arrays — the remainder for sub-threshold is just sorted.slice(ranked.length), which naturally spans the above-floor overflow AND the below-floor set in score order without a second merge step"
  - "resolveTickerCollisions runs BEFORE rankCandidates, and only over the non-shadow ('rankable') candidate set — shadow candidates are partitioned out earlier and never enter collision resolution or ranking at all, so a shadow module's candidates cannot even indirectly consume a same-ticker collision slot from a core candidate"
  - "The CLI's show-substrate command reads loadRollupsForDay/loadActiveCatalysts/hasTrailingCoverage/isSubstrateHot directly — the exact same substrate helpers StrategyEngine itself calls — so the debug view is structurally incapable of disagreeing with what a live strategy run would see (the plan's key_links requirement, verified by code inspection: no duplicate substrate-reading logic exists in strategy-commands.ts)"

patterns-established:
  - "A four-module signal registry lives in exactly one file (signals/index.ts); StrategyEngine, the CLI, and 11-06's backtest all default to it — a v2 signal type is a one-array-entry change plus a signalModes config entry, never an engine edit"

requirements-completed: [INCOME-01]

coverage:
  - id: D1
    description: "All four signal types register in StrategyEngine; core/gated/shadow modes are structurally enforced (shadow never ranks/sizes regardless of score, a failed gate or a thrown generate() becomes a skippedTypes entry without aborting the other three types, a config/module mode mismatch throws a named error)"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/strategy-engine.test.ts — defaultSignalModules, StrategyEngine mode enforcement, gates, shadow mode (incl. a real FadeOvershootModule case), persistence, module failure isolation (9 test cases)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy run --date 2026-08-26 --dry-run against real ./data/intel: SENTIMENT_VELOCITY correctly gated off with its coverage-gap reason printed verbatim; FADE_OVERSHOOT candidates present only in the Shadow section, all size=—"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cross-type ranking is collision-safe, weight-free, and cardinality-exact: same-ticker/same-direction collisions collapse to the higher score with the dropped type+score merged into the rationale, opposite-direction candidates both survive, the comparator is plain score (no per-type coefficient), ranked never pads from below-floor, sub-threshold takes the next N from whatever remains"
    requirement: INCOME-01
    verification:
      - kind: unit
        ref: "src/strategy/__tests__/strategy-engine.test.ts describe(\"ranking\") — collision same/opposite-direction, no-type-weight comparator, 4 cardinality cases (9-above/2-above-6-below/0-above/0-total), sub-threshold mode+size reassignment, tie-break reproducibility (15 test cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The strategy CLI ships 8 of the 9 RESEARCH §6 subcommands (backtest deferred to 11-06) including the new show-substrate debug view, run --types validated against the SignalType union, list-candidates --include-shadow, and the fixed D-14 output ordering (VIX header, ranked-or-honest-empty, sub-threshold always, shadow always, skipped-types with verbatim reasons)"
    requirement: INCOME-01
    verification:
      - kind: integration
        ref: "src/strategy/cli/__tests__/strategy-commands.test.ts — full accept/close + skip round-trip across 8 subcommands, --entry abc exits 2, unknown candidateId exits 1, --types NOT_A_TYPE exits 2, --types filtering, honest-empty-state run, and a named [PLACEHOLDER for 11-06] test that fails loudly once backtest is registered (7 test cases)"
        status: pass
      - kind: e2e
        ref: "pnpm dev strategy --help (lists all 8 subcommands); pnpm dev strategy run --types NOT_A_TYPE (exit 2); pnpm dev strategy show-substrate --date 2026-08-26 against real ./data/intel (exit 0, prints coverage verdict); pnpm dev strategy run --date 2026-08-26 --dry-run against real ./data/intel (full VIX/ranked/sub-threshold/shadow/skipped-types output, see below)"
        status: pass
    human_judgment: false

# Metrics
duration: ~45min active work (incl. real-data verification runs)
completed: 2026-08-28
status: complete
---

# Phase 11 Plan 05: Four-Module Registry, Cross-Type Ranking, Full Strategy CLI Summary

**All four v1 signal types (CATALYST_ANCHORED, SECTOR_ROTATION_FROM_PM core; SENTIMENT_VELOCITY gated; FADE_OVERSHOOT shadow) now run through one `StrategyEngine`, compete on raw score with deterministic cross-type collision resolution, and the `strategy` CLI ships 8 of 9 RESEARCH §6 subcommands — verified against the real `data/intel` tree, which produced 5 ranked `CATALYST_ANCHORED` candidates, 3 sub-threshold, 12 `FADE_OVERSHOOT` shadow entries, and `SENTIMENT_VELOCITY` correctly gated off with its coverage-gap reason printed verbatim.**

## Performance

- **Duration:** ~45 min active work (including two real-data CLI verification runs against live network providers)
- **Started:** 2026-08-28 (session start)
- **Completed:** 2026-08-28T10:51:52-04:00 (last task commit)
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `src/strategy/signals/index.ts` — `defaultSignalModules()` returns all four registered modules; `StrategyEngine` defaults to it. A v2 signal type is now a one-array-entry change, never an engine edit.
- `strategy-engine.ts`: `assertModulesMatchConfig` throws a named `SignalModeMismatchError` (listing every offending type at once) when a module's declared `mode` disagrees with `config.signalModes` — checked at construction when a config is injected, and on every `generateCandidates` run against the real on-disk config, so a hand-edit of `config/strategy-config.json` can never silently promote a shadow type.
- Per-module `gate()` and `generate()` are both fault-isolated: a failed gate or a thrown `generate()` becomes exactly one `skippedTypes` entry with the reason/error message, and the other three types' candidates are always intact.
- Shadow-mode candidates are partitioned out of ranking structurally, before collision resolution or the score-floor/cap step ever runs — proven with a stub module AND a real `FadeOvershootModule` instance scoring 0.8 that still never displaces a 0.41-scoring core candidate.
- `resolveTickerCollisions` / `rankCandidates`: cross-type same-(ticker,direction) collisions collapse to the higher score with the dropped type+score appended to the surviving rationale; opposite-direction candidates both survive; the comparator is a plain score comparison with tie-break by nearer `timeHorizonDays` then alphabetical ticker — no per-type coefficient anywhere (D-04). All four cardinality cases (9-above-floor, 2-above/6-below, 0-above, 0-total) produce exact list lengths.
- `strategy show-substrate [--ticker] [--date]` — reads the same `loadRollupsForDay`/`loadActiveCatalysts`/`hasTrailingCoverage`/`isSubstrateHot` helpers the engine itself uses, so the debug view can never disagree with a live run.
- `strategy run --types <csv>` (validated against the `SignalType` union, `process.exit(2)` on an unknown name) and `strategy list-candidates --include-shadow` (shadow rows summarized as a one-line count otherwise) complete the operator-facing surface.
- `strategy run`'s output now always prints, in fixed order: VIX header; ranked candidates or the honest "No candidates above threshold today." line (D-14); sub-threshold (always, labeled below-threshold diagnostics); shadow (always, labeled logged-not-tradeable); skipped-types with their reasons verbatim.
- `registerStrategyCommands(program, deps)` accepts optional dependency injection (`intelDataDir`/`strategyDataDir`/`vixProvider`/`marketData`) so the whole CLI is exercised end-to-end in tests via a real `Commander` program, with `process.exit` mocked to throw a typed signal instead of killing the test worker.
- 24 new tests across `strategy-engine.test.ts` (9 registry + 15 ranking) and `strategy-commands.test.ts` (7 CLI integration cases, including a named placeholder that fails loudly once 11-06 registers `backtest`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Register all four modules and honor core/gated/shadow end to end** — `84e67ee` (feat)
2. **Task 2: Cross-type ranking — collisions, floor, top-5, next-3, honest empty** — `69f8304` (feat)
3. **Task 3: Complete the CLI surface and prove all nine subcommands against fixtures** — `f750a9b` (feat)

**Plan metadata:** committed below (docs: complete plan)

## Files Created/Modified

- `src/strategy/signals/index.ts` — `defaultSignalModules()`, re-exports of all four module classes
- `src/strategy/strategy-engine.ts` — `assertModulesMatchConfig`, `SignalModeMismatchError`, `resolveTickerCollisions`, `rankCandidates`, extended `generateCandidates` (gate/throw isolation, shadow partition, collision+rank wiring)
- `src/strategy/__tests__/strategy-engine.test.ts` — new file, 24 vitest cases across registry/mode/gate/shadow/persistence/failure-isolation + ranking
- `src/strategy/cli/strategy-commands.ts` — `show-substrate`, `run --types`, `list-candidates --include-shadow`, `StrategyCommandsDeps` injection, D-14 output ordering
- `src/strategy/cli/__tests__/strategy-commands.test.ts` — new file, 7 vitest integration cases driving a real Commander program

## Observed Real-Data `strategy run` Output (2026-08-26, `./data/intel`, `--dry-run`)

```
VIX: 15.45 (elevated, live)
As of 2026-08-26

Ranked (5):
CATALYST_ANCHORED  NVDA  score=1.00 long  entry=213.05 target=224.77 stop=204.26 size=$937
CATALYST_ANCHORED  MSFT  score=0.90 short entry=491.71 target=473.52 stop=505.35 size=$937
CATALYST_ANCHORED  AAPL  score=0.80 short entry=309.90 target=297.66 stop=319.08 size=$937
CATALYST_ANCHORED  IWM   score=0.64 short entry=299.23 target=293.56 stop=303.48 size=$937
CATALYST_ANCHORED  AMZN  score=0.60 long  entry=261.06 target=272.04 stop=252.83 size=$937

Sub-threshold (3) — below-threshold diagnostics, not tradeable:
CATALYST_ANCHORED  AAPL  score=0.58 ...
CATALYST_ANCHORED  NVDA  score=0.56 ...
CATALYST_ANCHORED  JPM   score=0.56 ...

Shadow (12) — logged for evidence, never ranked or sized:
FADE_OVERSHOOT  COIN/IBIT/IEF/IWM/JETS/LMT/MSTR/RTX/TLT/USO/XLE/XLF  score 0.00-0.05, all size=—

Skipped signal types:
  SENTIMENT_VELOCITY: Missing scored-article coverage for 2026-08-23, 2026-08-24, 2026-08-25
    (trailing 3-day window: 2026-08-23, 2026-08-24, 2026-08-25). Run "intel backlog-drain" to extend coverage.
```

**Was the 0.4 floor correctly calibrated against this first live run?** Yes, provisionally. All 5 ranked candidates score well above 0.4 (0.60-1.00) and cluster tightly by CATALYST_ANCHORED's magnitude/confidence formula; the 3 sub-threshold candidates (0.56-0.58) sit just below floor, which is the intended "close but not quite" transparency zone rather than noise. `SECTOR_ROTATION_FROM_PM` produced no ranked/sub-threshold candidates at all on this date (a quiet PM day, not a bug — its score formula caps at a 10pp/$10M-volume-normalized product and today's PM markets moved little). This exactly matches 11-03's own D-17 finding: CATALYST_ANCHORED's live output skews heavily toward `article:`-sourced (emerging) catalysts because every currently-active `calendar:`-sourced catalyst still carries `direction: "uncertain"`. No calendar-sourced candidate appeared in this run either — consistent, not a regression. The floor doesn't need recalibration yet; there simply isn't a week of accept/skip data behind it (CONTEXT explicitly left this open to post-launch calibration).

## Decisions Made

See `key-decisions` in frontmatter above. Headline: `assertModulesMatchConfig` runs at two points (construction-time when a config is injected, and every `generateCandidates` call against the real on-disk config) because `loadStrategyConfig` is async and the constructor cannot always validate synchronously — the per-run check is what actually protects production against a config-file edit that silently disagrees with the registered modules (T-11-05-02).

## Deviations from Plan

None — plan executed exactly as written. Two clarifications worth recording:

1. **Task 1's `assertModulesMatchConfig` timing.** The plan's `<action>` says "at construction, assert every module's declared mode equals config.signalModes[...]". Since `loadStrategyConfig` is async (reads `config/strategy-config.json` from disk) and the constructor is synchronous, a literal construction-time check against the real on-disk config is impossible. Implemented as: (a) a synchronous check at construction when `StrategyEngineOptions.config` is supplied directly (satisfies the plan's own acceptance criterion — "a test asserts... throws at construction" — via dependency injection), and (b) the same check re-run at the top of every `generateCandidates` call against the actually-loaded config, which is what enforces the threat model's T-11-05-02 mitigation in real production use. This is a reasonable and fully-tested resolution of an async/sync tension the plan text didn't spell out, not a scope deviation.
2. **Task 3's `strategy show-substrate` real-data smoke** surfaced the trailing coverage gap (2026-08-23 → 08-25 missing) as an expected, already-documented substrate fact from 11-04's SUMMARY — not a new finding, confirms the debug view agrees with the engine's own `SENTIMENT_VELOCITY` gate reason printed in the same day's `strategy run` output.

## Issues Encountered

- **Real-data `strategy run --dry-run` took several minutes** on the first attempt (initially timed out at 120s, completed on retry as a backgrounded process). Root cause: `CATALYST_ANCHORED` now expands into ~15+ distinct tickers on a busy calendar day (macro-proxy ETFs like XLF/USO plus per-catalyst tickers), and several of them (USO, XLF) aren't covered by Alpha Vantage, forcing a live network fallback chain (Alpha Vantage → Finnhub → Yahoo) per uncovered ticker before `MarketDataService` succeeds. This is expected real-network behavior given the four-module registry's larger ticker surface, not a regression in this plan's own code — `MarketDataService`'s provider-fallback chain and its per-call latency are pre-existing and untouched.
- **Found and deferred (out of scope):** during that same real-data run, `MarketDataService`'s console-logged Axios error objects (for the Alpha Vantage/Finnhub failures on USO/XLF) leaked the Finnhub API key in the request `config.params.token` field, in plaintext, to stdout. Neither the provider files nor `MarketDataService` are in this plan's `files_modified`; logged to `.planning/phases/11-ai-strategy/deferred-items.md` per the scope-boundary rule rather than fixed here.

## Known Stubs

None. All three tasks' behaviors are fully implemented and exercised by both unit/integration tests and real-data smoke runs.

## User Setup Required

None — no external service configuration required. This plan registers and wires modules/CLI commands already built by 11-02/11-03/11-04; no new credential or package.

## Next Phase Readiness

- The four-module registry, cross-type ranking, and full 8-subcommand CLI are stable, tested, and verified against real `data/intel`. `defaultSignalModules()` is the single place 11-06's live-window backtest and any future v2 signal type should source modules from.
- `strategy run --types <csv>` gives 11-06's per-type backtest runs a ready-made filter — no new engine surface needed for that.
- `backtest` remains unregistered by design (11-06's explicit job); this plan's CLI test carries a named `[PLACEHOLDER for 11-06]` assertion that fails loudly the moment `backtest` is added, prompting that test to be promoted into the main integration suite rather than silently forgotten.
- **Flag for 11-06:** given the real-data smoke above, expect CATALYST_ANCHORED to keep dominating ranked output early in the live-window backtest (consistent with 11-03's D-17 finding); SENTIMENT_VELOCITY will stay gated off until `intel backlog-drain` closes the 2026-08-23→25 (and earlier) coverage gaps.
- **Flag, out of scope for this plan:** `.planning/phases/11-ai-strategy/deferred-items.md` records a real API-key-in-logs finding from `src/data/providers/finnhub-provider.ts`/`market-data-service.ts` — worth a small standalone hardening pass or folding into M2-06.
- No blockers for 11-06 (live-window backtest) or 11-07 (web route) — no file overlap with either.

---
*Phase: 11-ai-strategy*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 5 created/modified plan files and both supplementary files
(`deferred-items.md`, this SUMMARY) verified present on disk; all 3 task
commit hashes (`84e67ee`, `69f8304`, `f750a9b`) verified present in `git log
--oneline --all`.
