import { issueCredential } from "@houseful/pass";
import { isAddress } from "viem";
import { z } from "zod";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { serverChain } from "@/server/chain";
import { doorEnv } from "@/server/env";

const body = z.object({
  chainEventId: z.number().int().positive(),
  ticketId: z.number().int().nonnegative(),
  wallet: z.string().refine(isAddress, "Not an address"),
});

const EMPTY_KEY = `0x${"0".repeat(64)}`;

/**
 * Issues the door credential for a ticket's current holder. The credential is bound to the
 * phone key registered on chain, so it is useless to anyone who does not hold that phone.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ticket not specified." }, { status: 400 });
  if (!contractAddress) return Response.json({ error: "Houseful is not deployed on this network." }, { status: 503 });

  const env = doorEnv();
  const chain = serverChain();
  const { chainEventId, ticketId } = parsed.data;
  const id = BigInt(chainEventId);

  const [[owner, , generation, doorKey], info] = await Promise.all([
    chain.readContract({ address: contractAddress, abi: housefulAbi, functionName: "getTicket", args: [id, BigInt(ticketId)] }),
    chain.readContract({ address: contractAddress, abi: housefulAbi, functionName: "getEventInfo", args: [id] }),
  ]);

  if (owner.toLowerCase() !== parsed.data.wallet.toLowerCase()) {
    return Response.json({ error: "This ticket is held by someone else now." }, { status: 403 });
  }
  if (doorKey === EMPTY_KEY) {
    return Response.json({ error: "This phone has not been bound to the ticket yet." }, { status: 409 });
  }

  const signed = issueCredential(
    {
      v: 1,
      event: String(chainEventId),
      ticket: ticketId,
      gen: Number(generation),
      holderKey: doorKey.slice(2),
      exp: Number(info.endsAt),
    },
    env.DOOR_ISSUER_SECRET_KEY.replace(/^0x/, ""),
  );

  return Response.json(signed);
}
