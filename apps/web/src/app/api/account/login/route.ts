import type { IDKitResult } from "@worldcoin/idkit";
import { cookies } from "next/headers";
import { z } from "zod";
import { HOUSEFUL_LOGIN_ACTION } from "@/lib/assurance";
import { startSession } from "@/server/auth/session";
import {
  LOGIN_CHALLENGE_COOKIE,
  db,
  fanLoginSignal,
  upsertFanAccount,
} from "@/server/auth/store";
import { recordVerification } from "@/server/humans";
import { verifyWorldProof, WorldVerificationError } from "@/server/world";

const body = z.object({
  result: z.custom<IDKitResult>((v) => typeof v === "object" && v !== null),
});

function fail(status: number, code: string, error: string) {
  return Response.json({ code, error }, { status });
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad-request", "The login request was incomplete.");

  const jar = await cookies();
  const challenge = jar.get(LOGIN_CHALLENGE_COOKIE)?.value;
  if (!challenge) return fail(400, "stale-challenge", "Start World ID again. The login challenge expired.");

  let human;
  try {
    human = await verifyWorldProof(parsed.data.result, {
      action: HOUSEFUL_LOGIN_ACTION,
      signal: fanLoginSignal(challenge),
      assurance: "selfie",
    });
  } catch (err) {
    if (err instanceof WorldVerificationError) {
      const status = err.code === "world-unreachable" ? 503 : err.code === "weak-credential" ? 403 : 422;
      return fail(status, err.code, err.message);
    }
    throw err;
  }

  const nullifierHex = `0x${human.nullifier.toString(16)}`;
  await recordVerification({
    nullifier: nullifierHex,
    credential: human.credential,
    action: HOUSEFUL_LOGIN_ACTION,
    purpose: "login",
    environment: human.environment,
  });

  let account;
  try {
    ({ account } = await upsertFanAccount(db, { nullifier: nullifierHex, credential: human.credential }));
  } catch (err) {
    return fail(409, "account-conflict", (err as Error).message);
  }

  await startSession(account.id);
  jar.delete(LOGIN_CHALLENGE_COOKIE);

  return Response.json({
    ok: true,
    accountId: account.id,
    credential: account.credential,
  });
}
