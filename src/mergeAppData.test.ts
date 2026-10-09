import { describe, expect, it } from "vitest";
import { mergeAppData } from "./mergeAppData";
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
  find,
  ids,
  recurringExpense,
  transaction,
} from "./testFixtures";

const OLDER = "2026-03-01T10:00:00.000Z";
const NEWER = "2026-03-02T10:00:00.000Z";

describe("mergeAppData: tombstones", () => {
  it.each(["local", "cloud"] as const)(
    "a deleted transaction stays deleted when the other side still has it (winner: %s)",
    (conflictWinner) => {
      const stale = appData({
        accounts: [account("acc-1")],
        transactions: [transaction("tx-1"), transaction("tx-2")],
      });
      const deleted = appData({
        accounts: [account("acc-1")],
        transactions: [transaction("tx-2")],
        deletedTransactions: [
          { transactionId: "tx-1" as TransactionId, deletedAt: OLDER },
        ],
      });

      for (const [local, cloud] of [
        [stale, deleted],
        [deleted, stale],
      ]) {
        const merged = mergeAppData(local, cloud, { conflictWinner });
        expect(ids(merged.transactions)).toEqual(["tx-2"]);
        expect(merged.deletedTransactions).toEqual([
          { transactionId: "tx-1", deletedAt: OLDER },
        ]);
      }
    },
  );

  it.each(["local", "cloud"] as const)(
    "a deleted account takes its transactions with it and unlinks its recurring expenses (winner: %s)",
    (conflictWinner) => {
      const stale = appData({
        accounts: [account("acc-1"), account("acc-2")],
        transactions: [
          transaction("tx-from", { fromAccountId: "acc-2" as AccountId }),
          transaction("tx-to", {
            fromAccountId: null,
            fromAmount: null,
            fromCurrency: null,
            toAccountId: "acc-2" as AccountId,
            toAmount: 5,
            toCurrency: "ARS",
          }),
          transaction("tx-other"),
        ],
        recurringExpenses: [
          recurringExpense("rec-1", { accountId: "acc-2" as AccountId }),
        ],
      });
      const deleted = appData({
        accounts: [account("acc-1")],
        deletedAccounts: [{ accountId: "acc-2" as AccountId, deletedAt: OLDER }],
      });

      for (const [local, cloud] of [
        [stale, deleted],
        [deleted, stale],
      ]) {
        const merged = mergeAppData(local, cloud, { conflictWinner });
        expect(ids(merged.accounts)).toEqual(["acc-1"]);
        expect(ids(merged.transactions)).toEqual(["tx-other"]);
        expect(merged.recurringExpenses).toHaveLength(1);
        expect(merged.recurringExpenses[0]?.accountId).toBeNull();
      }
    },
  );

  it.each(["local", "cloud"] as const)(
    "a deleted recurring expense and a deleted category stay deleted (winner: %s)",
    (conflictWinner) => {
      const stale = appData({
        accounts: [account("acc-1")],
        categories: [category("cat-1", "Streaming"), category("cat-2", "Rent")],
        transactions: [transaction("tx-1", { category: "streaming" })],
        recurringExpenses: [recurringExpense("rec-1"), recurringExpense("rec-2")],
      });
      const deleted = appData({
        accounts: [account("acc-1")],
        categories: [category("cat-2", "Rent")],
        recurringExpenses: [recurringExpense("rec-2")],
        deletedCategories: [
          {
            categoryId: "cat-1" as CategoryId,
            name: "Streaming",
            deletedAt: OLDER,
          },
        ],
        deletedRecurringExpenses: [
          { recurringExpenseId: "rec-1" as RecurringExpenseId, deletedAt: OLDER },
        ],
      });

      for (const [local, cloud] of [
        [stale, deleted],
        [deleted, stale],
      ]) {
        const merged = mergeAppData(local, cloud, { conflictWinner });
        expect(ids(merged.categories)).toEqual(["cat-2"]);
        expect(ids(merged.recurringExpenses)).toEqual(["rec-2"]);
        // The transaction survives; only its deleted category is cleared.
        expect(find(merged.transactions, "tx-1").category).toBeUndefined();
      }
    },
  );
});

