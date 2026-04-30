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

/**
 * Merges local and cloud AppData so that no live data is ever lost.
 * Mostly additive: items that exist in either source are kept unless a
 * deletion tombstone says that item was intentionally removed.
 * For items with the same ID in both, cloud wins (most recently synced).
 */
export function mergeAppData(local: AppData, cloud: AppData): AppData {
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
    accounts: mergeAccounts(local.accounts, cloud.accounts, deletedAccountSet),
    categories,
    transactions: mergeTransactions(
      local.transactions,
      cloud.transactions,
      deletedAccountSet,
      deletedCategoryNameSet,
      deletedTransactionSet,
    ),
    deletedAccounts,
    deletedCategories,
    deletedTransactions,
  };
}

function mergeAccounts(
  localAccounts: ReadonlyArray<Account>,
  cloudAccounts: ReadonlyArray<Account>,
  deletedAccountSet: ReadonlySet<AccountId>,
): Account[] {
  const liveCloudAccounts = cloudAccounts.filter(
    (account) => !deletedAccountSet.has(account.id),
  );
  const cloudIds = new Set<AccountId>(liveCloudAccounts.map((a) => a.id));
  const localOnly = localAccounts.filter((a) => !cloudIds.has(a.id));
  return [
    ...liveCloudAccounts,
    ...localOnly.filter((account) => !deletedAccountSet.has(account.id)),
  ];
}

function mergeCategories(
  localCategories: ReadonlyArray<Category>,
  cloudCategories: ReadonlyArray<Category>,
  deletedCategorySet: ReadonlySet<CategoryId>,
): Category[] {
  const liveCloudCategories = cloudCategories.filter(
    (category) => !deletedCategorySet.has(category.id),
  );
  const cloudIds = new Set<CategoryId>(liveCloudCategories.map((c) => c.id));
  const cloudNames = new Set(
    liveCloudCategories.map((category) =>
      normalizeCategoryLookupKey(category.name),
    ),
  );
  const localOnly = localCategories.filter(
    (category) =>
      !cloudIds.has(category.id) &&
      !cloudNames.has(normalizeCategoryLookupKey(category.name)) &&
      !deletedCategorySet.has(category.id),
  );
  return [...liveCloudCategories, ...localOnly];
}

function mergeTransactions(
  localTransactions: ReadonlyArray<Transaction>,
  cloudTransactions: ReadonlyArray<Transaction>,
  deletedAccountSet: ReadonlySet<AccountId>,
  deletedCategoryNameSet: ReadonlySet<string>,
  deletedTransactionSet: ReadonlySet<TransactionId>,
): Transaction[] {
  const liveCloudTransactions = cloudTransactions
    .filter((tx) =>
      isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
    )
    .map((tx) => clearDeletedCategory(tx, deletedCategoryNameSet));
  const cloudIds = new Set<TransactionId>(
    liveCloudTransactions.map((t) => t.id),
  );
  const localOnly = localTransactions
    .filter(
      (tx) =>
        !cloudIds.has(tx.id) &&
        isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
    )
    .map((tx) => clearDeletedCategory(tx, deletedCategoryNameSet));
  return [...liveCloudTransactions, ...localOnly];
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
