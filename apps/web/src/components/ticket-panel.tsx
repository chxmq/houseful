"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type { Assurance } from "@/lib/assurance";
import { assuranceCopy } from "@/lib/assurance";
import { explorerTx } from "@/lib/chain";
import { formatUsdt, formatLongDate } from "@/lib/format";
import { seatCaption, type SeatId } from "@/lib/seat-layout";
import {
  buyTicket,
  claimReturnedSeat,
  deviceSigner,
  ethPaymentsEnabled,
  explainError,
  joinWaitlist,
  returnedSeat,
  type PayMethod,
} from "@/lib/ticket-actions";
import { playCue } from "@/lib/sounds";
import { useEventChain } from "@/lib/use-event-chain";
import { ArrowRight, QueueIcon } from "./icons";
import { SplitFlap } from "./motion/split-flap";
import { TicketMinting } from "./motion/ticket-minting";
import { TicketPrint } from "./motion/ticket-print";
import { SeatMap } from "./seatmap/seat-map";
import { TicketStub } from "./ticket-stub";
import { VerifyHuman, type Attestation, type VerifyFailure } from "./verify-human";

export type TicketPanelEvent = {
  id: string;
  title: string;
  chainEventId: number | null;
  priceUsd: number;
  faceValueUnits: string;
  capacity: number;
  seated: boolean;
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
  | { name: "bought"; ticketId: number; seat: number; hash: string }
  | { name: "joined"; position: number; hash: string }
  | { name: "failed"; failure: VerifyFailure | { kind: "chain"; message: string } };

export function TicketPanel({ event }: { event: TicketPanelEvent }) {
  const { state, error, refresh } = useEventChain(event.chainEventId);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [seat, setSeat] = useState<SeatId | null>(event.seated ? null : 0);
  const [pay, setPay] = useState<PayMethod>("usdt");
  const ethOk = ethPaymentsEnabled();

  if (event.chainEventId == null) {
    return (
      <div>
        <p className="font-display text-4xl font-black uppercase leading-none">{formatUsdt(event.priceUsd)}</p>
        <p className="mt-3 max-w-[42ch] text-ink-soft">
          Listed so you can plan. Booking opens here when the host moves the sale over.
        </p>
      </div>
    );
  }

  if (event.status === "announced") {
    return (
      <div>
        <p className="font-display text-4xl font-black uppercase leading-none">On sale soon</p>
        <p className="mt-3 text-ink-soft">Price locked at {formatUsdt(event.priceUsd)}.</p>
      </div>
    );
  }

  const faceValue = BigInt(event.faceValueUnits);
  const seated = state?.seated ?? event.seated;
  const mode = !state ? null : state.available > 0 ? (state.returned > 0 && state.available === state.returned ? "claim" : "buy") : "join";
  const credential = assuranceCopy[event.assurance];
  const seatReady = mode === "join" || seat !== null;

  async function onVerified(att: Attestation) {
    const chainId = event.chainEventId!;
    const signer = deviceSigner();
    setPhase({ name: "working", done: ["verify"], current: "pay" });
    try {
      playCue("verify");
      if (mode === "join") {
        const res = await joinWaitlist(signer, chainId, faceValue, att, pay);
        playCue("joined");
        setPhase({ name: "joined", position: res.position, hash: res.hash });
      } else {
        const chosen = seat ?? 0;
        const returned = mode === "claim" ? await returnedSeat(chainId) : null;
        const progress = () => setPhase({ name: "working", done: ["verify", "pay"], current: "bind" });
        const res =
          returned != null
            ? await claimReturnedSeat(signer, chainId, returned, faceValue, att, pay).finally(progress)
            : await buyTicket(signer, chainId, chosen, faceValue, att, pay).finally(progress);
        playCue("bought");
        setPhase({
          name: "bought",
          ticketId: res.ticketId,
          seat: "seat" in res && typeof res.seat === "number" ? res.seat : chosen,
          hash: res.hash,
        });
      }
      refresh();
    } catch (err) {
      setPhase({ name: "failed", failure: { kind: "chain", message: explainError(err) } });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">From</p>
          <p className="mt-1 font-display text-[clamp(2.75rem,8vw,4.25rem)] font-black leading-[0.9] tracking-tight">
            {formatUsdt(event.priceUsd)}
          </p>
        </div>
        {state ? (
          state.available > 0 ? (
            <div className="text-right">
              <SplitFlap value={String(state.available).padStart(3, "0")} className="text-3xl" />
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">left</p>
            </div>
          ) : (
            <div className="text-right">
              <SplitFlap value={String(state.waitlistActive).padStart(3, "0")} className="text-3xl" />
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stamp">in line</p>
            </div>
          )
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {error ? "Offline" : "Checking seats"}
          </p>
        )}
      </div>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>Fixed price</span>
        <span className="text-ink/25" aria-hidden>
          ·
        </span>
        <span>One per person</span>
        <span className="text-ink/25" aria-hidden>
          ·
        </span>
        <span>Full refund if cancelled</span>
      </p>

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
                <p className="rounded-[4px] bg-paper-deep p-5 text-sm">
                  This show was cancelled. Claim your refund from{" "}
                  <Link href="/tickets" className="font-semibold underline underline-offset-4">
                    your tickets
                  </Link>
                  .
                </p>
              ) : (
                <>
                  {mode !== "join" ? (
                    <div className="mb-5">
                      <SeatMap
                        chainEventId={event.chainEventId!}
                        capacity={state.capacity}
                        seated={seated}
                        value={seat}
                        onChange={setSeat}
                      />
                    </div>
                  ) : null}

                  {ethOk ? (
                    <div className="mb-4 flex flex-wrap gap-2">
                      <PayChoice selected={pay === "usdt"} onClick={() => setPay("usdt")} label="Pay now" />
                      <PayChoice selected={pay === "eth"} onClick={() => setPay("eth")} label="Pay with Ethereum" />
                    </div>
                  ) : null}

                  {seatReady ? (
                    <>
                      <VerifyHuman
                        eventId={event.id}
                        wallet={state.wallet}
                        purpose={mode === "join" ? "join" : mode === "claim" ? "claim" : "buy"}
                        assurance={event.assurance}
                        label={
                          mode === "join"
                            ? "Join the waitlist"
                            : mode === "claim"
                              ? "Take a returned seat"
                              : seated && seat
                                ? `Get ${seatCaption(seat)}`
                                : "Get tickets"
                        }
                        onVerified={onVerified}
                        onFailed={(failure) => setPhase({ name: "failed", failure })}
                      />
                      <p className="mt-3 text-sm text-muted">
                        {mode === "join"
                          ? `Locks ${formatUsdt(event.priceUsd)}. Leave any time for a full refund.`
                          : `Checked with ${credential.label}. No World App? Use the simulator in the next step.`}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-[4px] bg-paper-deep/80 px-4 py-3 text-sm text-ink-soft">
                      Pick a seat to continue.
                    </p>
                  )}
                </>
              )}
            </motion.div>
          ) : null}

          {phase.name === "working" ? (
            <motion.div key="working" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TicketMinting
                done={phase.done}
                current={phase.current}
                title={event.title}
                priceLabel={formatUsdt(event.priceUsd)}
                seatLabel={seat != null ? seatCaption(seat) : undefined}
              />
            </motion.div>
          ) : null}

          {phase.name === "bought" ? (
            <motion.div key="bought" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <TicketPrint>
                <TicketStub
                  eyebrow={`Admit one · ${formatLongDate(event.startsAt)}`}
                  title={event.title}
                  lines={[
                    { label: "Venue", value: event.venue },
                    { label: "Paid", value: formatUsdt(event.priceUsd) },
                    { label: "Seat", value: seatCaption(phase.seat) },
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

function PayChoice({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        selected ? "bg-ink text-paper" : "border border-ink/20 text-ink"
      }`}
    >
      {label}
    </button>
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

