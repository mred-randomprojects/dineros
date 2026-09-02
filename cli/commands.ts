import { randomUUID } from "node:crypto";
import type {
  Account,
  AppData,
  Category,
  CategoryId,
  RecurringExpense,
  RecurringExpenseId,
  Transaction,
  TransactionId,
} from "../src/types";
import { cleanCategoryName, normalizeCategoryLookupKey } from "../src/types";
import {
  describeRule,
  dueDateForMonth,
  occursInMonth,
  periodKey,
  periodLabel,
  todayIso,
} from "../src/recurrence";
import {
  boolFlag,
  dateFlag,
  integerFlag,
  numberFlag,
  periodFlag,
  requiredStringFlag,
  stringFlag,
  UsageError,
  type ParsedArgs,
} from "./args";
import type { MutationResult } from "./client";
import {
  accountBalances,
  accountName,
  describeTransaction,
  resolveAccount,
  resolveCategoryName,
  resolveRecurringExpense,
} from "./resolve";

function nowIso(): string {
  return new Date().toISOString();
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function currentPeriod(): string {
  const now = new Date();
  return periodKey(now.getFullYear(), now.getMonth());
}

/** Mirrors useAppData's appendMissingCategories so CLI writes match the app's. */
function appendMissingCategories(
  categories: ReadonlyArray<Category>,
  names: ReadonlyArray<string | undefined>,
  createdAt: string,
): Category[] {
  const next = [...categories];
  const existing = new Set(
    next.map((category) => normalizeCategoryLookupKey(category.name)),
  );
  for (const rawName of names) {
    const name = cleanCategoryName(rawName);
    const key = normalizeCategoryLookupKey(name);
    if (key.length === 0 || existing.has(key)) continue;
    next.push({ id: randomUUID() as CategoryId, name, createdAt });
    existing.add(key);
  }
  return next;
}

export interface Output {
  json: unknown;
  lines: ReadonlyArray<string>;
}

export function emit(args: ParsedArgs, output: Output): void {
  if (boolFlag(args, "json")) {
    console.log(JSON.stringify(output.json, null, 2));
    return;
  }
  for (const line of output.lines) console.log(line);
}

export function money(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  return `${amount.toFixed(2)}${currency == null ? "" : ` ${currency}`}`;
}

// --- Read-only commands ---

export function listAccounts(_args: ParsedArgs, data: AppData): Output {
  const balances = accountBalances(data);
  const rows = [...data.accounts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: Number((balances.get(account.id) ?? 0).toFixed(2)),
    }));
  return {
    json: rows,
    lines:
      rows.length === 0
        ? ["No accounts."]
        : rows.map(
            (row) => `${row.name.padEnd(28)} ${money(row.balance, row.currency)}`,
          ),
  };
}

export function listCategories(_args: ParsedArgs, data: AppData): Output {
  const names = [...data.categories]
    .map((category) => category.name)
    .sort((a, b) => a.localeCompare(b));
  return {
    json: names,
    lines: names.length === 0 ? ["No categories."] : names,
  };
}

export function listTransactions(args: ParsedArgs, data: AppData): Output {
  const limit = integerFlag(args, "limit") ?? 20;
  const accountQuery = stringFlag(args, "account");
  const account =
    accountQuery == null ? null : resolveAccount(data.accounts, accountQuery);
  const categoryQuery = stringFlag(args, "category");
  const categoryKey =
    categoryQuery == null ? null : normalizeCategoryLookupKey(categoryQuery);
  const since = dateFlag(args, "since");

  const matching = data.transactions
    .filter((tx) => {
      if (
        account != null &&
        tx.fromAccountId !== account.id &&
        tx.toAccountId !== account.id
      ) {
        return false;
      }
      if (
        categoryKey != null &&
        normalizeCategoryLookupKey(tx.category) !== categoryKey
      ) {
        return false;
      }
      return since == null || tx.date >= since;
    })
    .sort((a, b) =>
      a.date === b.date
        ? b.createdAt.localeCompare(a.createdAt)
        : b.date.localeCompare(a.date),
    )
    .slice(0, limit);

  return {
    json: matching,
    lines:
      matching.length === 0
        ? ["No matching transactions."]
        : matching.map((tx) => describeTransaction(data, tx)),
  };
}

interface RecurringStatus {
  id: RecurringExpenseId;
  name: string;
  cadence: string;
  estimatedAmount: number | null;
  currency: string;
  account: string | null;
  category: string | undefined;
  unpaidPeriods: string[];
  nextDue: string | null;
}

/**
 * Occurrences from the anchor month through the current month that have no
 * settling transaction, newest last — the "what do I still owe" view.
 */
