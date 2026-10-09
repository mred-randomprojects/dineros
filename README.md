# Dineros

A personal finance tracker: accounts in several currencies, transactions and
transfers, categories, balance adjustments, a year grid of recurring expenses,
and a CSV importer that reads English or Spanish headers. Each user's data is
one Firestore document, mirrored to `localStorage` so the app keeps working
offline.

**Live:** <https://mred-randomprojects.github.io/dineros/> (sign in with Google).

Built with React 18, Vite 5, TypeScript, Tailwind 3 and Radix UI, with
Firebase Auth and Firestore for sync.

## Develop

```bash
nvm use                 # Node 22, from .nvmrc
npm ci
cp .env.example .env    # then fill in the Firebase web config
npm run dev
npm run check           # tsc, the CLI's typecheck, eslint, vitest: the CI gate
```

## CLI

`./dineros` reads and adds data from a terminal: transactions, recurring
expenses, and payments of those. It writes the same Firestore document as the
app, inside a transaction and through the app's own normalizers, so it merges
safely with an open tab. AI agent sessions use it to record expenses instead of
editing Firestore by hand. `./dineros export` saves a read-only JSON snapshot.

It needs a Firebase service-account key kept outside the repo. Setup and every
command are in [`cli/README.md`](cli/README.md).

## Deploy

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
`npm run check`, then a build with the Firebase config from the repository's
secrets, then GitHub Pages. `/dineros/version.json` names the deployed commit.
`./deploy.sh` runs the same check locally, pushes `main` and follows the run.

## Storage

The app shares the origin `https://mred-randomprojects.github.io` with every
other app published there, so all its keys start with `dineros-`:

| Where | What |
| --- | --- |
| `localStorage` `dineros-data` | The data |
| `localStorage` `dineros-data-backup` | The previous save |
| `localStorage` `dineros-data-corrupt-recovery` | A copy of data that failed to load, kept for recovery |
| IndexedDB `firebaseLocalStorageDb` | The Firebase Auth session (shared by every Firebase app on the origin) |
| Firestore `users/{uid}/data/appData` | The synced copy |
