import "server-only";
import { isNull, not } from "drizzle-orm";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { serverChain } from "@/server/chain";
import { db } from "@/server/db/client";
import { events } from "@/server/db/schema";

/**
 * True when the wallet still holds at least one unsurrendered ticket on a catalog show.
 * Waitlist places alone do not block delink.
 */
export async function walletHoldsLiveTicket(wallet: `0x${string}`): Promise<boolean> {
  const houseful = contractAddress;
  if (!houseful) return false;
  const rows = await db
    .select({ chainEventId: events.chainEventId })
    .from(events)
    .where(not(isNull(events.chainEventId)));
  const ids = rows.map((r) => r.chainEventId).filter((id): id is number => id != null);
  if (ids.length === 0) return false;

  const client = serverChain();
  const checks = await Promise.all(
    ids.map((chainEventId) =>
      client.readContract({
        address: houseful,
        abi: housefulAbi,
        functionName: "ticketOf",
        args: [BigInt(chainEventId), wallet],
      }),
    ),
  );
  return checks.some(([held]) => held);
}
