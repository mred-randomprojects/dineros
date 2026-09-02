# Dineros CLI

Add transactions and recurring expenses to your Dineros account from the
terminal — same Firestore document the web app reads, so changes show up on
next load (and merge safely if the app is open elsewhere).

```bash
./dineros accounts
./dineros add-transaction --from "Galicia ARS" --amount 12500 --category Groceries --description "Coto"
```

## One-time setup

The CLI talks to Firestore with the Firebase Admin SDK, which needs a service
account key for the Dineros project:

1. [Firebase console](https://console.firebase.google.com) → Dineros →
   **Project settings** → **Service accounts** → **Generate new private key**.
2. Save the downloaded JSON as `~/.dineros/service-account.json`:

   ```bash
   mkdir -p ~/.dineros && mv ~/Downloads/dineros-*-firebase-adminsdk-*.json ~/.dineros/service-account.json
   ```

Then check it works:

```bash
./dineros whoami
```

The key is a full-access credential for the project — keep it outside the repo
(as above) and never commit it.

### Environment overrides

| Variable | Purpose |
| --- | --- |
| `DINEROS_SERVICE_ACCOUNT` | Key path, if not `~/.dineros/service-account.json` |
| `DINEROS_EMAIL` | Account to write to (default `maxiredigonda@gmail.com`) |
| `DINEROS_UID` | Firebase uid, skipping the email → uid lookup |
| `DINEROS_PROJECT_ID` | Overrides `VITE_FIREBASE_PROJECT_ID` from `.env` |

## Commands

Run `./dineros --help` for the full flag list. Every command accepts `--json`
for machine-readable output, and every mutating command accepts `--dry-run`,
which computes and prints the change without writing it.

```bash
# What's there
./dineros accounts
./dineros categories
./dineros transactions --limit 10 --account "Wise USD"
./dineros recurring                 # cadence + unpaid occurrences + next due date

# Spend, earn, transfer
./dineros add-transaction --from "Galicia ARS" --amount 12500 --category Groceries --description "Coto"
./dineros add-transaction --to "Wise USD" --amount 1200 --category Salary
./dineros add-transaction --from "Galicia ARS" --to "Wise USD" --from-amount 145000 --to-amount 100

# Recurring expenses
./dineros add-recurring --name Netflix --amount 9990 --account "Galicia ARS" --day 15 --category Streaming
./dineros pay-recurring --name Netflix --period 2026-09
```

Accounts, categories and recurring expenses can be named by id, by exact name,
or by any unique substring — `--from galicia` is enough. An ambiguous name is
an error rather than a guess.

Amounts are always positive; direction comes from `--from` / `--to`. A transfer
between accounts of different currencies requires both `--from-amount` and
`--to-amount`. Dates default to today, and `pay-recurring` defaults to the
occurrence's own due date.

## Development

```bash
npm run typecheck:cli    # tsc -p tsconfig.cli.json
npm run dineros -- accounts
```

`cli/commands.ts` holds the pure "given AppData, produce the next AppData"
logic; `cli/client.ts` is the only module that touches Firestore. Writes go
through a Firestore transaction and reuse the app's own `normalizeAppData`, so
CLI and web-app writes cannot clobber each other.
