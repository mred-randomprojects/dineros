export type AccountId = string & { readonly __brand: "AccountId" };
export type TransactionId = string & { readonly __brand: "TransactionId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };
export type RecurringExpenseId = string & {
  readonly __brand: "RecurringExpenseId";
};
export type TransactionKind = "balance_adjustment";

export function generateId(): string {
  return crypto.randomUUID();
}

export interface Account {
  id: AccountId;
  name: string;
  currency: string;
  comment?: string;
  hideBalanceByDefault?: boolean;
  markedUpToDateAt?: string;
  createdAt: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  createdAt: string;
}

/**
 * When a recurrence stops offering itself. "never" runs indefinitely;
 * "on" discontinues after the given date (occurrences due after it disappear).
 */
export type RecurrenceEnds =
  | { kind: "never" }
  | { kind: "on"; date: string };

/**
 * A calendar recurrence, constrained to cadences that yield at most one
 * occurrence per month so each cell of the year grid maps to a single dot.
 * `anchor` (a "YYYY-MM-DD" date) is both the first active month and the
 * day-of-month the charge lands on. Monthly = every N months; yearly
 * behaves like every 12 months from the anchor month.
 */
export interface RecurrenceRule {
  freq: "month" | "year";
  interval: number; // "every N" — always >= 1
  anchor: string; // "YYYY-MM-DD"
  ends: RecurrenceEnds;
}

export interface RecurringExpense {
  id: RecurringExpenseId;
  name: string;
  description?: string;
  category?: string;
  accountId: AccountId | null;
  estimatedAmount: number | null;
  currency: string;
  rule: RecurrenceRule;
  createdAt: string;
}

export interface DeletedRecurringExpense {
  recurringExpenseId: RecurringExpenseId;
  deletedAt: string;
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
  /** Set when this transaction fulfills a recurring expense occurrence. */
  recurringExpenseId?: RecurringExpenseId;
  /** The occurrence this payment settles, as a "YYYY-MM" month key. */
  period?: string;
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
  recurringExpenses: RecurringExpense[];
  deletedAccounts: DeletedAccount[];
  deletedCategories: DeletedCategory[];
  deletedTransactions: DeletedTransaction[];
  deletedRecurringExpenses: DeletedRecurringExpense[];
}

export function cleanCategoryName(name: string | null | undefined): string {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

export function cleanAccountComment(comment: string | null | undefined): string {
  return comment?.trim().replace(/\s+/g, " ") ?? "";
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

  const comment = cleanAccountComment(stringValue(raw.comment));

  return {
    id: id as AccountId,
    name,
    currency,
    comment: comment.length > 0 ? comment : undefined,
    hideBalanceByDefault:
      booleanValue(raw.hideBalanceByDefault) === true ? true : undefined,
    markedUpToDateAt: stringValue(raw.markedUpToDateAt) ?? undefined,
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
    recurringExpenseId:
      stringValue(raw.recurringExpenseId) == null
        ? undefined
        : (stringValue(raw.recurringExpenseId) as RecurringExpenseId),
    period: stringValue(raw.period) ?? undefined,
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDateValue(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE_RE.test(value) ? value : null;
}

function normalizeRecurrenceEnds(raw: unknown): RecurrenceEnds {
  if (isRecord(raw) && raw.kind === "on") {
    const date = isoDateValue(raw.date);
    if (date != null) return { kind: "on", date };
  }
  return { kind: "never" };
}

function normalizeRecurrenceRule(raw: unknown): RecurrenceRule | null {
  if (!isRecord(raw)) return null;

  const anchor = isoDateValue(raw.anchor);
  if (anchor == null) return null;

  const freq = raw.freq === "year" ? "year" : "month";
  const rawInterval = numberValue(raw.interval);
  const interval =
    rawInterval == null || rawInterval < 1 ? 1 : Math.floor(rawInterval);

  return {
    freq,
    interval,
    anchor,
    ends: normalizeRecurrenceEnds(raw.ends),
  };
}

function normalizeRecurringExpense(raw: unknown): RecurringExpense | null {
  if (!isRecord(raw)) return null;

  const id = stringValue(raw.id);
  const name = stringValue(raw.name)?.trim();
  const currency = stringValue(raw.currency);
  const rule = normalizeRecurrenceRule(raw.rule);
  if (id == null || name == null || name.length === 0 || currency == null) {
    return null;
  }
  if (rule == null) return null;

  const description = stringValue(raw.description)?.trim();
  const category = cleanCategoryName(stringValue(raw.category));
  const accountId = stringValue(raw.accountId);
  const estimatedAmount = numberValue(raw.estimatedAmount);

  return {
    id: id as RecurringExpenseId,
    name,
    description:
      description != null && description.length > 0 ? description : undefined,
    category: category.length > 0 ? category : undefined,
    accountId: accountId == null ? null : (accountId as AccountId),
    estimatedAmount:
      estimatedAmount == null ? null : Math.abs(estimatedAmount),
    currency,
    rule,
    createdAt: stringValue(raw.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeDeletedRecurringExpense(
  raw: unknown,
): DeletedRecurringExpense | null {
  if (!isRecord(raw)) return null;

  const recurringExpenseId = stringValue(raw.recurringExpenseId);
  const deletedAt = stringValue(raw.deletedAt);
  if (recurringExpenseId == null || deletedAt == null) return null;

  return {
    recurringExpenseId: recurringExpenseId as RecurringExpenseId,
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
      recurringExpenses: [],
      deletedAccounts: [],
      deletedCategories: [],
      deletedTransactions: [],
      deletedRecurringExpenses: [],
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
  const deletedRecurringExpenses = Array.isArray(raw.deletedRecurringExpenses)
    ? raw.deletedRecurringExpenses
        .map(normalizeDeletedRecurringExpense)
        .filter((entry): entry is DeletedRecurringExpense => entry != null)
    : [];
  const deletedRecurringExpenseIds = new Set<RecurringExpenseId>(
    deletedRecurringExpenses.map((entry) => entry.recurringExpenseId),
  );
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

  const recurringExpenses = (
    Array.isArray(raw.recurringExpenses)
      ? raw.recurringExpenses
          .map(normalizeRecurringExpense)
          .filter((entry): entry is RecurringExpense => entry != null)
      : []
  )
    .filter((entry) => !deletedRecurringExpenseIds.has(entry.id))
    .map((entry) =>
      // Drop dangling references to accounts that have been deleted.
      entry.accountId != null && deletedAccountIds.has(entry.accountId)
        ? { ...entry, accountId: null }
        : entry,
    );

  return {
    accounts: accounts.filter((account) => !deletedAccountIds.has(account.id)),
    categories: normalizedCategories,
    transactions: liveTransactions,
    recurringExpenses,
    deletedAccounts,
    deletedCategories,
    deletedTransactions,
    deletedRecurringExpenses,
  };
}
