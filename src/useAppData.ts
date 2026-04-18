import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  AppData,
  Account,
  AccountId,
  Transaction,
  TransactionId,
} from "./types";
import { generateId } from "./types";
import { loadAppData, saveAppData, StorageQuotaError } from "./storage";
import { loadCloudData, saveCloudData } from "./cloudStorage";
import { mergeAppData } from "./mergeAppData";
import { useAuth } from "./auth";

/**
 * Central hook that owns all app state and persists to both
 * localStorage (immediate, offline-capable) and Firestore (async, cloud sync).
 * Every mutation returns a new AppData (immutable updates).
 */
export function useAppData() {
  const { user } = useAuth();
  const [data, setData] = useState<AppData>(loadAppData);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [cloudSynced, setCloudSynced] = useState(false);
  const cloudSaveInFlight = useRef(false);
  const pendingCloudSave = useRef<AppData | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);

  const flushCloudSave = useCallback(
    (uid: string, dataToSave: AppData) => {
      cloudSaveInFlight.current = true;
      setCloudSyncing(true);
      saveCloudData(uid, dataToSave)
        .catch((err: unknown) => {
          console.error("[cloud-sync] save failed:", err);
        })
        .finally(() => {
          const queued = pendingCloudSave.current;
          pendingCloudSave.current = null;
          if (queued != null) {
            flushCloudSave(uid, queued);
          } else {
            cloudSaveInFlight.current = false;
            setCloudSyncing(false);
          }
        });
    },
    [],
  );

  useEffect(() => {
    if (user == null || cloudSynced) return;

    let cancelled = false;
    loadCloudData(user.uid)
      .then((cloudData) => {
        if (cancelled) return;
        const local = loadAppData();
        if (cloudData != null) {
          const merged = mergeAppData(local, cloudData);
          setData(merged);
          saveAppData(merged);
          saveCloudData(user.uid, merged).catch((err: unknown) =>
            console.error("[cloud-sync] initial merge push failed:", err),
          );
        } else {
          saveCloudData(user.uid, local).catch((err: unknown) =>
            console.error("[cloud-sync] initial upload failed:", err),
          );
        }
        setCloudSynced(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[cloud-sync] initial load failed:", err);
        setCloudSynced(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user, cloudSynced]);

  const persist = useCallback(
    (next: AppData) => {
      try {
        saveAppData(next);
        setData(next);
        setStorageError(null);
      } catch (e) {
        if (e instanceof StorageQuotaError) {
          setStorageError(e.message);
        } else {
          throw e;
        }
      }

      if (user != null) {
        if (cloudSaveInFlight.current) {
          pendingCloudSave.current = next;
        } else {
          flushCloudSave(user.uid, next);
        }
      }
    },
    [user, flushCloudSave],
  );

  const forceCloudSync = useCallback(() => {
    if (user == null) return;
    flushCloudSave(user.uid, data);
  }, [user, data, flushCloudSave]);

  const accountBalances = useMemo(() => {
    const balances = new Map<AccountId, number>();
    for (const account of data.accounts) {
      balances.set(account.id, 0);
    }
    for (const tx of data.transactions) {
      if (tx.fromAccountId != null) {
        const current = balances.get(tx.fromAccountId) ?? 0;
        balances.set(tx.fromAccountId, current - tx.amount);
      }
      if (tx.toAccountId != null) {
        const current = balances.get(tx.toAccountId) ?? 0;
        balances.set(tx.toAccountId, current + tx.amount);
      }
    }
    return balances;
  }, [data.accounts, data.transactions]);

  const accountsMap = useMemo(() => {
    const map = new Map<AccountId, Account>();
    for (const account of data.accounts) {
      map.set(account.id, account);
    }
    return map;
  }, [data.accounts]);

  // --- Account CRUD ---

  const addAccount = useCallback(
    (input: Omit<Account, "id" | "createdAt">) => {
      const newAccount: Account = {
        ...input,
        id: generateId() as AccountId,
        createdAt: new Date().toISOString(),
      };
      persist({ ...data, accounts: [...data.accounts, newAccount] });
      return newAccount;
    },
    [data, persist],
  );

  const updateAccount = useCallback(
    (
      accountId: AccountId,
      updates: Partial<Omit<Account, "id" | "createdAt">>,
    ) => {
      persist({
        ...data,
        accounts: data.accounts.map((a) =>
          a.id === accountId ? { ...a, ...updates } : a,
        ),
      });
    },
    [data, persist],
  );

  const deleteAccount = useCallback(
    (accountId: AccountId) => {
      persist({
        ...data,
        accounts: data.accounts.filter((a) => a.id !== accountId),
        transactions: data.transactions.filter(
          (tx) =>
            tx.fromAccountId !== accountId && tx.toAccountId !== accountId,
        ),
      });
    },
    [data, persist],
  );

  // --- Transaction CRUD ---

  const addTransaction = useCallback(
    (input: Omit<Transaction, "id" | "createdAt">) => {
      const newTransaction: Transaction = {
        ...input,
        id: generateId() as TransactionId,
        createdAt: new Date().toISOString(),
      };
      persist({
        ...data,
        transactions: [...data.transactions, newTransaction],
      });
      return newTransaction;
    },
    [data, persist],
  );

  const updateTransaction = useCallback(
    (
      transactionId: TransactionId,
      updates: Partial<Omit<Transaction, "id" | "createdAt">>,
    ) => {
      persist({
        ...data,
        transactions: data.transactions.map((tx) =>
          tx.id === transactionId ? { ...tx, ...updates } : tx,
        ),
      });
    },
    [data, persist],
  );

  const deleteTransaction = useCallback(
    (transactionId: TransactionId) => {
      persist({
        ...data,
        transactions: data.transactions.filter(
          (tx) => tx.id !== transactionId,
        ),
      });
    },
    [data, persist],
  );

  return {
    data,
    storageError,
    cloudSyncing,
    accountBalances,
    accountsMap,
    forceCloudSync,
    addAccount,
    updateAccount,
    deleteAccount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    setStorageError,
  };
}
