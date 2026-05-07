import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import type { AppData } from "./types";
import { normalizeAppData } from "./types";
import {
  filterDeletedEntriesFromAppData,
  mergeDeletedAccounts,
  mergeDeletedCategories,
  mergeDeletedTransactions,
} from "./deletedEntries";
import { mergeAppData } from "./mergeAppData";

/**
 * Recursively strips keys whose value is `undefined` so that
 * Firestore's setDoc never sees an unsupported field value.
 */
function stripUndefined(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = stripUndefined(value);
    }
  }
  return clean;
}

function userDocRef(uid: string) {
  return doc(db, "users", uid, "data", "appData");
}

function payloadFromAppData(data: AppData): Record<string, unknown> {
  return stripUndefined({
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.transactions,
    deletedAccounts: data.deletedAccounts,
    deletedCategories: data.deletedCategories,
    deletedTransactions: data.deletedTransactions,
  }) as Record<string, unknown>;
}

export async function loadCloudData(uid: string): Promise<AppData | null> {
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  const raw = snap.data();
  if (raw == null) return null;
  return normalizeAppData(raw);
}

export async function saveCloudData(
  uid: string,
  data: AppData,
): Promise<AppData> {
  const ref = userDocRef(uid);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const cloudData = snap.exists() ? normalizeAppData(snap.data()) : null;
    // Preserve remote tombstones so stale devices cannot resurrect deletes.
    const deletedAccounts = mergeDeletedAccounts(
      data.deletedAccounts ?? [],
      cloudData?.deletedAccounts ?? [],
    );
    const deletedTransactions = mergeDeletedTransactions(
      data.deletedTransactions ?? [],
      cloudData?.deletedTransactions ?? [],
    );
    const deletedCategories = mergeDeletedCategories(
      data.deletedCategories ?? [],
      cloudData?.deletedCategories ?? [],
    );
    const mergedData =
      cloudData == null
        ? {
            ...data,
            deletedAccounts,
            deletedCategories,
            deletedTransactions,
          }
        : mergeAppData(
            {
              ...data,
              deletedAccounts,
              deletedCategories,
              deletedTransactions,
            },
            {
              ...cloudData,
              deletedAccounts,
              deletedCategories,
              deletedTransactions,
            },
          );
    const filteredData = filterDeletedEntriesFromAppData(
      mergedData,
      deletedAccounts,
      deletedCategories,
      deletedTransactions,
    );

    transaction.set(ref, payloadFromAppData(filteredData));
    return filteredData;
  });
}
