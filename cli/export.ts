import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { todayIso } from "../src/recurrence";

/** `dineros-YYYY-MM-DD.json`, by the local calendar day (not UTC). */
export function exportFileName(date: Date = new Date(), copy = 1): string {
  const suffix = copy > 1 ? `-${copy}` : "";
  return `dineros-${todayIso(date)}${suffix}.json`;
}

export interface ExportSnapshot {
  exportedAt: string;
  /** Firestore path the snapshot was read from. */
  document: string;
  /** The document exactly as stored: nothing normalized, nothing dropped. */
  data: Record<string, unknown>;
}

export function serializeExport(snapshot: ExportSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/** How many records each top-level list in the document holds. */
export function exportCounts(
  data: Record<string, unknown>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

/**
 * Writes the snapshot into `dir` (created if missing) and returns its path.
 * Never overwrites an earlier snapshot: a second export on the same day
 * becomes `dineros-YYYY-MM-DD-2.json`, and so on.
 */
export async function writeExport(
  dir: string,
  contents: string,
  date: Date = new Date(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  for (let copy = 1; copy < 1000; copy += 1) {
    const path = join(dir, exportFileName(date, copy));
    try {
      await writeFile(path, contents, { flag: "wx", mode: 0o600 });
      return path;
    } catch (error: unknown) {
      if (!isAlreadyExists(error)) throw error;
    }
  }
  throw new Error(`Too many exports for ${todayIso(date)} in ${dir}.`);
}
