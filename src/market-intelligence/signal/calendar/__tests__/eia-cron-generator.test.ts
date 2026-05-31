/**
 * EiaCalendarGenerator tests — deterministic Wednesday generation
 * and holiday-shift override behavior.
 */

import { describe, expect, it } from "vitest";
import { EiaCalendarGenerator } from "../eia-cron-generator.js";

describe("EiaCalendarGenerator", () => {
  it("emits today as the first event when the window starts on a Wednesday", () => {
    // 2026-06-03 is a Wednesday (UTC).
    const wed = new Date("2026-06-03T12:00:00Z");
    const gen = new EiaCalendarGenerator({ now: wed, shifts: {} });
    const events = gen.generate(60);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.expectedDate).toBe("2026-06-03");
    expect(events[0]?.type).toBe("eia_petroleum");
    expect(events[0]?.expectedTimeEt).toBe("10:30");
    expect(events[0]?.affectedSectors).toEqual(["XLE", "USO", "UNG"]);
    expect(events[0]?.source).toBe("calendar:eia-cron");
  });

  it("emits the next Wednesday as the first event when the window starts on a Sunday", () => {
    // 2026-06-07 is a Sunday (UTC); next Wednesday is 2026-06-10.
    const sun = new Date("2026-06-07T12:00:00Z");
    const gen = new EiaCalendarGenerator({ now: sun, shifts: {} });
    const events = gen.generate(60);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.expectedDate).toBe("2026-06-10");
  });

  it("emits ~8-9 Wednesdays in a 60-day window", () => {
    const start = new Date("2026-06-03T12:00:00Z"); // Wednesday
    const gen = new EiaCalendarGenerator({ now: start, shifts: {} });
    const events = gen.generate(60);

    // 60 days / 7 = 8.57 weeks; expect 8 or 9 Wednesdays depending on start.
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(events.length).toBeLessThanOrEqual(10);
  });

  it("applies holiday shifts when provided", () => {
    // 2026-01-19 is a Monday; 2026-01-21 is a Wednesday. Suppose MLK shifts to Thursday 2026-01-22.
    const start = new Date("2026-01-19T12:00:00Z");
    const shifts = { "2026-01-21": "2026-01-22" };
    const gen = new EiaCalendarGenerator({ now: start, shifts });
    const events = gen.generate(14);

    // The 2026-01-21 Wednesday should be shifted to 2026-01-22.
    const dates = events.map((e) => e.expectedDate);
    expect(dates).toContain("2026-01-22");
    expect(dates).not.toContain("2026-01-21");

    // The shifted event should carry the shift metadata.
    const shifted = events.find((e) => e.expectedDate === "2026-01-22");
    expect(shifted).toBeDefined();
    expect(shifted?.id).toBe("eia-petroleum-2026-01-22");
    expect(shifted?.sourceMeta?.shiftedFromWednesday).toBe(true);
    expect(shifted?.sourceMeta?.originalWednesday).toBe("2026-01-21");
  });

  it("emits unique event ids across the window", () => {
    const start = new Date("2026-06-03T12:00:00Z");
    const gen = new EiaCalendarGenerator({ now: start, shifts: {} });
    const events = gen.generate(60);

    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty array when window is 0 days starting on a non-Wednesday", () => {
    // 2026-06-08 is a Monday; days=0 means [today, today].
    const mon = new Date("2026-06-08T12:00:00Z");
    const gen = new EiaCalendarGenerator({ now: mon, shifts: {} });
    const events = gen.generate(0);
    expect(events).toEqual([]);
  });

  it("emits one event when window is exactly the single starting Wednesday", () => {
    const wed = new Date("2026-06-03T12:00:00Z");
    const gen = new EiaCalendarGenerator({ now: wed, shifts: {} });
    const events = gen.generate(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.expectedDate).toBe("2026-06-03");
  });
});
