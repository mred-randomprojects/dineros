import { describe, expect, it } from "vitest";
import {
  accountBaseName,
  inferCurrencyFromAccountName,
  parseTransactionsCsv,
  previewImportAccounts,
} from "./importTransactionsCsv";
import { account } from "./testFixtures";

describe("parseTransactionsCsv: headers and delimiters", () => {
  it("reads English headers with commas", () => {
    const result = parseTransactionsCsv(
      [
        "Date,From,To,Category,Amount,Description",
        "2026-03-05,Cash,,Groceries,1500,Corner shop",
        "2026-03-06,,Bank,Salary,200000,Pay",
      ].join("\n"),
    );

    expect(result.delimiter).toBe(",");
    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([
      {
        sourceRowNumber: 2,
        date: "2026-03-05",
        fromAccountName: "Cash",
        toAccountName: null,
        category: "Groceries",
        fromAmount: 1500,
        toAmount: null,
        description: "Corner shop",
      },
      {
        sourceRowNumber: 3,
        date: "2026-03-06",
        fromAccountName: null,
        toAccountName: "Bank",
        category: "Salary",
        fromAmount: null,
        toAmount: 200000,
        description: "Pay",
      },
    ]);
  });

  it("reads Spanish headers (accents, BOM) with semicolons and decimal commas", () => {
    const result = parseTransactionsCsv(
      [
        "﻿Fecha;De;A;Categoría;Importe;Descripción",
        "2026-03-05;Efectivo;;Super;1.234,50;Compra",
        "2026-03-06;Efectivo;;Super;12,5;Pan",
        "2026-03-07;Efectivo;;;1.234.567,89;Grande",
      ].join("\r\n"),
    );

    expect(result.delimiter).toBe(";");
    expect(result.errors).toEqual([]);
    expect(result.transactions.map((tx) => tx.fromAmount)).toEqual([
      1234.5, 12.5, 1234567.89,
    ]);
    expect(result.transactions[0]).toMatchObject({
      fromAccountName: "Efectivo",
      category: "Super",
      description: "Compra",
    });
    expect(result.transactions[2]?.category).toBeUndefined();
  });

  it("accepts the other aliases (monto, concepto, source/destination)", () => {
    const result = parseTransactionsCsv(
      [
        "fecha\tsource account\tdestination\tmonto\tconcepto",
        "2026-03-05\tCash\tBank\t100\tDeposit",
      ].join("\n"),
    );

    expect(result.delimiter).toBe("\t");
    expect(result.transactions).toEqual([
      expect.objectContaining({
        fromAccountName: "Cash",
        toAccountName: "Bank",
        fromAmount: 100,
        toAmount: 100,
        description: "Deposit",
      }),
    ]);
  });

  it("uses separate from/to amounts for a cross-currency transfer", () => {
    const result = parseTransactionsCsv(
      [
        "Date,From,To,From Amount,To Amount",
        '2026-03-05,Cash (ARS),Wallet (USD),"145.000",100',
      ].join("\n"),
    );

    expect(result.transactions[0]).toMatchObject({
      fromAmount: 145000,
      toAmount: 100,
    });
  });

  it("reports missing required columns", () => {
    const result = parseTransactionsCsv("Date,From,Description\n2026-03-05,Cash,x");
    expect(result.transactions).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNumber: 1,
        message:
          "Missing required column(s): To, Amount (or From Amount / To Amount).",
      },
    ]);
  });
});

