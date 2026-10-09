import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportCounts,
  exportFileName,
  serializeExport,
  writeExport,
  type ExportSnapshot,
} from "./export";

// Made-up document; no real data.
const snapshot: ExportSnapshot = {
  exportedAt: "2026-10-10T01:30:00.000Z",
  document: "users/test-uid/data/appData",
  data: {
    accounts: [{ id: "acc-1", name: "Cash", currency: "ARS" }],
    transactions: [
      { id: "tx-1", amount: 10, description: "legacy shape is kept as is" },
      { id: "tx-2", fromAmount: 5, someFutureField: { nested: true } },
    ],
    deletedTransactions: [],
    notAList: "kept too",
  },
};

describe("exportFileName", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("uses the local calendar day, not the UTC one", () => {
    process.env.TZ = "America/Argentina/Buenos_Aires";
    // 22:30 on Oct 9 in Buenos Aires is already Oct 10 in UTC.
    expect(exportFileName(new Date("2026-10-10T01:30:00Z"))).toBe(
      "dineros-2026-10-09.json",
    );
  });

  it("numbers further copies of the same day", () => {
    const date = new Date(2026, 0, 5, 12, 0);
    expect(exportFileName(date, 1)).toBe("dineros-2026-01-05.json");
    expect(exportFileName(date, 2)).toBe("dineros-2026-01-05-2.json");
  });
});

describe("serializeExport", () => {
  it("round-trips the document untouched, unknown fields included", () => {
    const text = serializeExport(snapshot);
    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(snapshot);
  });

  it("counts the records in each list", () => {
    expect(exportCounts(snapshot.data)).toEqual({
      accounts: 1,
      transactions: 2,
      deletedTransactions: 0,
    });
  });
});

describe("writeExport", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir != null) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("creates the folder, writes a private file and never overwrites an earlier one", async () => {
    dir = await mkdtemp(join(tmpdir(), "dineros-export-test-"));
    const out = join(dir, "nested", "exports");
    const date = new Date(2026, 9, 9, 22, 30);

    const first = await writeExport(out, "first\n", date);
    const second = await writeExport(out, "second\n", date);

    expect(first).toBe(join(out, "dineros-2026-10-09.json"));
    expect(second).toBe(join(out, "dineros-2026-10-09-2.json"));
    expect(await readFile(first, "utf8")).toBe("first\n");
    expect(await readFile(second, "utf8")).toBe("second\n");
    expect((await stat(first)).mode & 0o777).toBe(0o600);
    expect((await readdir(out)).sort()).toEqual([
      "dineros-2026-10-09-2.json",
      "dineros-2026-10-09.json",
    ]);
  });
});
