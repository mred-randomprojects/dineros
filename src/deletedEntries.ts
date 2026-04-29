import type {
  AccountId,
  AppData,
  DeletedAccount,
  DeletedTransaction,
  TransactionId,
} from "./types";

export function buildDeletedAccountSet(
  deletedAccounts: ReadonlyArray<DeletedAccount>,
): Set<AccountId> {
  return new Set(deletedAccounts.map((entry) => entry.accountId));
}

export function buildDeletedTransactionSet(
  deletedTransactions: ReadonlyArray<DeletedTransaction>,
): Set<TransactionId> {
  return new Set(deletedTransactions.map((entry) => entry.transactionId));
}

export function mergeDeletedAccounts(
  localDeletedAccounts: ReadonlyArray<DeletedAccount>,
  cloudDeletedAccounts: ReadonlyArray<DeletedAccount>,
): DeletedAccount[] {
  const byId = new Map<AccountId, DeletedAccount>();

  for (const deletedAccount of [
    ...localDeletedAccounts,
    ...cloudDeletedAccounts,
  ]) {
    const existing = byId.get(deletedAccount.accountId);
    if (existing == null || deletedAccount.deletedAt > existing.deletedAt) {
      byId.set(deletedAccount.accountId, deletedAccount);
    }
  }

  return [...byId.values()];
}

export function mergeDeletedTransactions(
  localDeletedTransactions: ReadonlyArray<DeletedTransaction>,
  cloudDeletedTransactions: ReadonlyArray<DeletedTransaction>,
): DeletedTransaction[] {
  const byId = new Map<TransactionId, DeletedTransaction>();

  for (const deletedTransaction of [
    ...localDeletedTransactions,
    ...cloudDeletedTransactions,
  ]) {
    const existing = byId.get(deletedTransaction.transactionId);
    if (
      existing == null ||
      deletedTransaction.deletedAt > existing.deletedAt
    ) {
      byId.set(deletedTransaction.transactionId, deletedTransaction);
    }
  }

  return [...byId.values()];
}

export function upsertDeletedAccount(
  deletedAccounts: ReadonlyArray<DeletedAccount>,
  deletedAccount: DeletedAccount,
): DeletedAccount[] {
  return [
    ...deletedAccounts.filter(
      (entry) => entry.accountId !== deletedAccount.accountId,
    ),
    deletedAccount,
  ];
}

export function upsertDeletedTransaction(
  deletedTransactions: ReadonlyArray<DeletedTransaction>,
  deletedTransaction: DeletedTransaction,
): DeletedTransaction[] {
  return [
    ...deletedTransactions.filter(
      (entry) => entry.transactionId !== deletedTransaction.transactionId,
    ),
    deletedTransaction,
  ];
}

export function filterDeletedEntriesFromAppData(
  data: AppData,
  deletedAccounts: ReadonlyArray<DeletedAccount>,
  deletedTransactions: ReadonlyArray<DeletedTransaction>,
): AppData {
  const deletedAccountSet = buildDeletedAccountSet(deletedAccounts);
  const deletedTransactionSet =
    buildDeletedTransactionSet(deletedTransactions);

  return {
    ...data,
    deletedAccounts: [...deletedAccounts],
    deletedTransactions: [...deletedTransactions],
    accounts: data.accounts.filter(
      (account) => !deletedAccountSet.has(account.id),
    ),
    transactions: data.transactions.filter(
      (transaction) =>
        !deletedTransactionSet.has(transaction.id) &&
        (transaction.fromAccountId == null ||
          !deletedAccountSet.has(transaction.fromAccountId)) &&
        (transaction.toAccountId == null ||
          !deletedAccountSet.has(transaction.toAccountId)),
    ),
  };
}
