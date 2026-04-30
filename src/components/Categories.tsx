import { useMemo, useState, useCallback } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { Category, CategoryId } from "../types";
import { normalizeCategoryLookupKey } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CategoryForm } from "./CategoryForm";
import { ConfirmDialog } from "./ConfirmDialog";

interface CategoriesProps {
  appData: AppDataHandle;
}

export function Categories({ appData }: CategoriesProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<
    Category | undefined
  >(undefined);
  const [deletingCategory, setDeletingCategory] = useState<
    Category | undefined
  >(undefined);

  const categories = useMemo(
    () =>
      [...appData.data.categories].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [appData.data.categories],
  );

  const handleAddSave = useCallback(
    (name: string) => {
      appData.addCategory({ name });
    },
    [appData],
  );

  const handleEditSave = useCallback(
    (name: string) => {
      if (editingCategory == null) return;
      appData.updateCategory(editingCategory.id, { name });
      setEditingCategory(undefined);
    },
    [appData, editingCategory],
  );

  const handleDelete = useCallback(() => {
    if (deletingCategory == null) return;
    appData.deleteCategory(deletingCategory.id);
    setDeletingCategory(undefined);
  }, [appData, deletingCategory]);

  const txCountForCategory = useCallback(
    (categoryId: CategoryId) => {
      const category = appData.data.categories.find((c) => c.id === categoryId);
      if (category == null) return 0;
      const categoryKey = normalizeCategoryLookupKey(category.name);
      return appData.data.transactions.filter(
        (tx) => normalizeCategoryLookupKey(tx.category) === categoryKey,
      ).length;
    },
    [appData.data.categories, appData.data.transactions],
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Categories</h1>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {categories.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No categories yet.</p>
          <p className="text-sm">Add your first category to get started.</p>
        </div>
      )}

      {categories.map((category) => {
        const txCount = txCountForCategory(category.id);
        return (
          <Card
            key={category.id}
            className="flex items-center justify-between p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{category.name}</p>
              <p className="text-sm text-muted-foreground">
                {txCount} transaction{txCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditingCategory(category)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeletingCategory(category)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        );
      })}

      <CategoryForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onSave={handleAddSave}
        categories={appData.data.categories}
      />

      <CategoryForm
        open={editingCategory != null}
        onOpenChange={(open) => {
          if (!open) setEditingCategory(undefined);
        }}
        onSave={handleEditSave}
        categories={appData.data.categories}
        category={editingCategory}
      />

      <ConfirmDialog
        open={deletingCategory != null}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(undefined);
        }}
        title="Delete Category"
        description={
          deletingCategory != null
            ? `Delete "${deletingCategory.name}"? This will clear it from ${txCountForCategory(deletingCategory.id)} transaction(s).`
            : ""
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