function unpaidPeriods(
  expense: RecurringExpense,
  transactions: ReadonlyArray<Transaction>,
  today: string,
): string[] {
  const paid = new Set<string>();
  for (const tx of transactions) {
    if (
      tx.recurringExpenseId === expense.id &&
      tx.period != null &&
      tx.isExpected !== true
    ) {
      paid.add(tx.period);
    }
  }
  const [anchorYear, anchorMonth] = expense.rule.anchor.split("-");
  const start = new Date(Number(anchorYear), Number(anchorMonth) - 1, 1);
  const todayYear = Number(today.slice(0, 4));
  const todayMonth0 = Number(today.slice(5, 7)) - 1;

  const periods: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (
    cursor.getFullYear() * 12 + cursor.getMonth() <=
    todayYear * 12 + todayMonth0
  ) {
    const year = cursor.getFullYear();
    const month0 = cursor.getMonth();
    if (occursInMonth(expense.rule, year, month0)) {
      const period = periodKey(year, month0);
      if (!paid.has(period)) periods.push(period);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}

function nextDueDate(expense: RecurringExpense, today: string): string | null {
  const cursor = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1);
  for (let i = 0; i < 240; i += 1) {
    const year = cursor.getFullYear();
    const month0 = cursor.getMonth();
    if (occursInMonth(expense.rule, year, month0)) {
      const due = dueDateForMonth(expense.rule, year, month0);
      if (due >= today) return due;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return null;
}

export function listRecurring(_args: ParsedArgs, data: AppData): Output {
  const today = todayIso();
  const rows: RecurringStatus[] = [...data.recurringExpenses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((expense) => ({
      id: expense.id,
      name: expense.name,
      cadence: describeRule(expense.rule),
      estimatedAmount: expense.estimatedAmount,
      currency: expense.currency,
      account: accountName(data, expense.accountId),
      category: expense.category,
      unpaidPeriods: unpaidPeriods(expense, data.transactions, today),
      nextDue: nextDueDate(expense, today),
    }));

  return {
    json: rows,
    lines:
      rows.length === 0
        ? ["No recurring expenses."]
        : rows.flatMap((row) => [
            `${row.name} — ${row.cadence} — ${money(row.estimatedAmount, row.currency)}${
              row.account == null ? "" : ` — ${row.account}`
            }`,
            row.unpaidPeriods.length === 0
              ? `  all settled through today · next due ${row.nextDue ?? "—"}`
              : `  unpaid: ${row.unpaidPeriods.map(periodLabel).join(", ")}`,
          ]),
  };
}

// --- Mutating commands ---

interface TransactionPlan {
  transaction: Transaction;
  newCategories: string[];
}

export function buildAddTransaction(
  args: ParsedArgs,
  data: AppData,
): MutationResult<TransactionPlan> {
  const fromQuery = stringFlag(args, "from");
  const toQuery = stringFlag(args, "to");
  if (fromQuery == null && toQuery == null) {
    throw new UsageError("Give at least one of --from or --to.");
  }

  const fromAccount: Account | null =
    fromQuery == null ? null : resolveAccount(data.accounts, fromQuery);
  const toAccount: Account | null =
    toQuery == null ? null : resolveAccount(data.accounts, toQuery);
  if (fromAccount != null && toAccount != null && fromAccount.id === toAccount.id) {
    throw new UsageError("--from and --to must be different accounts.");
  }

  const amount = numberFlag(args, "amount");
  const explicitFrom = numberFlag(args, "from-amount");
  const explicitTo = numberFlag(args, "to-amount");
  const crossCurrency =
    fromAccount != null &&
    toAccount != null &&
    fromAccount.currency !== toAccount.currency;

  if (crossCurrency && (explicitFrom == null || explicitTo == null)) {
    throw new UsageError(
      `${fromAccount?.name} is ${fromAccount?.currency} and ${toAccount?.name} is ${toAccount?.currency} — pass both --from-amount and --to-amount.`,
    );
  }

  const fromAmount = fromAccount == null ? null : (explicitFrom ?? amount ?? null);
  const toAmount = toAccount == null ? null : (explicitTo ?? amount ?? null);
  if (fromAccount != null && fromAmount == null) {
    throw new UsageError("Missing --amount (or --from-amount).");
  }
  if (toAccount != null && toAmount == null) {
    throw new UsageError("Missing --amount (or --to-amount).");
  }

  const createdAt = nowIso();
  const category = resolveCategoryName(
    data.categories,
    stringFlag(args, "category"),
  );
  const transaction: Transaction = {
    id: randomUUID() as TransactionId,
    date: dateFlag(args, "date") ?? todayIso(),
    fromAccountId: fromAccount?.id ?? null,
    toAccountId: toAccount?.id ?? null,
    fromAmount,
    toAmount,
    fromCurrency: fromAccount?.currency ?? null,
    toCurrency: toAccount?.currency ?? null,
    category,
    isExpected: boolFlag(args, "expected") ? true : undefined,
    description: stringFlag(args, "description") ?? "",
    createdAt,
  };

  const categories = appendMissingCategories(
    data.categories,
    [category],
    createdAt,
  );
  return {
    data: {
      ...data,
      categories,
      transactions: [...data.transactions, transaction],
    },
    result: {
      transaction,
      newCategories: categories
        .slice(data.categories.length)
        .map((entry) => entry.name),
    },
  };
}

export function buildAddRecurring(
  args: ParsedArgs,
  data: AppData,
): MutationResult<RecurringExpense> {
  const name = requiredStringFlag(args, "name");
  const accountQuery = stringFlag(args, "account");
  const account =
    accountQuery == null ? null : resolveAccount(data.accounts, accountQuery);

  const currency = (stringFlag(args, "currency") ?? account?.currency)?.toUpperCase();
  if (currency == null) {
    throw new UsageError("Give --currency, or an --account to take it from.");
  }

  const day = integerFlag(args, "day");
  if (day == null || day < 1 || day > 31) {
    throw new UsageError("--day must be the day of the month it is charged (1-31).");
  }

  const start = periodFlag(args, "start") ?? currentPeriod();
  const freqRaw = stringFlag(args, "freq") ?? "month";
  if (freqRaw !== "month" && freqRaw !== "year") {
    throw new UsageError('--freq must be "month" or "year".');
  }
  const every = integerFlag(args, "every") ?? 1;
  if (every < 1) throw new UsageError("--every must be at least 1.");
  const until = dateFlag(args, "until");

  const createdAt = nowIso();
  const category = resolveCategoryName(
    data.categories,
    stringFlag(args, "category"),
  );
  const expense: RecurringExpense = {
    id: randomUUID() as RecurringExpenseId,
    name,
    description: stringFlag(args, "description"),
    category,
    accountId: account?.id ?? null,
    estimatedAmount: numberFlag(args, "amount") ?? null,
    currency,
    rule: {
      freq: freqRaw,
      interval: every,
      anchor: `${start}-${pad2(day)}`,
      ends: until == null ? { kind: "never" } : { kind: "on", date: until },
    },
    createdAt,
  };

  return {
    data: {
      ...data,
      categories: appendMissingCategories(
        data.categories,
        [category],
        createdAt,
      ),
      recurringExpenses: [...data.recurringExpenses, expense],
    },
    result: expense,
  };
}

interface PaymentPlan {
  transaction: Transaction;
  expense: RecurringExpense;
  period: string;
}

export function buildPayRecurring(
  args: ParsedArgs,
  data: AppData,
): MutationResult<PaymentPlan> {
  const expense = resolveRecurringExpense(
    data.recurringExpenses,
    requiredStringFlag(args, "name"),
  );
  const period = periodFlag(args, "period") ?? currentPeriod();
  const year = Number(period.slice(0, 4));
  const month0 = Number(period.slice(5, 7)) - 1;
  const force = boolFlag(args, "force");

  if (!force && !occursInMonth(expense.rule, year, month0)) {
    throw new UsageError(
      `${expense.name} has no occurrence in ${periodLabel(period)} (${describeRule(expense.rule)}). Pass --force to record it anyway.`,
    );
  }

  const alreadyPaid = data.transactions.some(
    (tx) =>
      tx.recurringExpenseId === expense.id &&
      tx.period === period &&
      tx.isExpected !== true,
  );
  if (alreadyPaid && !force) {
    throw new UsageError(
      `${expense.name} is already marked paid for ${periodLabel(period)}. Pass --force to add another payment.`,
    );
  }

  const accountQuery = stringFlag(args, "account");
  const account =
    accountQuery != null
      ? resolveAccount(data.accounts, accountQuery)
      : (data.accounts.find((a) => a.id === expense.accountId) ?? null);
  if (account == null) {
    throw new UsageError(
      `${expense.name} has no default account — pass --account.`,
    );
  }

  const amount = numberFlag(args, "amount") ?? expense.estimatedAmount;
  if (amount == null) {
    throw new UsageError(
      `${expense.name} has no estimated amount — pass --amount.`,
    );
  }

  const createdAt = nowIso();
  const category = resolveCategoryName(data.categories, expense.category);
  const transaction: Transaction = {
    id: randomUUID() as TransactionId,
    date: dateFlag(args, "date") ?? dueDateForMonth(expense.rule, year, month0),
    fromAccountId: account.id,
    toAccountId: null,
    fromAmount: Math.abs(amount),
    toAmount: null,
    fromCurrency: account.currency,
    toCurrency: null,
    category,
    recurringExpenseId: expense.id,
    period,
    description: stringFlag(args, "description") ?? expense.name,
    createdAt,
  };

  return {
    data: {
      ...data,
      categories: appendMissingCategories(
        data.categories,
        [category],
        createdAt,
      ),
      transactions: [...data.transactions, transaction],
    },
    result: { transaction, expense, period },
  };
}
