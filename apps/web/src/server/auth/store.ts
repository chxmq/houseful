import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, type Database } from "@/server/db/client";
import {
  accounts,
  sessions,
  wallets,
  type Account,
  type AccountKind,
  type Credential,
  type WalletKind,
  type WalletRow,
} from "@/server/db/schema";

export const SESSION_COOKIE = "hf_session";
export const LOGIN_CHALLENGE_COOKIE = "hf_login_chal";
/** Sessions last 30 days. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type AccountSummary = {
  id: string;
  kind: AccountKind;
  nullifier: string;
  credential: Credential;
  createdAt: number;
};

export type SessionSummary = {
  account: AccountSummary;
  expiresAt: number;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

function toSummary(row: Account): AccountSummary {
  return {
    id: row.id,
    kind: row.kind,
    nullifier: row.nullifier,
    credential: row.credential,
    createdAt: row.createdAt,
  };
}

export function newLoginChallenge(): string {
  return randomBytes(24).toString("hex");
}

export function loginSignal(kind: AccountKind, challenge: string): string {
  return `houseful:login:${kind}:${challenge}`;
}

/** Find or create the account for this World ID nullifier and kind. */
export async function upsertAccountByNullifier(
  database: Database,
  input: { kind: AccountKind; nullifier: string; credential: Credential },
): Promise<{ account: AccountSummary; created: boolean }> {
  const nullifier = input.nullifier.trim().toLowerCase();
  const existing = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.kind, input.kind), eq(accounts.nullifier, nullifier)))
    .limit(1);
  if (existing[0]) {
    return { account: toSummary(existing[0]), created: false };
  }

  // One World ID backs one account of this kind. If it already owns the other kind, that is fine.
  const id = newId();
  const now = Math.floor(Date.now() / 1000);
  await database.insert(accounts).values({
    id,
    kind: input.kind,
    nullifier,
    credential: input.credential,
    createdAt: now,
  });
  return {
    account: { id, kind: input.kind, nullifier, credential: input.credential, createdAt: now },
    created: true,
  };
}

export async function createSession(
  database: Database,
  accountId: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await database.insert(sessions).values({
    tokenHash: hashToken(token),
    accountId,
    expiresAt,
    createdAt: Math.floor(Date.now() / 1000),
  });
  return { token, expiresAt };
}

export async function readSession(database: Database, token: string | undefined): Promise<SessionSummary | null> {
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  const rows = await database
    .select({
      expiresAt: sessions.expiresAt,
      account: accounts,
    })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { account: toSummary(row.account), expiresAt: row.expiresAt };
}

export async function deleteSession(database: Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await database.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function listWallets(database: Database, accountId: string): Promise<WalletRow[]> {
  return database.select().from(wallets).where(eq(wallets.accountId, accountId));
}

export async function linkWallet(
  database: Database,
  input: { accountId: string; address: `0x${string}`; kind: WalletKind; label?: string },
): Promise<WalletRow> {
  const address = input.address.toLowerCase() as `0x${string}`;
  const id = newId();
  const now = Math.floor(Date.now() / 1000);
  const existing = await database
    .select()
    .from(wallets)
    .where(eq(wallets.accountId, input.accountId));
  const makeActive = existing.length === 0;
  if (makeActive) {
    await database.update(wallets).set({ active: false }).where(eq(wallets.accountId, input.accountId));
  }
  await database.insert(wallets).values({
    id,
    accountId: input.accountId,
    address,
    kind: input.kind,
    label: input.label ?? null,
    active: makeActive,
    linkedAt: now,
  });
  const [row] = await database.select().from(wallets).where(eq(wallets.id, id)).limit(1);
  return row!;
}

export async function setActiveWallet(database: Database, accountId: string, walletId: string): Promise<void> {
  const [row] = await database
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.accountId, accountId)))
    .limit(1);
  if (!row) throw new Error("That wallet is not on this account.");
  await database.update(wallets).set({ active: false }).where(eq(wallets.accountId, accountId));
  await database.update(wallets).set({ active: true }).where(eq(wallets.id, walletId));
}

export async function delinkWallet(database: Database, accountId: string, walletId: string): Promise<void> {
  const [row] = await database
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.accountId, accountId)))
    .limit(1);
  if (!row) throw new Error("That wallet is not on this account.");
  await database.delete(wallets).where(eq(wallets.id, walletId));
  if (row.active) {
    const rest = await database.select().from(wallets).where(eq(wallets.accountId, accountId)).limit(1);
    if (rest[0]) {
      await database.update(wallets).set({ active: true }).where(eq(wallets.id, rest[0].id));
    }
  }
}

export { db };
