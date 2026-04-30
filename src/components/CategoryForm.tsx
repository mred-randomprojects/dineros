import { useMemo, useState, useEffect } from "react";
import type { Category } from "../types";
import { normalizeCategoryLookupKey } from "../types";
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

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  categories: ReadonlyArray<Category>;
  category?: Category;
}

export function CategoryForm({
  open,
  onOpenChange,
  onSave,
  categories,
  category,
}: CategoryFormProps) {
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const nextName = category?.name ?? "";
      setName(nextName);
      setInitialName(nextName);
      setDiscardDialogOpen(false);
    }
  }, [open, category]);

  const existingCategoryNames = useMemo(
    () =>
      new Set(
        categories
          .filter((existing) => existing.id !== category?.id)
          .map((existing) => normalizeCategoryLookupKey(existing.name)),
      ),
    [categories, category?.id],
  );

  const isEditing = category != null;
  const normalizedName = normalizeCategoryLookupKey(name);
  const isDuplicate =
    normalizedName.length > 0 && existingCategoryNames.has(normalizedName);
  const canSubmit = normalizedName.length > 0 && !isDuplicate;
  const isDirty = open && name !== initialName;

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
    onSave(name.trim().replace(/\s+/g, " "));
    closeWithoutPrompt();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Category" : "New Category"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the category name."
                : "Add a category for future transactions."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                placeholder="e.g. Food, Rent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {isDuplicate && (
                <p className="text-sm text-destructive">
                  A category with this name already exists.
                </p>
              )}
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
                {isEditing ? "Save" : "Add Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard category changes?"
        description="Closing now will lose the category changes you have not saved."
        onStay={() => setDiscardDialogOpen(false)}
        onDiscard={closeWithoutPrompt}
      />
    </>
  );
}
