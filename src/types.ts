export type AccountId = string & { readonly __brand: "AccountId" };
export type TransactionId = string & { readonly __brand: "TransactionId" };

export function generateId(): string {
  return crypto.randomUUID();
}

export interface Account {
  id: AccountId;
  name: string;
  currency: string;
  createdAt: string;
}

export interface Transaction {
  id: TransactionId;
  date: string;
  fromAccountId: AccountId | null;
  toAccountId: AccountId | null;
  amount: number;
  description: string;
  createdAt: string;
}

export interface AppData {
  accounts: Account[];
  transactions: Transaction[];
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
