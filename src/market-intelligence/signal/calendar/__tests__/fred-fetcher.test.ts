/**
 * FredCalendarFetcher — release table sanity + the daily-padding guard.
 * `fetch` is stubbed; no network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FRED_RELEASE_IDS,
  FredCalendarFetcher,
  MAX_RELEASE_DATES_PER_WINDOW,
} from "../fred-fetcher.js";

function stubFetch(datesById: Record<number, string[]>): void {
  vi.stubGlobal("fetch", async (url: string) => {
    const id = Number(new URL(url).searchParams.get("release_id"));
    const dates = (datesById[id] ?? []).map((date) => ({ release_id: id, date }));
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ release_dates: dates }) };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("FRED_RELEASE_IDS", () => {
  it("does not contain releases FRED pads daily or that are not on FRED (101 FOMC, 375 OBFR, 21 H.6, 84)", () => {
    const ids = FRED_RELEASE_IDS.map((r) => r.id);
    for (const bad of [101, 375, 21, 84]) expect(ids).not.toContain(bad);
    expect(FRED_RELEASE_IDS.map((r) => r.type)).not.toContain("ism");
    expect(FRED_RELEASE_IDS.find((r) => r.type === "pce")?.id).toBe(54);
    expect(FRED_RELEASE_IDS.find((r) => r.type === "retail_sales")?.id).toBe(9);
  });
});

describe("FredCalendarFetcher padding guard", () => {
  it("keeps a normally scheduled release and discards one that returns a date for every day", async () => {
    const today = new Date();
    const day = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const padded = Array.from({ length: MAX_RELEASE_DATES_PER_WINDOW + 20 }, (_, i) => day(i + 1));
    stubFetch({ 10: [day(14), day(45)], 50: padded });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const events = await new FredCalendarFetcher("test-key").fetchUpcoming(60);

    expect(events.map((e) => e.type)).toEqual(["cpi", "cpi"]);
    expect(warn.mock.calls.some(([m]) => String(m).includes("padded every day"))).toBe(true);
    warn.mockRestore();
  });
});
