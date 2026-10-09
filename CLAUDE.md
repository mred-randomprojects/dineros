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

Run them under Node 22 (`.nvmrc`; `nvm use`). `npm run check` is the gate CI
runs before every deploy:

```bash
npm run check            # tsc -b && typecheck:cli && eslint .
npm run build            # tsc -b && vite build
npm run typecheck:cli    # the CLI is not part of the app's tsc project
npm run lint
```

## Shared browser origin

<!-- mred-randomprojects:shared-origin v1. This block is identical in every repo published under mred-randomprojects.github.io: change them all together. -->

Everything published under this GitHub account is served from
`https://mred-randomprojects.github.io` — the root site at `/` and each repo at
`/<repo>/`. A browser's *origin* is scheme and host, with no path, so all of
them (fulbito, execute, nutriapp, cuentas, dineros, candito-tool,
terrateniente, moonfall and the rest) run on **one origin**, and everything the
browser scopes by origin is a single pool they all share:

- **`localStorage` and `sessionStorage` are one namespace.** Prefix every key
  with this app's name and never use a generic one (`settings`, `data`,
  `history`): any other app can read it, overwrite it or delete it. Never call
  `localStorage.clear()` — it wipes every app's data, not only this one's.
- **So is the quota.** `localStorage` gets about 5 MB per *origin*, not per
  app. One app keeping photos as data URLs can make another app's save throw
  `QuotaExceededError`, and the bytes that filled it may not be this app's.
- **IndexedDB and Cache Storage are shared too.** Name databases and caches
  after the app, and when a service worker clears old caches it must delete
  only its own: `caches.keys()` returns every app's.
- **A service worker must be scoped to its app's own path** (`/<repo>/`). One
  registered at `/` controls every app that has not registered a more
  specific one.
- **Firebase sessions from every app sit side by side.** The Auth SDK keeps
  them all in one IndexedDB database, `firebaseLocalStorageDb`, one record per
  Firebase app, keyed `firebase:authUser:<apiKey>:[DEFAULT]`. Several sessions
  with different uids for the same Google account in there are several
  *apps*, not one account whose uid changed — fulbito's debugging went down
  exactly that wrong path in October 2026.
- **There is no isolation between the apps.** Any script in any of them can
  read every other app's storage and Firebase sessions. That is fine while all
  of the code is the owner's; it also means a bug or a compromised dependency
  in one app reaches all of them. An app that ever needs isolation needs an
  origin of its own (a custom domain), and moving it strands every user's
  local data — a data migration, not a tidy-up.

<!-- /mred-randomprojects:shared-origin -->

**In this repo:** Served at `/dineros/`. Keys: `dineros-data`, `dineros-data-backup`, `dineros-data-corrupt-recovery`. Uses Firebase, so its session is one of the records in `firebaseLocalStorageDb`.
