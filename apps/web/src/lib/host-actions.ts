"use client";

import { parseEventLogs } from "viem";
import { contractAddress, housefulAbi } from "./contract";
import { publicClient } from "./device-wallet";
import { chainParams, type EventDraft } from "./event-draft";
import { send } from "./ticket-actions";

export async function createShow(draft: EventDraft) {
  const block = await publicClient.getBlock();
  const { hash, receipt } = await send("createEvent", [chainParams(draft, Number(block.timestamp) - 60)]);
  const [created] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "EventCreated" });
  return { hash, chainEventId: Number(created.args.eventId) };
}

export async function cancelShow(chainEventId: number) {
  return send("cancelEvent", [BigInt(chainEventId)]);
}

export async function withdrawProceeds(chainEventId: number) {
  return send("withdrawProceeds", [BigInt(chainEventId)]);
}

export type HostedShow = {
  chainEventId: number;
  capacity: number;
  sold: number;
  returned: number;
  waitlistLength: number;
  waitlistActive: number;
  faceValue: bigint;
  endsAt: number;
  /** Judged by chain time, which is what `withdrawProceeds` checks. */
  ended: boolean;
  cancelled: boolean;
  proceedsWithdrawn: boolean;
};

/** Every show on the contract whose host is `wallet`, newest first. */
export async function hostedShows(wallet: `0x${string}`): Promise<HostedShow[]> {
  if (!contractAddress) return [];
  const address = contractAddress;
  const [countRaw, block] = await Promise.all([
    publicClient.readContract({ address, abi: housefulAbi, functionName: "eventCount" }),
    publicClient.getBlock(),
  ]);
  const count = Number(countRaw);
  const ids = Array.from({ length: count }, (_, i) => BigInt(count - i));
  const infos = await Promise.all(
    ids.map((id) => publicClient.readContract({ address, abi: housefulAbi, functionName: "getEventInfo", args: [id] })),
  );
  return infos
    .map((info, i) => ({ info, id: ids[i] }))
    .filter(({ info }) => info.host.toLowerCase() === wallet.toLowerCase())
    .map(({ info, id }) => ({
      chainEventId: Number(id),
      capacity: Number(info.capacity),
      sold: Number(info.sold),
      returned: Number(info.returned),
      waitlistLength: Number(info.waitlistLength),
      waitlistActive: Number(info.waitlistActive),
      faceValue: info.faceValue,
      endsAt: Number(info.endsAt),
      ended: info.endsAt <= block.timestamp,
      cancelled: info.cancelled,
      proceedsWithdrawn: info.proceedsWithdrawn,
    }));
}
