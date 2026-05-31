/**
 * ArticleScorer — per-article LLM scoring for M2-04.
 *
 * Mirrors the LM Studio call surface of `LlmCorrelator` (sibling, not subclass):
 *   - OpenAI-compatible SDK with `baseURL` override
 *   - `apiKey: "lm-studio"` default (LM Studio ignores; SDK requires non-empty)
 *   - `timeout: 60_000`, `maxRetries: 0`
 *   - `/no_think` directive at end of user prompt (Qwen 3 fast structured output)
 *   - `response_format` OMITTED (LM Studio rejects `{ type: "json_object" }`;
 *     `parseScorerResponse` instead handles bare JSON + markdown-fenced JSON +
 *     leading-prose JSON)
 *
 * Concurrency: STRICTLY SEQUENTIAL. Local Qwen on a single GPU saturates with
 * parallel calls — parallel calls compete for the same KV cache and end up
 * slower per-call than serialized. Sequential gating via `this.inFlight`
 * chain guarantees only one `scoreArticle` is mid-flight at any moment, even
 * if callers don't await between calls. Caller-supplied `concurrency > 1` is
 * clamped to 1 with a console.warn.
 *
 * Failure handling: on LLM failure (timeout / connection error / parse error)
 * this module THROWS. The caller (cycle-runner in Plan 06) is responsible for
 * enqueueing the article into `ScoreBacklog`. We never silently substitute a
 * rule-based score — that would corrupt the downstream rollup with shape that
 * looks LLM-scored but isn't.
 *
 * @see src/market-intelligence/correlator/llm-correlator.ts — reference implementation
 * @see RESEARCH section "LM Studio Call Surface" + "Recommended per-article prompt structure"
 */

import OpenAI from "openai";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
import type {
  CalendarEvent,
  CatalystType,
  ExtractedCatalyst,
  PmMappingProposal,
  ScoredArticle,
} from "./types.js";

/**
 * Scorer prompt/schema version. Bump when:
 *   - SYSTEM_PROMPT_V1 changes (prompt re-engineering)
 *   - The expected JSON output shape changes (added/removed fields)
 *   - Theme canonicalization rules change
 *
 * Embedded in every `ScoredArticle.scorerVersion`. The stability test
 * (`intel stability-test`) flags rows scored under an older version when
 * the current version differs, so we can re-score selectively.
 */
export const SCORER_VERSION = "v1";

/**
 * System prompt — locked at v1 per RESEARCH section "Recommended per-article
 * prompt structure". Researched against LM Studio JSON-mode quirks; do not
 * paraphrase without bumping SCORER_VERSION.
 */
export const SYSTEM_PROMPT_V1 = `You score financial news articles for a personal swing-trading signal layer. For each article you receive, return a strict JSON object with:

- sentiment: float in [-1.0, +1.0] — bearishness/bullishness FOR THE TICKER(S) listed. Negative = price likely to fall, positive = likely to rise. If the article is not material to any specific ticker, return 0.0 with a low materiality.
- materiality: float in [0.0, 1.0] — how price-moving this is. 0 = pure noise (routine earnings preview, generic analyst opinion). 1 = guaranteed to move price (guidance cut, M&A confirmed, FDA decision).
- themes: array of short lowercase-kebab-case theme tags (max 5). PREFER tags from the provided "current canonical themes" list; only propose new tags when none fit.
- catalysts: array of catalyst records, each with { type, expected_date | null, magnitude (1-5 integer), direction ("up"|"down"|"uncertain"|"binary"), confidence (0-1) }. Empty array if no catalyst is mentioned. Catalyst types: "earnings", "guidance", "ma", "regulatory", "fda", "fda_pdufa", "macro_print", "fomc", "cpi", "nfp", "pce", "retail_sales", "jolts", "gdp", "ism", "geopolitical", "lawsuit", "product", "opec", "eia_petroleum", "treasury_auction", "other".
- referenced_calendar_events: array of strings — if this article refines an upcoming scheduled event (e.g., article handicaps next week's CPI), list the event_id(s) provided in the input. Empty array if no calendar reference.
- affected_tickers: OPTIONAL array of tickers from the provided ticker universe that this article materially affects. Use ONLY when the article has no ticker_scope of its own (i.e., a macro/RSS article with no source-provider ticker tag). Empty array or omit if the article already has a ticker_scope.
- proposed_pm_mappings: OPTIONAL array of PM-market-to-ticker proposals when the input includes PM market context and you can confidently suggest which equity/ETF tickers a market's resolution would affect. Each: { market_slug, proposed_tickers: [{ ticker, direction: "long"|"short", confidence: 0-1 }], interpretation_suggestion: "yesPp"|"noPp" }. Omit when no PM context, or when no confident mapping fits.

Output STRICT JSON, no prose, no markdown fences. Use the exact schema:

{
  "sentiment": -0.6,
  "materiality": 0.85,
  "themes": ["fed-rate-cuts", "ai-infra"],
  "catalysts": [
    { "type": "fomc", "expected_date": "2026-06-18", "magnitude": 4, "direction": "down", "confidence": 0.7 }
  ],
  "referenced_calendar_events": ["fomc-2026-06-18"],
  "affected_tickers": [],
  "proposed_pm_mappings": []
}

Rules:
- Return ONLY the JSON object. No prose before, no prose after.
- Be strict on materiality. Most articles are 0.1-0.3; reserve 0.7+ for genuinely price-moving items.
- Themes are lowercase-kebab-case. PREFER the provided canonical themes; only invent new ones when nothing fits.
- Direction "binary" only for catalysts whose outcome is genuinely two-sided (FDA approve/reject, M&A pass/fail). Use "uncertain" when you can't predict direction.`;

