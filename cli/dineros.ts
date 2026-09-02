import type { AppData } from "../src/types";
import { describeRule, periodLabel } from "../src/recurrence";
import { boolFlag, parseArgs, stringFlag, UsageError, type ParsedArgs } from "./args";
import { DEFAULT_EMAIL, loadAppData, mutateAppData, resolveUid } from "./client";
import { describeTransaction } from "./resolve";
import {
  buildAddRecurring,
  buildAddTransaction,
  buildPayRecurring,
  emit,
  listAccounts,
  listCategories,
  listRecurring,
  listTransactions,
  money,
  type Output,
} from "./commands";

const USAGE = `dineros — add transactions and recurring expenses from the terminal

Usage: dineros <command> [flags]

Commands
  accounts                    List accounts with their current balance
  categories                  List categories
  transactions                List recent transactions
  recurring                   List recurring expenses and their unpaid occurrences
  add-transaction             Record a transaction
  add-recurring               Create a recurring expense
  pay-recurring               Mark a recurring occurrence as paid
  whoami                      Show which Dineros account the CLI is writing to

Global flags
  --email <address>           Dineros account (default ${DEFAULT_EMAIL})
  --json                      Machine-readable output
  --dry-run                   Compute the change and print it without writing

add-transaction
  --from <account>            Account the money leaves (expense / transfer source)
  --to <account>              Account the money lands in (income / transfer target)
  --amount <n>                Amount, when both sides share a currency
  --from-amount <n>           Source amount for a cross-currency transfer
  --to-amount <n>             Target amount for a cross-currency transfer
  --date <YYYY-MM-DD>         Defaults to today
  --category <name>           Reuses an existing category's spelling when it matches
  --description <text>
  --expected                  Record as an expected (not yet settled) transaction

add-recurring
  --name <text>               Required
  --amount <n>                Estimated amount (optional)
  --currency <code>           Defaults to the account's currency
  --account <account>         Account it is normally paid from
  --category <name>
  --description <text>
  --day <1-31>                Day of month it is charged (required)
  --start <YYYY-MM>           First active month (defaults to the current month)
  --freq <month|year>         Defaults to month
  --every <n>                 Every N months/years (defaults to 1)
  --until <YYYY-MM-DD>        Discontinue after this date

pay-recurring
  --name <expense>            Required (name or id)
  --period <YYYY-MM>          Occurrence to settle (defaults to the current month)
  --amount <n>                Defaults to the expense's estimated amount
  --account <account>         Defaults to the expense's account
  --date <YYYY-MM-DD>         Defaults to the occurrence's due date
  --description <text>        Defaults to the expense's name
  --force                     Allow a month the rule does not cover, or a re-payment
`;

// --- Entry point ---

const READ_COMMANDS = new Map<
  string,
  (args: ParsedArgs, data: AppData) => Output
>([
  ["accounts", listAccounts],
  ["categories", listCategories],
  ["transactions", listTransactions],
  ["recurring", listRecurring],
]);

async function run(args: ParsedArgs): Promise<void> {
  if (args.command === "help" || boolFlag(args, "help")) {
    console.log(USAGE);
    return;
  }

  const email = stringFlag(args, "email") ?? DEFAULT_EMAIL;
  const uid = await resolveUid(email);
  const dryRun = boolFlag(args, "dry-run");

  if (args.command === "whoami") {
    emit(args, {
      json: { email, uid },
      lines: [`${email} → users/${uid}/data/appData`],
    });
    return;
  }

  const read = READ_COMMANDS.get(args.command);
  if (read != null) {
    emit(args, read(args, await loadAppData(uid)));
    return;
  }

  switch (args.command) {
    case "add-transaction": {
      const { data, result: plan } = await mutateAppData(
        uid,
        (current) => buildAddTransaction(args, current),
        { dryRun },
      );
      emit(args, {
        json: { dryRun, ...plan },
        lines: [
          `${dryRun ? "Would add" : "Added"}: ${describeTransaction(data, plan.transaction)}`,
          ...(plan.newCategories.length > 0
            ? [`New categories: ${plan.newCategories.join(", ")}`]
            : []),
        ],
      });
      return;
    }
    case "add-recurring": {
      const { result: expense } = await mutateAppData(
        uid,
        (current) => buildAddRecurring(args, current),
        { dryRun },
      );
      emit(args, {
        json: { dryRun, expense },
        lines: [
          `${dryRun ? "Would create" : "Created"} recurring expense "${expense.name}" — ${describeRule(expense.rule)} — ${money(expense.estimatedAmount, expense.currency)}`,
        ],
      });
      return;
    }
    case "pay-recurring": {
      const { data, result: plan } = await mutateAppData(
        uid,
        (current) => buildPayRecurring(args, current),
        { dryRun },
      );
      emit(args, {
        json: { dryRun, ...plan },
        lines: [
          `${dryRun ? "Would mark" : "Marked"} "${plan.expense.name}" paid for ${periodLabel(plan.period)}: ${describeTransaction(data, plan.transaction)}`,
        ],
      });
      return;
    }
    default:
      throw new UsageError(`Unknown command "${args.command}".`);
  }
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("\n" + USAGE);
    process.exitCode = 2;
    return;
  }

  try {
    await run(args);
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}

void main();
