"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { deviceWallet, publicClient } from "@/lib/device-wallet";
import { deviceDoorKey, doorKeyBytes32 } from "@/lib/door-key";
import { formatUsdt, formatLongDate, formatTime, shortHex } from "@/lib/format";
import { seatCaption } from "@/lib/seat-layout";
import { playCue } from "@/lib/sounds";
import {
  bindDoorKey,
  claimRefund,
  deviceSigner,
  explainError,
  leaveWaitlist,
  surrenderTicket,
} from "@/lib/ticket-actions";
import { DoorCode } from "./door-code";
import { ArrowRight, ReturnIcon } from "./icons";
import { SplitFlap } from "./motion/split-flap";
import { TicketStub } from "./ticket-stub";

export type WalletEvent = {
  slug: string;
  chainEventId: number;
  title: string;
  startsAt: number;
  timezone: string;
  doorsAt: number;
  priceUsd: number;
  venue: string;
};

type Holding =
  | {
      kind: "ticket";
      event: WalletEvent;
      ticketId: number;
      generation: number;
      seat: number;
      door: DoorBinding;
      cancelled: boolean;
    }
  | { kind: "waiting"; event: WalletEvent; position: number; ahead: number; cancelled: boolean };

/** Whether the ticket's door key on chain is this phone's key, another phone's, or not set. */
type DoorBinding = "here" | "elsewhere" | "none";

const EMPTY_KEY = `0x${"0".repeat(64)}`;

async function readHoldings(events: WalletEvent[], wallet: `0x${string}`): Promise<Holding[]> {
  if (!contractAddress) return [];
  const address = contractAddress;
  const myKey = doorKeyBytes32(deviceDoorKey()).toLowerCase();
  const rows = await Promise.all(
    events.map(async (event) => {
      const id = BigInt(event.chainEventId);
      const [held, waiting] = await Promise.all([
        publicClient.readContract({ address, abi: housefulAbi, functionName: "ticketOf", args: [id, wallet] }),
        publicClient.readContract({ address, abi: housefulAbi, functionName: "waitlistPositionOf", args: [id, wallet] }),
      ]);
      if (!held[0] && !waiting[0]) return null;
      const info = await publicClient.readContract({ address, abi: housefulAbi, functionName: "getEventInfo", args: [id] });
      if (held[0]) {
        const [, , generation, doorKey, seat] = await publicClient.readContract({
          address,
          abi: housefulAbi,
          functionName: "getTicket",
          args: [id, held[1]],
        });
        return {
          kind: "ticket",
          event,
          ticketId: Number(held[1]),
          generation: Number(generation),
          seat: Number(seat),
          door: doorKey === EMPTY_KEY ? "none" : doorKey.toLowerCase() === myKey ? "here" : "elsewhere",
          cancelled: info.cancelled,
        } satisfies Holding;
      }
      const span = waiting[1] > info.waitlistCursor ? waiting[1] - info.waitlistCursor : 0n;
      const before = span
        ? await publicClient.readContract({
            address,
            abi: housefulAbi,
            functionName: "getWaitlist",
            args: [id, info.waitlistCursor, span],
          })
        : [];
      const ahead = before.filter((w) => w.active).length;
      return { kind: "waiting", event, position: Number(waiting[1]), ahead, cancelled: info.cancelled } satisfies Holding;
    }),
  );
  return rows.filter((r): r is Holding => r !== null).sort((a, b) => a.event.startsAt - b.event.startsAt);
}