/**
 * Catalyst types the prompt declares as valid. Used to filter parsed catalysts
 * defensively (drop catalysts the model invented that aren't in our enum).
 */
const VALID_CATALYST_TYPES: ReadonlySet<CatalystType> = new Set<CatalystType>([
  "earnings",
  "guidance",
  "ma",
  "regulatory",
  "fda",
  "fda_pdufa",
  "macro_print",
  "fomc",
  "cpi",
  "nfp",
  "pce",
  "retail_sales",
  "jolts",
  "gdp",
  "ism",
  "geopolitical",
  "lawsuit",
  "product",
  "opec",
  "eia_petroleum",
  "treasury_auction",
  "other",
]);

export interface ArticleScorerOptions {
  /** Base URL of an OpenAI-compatible API (e.g. http://localhost:1234/v1). */
  endpoint: string;
  /** Model id (e.g. "qwen/qwen3-14b" for LM Studio). */
  model: string;
  /** API key. May be a blank string for local providers (LM Studio / Ollama). */
  apiKey?: string;
  /**
   * Sequential only. Default 1. Values > 1 are clamped to 1 with a console.warn —
   * local Qwen on a single GPU saturates with parallel calls (KV-cache contention
   * makes parallel slower per-call than serialized).
   */
  concurrency?: number;
  /** Request timeout in ms. Default 60_000 — matches LlmCorrelator. */
  timeoutMs?: number;
  /** Max tokens in the JSON response. Default 1024 (per-article response is small). */
  maxOutputTokens?: number;
  /** Sampling temperature. Default 0.2 — matches LlmCorrelator. */
  temperature?: number;
}

export interface ScoringContext {
  /** Canonical themes (loaded from config/themes.json), formatted as kebab-case strings. */
  canonicalThemes: string[];
  /** Upcoming calendar events within ~14 days. Lets the LLM mark referencedCalendarEvents. */
  upcomingEvents: CalendarEvent[];
  /** Ticker universe (watchlist ∪ macro-tickers) — for fan-out + LLM proposed-affected-tickers. */
  tickerUniverse: string[];
  /** Optional PM market snapshots paired with this article (recent movements). */
  pmContext?: MarketSnapshot[];
}

/**
 * Minimal OpenAI client surface that ArticleScorer uses. Defined so unit tests
 * can inject a fake without spinning up an LM Studio process.
 */
type OpenAIClientSurface = Pick<OpenAI, "chat" | "models">;

export class ArticleScorer {
  private readonly client: OpenAIClientSurface;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;
  /**
   * Sequential gate — only one scoreArticle() may be mid-flight at any moment.
   * Implemented as a promise chain: each new call awaits the previous before
   * issuing its LLM request, then resolves the next link only after its own
   * response completes. Callers can issue back-to-back `scoreArticle` without
   * await and still get serialized execution.
   */
  private inFlight: Promise<unknown> = Promise.resolve();

