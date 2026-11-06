import { publicKeyFromSecret } from "@houseful/pass";
import { connection } from "next/server";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { getEventByChainId } from "@/server/catalog";
import { serverChain } from "@/server/chain";
import { doorEnv } from "@/server/env";

export type DoorSync = {
  event: string;
  chainEventId: number;
  slug: string;
  title: string;
  venue: string;
  startsAt: number;
  doorsAt: number;
  capacity: number;
  minted: number;
  issuerPublicKey: string;
  revocations: { ticket: number; generation: number }[];
  syncedAt: number;
};

const noStore = { "cache-control": "no-store" };

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: noStore });
}

function issuerPublicKey(): string | null {
  try {
    return publicKeyFromSecret(doorEnv().DOOR_ISSUER_SECRET_KEY.replace(/^0x/, "").toLowerCase());
  } catch {
    return null;
  }
}

export async function GET(_request: Request, ctx: RouteContext<"/api/door/[chainEventId]/sync">) {
  await connection();

  const { chainEventId: raw } = await ctx.params;
  if (!/^\d{1,9}$/.test(raw)) return fail(400, "Event id must be a whole number.");
  const chainEventId = Number(raw);

  if (!contractAddress) return fail(503, "No Houseful contract is configured for this chain.");
  const issuerKey = issuerPublicKey();
  if (!issuerKey) return fail(503, "The door issuer key is not configured on this server.");

  const listing = await getEventByChainId(chainEventId);
  if (!listing) return fail(404, "No show is listed with that event id.");

  const id = BigInt(chainEventId);
  const client = serverChain();
  try {
    const info = await client.readContract({
      address: contractAddress,
      abi: housefulAbi,
      functionName: "getEventInfo",
      args: [id],
    });
    const minted = Number(info.minted);

    const tickets = await Promise.all(
      Array.from({ length: minted }, (_, ticket) =>
        client.readContract({
          address: contractAddress!,
          abi: housefulAbi,
          functionName: "getTicket",
          args: [id, BigInt(ticket)],
        }),
      ),
    );

    const body: DoorSync = {
      event: String(chainEventId),
      chainEventId,
      slug: listing.slug,
      title: listing.title,
      venue: listing.venue.name,
      startsAt: listing.startsAt,
      doorsAt: listing.doorsAt,
      capacity: Number(info.capacity),
      minted,
      issuerPublicKey: issuerKey,
      revocations: tickets.map(([, , generation], ticket) => ({ ticket, generation: Number(generation) })),
      syncedAt: Math.floor(Date.now() / 1000),
    };
    return Response.json(body, { headers: noStore });
  } catch (err) {
    console.error("door sync failed", err);
    return fail(502, "Could not read the ticket contract. Try again in a moment.");
  }
}
