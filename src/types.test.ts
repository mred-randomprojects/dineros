import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./types";
import { emptyAppData, find, ids } from "./testFixtures";

const CREATED_AT = "2026-01-01T12:00:00.000Z";

const accounts = [
  { id: "acc-ars", name: "Cash ARS", currency: "ARS", createdAt: CREATED_AT },
  { id: "acc-usd", name: "Wallet USD", currency: "USD", createdAt: CREATED_AT },
];

describe("normalizeAppData", () => {
  it("returns empty data for anything that is not an object", () => {
    expect(normalizeAppData(null)).toEqual(emptyAppData());
    expect(normalizeAppData(undefined)).toEqual(emptyAppData());
    expect(normalizeAppData([])).toEqual(emptyAppData());
    expect(normalizeAppData("dineros")).toEqual(emptyAppData());
  });

  it("maps the legacy single `amount` onto the sides that have an account", () => {
    const data = normalizeAppData({
      accounts,
      categories: [],
      transactions: [
        {
          id: "tx-expense",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          toAccountId: null,
          amount: 1500,
          description: "Groceries",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-income",
          date: "2026-02-02",
          fromAccountId: null,
          toAccountId: "acc-usd",
          amount: -200,
          description: "Refund",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-transfer",
          date: "2026-02-03",
          fromAccountId: "acc-ars",
          toAccountId: "acc-usd",
          amount: 300,
          description: "Move",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-explicit",
          date: "2026-02-04",
          fromAccountId: "acc-ars",
          toAccountId: null,
          fromAmount: 10,
          amount: 999,
          description: "Explicit amount wins",
          createdAt: CREATED_AT,
        },
      ],
    });

    expect(find(data.transactions, "tx-expense")).toMatchObject({
      fromAmount: 1500,
      toAmount: null,
      fromCurrency: "ARS", // filled in from the account
      toCurrency: null,
    });
    expect(find(data.transactions, "tx-income")).toMatchObject({
      fromAmount: null,
      toAmount: 200, // stored as an absolute value
      fromCurrency: null,
      toCurrency: "USD",
    });
    expect(find(data.transactions, "tx-transfer")).toMatchObject({
      fromAmount: 300,
      toAmount: 300,
      fromCurrency: "ARS",
      toCurrency: "USD",
    });
    expect(find(data.transactions, "tx-explicit")).toMatchObject({ fromAmount: 10 });
  });

  it("drops a transaction without id, date, description or createdAt (types.ts:256-258)", () => {
    const base = {
      id: "tx",
      date: "2026-02-01",
      fromAccountId: "acc-ars",
      fromAmount: 1,
      description: "Kept",
      createdAt: CREATED_AT,
    };
    const data = normalizeAppData({
      accounts,
      categories: [],
      transactions: [
        { ...base, id: "kept" },
        { ...base, id: "empty-description", description: "" },
        { ...base, id: undefined },
        { ...base, id: "no-date", date: undefined },
        { ...base, id: "no-description", description: undefined },
        { ...base, id: "no-created-at", createdAt: undefined },
        "not a transaction",
      ],
    });

    // An empty description is still a string, so it survives.
    expect(ids(data.transactions)).toEqual(["kept", "empty-description"]);
  });

  it("derives categories from the transactions when the document has no categories array", () => {
    const data = normalizeAppData({
      accounts,
      transactions: [
        {
          id: "tx-1",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          category: "  Eating   out ",
          description: "a",
          createdAt: "2026-02-01T10:00:00.000Z",
        },
        {
          id: "tx-2",
          date: "2026-02-02",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          category: "eating out",
          description: "b",
          createdAt: "2026-02-02T10:00:00.000Z",
        },
        {
          id: "tx-3",
          date: "2026-02-03",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          description: "no category",
          createdAt: "2026-02-03T10:00:00.000Z",
        },
      ],
    });

    expect(data.categories).toEqual([
      {
        id: "legacy-category:eating out",
        name: "Eating out",
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ]);
    expect(data.transactions.map((tx) => tx.category)).toEqual([
      "Eating out",
      "eating out",
      undefined,
    ]);
  });

  it("does not derive categories when the categories array is present, even if empty", () => {
    const data = normalizeAppData({
      accounts,
      categories: [],
      transactions: [
        {
          id: "tx-1",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          category: "Rent",
          description: "a",
          createdAt: CREATED_AT,
        },
      ],
    });

    expect(data.categories).toEqual([]);
  });

  it("keeps the first of two categories whose names differ only by case or spacing", () => {
    const data = normalizeAppData({
      categories: [
        { id: "cat-1", name: "Health", createdAt: CREATED_AT },
        { id: "cat-2", name: " health ", createdAt: CREATED_AT },
        { id: "cat-3", name: "   ", createdAt: CREATED_AT },
      ],
    });

    expect(ids(data.categories)).toEqual(["cat-1"]);
  });

  it("applies tombstones to the records they name", () => {
    const data = normalizeAppData({
      accounts,
      categories: [{ id: "cat-live", name: "Rent", createdAt: CREATED_AT }],
      transactions: [
        {
          id: "tx-deleted",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          description: "deleted",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-of-deleted-account",
          date: "2026-02-01",
          fromAccountId: "acc-usd",
          fromAmount: 1,
          description: "account gone",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-deleted-category",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          category: "Old stuff",
          description: "category gone",
          createdAt: CREATED_AT,
        },
        {
          id: "tx-category-recreated",
          date: "2026-02-01",
          fromAccountId: "acc-ars",
          fromAmount: 1,
          category: "rent",
          description: "a live category has this name again",
          createdAt: CREATED_AT,
        },
      ],
      recurringExpenses: [
        {
          id: "rec-deleted",
          name: "Gone",
          currency: "ARS",
          rule: { freq: "month", interval: 1, anchor: "2026-01-05" },
        },
        {
          id: "rec-on-deleted-account",
          name: "Kept",
          accountId: "acc-usd",
          currency: "USD",
          rule: { freq: "month", interval: 1, anchor: "2026-01-05" },
        },
      ],
      deletedAccounts: [{ accountId: "acc-usd", deletedAt: CREATED_AT }],
      deletedTransactions: [{ transactionId: "tx-deleted", deletedAt: CREATED_AT }],
      deletedCategories: [
        { categoryId: "cat-old", name: "Old stuff", deletedAt: CREATED_AT },
        { categoryId: "cat-old-rent", name: "Rent", deletedAt: CREATED_AT },
      ],
      deletedRecurringExpenses: [
        { recurringExpenseId: "rec-deleted", deletedAt: CREATED_AT },
      ],
    });

    expect(ids(data.accounts)).toEqual(["acc-ars"]);
    expect(ids(data.transactions)).toEqual([
      "tx-deleted-category",
      "tx-category-recreated",
    ]);
    expect(data.transactions.map((tx) => tx.category)).toEqual([
      undefined,
      "rent",
    ]);
    expect(data.recurringExpenses).toHaveLength(1);
    expect(data.recurringExpenses[0]).toMatchObject({
      id: "rec-on-deleted-account",
      accountId: null,
    });
    // Tombstones are kept so the next merge still applies them.
    expect(data.deletedAccounts).toHaveLength(1);
    expect(data.deletedTransactions).toHaveLength(1);
    expect(data.deletedCategories).toHaveLength(2);
    expect(data.deletedRecurringExpenses).toHaveLength(1);
  });

  it("repairs recurrence rules and drops a recurring expense without a valid anchor", () => {
    const data = normalizeAppData({
      recurringExpenses: [
        {
          id: "rec-repaired",
          name: "  Gym  ",
          currency: "ARS",
          estimatedAmount: -40,
          rule: {
            freq: "weekly",
            interval: 0,
            anchor: "2026-03-31",
            ends: { kind: "on", date: "not a date" },
          },
        },
        {
          id: "rec-fractional",
          name: "Insurance",
          currency: "ARS",
          rule: {
            freq: "year",
            interval: 2.7,
            anchor: "2026-06-01",
            ends: { kind: "on", date: "2030-01-01" },
          },
        },
        {
          id: "rec-no-anchor",
          name: "Broken",
          currency: "ARS",
          rule: { freq: "month", interval: 1, anchor: "2026-3-1" },
        },
      ],
    });

    expect(data.recurringExpenses).toEqual([
      expect.objectContaining({
        id: "rec-repaired",
        name: "Gym",
        estimatedAmount: 40,
        accountId: null,
        rule: {
          freq: "month",
          interval: 1,
          anchor: "2026-03-31",
          ends: { kind: "never" },
        },
      }),
      expect.objectContaining({
        id: "rec-fractional",
        rule: {
          freq: "year",
          interval: 2,
          anchor: "2026-06-01",
          ends: { kind: "on", date: "2030-01-01" },
        },
      }),
    ]);
  });

  it("keeps the recurring-payment link and the account flags", () => {
    const data = normalizeAppData({
      accounts: [
        {
          id: "acc-ars",
          name: "Cash ARS",
          currency: "ARS",
          comment: "  under   the mattress ",
          hideBalanceByDefault: true,
          markedUpToDateAt: "2026-02-01T00:00:00.000Z",
          createdAt: CREATED_AT,
        },
      ],
      categories: [],
      transactions: [
        {
          id: "tx-paid",
          date: "2026-02-15",
          fromAccountId: "acc-ars",
          fromAmount: 50,
          recurringExpenseId: "rec-1",
          period: "2026-02",
          isExpected: false,
          description: "Subscription",
          createdAt: CREATED_AT,
        },
      ],
    });

    expect(data.accounts[0]).toMatchObject({
      comment: "under the mattress",
      hideBalanceByDefault: true,
      markedUpToDateAt: "2026-02-01T00:00:00.000Z",
    });
    expect(data.transactions[0]).toMatchObject({
      recurringExpenseId: "rec-1",
      period: "2026-02",
      isExpected: undefined,
    });
  });
});
