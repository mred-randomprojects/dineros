import type {
  AccountId,
  AppData,
  RecurringExpense,
  RecurringExpenseId,
  Transaction,
  TransactionId,
} from "./types";
import { cleanCategoryName, generateId } from "./types";

export interface MarkRecurringExpensePaidInput {
  recurringExpense: RecurringExpense;
  period: string;
  amount: number;
  accountId: AccountId;
  date: string;
  description?: string;
}

/**
 * The transaction that records paying one occurrence of a recurring expense,
 * or null when that occurrence already has a payment (paying it again would
 * record a duplicate charge). Checks only the data it is given: a payment
 * made elsewhere that this device has not loaded yet is not seen.
 */
export function newRecurringPayment(
  data: AppData,
  input: MarkRecurringExpensePaidInput,
  createdAt: string,
): Transaction | null {
  const { recurringExpense, period, amount, accountId, date } = input;
  if (isRecurringPeriodPaid(data.transactions, recurringExpense.id, period)) {
    return null;
  }
  const account = data.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? recurringExpense.currency;
  const description =
    input.description?.trim() && input.description.trim().length > 0
      ? input.description.trim()
      : recurringExpense.name;

  return {
    id: generateId() as TransactionId,
    date,
    fromAccountId: accountId,
    toAccountId: null,
    fromAmount: Math.abs(amount),
    toAmount: null,
    fromCurrency: currency,
    toCurrency: null,
    category: cleanCategoryName(recurringExpense.category) || undefined,
    recurringExpenseId: recurringExpense.id,
    period,
    description,
    createdAt,
  };
}

/**
 * Whether an actual (not expected) payment already settles this occurrence.
 * The same rule as the CLI's `pay-recurring` guard (cli/commands.ts) and the
 * year grid's `buildPaymentIndex`.
 */
export function isRecurringPeriodPaid(
  transactions: ReadonlyArray<Transaction>,
  recurringExpenseId: RecurringExpenseId,
  period: string,
): boolean {
  return transactions.some(
    (tx) =>
      tx.recurringExpenseId === recurringExpenseId &&
      tx.period === period &&
      tx.isExpected !== true,
  );
}
