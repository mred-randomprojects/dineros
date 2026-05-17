import {
  useState,
  useMemo,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import {
  CheckCircle2,
  CircleMinus,
  Clock3,
  Plus,
  Pencil,
  Search,
  Scale,
  Trash2,
  X,
} from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { Account, AccountId, Transaction } from "../types";
import { formatAmount } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
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

type AccountUpdateTone = "fresh" | "aging" | "quiet";

interface AccountUpdateStatus {
  tone: AccountUpdateTone;
  label: string;
  title: string;
  Icon: typeof CheckCircle2;
}

const FRESH_UPDATE_DAYS = 7;
const AGING_UPDATE_DAYS = 30;

export function Accounts({ appData }: AccountsProps) {
  const navigate = useNavigate();
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(
    undefined,
  );
  const [adjustingAccount, setAdjustingAccount] = useState<
    Account | undefined
  >(undefined);
  const [deletingAccount, setDeletingAccount] = useState<Account | undefined>(
    undefined,
  );
  const accountCardRefs = useRef(new Map<AccountId, HTMLDivElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchTokens = useMemo(
    () => normalizeAccountSearchValue(searchQuery).split(" ").filter(Boolean),
    [searchQuery],
  );

  const currencyGroups = useMemo((): CurrencyGroup[] => {
    const groups = new Map<string, Account[]>();
    for (const account of appData.data.accounts) {
      if (!accountMatchesSearch(account, searchTokens)) continue;

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
  }, [appData.data.accounts, appData.accountBalances, searchTokens]);

  const visibleAccountIds = useMemo(
    () =>
      currencyGroups.flatMap((group) =>
        group.accounts.map((account) => account.id),
      ),
    [currencyGroups],
  );

  const focusAccountCard = useCallback((accountId: AccountId | undefined) => {
    if (accountId == null) return;
    accountCardRefs.current.get(accountId)?.focus();
  }, []);

  const moveAccountFocus = useCallback(
    (accountId: AccountId, offset: -1 | 1) => {
      const currentIndex = visibleAccountIds.indexOf(accountId);
      if (currentIndex === -1) return;

      const nextIndex = Math.min(
        visibleAccountIds.length - 1,
        Math.max(0, currentIndex + offset),
      );
      focusAccountCard(visibleAccountIds[nextIndex]);
    },
    [focusAccountCard, visibleAccountIds],
  );

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" && visibleAccountIds.length > 0) {
        e.preventDefault();
        focusAccountCard(visibleAccountIds[0]);
      } else if (e.key === "Escape" && searchQuery.length > 0) {
        e.preventDefault();
        setSearchQuery("");
      }
    },
    [focusAccountCard, searchQuery.length, visibleAccountIds],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

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

  const handleOpenTransactions = useCallback(
    (accountId: AccountId) => {
      navigate(`/transactions?accountId=${encodeURIComponent(accountId)}`);
    },
    [navigate],
  );

  const handleAccountKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, accountId: AccountId) => {
      if (e.currentTarget !== e.target) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleOpenTransactions(accountId);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveAccountFocus(accountId, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveAccountFocus(accountId, -1);
      }
    },
    [handleOpenTransactions, moveAccountFocus],
  );

  const txCountForAccount = useCallback(
    (accountId: AccountId) =>
      appData.data.transactions.filter(
        (tx) =>
          tx.fromAccountId === accountId || tx.toAccountId === accountId,
      ).length,
    [appData.data.transactions],
  );

  const latestUpdateByAccount = useMemo(
    () => buildLatestUpdateByAccount(appData.data.transactions),
    [appData.data.transactions],
  );

  const adjustingAccountBalance =
    adjustingAccount == null
      ? 0
      : (appData.accountBalances.get(adjustingAccount.id) ?? 0);
  const hasAccounts = appData.data.accounts.length > 0;
  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Accounts</h1>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {hasAccounts && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-9 pr-10"
            placeholder="Search accounts..."
            aria-label="Search accounts"
          />
          {hasSearchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              aria-label="Clear account search"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {!hasAccounts && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No accounts yet.</p>
          <p className="text-sm">Add your first account to get started.</p>
        </div>
      )}

      {hasAccounts && currencyGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No accounts match this search.</p>
          <p className="text-sm">Try a different account name or currency.</p>
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
            const updateStatus = accountUpdateStatus(
              latestUpdateByAccount.get(account.id),
            );
            const StatusIcon = updateStatus.Icon;
            return (
              <Card
                key={account.id}
                ref={(node) => {
                  if (node == null) {
                    accountCardRefs.current.delete(account.id);
                  } else {
                    accountCardRefs.current.set(account.id, node);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`View transactions for ${account.name}`}
                title="View transactions"
                className="flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => handleOpenTransactions(account.id)}
                onKeyDown={(e) => handleAccountKeyDown(e, account.id)}
              >
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
                  <p
                    className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground"
                    title={updateStatus.title}
                    aria-label={`${account.name}: ${updateStatus.title}`}
                  >
                    <StatusIcon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        updateStatus.tone === "fresh" && "text-emerald-400",
                        updateStatus.tone === "aging" && "text-amber-300",
                        updateStatus.tone === "quiet" &&
                          "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{updateStatus.label}</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Adjust balance for ${account.name}`}
                    title="Adjust balance"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdjustingAccount(account);
                    }}
                  >
                    <Scale className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Edit ${account.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAccount(account);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`Delete ${account.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingAccount(account);
                    }}
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

function buildLatestUpdateByAccount(
  transactions: ReadonlyArray<Transaction>,
): Map<AccountId, Date> {
  const latest = new Map<AccountId, Date>();

  function record(accountId: AccountId | null, date: Date) {
    if (accountId == null) return;
    const existing = latest.get(accountId);
    if (existing == null || date > existing) {
      latest.set(accountId, date);
    }
  }

  for (const tx of transactions) {
    if (tx.isExpected === true) continue;

    const date = parseISO(tx.date);
    if (!isValid(date)) continue;

    record(tx.fromAccountId, date);
    record(tx.toAccountId, date);
  }

  return latest;
}

function normalizeAccountSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function accountMatchesSearch(
  account: Account,
  searchTokens: ReadonlyArray<string>,
): boolean {
  if (searchTokens.length === 0) return true;

  const searchableValue = normalizeAccountSearchValue(
    `${account.name} ${account.currency}`,
  );
  return searchTokens.every((token) => searchableValue.includes(token));
}

function accountUpdateStatus(
  latestUpdate: Date | undefined,
): AccountUpdateStatus {
  if (latestUpdate == null) {
    return {
      tone: "quiet",
      label: "No updates yet",
      title: "No transactions recorded for this account.",
      Icon: CircleMinus,
    };
  }

  const daysSinceUpdate = Math.max(
    0,
    differenceInCalendarDays(new Date(), latestUpdate),
  );
  const updateDate = format(latestUpdate, "MMM d, yyyy");

  if (daysSinceUpdate <= FRESH_UPDATE_DAYS) {
    return {
      tone: "fresh",
      label: relativeUpdateLabel(daysSinceUpdate),
      title: `Last transaction update: ${updateDate}.`,
      Icon: CheckCircle2,
    };
  }

  if (daysSinceUpdate <= AGING_UPDATE_DAYS) {
    return {
      tone: "aging",
      label: `No updates for ${daysSinceUpdate} days`,
      title: `Last transaction update: ${updateDate}.`,
      Icon: Clock3,
    };
  }

  return {
    tone: "quiet",
    label: `Quiet since ${format(latestUpdate, "MMM d")}`,
    title: `Last transaction update: ${updateDate}.`,
    Icon: CircleMinus,
  };
}

function relativeUpdateLabel(daysSinceUpdate: number): string {
  if (daysSinceUpdate === 0) return "Updated today";
  if (daysSinceUpdate === 1) return "Updated yesterday";
  return `Updated ${daysSinceUpdate} days ago`;
}
