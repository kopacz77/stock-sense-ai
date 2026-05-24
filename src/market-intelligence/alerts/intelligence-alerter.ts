import { TelegramService, type TelegramMessage } from "../../notifications/telegram-service.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type {
  ConfirmedAlert,
  DigestAlert,
  DivergenceAlert,
  IntelligenceAlert,
} from "./types.js";

/**
 * Dispatches market intelligence alerts via Telegram and persists them to an
 * append-only audit log. Keeps formatting in one place so the correlator only
 * has to build structured payloads.
 */
export class IntelligenceAlerter {
  private telegram: TelegramService;
  private log: JsonlStore<IntelligenceAlert>;

  constructor(dataDir = "./data/intel", telegram?: TelegramService) {
    this.telegram = telegram ?? new TelegramService();
    this.log = new JsonlStore<IntelligenceAlert>(dataDir, "alerts-fired");
  }

  async send(alert: IntelligenceAlert): Promise<boolean> {
    await this.log.append(alert);
    const message = this.toTelegramMessage(alert);
    return this.telegram.sendAlert(message);
  }

  private toTelegramMessage(alert: IntelligenceAlert): TelegramMessage {
    switch (alert.kind) {
      case "HEADLINE_PM_CONFIRMED":
        return {
          type: "HEADLINE_PM_CONFIRMED",
          priority: "HIGH",
          title: this.formatConfirmedTitle(alert),
          message: this.formatConfirmedBody(alert),
        };
      case "HEADLINE_PM_DIVERGENCE":
        return {
          type: "HEADLINE_PM_DIVERGENCE",
          priority: "MEDIUM",
          title: this.formatDivergenceTitle(alert),
          message: this.formatDivergenceBody(alert),
        };
      case "DAILY_DIGEST":
        return {
          type: "DAILY_DIGEST",
          priority: "LOW",
          title: alert.flavor === "MORNING" ? "Morning Brief" : "Evening Recap",
          message: alert.body,
        };
    }
  }

  private formatConfirmedTitle(a: ConfirmedAlert): string {
    const direction = a.pmMovePp >= 0 ? "↑" : "↓";
    return `Headline ↔ Polymarket Confirmed ${direction}`;
  }

  private formatConfirmedBody(a: ConfirmedAlert): string {
    const tickerStr = a.article.tickers.length > 0 ? a.article.tickers.join(", ") : "—";
    const pct = `${a.pmMovePp >= 0 ? "+" : ""}${a.pmMovePp.toFixed(1)} pp`;
    const yesPct = `${(a.market.yesPrice * 100).toFixed(0)}%`;
    return [
      `*Headline:* ${this.escape(a.article.headline)}`,
      `_${this.escape(a.article.publisher ?? a.article.source)} • ${this.shortTime(a.article.publishedAt)}_`,
      `*Tickers:* ${tickerStr}`,
      "",
      `*Polymarket:* ${this.escape(a.market.question)}`,
      `*Yes price:* ${yesPct} (${pct} in window)`,
      `*24h vol:* $${this.compactNumber(a.market.volume24hr)}`,
      "",
      `*Why this matters:* ${this.escape(a.rationale)}`,
      "",
      `[Article](${a.article.url}) • [Market](https://polymarket.com/market/${a.market.slug})`,
    ].join("\n");
  }

  private formatDivergenceTitle(a: DivergenceAlert): string {
    const direction = a.pmMovePp >= 0 ? "↑" : "↓";
    return `Polymarket Moved — No News Found ${direction}`;
  }

  private formatDivergenceBody(a: DivergenceAlert): string {
    const pct = `${a.pmMovePp >= 0 ? "+" : ""}${a.pmMovePp.toFixed(1)} pp`;
    const yesPct = `${(a.market.yesPrice * 100).toFixed(0)}%`;
    return [
      `*Polymarket:* ${this.escape(a.market.question)}`,
      `*Yes price:* ${yesPct} (${pct} in ${a.windowDescription})`,
      `*24h vol:* $${this.compactNumber(a.market.volume24hr)}`,
      "",
      `*Why this matters:* ${this.escape(a.rationale)}`,
      "",
      `[Market](https://polymarket.com/market/${a.market.slug})`,
    ].join("\n");
  }

  /** Telegram Markdown V1: escape special chars in user-supplied text. */
  private escape(text: string): string {
    return text.replace(/([_*[\]`])/g, "\\$1");
  }

  private shortTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      });
    } catch {
      return iso;
    }
  }

  private compactNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(0);
  }
}
