import type {
  RecurrenceRule,
  RecurringExpenseId,
  Transaction,
} from "./types";

export type CellStatus = "paid" | "due" | "overdue" | "upcoming" | "none";

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

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Local-time "YYYY-MM-DD" for a given date (defaults to now). */
export function todayIso(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM" key identifying a single monthly occurrence. */
export function periodKey(year: number, month0: number): string {
  return `${year}-${pad2(month0 + 1)}`;
}

export function periodLabel(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month0 = Number(monthStr) - 1;
  if (!Number.isFinite(year) || month0 < 0 || month0 > 11) return period;
  return `${MONTH_NAMES[month0]} ${year}`;
}

export function monthAbbreviation(month0: number): string {
  return MONTH_ABBREVIATIONS[month0] ?? "";
}

interface AnchorParts {
  year: number;
  month0: number;
  day: number;
}

function parseAnchor(anchor: string): AnchorParts {
  const [yearStr, monthStr, dayStr] = anchor.split("-");
  return {
    year: Number(yearStr),
    month0: Number(monthStr) - 1,
    day: Number(dayStr),
  };
}

function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function intervalInMonths(rule: RecurrenceRule): number {
  const interval = rule.interval < 1 ? 1 : Math.floor(rule.interval);
  return rule.freq === "year" ? interval * 12 : interval;
}

/**
 * The date the charge lands on in a given month, with the anchor's
 * day-of-month clamped to that month's length (e.g. the 31st becomes the
 * 28th in February). Independent of whether the rule actually fires there.
 */
export function dueDateForMonth(
  rule: RecurrenceRule,
  year: number,
  month0: number,
): string {
  const anchor = parseAnchor(rule.anchor);
  const day = Math.min(anchor.day, daysInMonth(year, month0));
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** Whether the rule produces an occurrence in the given month. */
export function occursInMonth(
  rule: RecurrenceRule,
  year: number,
  month0: number,
): boolean {
  const anchor = parseAnchor(rule.anchor);
  if (
    !Number.isFinite(anchor.year) ||
    !Number.isFinite(anchor.month0) ||
    !Number.isFinite(anchor.day)
  ) {
    return false;
  }

  const target = monthIndex(year, month0);
  const start = monthIndex(anchor.year, anchor.month0);
  if (target < start) return false;
  if ((target - start) % intervalInMonths(rule) !== 0) return false;

  if (rule.ends.kind === "on" && dueDateForMonth(rule, year, month0) > rule.ends.date) {
    return false;
  }

  return true;
}

/**
 * Status of a single (expense, month) cell in the grid, relative to today.
 * Month-granularity: a past-due unpaid charge is "overdue", the current
 * month's unpaid charge is "due", future ones are "upcoming".
 */
export function cellStatus(
  rule: RecurrenceRule,
  year: number,
  month0: number,
  isPaid: boolean,
  today: string = todayIso(),
): CellStatus {
  if (!occursInMonth(rule, year, month0)) return "none";
  if (isPaid) return "paid";

  const due = dueDateForMonth(rule, year, month0);
  if (due < today) return "overdue";
  if (due.slice(0, 7) === today.slice(0, 7)) return "due";
  return "upcoming";
}

export function paymentKey(
  recurringExpenseId: RecurringExpenseId,
  period: string,
): string {
  return `${recurringExpenseId}|${period}`;
}

export interface PaymentRecord {
  amount: number;
  currency: string | null;
  date: string;
  transactionIds: Transaction["id"][];
}

/**
 * Indexes actual (non-expected) recurring payments by expense + period so the
 * grid can look up "was this occurrence paid, and for how much" in O(1).
 */
export function buildPaymentIndex(
  transactions: ReadonlyArray<Transaction>,
): Map<string, PaymentRecord> {
  const index = new Map<string, PaymentRecord>();
  for (const tx of transactions) {
    if (
      tx.recurringExpenseId == null ||
      tx.period == null ||
      tx.isExpected === true
    ) {
      continue;
    }
    const key = paymentKey(tx.recurringExpenseId, tx.period);
    const existing = index.get(key);
    const amount = tx.fromAmount ?? tx.toAmount ?? 0;
    if (existing == null) {
      index.set(key, {
        amount,
        currency: tx.fromCurrency ?? tx.toCurrency,
        date: tx.date,
        transactionIds: [tx.id],
      });
    } else {
      existing.amount += amount;
      existing.transactionIds.push(tx.id);
      if (tx.date < existing.date) existing.date = tx.date;
    }
  }
  return index;
}

/** Human-readable cadence summary, e.g. "Monthly · 20th" or "Every 3 months". */
export function describeRule(rule: RecurrenceRule): string {
  const anchor = parseAnchor(rule.anchor);
  const day = anchor.day;
  const ordinal = ordinalDay(day);

  if (rule.freq === "year") {
    const base =
      rule.interval === 1 ? "Yearly" : `Every ${rule.interval} years`;
    return `${base} · ${MONTH_NAMES[anchor.month0]} ${ordinal}`;
  }

  if (rule.interval === 1) return `Monthly · ${ordinal}`;
  return `Every ${rule.interval} months · ${ordinal}`;
}

function ordinalDay(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}
