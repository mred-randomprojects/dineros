import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import type { Account, AccountId, Category, Transaction } from "../types";
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
import { Combobox, type ComboboxOption } from "./ui/combobox";
import { focusNextInForm } from "@/lib/utils";
import { DiscardChangesDialog } from "./DiscardChangesDialog";

const NONE_VALUE = "__none__";
const CURRENCY_FIELDS = ["fromAmount", "toAmount", "exchangeRate"] as const;

type CurrencyField = (typeof CURRENCY_FIELDS)[number];

interface TransactionFormDraft {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  category: string;
  isExpected: boolean;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  description: string;
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: Omit<Transaction, "id" | "createdAt">) => void;
  accounts: ReadonlyArray<Account>;
  categories: ReadonlyArray<Category>;
  transaction?: Transaction;
}

export function TransactionForm({
  open,
  onOpenChange,
  onSave,
  accounts,
  categories,
  transaction,
}: TransactionFormProps) {
  const [date, setDate] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>(NONE_VALUE);
  const [toAccountId, setToAccountId] = useState<string>(NONE_VALUE);
  const [category, setCategory] = useState("");
  const [isExpected, setIsExpected] = useState(false);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [currencyFieldOrder, setCurrencyFieldOrder] = useState<
    CurrencyField[]
  >([]);
  const [description, setDescription] = useState("");
  const [initialDraft, setInitialDraft] =
    useState<TransactionFormDraft | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const initialDate = transaction?.date ?? format(new Date(), "yyyy-MM-dd");
      const initialFromAccountId = transaction?.fromAccountId ?? NONE_VALUE;
      const initialToAccountId = transaction?.toAccountId ?? NONE_VALUE;
      const initialCategory = transaction?.category ?? "";
      const initialIsExpected = transaction?.isExpected === true;
      const initialFromAmount =
        transaction?.fromAmount != null ? String(transaction.fromAmount) : "";
      const initialToAmount =
        transaction?.toAmount != null ? String(transaction.toAmount) : "";
      const initialFromAccount = accounts.find(
        (account) => account.id === initialFromAccountId,
      );
      const initialToAccount = accounts.find(
        (account) => account.id === initialToAccountId,
      );
      const initialIsCrossCurrencyTransfer =
        initialFromAccount != null &&
        initialToAccount != null &&
        initialFromAccount.currency !== initialToAccount.currency;
      const initialExchangeRate =
        initialIsCrossCurrencyTransfer &&
        transaction?.fromAmount != null &&
        transaction.toAmount != null &&
        transaction.fromAmount > 0 &&
        transaction.toAmount > 0
          ? formatDerivedRate(transaction.fromAmount / transaction.toAmount)
          : "";
      const initialDescription = transaction?.description ?? "";

      setDate(initialDate);
      setFromAccountId(initialFromAccountId);
      setToAccountId(initialToAccountId);
      setCategory(initialCategory);
      setIsExpected(initialIsExpected);
      setFromAmount(initialFromAmount);
      setToAmount(initialToAmount);
      setExchangeRate(initialExchangeRate);
      setCurrencyFieldOrder(
        [
          initialFromAmount.length > 0 ? "fromAmount" : null,
          initialToAmount.length > 0 ? "toAmount" : null,
        ].filter((field): field is CurrencyField => field != null),
      );
      setDescription(initialDescription);
      setInitialDraft({
        date: initialDate,
        fromAccountId: initialFromAccountId,
        toAccountId: initialToAccountId,
        category: initialCategory,
        isExpected: initialIsExpected,
        fromAmount: initialFromAmount,
        toAmount: initialToAmount,
        exchangeRate: initialExchangeRate,
        description: initialDescription,
      });
      setDiscardDialogOpen(false);
    }
  }, [accounts, open, transaction]);

  const fromOptions = useMemo(
    (): ComboboxOption[] => [
      { value: NONE_VALUE, label: "None (income / initial balance)" },
      ...accounts.map((a) => ({
        value: a.id,
        label: `${a.name} (${a.currency})`,
      })),
    ],
    [accounts],
  );

  const toOptions = useMemo(
    (): ComboboxOption[] => [
      { value: NONE_VALUE, label: "None (expense)" },
      ...accounts.map((a) => ({
        value: a.id,
        label: `${a.name} (${a.currency})`,
      })),
    ],
    [accounts],
  );

  const categoryOptions = useMemo(
    (): ComboboxOption[] =>
      categories.map((category) => ({
        value: category.name,
        label: category.name,
      })),
    [categories],
  );

  const isEditing = transaction != null;
  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const parsedFromAmount = parseAmountInput(fromAmount);
  const parsedToAmount = parseAmountInput(toAmount);
  const parsedExchangeRate = parseAmountInput(exchangeRate);
  const isCrossCurrencyTransfer =
    selectedFromAccount != null &&
    selectedToAccount != null &&
    selectedFromAccount.currency !== selectedToAccount.currency;
  const hasValidFromAmount =
    fromAccountId === NONE_VALUE ||
    (parsedFromAmount != null && parsedFromAmount >= 0);
  const hasValidToAmount =
    toAccountId === NONE_VALUE ||
    (parsedToAmount != null && parsedToAmount >= 0);
  const hasValidExchangeRate =
    !isCrossCurrencyTransfer ||
    (parsedExchangeRate != null && parsedExchangeRate > 0);
  const hasAtLeastOneAccount =
    fromAccountId !== NONE_VALUE || toAccountId !== NONE_VALUE;
  const fromAndToDiffer = fromAccountId !== toAccountId;
  const sameCurrencyDifference =
    selectedFromAccount != null &&
    selectedToAccount != null &&
    selectedFromAccount.currency === selectedToAccount.currency &&
    parsedFromAmount != null &&
    parsedToAmount != null &&
    parsedFromAmount > parsedToAmount
      ? parsedFromAmount - parsedToAmount
      : null;
  const canSubmit =
    date.length > 0 &&
    hasValidFromAmount &&
    hasValidToAmount &&
    hasValidExchangeRate &&
    hasAtLeastOneAccount &&
    fromAndToDiffer;
  const isDirty =
    open &&
    initialDraft != null &&
    (date !== initialDraft.date ||
      fromAccountId !== initialDraft.fromAccountId ||
      toAccountId !== initialDraft.toAccountId ||
      category !== initialDraft.category ||
      isExpected !== initialDraft.isExpected ||
      fromAmount !== initialDraft.fromAmount ||
      toAmount !== initialDraft.toAmount ||
      exchangeRate !== initialDraft.exchangeRate ||
      description !== initialDraft.description);

  useEffect(() => {
    if (isCrossCurrencyTransfer) return;
    setExchangeRate("");
    setCurrencyFieldOrder((previous) =>
      previous.filter((field) => field !== "exchangeRate"),
    );
  }, [isCrossCurrencyTransfer]);

  useEffect(() => {
    if (!isCrossCurrencyTransfer) return;

    const sourceFields = currencyFieldOrder.filter((field) => {
      if (field === "fromAmount") return fromAmount.trim().length > 0;
      if (field === "toAmount") return toAmount.trim().length > 0;
      return exchangeRate.trim().length > 0;
    });

    if (sourceFields.length < 2) return;

    const latestSourceFields = sourceFields.slice(-2);
    const fieldToDerive = CURRENCY_FIELDS.find(
      (field) => !latestSourceFields.includes(field),
    );
    if (fieldToDerive == null) return;

    if (
      fieldToDerive === "exchangeRate" &&
      parsedFromAmount != null &&
      parsedToAmount != null &&
      parsedFromAmount > 0 &&
      parsedToAmount > 0
    ) {
      updateDerivedField(
        exchangeRate,
        formatDerivedRate(parsedFromAmount / parsedToAmount),
        setExchangeRate,
      );
    } else if (
      fieldToDerive === "fromAmount" &&
      parsedToAmount != null &&
      parsedExchangeRate != null &&
      parsedToAmount > 0 &&
      parsedExchangeRate > 0
    ) {
      updateDerivedField(
        fromAmount,
        formatDerivedAmount(parsedToAmount * parsedExchangeRate),
        setFromAmount,
      );
    } else if (
      fieldToDerive === "toAmount" &&
      parsedFromAmount != null &&
      parsedExchangeRate != null &&
      parsedFromAmount > 0 &&
      parsedExchangeRate > 0
    ) {
      updateDerivedField(
        toAmount,
        formatDerivedAmount(parsedFromAmount / parsedExchangeRate),
        setToAmount,
      );
    }
  }, [
    currencyFieldOrder,
    exchangeRate,
    fromAmount,
    isCrossCurrencyTransfer,
    parsedExchangeRate,
    parsedFromAmount,
    parsedToAmount,
    toAmount,
  ]);

  function updateCurrencyField(field: CurrencyField, value: string) {
    if (field === "fromAmount") {
      setFromAmount(value);
    } else if (field === "toAmount") {
      setToAmount(value);
    } else {
      setExchangeRate(value);
    }

    setCurrencyFieldOrder((previous) => {
      const withoutCurrent = previous.filter((current) => current !== field);
      if (value.trim().length === 0) return withoutCurrent;
      return [...withoutCurrent, field];
    });
  }

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
      date,
      fromAccountId:
        fromAccountId === NONE_VALUE
          ? null
          : (fromAccountId as AccountId),
      toAccountId:
        toAccountId === NONE_VALUE ? null : (toAccountId as AccountId),
      fromAmount: fromAccountId === NONE_VALUE ? null : parsedFromAmount,
      toAmount: toAccountId === NONE_VALUE ? null : parsedToAmount,
      fromCurrency: selectedFromAccount?.currency ?? null,
      toCurrency: selectedToAccount?.currency ?? null,
      category: category.trim().length > 0 ? category.trim() : undefined,
      isExpected: isExpected ? true : undefined,
      description: description.trim(),
    });
    closeWithoutPrompt();
  }

  function handleDateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.showPicker();
    } else if (e.key === "Tab") {
      e.preventDefault();
      focusNextInForm(e.currentTarget, e.shiftKey);
    }
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
              {isEditing ? "Edit Transaction" : "New Transaction"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the transaction details."
                : "Record a new money movement."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                isExpected
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-input hover:bg-accent"
              }`}
              onClick={() => setIsExpected((previous) => !previous)}
            >
              <span className="flex items-center gap-2">
                {isExpected ? (
                  <CalendarClock className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isExpected ? "Expected" : "Actual"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isExpected ? "not done yet" : "done"}
              </span>
            </button>

          <div className="space-y-2">
            <Label>From</Label>
            <Combobox
              options={fromOptions}
              value={fromAccountId}
              onValueChange={setFromAccountId}
              placeholder="Search account..."
            />
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Combobox
              options={toOptions}
              value={toAccountId}
              onValueChange={setToAccountId}
              placeholder="Search account..."
            />
          </div>

          {selectedFromAccount != null && (
            <div className="space-y-2">
              <Label htmlFor="tx-from-amount">
                From amount ({selectedFromAccount.currency})
              </Label>
              <Input
                id="tx-from-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) =>
                  updateCurrencyField("fromAmount", e.target.value)
                }
                onKeyDown={handleFieldKeyDown}
              />
            </div>
          )}

          {selectedToAccount != null && (
            <div className="space-y-2">
              <Label htmlFor="tx-to-amount">
                To amount ({selectedToAccount.currency})
              </Label>
              <Input
                id="tx-to-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={toAmount}
                onChange={(e) =>
                  updateCurrencyField("toAmount", e.target.value)
                }
                onKeyDown={handleFieldKeyDown}
              />
            </div>
          )}

          {isCrossCurrencyTransfer && (
            <div className="space-y-2">
              <Label htmlFor="tx-exchange-rate">Exchange rate</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">
                  1 {selectedToAccount.currency} =
                </span>
                <Input
                  id="tx-exchange-rate"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={exchangeRate}
                  onChange={(e) =>
                    updateCurrencyField("exchangeRate", e.target.value)
                  }
                  onKeyDown={handleFieldKeyDown}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {selectedFromAccount.currency}
                </span>
              </div>
            </div>
          )}

          {sameCurrencyDifference != null && selectedFromAccount != null && (
            <p className="text-sm text-muted-foreground">
              Difference: {formatAmount(sameCurrencyDifference)}{" "}
              {selectedFromAccount.currency}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="tx-category">Category</Label>
            <Combobox
              id="tx-category"
              options={categoryOptions}
              value={category}
              onValueChange={setCategory}
              placeholder="Search or add category..."
              allowCustomValue
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Groceries, Initial balance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleFieldKeyDown}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker()}
              onKeyDown={handleDateKeyDown}
            />
          </div>

          {!hasAtLeastOneAccount && fromAccountId === NONE_VALUE && toAccountId === NONE_VALUE && (
            <p className="text-sm text-destructive">
              At least one account (from or to) must be selected.
            </p>
          )}
          {fromAccountId === toAccountId && fromAccountId !== NONE_VALUE && (
            <p className="text-sm text-destructive">
              Source and destination cannot be the same account.
            </p>
          )}
          {!hasValidFromAmount && (
            <p className="text-sm text-destructive">
              Enter a valid amount for the From account.
            </p>
          )}
          {!hasValidToAmount && (
            <p className="text-sm text-destructive">
              Enter a valid amount for the To account.
            </p>
          )}
          {!hasValidExchangeRate && (
            <p className="text-sm text-destructive">
              Enter a valid exchange rate.
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
              {isEditing ? "Save" : "Add Transaction"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard transaction changes?"
        description="Closing now will lose the transaction changes you have not saved."
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

function updateDerivedField(
  currentValue: string,
  nextValue: string,
  setValue: (value: string) => void,
) {
  if (currentValue !== nextValue) {
    setValue(nextValue);
  }
}

function formatDerivedAmount(value: number): string {
  return formatDecimalInput(value, 2);
}

function formatDerivedRate(value: number): string {
  return formatDecimalInput(value, 6);
}

function formatDecimalInput(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(maximumFractionDigits)).toString();
}
