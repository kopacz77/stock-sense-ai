import OpenAI from "openai";
import type { NewsArticle } from "../news/types.js";
import type { MarketSnapshot } from "../polymarket/types.js";
import type {
  ConfirmedAlert,
  DivergenceAlert,
  IntelligenceAlert,
} from "../alerts/types.js";

/**
 * Pricing table for known providers, USD per million tokens.
 * Local (LM Studio, Ollama) is zero. Add new providers here as needed.
 *
 * The OpenAI SDK accepts any base URL exposing the chat-completions API, so the
 * same client code works against:
 *   - LM Studio  (http://<host>:1234/v1)
 *   - Ollama     (http://<host>:11434/v1)
 *   - DeepSeek   (https://api.deepseek.com/v1)
 *   - Together   (https://api.together.xyz/v1)
 *   - OpenRouter (https://openrouter.ai/api/v1)
 *   - OpenAI     (https://api.openai.com/v1)
 *   - Anthropic-via-proxy (e.g. https://api.anthropic.com/v1 with translation)
 */
export interface ProviderPricing {
  inputPerMtok: number;
  outputPerMtok: number;
}

export const PROVIDER_PRICING: Record<string, ProviderPricing> = {
  "local": { inputPerMtok: 0, outputPerMtok: 0 },
  "deepseek-chat": { inputPerMtok: 0.27, outputPerMtok: 1.1 },
  "deepseek-reasoner": { inputPerMtok: 0.55, outputPerMtok: 2.19 },
  "claude-sonnet-4-6": { inputPerMtok: 3.0, outputPerMtok: 15.0 },
  "claude-haiku-4-5-20251001": { inputPerMtok: 0.8, outputPerMtok: 4.0 },
  "gpt-4o-mini": { inputPerMtok: 0.15, outputPerMtok: 0.6 },
};

export interface LlmCorrelatorOptions {
  /** Base URL of an OpenAI-compatible API (e.g. http://localhost:1234/v1 for LM Studio). */
  endpoint: string;
  /** Model id understood by the endpoint (e.g. "qwen3-14b-instruct" for LM Studio). */
  model: string;
  /** API key. May be a blank string for local providers (LM Studio / Ollama). */
  apiKey?: string;
  /** Override pricing lookup for cost estimates. Defaults to PROVIDER_PRICING[model] or zero. */
  pricing?: ProviderPricing;
  /** Minimum 1h Polymarket move (in pp) to consider a market "moved". Default 3. */
  minMovePp?: number;
  /** Maximum article age (minutes) included in the LLM input. Default 90. */
  articleAgeMinutes?: number;
  /** Cap on tokens per call as a guardrail. Default 4096. */
  maxOutputTokens?: number;
  /** Request timeout in ms. Default 60000 (local models can be slow on first call). */
  timeoutMs?: number;
  /** Max moved markets included in the prompt. Default 10. Halved on the size-aware retry. */
  maxMarkets?: number;
  /** Max recent articles included in the prompt. Default 30. Halved on the size-aware retry. */
  maxArticles?: number;
}

/** Minimal OpenAI surface we depend on — lets tests inject a fake client. */
type OpenAIClientSurface = Pick<OpenAI, "chat" | "models">;

export interface CorrelationCost {
  inputTokens: number;
  outputTokens: number;
  usdEstimate: number;
  /** Provider/model used; "local" if zero-cost. */
  provider: string;
}

export class LlmCorrelator {
  private client: OpenAIClientSurface;
  private readonly model: string;
  private readonly pricing: ProviderPricing;
  private readonly minMovePp: number;
  private readonly articleAgeMs: number;
  private readonly maxOutputTokens: number;
  private readonly maxMarkets: number;
  private readonly maxArticles: number;

  /**
   * @param clientOverride for unit-test injection only — production constructs
   *   a real OpenAI client against `options.endpoint`.
   */
  constructor(options: LlmCorrelatorOptions, clientOverride?: OpenAIClientSurface) {
    this.client =
      clientOverride ??
      new OpenAI({
        apiKey: options.apiKey || "lm-studio", // LM Studio ignores key; OpenAI SDK requires non-empty.
        baseURL: options.endpoint,
        timeout: options.timeoutMs ?? 60_000,
        // Prevent the SDK from auto-retrying long-running local inference on transient timeouts.
        maxRetries: 0,
      });
    this.model = options.model;
    this.pricing =
      options.pricing ??
      PROVIDER_PRICING[options.model] ??
      { inputPerMtok: 0, outputPerMtok: 0 };
    this.minMovePp = options.minMovePp ?? 3;
    this.articleAgeMs = (options.articleAgeMinutes ?? 90) * 60 * 1000;
    this.maxOutputTokens = options.maxOutputTokens ?? 4096;
    this.maxMarkets = options.maxMarkets ?? 10;
    this.maxArticles = options.maxArticles ?? 30;
  }