  /**
   * @param options scorer configuration (endpoint, model, etc.)
   * @param clientOverride for unit-test injection only — production constructs
   *   its own OpenAI client. Tests inject a fake `chat.completions.create`
   *   returning canned JSON so they don't need a live LM Studio.
   */
  constructor(options: ArticleScorerOptions, clientOverride?: OpenAIClientSurface) {
    this.client =
      clientOverride ??
      new OpenAI({
        apiKey: options.apiKey || "lm-studio", // LM Studio ignores; SDK requires non-empty.
        baseURL: options.endpoint,
        timeout: options.timeoutMs ?? 60_000,
        // Prevent the SDK from auto-retrying long-running local inference on transient timeouts.
        maxRetries: 0,
      });
    this.model = options.model;
    this.maxOutputTokens = options.maxOutputTokens ?? 1024;
    this.temperature = options.temperature ?? 0.2;

    if (options.concurrency !== undefined && options.concurrency > 1) {
      console.warn(
        `[ArticleScorer] concurrency=${options.concurrency} requested but clamped to 1 — ` +
          "local Qwen on single GPU saturates with parallel calls.",
      );
    }
  }

  /**
   * Score a single article. Fans out one record per (article × ticker).
   *
   * Sequential: chains through `this.inFlight` so callers can issue back-to-back
   * `await scoreArticle(...)` without worrying about overlap. Even
   * `[a, b, c].map(art => scorer.scoreArticle(art, ctx))` (without await
   * between) will serialize at the LLM call boundary.
   *
   * On LLM failure: THROWS. Caller is responsible for enqueueing to
   * `ScoreBacklog`. We never silently substitute a rule-based fallback —
   * that would pollute downstream rollups with non-LLM data shaped like LLM data.
   */
  async scoreArticle(
    article: NewsArticle,
    context: ScoringContext,
  ): Promise<ScoredArticle[]> {
    // Sequential gate. New call's inFlight resolves only after its own work
    // completes; the next call awaits this one before starting.
    const prev = this.inFlight;
    let release!: () => void;
    this.inFlight = new Promise<void>((r) => {
      release = r;
    });
    try {
      await prev;
      return await this.scoreArticleImpl(article, context);
    } finally {
      release();
    }
  }

  private async scoreArticleImpl(
    article: NewsArticle,
    context: ScoringContext,
  ): Promise<ScoredArticle[]> {
    const userMessage = this.buildUserMessage(article, context);

    // Note: `response_format` omitted. LM Studio rejects "json_object" (wants
    // "json_schema" or "text"); cloud providers vary. We ask for bare JSON in
    // the system prompt and use a lenient parser (`parseScorerResponse`) that
    // tolerates markdown-fence wrapping + leading prose. See LlmCorrelator
    // lines 117-119 for the same workaround in the sibling module.
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxOutputTokens,
      temperature: this.temperature,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_V1 },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = parseScorerResponse(text);

    return fanOutScoredArticle(article, parsed, context, this.model);
  }

  /**
   * Build the user prompt — canonical themes + upcoming events + article + /no_think.
   * Target: stay under ~1500 input tokens total per call.
   */
  private buildUserMessage(article: NewsArticle, context: ScoringContext): string {
    const themesLine = context.canonicalThemes.join(", ");

    // Cap upcoming events at 20 to bound prompt size; calendar fetchers may
    // emit dozens per day across earnings + macro prints.
    const eventLines = context.upcomingEvents
      .slice(0, 20)
      .map((e) => {
        const tickersOrSectors =
          e.tickers.length > 0
            ? e.tickers.join(",")
            : (e.affectedSectors ?? []).join(",");
        return `- ${e.id}: ${e.type}${tickersOrSectors ? ` [${tickersOrSectors}]` : ""}, magnitude_prior=${e.magnitudePrior}, direction=${e.direction}`;
      })
      .join("\n");

    const tickerScope = article.tickers.length > 0 ? article.tickers.join(", ") : "(none)";
    const summary = article.summary
      ? `\nsummary: ${article.summary.replace(/\n/g, " ").slice(0, 400)}`
      : "";
    const publisher = article.publisher ? `\npublisher: ${article.publisher}` : "";

    const articleBlock = [
      "# Article",
      `ticker_scope: ${tickerScope}`,
      `headline: ${article.headline}`,
      `published: ${article.publishedAt}${publisher}${summary}`,
    ].join("\n");

    // PM context: only included when present and non-empty. Cap at 5 to bound size.
    const pmBlock =
      context.pmContext && context.pmContext.length > 0
        ? `\n\n# PM context (optional)\n${context.pmContext
            .slice(0, 5)
            .map((m) => {
              const movePp = (m.oneHourPriceChange * 100).toFixed(1);
              return `- slug: ${m.slug}\n  question: ${m.question}\n  one_hour_move_pp: ${movePp}`;
            })
            .join("\n")}`
        : "";

    // Ticker universe: cap at 50 names so we don't blow input tokens on a
    // 200-ticker universe. The first 50 are the operator's priority watchlist
    // (caller controls ordering).
    const universeLine =
      context.tickerUniverse.length > 0
        ? `\n\n# Ticker universe (for affected_tickers when ticker_scope is empty)\n${context.tickerUniverse.slice(0, 50).join(", ")}`
        : "";

    return [
      "# Current canonical themes (prefer these)",
      themesLine,
      "",
      "# Upcoming calendar events (next 14 days)",
      eventLines || "(none)",
      "",
      articleBlock + pmBlock + universeLine,
      "",
      // Qwen 3: disable thinking mode for low-latency structured output.
      // Harmless no-op on other models that don't recognize the directive.
      "/no_think",
    ].join("\n");
  }

  /** Sanity check that the endpoint is reachable. Mirrors LlmCorrelator.ping(). */
  async ping(): Promise<{ models: string[] }> {
    const list = await this.client.models.list();
    return { models: list.data.map((m) => m.id) };
  }
}

