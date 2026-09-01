import { useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import type { RecurringExpense } from "../types";
import { formatAmount } from "../types";
import {
  buildPaymentIndex,
  cellStatus,
  describeRule,
  dueDateForMonth,
  occursInMonth,
  paymentKey,
  periodKey,
  todayIso,
  type CellStatus,
  type PaymentRecord,
} from "../recurrence";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  RecurringExpenseForm,
  type RecurringExpenseFormValues,
} from "./RecurringExpenseForm";
import {
  RecurringPaymentDialog,
  type RecurringPaymentValues,
} from "./RecurringPaymentDialog";

interface RecurringProps {
  appData: AppDataHandle;
}

const MONTH_INITIALS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DOT_CLASS: Record<CellStatus, string> = {
  paid: "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-500/50",
  due: "bg-amber-400 shadow-[0_0_6px] shadow-amber-500/50",
  overdue: "bg-red-400 shadow-[0_0_6px] shadow-red-500/50",
  upcoming: "bg-slate-600",
  none: "",
};

interface PayingTarget {
  expense: RecurringExpense;
  period: string;
  dueDate: string;
}

export function Recurring({ appData }: RecurringProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<
    RecurringExpense | undefined
  >(undefined);
  const [paying, setPaying] = useState<PayingTarget | null>(null);

  const today = todayIso();
  const todayYear = now.getFullYear();
  const todayMonth0 = now.getMonth();

  const expenses = useMemo(
    () =>
      [...appData.data.recurringExpenses].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [appData.data.recurringExpenses],
  );

  const paymentIndex = useMemo(
    () => buildPaymentIndex(appData.data.transactions),
    [appData.data.transactions],
  );

  const isPaid = useCallback(
    (expense: RecurringExpense, period: string) =>
      paymentIndex.has(paymentKey(expense.id, period)),
    [paymentIndex],
  );

  // Summary for the real current month, regardless of the year being viewed.
  const monthSummary = useMemo(() => {
    let total = 0;
    let paid = 0;
    const remainingByCurrency = new Map<string, number>();
    const period = periodKey(todayYear, todayMonth0);
    for (const expense of expenses) {
      if (!occursInMonth(expense.rule, todayYear, todayMonth0)) continue;
      total += 1;
      if (isPaid(expense, period)) {
        paid += 1;
      } else {
        const estimate = expense.estimatedAmount ?? 0;
        remainingByCurrency.set(
          expense.currency,
          (remainingByCurrency.get(expense.currency) ?? 0) + estimate,
        );
      }
    }
    return { total, paid, remainingByCurrency };
  }, [expenses, isPaid, todayYear, todayMonth0]);

  const handleAddSave = useCallback(
    (values: RecurringExpenseFormValues) => {
      appData.addRecurringExpense(values);
    },
    [appData],
  );

  const handleEditSave = useCallback(
    (values: RecurringExpenseFormValues) => {
      if (editingExpense == null) return;
      appData.updateRecurringExpense(editingExpense.id, values);
      setEditingExpense(undefined);
    },
    [appData, editingExpense],
  );

  const handleDelete = useCallback(() => {
    if (editingExpense == null) return;
    appData.deleteRecurringExpense(editingExpense.id);
    setEditingExpense(undefined);
  }, [appData, editingExpense]);

  const handleCellClick = useCallback(
    (expense: RecurringExpense, month0: number) => {
      if (!occursInMonth(expense.rule, year, month0)) return;
      setPaying({
        expense,
        period: periodKey(year, month0),
        dueDate: dueDateForMonth(expense.rule, year, month0),
      });
    },
    [year],
  );

  const handleConfirmPayment = useCallback(
    (values: RecurringPaymentValues) => {
      if (paying == null) return;
      appData.markRecurringExpensePaid({
        recurringExpense: paying.expense,
        period: paying.period,
        amount: values.amount,
        accountId: values.accountId,
        date: values.date,
        description: values.description,
      });
    },
    [appData, paying],
  );

  const handleUnmark = useCallback(() => {
    if (paying == null) return;
    appData.unmarkRecurringExpensePaid(paying.expense.id, paying.period);
  }, [appData, paying]);

  const payingPayment: PaymentRecord | null =
    paying != null
      ? (paymentIndex.get(paymentKey(paying.expense.id, paying.period)) ?? null)
      : null;

  const summaryProgress =
    monthSummary.total === 0
      ? 0
      : Math.round((monthSummary.paid / monthSummary.total) * 100);
  const remainingParts = [...monthSummary.remainingByCurrency.entries()].filter(
    ([, amount]) => amount > 0,
  );

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Recurring</h1>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {expenses.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Repeat className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p>No recurring expenses yet.</p>
          <p className="text-sm">
            Add bills you pay every month or every few months to track them
            here.
          </p>
        </div>
      ) : (
        <>
          {/* This-month summary */}
          <Card className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm font-medium">
                  {MONTH_NAMES[todayMonth0]} {todayYear}
                </p>
                <p className="text-xs text-muted-foreground">
                  {monthSummary.paid} of {monthSummary.total} paid
                </p>
              </div>
              {monthSummary.total > monthSummary.paid && (
                <p className="text-sm font-semibold text-amber-400">
                  {monthSummary.total - monthSummary.paid} left
                </p>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${summaryProgress}%` }}
              />
            </div>
            {remainingParts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Remaining:{" "}
                {remainingParts.map(([currency, amount], index) => (
                  <span key={currency} className="tabular-nums">
                    {index > 0 && " · "}~{formatAmount(amount)} {currency}
                  </span>
                ))}
              </p>
            )}
          </Card>

          {/* Year selector */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-base font-semibold tabular-nums">
              {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* The grid */}
          <Card className="overflow-x-auto p-3">
            <div className="min-w-[336px]">
              {/* Header row */}
              <div
                className="grid items-center"
                style={{
                  gridTemplateColumns: "76px repeat(12, minmax(0, 1fr))",
                }}
              >
                <div />
                {MONTH_INITIALS.map((initial, month0) => {
                  const isCurrent =
                    year === todayYear && month0 === todayMonth0;
                  return (
                    <div
                      key={month0}
                      className={`text-center text-[10px] font-medium uppercase ${
                        isCurrent ? "text-amber-400" : "text-muted-foreground"
                      }`}
                      title={MONTH_NAMES[month0]}
                    >
                      {initial}
                    </div>
                  );
                })}
              </div>

              {/* Expense rows */}
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="grid items-center border-t border-border/60"
                  style={{
                    gridTemplateColumns: "76px repeat(12, minmax(0, 1fr))",
                  }}
                >
                  <button
                    type="button"
                    className="min-w-0 py-2.5 pr-1 text-left"
                    onClick={() => setEditingExpense(expense)}
                  >
                    <span className="block truncate text-xs font-semibold">
                      {expense.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground tabular-nums">
                      {expense.estimatedAmount == null
                        ? describeRule(expense.rule).split(" · ")[0]
                        : `~${formatAmount(expense.estimatedAmount)}`}
                    </span>
                  </button>

                  {MONTH_INITIALS.map((_, month0) => {
                    const period = periodKey(year, month0);
                    const status = cellStatus(
                      expense.rule,
                      year,
                      month0,
                      isPaid(expense, period),
                      today,
                    );
                    const isCurrent =
                      year === todayYear && month0 === todayMonth0;

                    if (status === "none") {
                      return (
                        <div
                          key={month0}
                          className={`flex h-9 items-center justify-center ${
                            isCurrent ? "rounded-md bg-secondary/40" : ""
                          }`}
                        >
                          <span className="h-1 w-1 rounded-full bg-muted" />
                        </div>
                      );
                    }

                    return (
                      <button
                        key={month0}
                        type="button"
                        onClick={() => handleCellClick(expense, month0)}
                        aria-label={`${expense.name}, ${MONTH_NAMES[month0]} ${year}, ${status}`}
                        className={`flex h-9 items-center justify-center rounded-md transition-colors hover:bg-secondary/60 ${
                          isCurrent
                            ? "bg-secondary/40 ring-1 ring-inset ring-amber-500/50"
                            : ""
                        }`}
                      >
                        <span
                          className={`h-[11px] w-[11px] rounded-full ${DOT_CLASS[status]}`}
                        />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Due
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Overdue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600" /> Upcoming
            </span>
          </div>
        </>
      )}

      <RecurringExpenseForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onSave={handleAddSave}
        accounts={appData.data.accounts}
        categories={appData.data.categories}
      />

      <RecurringExpenseForm
        open={editingExpense != null}
        onOpenChange={(open) => {
          if (!open) setEditingExpense(undefined);
        }}
        onSave={handleEditSave}
        onDelete={handleDelete}
        accounts={appData.data.accounts}
        categories={appData.data.categories}
        expense={editingExpense}
      />

      <RecurringPaymentDialog
        open={paying != null}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
        expense={paying?.expense ?? null}
        period={paying?.period ?? ""}
        dueDate={paying?.dueDate ?? ""}
        accounts={appData.data.accounts}
        payment={payingPayment}
        onConfirm={handleConfirmPayment}
        onUnmark={handleUnmark}
      />
    </div>
  );
}