describe("mergeAppData: additions from elsewhere survive", () => {
  it("a transaction the CLI wrote to the cloud survives a save from a tab that never saw it", () => {
    const tab = appData({
      accounts: [account("acc-1")],
      transactions: [transaction("tx-old"), transaction("tx-from-tab")],
    });
    const cloud = appData({
      accounts: [account("acc-1")],
      transactions: [transaction("tx-old"), transaction("tx-from-cli")],
    });

    // The save path: cloudStorage.saveCloudData merges with local winning.
    const saved = mergeAppData(tab, cloud, { conflictWinner: "local" });
    expect(ids(saved.transactions)).toEqual([
      "tx-old",
      "tx-from-tab",
      "tx-from-cli",
    ]);

    // The load path: useAppData merges with the default (cloud wins).
    const loaded = mergeAppData(tab, cloud);
    expect(ids(loaded.transactions)).toEqual([
      "tx-old",
      "tx-from-cli",
      "tx-from-tab",
    ]);
  });

  it("records only one side has are kept for every collection", () => {
    const local = appData({
      accounts: [account("acc-local")],
      categories: [category("cat-local", "Local only")],
      recurringExpenses: [recurringExpense("rec-local")],
    });
    const cloud = appData({
      accounts: [account("acc-cloud")],
      categories: [category("cat-cloud", "Cloud only")],
      recurringExpenses: [recurringExpense("rec-cloud")],
    });

    const merged = mergeAppData(local, cloud, { conflictWinner: "local" });
    expect(ids(merged.accounts)).toEqual(["acc-local", "acc-cloud"]);
    expect(ids(merged.categories)).toEqual(["cat-local", "cat-cloud"]);
    expect(ids(merged.recurringExpenses)).toEqual(["rec-local", "rec-cloud"]);
  });
});

describe("mergeAppData: conflictWinner decides same-id conflicts by side, not by age", () => {
  // Characterization: records carry no updatedAt, so a whole record is taken
  // from the winning side even when the other side's copy is the newer edit
  // (dineros-1).
  const local = appData({
    accounts: [account("acc-1", { name: "Local name" })],
    categories: [category("cat-1", "Local category")],
    transactions: [
      transaction("tx-1", { description: "local edit", fromAmount: 111 }),
    ],
    recurringExpenses: [recurringExpense("rec-1", { name: "Local rec" })],
  });
  const cloud = appData({
    accounts: [account("acc-1", { name: "Cloud name" })],
    categories: [category("cat-1", "Cloud category")],
    transactions: [
      transaction("tx-1", { description: "cloud edit", fromAmount: 222 }),
    ],
    recurringExpenses: [recurringExpense("rec-1", { name: "Cloud rec" })],
  });

  it('"local" keeps this device\'s copy of every conflicting record', () => {
    const merged = mergeAppData(local, cloud, { conflictWinner: "local" });
    expect(merged.accounts.map((a) => a.name)).toEqual(["Local name"]);
    expect(merged.categories.map((c) => c.name)).toEqual(["Local category"]);
    expect(merged.transactions).toEqual([
      expect.objectContaining({ description: "local edit", fromAmount: 111 }),
    ]);
    expect(merged.recurringExpenses.map((r) => r.name)).toEqual(["Local rec"]);
  });

  it('"cloud" (the default) keeps the cloud copy of every conflicting record', () => {
    for (const merged of [
      mergeAppData(local, cloud, { conflictWinner: "cloud" }),
      mergeAppData(local, cloud),
    ]) {
      expect(merged.accounts.map((a) => a.name)).toEqual(["Cloud name"]);
      expect(merged.categories.map((c) => c.name)).toEqual(["Cloud category"]);
      expect(merged.transactions).toEqual([
        expect.objectContaining({ description: "cloud edit", fromAmount: 222 }),
      ]);
      expect(merged.recurringExpenses.map((r) => r.name)).toEqual(["Cloud rec"]);
    }
  });

  it("the losing side's copy wins nothing even when it is the newer edit", () => {
    const newerInCloud = appData({
      transactions: [
        transaction("tx-1", {
          description: "edited later on the phone",
          createdAt: NEWER,
        }),
      ],
    });
    const staleTab = appData({
      transactions: [
        transaction("tx-1", { description: "stale tab", createdAt: OLDER }),
      ],
    });

    const merged = mergeAppData(staleTab, newerInCloud, {
      conflictWinner: "local",
    });
    expect(merged.transactions.map((tx) => tx.description)).toEqual([
      "stale tab",
    ]);
  });

  it("a category from the losing side is dropped when the winner has one with the same name", () => {
    const merged = mergeAppData(
      appData({ categories: [category("cat-local", "Food")] }),
      appData({ categories: [category("cat-cloud", " food ")] }),
      { conflictWinner: "local" },
    );
    expect(ids(merged.categories)).toEqual(["cat-local"]);
  });
});

describe("mergeAppData: tombstone lists", () => {
  it("keeps one tombstone per id, the most recent deletion", () => {
    const merged = mergeAppData(
      appData({
        deletedTransactions: [
          { transactionId: "tx-1" as TransactionId, deletedAt: OLDER },
          { transactionId: "tx-2" as TransactionId, deletedAt: NEWER },
        ],
      }),
      appData({
        deletedTransactions: [
          { transactionId: "tx-1" as TransactionId, deletedAt: NEWER },
          { transactionId: "tx-3" as TransactionId, deletedAt: OLDER },
        ],
      }),
    );

    expect(merged.deletedTransactions).toEqual([
      { transactionId: "tx-1", deletedAt: NEWER },
      { transactionId: "tx-2", deletedAt: NEWER },
      { transactionId: "tx-3", deletedAt: OLDER },
    ]);
  });
});
