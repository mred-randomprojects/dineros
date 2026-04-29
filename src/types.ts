export type AccountId = string & { readonly __brand: "AccountId" };
export type TransactionId = string & { readonly __brand: "TransactionId" };

export function generateId(): string {
  return crypto.randomUUID();
}

export interface Account {
  id: AccountId;
  name: string;
  currency: string;
  createdAt: string;
}

export interface Transaction {
  id: TransactionId;
  date: string;
  fromAccountId: AccountId | null;
  toAccountId: AccountId | null;
  fromAmount: number | null;
  toAmount: number | null;
  fromCurrency: string | null;
  toCurrency: string | null;
  category?: string;
  description: string;
  createdAt: string;
}

export interface DeletedAccount {
  accountId: AccountId;
  deletedAt: string;
}

export interface DeletedTransaction {
  transactionId: TransactionId;
  deletedAt: string;
}

export interface AppData {
  accounts: Account[];
  transactions: Transaction[];
  deletedAccounts: DeletedAccount[];
  deletedTransactions: DeletedTransaction[];
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function calculateExchangeRate(
  transaction: Transaction,
): number | null {
  if (
    transaction.fromAmount == null ||
    transaction.toAmount == null ||
    transaction.fromAmount <= 0 ||
    transaction.toAmount <= 0
  ) {
    return null;
  }

  return transaction.fromAmount / transaction.toAmount;
}

type PersistedTransaction = Partial<Transaction> & {
  amount?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableStringValue(value: unknown): string | null {
  return value == null || typeof value !== "string" ? null : value;
}

function nullableNumberValue(value: unknown): number | null {
  return value == null ? null : numberValue(value);
}

function normalizeAccount(raw: unknown): Account | null {
  if (!isRecord(raw)) return null;

  const id = stringValue(raw.id);
  const name = stringValue(raw.name);
  const currency = stringValue(raw.currency);
  if (id == null || name == null || currency == null) return null;

  return {
    id: id as AccountId,
    name,
    currency,
    createdAt: stringValue(raw.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeTransaction(
  raw: unknown,
  accountCurrencies: ReadonlyMap<AccountId, string>,
): Transaction | null {
  if (!isRecord(raw)) return null;

  const persisted = raw as PersistedTransaction;
  const id = stringValue(raw.id);
  const date = stringValue(raw.date);
  const description = stringValue(raw.description);
  const createdAt = stringValue(raw.createdAt);
  if (id == null || date == null || description == null || createdAt == null) {
    return null;
  }

  const fromAccountId =
    stringValue(raw.fromAccountId) == null
      ? null
      : (stringValue(raw.fromAccountId) as AccountId);
  const toAccountId =
    stringValue(raw.toAccountId) == null
      ? null
      : (stringValue(raw.toAccountId) as AccountId);
  const legacyAmount = numberValue(persisted.amount);
  const fromAmount =
    fromAccountId == null
      ? null
      : (nullableNumberValue(raw.fromAmount) ?? legacyAmount);
  const toAmount =
    toAccountId == null
      ? null
      : (nullableNumberValue(raw.toAmount) ?? legacyAmount);

  return {
    id: id as TransactionId,
    date,
    fromAccountId,
    toAccountId,
    fromAmount: fromAmount == null ? null : Math.abs(fromAmount),
    toAmount: toAmount == null ? null : Math.abs(toAmount),
    fromCurrency:
      fromAccountId == null
        ? null
        : (nullableStringValue(raw.fromCurrency) ??
          accountCurrencies.get(fromAccountId) ??
          null),
    toCurrency:
      toAccountId == null
        ? null
        : (nullableStringValue(raw.toCurrency) ??
          accountCurrencies.get(toAccountId) ??
          null),
    category: stringValue(raw.category) ?? undefined,
    description,
    createdAt,
  };
}

function normalizeDeletedAccount(raw: unknown): DeletedAccount | null {
  if (!isRecord(raw)) return null;

  const accountId = stringValue(raw.accountId);
  const deletedAt = stringValue(raw.deletedAt);
  if (accountId == null || deletedAt == null) return null;

  return {
    accountId: accountId as AccountId,
    deletedAt,
  };
}

function normalizeDeletedTransaction(
  raw: unknown,
): DeletedTransaction | null {
  if (!isRecord(raw)) return null;

  const transactionId = stringValue(raw.transactionId);
  const deletedAt = stringValue(raw.deletedAt);
  if (transactionId == null || deletedAt == null) return null;

  return {
    transactionId: transactionId as TransactionId,
    deletedAt,
  };
}

export function normalizeAppData(raw: unknown): AppData {
  if (!isRecord(raw)) {
    return {
      accounts: [],
      transactions: [],
      deletedAccounts: [],
      deletedTransactions: [],
    };
  }

  const deletedAccounts = Array.isArray(raw.deletedAccounts)
    ? raw.deletedAccounts
        .map(normalizeDeletedAccount)
        .filter((a): a is DeletedAccount => a != null)
    : [];
  const deletedTransactions = Array.isArray(raw.deletedTransactions)
    ? raw.deletedTransactions
        .map(normalizeDeletedTransaction)
        .filter((tx): tx is DeletedTransaction => tx != null)
    : [];
  const deletedAccountIds = new Set<AccountId>(
    deletedAccounts.map((entry) => entry.accountId),
  );
  const deletedTransactionIds = new Set<TransactionId>(
    deletedTransactions.map((entry) => entry.transactionId),
  );

  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts.map(normalizeAccount).filter((a): a is Account => a != null)
    : [];
  const accountCurrencies = new Map<AccountId, string>();
  for (const account of accounts) {
    accountCurrencies.set(account.id, account.currency);
  }

  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions
        .map((tx) => normalizeTransaction(tx, accountCurrencies))
        .filter((tx): tx is Transaction => tx != null)
    : [];

  return {
    accounts: accounts.filter((account) => !deletedAccountIds.has(account.id)),
    transactions: transactions.filter(
      (transaction) =>
        !deletedTransactionIds.has(transaction.id) &&
        (transaction.fromAccountId == null ||
          !deletedAccountIds.has(transaction.fromAccountId)) &&
        (transaction.toAccountId == null ||
          !deletedAccountIds.has(transaction.toAccountId)),
    ),
    deletedAccounts,
    deletedTransactions,
  };
}
