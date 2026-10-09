import { describe, expect, it } from "vitest";
import {
  isRecurringPeriodPaid,
  newRecurringPayment,
  type MarkRecurringExpensePaidInput,
} from "./recurringPayments";
import type { AccountId, RecurringExpenseId } from "./types";
import {
  account,
  appData,
  recurringExpense,
  transaction,
} from "./testFixtures";

const CREATED_AT = "2026-03-15T12:00:00.000Z";
const REC = "rec-1" as RecurringExpenseId;

function input(
  overrides: Partial<MarkRecurringExpensePaidInput> = {},
): MarkRecurringExpensePaidInput {
  return {
    recurringExpense: recurringExpense("rec-1", {
      name: "Streaming",
      category: "  Subscriptions ",
      currency: "USD",
    }),
    period: "2026-03",
    amount: -12.5,
    accountId: "acc-1" as AccountId,
    date: "2026-03-15",
    ...overrides,
  };
}

describe("newRecurringPayment", () => {
  it("builds the payment transaction for an unpaid occurrence", () => {
    const data = appData({
      accounts: [account("acc-1", { currency: "ARS" })],
    });

    expect(newRecurringPayment(data, input(), CREATED_AT)).toEqual({
      id: expect.any(String),
      date: "2026-03-15",
      fromAccountId: "acc-1",
      toAccountId: null,
      fromAmount: 12.5,
      toAmount: null,
      fromCurrency: "ARS", // the paying account's currency
      toCurrency: null,
      category: "Subscriptions",
      recurringExpenseId: "rec-1",
      period: "2026-03",
      description: "Streaming",
      createdAt: CREATED_AT,
    });
  });

  it("falls back to the expense's currency and keeps a given description", () => {
    const payment = newRecurringPayment(
      appData({}),
      input({ description: "  March bill " }),
      CREATED_AT,
    );
    expect(payment).toMatchObject({
      fromCurrency: "USD",
      description: "March bill",
    });
  });

  it("refuses to pay an occurrence that already has a payment", () => {
    const data = appData({
      accounts: [account("acc-1")],
      transactions: [
        transaction("tx-paid-elsewhere", {
          recurringExpenseId: REC,
          period: "2026-03",
        }),
      ],
    });

    expect(newRecurringPayment(data, input(), CREATED_AT)).toBeNull();
  });

  it("still pays a different period, a different expense, or over an expected entry", () => {
    const data = appData({
      accounts: [account("acc-1")],
      transactions: [
        transaction("tx-feb", { recurringExpenseId: REC, period: "2026-02" }),
        transaction("tx-other", {
          recurringExpenseId: "rec-2" as RecurringExpenseId,
          period: "2026-03",
        }),
        transaction("tx-expected", {
          recurringExpenseId: REC,
          period: "2026-03",
          isExpected: true,
        }),
      ],
    });

    expect(newRecurringPayment(data, input(), CREATED_AT)).not.toBeNull();
  });
});

describe("isRecurringPeriodPaid", () => {
  it("matches the CLI's pay-recurring guard: same expense, same period, not expected", () => {
    const transactions = [
      transaction("tx-1", { recurringExpenseId: REC, period: "2026-03" }),
      transaction("tx-2", {
        recurringExpenseId: REC,
        period: "2026-04",
        isExpected: true,
      }),
    ];

    expect(isRecurringPeriodPaid(transactions, REC, "2026-03")).toBe(true);
    expect(isRecurringPeriodPaid(transactions, REC, "2026-04")).toBe(false);
    expect(isRecurringPeriodPaid(transactions, REC, "2026-05")).toBe(false);
    expect(
      isRecurringPeriodPaid(transactions, "rec-2" as RecurringExpenseId, "2026-03"),
    ).toBe(false);
  });
});
