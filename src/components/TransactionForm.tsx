import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import type { Account, AccountId, Transaction } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Combobox, type ComboboxOption } from "./ui/combobox";
import { focusNextInForm } from "@/lib/utils";

const NONE_VALUE = "__none__";

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: Omit<Transaction, "id" | "createdAt">) => void;
  accounts: ReadonlyArray<Account>;
  transaction?: Transaction;
}

export function TransactionForm({
  open,
  onOpenChange,
  onSave,
  accounts,
  transaction,
}: TransactionFormProps) {
  const [date, setDate] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>(NONE_VALUE);
  const [toAccountId, setToAccountId] = useState<string>(NONE_VALUE);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setDate(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
      setFromAccountId(transaction?.fromAccountId ?? NONE_VALUE);
      setToAccountId(transaction?.toAccountId ?? NONE_VALUE);
      setCategory(transaction?.category ?? "");
      setAmount(transaction?.amount != null ? String(transaction.amount) : "");
      setDescription(transaction?.description ?? "");
    }
  }, [open, transaction]);

  const fromOptions = useMemo((): ComboboxOption[] => [
    { value: NONE_VALUE, label: "None (income / initial balance)" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ], [accounts]);

  const toOptions = useMemo((): ComboboxOption[] => [
    { value: NONE_VALUE, label: "None (expense)" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ], [accounts]);

  const isEditing = transaction != null;
  const parsedAmount = parseFloat(amount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount >= 0;
  const hasAtLeastOneAccount =
    fromAccountId !== NONE_VALUE || toAccountId !== NONE_VALUE;
  const fromAndToDiffer = fromAccountId !== toAccountId;
  const canSubmit =
    date.length > 0 &&
    hasValidAmount &&
    hasAtLeastOneAccount &&
    fromAndToDiffer;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({
      date,
      fromAccountId:
        fromAccountId === NONE_VALUE
          ? null
          : (fromAccountId as AccountId),
      toAccountId:
        toAccountId === NONE_VALUE ? null : (toAccountId as AccountId),
      category: category.trim().length > 0 ? category.trim() : undefined,
      amount: parsedAmount,
      description: description.trim(),
    });
    onOpenChange(false);
  }

  function handleDateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.showPicker();
    } else if (e.key === "Tab") {
      e.preventDefault();
      focusNextInForm(e.currentTarget, e.shiftKey);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Transaction" : "New Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the transaction details."
              : "Record a new money movement."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Combobox
              options={fromOptions}
              value={fromAccountId}
              onValueChange={setFromAccountId}
              placeholder="Search account..."
            />
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Combobox
              options={toOptions}
              value={toAccountId}
              onValueChange={setToAccountId}
              placeholder="Search account..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-category">Category</Label>
            <Input
              id="tx-category"
              placeholder="e.g. Food, Rent"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-amount">Amount</Label>
            <Input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Groceries, Initial balance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker()}
              onKeyDown={handleDateKeyDown}
            />
          </div>

          {!hasAtLeastOneAccount && fromAccountId === NONE_VALUE && toAccountId === NONE_VALUE && (
            <p className="text-sm text-destructive">
              At least one account (from or to) must be selected.
            </p>
          )}
          {fromAccountId === toAccountId && fromAccountId !== NONE_VALUE && (
            <p className="text-sm text-destructive">
              Source and destination cannot be the same account.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isEditing ? "Save" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
