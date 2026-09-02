import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { AppData } from "../src/types";
import { normalizeAppData } from "../src/types";
import { UsageError } from "./args";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_KEY_PATH = resolve(homedir(), ".dineros/service-account.json");

export const SETUP_HINT = `The CLI needs a Firebase service account key for the Dineros project:
  1. https://console.firebase.google.com → Dineros → Project settings → Service accounts
  2. "Generate new private key" and save the JSON
  3. mkdir -p ~/.dineros && mv ~/Downloads/<key>.json ${DEFAULT_KEY_PATH}
     (or point DINEROS_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS at it)`;

/**
 * Minimal `.env` reader: the CLI shares the web app's Firebase project id but
 * has no bundler to inline `import.meta.env` for it.
 */
function readEnvFile(): Map<string, string> {
  const values = new Map<string, string>();
  let contents: string;
  try {
    contents = readFileSync(resolve(repoRoot, ".env"), "utf8");
  } catch {
    return values;
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    values.set(
      trimmed.slice(0, eq).trim(),
      trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, ""),
    );
  }
  return values;
}

function projectIdFromEnv(): string | undefined {
  const fromProcess =
    process.env.DINEROS_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID;
  if (fromProcess != null && fromProcess.length > 0) return fromProcess;
  const fromFile = readEnvFile().get("VITE_FIREBASE_PROJECT_ID");
  return fromFile != null && fromFile.length > 0 ? fromFile : undefined;
}

export const DEFAULT_EMAIL =
  process.env.DINEROS_EMAIL ?? "maxiredigonda@gmail.com";

interface ServiceAccountKey {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function readServiceAccountKey(path: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the service account key at ${path}: ${message}`);
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a service account key JSON file.`);
  }
  const record: Record<string, unknown> = { ...parsed };
  if (
    !isNonEmptyString(record.project_id) ||
    !isNonEmptyString(record.client_email) ||
    !isNonEmptyString(record.private_key)
  ) {
    throw new Error(
      `${path} is missing project_id / client_email / private_key — is it a Firebase service account key?`,
    );
  }
  return {
    projectId: record.project_id,
    clientEmail: record.client_email,
    privateKey: record.private_key,
  };
}

/**
 * Credentials, in order: an explicitly configured service account key, the
 * default `~/.dineros/service-account.json`, then Application Default
 * Credentials for anyone whose gcloud login already owns the project.
 */
function serviceAccountKeyPath(): string | null {
  const configured =
    process.env.DINEROS_SERVICE_ACCOUNT ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (configured != null && configured.length > 0) return configured;
  return existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null;
}

let firestore: Firestore | null = null;

export function getDb(): Firestore {
  if (firestore != null) return firestore;

  const keyPath = serviceAccountKeyPath();
  if (keyPath != null) {
    const key = readServiceAccountKey(keyPath);
    const app = initializeApp({
      credential: cert({
        projectId: key.projectId,
        clientEmail: key.clientEmail,
        privateKey: key.privateKey,
      }),
      projectId: key.projectId,
    });
    firestore = getFirestore(app);
    return firestore;
  }

  const projectId = projectIdFromEnv();
  if (projectId == null) {
    throw new Error(`No credentials and no project id.\n\n${SETUP_HINT}`);
  }
  const app = initializeApp({ credential: applicationDefault(), projectId });
  firestore = getFirestore(app);
  return firestore;
}

function withSetupHint(action: string, error: unknown): Error {
  // Validation failures raised inside a mutation are the user's problem to
  // fix, not a credentials problem — pass them through untouched.
  if (error instanceof UsageError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const denied =
    message.includes("PERMISSION_DENIED") ||
    message.includes("Missing or insufficient permissions") ||
    message.includes("Could not load the default credentials") ||
    message.includes("adc-troubleshooting");
  return new Error(
    denied ? `${action}: ${message}\n\n${SETUP_HINT}` : `${action}: ${message}`,
  );
}

/**
 * The Firestore document is keyed by Firebase Auth uid; `DINEROS_UID` skips
 * the Identity Toolkit lookup when it is already known.
 */
export async function resolveUid(email: string): Promise<string> {
  const configured = process.env.DINEROS_UID;
  if (configured != null && configured.length > 0) return configured;

  getDb(); // initializes the admin app the auth lookup runs against
  try {
    return (await getAuth().getUserByEmail(email)).uid;
  } catch (error: unknown) {
    throw withSetupHint(`Could not resolve a Dineros user for ${email}`, error);
  }
}

function userDocRef(uid: string) {
  return getDb().collection("users").doc(uid).collection("data").doc("appData");
}

/**
 * Mirrors the web app's cloud writes: Firestore rejects `undefined`, and the
 * app's own normalizers emit optional fields as `undefined`.
 */
function stripUndefined(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) clean[key] = stripUndefined(entry);
  }
  return clean;
}

function payloadFromAppData(data: AppData): Record<string, unknown> {
  return stripUndefined({
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.transactions,
    recurringExpenses: data.recurringExpenses,
    deletedAccounts: data.deletedAccounts,
    deletedCategories: data.deletedCategories,
    deletedTransactions: data.deletedTransactions,
    deletedRecurringExpenses: data.deletedRecurringExpenses,
  }) as Record<string, unknown>;
}

export async function loadAppData(uid: string): Promise<AppData> {
  try {
    const snap = await userDocRef(uid).get();
    return normalizeAppData(snap.exists ? snap.data() : null);
  } catch (error: unknown) {
    throw withSetupHint("Could not read your Dineros data", error);
  }
}

export interface MutationResult<T> {
  data: AppData;
  result: T;
}

/**
 * Read-modify-write inside a Firestore transaction so a concurrent save from
 * the web app cannot clobber (or be clobbered by) the CLI's change.
 * With `dryRun`, the mutation is computed and returned but never written.
 */
export async function mutateAppData<T>(
  uid: string,
  mutate: (data: AppData) => MutationResult<T>,
  options: { dryRun?: boolean } = {},
): Promise<MutationResult<T>> {
  if (options.dryRun === true) {
    return mutate(await loadAppData(uid));
  }

  const ref = userDocRef(uid);
  try {
    return await getDb().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const current = normalizeAppData(snap.exists ? snap.data() : null);
      const mutated = mutate(current);
      transaction.set(ref, payloadFromAppData(mutated.data));
      return mutated;
    });
  } catch (error: unknown) {
    throw withSetupHint("Could not save to Dineros", error);
  }
}
