# Dineros

Personal finance tracker: React + Vite + Tailwind, data in a single Firestore
document per user (`users/{uid}/data/appData`), mirrored to localStorage.
Deploys to GitHub Pages on push to `main`.

## Adding data from a chat session

Use the CLI in `cli/` rather than editing Firestore by hand — it reuses the
app's own normalizers and writes inside a Firestore transaction, so it merges
safely with the web app.

```bash
./dineros accounts                  # what accounts/balances exist
./dineros recurring                 # recurring expenses + unpaid occurrences
./dineros add-transaction --from "Galicia ARS" --amount 12500 --category Groceries --description "Coto"
./dineros add-recurring --name Netflix --amount 9990 --account "Galicia ARS" --day 15
./dineros pay-recurring --name Netflix --period 2026-09
```

Read the current state first (`accounts`, `categories`, `recurring`) so
categories and account names match what is already there, and prefer
`--dry-run` when the request is ambiguous. Full docs: `cli/README.md`.

## Checks

```bash
npm run build            # tsc -b && vite build
npm run typecheck:cli    # the CLI is not part of the app's tsc project
npm run lint
```
