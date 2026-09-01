import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type {
  Account,
  AccountId,
  Category,
  RecurrenceRule,
  RecurringExpense,
} from "../types";
import { cleanCategoryName } from "../types";
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
import { Combobox, type ComboboxOption } from "./ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { DiscardChangesDialog } from "./DiscardChangesDialog";

export interface RecurringExpenseFormValues {
  name: string;
  description?: string;
  category?: string;
  accountId: AccountId | null;
  estimatedAmount: number | null;
  currency: string;
  rule: RecurrenceRule;
}

type RepeatMode = "monthly" | "everyN" | "yearly";

interface RecurringExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: RecurringExpenseFormValues) => void;
  onDelete?: () => void;
  accounts: ReadonlyArray<Account>;
  categories: ReadonlyArray<Category>;
  expense?: RecurringExpense;
}

const NO_ACCOUNT = "__none__";

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

interface FormState {
  name: string;
  description: string;
  category: string;
  accountId: string;
  currency: string;
  estimatedAmount: string;
  repeatMode: RepeatMode;
  intervalMonths: string;
  dueDay: string;
  startsMonth: string;
  discontinueOn: string;
}

function stateFromExpense(expense: RecurringExpense | undefined): FormState {
  if (expense == null) {
    const now = new Date();
    return {
      name: "",
      description: "",
      category: "",
      accountId: "",
      currency: "",
      estimatedAmount: "",
      repeatMode: "monthly",
      intervalMonths: "3",
      dueDay: String(now.getDate()),
      startsMonth: currentMonthKey(),
      discontinueOn: "",
    };
  }

  const { rule } = expense;
  const [anchorYear, anchorMonth, anchorDay] = rule.anchor.split("-");
  const repeatMode: RepeatMode =
    rule.freq === "year" ? "yearly" : rule.interval > 1 ? "everyN" : "monthly";

  return {
    name: expense.name,
    description: expense.description ?? "",
    category: expense.category ?? "",
    accountId: expense.accountId ?? "",
    currency: expense.currency,
    estimatedAmount:
      expense.estimatedAmount == null ? "" : String(expense.estimatedAmount),
    repeatMode,
    intervalMonths: rule.freq === "year" ? "3" : String(rule.interval),
    dueDay: String(Number(anchorDay)),
    startsMonth: `${anchorYear}-${anchorMonth}`,
    discontinueOn: rule.ends.kind === "on" ? rule.ends.date : "",
  };
}

