import type { Account } from "./types";

type CsvColumn = "date" | "from" | "to" | "category" | "amount" | "description";

const HEADER_ALIASES: Record<CsvColumn, string[]> = {
  date: ["date", "fecha"],
  from: ["from", "from account", "source", "source account", "de"],
  to: ["to", "to account", "destination", "destination account", "a"],
  category: ["category", "categoria"],
  amount: ["amount", "monto", "importe", "value", "valor"],
  description: [
    "description",
    "desc",
    "descripcion",
    "detail",
    "details",
    "concept",
    "concepto",
  ],
};

const REQUIRED_COLUMNS: CsvColumn[] = ["date", "from", "to", "amount"];

export interface CsvImportIssue {
  rowNumber: number;
  message: string;
}

export interface ParsedCsvTransaction {
  sourceRowNumber: number;
  date: string;
  fromAccountName: string | null;
  toAccountName: string | null;
  category?: string;
  amount: number;
  description: string;
}

export interface ParseTransactionsCsvResult {
  transactions: ParsedCsvTransaction[];
  skippedRowCount: number;
  errors: CsvImportIssue[];
  delimiter: string;
}

export interface TransactionImportAccountPreview {
  matchedAccountCount: number;
  newAccountCount: number;
}

export function parseTransactionsCsv(csvText: string): ParseTransactionsCsvResult {
  const delimiter = detectDelimiter(csvText);
  const rows = parseDelimitedRows(csvText, delimiter).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
  const errors: CsvImportIssue[] = [];
  const transactions: ParsedCsvTransaction[] = [];
  let skippedRowCount = 0;

  if (rows.length === 0) {
    return {
      transactions,
      skippedRowCount,
      delimiter,
      errors: [{ rowNumber: 1, message: "CSV file is empty." }],
    };
  }

  const columnMap = resolveHeaderMap(rows[0]);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => columnMap[column] == null);
  if (missingColumns.length > 0) {
    return {
      transactions,
      skippedRowCount,
      delimiter,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missingColumns
            .map((column) => columnLabel(column))
            .join(", ")}.`,
        },
      ],
    };
  }

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    const rawDate = cellValue(row, columnMap.date);
    const rawFrom = cellValue(row, columnMap.from);
    const rawTo = cellValue(row, columnMap.to);
    const rawCategory = cellValue(row, columnMap.category);
    const rawAmount = cellValue(row, columnMap.amount);
    const rawDescription = cellValue(row, columnMap.description);

    if (
      [rawDate, rawFrom, rawTo, rawCategory, rawAmount, rawDescription].every(
        isBlankOrDash,
      )
    ) {
      skippedRowCount += 1;
      continue;
    }

    const date = normalizeCsvDate(rawDate);
    if (date == null) {
      errors.push({
        rowNumber,
        message: `Invalid date "${rawDate.trim()}".`,
      });
      continue;
    }

    const amount = parseCurrencyAmount(rawAmount);
    if (amount == null) {
      errors.push({
        rowNumber,
        message: `Invalid amount "${rawAmount.trim()}".`,
      });
      continue;
    }

    const fromAccountName = normalizeImportedAccountName(rawFrom);
    const toAccountName = normalizeImportedAccountName(rawTo);
    if (fromAccountName == null && toAccountName == null) {
      errors.push({
        rowNumber,
        message: "Transaction needs at least one account in From or To.",
      });
      continue;
    }

    if (
      fromAccountName != null &&
      toAccountName != null &&
      normalizeAccountLookupKey(fromAccountName) === normalizeAccountLookupKey(toAccountName)
    ) {
      errors.push({
        rowNumber,
        message: "From and To accounts cannot be the same.",
      });
      continue;
    }

    const category = rawCategory.trim();
    transactions.push({
      sourceRowNumber: rowNumber,
      date,
      fromAccountName,
      toAccountName,
      category: category.length > 0 && category !== "-" ? category : undefined,
      amount,
      description: rawDescription.trim(),
    });
  }

  return { transactions, skippedRowCount, errors, delimiter };
}

export function previewImportAccounts(
  rows: ReadonlyArray<ParsedCsvTransaction>,
  existingAccounts: ReadonlyArray<Account>,
  defaultCurrency: string,
): TransactionImportAccountPreview {
  const existingExactAccounts = new Set(
    existingAccounts.map((account) => normalizeAccountLookupKey(account.name)),
  );
  const existingBaseCurrencyAccounts = new Set(
    existingAccounts.map(
      (account) =>
        `${normalizeAccountLookupKey(accountBaseName(account.name))}|${account.currency.toUpperCase()}`,
    ),
  );
  const matched = new Set<string>();
  const created = new Set<string>();
  const createdExactAccounts = new Set<string>();
  const createdBaseCurrencyAccounts = new Set<string>();

  for (const row of rows) {
    for (const accountName of [row.fromAccountName, row.toAccountName]) {
      if (accountName == null) continue;
      const lookupKey = normalizeAccountLookupKey(accountName);
      const currency = inferCurrencyFromAccountName(accountName, defaultCurrency);
      const baseCurrencyKey = `${normalizeAccountLookupKey(accountBaseName(accountName))}|${currency}`;

      if (
        existingExactAccounts.has(lookupKey) ||
        existingBaseCurrencyAccounts.has(baseCurrencyKey)
      ) {
        matched.add(lookupKey);
      } else if (
        createdExactAccounts.has(lookupKey) ||
        createdBaseCurrencyAccounts.has(baseCurrencyKey)
      ) {
        continue;
      } else {
        created.add(lookupKey);
        createdExactAccounts.add(lookupKey);
        createdBaseCurrencyAccounts.add(baseCurrencyKey);
      }
    }
  }

  return {
    matchedAccountCount: matched.size,
    newAccountCount: created.size,
  };
}

export function inferCurrencyFromAccountName(
  accountName: string,
  defaultCurrency: string,
): string {
  const suffix = accountName.match(/\(([A-Za-z0-9]{2,10})\)\s*$/)?.[1];
  const currency = suffix ?? defaultCurrency;
  return currency.trim().toUpperCase();
}

export function accountBaseName(accountName: string): string {
  return accountName.replace(/\s*\(([A-Za-z0-9]{2,10})\)\s*$/, "").trim();
}

export function normalizeAccountLookupKey(accountName: string): string {
  return accountName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseDelimitedRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (input[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function detectDelimiter(input: string): string {
  const candidates = [",", ";", "\t"];
  const sampleLines = input
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 5);

  let bestDelimiter = ",";
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = sampleLines.reduce(
      (total, line) => total + countDelimiterOutsideQuotes(line, candidate),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = candidate;
    }
  }

  return bestDelimiter;
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function resolveHeaderMap(headerRow: string[]): Partial<Record<CsvColumn, number>> {
  const headerMap: Partial<Record<CsvColumn, number>> = {};
  for (let index = 0; index < headerRow.length; index += 1) {
    const normalized = normalizeHeader(headerRow[index]);
    for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [
      CsvColumn,
      string[],
    ][]) {
      if (headerMap[column] == null && aliases.includes(normalized)) {
        headerMap[column] = index;
        break;
      }
    }
  }
  return headerMap;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellValue(row: string[], index: number | undefined): string {
  return index == null ? "" : row[index] ?? "";
}

function isBlankOrDash(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "-";
}

function normalizeImportedAccountName(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed === "-") return null;
  return trimmed;
}

function normalizeCsvDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch != null) {
    return datePartsToIso(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (slashMatch != null) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return datePartsToIso(year, month, day);
  }

  return null;
}

function datePartsToIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

function parseCurrencyAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;

  const isNegative = trimmed.includes("-") || (trimmed.includes("(") && trimmed.includes(")"));
  const numericText = trimmed
    .replace(/[\s\u00a0]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^\d.,]/g, "");

  if (numericText.length === 0) return null;

  const normalized = normalizeNumberText(numericText);
  if (normalized == null) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  const amount = isNegative ? -parsed : parsed;
  return Object.is(amount, -0) ? 0 : amount;
}

function normalizeNumberText(value: string): string | null {
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (!hasComma && !hasDot) return value;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let decimalSeparator: "," | "." | null = null;

  if (hasComma && hasDot) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else {
    const separator = hasComma ? "," : ".";
    const parts = value.split(separator);
    const lastPart = parts[parts.length - 1] ?? "";
    const separatorCount = parts.length - 1;

    if (separatorCount > 1) {
      decimalSeparator =
        lastPart.length === 2 || lastPart.length === 4 ? separator : null;
    } else {
      decimalSeparator =
        lastPart.length === 1 || lastPart.length === 2 || lastPart.length === 4
          ? separator
          : null;
    }
  }

  if (decimalSeparator == null) {
    return value.replace(/[.,]/g, "");
  }

  const thousandsSeparator = decimalSeparator === "." ? "," : ".";
  const withoutThousands = value.split(thousandsSeparator).join("");
  const decimalIndex = withoutThousands.lastIndexOf(decimalSeparator);
  if (decimalIndex === -1) return withoutThousands;

  const integerPart = withoutThousands.slice(0, decimalIndex).replace(/[.,]/g, "");
  const decimalPart = withoutThousands.slice(decimalIndex + 1).replace(/[.,]/g, "");
  return `${integerPart || "0"}.${decimalPart || "0"}`;
}

function columnLabel(column: CsvColumn): string {
  return column[0].toUpperCase() + column.slice(1);
}
