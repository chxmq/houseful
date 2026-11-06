import { isAddress } from "viem";
import { z } from "zod";
import { assuranceFor, credentialMeets } from "@/lib/assurance";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { getSession } from "@/server/auth/session";
import { signAttestation } from "@/server/attest";
import { getEvent } from "@/server/catalog";
import { serverChain } from "@/server/chain";
import { parseNullifier } from "@/server/world";

const body = z.object({
  eventId: z.string().min(1).max(120),
  wallet: z.string().refine(isAddress, "Not an address"),
  purpose: z.enum(["buy", "join", "claim", "recover"]),
});

function fail(status: number, code: string, error: string) {
  return Response.json({ code, error }, { status });
}

/**
 * Signs an EIP-712 attestation from the fan session nullifier.
 * Used after World ID login so the fan does not scan again per show,
 * unless the show asks for a stronger credential than the account has.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.account.kind !== "fan") {
    return fail(401, "signin", "Sign in with World ID first.");
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad-request", "The attestation request was incomplete.");

  const { eventId, purpose } = parsed.data;
  const wallet = parsed.data.wallet.toLowerCase() as `0x${string}`;
  const event = await getEvent(eventId);
  if (!event || event.chainEventId == null) return fail(404, "not-on-sale", "This show is not on sale through Houseful.");

  const need = assuranceFor(event);
  if (!credentialMeets(session.account.credential, need)) {
    return fail(
      403,
      "weak-credential",
      need === "human"
        ? "This show asks for Proof of Human. Sign in again after upgrading your World ID credential, or verify at checkout."
        : "Your account credential is not enough for this show.",
    );
  }

  const nullifier = parseNullifier(session.account.nullifier);

  if (contractAddress && purpose !== "recover") {
    const used = await serverChain().readContract({
      address: contractAddress,
      abi: housefulAbi,
      functionName: "nullifierUsed",
      args: [BigInt(event.chainEventId), nullifier],
    });
    if (used) {
      return fail(
        409,
        "already-holds",
        "This person already holds a ticket or a waitlist place for this show.",
      );
    }
  }

  const { signature, deadline } = await signAttestation({
    chainEventId: event.chainEventId,
    nullifier,
    wallet,
    purpose,
  });

  return Response.json({
    nullifier: nullifier.toString(),
    deadline,
    signature,
    credential: session.account.credential,
    fromSession: true,
  });
}
