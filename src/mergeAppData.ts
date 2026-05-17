import type {
  AppData,
  Account,
  AccountId,
  Category,
  CategoryId,
  Transaction,
  TransactionId,
} from "./types";
import { normalizeCategoryLookupKey } from "./types";
import {
  buildDeletedAccountSet,
  buildDeletedCategoryNameSet,
  buildDeletedCategorySet,
  buildDeletedTransactionSet,
  mergeDeletedAccounts,
  mergeDeletedCategories,
  mergeDeletedTransactions,
} from "./deletedEntries";

type ConflictWinner = "local" | "cloud";

interface MergeAppDataOptions {
  conflictWinner?: ConflictWinner;
}

/**
 * Merges local and cloud AppData so that no live data is ever lost.
 * Mostly additive: items that exist in either source are kept unless a
 * deletion tombstone says that item was intentionally removed.
 * For items with the same ID in both, conflictWinner decides which source wins.
 */
export function mergeAppData(
  local: AppData,
  cloud: AppData,
  options: MergeAppDataOptions = {},
): AppData {
  const conflictWinner = options.conflictWinner ?? "cloud";
  const deletedAccounts = mergeDeletedAccounts(
    local.deletedAccounts ?? [],
    cloud.deletedAccounts ?? [],
  );
  const deletedTransactions = mergeDeletedTransactions(
    local.deletedTransactions ?? [],
    cloud.deletedTransactions ?? [],
  );
  const deletedCategories = mergeDeletedCategories(
    local.deletedCategories ?? [],
    cloud.deletedCategories ?? [],
  );
  const deletedAccountSet = buildDeletedAccountSet(deletedAccounts);
  const deletedCategorySet = buildDeletedCategorySet(deletedCategories);
  const deletedTransactionSet =
    buildDeletedTransactionSet(deletedTransactions);
  const categories = mergeCategories(
    local.categories,
    cloud.categories,
    deletedCategorySet,
    conflictWinner,
  );
  const liveCategoryNames = new Set(
    categories.map((category) => normalizeCategoryLookupKey(category.name)),
  );
  const deletedCategoryNameSet = new Set(
    [...buildDeletedCategoryNameSet(deletedCategories)].filter(
      (name) => !liveCategoryNames.has(name),
    ),
  );

  return {
    accounts: mergeAccounts(
      local.accounts,
      cloud.accounts,
      deletedAccountSet,
      conflictWinner,
    ),
    categories,
    transactions: mergeTransactions(
      local.transactions,
      cloud.transactions,
      deletedAccountSet,
      deletedCategoryNameSet,
      deletedTransactionSet,
      conflictWinner,
    ),
    deletedAccounts,
    deletedCategories,
    deletedTransactions,
  };
}

function sourcesByWinner<T>(
  localItems: ReadonlyArray<T>,
  cloudItems: ReadonlyArray<T>,
  conflictWinner: ConflictWinner,
): [ReadonlyArray<T>, ReadonlyArray<T>] {
  return conflictWinner === "local"
    ? [localItems, cloudItems]
    : [cloudItems, localItems];
}

function mergeAccounts(
  localAccounts: ReadonlyArray<Account>,
  cloudAccounts: ReadonlyArray<Account>,
  deletedAccountSet: ReadonlySet<AccountId>,
  conflictWinner: ConflictWinner,
): Account[] {
  const [preferredAccounts, fallbackAccounts] = sourcesByWinner(
    localAccounts,
    cloudAccounts,
    conflictWinner,
  );
  const livePreferredAccounts = preferredAccounts.filter(
    (account) => !deletedAccountSet.has(account.id),
  );
  const preferredIds = new Set<AccountId>(
    livePreferredAccounts.map((a) => a.id),
  );
  const fallbackOnly = fallbackAccounts.filter((a) => !preferredIds.has(a.id));
  return [
    ...livePreferredAccounts,
    ...fallbackOnly.filter((account) => !deletedAccountSet.has(account.id)),
  ];
}

function mergeCategories(
  localCategories: ReadonlyArray<Category>,
  cloudCategories: ReadonlyArray<Category>,
  deletedCategorySet: ReadonlySet<CategoryId>,
  conflictWinner: ConflictWinner,
): Category[] {
  const [preferredCategories, fallbackCategories] = sourcesByWinner(
    localCategories,
    cloudCategories,
    conflictWinner,
  );
  const livePreferredCategories = preferredCategories.filter(
    (category) => !deletedCategorySet.has(category.id),
  );
  const preferredIds = new Set<CategoryId>(
    livePreferredCategories.map((c) => c.id),
  );
  const preferredNames = new Set(
    livePreferredCategories.map((category) =>
      normalizeCategoryLookupKey(category.name),
    ),
  );
  const fallbackOnly = fallbackCategories.filter(
    (category) =>
      !preferredIds.has(category.id) &&
      !preferredNames.has(normalizeCategoryLookupKey(category.name)) &&
      !deletedCategorySet.has(category.id),
  );
  return [...livePreferredCategories, ...fallbackOnly];
}

function mergeTransactions(
  localTransactions: ReadonlyArray<Transaction>,
  cloudTransactions: ReadonlyArray<Transaction>,
  deletedAccountSet: ReadonlySet<AccountId>,
  deletedCategoryNameSet: ReadonlySet<string>,
  deletedTransactionSet: ReadonlySet<TransactionId>,
  conflictWinner: ConflictWinner,
): Transaction[] {
  const [preferredTransactions, fallbackTransactions] = sourcesByWinner(
    localTransactions,
    cloudTransactions,
    conflictWinner,
  );
  const livePreferredTransactions = preferredTransactions
    .filter((tx) =>
      isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
    )
    .map((tx) => clearDeletedCategory(tx, deletedCategoryNameSet));
  const preferredIds = new Set<TransactionId>(
    livePreferredTransactions.map((t) => t.id),
  );
  const fallbackOnly = fallbackTransactions
    .filter(
      (tx) =>
        !preferredIds.has(tx.id) &&
        isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
    )
    .map((tx) => clearDeletedCategory(tx, deletedCategoryNameSet));
  return [...livePreferredTransactions, ...fallbackOnly];
}

function isLiveTransaction(
  transaction: Transaction,
  deletedAccountSet: ReadonlySet<AccountId>,
  deletedTransactionSet: ReadonlySet<TransactionId>,
): boolean {
  return (
    !deletedTransactionSet.has(transaction.id) &&
    (transaction.fromAccountId == null ||
      !deletedAccountSet.has(transaction.fromAccountId)) &&
    (transaction.toAccountId == null ||
      !deletedAccountSet.has(transaction.toAccountId))
  );
}

function clearDeletedCategory(
  transaction: Transaction,
  deletedCategoryNameSet: ReadonlySet<string>,
): Transaction {
  if (
    transaction.category == null ||
    !deletedCategoryNameSet.has(normalizeCategoryLookupKey(transaction.category))
  ) {
    return transaction;
  }

  return { ...transaction, category: undefined };
}
