import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TelegramService, type TelegramMessage } from "../../notifications/telegram-service.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import type {
  ConfirmedAlert,
  DigestAlert,
  DivergenceAlert,
  IntelligenceAlert,
} from "./types.js";

interface CooldownRecord {
  /** Polymarket market id. */
  marketId: string;
  /** Alert kind — separate cooldowns per kind so a CONFIRMED can follow a DIVERGENCE. */
  kind: string;
  /** Absolute pp magnitude of the move at the time of the last fire. */
  lastMoveAbsPp: number;
  /** ISO timestamp of the last successful Telegram send. */
  firedAt: string;
}

interface CooldownState {
  records: CooldownRecord[];
}

export interface AlerterOptions {
  /** Hours a market+kind is suppressed after firing. Default 4. */
  cooldownHours?: number;
  /**
   * Override cooldown if the move has accelerated by at least this many pp
   * since the last fire. Default 3pp — protects against missing a story that
   * escalated from -4pp to -15pp within the cooldown window.
   */
  accelerationOverridePp?: number;
}

/**
 * Dispatches market intelligence alerts via Telegram and persists them to an
 * append-only audit log.
 *
 * **Cooldown:** A per-(market, kind) cooldown suppresses repeat alerts on the
 * same market within a configurable window. This is essential — without it,
 * a single PM drop persists in the lookback window and re-fires on every
 * polling cycle, flooding Telegram (saw 197 alerts in one day before the fix,
 * with single markets firing 20x). The cooldown is overridden if the move
 * has materially accelerated, so a -4pp story that becomes -15pp still alerts.
 *
 * Suppressed alerts are still written to the audit log (with `suppressed: true`)
 * so the data layer is complete for downstream backtesting / M2-04 ingestion.
 */
export class IntelligenceAlerter {
  private telegram: TelegramService;
  private log: JsonlStore<IntelligenceAlert & { suppressed?: boolean }>;
  private readonly cooldownFile: string;
  private readonly cooldownMs: number;
  private readonly accelerationPp: number;

  constructor(
    dataDir = "./data/intel",
    telegram?: TelegramService,
    options: AlerterOptions = {},
  ) {
    this.telegram = telegram ?? new TelegramService();
    this.log = new JsonlStore<IntelligenceAlert & { suppressed?: boolean }>(
      dataDir,
      "alerts-fired",
    );
    this.cooldownFile = path.join(dataDir, "alert-cooldown.json");
    this.cooldownMs = (options.cooldownHours ?? 4) * 60 * 60 * 1000;
    this.accelerationPp = options.accelerationOverridePp ?? 3;
  }

  async send(alert: IntelligenceAlert): Promise<boolean> {
    // Digests bypass cooldown — they fire on a fixed schedule, not on market moves.
    if (alert.kind === "DAILY_DIGEST") {
      await this.log.append(alert);
      const message = this.toTelegramMessage(alert);
      return this.telegram.sendAlert(message);
    }

    const marketId = alert.market.id;
    const moveAbs = Math.abs(alert.pmMovePp);

    const state = await this.readCooldownState();
    const recent = state.records.find(
      (r) =>
        r.marketId === marketId &&
        r.kind === alert.kind &&
        Date.now() - Date.parse(r.firedAt) < this.cooldownMs,
    );

    if (recent && moveAbs - recent.lastMoveAbsPp < this.accelerationPp) {
      // Same market + kind, within cooldown, no acceleration — suppress.
      await this.log.append({ ...alert, suppressed: true });
      return false;
    }

    await this.log.append(alert);
    const message = this.toTelegramMessage(alert);
    const ok = await this.telegram.sendAlert(message);

    if (ok) {
      await this.recordCooldown(state, marketId, alert.kind, moveAbs);
    }
    return ok;
  }

  private async readCooldownState(): Promise<CooldownState> {
    try {
      const raw = await fs.readFile(this.cooldownFile, "utf8");
      const parsed = JSON.parse(raw) as CooldownState;
      // Prune records older than 2x cooldown to keep the file bounded.
      const cutoff = Date.now() - this.cooldownMs * 2;
      const fresh = parsed.records.filter((r) => Date.parse(r.firedAt) >= cutoff);
      return { records: fresh };
    } catch {
      return { records: [] };
    }
  }

  private async recordCooldown(
    state: CooldownState,
    marketId: string,
    kind: string,
    lastMoveAbsPp: number,
  ): Promise<void> {
    const others = state.records.filter((r) => !(r.marketId === marketId && r.kind === kind));
    const next: CooldownState = {
      records: [
        ...others,
        { marketId, kind, lastMoveAbsPp, firedAt: new Date().toISOString() },
      ],
    };
    await fs.mkdir(path.dirname(this.cooldownFile), { recursive: true });
    await fs.writeFile(this.cooldownFile, JSON.stringify(next, null, 2), "utf8");
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
