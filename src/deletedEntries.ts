import type {
  AccountId,
  AppData,
  CategoryId,
  DeletedAccount,
  DeletedCategory,
  DeletedTransaction,
  TransactionId,
} from "./types";
import { normalizeCategoryLookupKey } from "./types";

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

export function buildDeletedCategorySet(
  deletedCategories: ReadonlyArray<DeletedCategory>,
): Set<CategoryId> {
  return new Set(deletedCategories.map((entry) => entry.categoryId));
}

export function buildDeletedCategoryNameSet(
  deletedCategories: ReadonlyArray<DeletedCategory>,
): Set<string> {
  return new Set(
    deletedCategories
      .map((entry) => normalizeCategoryLookupKey(entry.name))
      .filter((name) => name.length > 0),
  );
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

export function mergeDeletedCategories(
  localDeletedCategories: ReadonlyArray<DeletedCategory>,
  cloudDeletedCategories: ReadonlyArray<DeletedCategory>,
): DeletedCategory[] {
  const byId = new Map<CategoryId, DeletedCategory>();

  for (const deletedCategory of [
    ...localDeletedCategories,
    ...cloudDeletedCategories,
  ]) {
    const existing = byId.get(deletedCategory.categoryId);
    if (existing == null || deletedCategory.deletedAt > existing.deletedAt) {
      byId.set(deletedCategory.categoryId, deletedCategory);
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

export function upsertDeletedCategory(
  deletedCategories: ReadonlyArray<DeletedCategory>,
  deletedCategory: DeletedCategory,
): DeletedCategory[] {
  return [
    ...deletedCategories.filter(
      (entry) => entry.categoryId !== deletedCategory.categoryId,
    ),
    deletedCategory,
  ];
}

export function filterDeletedEntriesFromAppData(
  data: AppData,
  deletedAccounts: ReadonlyArray<DeletedAccount>,
  deletedCategories: ReadonlyArray<DeletedCategory>,
  deletedTransactions: ReadonlyArray<DeletedTransaction>,
): AppData {
  const deletedAccountSet = buildDeletedAccountSet(deletedAccounts);
  const deletedCategorySet = buildDeletedCategorySet(deletedCategories);
  const deletedTransactionSet =
    buildDeletedTransactionSet(deletedTransactions);
  const categories = data.categories.filter(
    (category) => !deletedCategorySet.has(category.id),
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
    ...data,
    deletedAccounts: [...deletedAccounts],
    deletedCategories: [...deletedCategories],
    deletedTransactions: [...deletedTransactions],
    accounts: data.accounts.filter(
      (account) => !deletedAccountSet.has(account.id),
    ),
    categories,
    transactions: data.transactions
      .filter(
        (transaction) =>
          !deletedTransactionSet.has(transaction.id) &&
          (transaction.fromAccountId == null ||
            !deletedAccountSet.has(transaction.fromAccountId)) &&
          (transaction.toAccountId == null ||
            !deletedAccountSet.has(transaction.toAccountId)),
      )
      .map((transaction) =>
        transaction.category != null &&
        deletedCategoryNameSet.has(
          normalizeCategoryLookupKey(transaction.category),
        )
          ? { ...transaction, category: undefined }
          : transaction,
      ),
  };
}