  async correlate(
    markets: MarketSnapshot[],
    articles: NewsArticle[],
  ): Promise<{ alerts: IntelligenceAlert[]; cost: CorrelationCost }> {
    const emptyCost: CorrelationCost = {
      inputTokens: 0,
      outputTokens: 0,
      usdEstimate: 0,
      provider: this.model,
    };
    // Filter first, cap when building the prompt. Top markets by absolute 1h
    // move so we always feed the most interesting ones first; most-recent
    // articles first.
    const moved = markets
      .filter((m) => Math.abs(m.oneHourPriceChange ?? 0) * 100 >= this.minMovePp)
      .sort((a, b) => Math.abs(b.oneHourPriceChange) - Math.abs(a.oneHourPriceChange));
    if (moved.length === 0) return { alerts: [], cost: emptyCost };

    const now = Date.now();
    const recent = articles
      .filter((a) => now - Date.parse(a.publishedAt) <= this.articleAgeMs)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

    // Size-aware single retry: the local model's context window (n_ctx) and the
    // request timeout are both size-sensitive. On a context-overflow or timeout,
    // retry ONCE with a halved prompt rather than degrading the whole cycle to
    // the rule-based correlator. A connection error (server down) can't be helped
    // by a smaller prompt, so it propagates immediately.
    try {
      return await this.attempt(moved, recent, this.maxMarkets, this.maxArticles);
    } catch (err) {
      if (!isRetryableSizeError(err)) throw err;
      return await this.attempt(
        moved,
        recent,
        Math.max(1, Math.floor(this.maxMarkets / 2)),
        Math.max(1, Math.floor(this.maxArticles / 2)),
      );
    }
  }

  /** One correlation attempt at the given prompt caps. */
  private async attempt(
    moved: MarketSnapshot[],
    recent: NewsArticle[],
    maxMarkets: number,
    maxArticles: number,
  ): Promise<{ alerts: IntelligenceAlert[]; cost: CorrelationCost }> {
    const markets = moved.slice(0, maxMarkets);
    const articles = recent.slice(0, maxArticles);
    const userMessage = this.buildUserMessage(markets, articles);

    // Note: response_format omitted. LM Studio rejects "json_object" (wants
    // "json_schema" or "text"); cloud providers vary. Our parseDecisions()
    // accepts JSON whether bare or wrapped in markdown fences, which the
    // system prompt explicitly asks the model to output.
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxOutputTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const decisions = parseDecisions(text);
    const alerts = this.buildAlerts(decisions, markets, articles);

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const cost: CorrelationCost = {
      inputTokens,
      outputTokens,
      usdEstimate:
        (inputTokens * this.pricing.inputPerMtok) / 1_000_000 +
        (outputTokens * this.pricing.outputPerMtok) / 1_000_000,
      provider: this.model,
    };

    return { alerts, cost };
  }

