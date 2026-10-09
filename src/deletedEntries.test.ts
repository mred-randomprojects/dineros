import { describe, expect, it } from "vitest";
import {
  buildDeletedCategoryNameSet,
  filterDeletedEntriesFromAppData,
  mergeDeletedAccounts,
  mergeDeletedCategories,
  mergeDeletedRecurringExpenses,
  mergeDeletedTransactions,
  upsertDeletedAccount,
  upsertDeletedCategory,
  upsertDeletedRecurringExpense,
  upsertDeletedTransaction,
} from "./deletedEntries";
import type {
  AccountId,
  CategoryId,
  RecurringExpenseId,
  TransactionId,
} from "./types";
import {
  account,
  appData,
  category,
  ids,
  recurringExpense,
  transaction,
} from "./testFixtures";

const T1 = "2026-03-01T10:00:00.000Z";
const T2 = "2026-03-02T10:00:00.000Z";

describe("mergeDeleted*", () => {
  it("unions both sides and keeps the latest deletedAt per id", () => {
    expect(
      mergeDeletedAccounts(
        [
          { accountId: "a" as AccountId, deletedAt: T2 },
          { accountId: "b" as AccountId, deletedAt: T1 },
        ],
        [
          { accountId: "a" as AccountId, deletedAt: T1 },
          { accountId: "c" as AccountId, deletedAt: T1 },
        ],
      ),
    ).toEqual([
      { accountId: "a", deletedAt: T2 },
      { accountId: "b", deletedAt: T1 },
      { accountId: "c", deletedAt: T1 },
    ]);

    expect(
      mergeDeletedTransactions(
        [{ transactionId: "t" as TransactionId, deletedAt: T1 }],
        [{ transactionId: "t" as TransactionId, deletedAt: T2 }],
      ),
    ).toEqual([{ transactionId: "t", deletedAt: T2 }]);

    expect(
      mergeDeletedCategories(
        [{ categoryId: "c" as CategoryId, name: "Old name", deletedAt: T1 }],
        [{ categoryId: "c" as CategoryId, name: "New name", deletedAt: T2 }],
      ),
    ).toEqual([{ categoryId: "c", name: "New name", deletedAt: T2 }]);

    expect(
      mergeDeletedRecurringExpenses(
        [{ recurringExpenseId: "r" as RecurringExpenseId, deletedAt: T2 }],
        [{ recurringExpenseId: "r" as RecurringExpenseId, deletedAt: T1 }],
      ),
    ).toEqual([{ recurringExpenseId: "r", deletedAt: T2 }]);
  });

  it("keeps the local entry on an exact tie", () => {
    expect(
      mergeDeletedCategories(
        [{ categoryId: "c" as CategoryId, name: "Local", deletedAt: T1 }],
        [{ categoryId: "c" as CategoryId, name: "Cloud", deletedAt: T1 }],
      ),
    ).toEqual([{ categoryId: "c", name: "Local", deletedAt: T1 }]);
  });
});

describe("upsertDeleted*", () => {
  it("replaces the entry for the same id and appends it last", () => {
    expect(
      upsertDeletedAccount(
        [
          { accountId: "a" as AccountId, deletedAt: T1 },
          { accountId: "b" as AccountId, deletedAt: T1 },
        ],
        { accountId: "a" as AccountId, deletedAt: T2 },
      ),
    ).toEqual([
      { accountId: "b", deletedAt: T1 },
      { accountId: "a", deletedAt: T2 },
    ]);

    expect(
      upsertDeletedTransaction([], {
        transactionId: "t" as TransactionId,
        deletedAt: T1,
      }),
    ).toEqual([{ transactionId: "t", deletedAt: T1 }]);

    expect(
      upsertDeletedCategory(
        [{ categoryId: "c" as CategoryId, name: "Old", deletedAt: T1 }],
        { categoryId: "c" as CategoryId, name: "New", deletedAt: T2 },
      ),
    ).toEqual([{ categoryId: "c", name: "New", deletedAt: T2 }]);

    expect(
      upsertDeletedRecurringExpense(
        [{ recurringExpenseId: "r" as RecurringExpenseId, deletedAt: T1 }],
        { recurringExpenseId: "r" as RecurringExpenseId, deletedAt: T2 },
      ),
    ).toEqual([{ recurringExpenseId: "r", deletedAt: T2 }]);
  });
});

describe("buildDeletedCategoryNameSet", () => {
  it("normalizes names and skips empty ones", () => {
    expect(
      buildDeletedCategoryNameSet([
        { categoryId: "a" as CategoryId, name: "  Eating   Out ", deletedAt: T1 },
        { categoryId: "b" as CategoryId, name: "", deletedAt: T1 },
      ]),
    ).toEqual(new Set(["eating out"]));
  });
});

describe("filterDeletedEntriesFromAppData", () => {
  it("removes deleted records, unlinks recurring expenses and clears deleted category names", () => {
    const data = appData({
      accounts: [account("acc-1"), account("acc-2")],
      categories: [category("cat-1", "Rent"), category("cat-2", "Travel")],
      transactions: [
        transaction("tx-deleted"),
        transaction("tx-on-deleted-account", {
          fromAccountId: "acc-2" as AccountId,
        }),
        transaction("tx-travel", { category: "travel" }),
        transaction("tx-rent", { category: "Rent" }),
      ],
      recurringExpenses: [
        recurringExpense("rec-deleted"),
        recurringExpense("rec-on-deleted-account", {
          accountId: "acc-2" as AccountId,
        }),
      ],
    });

    const filtered = filterDeletedEntriesFromAppData(
      data,
      [{ accountId: "acc-2" as AccountId, deletedAt: T1 }],
      [{ categoryId: "cat-2" as CategoryId, name: "Travel", deletedAt: T1 }],
      [{ transactionId: "tx-deleted" as TransactionId, deletedAt: T1 }],
      [{ recurringExpenseId: "rec-deleted" as RecurringExpenseId, deletedAt: T1 }],
    );

    expect(ids(filtered.accounts)).toEqual(["acc-1"]);
    expect(ids(filtered.categories)).toEqual(["cat-1"]);
    expect(ids(filtered.transactions)).toEqual(["tx-travel", "tx-rent"]);
    expect(filtered.transactions.map((tx) => tx.category)).toEqual([
      undefined,
      "Rent",
    ]);
    expect(filtered.recurringExpenses).toEqual([
      expect.objectContaining({ id: "rec-on-deleted-account", accountId: null }),
    ]);
    expect(filtered.deletedAccounts).toHaveLength(1);
    expect(filtered.deletedCategories).toHaveLength(1);
    expect(filtered.deletedTransactions).toHaveLength(1);
    expect(filtered.deletedRecurringExpenses).toHaveLength(1);
  });
});
