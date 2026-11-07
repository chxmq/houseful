import { cookies } from "next/headers";
import { isAddress, verifyMessage } from "viem";
import { z } from "zod";
import { startSession } from "@/server/auth/session";
import {
  decodeHostChallenge,
  HOST_CHALLENGE_COOKIE,
  db,
  hostLoginMessage,
  requestOrigin,
  upsertHostAccount,
} from "@/server/auth/store";

const body = z.object({
  address: z.string().refine(isAddress, "Not an address"),
  signature: z.string().min(1),
});

function fail(status: number, code: string, error: string) {
  return Response.json({ code, error }, { status });
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad-request", "Sign the host challenge with your wallet.");

  const jar = await cookies();
  const payload = decodeHostChallenge(jar.get(HOST_CHALLENGE_COOKIE)?.value);
  if (!payload) return fail(400, "stale-challenge", "Ask for a fresh host challenge.");

  if (Date.now() > Date.parse(payload.expirationTime)) {
    jar.delete(HOST_CHALLENGE_COOKIE);
    return fail(400, "expired-challenge", "That host challenge has expired. Ask for a new one.");
  }

  const address = parsed.data.address.toLowerCase() as `0x${string}`;
  const origin = requestOrigin(req);
  const message = hostLoginMessage({
    origin,
    address,
    challenge: payload.challenge,
    issuedAt: payload.issuedAt,
    expirationTime: payload.expirationTime,
  });
  const ok = await verifyMessage({
    address,
    message,
    signature: parsed.data.signature as `0x${string}`,
  });
  if (!ok) return fail(401, "bad-signature", "That signature does not match the host challenge.");

  let account;
  try {
    ({ account } = await upsertHostAccount(db, address));
  } catch (err) {
    return fail(409, "account-conflict", (err as Error).message);
  }

  await startSession(account.id);
  jar.delete(HOST_CHALLENGE_COOKIE);

  return Response.json({ ok: true, accountId: account.id });
}
