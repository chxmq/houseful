"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type { Assurance } from "@/lib/assurance";
import { assuranceCopy } from "@/lib/assurance";
import { explorerTx } from "@/lib/chain";
import { formatEth, formatInr, formatLongDate } from "@/lib/format";
import {
  buyTicket,
  claimReturnedSeat,
  explainError,
  joinWaitlist,
  returnedSeat,
} from "@/lib/ticket-actions";
import { useEventChain } from "@/lib/use-event-chain";
import { ArrowRight, CheckIcon, QueueIcon } from "./icons";
import { SplitFlap } from "./motion/split-flap";
import { TicketPrint } from "./motion/ticket-print";
import { TicketStub } from "./ticket-stub";
import { VerifyHuman, type Attestation, type VerifyFailure } from "./verify-human";

export type TicketPanelEvent = {
  id: string;
  title: string;
  chainEventId: number | null;
  priceInr: number;
  faceValueWei: string;
  capacity: number;
  sold: number;
  status: string;
  startsAt: number;
  venue: string;
  assurance: Assurance;
};

type Step = "verify" | "pay" | "bind";
type Phase =
  | { name: "idle" }
  | { name: "working"; done: Step[]; current: Step }
  | { name: "bought"; ticketId: number; hash: string }
  | { name: "joined"; position: number; hash: string }
  | { name: "failed"; failure: VerifyFailure | { kind: "chain"; message: string } };

const stepLabel: Record<Step, string> = {
  verify: "Checked you are one person",
  pay: "Paid face value into the contract",
  bind: "Bound this phone to the ticket for the door",
};

