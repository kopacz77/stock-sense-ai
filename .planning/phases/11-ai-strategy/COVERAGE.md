# Phase 11 (M2-05) — API Coverage Declaration

**Decided:** 2026-08-27 (plan-phase)
**Detector verdict:** `detected: true` — sole signal was RESEARCH.md §8's mention of the Polymarket CLOB `/prices-history` endpoint.

## Declaration

**No external API integration:** M2-05 consumes on-disk M2-04 streams (`data/intel/ticker-day-summary-*.jsonl`, `catalyst-flags-*.jsonl`, `polymarket-snapshots-*.jsonl`, `scored-articles-*.jsonl`, `news-*.jsonl`) plus the already-integrated `YahooFinanceProvider` for `^VIX` and OHLCV; Polymarket `/prices-history` is deferred to the per-regime backtest follow-up.

## Why the detector fired, and why the matrix does not apply

| Signal | Disposition |
|--------|-------------|
| Polymarket CLOB `GET /prices-history` (RESEARCH §8) | **Out of scope.** Reachable only via the deferred 2023–2025 PM re-mapping project. CONTEXT.md's 2026-08-27 "Backtest acceptance" decision replaces the per-regime backtest with a live-window gate over the existing 2026 substrate, which needs no historical PM fetch. |
| `^VIX` quotes (RESEARCH §2) | **Existing integration.** `YahooFinanceProvider.fetchHistoricalDataRange(symbol, from, to)` (`src/data/providers/yahoo-finance-provider.ts:63`) already ships and already accepts index symbols. M2-05 adds a caller (`src/strategy/vix-provider.ts`), not a provider. |
| FRED / Finnhub / Polymarket gamma / Telegram | **Existing M2-03/M2-04 integrations**, untouched by this phase. |
| LLM provider (LM Studio / DeepSeek) | **Explicitly out of scope** — CONTEXT.md 2026-08-27 keeps the local provider for this phase; DeepSeek evaluation happens after M2-05 ships. |

## Net-new outbound network calls introduced by this phase

One: `^VIX` daily closes via the existing Yahoo provider, cached to `data/strategy/vix-cache.json`, with a conservative `"elevated"` fallback on failure (RESEARCH Pitfall 2). No new credential, no new base URL, no new SDK, no new `package.json` entry.
