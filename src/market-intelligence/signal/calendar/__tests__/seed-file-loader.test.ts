/**
 * SeedFileCalendarLoader tests — operator-curated FDA PDUFA + OPEC seed files.
 *
 * Uses fs.mkdtemp for an isolated temp config dir per test so the real
 * `config/` files are never touched.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SeedFileCalendarLoader } from "../seed-file-loader.js";

describe("SeedFileCalendarLoader", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seed-loader-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeJson(filename: string, body: unknown): Promise<void> {
    await fs.writeFile(path.join(tmpDir, filename), JSON.stringify(body, null, 2), "utf8");
  }

  it("returns [] when both seed files have empty entries", async () => {
    await writeJson("fda-pdufa-seed.json", { version: 1, lastUpdated: "2026-05-31", entries: [] });
    await writeJson("opec-schedule-seed.json", { version: 1, lastUpdated: "2026-05-31", entries: [] });

    const loader = new SeedFileCalendarLoader({ configDir: tmpDir });
    const events = await loader.loadAll();
    expect(events).toEqual([]);
  });

  it("returns [] gracefully when both seed files are missing", async () => {
    // tmpDir has no seed files at all.
    const loader = new SeedFileCalendarLoader({ configDir: tmpDir });
    const events = await loader.loadAll();
    expect(events).toEqual([]);
  });

  it("maps 2 PDUFA entries to 2 CalendarEvents with correct ids and fda_pdufa type", async () => {
    await writeJson("fda-pdufa-seed.json", {
      version: 1,
      lastUpdated: "2026-05-31",
      entries: [
        {
          ticker: "MRNA",
          drug_name: "mRNA-1010",
          indication: "Seasonal flu vaccine",
          expected_date: "2026-08-15",
          source_url: "https://biopharmcatalyst.com/...",
          last_verified: "2026-05-30",
        },
        {
          ticker: "lly", // intentionally lowercase to assert normalization
          drug_name: "Retatrutide",
          indication: "Obesity",
          expected_date: "2026-09-20",
        },
      ],
    });
    await writeJson("opec-schedule-seed.json", { version: 1, entries: [] });

    const loader = new SeedFileCalendarLoader({ configDir: tmpDir });
    const events = await loader.loadAll();

    expect(events).toHaveLength(2);

    const mrna = events.find((e) => e.tickers[0] === "MRNA");
    expect(mrna).toBeDefined();
    expect(mrna?.id).toBe("fda-pdufa-MRNA-2026-08-15");
    expect(mrna?.type).toBe("fda_pdufa");
    expect(mrna?.magnitudePrior).toBe(5);
    expect(mrna?.direction).toBe("binary");
    expect(mrna?.source).toBe("calendar:fda-pdufa-seed");
    expect(mrna?.sourceMeta?.drug_name).toBe("mRNA-1010");
    expect(mrna?.sourceMeta?.indication).toBe("Seasonal flu vaccine");

    const lly = events.find((e) => e.tickers[0] === "LLY");
    expect(lly).toBeDefined();
    expect(lly?.id).toBe("fda-pdufa-LLY-2026-09-20"); // normalized to uppercase
  });

  it("maps 1 OPEC entry to a CalendarEvent with affectedSectors XLE/USO/UNG", async () => {
    await writeJson("fda-pdufa-seed.json", { version: 1, entries: [] });
    await writeJson("opec-schedule-seed.json", {
      version: 1,
      lastUpdated: "2026-05-31",
      entries: [
        {
          meeting_type: "OPEC",
          date: "2026-06-04",
          source_url: "https://www.opec.org/...",
        },
      ],
    });

    const loader = new SeedFileCalendarLoader({ configDir: tmpDir });
    const events = await loader.loadAll();

    expect(events).toHaveLength(1);
    const opec = events[0];
    expect(opec?.id).toBe("opec-opec-2026-06-04");
    expect(opec?.type).toBe("opec");
    expect(opec?.tickers).toEqual([]);
    expect(opec?.affectedSectors).toEqual(["XLE", "USO", "UNG"]);
    expect(opec?.source).toBe("calendar:opec-seed");
    expect(opec?.magnitudePrior).toBe(4);
    expect(opec?.sourceMeta?.meeting_type).toBe("OPEC");
  });
});
