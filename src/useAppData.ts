import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  AppData,
  Account,
  AccountId,
  Category,
  CategoryId,
  Transaction,
  TransactionId,
} from "./types";
import {
  cleanCategoryName,
  generateId,
  normalizeCategoryLookupKey,
} from "./types";
import { loadAppData, saveAppData, StorageQuotaError } from "./storage";
import { loadCloudData, saveCloudData } from "./cloudStorage";
import { mergeAppData } from "./mergeAppData";
import { useAuth } from "./auth";
import type { ParsedCsvTransaction } from "./importTransactionsCsv";
import {
  upsertDeletedAccount,
  upsertDeletedCategory,
  upsertDeletedTransaction,
} from "./deletedEntries";
import {
  accountBaseName,
  inferCurrencyFromAccountName,
  normalizeAccountLookupKey,
} from "./importTransactionsCsv";

export interface ImportTransactionsResult {
  transactionsImported: number;
  accountsCreated: number;
  accountsMatched: number;
}

function categoryNamesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalizeCategoryLookupKey(left) === normalizeCategoryLookupKey(right);
}

function appendMissingCategories(
  categories: ReadonlyArray<Category>,
  names: ReadonlyArray<string | null | undefined>,
  createdAt: string,
): Category[] {
  const next = [...categories];
  const existingNames = new Set(
    next.map((category) => normalizeCategoryLookupKey(category.name)),
  );

  for (const rawName of names) {
    const name = cleanCategoryName(rawName);
    const key = normalizeCategoryLookupKey(name);
    if (key.length === 0 || existingNames.has(key)) continue;
    next.push({
      id: generateId() as CategoryId,
      name,
      createdAt,
    });
    existingNames.add(key);
  }

  return next;
}

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
        .then((savedData) => {
          if (pendingCloudSave.current != null) return;
          try {
            saveAppData(savedData);
            setData(savedData);
            setStorageError(null);
          } catch (e) {
            if (e instanceof StorageQuotaError) {
              setStorageError(e.message);
            } else {
              throw e;
            }
          }
        })
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
        balances.set(tx.fromAccountId, current - (tx.fromAmount ?? 0));
      }
      if (tx.toAccountId != null) {
        const current = balances.get(tx.toAccountId) ?? 0;
        balances.set(tx.toAccountId, current + (tx.toAmount ?? 0));
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
      const deletedAt = new Date().toISOString();
      const transactionsToDelete = data.transactions.filter(
        (tx) =>
          tx.fromAccountId === accountId || tx.toAccountId === accountId,
      );
      const deletedTransactions = transactionsToDelete.reduce(
        (entries, tx) =>
          upsertDeletedTransaction(entries, {
            transactionId: tx.id,
            deletedAt,
          }),
        data.deletedTransactions ?? [],
      );

      persist({
        ...data,
        deletedAccounts: upsertDeletedAccount(data.deletedAccounts ?? [], {
          accountId,
          deletedAt,
        }),
        deletedTransactions,
        accounts: data.accounts.filter((a) => a.id !== accountId),
        transactions: data.transactions.filter(
          (tx) =>
            tx.fromAccountId !== accountId && tx.toAccountId !== accountId,
        ),
      });
    },
    [data, persist],
  );

  // --- Category CRUD ---

  const addCategory = useCallback(
    (input: Omit<Category, "id" | "createdAt">) => {
      const name = cleanCategoryName(input.name);
      const existing = data.categories.find((category) =>
        categoryNamesMatch(category.name, name),
      );
      if (existing != null) return existing;

      const newCategory: Category = {
        id: generateId() as CategoryId,
        name,
        createdAt: new Date().toISOString(),
      };
      persist({ ...data, categories: [...data.categories, newCategory] });
      return newCategory;
    },
    [data, persist],
  );

  const updateCategory = useCallback(
    (
      categoryId: CategoryId,
      updates: Partial<Omit<Category, "id" | "createdAt">>,
    ) => {
      const category = data.categories.find((c) => c.id === categoryId);
      if (category == null) return;

      const nextName = cleanCategoryName(updates.name ?? category.name);
      if (nextName.length === 0) return;

      persist({
        ...data,
        categories: data.categories.map((c) =>
          c.id === categoryId ? { ...c, name: nextName } : c,
        ),
        transactions: data.transactions.map((tx) =>
          categoryNamesMatch(tx.category, category.name)
            ? { ...tx, category: nextName }
            : tx,
        ),
      });
    },
    [data, persist],
  );

  const deleteCategory = useCallback(
    (categoryId: CategoryId) => {
      const category = data.categories.find((c) => c.id === categoryId);
      if (category == null) return;

      const deletedAt = new Date().toISOString();
      persist({
        ...data,
        deletedCategories: upsertDeletedCategory(
          data.deletedCategories ?? [],
          {
            categoryId,
            name: category.name,
            deletedAt,
          },
        ),
        categories: data.categories.filter((c) => c.id !== categoryId),
        transactions: data.transactions.map((tx) =>
          categoryNamesMatch(tx.category, category.name)
            ? { ...tx, category: undefined }
            : tx,
        ),
      });
    },
    [data, persist],
  );

  // --- Transaction CRUD ---

  const addTransaction = useCallback(
    (input: Omit<Transaction, "id" | "createdAt">) => {
      const createdAt = new Date().toISOString();
      const newTransaction: Transaction = {
        ...input,
        id: generateId() as TransactionId,
        category: cleanCategoryName(input.category) || undefined,
        createdAt,
      };
      const categories = appendMissingCategories(
        data.categories,
        [newTransaction.category],
        createdAt,
      );
      persist({
        ...data,
        categories,
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
      const hasCategoryUpdate = "category" in updates;
      const cleanUpdates = hasCategoryUpdate
        ? {
            ...updates,
            category:
              updates.category == null
                ? updates.category
                : cleanCategoryName(updates.category) || undefined,
          }
        : updates;
      const categories = appendMissingCategories(
        data.categories,
        hasCategoryUpdate ? [cleanUpdates.category] : [],
        new Date().toISOString(),
      );
      persist({
        ...data,
        categories,
        transactions: data.transactions.map((tx) =>
          tx.id === transactionId ? { ...tx, ...cleanUpdates } : tx,
        ),
      });
    },
    [data, persist],
  );

  const deleteTransaction = useCallback(
    (transactionId: TransactionId) => {
      const deletedAt = new Date().toISOString();
      persist({
        ...data,
        deletedTransactions: upsertDeletedTransaction(
          data.deletedTransactions ?? [],
          {
            transactionId,
            deletedAt,
          },
        ),
        transactions: data.transactions.filter(
          (tx) => tx.id !== transactionId,
        ),
      });
    },
    [data, persist],
  );

  const importTransactions = useCallback(
    (
      rows: ReadonlyArray<ParsedCsvTransaction>,
      defaultCurrency: string,
    ): ImportTransactionsResult => {
      const fallbackCurrency = defaultCurrency.trim().toUpperCase() || "ARS";
      const createdAt = new Date().toISOString();
      const nextAccounts = [...data.accounts];
      const exactAccounts = new Map<string, Account>();
      const baseCurrencyAccounts = new Map<string, Account>();
      const existingExactAccountKeys = new Set<string>();
      const existingBaseCurrencyKeys = new Set<string>();
      const matchedAccountNames = new Set<string>();
      const createdAccountNames = new Set<string>();

      function indexAccount(account: Account) {
        exactAccounts.set(normalizeAccountLookupKey(account.name), account);
        baseCurrencyAccounts.set(
          `${normalizeAccountLookupKey(accountBaseName(account.name))}|${account.currency.toUpperCase()}`,
          account,
        );
      }

      for (const account of nextAccounts) {
        indexAccount(account);
        existingExactAccountKeys.add(normalizeAccountLookupKey(account.name));
        existingBaseCurrencyKeys.add(
          `${normalizeAccountLookupKey(accountBaseName(account.name))}|${account.currency.toUpperCase()}`,
        );
      }

      function resolveAccount(accountName: string | null): Account | null {
        if (accountName == null) return null;

        const lookupKey = normalizeAccountLookupKey(accountName);
        const exactAccount = exactAccounts.get(lookupKey);
        if (exactAccount != null) {
          if (existingExactAccountKeys.has(lookupKey)) {
            matchedAccountNames.add(lookupKey);
          }
          return exactAccount;
        }

        const currency = inferCurrencyFromAccountName(accountName, fallbackCurrency);
        const baseCurrencyKey = `${normalizeAccountLookupKey(accountBaseName(accountName))}|${currency}`;
        const baseCurrencyAccount = baseCurrencyAccounts.get(baseCurrencyKey);
        if (baseCurrencyAccount != null) {
          if (existingBaseCurrencyKeys.has(baseCurrencyKey)) {
            matchedAccountNames.add(lookupKey);
          }
          return baseCurrencyAccount;
        }

        const newAccount: Account = {
          id: generateId() as AccountId,
          name: accountName,
          currency,
          createdAt,
        };
        nextAccounts.push(newAccount);
        indexAccount(newAccount);
        createdAccountNames.add(lookupKey);
        return newAccount;
      }

      const importedTransactions: Transaction[] = rows.map((row) => {
        const fromAccount = resolveAccount(row.fromAccountName);
        const toAccount = resolveAccount(row.toAccountName);

        return {
          id: generateId() as TransactionId,
          date: row.date,
          fromAccountId: fromAccount?.id ?? null,
          toAccountId: toAccount?.id ?? null,
          fromAmount: fromAccount == null ? null : row.fromAmount,
          toAmount: toAccount == null ? null : row.toAmount,
          fromCurrency: fromAccount?.currency ?? null,
          toCurrency: toAccount?.currency ?? null,
          category: row.category,
          description: row.description,
          createdAt,
        };
      });

      const nextCategories = appendMissingCategories(
        data.categories,
        importedTransactions.map((tx) => tx.category),
        createdAt,
      );

      persist({
        ...data,
        accounts: nextAccounts,
        categories: nextCategories,
        transactions: [...data.transactions, ...importedTransactions],
      });

      return {
        transactionsImported: importedTransactions.length,
        accountsCreated: createdAccountNames.size,
        accountsMatched: matchedAccountNames.size,
      };
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
    addCategory,
    updateCategory,
    deleteCategory,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactions,
    setStorageError,
  };
}
