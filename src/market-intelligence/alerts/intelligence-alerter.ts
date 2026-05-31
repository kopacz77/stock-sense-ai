import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TelegramService, type TelegramMessage } from "../../notifications/telegram-service.js";
import { JsonlStore } from "../storage/jsonl-store.js";
import { digestTitle, renderDigestMarkdown } from "./digest-builder.js";
import type {
  ConfirmedAlert,
  DigestAlert,
  DivergenceAlert,
  IntelligenceAlert,
} from "./types.js";
import type { DigestPayload } from "../signal/types.js";

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

interface DailyCap {
  /** ET-day YYYY-MM-DD; resets when the date changes. */
  etDate: string;
  /** Telegram sends made today (digests + break-glass excluded). */
  sentCount: number;
}

/**
 * Per-ET-day digest + break-glass slot tracker. Each slot can fire at most
 * once per ET trading day; the bag resets at ET midnight (etDate roll).
 */
interface DigestSlotsFired {
  morning: boolean;
  midday: boolean;
  close: boolean;
  breakGlass: boolean;
}

interface DigestSlotsState {
  etDate: string;
  slots: DigestSlotsFired;
}

interface CooldownState {
  records: CooldownRecord[];
  dailyCap?: DailyCap;
  /** Digest + break-glass per-ET-day tracker (Plan 10-06). */
  digestSlots?: DigestSlotsState;
  /**
   * Total Telegram sends today across ALL paths (CONFIRMED + DIVERGENCE +
   * digests + break-glass). Hard backstop against runaway-bug fan-out.
   */
  totalSentToday?: { etDate: string; count: number };
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
  /**
   * Hard cap on CONFIRMED + DIVERGENCE Telegram sends per ET trading day.
   * Digests + break-glass do NOT consume this cap (they have their own slots).
   * Defaults to 4. Operator-tunable backstop from M2-03; intentionally kept in
   * place after M2-04 digests ship — see absoluteCapPerDay for the runaway-bug
   * defense.
   */
  dailyCapLimit?: number;
  /**
   * Hard absolute backstop on TOTAL Telegram sends per ET trading day across
   * ALL paths (CONFIRMED + DIVERGENCE + digests + break-glass). Defaults to 8:
   * 4 CONFIRMED/DIVERGENCE + 3 digests + 1 break-glass + headroom. If this is
   * ever hit, something is wrong — assume a bug, suppress further sends, and
   * keep audit-logging.
   */
  absoluteCapPerDay?: number;
}

/**
 * Priority score for ranking proposed alerts within a polling cycle.
 *
 * Combines move magnitude with market depth (log of 24h volume) so a 4pp
 * move on a $6M Iran market outranks a 4pp move on a $300k threshold market.
 * Adds a fixed bonus to CONFIRMED alerts since a corroborating headline
 * makes them more actionable than a bare divergence. Digests always rank
 * highest so the scheduled brief never gets squeezed out by a noisy cycle.
 */
