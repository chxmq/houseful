import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL ?? "file:./data/houseful.db";
if (url.startsWith("file:")) mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
