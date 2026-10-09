import type { AppData } from "./types";
import { normalizeAppData } from "./types";

const STORAGE_KEY = "dineros-data";
const BACKUP_KEY = "dineros-data-backup";
const CORRUPT_RECOVERY_KEY = "dineros-data-corrupt-recovery";

export function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" ||
      e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e.code === 22)
  );
}

/**
 * This app's bytes vs. everybody else's on the shared origin (UTF-16, so
 * chars × 2). Reads lengths only.
 */
export function storageUsage(isMine: (key: string) => boolean): {
  mine: number;
  others: number;
} {
  let mine = 0;
  let others = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const bytes = (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
      if (isMine(key)) mine += bytes;
      else others += bytes;
    }
  } catch {
    /* storage blocked */
  }
  return { mine, others };
}

export function isDinerosKey(key: string): boolean {
  return key.startsWith("dineros-");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The bytes that filled the shared quota may be another app's, so the
 * message says who uses what instead of telling the user to delete records.
 */
export function quotaMessage(usage: { mine: number; others: number }): string {
  return `This browser is out of space for this site. All apps on mred-randomprojects.github.io share about 5 MB: this one uses ${formatBytes(usage.mine)}, the others ${formatBytes(usage.others)}.`;
}

export class StorageQuotaError extends Error {
  constructor(message: string = quotaMessage(storageUsage(isDinerosKey))) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    if (isQuotaError(e)) {
      throw new StorageQuotaError();
    }
    throw e;
  }
}

const DEFAULT_APP_DATA: AppData = {
  accounts: [],
  categories: [],
  transactions: [],
  recurringExpenses: [],
  deletedAccounts: [],
  deletedCategories: [],
  deletedTransactions: [],
  deletedRecurringExpenses: [],
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
