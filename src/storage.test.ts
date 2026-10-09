import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatBytes,
  isDinerosKey,
  isQuotaError,
  quotaMessage,
  saveAppData,
  StorageQuotaError,
  storageUsage,
} from "./storage";
import { emptyAppData } from "./testFixtures";

/** In-memory localStorage; `failOn` makes setItem throw a quota error for that key. */
class FakeStorage {
  private items = new Map<string, string>();
  failOn: string | null = null;

  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === this.failOn) {
      throw new DOMException("full", "QuotaExceededError");
    }
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storageUsage", () => {
  it("splits this app's bytes (dineros-*) from every other app's", () => {
    storage.setItem("dineros-data", "x".repeat(100));
    storage.setItem("dineros-data-backup", "y".repeat(50));
    storage.setItem("fulbito-data", "z".repeat(1000));
    storage.setItem("dineros", "not ours: no dash");

    expect(storageUsage(isDinerosKey)).toEqual({
      mine: ("dineros-data".length + 100 + "dineros-data-backup".length + 50) * 2,
      others: ("fulbito-data".length + 1000 + "dineros".length + 17) * 2,
    });
  });
});

describe("quota errors", () => {
  it("recognizes the browsers' quota exceptions only", () => {
    expect(isQuotaError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaError(new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED"))).toBe(true);
    expect(isQuotaError(new DOMException("denied", "SecurityError"))).toBe(false);
    expect(isQuotaError(new Error("QuotaExceededError"))).toBe(false);
  });

  it("says the space is shared and who uses it, without blaming this app's records", () => {
    const message = quotaMessage({ mine: 300 * 1024, others: 4.5 * 1024 * 1024 });
    expect(message).toBe(
      "This browser is out of space for this site. All apps on mred-randomprojects.github.io share about 5 MB: this one uses 300 KB, the others 4.5 MB.",
    );
    expect(message).not.toMatch(/delet|export/i);
    expect(formatBytes(0)).toBe("0 KB");
  });

  it("saveAppData turns a full quota into a StorageQuotaError with that message", () => {
    storage.setItem("other-app", "z".repeat(2048));
    storage.failOn = "dineros-data";

    let caught: unknown = null;
    try {
      saveAppData(emptyAppData());
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(StorageQuotaError);
    expect(caught instanceof Error ? caught.message : "").toBe(
      quotaMessage(storageUsage(isDinerosKey)),
    );
    expect(caught instanceof Error ? caught.message : "").toContain(
      "the others 4 KB",
    );
  });

  it("saveAppData keeps the previous copy as the backup before writing", () => {
    storage.setItem("dineros-data", '{"accounts":[]}');
    saveAppData(emptyAppData());
    expect(storage.getItem("dineros-data-backup")).toBe('{"accounts":[]}');
    expect(JSON.parse(storage.getItem("dineros-data") ?? "null")).toEqual(
      emptyAppData(),
    );
  });
});