export function TicketPanel({ event }: { event: TicketPanelEvent }) {
  const { state, error, refresh } = useEventChain(event.chainEventId);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  if (event.chainEventId == null) {
    return (
      <div className="mt-8 rounded-[4px] bg-paper-deep p-6">
        <p className="font-display text-3xl font-extrabold uppercase">{formatInr(event.priceInr)}</p>
        <p className="mt-2 max-w-[48ch] text-ink-soft">
          Houseful is selling tickets in Mumbai first. This show is listed so you can plan, and booking opens here when
          the host moves their sale over.
        </p>
      </div>
    );
  }

  if (event.status === "announced") {
    return (
      <div className="mt-8 rounded-[4px] bg-paper-deep p-6">
        <p className="font-display text-3xl font-extrabold uppercase">On sale soon</p>
        <p className="mt-2 text-ink-soft">The price is set at {formatInr(event.priceInr)} and will not change.</p>
      </div>
    );
  }

  const faceValue = BigInt(event.faceValueWei);
  const mode = !state ? null : state.available > 0 ? (state.returned > 0 && state.available === state.returned ? "claim" : "buy") : "join";
  const credential = assuranceCopy[event.assurance];

  async function onVerified(att: Attestation) {
    const chainId = event.chainEventId!;
    setPhase({ name: "working", done: ["verify"], current: "pay" });
    try {
      if (mode === "join") {
        const res = await joinWaitlist(chainId, faceValue, att);
        setPhase({ name: "joined", position: res.position, hash: res.hash });
      } else {
        const returned = mode === "claim" ? await returnedSeat(chainId) : null;
        const progress = () => setPhase({ name: "working", done: ["verify", "pay"], current: "bind" });
        const res =
          returned != null
            ? await claimReturnedSeat(chainId, returned, faceValue, att).finally(progress)
            : await buyTicket(chainId, faceValue, att).finally(progress);
        setPhase({ name: "bought", ticketId: res.ticketId, hash: res.hash });
      }
      refresh();
    } catch (err) {
      setPhase({ name: "failed", failure: { kind: "chain", message: explainError(err) } });
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-display text-[56px] font-black leading-none">{formatInr(event.priceInr)}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Paid as {formatEth(faceValue)} on testnet · same price for everyone
          </p>
        </div>
        {state ? (
          state.available > 0 ? (
            <div className="text-right">
              <SplitFlap value={String(state.available).padStart(3, "0")} className="text-3xl" />
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">seats left</p>
            </div>
          ) : (
            <div className="text-right">
              <SplitFlap value={String(state.waitlistActive).padStart(3, "0")} className="text-3xl" />
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stamp">waiting for a seat</p>
            </div>
          )
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {error ? "Could not reach the ticket contract" : "Reading the contract"}
          </p>
        )}
      </div>

      <div className="mt-6">
        <AnimatePresence mode="wait" initial={false}>
          {phase.name === "idle" && state ? (
            <motion.div key="idle" exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {state.mine.ticketId != null ? (
                <Link
                  href="/tickets"
                  className="flex items-center justify-between rounded-full bg-admit px-6 py-4 font-semibold text-paper"
                >
                  You have a ticket for this show <ArrowRight />
                </Link>
              ) : state.mine.waitlistPosition != null ? (
                <WaitlistSpot position={state.mine.waitlistPosition} slug={event.id} />
              ) : state.cancelled ? (
                <p className="rounded-[4px] bg-paper-deep p-5">
                  This show was cancelled. If you hold a ticket or a waitlist place, claim your full refund from{" "}
                  <Link href="/tickets" className="font-semibold underline underline-offset-4">
                    your tickets
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <VerifyHuman
                    eventId={event.id}
                    wallet={state.wallet}
                    purpose={mode === "join" ? "join" : mode === "claim" ? "claim" : "buy"}
                    assurance={event.assurance}
                    label={
                      mode === "join"
                        ? `Verify and join the waitlist`
                        : mode === "claim"
                          ? "Verify and take a returned seat"
                          : "Verify and buy"
                    }
                    onVerified={onVerified}
                    onFailed={(failure) => setPhase({ name: "failed", failure })}
                  />
                  <p className="mt-3 text-sm text-muted">
                    {mode === "join"
                      ? `You lock ${formatInr(event.priceInr)} now. If a seat comes back, it is yours automatically. Leave any time for a full refund.`
                      : `World ID ${credential.label} keeps it to one ticket per person. We never see who you are.`}
                  </p>
                </>
              )}
            </motion.div>
          ) : null}

          {phase.name === "working" ? (
            <motion.ol key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {(["verify", "pay", "bind"] as Step[]).map((s) => {
                const done = phase.done.includes(s);
                const active = phase.current === s;
                return (
                  <li key={s} className={`flex items-center gap-3 ${done || active ? "text-ink" : "text-muted"}`}>
                    <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-admit text-paper" : "border border-ink/25"}`}>
                      {done ? <CheckIcon size={16} /> : active ? <Spinner /> : null}
                    </span>
                    {stepLabel[s]}
                  </li>
                );
              })}
            </motion.ol>
          ) : null}

          {phase.name === "bought" ? (
            <motion.div key="bought" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <TicketPrint>
                <TicketStub
                  eyebrow={`Admit one · ${formatLongDate(event.startsAt)}`}
                  title={event.title}
                  lines={[
                    { label: "Venue", value: event.venue },
                    { label: "Paid", value: formatInr(event.priceInr) },
                    { label: "Holder", value: "Verified person" },
                    { label: "Ticket", value: `No. ${String(phase.ticketId + 1).padStart(4, "0")}` },
                  ]}
                  serial={`HSF-${event.chainEventId}-${phase.ticketId}`}
                  stub={<span className="font-display text-4xl font-black uppercase leading-none text-stamp">In</span>}
                />
              </TicketPrint>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Link href="/tickets" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-semibold text-paper">
                  Open your ticket <ArrowRight size={18} />
                </Link>
                <TxLink hash={phase.hash} />
              </div>
            </motion.div>
          ) : null}

          {phase.name === "joined" ? (
            <motion.div key="joined" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <WaitlistSpot position={phase.position} slug={event.id} fresh />
              <div className="mt-3">
                <TxLink hash={phase.hash} />
              </div>
            </motion.div>
          ) : null}

          {phase.name === "failed" ? (
            <motion.div
              key="failed"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: [0, -6, 5, -3, 0] }}
              transition={{ duration: 0.45 }}
              className="rounded-[4px] border-l-[3px] border-stamp bg-paper-deep p-5"
            >
              <p className="font-semibold">{phase.failure.message}</p>
              <FailureNext kind={phase.failure.kind} assurance={event.assurance} />
              <button type="button" onClick={() => setPhase({ name: "idle" })} className="mt-4 text-sm font-medium underline underline-offset-4">
                Try again
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FailureNext({ kind, assurance }: { kind: string; assurance: Assurance }) {
  if (kind === "no-credential") {
    return (
      <p className="mt-2 text-sm text-ink-soft">
        This show asks for {assuranceCopy[assurance].label}. You can add it in World App in a few minutes, then come back.
        Your place is not lost: nothing was charged.
      </p>
    );
  }
  if (kind === "already-holds") {
    return (
      <p className="mt-2 text-sm text-ink-soft">
        Each person gets one ticket or one waitlist place per show. If it is on another phone, open Houseful there. If
        you cannot go, hand it back so the next person gets it.
      </p>
    );
  }
  return null;
}

function WaitlistSpot({ position, slug, fresh = false }: { position: number; slug: string; fresh?: boolean }) {
  return (
    <div className="rounded-[4px] bg-ink p-6 text-paper">
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60">
            {fresh ? "You are on the waitlist" : "Your place in line"}
          </p>
          <p className="mt-2 text-sm text-paper/75">When someone hands a seat back, the first person in line gets it instantly.</p>
        </div>
        <SplitFlap value={`#${String(position + 1).padStart(3, "0")}`} className="text-4xl" cellClassName="bg-paper text-ink" />
      </div>
      <Link href={`/e/${slug}/waitlist`} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-marigold">
        <QueueIcon size={16} /> See the public line
      </Link>
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  const href = explorerTx(hash);
  const label = `Receipt ${hash.slice(0, 10)}…`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted underline underline-offset-4">
      {label}
    </a>
  ) : (
    <span className="font-mono text-xs text-muted">{label}</span>
  );
}

function Spinner() {
  return (
    <motion.span
      className="block size-3.5 rounded-full border-2 border-ink/20 border-t-ink"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    />
  );
}
