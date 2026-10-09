import { describe, expect, it } from "vitest";
import {
  buildPaymentIndex,
  cellStatus,
  describeRule,
  dueDateForMonth,
  occursInMonth,
  paymentKey,
  periodKey,
  periodLabel,
  todayIso,
} from "./recurrence";
import type { RecurrenceRule, RecurringExpenseId } from "./types";
import { transaction } from "./testFixtures";

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    freq: "month",
    interval: 1,
    anchor: "2026-01-15",
    ends: { kind: "never" },
    ...overrides,
  };
}

/** Months (0-based) of `year` in which the rule fires. */
function firingMonths(r: RecurrenceRule, year: number): number[] {
  return Array.from({ length: 12 }, (_, month0) => month0).filter((month0) =>
    occursInMonth(r, year, month0),
  );
}

describe("occursInMonth", () => {
  it("monthly fires every month from the anchor month on", () => {
    const monthly = rule({ anchor: "2026-03-15" });
    expect(firingMonths(monthly, 2025)).toEqual([]);
    expect(firingMonths(monthly, 2026)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(firingMonths(monthly, 2027)).toHaveLength(12);
  });

  it("every N months counts from the anchor month, across years", () => {
    const quarterly = rule({ interval: 3, anchor: "2026-02-01" });
    expect(firingMonths(quarterly, 2026)).toEqual([1, 4, 7, 10]);
    expect(firingMonths(quarterly, 2027)).toEqual([1, 4, 7, 10]);

    const everyFive = rule({ interval: 5, anchor: "2026-11-01" });
    expect(firingMonths(everyFive, 2026)).toEqual([10]);
    expect(firingMonths(everyFive, 2027)).toEqual([3, 8]);
  });

  it("yearly fires in the anchor month every N years", () => {
    const yearly = rule({ freq: "year", anchor: "2026-06-30" });
    expect(firingMonths(yearly, 2026)).toEqual([5]);
    expect(firingMonths(yearly, 2027)).toEqual([5]);

    const biennial = rule({ freq: "year", interval: 2, anchor: "2026-06-30" });
    expect(firingMonths(biennial, 2027)).toEqual([]);
    expect(firingMonths(biennial, 2028)).toEqual([5]);
  });

  it("stops after the ends-on date, compared with the clamped due date", () => {
    const endsMid = rule({
      anchor: "2026-01-15",
      ends: { kind: "on", date: "2026-04-14" },
    });
    expect(firingMonths(endsMid, 2026)).toEqual([0, 1, 2]);

    const endsOnDueDate = rule({
      anchor: "2026-01-15",
      ends: { kind: "on", date: "2026-04-15" },
    });
    expect(firingMonths(endsOnDueDate, 2026)).toEqual([0, 1, 2, 3]);

    // A 31st anchor is due Feb 28 in 2026, so an end date of Feb 28 keeps February.
    const endOfMonth = rule({
      anchor: "2026-01-31",
      ends: { kind: "on", date: "2026-02-28" },
    });
    expect(firingMonths(endOfMonth, 2026)).toEqual([0, 1]);
  });

  it("an invalid interval behaves as every month", () => {
    expect(firingMonths(rule({ interval: 0, anchor: "2026-01-01" }), 2026)).toHaveLength(12);
    expect(firingMonths(rule({ interval: 2.9, anchor: "2026-01-01" }), 2026)).toEqual([
      0, 2, 4, 6, 8, 10,
    ]);
  });

  it("never fires for an unparseable anchor", () => {
    expect(firingMonths(rule({ anchor: "garbage" }), 2026)).toEqual([]);
  });
});

describe("dueDateForMonth", () => {
  it("clamps a 31st anchor to each month's last day", () => {
    const r = rule({ anchor: "2026-01-31" });
    expect(dueDateForMonth(r, 2026, 0)).toBe("2026-01-31");
    expect(dueDateForMonth(r, 2026, 1)).toBe("2026-02-28");
    expect(dueDateForMonth(r, 2028, 1)).toBe("2028-02-29");
    expect(dueDateForMonth(r, 2026, 3)).toBe("2026-04-30");
    expect(dueDateForMonth(r, 2026, 11)).toBe("2026-12-31");
  });

  it("keeps a day every month has", () => {
    expect(dueDateForMonth(rule({ anchor: "2026-01-05" }), 2026, 8)).toBe(
      "2026-09-05",
    );
  });
});

describe("cellStatus", () => {
  const monthly = rule({ anchor: "2026-01-15" });
  const today = "2026-05-20";

  it("reports none, paid, overdue, due and upcoming relative to today", () => {
    expect(cellStatus(monthly, 2025, 11, false, today)).toBe("none");
    expect(cellStatus(monthly, 2026, 3, true, today)).toBe("paid");
    expect(cellStatus(monthly, 2026, 3, false, today)).toBe("overdue");
    // May 15 has passed by May 20: overdue, not "due".
    expect(cellStatus(monthly, 2026, 4, false, today)).toBe("overdue");
    expect(cellStatus(monthly, 2026, 4, false, "2026-05-10")).toBe("due");
    expect(cellStatus(monthly, 2026, 5, false, today)).toBe("upcoming");
  });
});

describe("buildPaymentIndex", () => {
  const rec = "rec-1" as RecurringExpenseId;

  it("sums actual payments per expense and period, keeping the earliest date", () => {
    const index = buildPaymentIndex([
      transaction("tx-1", {
        recurringExpenseId: rec,
        period: "2026-03",
        fromAmount: 30,
        date: "2026-03-20",
      }),
      transaction("tx-2", {
        recurringExpenseId: rec,
        period: "2026-03",
        fromAmount: 20,
        date: "2026-03-05",
      }),
      transaction("tx-expected", {
        recurringExpenseId: rec,
        period: "2026-04",
        isExpected: true,
      }),
      transaction("tx-unlinked", { period: "2026-03" }),
      transaction("tx-no-period", { recurringExpenseId: rec }),
    ]);

    expect([...index.keys()]).toEqual([paymentKey(rec, "2026-03")]);
    expect(index.get(paymentKey(rec, "2026-03"))).toEqual({
      amount: 50,
      currency: "ARS",
      date: "2026-03-05",
      transactionIds: ["tx-1", "tx-2"],
    });
  });
});

describe("period helpers", () => {
  it("formats period keys and labels", () => {
    expect(periodKey(2026, 0)).toBe("2026-01");
    expect(periodKey(2026, 11)).toBe("2026-12");
    expect(periodLabel("2026-09")).toBe("September 2026");
    expect(periodLabel("2026-13")).toBe("2026-13");
  });

  it("todayIso uses the local calendar day", () => {
    expect(todayIso(new Date(2026, 9, 9, 22, 30))).toBe("2026-10-09");
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });

  it("describes cadences", () => {
    expect(describeRule(rule({ anchor: "2026-01-01" }))).toBe("Monthly · 1st");
    expect(describeRule(rule({ interval: 3, anchor: "2026-01-22" }))).toBe(
      "Every 3 months · 22nd",
    );
    expect(describeRule(rule({ freq: "year", anchor: "2026-06-13" }))).toBe(
      "Yearly · June 13th",
    );
    expect(
      describeRule(rule({ freq: "year", interval: 2, anchor: "2026-03-23" })),
    ).toBe("Every 2 years · March 23rd");
  });
});
