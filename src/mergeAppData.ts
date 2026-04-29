import type {
  AppData,
  Account,
  AccountId,
  Transaction,
  TransactionId,
} from "./types";
import {
  buildDeletedAccountSet,
  buildDeletedTransactionSet,
  mergeDeletedAccounts,
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
  const deletedAccountSet = buildDeletedAccountSet(deletedAccounts);
  const deletedTransactionSet =
    buildDeletedTransactionSet(deletedTransactions);

  return {
    accounts: mergeAccounts(local.accounts, cloud.accounts, deletedAccountSet),
    transactions: mergeTransactions(
      local.transactions,
      cloud.transactions,
      deletedAccountSet,
      deletedTransactionSet,
    ),
    deletedAccounts,
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

function mergeTransactions(
  localTransactions: ReadonlyArray<Transaction>,
  cloudTransactions: ReadonlyArray<Transaction>,
  deletedAccountSet: ReadonlySet<AccountId>,
  deletedTransactionSet: ReadonlySet<TransactionId>,
): Transaction[] {
  const liveCloudTransactions = cloudTransactions.filter((tx) =>
    isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
  );
  const cloudIds = new Set<TransactionId>(
    liveCloudTransactions.map((t) => t.id),
  );
  const localOnly = localTransactions.filter(
    (tx) =>
      !cloudIds.has(tx.id) &&
      isLiveTransaction(tx, deletedAccountSet, deletedTransactionSet),
  );
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
