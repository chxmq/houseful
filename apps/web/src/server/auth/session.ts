import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/server/db/client";
import {
  createSession,
  deleteSession,
  readSession,
  SESSION_COOKIE,
  type SessionSummary,
} from "./store";

export type { AccountSummary, SessionSummary } from "./store";

function loginUrl(kind: "fan" | "host", next?: string, reason?: string): string {
  const path = kind === "host" ? "/host/login" : "/login";
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (reason) params.set("reason", reason);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * Who is signed in, or null. Cookie-backed, so call inside a Suspense boundary or an action.
 */
export const getSession = cache(async (): Promise<SessionSummary | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await connection();
  try {
    return await readSession(db, token);
  } catch (error) {
    console.error("Could not read the session", error);
    return null;
  }
});

export async function requireFan(next = "/account"): Promise<SessionSummary> {
  const session = await getSession();
  if (session?.account.kind === "fan") return session;
  redirect(loginUrl("fan", next, session ? "host-account" : "signin"));
}

export async function requireHost(next = "/host"): Promise<SessionSummary> {
  const session = await getSession();
  if (session?.account.kind === "host") return session;
  redirect(loginUrl("host", next, session ? "fan-account" : "signin"));
}

export async function startSession(accountId: string): Promise<void> {
  const jar = await cookies();
  await deleteSession(db, jar.get(SESSION_COOKIE)?.value);
  const { token, expiresAt } = await createSession(db, accountId);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt * 1000),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await deleteSession(db, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
