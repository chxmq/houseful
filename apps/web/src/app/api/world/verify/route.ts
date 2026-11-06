import type { IDKitResult } from "@worldcoin/idkit";
import { isAddress } from "viem";
import { z } from "zod";
import { assuranceFor, worldActionFor } from "@/lib/assurance";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { signAttestation } from "@/server/attest";
import { getEvent } from "@/server/catalog";
import { serverChain } from "@/server/chain";
import { recordVerification } from "@/server/humans";
import { verifyWorldProof, WorldVerificationError } from "@/server/world";

const body = z.object({
  eventId: z.string().min(1).max(120),
  wallet: z.string().refine(isAddress, "Not an address"),
  purpose: z.enum(["buy", "join", "claim"]),
  result: z.custom<IDKitResult>((v) => typeof v === "object" && v !== null),
});

function fail(status: number, code: string, error: string) {
  return Response.json({ code, error }, { status });
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad-request", "The verification request was incomplete.");

  const { eventId, purpose, result } = parsed.data;
  const wallet = parsed.data.wallet.toLowerCase() as `0x${string}`;

  const event = await getEvent(eventId);
  if (!event || event.chainEventId == null) return fail(404, "not-on-sale", "This show is not on sale through Houseful.");

  const action = worldActionFor(event.id);
  const assurance = assuranceFor(event);

  let human;
  try {
    human = await verifyWorldProof(result, { action, wallet, assurance });
  } catch (err) {
    if (err instanceof WorldVerificationError) {
      const status = err.code === "world-unreachable" ? 503 : err.code === "weak-credential" ? 403 : 422;
      return fail(status, err.code, err.message);
    }
    throw err;
  }

  if (contractAddress) {
    const used = await serverChain().readContract({
      address: contractAddress,
      abi: housefulAbi,
      functionName: "nullifierUsed",
      args: [BigInt(event.chainEventId), human.nullifier],
    });
    if (used) {
      return fail(
        409,
        "already-holds",
        "This person already holds a ticket or a waitlist place for this show. One each, so everyone gets a fair go.",
      );
    }
  }

  await recordVerification({
    nullifier: `0x${human.nullifier.toString(16)}`,
    credential: human.credential,
    action,
    purpose,
    environment: human.environment,
    eventId: event.id,
    wallet,
  });

  const { signature, deadline } = await signAttestation({
    chainEventId: event.chainEventId,
    nullifier: human.nullifier,
    wallet,
    purpose,
  });

  return Response.json({
    nullifier: human.nullifier.toString(),
    deadline,
    signature,
    credential: human.credential,
  });
}