export function TicketWallet({ events }: { events: WalletEvent[] }) {
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { address } = deviceWallet();
    setWallet(address);
    setHoldings(await readHoldings(events, address));
  }, [events]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 6000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  return (
    <div>
      <AnimatePresence>
        {notice ? (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-8 rounded-[4px] bg-admit px-5 py-4 text-paper"
          >
            {notice}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {holdings === null ? (
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Reading your tickets from the contract</p>
      ) : holdings.length === 0 ? (
        <div className="max-w-[46ch]">
          <p className="font-display text-4xl font-black uppercase leading-none">Nothing booked yet</p>
          <p className="mt-3 text-ink-soft">
            Tickets you buy on this phone live here, with the code you show at the door.
          </p>
          <Link href="/mumbai" className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-semibold text-paper">
            See what is on in Mumbai <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <ul className="space-y-14">
          {holdings.map((h) =>
            h.kind === "ticket" ? (
              <HeldTicket
                key={`t-${h.event.chainEventId}-${h.ticketId}-${h.generation}`}
                holding={h}
                wallet={wallet!}
                onChanged={(message) => {
                  setNotice(message);
                  refresh();
                }}
              />
            ) : (
              <WaitingSpot
                key={`w-${h.event.chainEventId}-${h.position}`}
                holding={h}
                onChanged={(message) => {
                  setNotice(message);
                  refresh();
                }}
              />
            ),
          )}
        </ul>
      )}

      {wallet ? (
        <p className="mt-16 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          This phone&apos;s wallet {shortHex(wallet)}
        </p>
      ) : null}
    </div>
  );
}

function HeldTicket({
  holding,
  wallet,
  onChanged,
}: {
  holding: Extract<Holding, { kind: "ticket" }>;
  wallet: `0x${string}`;
  onChanged: (message: string) => void;
}) {
  const { event, ticketId } = holding;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torn, setTorn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handBack() {
    setBusy(true);
    setError(null);
    try {
      const res = await surrenderTicket(deviceSigner(), event.chainEventId, ticketId);
      playCue("handback");
      setResult(
        res.to === "0x0000000000000000000000000000000000000000"
          ? `Refunded ${formatUsdt(event.priceUsd)}. Nobody was waiting, so the seat is back on sale.`
          : `Refunded ${formatUsdt(event.priceUsd)}. Your seat went to ${shortHex(res.to)}, next in line, in the same transaction.`,
      );
      setTorn(true);
    } catch (err) {
      setError(explainError(err));
      setBusy(false);
    }
  }

  async function refund() {
    setBusy(true);
    setError(null);
    try {
      await claimRefund(deviceSigner(), event.chainEventId);
      setResult(`${event.title} was cancelled. ${formatUsdt(event.priceUsd)} is back in this phone's wallet.`);
      setTorn(true);
    } catch (err) {
      setError(explainError(err));
      setBusy(false);
    }
  }

  async function bind() {
    setBusy(true);
    try {
      await bindDoorKey(deviceSigner(), event.chainEventId, ticketId);
      onChanged("This phone is now the key for your ticket.");
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <TicketStub
        tone="ink"
        torn={torn}
        onTornComplete={() => result && onChanged(result)}
        eyebrow={`Admit one · ${formatLongDate(event.startsAt, event.timezone)}`}
        title={event.title}
        lines={[
          { label: "Venue", value: event.venue },
          { label: "Doors", value: formatTime(event.doorsAt, event.timezone) },
          { label: "Paid", value: formatUsdt(event.priceUsd) },
          { label: "Seat", value: seatCaption(holding.seat) },
        ]}
        serial={`HSF-${event.chainEventId}-${ticketId} · GEN ${holding.generation}`}
        stub={
          holding.cancelled ? (
            <div className="flex max-w-[17ch] flex-col items-center gap-3 text-center">
              <p className="font-display text-2xl font-extrabold uppercase leading-none text-stamp">Cancelled</p>
              <button
                type="button"
                onClick={refund}
                disabled={busy || torn}
                className="rounded-full bg-marigold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {busy ? "Refunding" : `Claim ${formatUsdt(event.priceUsd)}`}
              </button>
              {error ? <p className="text-xs text-paper/70">{error}</p> : null}
            </div>
          ) : holding.door === "here" ? (
            <DoorCode chainEventId={event.chainEventId} ticketId={ticketId} wallet={wallet} />
          ) : (
            <div className="flex max-w-[17ch] flex-col items-center gap-3 text-center">
              <p className="text-xs text-paper/70">
                {holding.door === "none"
                  ? "The door code needs this phone's key on the ticket first."
                  : "The door key on this ticket belongs to another phone."}
              </p>
              <button
                type="button"
                onClick={bind}
                disabled={busy}
                className="rounded-full bg-marigold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {busy ? "Binding" : holding.door === "none" ? "Bind this phone" : "Move it to this phone"}
              </button>
            </div>
          )
        }
      />

      <div className="mt-4 max-w-[640px]">
        {holding.cancelled ? null : !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft underline decoration-ink/30 underline-offset-4"
          >
            <ReturnIcon size={16} /> Cannot make it? Resell at face value
          </button>
        ) : torn ? null : (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[4px] bg-paper-deep p-5">
            <p className="font-semibold">Resell at face value for {event.title}?</p>
            <p className="mt-1 text-sm text-ink-soft">
              You get {formatUsdt(event.priceUsd)} back now. If someone is waiting, the seat becomes theirs in the same
              transaction. This cannot be undone.
            </p>
            {error ? <p className="mt-3 text-sm font-medium text-reject">{error}</p> : null}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handBack}
                disabled={busy}
                className="rounded-full bg-stamp px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
              >
                {busy ? "Reselling" : `Resell for ${formatUsdt(event.priceUsd)}`}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="px-3 text-sm font-medium">
                Keep it
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </li>
  );
}

function WaitingSpot({
  holding,
  onChanged,
}: {
  holding: Extract<Holding, { kind: "waiting" }>;
  onChanged: (message: string) => void;
}) {
  const { event, position, ahead } = holding;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    try {
      if (holding.cancelled) await claimRefund(deviceSigner(), event.chainEventId);
      else await leaveWaitlist(deviceSigner(), event.chainEventId, position);
      onChanged(`You left the waitlist for ${event.title}. ${formatUsdt(event.priceUsd)} is back in your wallet.`);
    } catch (err) {
      setError(explainError(err));
      setBusy(false);
    }
  }

  return (
    <li className="max-w-[640px] rounded-[4px] border border-ink/15 p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Waitlist · {formatLongDate(event.startsAt, event.timezone)}
      </p>
      <div className="mt-2 flex items-end justify-between gap-6">
        <h3 className="font-display text-4xl font-black uppercase leading-[0.9]">{event.title}</h3>
        <div className="text-right">
          <SplitFlap value={String(ahead).padStart(2, "0")} className="text-3xl" />
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">ahead of you</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        {formatUsdt(event.priceUsd)} is held by the contract. The moment someone ahead of you gets a seat and the next
        one comes back, it is yours with no action needed.
      </p>
      {error ? <p className="mt-3 text-sm font-medium text-reject">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-5 text-sm font-medium">
        <Link href={`/e/${event.slug}/waitlist`} className="underline underline-offset-4">
          See the public line
        </Link>
        <button type="button" onClick={leave} disabled={busy} className="text-ink-soft underline underline-offset-4">
          {busy ? "Leaving" : holding.cancelled ? `Show cancelled. Claim ${formatUsdt(event.priceUsd)}` : "Leave and get a refund"}
        </button>
      </div>
    </li>
  );
}
