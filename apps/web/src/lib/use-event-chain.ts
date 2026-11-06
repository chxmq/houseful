"use client";

import { useCallback, useEffect, useState } from "react";
import { contractAddress, housefulAbi } from "./contract";
import { deviceWallet, publicClient } from "./device-wallet";

export type EventChainState = {
  capacity: number;
  available: number;
  sold: number;
  returned: number;
  waitlistActive: number;
  waitlistLength: number;
  waitlistHead: `0x${string}`;
  cancelled: boolean;
  surrenderCutoff: number;
  faceValue: bigint;
  seated: boolean;
  mine: { ticketId: number | null; waitlistPosition: number | null };
  wallet: `0x${string}`;
};

export function useEventChain(chainEventId: number | null, pollMs = 4000) {
  const [state, setState] = useState<EventChainState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (chainEventId == null || !contractAddress) return;
    const { address } = deviceWallet();
    const id = BigInt(chainEventId);
    try {
      const [info, held, waiting] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: housefulAbi, functionName: "getEventInfo", args: [id] }),
        publicClient.readContract({ address: contractAddress, abi: housefulAbi, functionName: "ticketOf", args: [id, address] }),
        publicClient.readContract({
          address: contractAddress,
          abi: housefulAbi,
          functionName: "waitlistPositionOf",
          args: [id, address],
        }),
      ]);
      setState({
        capacity: Number(info.capacity),
        available: Number(info.capacity - info.minted + info.returned),
        sold: Number(info.sold),
        returned: Number(info.returned),
        waitlistActive: Number(info.waitlistActive),
        waitlistLength: Number(info.waitlistLength),
        waitlistHead: info.waitlistHead,
        cancelled: info.cancelled,
        surrenderCutoff: Number(info.surrenderCutoff),
        faceValue: info.faceValue,
        seated: info.seated,
        mine: {
          ticketId: held[0] ? Number(held[1]) : null,
          waitlistPosition: waiting[0] ? Number(waiting[1]) : null,
        },
        wallet: address,
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    }
  }, [chainEventId]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, pollMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, pollMs]);

  return { state, error, refresh };
}