export function RecurringExpenseForm({
  open,
  onOpenChange,
  onSave,
  onDelete,
  accounts,
  categories,
  expense,
}: RecurringExpenseFormProps) {
  const [state, setState] = useState<FormState>(() => stateFromExpense(expense));
  const [initialState, setInitialState] = useState<FormState>(state);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const next = stateFromExpense(expense);
      setState(next);
      setInitialState(next);
      setDiscardDialogOpen(false);
    }
  }, [open, expense]);

  const categoryOptions = useMemo<ComboboxOption[]>(
    () =>
      [...categories]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({ value: category.name, label: category.name })),
    [categories],
  );

  const isEditing = expense != null;

  const dueDayNumber = Number(state.dueDay);
  const intervalNumber = Number(state.intervalMonths);
  const canSubmit =
    state.name.trim().length > 0 &&
    state.currency.trim().length > 0 &&
    Number.isInteger(dueDayNumber) &&
    dueDayNumber >= 1 &&
    dueDayNumber <= 31 &&
    /^\d{4}-\d{2}$/.test(state.startsMonth) &&
    (state.repeatMode !== "everyN" ||
      (Number.isFinite(intervalNumber) && intervalNumber >= 1));

  const isDirty =
    open &&
    (Object.keys(state) as (keyof FormState)[]).some(
      (key) => state[key] !== initialState[key],
    );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleAccountChange(value: string) {
    if (value === NO_ACCOUNT) {
      update("accountId", "");
      return;
    }
    setState((prev) => {
      const account = accounts.find((a) => a.id === value);
      return {
        ...prev,
        accountId: value,
        currency:
          prev.currency.trim().length === 0 && account != null
            ? account.currency
            : prev.currency,
      };
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

    const day = Math.min(Math.max(Math.floor(dueDayNumber), 1), 31);
    const anchor = `${state.startsMonth}-${pad2(day)}`;
    const rule: RecurrenceRule = {
      freq: state.repeatMode === "yearly" ? "year" : "month",
      interval:
        state.repeatMode === "everyN"
          ? Math.max(1, Math.floor(intervalNumber))
          : 1,
      anchor,
      ends:
        state.discontinueOn.trim().length > 0
          ? { kind: "on", date: state.discontinueOn }
          : { kind: "never" },
    };

    const estimatedAmount =
      state.estimatedAmount.trim().length === 0
        ? null
        : Math.abs(Number(state.estimatedAmount));

    onSave({
      name: state.name.trim(),
      description:
        state.description.trim().length > 0
          ? state.description.trim()
          : undefined,
      category: cleanCategoryName(state.category) || undefined,
      accountId:
        state.accountId.length > 0 ? (state.accountId as AccountId) : null,
      estimatedAmount:
        estimatedAmount != null && Number.isFinite(estimatedAmount)
          ? estimatedAmount
          : null,
      currency: state.currency.trim().toUpperCase(),
      rule,
    });
    closeWithoutPrompt();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit recurring expense" : "New recurring expense"}
            </DialogTitle>
            <DialogDescription>
              A repeating bill. The estimate is a guide — you confirm the real
              amount each time you mark it paid.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="re-name">Name</Label>
              <Input
                id="re-name"
                placeholder="e.g. Rent, Netflix, Electricity"
                value={state.name}
                autoComplete="off"
                autoCapitalize="words"
                onChange={(e) => update("name", e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="re-description">Description</Label>
              <Textarea
                id="re-description"
                placeholder="Optional note"
                value={state.description}
                maxLength={220}
                rows={2}
                autoComplete="off"
                onChange={(e) => update("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="re-estimate">Estimate (optional)</Label>
                <Input
                  id="re-estimate"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="~ amount"
                  value={state.estimatedAmount}
                  onChange={(e) => update("estimatedAmount", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="re-currency">Currency</Label>
                <Input
                  id="re-currency"
                  placeholder="e.g. ARS, USD"
                  value={state.currency}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => update("currency", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="re-category">Category</Label>
              <Combobox
                id="re-category"
                options={categoryOptions}
                value={state.category}
                onValueChange={(value) => update("category", value)}
                placeholder="Optional category"
                allowCustomValue
              />
            </div>

            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select
                value={state.accountId.length > 0 ? state.accountId : NO_ACCOUNT}
                onValueChange={handleAccountChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>No default account</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-lg border border-input bg-background/40 p-3">
              <div className="space-y-2">
                <Label>Repeats</Label>
                <Select
                  value={state.repeatMode}
                  onValueChange={(value) =>
                    update("repeatMode", value as RepeatMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="everyN">Every N months</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {state.repeatMode === "everyN" && (
                <div className="space-y-2">
                  <Label htmlFor="re-interval">Every how many months?</Label>
                  <Input
                    id="re-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={state.intervalMonths}
                    onChange={(e) => update("intervalMonths", e.target.value)}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="re-day">Day of month</Label>
                  <Input
                    id="re-day"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    step="1"
                    value={state.dueDay}
                    onChange={(e) => update("dueDay", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="re-starts">Starts</Label>
                  <Input
                    id="re-starts"
                    type="month"
                    value={state.startsMonth}
                    onChange={(e) => update("startsMonth", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-ends">Discontinue on (optional)</Label>
                <Input
                  id="re-ends"
                  type="date"
                  value={state.discontinueOn}
                  onChange={(e) => update("discontinueOn", e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              {isEditing && onDelete != null && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {isEditing ? "Save" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={discardDialogOpen}
        title="Discard changes?"
        description="Closing now will lose the changes you have not saved."
        onStay={() => setDiscardDialogOpen(false)}
        onDiscard={closeWithoutPrompt}
      />
    </>
  );
}
