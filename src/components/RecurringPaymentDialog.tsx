import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { Account, AccountId, RecurringExpense } from "../types";
import { formatAmount } from "../types";
import { periodLabel, type PaymentRecord } from "../recurrence";
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

export interface RecurringPaymentValues {
  amount: number;
  accountId: AccountId;
  date: string;
  description?: string;
}

interface RecurringPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: RecurringExpense | null;
  period: string;
  dueDate: string;
  accounts: ReadonlyArray<Account>;
  payment: PaymentRecord | null;
  onConfirm: (values: RecurringPaymentValues) => void;
  onUnmark: () => void;
}

function todayLocalIso(): string {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function RecurringPaymentDialog({
  open,
  onOpenChange,
  expense,
  period,
  dueDate,
  accounts,
  payment,
  onConfirm,
  onUnmark,
}: RecurringPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open || expense == null) return;
    setAmount(
      expense.estimatedAmount == null ? "" : String(expense.estimatedAmount),
    );
    const fallbackAccount =
      expense.accountId ??
      accounts.find((a) => a.currency === expense.currency)?.id ??
      accounts[0]?.id ??
      "";
    setAccountId(fallbackAccount);
    setDate(dueDate <= todayLocalIso() ? dueDate : todayLocalIso());
  }, [open, expense, dueDate, accounts]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  const displayCurrency = selectedAccount?.currency ?? expense?.currency ?? "";

  if (expense == null) return null;

  const amountNumber = Number(amount);
  const canSubmit =
    accountId.length > 0 &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0;

  const isPaid = payment != null;

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      amount: Math.abs(amountNumber),
      accountId: accountId as AccountId,
      date,
      description: undefined,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense.name}</DialogTitle>
          <DialogDescription>{periodLabel(period)}</DialogDescription>
        </DialogHeader>

        {isPaid ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                <Check className="h-4 w-4" />
                Paid
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {formatAmount(payment.amount)}{" "}
                <span className="text-base font-medium text-muted-foreground">
                  {payment.currency ?? expense.currency}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                on {payment.date}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onUnmark();
                  onOpenChange(false);
                }}
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                Mark unpaid
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">
                Amount paid{" "}
                {displayCurrency.length > 0 && (
                  <span className="text-muted-foreground">
                    ({displayCurrency})
                  </span>
                )}
              </Label>
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="Exact amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
              {expense.estimatedAmount != null && (
                <p className="text-xs text-muted-foreground">
                  Estimate: ~{formatAmount(expense.estimatedAmount)}{" "}
                  {expense.currency}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-xs text-destructive">
                  Add an account first to record a payment.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                <Check className="mr-1 h-4 w-4" />
                Mark paid
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
