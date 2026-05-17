import { useEffect, useState, type FormEvent } from "react";
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
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { DiscardChangesDialog } from "./DiscardChangesDialog";

export interface AccountUpToDateFormValues {
  comment?: string;
}

interface AccountUpToDateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: AccountUpToDateFormValues) => void;
  account?: Account;
}

export function AccountUpToDateForm({
  open,
  onOpenChange,
  onSave,
  account,
}: AccountUpToDateFormProps) {
  const [comment, setComment] = useState("");
  const [initialComment, setInitialComment] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const nextComment = account?.comment ?? "";
    setComment(nextComment);
    setInitialComment(nextComment);
    setDiscardDialogOpen(false);
  }, [account, open]);

  const isDirty = open && comment !== initialComment;

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
    if (account == null) return;

    onSave({
      comment: cleanAccountComment(comment) || undefined,
    });
    closeWithoutPrompt();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Up To Date</DialogTitle>
            <DialogDescription>
              Save a quick note and refresh the account status for{" "}
              {account?.name ?? "this account"}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="up-to-date-comment">Comment</Label>
              <Textarea
                id="up-to-date-comment"
                placeholder="e.g. Still updated: groceries and ubers"
                value={comment}
                maxLength={220}
                rows={3}
                autoComplete="off"
                onChange={(e) => setComment(e.target.value)}
                autoFocus
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
              <Button type="submit" disabled={account == null}>
                Mark Up To Date
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard account comment?"
        description="Closing now will lose the account comment you have not saved."
        onStay={() => setDiscardDialogOpen(false)}
        onDiscard={closeWithoutPrompt}
      />
    </>
  );
}
