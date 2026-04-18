import type {
  AppData,
  Account,
  AccountId,
  Transaction,
  TransactionId,
} from "./types";

/**
 * Merges local and cloud AppData so that no data is ever lost.
 * Purely additive: items that exist in either source are kept.
 * For items with the same ID in both, cloud wins (most recently synced).
 */
export function mergeAppData(local: AppData, cloud: AppData): AppData {
  return {
    accounts: mergeAccounts(local.accounts, cloud.accounts),
    transactions: mergeTransactions(local.transactions, cloud.transactions),
  };
}

function mergeAccounts(
  localAccounts: ReadonlyArray<Account>,
  cloudAccounts: ReadonlyArray<Account>,
): Account[] {
  const cloudIds = new Set<AccountId>(cloudAccounts.map((a) => a.id));
  const localOnly = localAccounts.filter((a) => !cloudIds.has(a.id));
  return [...cloudAccounts, ...localOnly];
}

function mergeTransactions(
  localTransactions: ReadonlyArray<Transaction>,
  cloudTransactions: ReadonlyArray<Transaction>,
): Transaction[] {
  const cloudIds = new Set<TransactionId>(cloudTransactions.map((t) => t.id));
  const localOnly = localTransactions.filter((t) => !cloudIds.has(t.id));
  return [...cloudTransactions, ...localOnly];
}
