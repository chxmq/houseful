import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Shared by the Next server (via ./client, which adds the server-only guard) and by scripts run with tsx.

export const DEFAULT_DATABASE_URL = "file:./data/houseful.db";

export type Database = LibSQLDatabase<typeof schema>;

function ensureLocalDirectory(url: string) {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  if (!filePath || filePath === ":memory:") return;
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

export function createDatabase(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): {
  client: Client;
  db: Database;
} {
  ensureLocalDirectory(url);
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  return { client, db: drizzle(client, { schema }) };
}

const globalForDb = globalThis as unknown as { __housefulDb?: ReturnType<typeof createDatabase> };

// Reused across dev hot reloads so we do not leak libsql handles.
export const { client, db } = (globalForDb.__housefulDb ??= createDatabase());
