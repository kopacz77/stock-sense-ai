/**
 * IntelligenceAlerter integration tests — Plan 10-06 verification.
 *
 * Verifies the three load-bearing claims of the digest delivery model:
 *
 *   1. `send()` only consumes the daily cap for CONFIRMED/DIVERGENCE.
 *      `sendDigest()` does NOT bump `dailyCap.sentCount`.
 *   2. Digest slots are idempotent per ET day — second `sendDigest(MORNING)`
 *      within the same ET day returns false and audit-logs a suppress.
 *   3. Break-glass fires at most once per ET day.
 *
 * Telegram is stubbed via a fake TelegramService that always returns true and
 * captures the dispatched messages.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TelegramMessage, TelegramService } from "../../../notifications/telegram-service.js";
import type { ConfirmedAlert, DivergenceAlert } from "../types.js";
import type { DigestPayload } from "../../signal/types.js";

import { IntelligenceAlerter } from "../intelligence-alerter.js";

// ───────────────────────────────────────────────────────────────────────────
// Fakes + fixtures
// ───────────────────────────────────────────────────────────────────────────

class FakeTelegram implements Pick<TelegramService, "sendAlert"> {
  public sent: TelegramMessage[] = [];
  async sendAlert(msg: TelegramMessage): Promise<boolean> {
    this.sent.push(msg);
    return true;
  }
}

function makeConfirmed(idSuffix: string, movePp = 5): ConfirmedAlert {
  return {
    kind: "HEADLINE_PM_CONFIRMED",
    article: {
      id: `art-${idSuffix}`,
      source: "finnhub",
      tickers: ["NVDA"],
      headline: `Hot story ${idSuffix}`,
      url: "https://example.com",
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
    market: {
      id: `mkt-${idSuffix}`,
      slug: `slug-${idSuffix}`,
      question: `q${idSuffix}?`,
      active: true,
      outcomes: ["Yes", "No"],
      prices: [0.55, 0.45],
      yesPrice: 0.55,
      volume24hr: 500_000,
      volume1wk: 1_000_000,
      liquidity: 100_000,
      oneHourPriceChange: 0.05,
      oneDayPriceChange: 0.05,
      oneWeekPriceChange: 0.1,
      competitive: 0.9,
      fetchedAt: new Date().toISOString(),
    },
    pmMovePp: movePp,
    rationale: "test",
    createdAt: new Date().toISOString(),
  };
}

function makeDivergence(idSuffix: string, movePp = 5): DivergenceAlert {
  return {
    kind: "HEADLINE_PM_DIVERGENCE",
    market: {
      id: `mkt-${idSuffix}`,
      slug: `slug-${idSuffix}`,
      question: `q${idSuffix}?`,
      active: true,
      outcomes: ["Yes", "No"],
      prices: [0.55, 0.45],
      yesPrice: 0.55,
      volume24hr: 500_000,
      volume1wk: 1_000_000,
      liquidity: 100_000,
      oneHourPriceChange: 0.05,
      oneDayPriceChange: 0.05,
      oneWeekPriceChange: 0.1,
      competitive: 0.9,
      fetchedAt: new Date().toISOString(),
    },
    pmMovePp: movePp,
    windowDescription: "60 min",
    rationale: "no news matched",
    createdAt: new Date().toISOString(),
  };
}

function makeDigestPayload(flavor: DigestPayload["flavor"]): DigestPayload {
  return {
    flavor,
    builtAt: new Date().toISOString(),
    topStories: [],
    upcomingCalendar: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Suite
// ───────────────────────────────────────────────────────────────────────────

describe("IntelligenceAlerter — digest + break-glass model", () => {
  let dataDir: string;
  let telegram: FakeTelegram;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "alerter-"));
    telegram = new FakeTelegram();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("daily-cap=4: 5 CONFIRMED dispatches => 4 sent + 1 suppressed", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService, {
      dailyCapLimit: 4,
    });

    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await alerter.send(makeConfirmed(String(i))));
    }
    expect(results.filter((r) => r).length).toBe(4);
    expect(results.filter((r) => !r).length).toBe(1);
    // Telegram received exactly 4 sends.
    expect(telegram.sent).toHaveLength(4);

    // sendDigest must still succeed (does not consume CONFIRMED/DIVERGENCE cap).
    const ok = await alerter.sendDigest(makeDigestPayload("MORNING"));
    expect(ok).toBe(true);
    expect(telegram.sent).toHaveLength(5);
    // Last send was the digest.
    expect(telegram.sent[4]?.type).toBe("DAILY_DIGEST");
  });

  it("sendDigest is idempotent per ET-day slot (second MORNING returns false)", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService);
    const first = await alerter.sendDigest(makeDigestPayload("MORNING"));
    const second = await alerter.sendDigest(makeDigestPayload("MORNING"));
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(telegram.sent).toHaveLength(1);
    // But MIDDAY in the same day still fires (different slot).
    const midday = await alerter.sendDigest(makeDigestPayload("MIDDAY"));
    expect(midday).toBe(true);
    expect(telegram.sent).toHaveLength(2);
  });

  it("break-glass fires at most once per ET day", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService);
    const first = await alerter.sendBreakGlass(makeConfirmed("bg-1", 20), "PM move +20pp");
    const second = await alerter.sendBreakGlass(makeConfirmed("bg-2", 18), "PM move +18pp");
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(telegram.sent).toHaveLength(1);
    // Title was decorated with the break-glass prefix.
    expect(telegram.sent[0]?.title).toMatch(/Break-Glass/);
    expect(telegram.sent[0]?.priority).toBe("URGENT");
  });

  it("absolute cap (default 8) blocks all paths once reached", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService, {
      dailyCapLimit: 4, // CONFIRMED/DIVERGENCE cap stays 4
      absoluteCapPerDay: 6, // tighten the absolute backstop for a focused test
    });
    // 4 CONFIRMED => 4 sends, dailyCap exhausted.
    for (let i = 0; i < 4; i++) {
      await alerter.send(makeConfirmed(String(i)));
    }
    expect(telegram.sent).toHaveLength(4);

    // 2 digests => fills absolute cap (4 + 2 = 6).
    expect(await alerter.sendDigest(makeDigestPayload("MORNING"))).toBe(true);
    expect(await alerter.sendDigest(makeDigestPayload("MIDDAY"))).toBe(true);
    expect(telegram.sent).toHaveLength(6);

    // 7th send (any path) must be suppressed by the absolute cap.
    expect(await alerter.sendDigest(makeDigestPayload("CLOSE"))).toBe(false);
    expect(await alerter.sendBreakGlass(makeConfirmed("bg", 20), "test")).toBe(false);
    expect(telegram.sent).toHaveLength(6);
  });

  it("send() defensively rejects DAILY_DIGEST routed through it", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService);
    const ok = await alerter.send({
      kind: "DAILY_DIGEST",
      flavor: "MORNING",
      body: "should-not-fire",
      createdAt: new Date().toISOString(),
    });
    expect(ok).toBe(false);
    // Audit log captured the rejection; Telegram saw nothing.
    expect(telegram.sent).toHaveLength(0);
  });

  it("DIVERGENCE alerts share the daily cap with CONFIRMED", async () => {
    const alerter = new IntelligenceAlerter(dataDir, telegram as unknown as TelegramService, {
      dailyCapLimit: 4,
    });
    // 2 CONFIRMED + 2 DIVERGENCE => 4 sends, then 5th DIVERGENCE suppressed.
    await alerter.send(makeConfirmed("c1"));
    await alerter.send(makeConfirmed("c2"));
    await alerter.send(makeDivergence("d1"));
    await alerter.send(makeDivergence("d2"));
    const overflow = await alerter.send(makeDivergence("d3"));
    expect(overflow).toBe(false);
    expect(telegram.sent).toHaveLength(4);
  });
});
