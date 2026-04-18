import { useState, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  Plus,
  ArrowRight,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { AccountId, Transaction } from "../types";
import { formatAmount } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { TransactionForm } from "./TransactionForm";
import { ConfirmDialog } from "./ConfirmDialog";
import { cn } from "@/lib/utils";

const ALL_ACCOUNTS_VALUE = "__all__";

interface TransactionsProps {
  appData: AppDataHandle;
}

interface DateGroup {
  date: string;
  label: string;
  transactions: Transaction[];
}

export function Transactions({ appData }: TransactionsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    Transaction | undefined
  >(undefined);
  const [deletingTransaction, setDeletingTransaction] = useState<
    Transaction | undefined
  >(undefined);
  const [filterAccountId, setFilterAccountId] =
    useState<string>(ALL_ACCOUNTS_VALUE);

  const filteredTransactions = useMemo(() => {
    if (filterAccountId === ALL_ACCOUNTS_VALUE) {
      return appData.data.transactions;
    }
    return appData.data.transactions.filter(
      (tx) =>
        tx.fromAccountId === filterAccountId ||
        tx.toAccountId === filterAccountId,
    );
  }, [appData.data.transactions, filterAccountId]);

  const dateGroups = useMemo((): DateGroup[] => {
    const sorted = [...filteredTransactions].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const groups = new Map<string, Transaction[]>();
    for (const tx of sorted) {
      const existing = groups.get(tx.date);
      if (existing != null) {
        existing.push(tx);
      } else {
        groups.set(tx.date, [tx]);
      }
    }

    return Array.from(groups.entries()).map(([date, transactions]) => ({
      date,
      label: format(parseISO(date), "EEEE, MMM d, yyyy"),
      transactions,
    }));
  }, [filteredTransactions]);

  const handleAddSave = useCallback(
    (tx: Omit<Transaction, "id" | "createdAt">) => {
      appData.addTransaction(tx);
    },
    [appData],
  );

  const handleEditSave = useCallback(
    (tx: Omit<Transaction, "id" | "createdAt">) => {
      if (editingTransaction == null) return;
      appData.updateTransaction(editingTransaction.id, tx);
      setEditingTransaction(undefined);
    },
    [appData, editingTransaction],
  );

  const handleDelete = useCallback(() => {
    if (deletingTransaction == null) return;
    appData.deleteTransaction(deletingTransaction.id);
    setDeletingTransaction(undefined);
  }, [appData, deletingTransaction]);

  function accountLabel(accountId: AccountId | null): string {
    if (accountId == null) return "—";
    const account = appData.accountsMap.get(accountId);
    if (account == null) return "[Deleted]";
    return account.name;
  }

  function transactionCurrency(tx: Transaction): string {
    const fromAccount =
      tx.fromAccountId != null
        ? appData.accountsMap.get(tx.fromAccountId)
        : undefined;
    const toAccount =
      tx.toAccountId != null
        ? appData.accountsMap.get(tx.toAccountId)
        : undefined;
    return fromAccount?.currency ?? toAccount?.currency ?? "";
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transactions</h1>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {appData.data.accounts.length > 0 && (
        <Select value={filterAccountId} onValueChange={setFilterAccountId}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACCOUNTS_VALUE}>All accounts</SelectItem>
            {appData.data.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {dateGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No transactions yet.</p>
          <p className="text-sm">Add your first transaction to get started.</p>
        </div>
      )}

      {dateGroups.map((group) => (
        <div key={group.date} className="space-y-2">
          <p className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          {group.transactions.map((tx) => {
            const isIncome = tx.fromAccountId == null;
            const isExpense = tx.toAccountId == null;
            const currency = transactionCurrency(tx);

            return (
              <Card key={tx.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm">
                      {isIncome && (
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      )}
                      {isExpense && (
                        <TrendingDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      {!isIncome && !isExpense && (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">
                        {accountLabel(tx.fromAccountId)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {accountLabel(tx.toAccountId)}
                      </span>
                    </div>
                    {tx.description.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {tx.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "whitespace-nowrap text-sm font-semibold",
                        isIncome && "text-emerald-400",
                        isExpense && "text-destructive",
                      )}
                    >
                      {formatAmount(tx.amount)} {currency}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingTransaction(tx)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeletingTransaction(tx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      <TransactionForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onSave={handleAddSave}
        accounts={appData.data.accounts}
      />

      <TransactionForm
        open={editingTransaction != null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(undefined);
        }}
        onSave={handleEditSave}
        accounts={appData.data.accounts}
        transaction={editingTransaction}
      />

      <ConfirmDialog
        open={deletingTransaction != null}
        onOpenChange={(open) => {
          if (!open) setDeletingTransaction(undefined);
        }}
        title="Delete Transaction"
        description={
          deletingTransaction != null
            ? `Delete this transaction of ${formatAmount(deletingTransaction.amount)} from ${accountLabel(deletingTransaction.fromAccountId)} to ${accountLabel(deletingTransaction.toAccountId)}?`
            : ""
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
