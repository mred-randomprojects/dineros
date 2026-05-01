import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { format } from "date-fns";
import type { Account } from "../types";
import { formatAmount } from "../types";
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
import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { cn, focusNextInForm } from "@/lib/utils";

export interface BalanceAdjustmentSaveInput {
  targetBalance: number;
  date: string;
  description?: string;
}

interface BalanceAdjustmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: BalanceAdjustmentSaveInput) => void;
  account?: Account;
  currentBalance: number;
}

export function BalanceAdjustmentForm({
  open,
  onOpenChange,
  onSave,
  account,
  currentBalance,
}: BalanceAdjustmentFormProps) {
  const [targetBalance, setTargetBalance] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [initialTargetBalance, setInitialTargetBalance] = useState("");
  const [initialDate, setInitialDate] = useState("");
  const [initialDescription, setInitialDescription] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const nextTargetBalance = formatDecimalInput(currentBalance, 2);
    const nextDate = format(new Date(), "yyyy-MM-dd");
    setTargetBalance(nextTargetBalance);
    setDate(nextDate);
    setDescription("");
    setInitialTargetBalance(nextTargetBalance);
    setInitialDate(nextDate);
    setInitialDescription("");
    setDiscardDialogOpen(false);
  }, [currentBalance, open]);

  const parsedTargetBalance = parseAmountInput(targetBalance);
  const delta =
    parsedTargetBalance == null
      ? null
      : roundMoney(parsedTargetBalance - currentBalance);
  const canSubmit =
    account != null &&
    date.length > 0 &&
    parsedTargetBalance != null &&
    delta != null &&
    delta !== 0;
  const isDirty =
    open &&
    (targetBalance !== initialTargetBalance ||
      date !== initialDate ||
      description !== initialDescription);

  function closeWithoutPrompt() {
    setDiscardDialogOpen(false);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }

    closeWithoutPrompt();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || parsedTargetBalance == null) return;
    onSave({
      targetBalance: roundMoney(parsedTargetBalance),
      date,
      description: description.trim() || undefined,
    });
    closeWithoutPrompt();
  }

  function handleFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusNextInForm(e.currentTarget, e.shiftKey);
  }

  function handleDateKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.showPicker();
    } else if (e.key === "Tab") {
      e.preventDefault();
      focusNextInForm(e.currentTarget, e.shiftKey);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Balance</DialogTitle>
            <DialogDescription>
              Record a reconciliation transaction for {account?.name ?? "this account"}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Current</span>
                <span className="text-sm font-semibold">
                  {formatAmount(currentBalance)} {account?.currency ?? ""}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Adjustment
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    delta == null || delta === 0
                      ? "text-muted-foreground"
                      : delta > 0
                        ? "text-emerald-400"
                        : "text-destructive",
                  )}
                >
                  {delta == null
                    ? "—"
                    : `${delta > 0 ? "+" : ""}${formatAmount(delta)} ${
                        account?.currency ?? ""
                      }`}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-target-balance">New balance</Label>
              <Input
                id="adjust-target-balance"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={targetBalance}
                onChange={(e) => setTargetBalance(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-description">Comment</Label>
              <Input
                id="adjust-description"
                placeholder="e.g. Interest, missing transaction, reconciliation"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-date">Date</Label>
              <Input
                id="adjust-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker()}
                onKeyDown={handleDateKeyDown}
              />
            </div>

            {parsedTargetBalance == null && targetBalance.trim().length > 0 && (
              <p className="text-sm text-destructive">
                Enter a valid balance.
              </p>
            )}
            {delta === 0 && (
              <p className="text-sm text-muted-foreground">
                This account already matches that balance.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                Create Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard balance adjustment?"
        description="Closing now will lose the balance adjustment you have not saved."
        onStay={() => setDiscardDialogOpen(false)}
        onDiscard={closeWithoutPrompt}
      />
    </>
  );
}

function parseAmountInput(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function formatDecimalInput(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(maximumFractionDigits)).toString();
}