export function alertPriority(alert: IntelligenceAlert): number {
  if (alert.kind === "DAILY_DIGEST") return Number.POSITIVE_INFINITY;
  const movePart = Math.abs(alert.pmMovePp);
  const volPart = Math.log10(Math.max(alert.market.volume24hr, 1));
  const confirmedBonus = alert.kind === "HEADLINE_PM_CONFIRMED" ? 15 : 0;
  return movePart * volPart + confirmedBonus;
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
  private log: JsonlStore<IntelligenceAlert & { suppressed?: boolean; suppressReason?: string }>;
  private readonly cooldownFile: string;
  private readonly cooldownMs: number;
  private readonly accelerationPp: number;
  private readonly dailyCapLimit: number;
  private readonly absoluteCapPerDay: number;

  constructor(
    dataDir = "./data/intel",
    telegram?: TelegramService,
    options: AlerterOptions = {},
  ) {
    this.telegram = telegram ?? new TelegramService();
    this.log = new JsonlStore<
      IntelligenceAlert & { suppressed?: boolean; suppressReason?: string }
    >(dataDir, "alerts-fired");
    this.cooldownFile = path.join(dataDir, "alert-cooldown.json");
    this.cooldownMs = (options.cooldownHours ?? 4) * 60 * 60 * 1000;
    this.accelerationPp = options.accelerationOverridePp ?? 3;
    this.dailyCapLimit = options.dailyCapLimit ?? 4;
    this.absoluteCapPerDay = options.absoluteCapPerDay ?? 8;
  }

  /**
   * Dispatch a CONFIRMED or DIVERGENCE intelligence alert.
   *
   * Digests should use `sendDigest()`; break-glass alerts should use
   * `sendBreakGlass()`. If `send()` receives a DAILY_DIGEST alert, it
   * defensively rejects it (audit-logged) — digests now have their own
   * per-ET-day slot tracking and must not bypass it.
   */
  async send(alert: IntelligenceAlert): Promise<boolean> {
    // Defensive guard: digests routed here are a wiring bug — use sendDigest.
    if (alert.kind === "DAILY_DIGEST") {
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: "DAILY_DIGEST routed through send() — use sendDigest()",
      });
      return false;
    }

    const marketId = alert.market.id;
    const moveAbs = Math.abs(alert.pmMovePp);

    const state = await this.readCooldownState();
    const etDate = etDateString(new Date());

    // Absolute backstop across all paths — protects against runaway-bug fan-out.
    const totalToday = totalForToday(state.totalSentToday, etDate);
    if (totalToday.count >= this.absoluteCapPerDay) {
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: `absolute-cap reached (${this.absoluteCapPerDay}/day)`,
      });
      await this.writeState({ ...state, totalSentToday: totalToday });
      return false;
    }

    // Per-day cap for CONFIRMED + DIVERGENCE only. Digests + break-glass have
    // their own slots and do NOT consume this cap.
    const dailyCap: DailyCap =
      state.dailyCap && state.dailyCap.etDate === etDate
        ? { ...state.dailyCap }
        : { etDate, sentCount: 0 };

    if (dailyCap.sentCount >= this.dailyCapLimit) {
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: `daily-cap reached (${this.dailyCapLimit}/day for CONFIRMED+DIVERGENCE)`,
      });
      await this.writeState({ ...state, dailyCap, totalSentToday: totalToday });
      return false;
    }

    const recent = state.records.find(
      (r) =>
        r.marketId === marketId &&
        r.kind === alert.kind &&
        Date.now() - Date.parse(r.firedAt) < this.cooldownMs,
    );

    if (recent && moveAbs - recent.lastMoveAbsPp < this.accelerationPp) {
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: "per-(market,kind) cooldown active",
      });
      await this.writeState({ ...state, dailyCap, totalSentToday: totalToday });
      return false;
    }

    await this.log.append(alert);
    const message = this.toTelegramMessage(alert);
    const ok = await this.telegram.sendAlert(message);

    if (ok) {
      dailyCap.sentCount += 1;
      totalToday.count += 1;
      const others = state.records.filter(
        (r) => !(r.marketId === marketId && r.kind === alert.kind),
      );
      await this.writeState({
        records: [
          ...others,
          { marketId, kind: alert.kind, lastMoveAbsPp: moveAbs, firedAt: new Date().toISOString() },
        ],
        dailyCap,
        digestSlots: state.digestSlots,
        totalSentToday: totalToday,
      });
    } else {
      await this.writeState({ ...state, dailyCap, totalSentToday: totalToday });
    }
    return ok;
  }

  /**
   * Dispatch a scheduled digest. Returns true if the slot for `payload.flavor`
   * was available today and the Telegram send succeeded; false if the slot was
   * already used or the absolute cap was hit.
   *
   * Digests do NOT increment the CONFIRMED/DIVERGENCE daily cap, but they DO
   * count toward the absolute backstop.
   */
  async sendDigest(payload: DigestPayload): Promise<boolean> {
    const state = await this.readCooldownState();
    const etDate = etDateString(new Date());
    const totalToday = totalForToday(state.totalSentToday, etDate);

    if (totalToday.count >= this.absoluteCapPerDay) {
      const alert = this.buildDigestAlert(payload);
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: `absolute-cap reached (${this.absoluteCapPerDay}/day)`,
      });
      await this.writeState({ ...state, totalSentToday: totalToday });
      return false;
    }

    const slots = freshSlotsIfStale(state.digestSlots, etDate);
    const slotKey = slotKeyForFlavor(payload.flavor);
    if (slots.slots[slotKey]) {
      const alert = this.buildDigestAlert(payload);
      await this.log.append({
        ...alert,
        suppressed: true,
        suppressReason: `${payload.flavor} slot already used today`,
      });
      await this.writeState({ ...state, digestSlots: slots, totalSentToday: totalToday });
      return false;
    }

    const alert = this.buildDigestAlert(payload);
    await this.log.append(alert);
    const message = this.toTelegramMessage(alert);
    const ok = await this.telegram.sendAlert(message);

    if (ok) {
      slots.slots[slotKey] = true;
      totalToday.count += 1;
      await this.writeState({
        ...state,
        digestSlots: slots,
        totalSentToday: totalToday,
      });
    } else {
      await this.writeState({ ...state, totalSentToday: totalToday });
    }
    return ok;
  }

  /**
   * Dispatch a break-glass alert (fires at most once per ET day). Reason is
   * persisted to the audit log so the operator can attribute the fire later.
   *
   * If `alert` is null, a synthetic DigestAlert-shaped break-glass body is
   * sent using `reason` as the body (used for catalyst-only triggers where
   * no specific PM-move alert is the cause).
   *
   * Break-glass does NOT consume the CONFIRMED/DIVERGENCE cap but DOES count
   * toward the absolute backstop.
   */
  async sendBreakGlass(
    alert: IntelligenceAlert | null,
    reason: string,
  ): Promise<boolean> {
    const state = await this.readCooldownState();
    const etDate = etDateString(new Date());
    const totalToday = totalForToday(state.totalSentToday, etDate);
    const slots = freshSlotsIfStale(state.digestSlots, etDate);

    const effectiveAlert: IntelligenceAlert =
      alert ?? this.buildBreakGlassSyntheticAlert(reason);

    if (totalToday.count >= this.absoluteCapPerDay) {
      await this.log.append({
        ...effectiveAlert,
        suppressed: true,
        suppressReason: `absolute-cap reached (${this.absoluteCapPerDay}/day)`,
      });
      await this.writeState({ ...state, totalSentToday: totalToday });
      return false;
    }

    if (slots.slots.breakGlass) {
      await this.log.append({
        ...effectiveAlert,
        suppressed: true,
        suppressReason: `break-glass slot already used today (last reason: ${reason})`,
      });
      await this.writeState({ ...state, digestSlots: slots, totalSentToday: totalToday });
      return false;
    }

    await this.log.append({
      ...effectiveAlert,
      suppressReason: `break-glass: ${reason}`,
    });
    const message = this.toBreakGlassTelegramMessage(effectiveAlert, reason);
    const ok = await this.telegram.sendAlert(message);

    if (ok) {
      slots.slots.breakGlass = true;
      totalToday.count += 1;
      await this.writeState({
        ...state,
        digestSlots: slots,
        totalSentToday: totalToday,
      });
    } else {
      await this.writeState({ ...state, totalSentToday: totalToday });
    }
    return ok;
  }

  private buildDigestAlert(payload: DigestPayload): DigestAlert {
    return {
      kind: "DAILY_DIGEST",
      flavor: payload.flavor,
      body: renderDigestMarkdown(payload),
      payload,
      createdAt: new Date().toISOString(),
    };
  }

  private buildBreakGlassSyntheticAlert(reason: string): DigestAlert {
    return {
      kind: "DAILY_DIGEST",
      flavor: "MIDDAY", // arbitrary — break-glass title overrides flavor display
      body: `*Break-glass*: ${reason}`,
      createdAt: new Date().toISOString(),
    };
  }

  private toBreakGlassTelegramMessage(
    alert: IntelligenceAlert,
    reason: string,
  ): TelegramMessage {
    const base = this.toTelegramMessage(alert);
    return {
      ...base,
      priority: "URGENT",
      title: `🚨 Break-Glass — ${reason}`,
    };
  }

  private async readCooldownState(): Promise<CooldownState> {
    try {
      const raw = await fs.readFile(this.cooldownFile, "utf8");
      const parsed = JSON.parse(raw) as CooldownState;
      // Prune records older than 2x cooldown to keep the file bounded.
      const cutoff = Date.now() - this.cooldownMs * 2;
      const fresh = (parsed.records ?? []).filter(
        (r) => Date.parse(r.firedAt) >= cutoff,
      );
      // Plan 10-06: digestSlots + totalSentToday must round-trip across calls.
      // Dropping them here was a silent bug — slot tracking would reset on
      // every read, breaking the at-most-once-per-day guarantee.
      const out: CooldownState = { records: fresh };
      if (parsed.dailyCap !== undefined) out.dailyCap = parsed.dailyCap;
      if (parsed.digestSlots !== undefined) out.digestSlots = parsed.digestSlots;
      if (parsed.totalSentToday !== undefined) out.totalSentToday = parsed.totalSentToday;
      return out;
    } catch {
      return { records: [] };
    }
  }

  private async writeState(state: CooldownState): Promise<void> {
    await fs.mkdir(path.dirname(this.cooldownFile), { recursive: true });
    await fs.writeFile(this.cooldownFile, JSON.stringify(state, null, 2), "utf8");
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
          title: digestTitle(alert.flavor),
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
      `*Tickers* (stocks this story affects): ${tickerStr}`,
      "",
      `*Polymarket question:* ${this.escape(a.market.question)}`,
      `*Yes price* (the market's odds this happens): ${yesPct} — moved ${pct} in window`,
      `_pp = percentage points; -4 pp means the odds dropped by 4 (e.g. from 35% to 31%)_`,
      `*24h vol* (money traded on this market in 24h — bigger = stronger conviction): $${this.compactNumber(a.market.volume24hr)}`,
      "",
      `*Why this matters:* ${this.escape(a.rationale)}`,
      "",
      `🟢 _CONFIRMED — news and prediction market moved in the same direction. Corroborated signal._`,
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
      `*Polymarket question:* ${this.escape(a.market.question)}`,
      `*Yes price* (the market's odds this happens): ${yesPct} — moved ${pct} in ${a.windowDescription}`,
      `_pp = percentage points; -4 pp means the odds dropped by 4 (e.g. from 35% to 31%)_`,
      `*24h vol* (money traded on this market in 24h — bigger = stronger conviction): $${this.compactNumber(a.market.volume24hr)}`,
      "",
      `*Why this matters:* ${this.escape(a.rationale)}`,
      "",
      `🔵 _DIVERGENCE — prediction market moved but no matching news yet. Often smart money positioning ahead of the headlines (so worth a closer look)._`,
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

/** YYYY-MM-DD in America/New_York. Used to roll the daily-cap counter at ET midnight. */
function etDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Returns a fresh slot bag if the stored etDate is stale (or absent), else clones the stored. */
function freshSlotsIfStale(
  current: DigestSlotsState | undefined,
  etDate: string,
): DigestSlotsState {
  if (current && current.etDate === etDate) {
    return { etDate, slots: { ...current.slots } };
  }
  return {
    etDate,
    slots: { morning: false, midday: false, close: false, breakGlass: false },
  };
}

function slotKeyForFlavor(flavor: DigestPayload["flavor"]): keyof DigestSlotsFired {
  switch (flavor) {
    case "MORNING":
      return "morning";
    case "MIDDAY":
      return "midday";
    case "CLOSE":
      return "close";
  }
}

/** Returns a fresh per-day total if stored is stale, else clones it. */
function totalForToday(
  current: { etDate: string; count: number } | undefined,
  etDate: string,
): { etDate: string; count: number } {
  if (current && current.etDate === etDate) return { etDate, count: current.count };
  return { etDate, count: 0 };
}