  private buildUserMessage(markets: MarketSnapshot[], articles: NewsArticle[]): string {
    const marketLines = markets.map((m) => {
      const movePp = (m.oneHourPriceChange * 100).toFixed(1);
      const yesPct = (m.yesPrice * 100).toFixed(0);
      return [
        `- id: ${m.id}`,
        `  slug: ${m.slug}`,
        `  question: ${m.question}`,
        `  yes_price: ${yesPct}%`,
        `  one_hour_move_pp: ${movePp}`,
        `  volume_24hr_usd: ${m.volume24hr.toFixed(0)}`,
        m.eventTitle ? `  event: ${m.eventTitle}` : "",
        m.eventContext
          ? `  event_context: ${m.eventContext.replace(/\n/g, " ").slice(0, 400)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const articleLines = articles.map((a) => {
      const minutes = Math.max(0, Math.round((Date.now() - Date.parse(a.publishedAt)) / 60_000));
      return [
        `- id: ${a.id}`,
        `  age_min: ${minutes}`,
        `  tickers: ${a.tickers.join(",") || "(none)"}`,
        `  headline: ${a.headline}`,
        a.summary ? `  summary: ${a.summary.replace(/\n/g, " ").slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    return [
      `# Moved Polymarket markets (one-hour move >= ${this.minMovePp}pp)`,
      "",
      marketLines.join("\n\n"),
      "",
      "# Recent headlines",
      "",
      articleLines.join("\n\n"),
      "",
      "Respond with a JSON object matching the schema in the system prompt.",
      // Qwen 3: disable thinking mode for low-latency structured output.
      // Harmless no-op on other models that don't recognize the directive.
      "/no_think",
    ].join("\n");
  }

  private buildAlerts(
    decisions: LlmDecision[],
    markets: MarketSnapshot[],
    articles: NewsArticle[],
  ): IntelligenceAlert[] {
    const marketsById = new Map(markets.map((m) => [m.id, m]));
    const articlesById = new Map(articles.map((a) => [a.id, a]));
    const alerts: IntelligenceAlert[] = [];

    for (const d of decisions) {
      const market = marketsById.get(d.market_id);
      if (!market) continue;
      const pmMovePp = (market.oneHourPriceChange ?? 0) * 100;

      if (d.alert_kind === "HEADLINE_PM_CONFIRMED" && d.article_id) {
        const article = articlesById.get(d.article_id);
        if (!article) continue;
        const confirmed: ConfirmedAlert = {
          kind: "HEADLINE_PM_CONFIRMED",
          article,
          market,
          pmMovePp,
          rationale: d.rationale,
          createdAt: new Date().toISOString(),
        };
        alerts.push(confirmed);
      } else if (d.alert_kind === "HEADLINE_PM_DIVERGENCE") {
        const divergence: DivergenceAlert = {
          kind: "HEADLINE_PM_DIVERGENCE",
          market,
          pmMovePp,
          windowDescription: `${this.articleAgeMs / 60_000} min`,
          rationale: d.rationale,
          createdAt: new Date().toISOString(),
        };
        alerts.push(divergence);
      }
      // NO_ALERT decisions are intentionally dropped.
    }

    return alerts;
  }

  /** Smoke-test the endpoint: list models. Throws if unreachable. */
  async ping(): Promise<{ models: string[] }> {
    const models = await this.client.models.list();
    return { models: models.data.map((m) => m.id) };
  }
}

interface LlmDecision {
  market_id: string;
  alert_kind: "HEADLINE_PM_CONFIRMED" | "HEADLINE_PM_DIVERGENCE" | "NO_ALERT";
  article_id?: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

const SYSTEM_PROMPT = `You are the correlator for a personal swing-trading intelligence bot. You decide whether moved prediction-market prices correlate with recent news headlines.

For each moved Polymarket market provided, decide:
- HEADLINE_PM_CONFIRMED: a recent headline plausibly explains the move (be strict — superficial keyword matches do not count; the headline must materially relate to the market's resolution criteria)
- HEADLINE_PM_DIVERGENCE: the market moved meaningfully but no recent headline explains it; potential smart-money positioning ahead of public news
- NO_ALERT: the market move is too small to matter, the rationale is unclear, or you are not confident enough

Confidence levels:
- high: clear causal link or clear absence of any related news
- medium: plausible link but other explanations exist
- low: do not emit an alert; use NO_ALERT instead

Output STRICT JSON in this exact shape, with one decision per moved market:

{
  "decisions": [
    {
      "market_id": "<id from input>",
      "alert_kind": "HEADLINE_PM_CONFIRMED" | "HEADLINE_PM_DIVERGENCE" | "NO_ALERT",
      "article_id": "<id from input or omitted>",
      "confidence": "low" | "medium" | "high",
      "rationale": "<one or two sentences explaining the reasoning, suitable for a Telegram alert>"
    }
  ]
}

Rules:
- Return ONLY the JSON object, no prose before or after.
- Include article_id only when alert_kind is HEADLINE_PM_CONFIRMED.
- Rationale should be operator-facing: terse, specific, no hype.
- If multiple headlines could explain a move, pick the most material one.
- Markets that moved due to stale order book activity (e.g. very low 24h volume) should be NO_ALERT.
- This bot operates on a 15-minute polling cadence; treat headlines older than 90 minutes as background context, not direct catalysts.`;

/**
 * True when a failed correlation attempt could plausibly succeed with a smaller
 * prompt: local-model context overflow (LM Studio's `n_keep >= n_ctx` 400) or a
 * request timeout (a shorter prompt generates faster). A connection error means
 * the server is unreachable, which no amount of trimming fixes — those return
 * false so the caller falls straight through to the rule-based correlator.
 */
function isRetryableSizeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("context length") ||
    msg.includes("n_ctx") ||
    msg.includes("n_keep") ||
    msg.includes("tokens to keep") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

function parseDecisions(text: string): LlmDecision[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && Array.isArray(parsed.decisions)) {
      return parsed.decisions.filter(isValidDecision);
    }
  } catch (err) {
    console.warn("[llm-correlator] failed to parse decisions JSON:", err instanceof Error ? err.message : err);
  }
  return [];
}

function isValidDecision(d: unknown): d is LlmDecision {
  if (typeof d !== "object" || d === null) return false;
  const obj = d as Record<string, unknown>;
  return (
    typeof obj.market_id === "string" &&
    typeof obj.alert_kind === "string" &&
    ["HEADLINE_PM_CONFIRMED", "HEADLINE_PM_DIVERGENCE", "NO_ALERT"].includes(obj.alert_kind as string) &&
    typeof obj.rationale === "string"
  );
}
