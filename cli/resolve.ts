import type {
  Account,
  AccountId,
  AppData,
  Category,
  RecurringExpense,
  Transaction,
} from "../src/types";
import { cleanCategoryName, normalizeCategoryLookupKey } from "../src/types";
import { UsageError } from "./args";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Resolves a user-typed reference (id, exact name, or unique substring) to a
 * single item, refusing to guess when the query is ambiguous.
 */
function resolveOne<T>(
  items: ReadonlyArray<T>,
  query: string,
  id: (item: T) => string,
  name: (item: T) => string,
  label: string,
): T {
  const byId = items.find((item) => id(item) === query);
  if (byId != null) return byId;

  const wanted = normalize(query);
  const exact = items.filter((item) => normalize(name(item)) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new UsageError(
      `Several ${label}s are named "${query}": ${exact.map(id).join(", ")}. Use the id.`,
    );
  }

  const partial = items.filter((item) => normalize(name(item)).includes(wanted));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new UsageError(
      `"${query}" matches several ${label}s: ${partial.map(name).join(", ")}.`,
    );
  }

  throw new UsageError(
    `No ${label} matches "${query}". Known: ${items.map(name).join(", ") || "(none)"}.`,
  );
}

export function resolveAccount(
  accounts: ReadonlyArray<Account>,
  query: string,
): Account {
  return resolveOne(accounts, query, (a) => a.id, (a) => a.name, "account");
}

export function resolveRecurringExpense(
  expenses: ReadonlyArray<RecurringExpense>,
  query: string,
): RecurringExpense {
  return resolveOne(
    expenses,
    query,
    (e) => e.id,
    (e) => e.name,
    "recurring expense",
  );
}

/**
 * Reuses an existing category's spelling when one matches case-insensitively,
 * so the CLI never creates a near-duplicate like "rent" next to "Rent".
 */
export function resolveCategoryName(
  categories: ReadonlyArray<Category>,
  query: string | undefined,
): string | undefined {
  const cleaned = cleanCategoryName(query);
  if (cleaned.length === 0) return undefined;
  const key = normalizeCategoryLookupKey(cleaned);
  const existing = categories.find(
    (category) => normalizeCategoryLookupKey(category.name) === key,
  );
  return existing?.name ?? cleaned;
}

export function accountBalances(data: AppData): Map<AccountId, number> {
  const balances = new Map<AccountId, number>();
  for (const account of data.accounts) balances.set(account.id, 0);
  for (const tx of data.transactions) {
    if (tx.isExpected === true) continue;
    if (tx.fromAccountId != null) {
      balances.set(
        tx.fromAccountId,
        (balances.get(tx.fromAccountId) ?? 0) - (tx.fromAmount ?? 0),
      );
    }
    if (tx.toAccountId != null) {
      balances.set(
        tx.toAccountId,
        (balances.get(tx.toAccountId) ?? 0) + (tx.toAmount ?? 0),
      );
    }
  }
  return balances;
}

export function accountName(
  data: AppData,
  accountId: AccountId | null,
): string | null {
  if (accountId == null) return null;
  return data.accounts.find((a) => a.id === accountId)?.name ?? accountId;
}

export function describeTransaction(data: AppData, tx: Transaction): string {
  const from = accountName(data, tx.fromAccountId);
  const to = accountName(data, tx.toAccountId);
  const parts: string[] = [tx.date];
  if (from != null) {
    parts.push(
      `-${(tx.fromAmount ?? 0).toFixed(2)} ${tx.fromCurrency ?? ""} ${from}`.trim(),
    );
  }
  if (to != null) {
    parts.push(
      `+${(tx.toAmount ?? 0).toFixed(2)} ${tx.toCurrency ?? ""} ${to}`.trim(),
    );
  }
  if (tx.category != null) parts.push(`[${tx.category}]`);
  if (tx.description.length > 0) parts.push(tx.description);
  if (tx.isExpected === true) parts.push("(expected)");
  return parts.join("  ");
}
