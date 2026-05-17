import { useState, useEffect, type KeyboardEvent } from "react";
import type { Account } from "../types";
import { cleanAccountComment } from "../types";
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
import { Textarea } from "./ui/textarea";
import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { focusNextInForm } from "@/lib/utils";

export interface AccountFormValues {
  name: string;
  currency: string;
  comment?: string;
  hideBalanceByDefault: boolean;
}

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: AccountFormValues) => void;
  account?: Account;
}

export function AccountForm({
  open,
  onOpenChange,
  onSave,
  account,
}: AccountFormProps) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [comment, setComment] = useState("");
  const [hideBalanceByDefault, setHideBalanceByDefault] = useState(false);
  const [initialName, setInitialName] = useState("");
  const [initialCurrency, setInitialCurrency] = useState("");
  const [initialComment, setInitialComment] = useState("");
  const [initialHideBalanceByDefault, setInitialHideBalanceByDefault] =
    useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const nextName = account?.name ?? "";
      const nextCurrency = account?.currency ?? "";
      const nextComment = account?.comment ?? "";
      const nextHideBalanceByDefault = account?.hideBalanceByDefault === true;
      setName(nextName);
      setCurrency(nextCurrency);
      setComment(nextComment);
      setHideBalanceByDefault(nextHideBalanceByDefault);
      setInitialName(nextName);
      setInitialCurrency(nextCurrency);
      setInitialComment(nextComment);
      setInitialHideBalanceByDefault(nextHideBalanceByDefault);
      setDiscardDialogOpen(false);
    }
  }, [open, account]);

  const isEditing = account != null;
  const canSubmit = name.trim().length > 0 && currency.trim().length > 0;
  const isDirty =
    open &&
    (name !== initialName ||
      currency !== initialCurrency ||
      comment !== initialComment ||
      hideBalanceByDefault !== initialHideBalanceByDefault);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({
      name: name.trim(),
      currency: currency.trim().toUpperCase(),
      comment: cleanAccountComment(comment) || undefined,
      hideBalanceByDefault,
    });
    closeWithoutPrompt();
  }

  function handleNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusNextInForm(e.currentTarget, e.shiftKey);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Account" : "New Account"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the account details."
                : "Add a new account to track your money."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                placeholder="e.g. Cash wallet"
                value={name}
                enterKeyHint="next"
                autoComplete="off"
                autoCapitalize="words"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-currency">Currency</Label>
              <Input
                id="account-currency"
                placeholder="e.g. ARS, USD"
                value={currency}
                enterKeyHint="done"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-comment">Comment</Label>
              <Textarea
                id="account-comment"
                placeholder="e.g. Money owed for groceries and ubers"
                value={comment}
                maxLength={220}
                rows={3}
                autoComplete="off"
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <label
              htmlFor="account-hide-balance"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <input
                id="account-hide-balance"
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={hideBalanceByDefault}
                onChange={(e) => setHideBalanceByDefault(e.target.checked)}
              />
              <span>Hide balances by default</span>
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {isEditing ? "Save" : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard account changes?"
        description="Closing now will lose the account changes you have not saved."
        onStay={() => setDiscardDialogOpen(false)}
        onDiscard={closeWithoutPrompt}
      />
    </>
  );
}