describe("parseTransactionsCsv: rows", () => {
  const header = "Date,From,To,Amount,Description";

  it("a negative shared amount swaps from and to", () => {
    const result = parseTransactionsCsv(`${header}\n2026-03-05,Cash,,-250,Refund`);
    expect(result.transactions[0]).toMatchObject({
      fromAccountName: null,
      toAccountName: "Cash",
      fromAmount: null,
      toAmount: 250,
    });
  });

  it("parenthesised amounts are negative", () => {
    const result = parseTransactionsCsv(`${header}\n2026-03-05,Cash,,(250),Refund`);
    expect(result.transactions[0]).toMatchObject({
      toAccountName: "Cash",
      toAmount: 250,
    });
  });

  it("skips dash-only rows and reports bad ones by row number", () => {
    const result = parseTransactionsCsv(
      [
        header,
        "-,-,-,-,-",
        "31/02/2026,Cash,,10,bad date",
        "2026-03-05,Cash,,abc,bad amount",
        "2026-03-05,,,10,no account",
        "2026-03-05,Cash,cash,10,same account",
        "2026-03-05,Cash,,,no amount",
        "2026-03-05,Cash,,10,ok",
      ].join("\n"),
    );

    expect(result.skippedRowCount).toBe(1);
    expect(result.errors).toEqual([
      { rowNumber: 3, message: 'Invalid date "31/02/2026".' },
      { rowNumber: 4, message: 'Invalid amount "abc".' },
      {
        rowNumber: 5,
        message: "Transaction needs at least one account in From or To.",
      },
      { rowNumber: 6, message: "From and To accounts cannot be the same." },
      {
        rowNumber: 7,
        message: "Transaction needs an Amount, From Amount, or To Amount.",
      },
    ]);
    expect(result.transactions.map((tx) => tx.sourceRowNumber)).toEqual([8]);
  });

  it("drops empty lines before numbering, so row numbers count non-empty lines only", () => {
    // Current behaviour: an all-empty line (",,,," or "") is removed before
    // rows are numbered and is not counted as skipped, so every row number
    // after it is one lower than the line number in the file.
    const result = parseTransactionsCsv(
      [header, ",,,,", "", "bad,Cash,,10,x"].join("\n"),
    );
    expect(result.skippedRowCount).toBe(0);
    expect(result.errors).toEqual([
      { rowNumber: 2, message: 'Invalid date "bad".' },
    ]);
  });

  it("handles quoted cells with delimiters, quotes and newlines", () => {
    const result = parseTransactionsCsv(
      `${header}\n2026-03-05,Cash,,"1,500","Dinner, ""fancy""\nand drinks"`,
    );
    expect(result.transactions[0]).toMatchObject({
      fromAmount: 1500,
      description: 'Dinner, "fancy"\nand drinks',
    });
  });

  it("normalizes ISO-like dates", () => {
    const result = parseTransactionsCsv(
      `${header}\n2026-3-5,Cash,,1,a\n2026/03/06,Cash,,1,b`,
    );
    expect(result.transactions.map((tx) => tx.date)).toEqual([
      "2026-03-05",
      "2026-03-06",
    ]);
  });

  it("decides the order of a slash date row by row (current behaviour, see dineros-c3)", () => {
    // Pinned on purpose: a DD/MM file whose day is 12 or less is read as
    // MM/DD, so the two rows below land in different months. dineros-c3
    // (decide the order once per file) will change this expectation.
    const result = parseTransactionsCsv(
      `${header}\n05/03/2026,Cash,,1,a\n13/03/2026,Cash,,1,b\n03-13-2026,Cash,,1,c`,
    );
    expect(result.errors).toEqual([]);
    expect(result.transactions.map((tx) => tx.date)).toEqual([
      "2026-05-03",
      "2026-03-13",
      "2026-03-13",
    ]);
  });
});

describe("account name helpers", () => {
  it("reads a currency suffix, or falls back to the default", () => {
    expect(inferCurrencyFromAccountName("Wallet (usd)", "ARS")).toBe("USD");
    expect(inferCurrencyFromAccountName("Wallet", " ars ")).toBe("ARS");
    expect(accountBaseName("Wallet (USD) ")).toBe("Wallet");
  });

  it("previews which accounts an import matches and which it creates", () => {
    const parsed = parseTransactionsCsv(
      [
        "Date,From,To,Amount",
        "2026-03-05,cash,,1",
        "2026-03-05,Wallet (USD),,1",
        "2026-03-05,New bank,,1",
        "2026-03-05,new bank,,1",
      ].join("\n"),
    );

    expect(
      previewImportAccounts(
        parsed.transactions,
        [
          account("acc-1", { name: "Cash", currency: "ARS" }),
          account("acc-2", { name: "Wallet", currency: "USD" }),
        ],
        "ARS",
      ),
    ).toEqual({ matchedAccountCount: 2, newAccountCount: 1 });
  });
});