/**
 * Parsed shape of the LLM response. Internal — callers should only see the
 * fanned-out `ScoredArticle[]`. Exported so the unit tests can inspect the
 * parser output directly.
 */
export interface ParsedScorerResponse {
  sentiment: number;
  materiality: number;
  themes: string[];
  catalysts: ExtractedCatalyst[];
  referenced_calendar_events: string[];
  affected_tickers?: string[];
  proposed_pm_mappings?: Array<{
    market_slug: string;
    proposed_tickers: Array<{ ticker: string; direction: "long" | "short"; confidence: number }>;
    interpretation_suggestion: "yesPp" | "noPp";
  }>;
}

/**
 * Parse LLM response. Tolerant of:
 *   - bare JSON
 *   - JSON wrapped in ```json ... ``` fences (Qwen sometimes wraps)
 *   - leading prose followed by JSON
 *
 * Returns the parsed object. Throws Error on:
 *   - no JSON object found
 *   - JSON parse error
 *   - missing required fields (sentiment, materiality, themes, catalysts, referenced_calendar_events)
 *
 * Clamps `sentiment` to [-1, 1] and `materiality` to [0, 1]. Caps `themes`
 * array at 5 entries (the system prompt asks for max 5 — defensive cap on
 * model overproduction). Canonicalizes themes via `canonicalizeTheme`.
 */
