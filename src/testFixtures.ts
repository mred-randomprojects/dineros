// Builders for tests. Every name, id and amount here is made up.
import type {
  Account,
  AccountId,
  AppData,
  Category,
  CategoryId,
  RecurringExpense,
  RecurringExpenseId,
  Transaction,
  TransactionId,
} from "./types";

const CREATED_AT = "2026-01-01T12:00:00.000Z";

export function emptyAppData(): AppData {
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

export function appData(partial: Partial<AppData>): AppData {
  return { ...emptyAppData(), ...partial };
}

export function account(
  id: string,
  overrides: Partial<Omit<Account, "id">> = {},
): Account {
  return {
    id: id as AccountId,
    name: `Account ${id}`,
    currency: "ARS",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function category(
  id: string,
  name: string,
  overrides: Partial<Omit<Category, "id" | "name">> = {},
): Category {
  return { id: id as CategoryId, name, createdAt: CREATED_AT, ...overrides };
}

/** An expense of `amount` out of `fromAccountId` unless overridden. */
export function transaction(
  id: string,
  overrides: Partial<Omit<Transaction, "id">> = {},
): Transaction {
  return {
    id: id as TransactionId,
    date: "2026-02-10",
    fromAccountId: "acc-1" as AccountId,
    toAccountId: null,
    fromAmount: 100,
    toAmount: null,
    fromCurrency: "ARS",
    toCurrency: null,
    description: `Transaction ${id}`,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function recurringExpense(
  id: string,
  overrides: Partial<Omit<RecurringExpense, "id">> = {},
): RecurringExpense {
  return {
    id: id as RecurringExpenseId,
    name: `Subscription ${id}`,
    accountId: "acc-1" as AccountId,
    estimatedAmount: 50,
    currency: "ARS",
    rule: {
      freq: "month",
      interval: 1,
      anchor: "2026-01-15",
      ends: { kind: "never" },
    },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

/** The item with this id; fails the test when there is none. */
export function find<T extends { id: string }>(
  items: ReadonlyArray<T>,
  id: string,
): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item == null) throw new Error(`No item with id ${id}`);
  return item;
}
