"use client";

import { useCallback, useEffect, useState } from "react";
import { contractAddress, housefulAbi } from "./contract";
import { deviceWallet, publicClient } from "./device-wallet";
import { activePayAddress } from "./pay-signer";

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

export function useEventChain(
  chainEventId: number | null,
  pollMs = 4000,
  walletOverride: `0x${string}` | null = null,
) {
  const [state, setState] = useState<EventChainState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (chainEventId == null) {
      setError("This show is not listed on-chain yet.");
      return;
    }
    if (!contractAddress) {
      setError("Houseful contract address is missing in this build.");
      return;
    }
    try {
      const active = walletOverride ?? (await Promise.race([
        activePayAddress(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]));
      const address = active ?? deviceWallet().address;
      const id = BigInt(chainEventId);
      const reads = Promise.all([
        publicClient.readContract({ address: contractAddress, abi: housefulAbi, functionName: "getEventInfo", args: [id] }),
        publicClient.readContract({ address: contractAddress, abi: housefulAbi, functionName: "ticketOf", args: [id, address] }),
        publicClient.readContract({
          address: contractAddress,
          abi: housefulAbi,
          functionName: "waitlistPositionOf",
          args: [id, address],
        }),
      ]);
      const [info, held, waiting] = await Promise.race([
        reads,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out reading seats from the contract.")), 12_000),
        ),
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
      setError((err as Error).message.split("\n")[0] || "Could not read the contract.");
    }
  }, [chainEventId, walletOverride]);

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