export function parseScorerResponse(text: string): ParsedScorerResponse {
  // Strip leading/trailing whitespace.
  let stripped = text.trim();

  // Strip ```json ... ``` (or ``` ... ```) fences if present.
  // Pattern: optional leading prose, then fence, then JSON, then closing fence.
  const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    stripped = (fenceMatch[1] ?? "").trim();
  }

  // If still has leading prose, find the first balanced {...} block.
  if (!stripped.startsWith("{")) {
    const firstBrace = stripped.indexOf("{");
    if (firstBrace === -1) {
      throw new Error("[parseScorerResponse] no JSON object found in response");
    }
    stripped = stripped.slice(firstBrace);
  }

  // Find the matching closing brace by depth-counting (handles nested objects).
  const jsonText = extractBalancedJsonObject(stripped);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `[parseScorerResponse] JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Required field checks.
  if (typeof raw.sentiment !== "number") {
    throw new Error("[parseScorerResponse] missing required field: sentiment (number)");
  }
  if (typeof raw.materiality !== "number") {
    throw new Error("[parseScorerResponse] missing required field: materiality (number)");
  }
  if (!Array.isArray(raw.themes)) {
    throw new Error("[parseScorerResponse] missing required field: themes (array)");
  }
  if (!Array.isArray(raw.catalysts)) {
    throw new Error("[parseScorerResponse] missing required field: catalysts (array)");
  }
  if (!Array.isArray(raw.referenced_calendar_events)) {
    throw new Error(
      "[parseScorerResponse] missing required field: referenced_calendar_events (array)",
    );
  }

  // Clamp + canonicalize.
  const sentiment = clamp(raw.sentiment, -1, 1);
  const materiality = clamp(raw.materiality, 0, 1);
  const themes = (raw.themes as unknown[])
    .filter((t): t is string => typeof t === "string")
    .map(canonicalizeTheme)
    .filter((t) => t.length > 0)
    .slice(0, 5);

  const catalysts: ExtractedCatalyst[] = (raw.catalysts as unknown[])
    .map((c) => coerceCatalyst(c))
    .filter((c): c is ExtractedCatalyst => c !== null);

  const referenced_calendar_events = (raw.referenced_calendar_events as unknown[]).filter(
    (e): e is string => typeof e === "string",
  );

  const affected_tickers =
    Array.isArray(raw.affected_tickers) &&
    (raw.affected_tickers as unknown[]).every((t) => typeof t === "string")
      ? (raw.affected_tickers as string[])
      : undefined;

  const proposed_pm_mappings =
    Array.isArray(raw.proposed_pm_mappings) && (raw.proposed_pm_mappings as unknown[]).length > 0
      ? (raw.proposed_pm_mappings as unknown[])
          .map((p) => coerceProposedMapping(p))
          .filter((p): p is NonNullable<ParsedScorerResponse["proposed_pm_mappings"]>[number] => p !== null)
      : undefined;

  return {
    sentiment,
    materiality,
    themes,
    catalysts,
    referenced_calendar_events,
    affected_tickers,
    proposed_pm_mappings,
  };
}

/**
 * Fan out the LLM's single response into one ScoredArticle per (article × ticker).
 *
 *   - If `article.tickers` is non-empty → emit one record per ticker.
 *   - Else if `parsed.affected_tickers ∩ tickerUniverse` is non-empty → emit
 *     one record per matched ticker.
 *   - Else → emit a single themed row with `ticker=""` so the article is still
 *     in the data layer (M2-05 may query by theme even with no ticker scope).
 *
 * `proposedPmMappings` and `proposedAffectedTickers` only populate the FIRST
 * record to avoid duplication across the fan-out (downstream rollup reads
 * these as article-level metadata, not per-ticker).
 */
export function fanOutScoredArticle(
  article: NewsArticle,
  parsed: ParsedScorerResponse,
  context: ScoringContext,
  model: string,
): ScoredArticle[] {
  const scoredAt = new Date().toISOString();

  // Determine target tickers for fan-out.
  let targetTickers: string[];
  let isThemeOnly = false;

  if (article.tickers.length > 0) {
    targetTickers = article.tickers;
  } else if (parsed.affected_tickers && parsed.affected_tickers.length > 0) {
    const universeSet = new Set(context.tickerUniverse);
    const matched = parsed.affected_tickers.filter((t) => universeSet.has(t));
    if (matched.length > 0) {
      targetTickers = matched;
    } else {
      targetTickers = [""];
      isThemeOnly = true;
    }
  } else {
    targetTickers = [""];
    isThemeOnly = true;
  }

  const proposedPmMappings = toPmMappingProposals(parsed, article.id, scoredAt);

  return targetTickers.map((ticker, idx) => {
    const isFirst = idx === 0;
    return {
      id: `${article.id}::${ticker || "__theme__"}`,
      sourceArticleId: article.id,
      ticker,
      // For themed-only rows: keep the LLM's sentiment as-is (article may be a
      // bearish-macro story even with no ticker scope; preserving sign keeps
      // the rollup's theme-level aggregation meaningful).
      sentiment: parsed.sentiment,
      materiality: parsed.materiality,
      themes: parsed.themes,
      catalysts: parsed.catalysts,
      referencedCalendarEvents: parsed.referenced_calendar_events,
      // Only emit proposed-affected-tickers on themed-only rows where they're
      // actually relevant; on per-ticker fan-outs the ticker is already known.
      proposedAffectedTickers:
        isThemeOnly && parsed.affected_tickers && parsed.affected_tickers.length > 0
          ? parsed.affected_tickers
          : undefined,
      // PM proposals only populate the first record (avoid downstream double-counting).
      proposedPmMappings: isFirst && proposedPmMappings.length > 0 ? proposedPmMappings : undefined,
      scoredAt,
      scorerModel: model,
      scorerVersion: SCORER_VERSION,
    } satisfies ScoredArticle;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Canonicalize a theme string to lowercase-kebab-case.
 *   "Fed Rate Cuts"  →  "fed-rate-cuts"
 *   "AI/Infra"       →  "ai-infra"
 *   "  ---hello---"  →  "hello"
 */
export function canonicalizeTheme(theme: string): string {
  return theme
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Walk the string left-to-right counting `{` and `}` depth; return the
 * substring from index 0 (assumed `{`) through the matching closing `}`.
 * Throws if no balanced object found.
 *
 * Note: not a full JSON parser; doesn't handle strings containing braces.
 * Sufficient because the LLM output is JSON, and the only braces inside string
 * values would have to be escaped to be syntactically valid. JSON.parse on
 * the extracted substring catches any mismatch.
 */
function extractBalancedJsonObject(text: string): string {
  if (!text.startsWith("{")) {
    throw new Error("[parseScorerResponse] expected JSON object starting with '{'");
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  throw new Error("[parseScorerResponse] unbalanced JSON object — no matching closing brace");
}

function coerceCatalyst(raw: unknown): ExtractedCatalyst | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const typeStr = typeof obj.type === "string" ? obj.type : null;
  if (!typeStr || !VALID_CATALYST_TYPES.has(typeStr as CatalystType)) return null;

  const expectedDateRaw = obj.expected_date;
  const expectedDate: string | null =
    typeof expectedDateRaw === "string" && expectedDateRaw.length > 0 ? expectedDateRaw : null;

  const magnitudeRaw = obj.magnitude;
  const magnitudeInt =
    typeof magnitudeRaw === "number" && Number.isFinite(magnitudeRaw)
      ? Math.round(magnitudeRaw)
      : null;
  if (magnitudeInt === null || magnitudeInt < 1 || magnitudeInt > 5) return null;

  const direction = obj.direction;
  if (
    typeof direction !== "string" ||
    !["up", "down", "uncertain", "binary"].includes(direction)
  ) {
    return null;
  }

  const confidenceRaw = obj.confidence;
  const confidence = typeof confidenceRaw === "number" ? clamp(confidenceRaw, 0, 1) : 0.5;

  return {
    type: typeStr as CatalystType,
    expectedDate,
    magnitude: magnitudeInt as 1 | 2 | 3 | 4 | 5,
    direction: direction as ExtractedCatalyst["direction"],
    confidence,
  };
}

function coerceProposedMapping(
  raw: unknown,
): NonNullable<ParsedScorerResponse["proposed_pm_mappings"]>[number] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const market_slug = typeof obj.market_slug === "string" ? obj.market_slug : null;
  if (!market_slug) return null;

  const proposedTickersRaw = obj.proposed_tickers;
  if (!Array.isArray(proposedTickersRaw)) return null;

  const proposed_tickers = proposedTickersRaw
    .map((p): { ticker: string; direction: "long" | "short"; confidence: number } | null => {
      if (typeof p !== "object" || p === null) return null;
      const t = p as Record<string, unknown>;
      const ticker = typeof t.ticker === "string" ? t.ticker : null;
      const direction = typeof t.direction === "string" ? t.direction : null;
      if (!ticker || (direction !== "long" && direction !== "short")) return null;
      const confidence =
        typeof t.confidence === "number" ? clamp(t.confidence, 0, 1) : 0.5;
      return { ticker, direction, confidence };
    })
    .filter(
      (p): p is { ticker: string; direction: "long" | "short"; confidence: number } => p !== null,
    );

  if (proposed_tickers.length === 0) return null;

  const interp = obj.interpretation_suggestion;
  const interpretation_suggestion: "yesPp" | "noPp" =
    interp === "noPp" ? "noPp" : "yesPp"; // default yesPp on any non-noPp value

  return { market_slug, proposed_tickers, interpretation_suggestion };
}

function toPmMappingProposals(
  parsed: ParsedScorerResponse,
  sourceArticleId: string,
  proposedAt: string,
): PmMappingProposal[] {
  if (!parsed.proposed_pm_mappings || parsed.proposed_pm_mappings.length === 0) return [];
  return parsed.proposed_pm_mappings.map((p) => ({
    marketId: p.market_slug, // LLM only knows the slug — caller may resolve to id later
    slug: p.market_slug,
    question: "", // LLM doesn't echo the question back; downstream can fill from snapshot lookup
    proposedTickers: p.proposed_tickers,
    interpretationSuggestion: p.interpretation_suggestion,
    proposedAt,
    sourceArticleId,
  }));
}
