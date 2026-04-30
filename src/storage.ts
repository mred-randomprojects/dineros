import type { AppData } from "./types";
import { normalizeAppData } from "./types";

const STORAGE_KEY = "dineros-data";
const BACKUP_KEY = "dineros-data-backup";
const CORRUPT_RECOVERY_KEY = "dineros-data-corrupt-recovery";

export class StorageQuotaError extends Error {
  constructor() {
    super(
      "localStorage is full — no space left to save your data. Consider deleting old transactions.",
    );
    this.name = "StorageQuotaError";
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      throw new StorageQuotaError();
    }
    throw e;
  }
}

const DEFAULT_APP_DATA: AppData = {
  accounts: [],
  categories: [],
  transactions: [],
  deletedAccounts: [],
  deletedCategories: [],
  deletedTransactions: [],
};

export function loadAppData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return { ...DEFAULT_APP_DATA };

  try {
    return normalizeAppData(JSON.parse(raw));
  } catch {
    try {
      localStorage.setItem(CORRUPT_RECOVERY_KEY, raw);
    } catch {
      // Best-effort; quota may be full.
    }

    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup != null) {
      try {
        return normalizeAppData(JSON.parse(backup));
      } catch {
        // Backup also corrupt — nothing we can do.
      }
    }

    return { ...DEFAULT_APP_DATA };
  }
}

export function saveAppData(data: AppData): void {
  const previous = localStorage.getItem(STORAGE_KEY);
  if (previous != null) {
    try {
      localStorage.setItem(BACKUP_KEY, previous);
    } catch {
      // Best-effort; if quota is tight we still want the primary write to succeed.
    }
  }
  safeSetItem(STORAGE_KEY, JSON.stringify(data));
}

export function getStorageUsage(): { usedBytes: number; quotaBytes: number } {
  let usedBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key == null) continue;
    usedBytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  }
  const quotaBytes = 5 * 1024 * 1024;
  return { usedBytes, quotaBytes };
}
