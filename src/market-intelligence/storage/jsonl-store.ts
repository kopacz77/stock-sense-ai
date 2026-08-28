import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Append-only JSONL store for time-series intelligence records (news articles,
 * Polymarket snapshots, fired alerts).
 *
 * Why JSONL: trivial to tail, append, recover; matches the pattern used by the
 * existing paper-trading journal in `src/paper-trading/journal/`. No DB needed
 * for a personal-tool data volume.
 *
 * Files are rotated daily to keep individual files queryable; the path pattern
 * is `${dir}/${streamName}-YYYY-MM-DD.jsonl`.
 */
export class JsonlStore<T extends object> {
  private readonly dir: string;
  private readonly streamName: string;

  constructor(dir: string, streamName: string) {
    this.dir = dir;
    this.streamName = streamName;
  }

  async append(record: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileFor(new Date());
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  }

  async appendMany(records: T[]): Promise<void> {
    await this.appendManyOn(records, new Date());
  }

  /**
   * Append records to the file for a specific calendar day (UTC) instead of
   * today. Used when back-scoring old articles so a record lands in the day
   * it belongs to (its article's publish day), not the day it was scored.
   */
  async appendManyOn(records: T[], date: Date): Promise<void> {
    if (records.length === 0) return;
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileFor(date);
    const lines = records.map((r) => JSON.stringify(r)).join("\n");
    await fs.appendFile(file, `${lines}\n`, "utf8");
  }

  /** Read all records from a specific calendar day (UTC). */
  async readDay(date: Date): Promise<T[]> {
    const file = this.fileFor(date);
    try {
      const content = await fs.readFile(file, "utf8");
      return content
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as T);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  /** Read records from the last N hours, scanning today + yesterday files. */
  async readRecent(hours: number): Promise<T[]> {
    const now = new Date();
    const cutoffMs = now.getTime() - hours * 60 * 60 * 1000;
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const days = await Promise.all([this.readDay(yesterday), this.readDay(now)]);
    const all = days.flat();

    // Filter only records that have a timestamp field we can read.
    return all.filter((r) => {
      const ts = this.extractTimestamp(r);
      return ts !== null && ts >= cutoffMs;
    });
  }

  private fileFor(date: Date): string {
    const iso = date.toISOString();
    const day = iso.split("T")[0] ?? "unknown";
    return path.join(this.dir, `${this.streamName}-${day}.jsonl`);
  }

  /**
   * Try to extract an ms-epoch timestamp from common field names used in
   * this codebase (publishedAt, fetchedAt, timestamp, createdAt).
   */
  private extractTimestamp(record: T): number | null {
    const r = record as unknown as Record<string, unknown>;
    const candidates = ["publishedAt", "fetchedAt", "timestamp", "createdAt"];
    for (const key of candidates) {
      const val = r[key];
      if (typeof val === "string") {
        const ms = Date.parse(val);
        if (Number.isFinite(ms)) return ms;
      }
      if (typeof val === "number") return val;
    }
    return null;
  }
}
