"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { encodeAbiParameters, keccak256, parseAbiItem, type Hex } from "viem";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { deviceWallet, publicClient } from "@/lib/device-wallet";
import { shortHex } from "@/lib/format";
import { CheckIcon, CrossIcon } from "./icons";
import { Stamp } from "./motion/stamp";

type Row = {
  position: number;
  wallet: `0x${string}`;
  nullifier: bigint;
  status: "waiting" | "seated" | "left";
  link: Hex;
};

type Ledger = { rows: Row[]; head: Hex; matches: boolean; cursor: number; me: `0x${string}` };

const ZERO: Hex = `0x${"0".repeat(64)}`;
const PAGE = 200n;

function linkHash(prev: Hex, nullifier: bigint, wallet: `0x${string}`): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }], [prev, nullifier, wallet]),
  );
}

async function readLedger(chainEventId: number): Promise<Ledger | null> {
  if (!contractAddress) return null;
  const address = contractAddress;
  const id = BigInt(chainEventId);
  const info = await Promise.race([
    publicClient.readContract({ address, abi: housefulAbi, functionName: "getEventInfo", args: [id] }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000)),
  ]);

  const waiters = [];
  for (let offset = 0n; offset < info.waitlistLength; offset += PAGE) {
    waiters.push(
      ...(await publicClient.readContract({
        address,
        abi: housefulAbi,
        functionName: "getWaitlist",
        args: [id, offset, PAGE],
      })),
    );
  }

  const left = new Set<number>();
  try {
    // Optional enrichment only. Never block the line on log RPC quirks.
    const latest = await Promise.race([
      publicClient.getBlockNumber(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
    ]);
    const fromBlock = latest > 20_000n ? latest - 20_000n : 0n;
    const logs = await Promise.race([
      publicClient.getLogs({
        address,
        event: parseAbiItem("event WaitlistLeft(uint256 indexed eventId, uint256 indexed position, address indexed wallet)"),
        args: { eventId: id },
        fromBlock,
        toBlock: latest,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
    ]);
    for (const log of logs) left.add(Number(log.args.position));
  } catch {
    // Without Leave logs, a departed waiter may show as "Got a seat".
  }

  let prev = ZERO;
  const rows: Row[] = waiters.map((w, i) => {
    prev = linkHash(prev, w.nullifier, w.wallet);
    return {
      position: i,
      wallet: w.wallet,
      nullifier: w.nullifier,
      status: w.active ? "waiting" : left.has(i) ? "left" : "seated",
      link: prev,
    };
  });

  return {
    rows,
    head: info.waitlistHead,
    matches: prev.toLowerCase() === info.waitlistHead.toLowerCase(),
    cursor: Number(info.waitlistCursor),
    me: deviceWallet().address,
  };
}

const statusLabel = { waiting: "Waiting", seated: "Got a seat", left: "Left the line" } as const;

export function WaitlistLedger({ chainEventId }: { chainEventId: number }) {
  const reduce = useReducedMotion();
  const [ledger, setLedger] = useState<Ledger | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const load = () =>
      readLedger(chainEventId)
        .then((l) => live && setLedger(l))
        .catch(() => live && setLedger(null));
    load();
    const timer = setInterval(load, 8000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [chainEventId]);

  if (ledger === undefined) {
    return <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Reading the line from the contract</p>;
  }
  if (ledger === null) {
    return <p className="text-ink-soft">Could not read the waitlist from the contract. Check the RPC and refresh.</p>;
  }
  if (ledger.rows.length === 0) {
    return (
      <p className="max-w-[48ch] text-ink-soft">
        Nobody is waiting. When this show sells out, everyone who joins will be listed here in the order they joined.
      </p>
    );
  }

  const step = reduce ? 0 : Math.min(0.06, 1.2 / ledger.rows.length);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Head recorded on chain</p>
          <p className="mt-1 break-all font-mono text-sm">{ledger.head}</p>
        </div>
        <Stamp
          label={ledger.matches ? "Order checks out" : "Order does not match"}
          delay={step * ledger.rows.length + 0.2}
          className={ledger.matches ? "" : "!border-reject !text-reject"}
        />
      </div>

      <ol className="font-mono text-[13px]">
        {ledger.rows.map((row, i) => {
          const mine = row.wallet.toLowerCase() === ledger.me.toLowerCase();
          return (
            <motion.li
              key={row.position}
              initial={reduce ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * step, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={`grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-ink/10 py-3 sm:grid-cols-[3.5rem_10rem_minmax(0,1fr)_9rem] ${
                mine ? "bg-marigold/25" : ""
              } ${row.status === "waiting" ? "" : "text-muted"}`}
            >
              <span className="pl-2 tabular-nums">#{String(row.position + 1).padStart(3, "0")}</span>
              <span className="whitespace-nowrap">
                {shortHex(row.wallet)}
                {mine ? <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-ink">you</span> : null}
              </span>
              <span className="hidden items-center gap-2 truncate sm:flex">
                <motion.span
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * step + 0.15, type: "spring", stiffness: 500, damping: 24 }}
                  className="inline-flex text-admit"
                >
                  <CheckIcon size={14} />
                </motion.span>
                <span className="truncate">{shortHex(row.link, 10, 8)}</span>
              </span>
              <span className="whitespace-nowrap text-right text-[11px] uppercase tracking-[0.12em]">
                {row.status === "left" ? (
                  <span className="inline-flex items-center gap-1">
                    <CrossIcon size={12} /> {statusLabel.left}
                  </span>
                ) : (
                  statusLabel[row.status]
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
