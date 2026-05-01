import { useState, useMemo, useCallback } from "react";
import { Plus, Pencil, Scale, Trash2 } from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { Account, AccountId } from "../types";
import { formatAmount } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { AccountForm } from "./AccountForm";
import {
  BalanceAdjustmentForm,
  type BalanceAdjustmentSaveInput,
} from "./BalanceAdjustmentForm";
import { ConfirmDialog } from "./ConfirmDialog";
import { cn } from "@/lib/utils";

interface AccountsProps {
  appData: AppDataHandle;
}

interface CurrencyGroup {
  currency: string;
  accounts: Account[];
  total: number;
}

export function Accounts({ appData }: AccountsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(
    undefined,
  );
  const [adjustingAccount, setAdjustingAccount] = useState<
    Account | undefined
  >(undefined);
  const [deletingAccount, setDeletingAccount] = useState<Account | undefined>(
    undefined,
  );

  const currencyGroups = useMemo((): CurrencyGroup[] => {
    const groups = new Map<string, Account[]>();
    for (const account of appData.data.accounts) {
      const existing = groups.get(account.currency);
      if (existing != null) {
        existing.push(account);
      } else {
        groups.set(account.currency, [account]);
      }
    }

    return Array.from(groups.entries()).map(([currency, accounts]) => {
      let total = 0;
      for (const account of accounts) {
        total += appData.accountBalances.get(account.id) ?? 0;
      }
      return { currency, accounts, total };
    });
  }, [appData.data.accounts, appData.accountBalances]);

  const handleAddSave = useCallback(
    (name: string, currency: string) => {
      appData.addAccount({ name, currency });
    },
    [appData],
  );

  const handleEditSave = useCallback(
    (name: string, currency: string) => {
      if (editingAccount == null) return;
      appData.updateAccount(editingAccount.id, { name, currency });
      setEditingAccount(undefined);
    },
    [appData, editingAccount],
  );

  const handleDelete = useCallback(() => {
    if (deletingAccount == null) return;
    appData.deleteAccount(deletingAccount.id);
    setDeletingAccount(undefined);
  }, [appData, deletingAccount]);

  const handleAdjustmentSave = useCallback(
    (input: BalanceAdjustmentSaveInput) => {
      if (adjustingAccount == null) return;
      appData.addBalanceAdjustment({
        accountId: adjustingAccount.id,
        ...input,
      });
      setAdjustingAccount(undefined);
    },
    [adjustingAccount, appData],
  );

  const txCountForAccount = useCallback(
    (accountId: AccountId) =>
      appData.data.transactions.filter(
        (tx) =>
          tx.fromAccountId === accountId || tx.toAccountId === accountId,
      ).length,
    [appData.data.transactions],
  );

  const adjustingAccountBalance =
    adjustingAccount == null
      ? 0
      : (appData.accountBalances.get(adjustingAccount.id) ?? 0);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Accounts</h1>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {currencyGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No accounts yet.</p>
          <p className="text-sm">Add your first account to get started.</p>
        </div>
      )}

      {currencyGroups.map((group) => (
        <div key={group.currency} className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm font-medium text-muted-foreground">
              {group.currency}
            </span>
            <span
              className={cn(
                "text-sm font-semibold",
                group.total >= 0 ? "text-emerald-400" : "text-destructive",
              )}
            >
              {formatAmount(group.total)}
            </span>
          </div>

          {group.accounts.map((account) => {
            const balance = appData.accountBalances.get(account.id) ?? 0;
            return (
              <Card key={account.id} className="flex items-center justify-between p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.name}</p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      balance >= 0
                        ? "text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {formatAmount(balance)} {account.currency}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Adjust balance for ${account.name}`}
                    title="Adjust balance"
                    onClick={() => setAdjustingAccount(account)}
                  >
                    <Scale className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingAccount(account)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeletingAccount(account)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      <AccountForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onSave={handleAddSave}
      />

      <AccountForm
        open={editingAccount != null}
        onOpenChange={(open) => {
          if (!open) setEditingAccount(undefined);
        }}
        onSave={handleEditSave}
        account={editingAccount}
      />

      <BalanceAdjustmentForm
        open={adjustingAccount != null}
        onOpenChange={(open) => {
          if (!open) setAdjustingAccount(undefined);
        }}
        onSave={handleAdjustmentSave}
        account={adjustingAccount}
        currentBalance={adjustingAccountBalance}
      />

      <ConfirmDialog
        open={deletingAccount != null}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(undefined);
        }}
        title="Delete Account"
        description={
          deletingAccount != null
            ? `Delete "${deletingAccount.name}"? This will also remove all ${txCountForAccount(deletingAccount.id)} transaction(s) referencing this account.`
            : ""
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
