import { useState, useEffect, type KeyboardEvent } from "react";
import type { Account } from "../types";
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
import { focusNextInForm } from "@/lib/utils";

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, currency: string) => void;
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
  const [initialName, setInitialName] = useState("");
  const [initialCurrency, setInitialCurrency] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const nextName = account?.name ?? "";
      const nextCurrency = account?.currency ?? "";
      setName(nextName);
      setCurrency(nextCurrency);
      setInitialName(nextName);
      setInitialCurrency(nextCurrency);
      setDiscardDialogOpen(false);
    }
  }, [open, account]);

  const isEditing = account != null;
  const canSubmit = name.trim().length > 0 && currency.trim().length > 0;
  const isDirty = open && (name !== initialName || currency !== initialCurrency);

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
    onSave(name.trim(), currency.trim().toUpperCase());
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
