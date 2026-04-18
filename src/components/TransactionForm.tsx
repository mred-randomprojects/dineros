import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setDate(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
      setFromAccountId(transaction?.fromAccountId ?? NONE_VALUE);
      setToAccountId(transaction?.toAccountId ?? NONE_VALUE);
      setAmount(transaction?.amount != null ? String(transaction.amount) : "");
      setDescription(transaction?.description ?? "");
    }
  }, [open, transaction]);

  const isEditing = transaction != null;
  const parsedAmount = parseFloat(amount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
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
      amount: parsedAmount,
      description: description.trim(),
    });
    onOpenChange(false);
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
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>From</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  None (income / initial balance)
                </SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  None (expense)
                </SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
