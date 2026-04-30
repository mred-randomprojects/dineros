import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import {
  Plus,
  ArrowRight,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Upload,
} from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { AccountId, Transaction, TransactionId } from "../types";
import { calculateExchangeRate, formatAmount } from "../types";
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
import { TransactionImportDialog } from "./TransactionImportDialog";
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest('[role="dialog"]') != null) return true;
  return false;
}

export function Transactions({ appData }: TransactionsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    Transaction | undefined
  >(undefined);
  const [deletingTransaction, setDeletingTransaction] = useState<
    Transaction | undefined
  >(undefined);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [filterAccountId, setFilterAccountId] =
    useState<string>(ALL_ACCOUNTS_VALUE);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

  const flatTransactions = useMemo(
    () => dateGroups.flatMap((g) => g.transactions),
    [dateGroups],
  );

  const txFlatIndexMap = useMemo(() => {
    const map = new Map<TransactionId, number>();
    let idx = 0;
    for (const group of dateGroups) {
      for (const tx of group.transactions) {
        map.set(tx.id, idx++);
      }
    }
    return map;
  }, [dateGroups]);

  // Clamp selection when transactions change
  useEffect(() => {
    if (selectedIndex != null && selectedIndex >= flatTransactions.length) {
      setSelectedIndex(
        flatTransactions.length > 0 ? flatTransactions.length - 1 : null,
      );
    }
  }, [selectedIndex, flatTransactions.length]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(null);
  }, [filterAccountId]);

  // Scroll selected transaction into view
  useEffect(() => {
    if (selectedIndex == null) return;
    const tx = flatTransactions[selectedIndex];
    if (tx == null) return;
    document
      .getElementById(`tx-${tx.id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, flatTransactions]);

  // Keyboard navigation: Arrow keys to select, E to edit
  const flatTransactionsRef = useRef(flatTransactions);
  flatTransactionsRef.current = flatTransactions;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInteractiveTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const len = flatTransactionsRef.current.length;
      if (len === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev == null) return 0;
          return Math.min(prev + 1, len - 1);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev == null || prev === 0) return null;
          return prev - 1;
        });
      } else if (e.key === "e" || e.key === "E") {
        const idx = selectedIndexRef.current;
        if (idx != null) {
          const tx = flatTransactionsRef.current[idx];
          if (tx != null) {
            e.preventDefault();
            setEditingTransaction(tx);
          }
        }
      } else if (e.key === "Escape") {
        setSelectedIndex(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowImportDialog(true)}
          >
            <Upload className="mr-1 h-4 w-4" />
            Import
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
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
            const flatIdx = txFlatIndexMap.get(tx.id);
            const isSelected = flatIdx === selectedIndex;
            const amountLabel = transactionAmountLabel(tx);
            const detailLabel = transactionDetailLabel(tx);

            return (
              <Card
                key={tx.id}
                id={`tx-${tx.id}`}
                className={cn(
                  "p-3 transition-shadow",
                  isSelected && "ring-2 ring-primary",
                )}
                onClick={() => setSelectedIndex(flatIdx ?? null)}
              >
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
                    {tx.category != null && tx.category.length > 0 && (
                      <p className="mt-0.5 truncate text-xs font-medium text-primary">
                        {tx.category}
                      </p>
                    )}
                    {detailLabel != null && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {detailLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "max-w-[9rem] whitespace-normal text-right text-sm font-semibold leading-tight",
                        isIncome && "text-emerald-400",
                        isExpense && "text-destructive",
                      )}
                    >
                      {amountLabel}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTransaction(tx);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTransaction(tx);
                      }}
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
        categories={appData.data.categories}
      />

      <TransactionImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        appData={appData}
      />

      <TransactionForm
        open={editingTransaction != null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(undefined);
        }}
        onSave={handleEditSave}
        accounts={appData.data.accounts}
        categories={appData.data.categories}
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
            ? `Delete this transaction of ${transactionAmountLabel(deletingTransaction)} from ${accountLabel(deletingTransaction.fromAccountId)} to ${accountLabel(deletingTransaction.toAccountId)}?`
            : ""
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}

function transactionAmountLabel(tx: Transaction): string {
  const fromLabel =
    tx.fromAmount == null
      ? null
      : `${formatAmount(tx.fromAmount)} ${tx.fromCurrency ?? ""}`.trim();
  const toLabel =
    tx.toAmount == null
      ? null
      : `${formatAmount(tx.toAmount)} ${tx.toCurrency ?? ""}`.trim();

  if (fromLabel == null) return toLabel ?? "0.00";
  if (toLabel == null) return fromLabel;
  if (tx.fromCurrency === tx.toCurrency && tx.fromAmount === tx.toAmount) {
    return fromLabel;
  }
  return `${fromLabel} -> ${toLabel}`;
}

function transactionDetailLabel(tx: Transaction): string | null {
  const exchangeRate = calculateExchangeRate(tx);
  if (
    exchangeRate != null &&
    tx.fromCurrency != null &&
    tx.toCurrency != null &&
    tx.fromCurrency !== tx.toCurrency
  ) {
    return `1 ${tx.toCurrency} = ${formatRate(exchangeRate)} ${tx.fromCurrency}`;
  }

  if (
    tx.fromAmount != null &&
    tx.toAmount != null &&
    tx.fromCurrency != null &&
    tx.fromCurrency === tx.toCurrency &&
    tx.fromAmount > tx.toAmount
  ) {
    return `Difference: ${formatAmount(tx.fromAmount - tx.toAmount)} ${tx.fromCurrency}`;
  }

  return null;
}

function formatRate(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
