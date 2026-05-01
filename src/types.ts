export type AccountId = string & { readonly __brand: "AccountId" };
export type TransactionId = string & { readonly __brand: "TransactionId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };
export type TransactionKind = "balance_adjustment";

export function generateId(): string {
  return crypto.randomUUID();
}

export interface Account {
  id: AccountId;
  name: string;
  currency: string;
  createdAt: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  createdAt: string;
}

export interface BalanceAdjustmentDetails {
  accountId: AccountId;
  previousBalance: number;
  targetBalance: number;
}

export interface Transaction {
  id: TransactionId;
  kind?: TransactionKind;
  date: string;
  fromAccountId: AccountId | null;
  toAccountId: AccountId | null;
  fromAmount: number | null;
  toAmount: number | null;
  fromCurrency: string | null;
  toCurrency: string | null;
  category?: string;
  isExpected?: boolean;
  balanceAdjustment?: BalanceAdjustmentDetails;
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

export interface DeletedCategory {
  categoryId: CategoryId;
  name: string;
  deletedAt: string;
}

export interface AppData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  deletedAccounts: DeletedAccount[];
  deletedCategories: DeletedCategory[];
  deletedTransactions: DeletedTransaction[];
}

export function cleanCategoryName(name: string | null | undefined): string {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeCategoryLookupKey(
  name: string | null | undefined,
): string {
  return cleanCategoryName(name).toLocaleLowerCase();
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

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function transactionKindValue(value: unknown): TransactionKind | undefined {
  return value === "balance_adjustment" ? "balance_adjustment" : undefined;
}

function normalizeBalanceAdjustmentDetails(
  raw: unknown,
): BalanceAdjustmentDetails | undefined {
  if (!isRecord(raw)) return undefined;

  const accountId = stringValue(raw.accountId);
  const previousBalance = numberValue(raw.previousBalance);
  const targetBalance = numberValue(raw.targetBalance);
  if (accountId == null || previousBalance == null || targetBalance == null) {
    return undefined;
  }

  return {
    accountId: accountId as AccountId,
    previousBalance,
    targetBalance,
  };
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

function normalizeCategory(raw: unknown): Category | null {
  if (!isRecord(raw)) return null;

  const id = stringValue(raw.id);
  const name = cleanCategoryName(stringValue(raw.name));
  if (id == null || name.length === 0) return null;

  return {
    id: id as CategoryId,
    name,
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

  const category = cleanCategoryName(stringValue(raw.category));
  const kind = transactionKindValue(raw.kind);
  const balanceAdjustment =
    kind === "balance_adjustment"
      ? normalizeBalanceAdjustmentDetails(raw.balanceAdjustment)
      : undefined;

  return {
    id: id as TransactionId,
    kind,
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
    category: category.length > 0 ? category : undefined,
    isExpected: booleanValue(raw.isExpected) === true ? true : undefined,
    balanceAdjustment,
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

function normalizeDeletedCategory(raw: unknown): DeletedCategory | null {
  if (!isRecord(raw)) return null;

  const categoryId = stringValue(raw.categoryId);
  const name = cleanCategoryName(stringValue(raw.name));
  const deletedAt = stringValue(raw.deletedAt);
  if (categoryId == null || deletedAt == null) return null;

  return {
    categoryId: categoryId as CategoryId,
    name,
    deletedAt,
  };
}

function uniqueCategories(categories: ReadonlyArray<Category>): Category[] {
  const byName = new Map<string, Category>();
  for (const category of categories) {
    const key = normalizeCategoryLookupKey(category.name);
    if (key.length === 0 || byName.has(key)) continue;
    byName.set(key, { ...category, name: cleanCategoryName(category.name) });
  }
  return [...byName.values()];
}

function deriveCategoriesFromTransactions(
  transactions: ReadonlyArray<Transaction>,
): Category[] {
  const categories = new Map<string, Category>();
  for (const transaction of transactions) {
    const name = cleanCategoryName(transaction.category);
    const key = normalizeCategoryLookupKey(name);
    if (key.length === 0 || categories.has(key)) continue;
    categories.set(key, {
      id: `legacy-category:${key}` as CategoryId,
      name,
      createdAt: transaction.createdAt,
    });
  }
  return [...categories.values()];
}

export function normalizeAppData(raw: unknown): AppData {
  if (!isRecord(raw)) {
    return {
      accounts: [],
      categories: [],
      transactions: [],
      deletedAccounts: [],
      deletedCategories: [],
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
  const deletedCategories = Array.isArray(raw.deletedCategories)
    ? raw.deletedCategories
        .map(normalizeDeletedCategory)
        .filter((category): category is DeletedCategory => category != null)
    : [];
  const deletedAccountIds = new Set<AccountId>(
    deletedAccounts.map((entry) => entry.accountId),
  );
  const deletedTransactionIds = new Set<TransactionId>(
    deletedTransactions.map((entry) => entry.transactionId),
  );
  const deletedCategoryIds = new Set<CategoryId>(
    deletedCategories.map((entry) => entry.categoryId),
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
  const categories = Array.isArray(raw.categories)
    ? uniqueCategories(
        raw.categories
          .map(normalizeCategory)
          .filter((category): category is Category => category != null),
      )
    : [];
  const liveCategories = categories.filter(
    (category) => !deletedCategoryIds.has(category.id),
  );
  const liveCategoryNames = new Set(
    liveCategories.map((category) => normalizeCategoryLookupKey(category.name)),
  );
  const deletedCategoryNames = new Set(
    deletedCategories
      .map((entry) => normalizeCategoryLookupKey(entry.name))
      .filter((name) => name.length > 0 && !liveCategoryNames.has(name)),
  );
  const liveTransactions = transactions
    .filter(
      (transaction) =>
        !deletedTransactionIds.has(transaction.id) &&
        (transaction.fromAccountId == null ||
          !deletedAccountIds.has(transaction.fromAccountId)) &&
        (transaction.toAccountId == null ||
          !deletedAccountIds.has(transaction.toAccountId)),
    )
    .map((transaction) =>
      transaction.category != null &&
      deletedCategoryNames.has(normalizeCategoryLookupKey(transaction.category))
        ? { ...transaction, category: undefined }
        : transaction,
    );
  const normalizedCategories = Array.isArray(raw.categories)
    ? liveCategories
    : deriveCategoriesFromTransactions(liveTransactions);

  return {
    accounts: accounts.filter((account) => !deletedAccountIds.has(account.id)),
    categories: normalizedCategories,
    transactions: liveTransactions,
    deletedAccounts,
    deletedCategories,
    deletedTransactions,
  };
}
