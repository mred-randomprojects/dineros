import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (open) {
      setName(account?.name ?? "");
      setCurrency(account?.currency ?? "");
    }
  }, [open, account]);

  const isEditing = account != null;
  const canSubmit = name.trim().length > 0 && currency.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSave(name.trim(), currency.trim().toUpperCase());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-currency">Currency</Label>
            <Input
              id="account-currency"
              placeholder="e.g. ARS, USD"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
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
              {isEditing ? "Save" : "Add Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
