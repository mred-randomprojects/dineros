export interface ParsedArgs {
  command: string;
  flags: ReadonlyMap<string, string | true>;
}

export class UsageError extends Error {}

export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const flags = new Map<string, string | true>();
  const rest = [...argv];
  const command =
    rest.length > 0 && !rest[0].startsWith("--") ? rest.shift() ?? "help" : "help";

  while (rest.length > 0) {
    const token = rest.shift();
    if (token == null) break;
    if (!token.startsWith("--")) {
      throw new UsageError(`Unexpected argument "${token}".`);
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = rest[0];
    if (next == null || next.startsWith("--")) {
      flags.set(body, true);
    } else {
      flags.set(body, next);
      rest.shift();
    }
  }

  return { command, flags };
}

export function stringFlag(
  args: ParsedArgs,
  name: string,
): string | undefined {
  const value = args.flags.get(name);
  if (value == null) return undefined;
  if (value === true) {
    throw new UsageError(`--${name} needs a value.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requiredStringFlag(args: ParsedArgs, name: string): string {
  const value = stringFlag(args, name);
  if (value == null) throw new UsageError(`--${name} is required.`);
  return value;
}

export function boolFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value == null) return false;
  if (value === true) return true;
  return value !== "false" && value !== "0";
}

/** Accepts "1234.56" and "1234,56", matching the web form's amount input. */
export function parseAmount(raw: string, label: string): number {
  const parsed = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new UsageError(`${label} must be a positive number, got "${raw}".`);
  }
  return Number(parsed.toFixed(2));
}

export function numberFlag(
  args: ParsedArgs,
  name: string,
): number | undefined {
  const raw = stringFlag(args, name);
  return raw == null ? undefined : parseAmount(raw, `--${name}`);
}

export function integerFlag(
  args: ParsedArgs,
  name: string,
): number | undefined {
  const raw = stringFlag(args, name);
  if (raw == null) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new UsageError(`--${name} must be a whole number, got "${raw}".`);
  }
  return parsed;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

export function dateFlag(args: ParsedArgs, name: string): string | undefined {
  const raw = stringFlag(args, name);
  if (raw == null) return undefined;
  if (!ISO_DATE_RE.test(raw)) {
    throw new UsageError(`--${name} must be YYYY-MM-DD, got "${raw}".`);
  }
  return raw;
}

export function periodFlag(args: ParsedArgs, name: string): string | undefined {
  const raw = stringFlag(args, name);
  if (raw == null) return undefined;
  if (!PERIOD_RE.test(raw)) {
    throw new UsageError(`--${name} must be YYYY-MM, got "${raw}".`);
  }
  return raw;
}
