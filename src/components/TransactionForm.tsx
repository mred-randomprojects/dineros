import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import type { Account, AccountId, Transaction } from "../types";
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

const NONE_VALUE = "__none__";
const CURRENCY_FIELDS = ["fromAmount", "toAmount", "exchangeRate"] as const;

type CurrencyField = (typeof CURRENCY_FIELDS)[number];

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: Omit<Transaction, "id" | "createdAt">) => void;
  accounts: ReadonlyArray<Account>;
  transaction?: Transaction;
}

export function TransactionForm({
  open,
  onOpenChange,
  onSave,
  accounts,
  transaction,
}: TransactionFormProps) {
  const [date, setDate] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>(NONE_VALUE);
  const [toAccountId, setToAccountId] = useState<string>(NONE_VALUE);
  const [category, setCategory] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [currencyFieldOrder, setCurrencyFieldOrder] = useState<
    CurrencyField[]
  >([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      const initialFromAmount =
        transaction?.fromAmount != null ? String(transaction.fromAmount) : "";
      const initialToAmount =
        transaction?.toAmount != null ? String(transaction.toAmount) : "";
      setDate(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
      setFromAccountId(transaction?.fromAccountId ?? NONE_VALUE);
      setToAccountId(transaction?.toAccountId ?? NONE_VALUE);
      setCategory(transaction?.category ?? "");
      setFromAmount(initialFromAmount);
      setToAmount(initialToAmount);
      setExchangeRate(
        transaction?.fromAmount != null &&
          transaction.toAmount != null &&
          transaction.fromAmount > 0 &&
          transaction.toAmount > 0
          ? formatDerivedRate(transaction.fromAmount / transaction.toAmount)
          : "",
      );
      setCurrencyFieldOrder(
        [
          initialFromAmount.length > 0 ? "fromAmount" : null,
          initialToAmount.length > 0 ? "toAmount" : null,
        ].filter((field): field is CurrencyField => field != null),
      );
      setDescription(transaction?.description ?? "");
    }
  }, [open, transaction]);

  const fromOptions = useMemo((): ComboboxOption[] => [
    { value: NONE_VALUE, label: "None (income / initial balance)" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ], [accounts]);

  const toOptions = useMemo((): ComboboxOption[] => [
    { value: NONE_VALUE, label: "None (expense)" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ], [accounts]);

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
      description: description.trim(),
    });
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Input
              id="tx-category"
              placeholder="e.g. Food, Rent"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Groceries, Initial balance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              onClick={() => onOpenChange(false)}
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
