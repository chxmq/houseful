"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Assurance } from "@/lib/assurance";
import { assuranceCopy } from "@/lib/assurance";
import { explorerTx } from "@/lib/chain";
import { formatUsdt, formatLongDate } from "@/lib/format";
import { seatCaption, type SeatId } from "@/lib/seat-layout";
import { paySigner, preferPayWallet } from "@/lib/pay-signer";
import {
  assertFundsForTicket,
  buyTicket,
  canRetryWithSameAttestation,
  claimReturnedSeat,
  explainError,
  joinWaitlist,
  returnedSeat,
} from "@/lib/ticket-actions";
import { playCue } from "@/lib/sounds";
import { useEventChain } from "@/lib/use-event-chain";
import { ArrowRight, QueueIcon } from "./icons";
import { SplitFlap } from "./motion/split-flap";
import { TicketMinting, type MintStep } from "./motion/ticket-minting";
import { TicketPrint } from "./motion/ticket-print";
import { PayWalletSheet, type PayWalletOption } from "./pay-wallet-sheet";
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
  timezone: string;
  venue: string;
  assurance: Assurance;
};

type Phase =
  | { name: "idle" }
  | { name: "booking"; step: MintStep; done: MintStep[] }
  | { name: "bought"; ticketId: number; seat: number; hash: string }
  | { name: "joined"; position: number; hash: string }
  | {
      name: "failed";
      failure: VerifyFailure | { kind: "chain"; message: string };
      attestation?: Attestation;
    };

export function TicketPanel({ event }: { event: TicketPanelEvent }) {
  const [payWallet, setPayWallet] = useState<`0x${string}` | null>(null);
  const [pickWallet, setPickWallet] = useState(false);
  const [runVerify, setRunVerify] = useState(false);
  const { state, error, refresh } = useEventChain(event.chainEventId, 4000, payWallet);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [seat, setSeat] = useState<SeatId | null>(event.seated ? null : null);
  const [qty] = useState(1); // one World ID → one ticket; host capacity is the inventory limit
  const [fundError, setFundError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const locked = phase.name === "booking" || pickWallet || runVerify;

  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);

  const bookingStep = phase.name === "booking" ? phase.step : null;
  useEffect(() => {
    if (!bookingStep) return;
    playCue(bookingStep === "verify" ? "verify" : "step");
  }, [bookingStep]);

  const seated = state?.seated ?? event.seated;
  useEffect(() => {
    // Seated shows must not keep a GA seat 0 from a stale render.
    if (seated && seat === 0) setSeat(null);
  }, [seated, seat]);

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
  const mode = !state ? null : state.available > 0 ? (state.returned > 0 && state.available === state.returned ? "claim" : "buy") : "join";
  const seatReady = mode === "join" || seat !== null;
  const view: Phase = phase.name === "joined" && state?.mine.ticketId != null ? { name: "idle" } : phase;

  function startBooking() {
    if (locked || inFlight.current) return;
    if (mode !== "join" && seated && (seat == null || seat <= 0)) {
      playCue("reject");
      setFundError("Pick a seat first.");
      return;
    }
    playCue("tap");
    setFundError(null);
    setPickWallet(true);
  }

  async function onWalletChosen(wallet: PayWalletOption) {
    if (inFlight.current) return;
    playCue("tap");
    setFundError(null);
    setPickWallet(false);
    setPhase({ name: "booking", step: "pay", done: [] });
    try {
      await preferPayWallet(wallet.address, wallet.kind);
      setPayWallet(wallet.address);
      const signer = await paySigner(wallet.address);
      await assertFundsForTicket(signer, faceValue);
      setPhase({ name: "booking", step: "verify", done: [] });
      setRunVerify(true);
      void refresh();
    } catch (err) {
      playCue("reject");
      setRunVerify(false);
      setPhase({
        name: "failed",
        failure: { kind: "chain", message: explainError(err) },
      });
    }
  }

  async function onVerified(att: Attestation) {
    if (inFlight.current) return;
    inFlight.current = true;
    const chainId = event.chainEventId!;
    setRunVerify(false);
    setPhase({ name: "booking", step: "pay", done: ["verify"] });
    try {
      const signer = await paySigner(payWallet ?? state?.wallet);
      if (mode === "join") {
        // Demo path: always ETH → USDT via Uniswap so the receipt shows a real swap on-chain.
        const res = await joinWaitlist(signer, chainId, faceValue, att, "eth");
        playCue("joined");
        setPhase({ name: "joined", position: res.position, hash: res.hash });
      } else {
        const chosen = seat ?? 0;
        const returned = mode === "claim" ? await returnedSeat(chainId) : null;
        setPhase({ name: "booking", step: "bind", done: ["verify", "pay"] });
        const res =
          returned != null
            ? await claimReturnedSeat(signer, chainId, returned, faceValue, att, "eth")
            : await buyTicket(signer, chainId, chosen, faceValue, att, "eth");
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
      playCue("reject");
      const message = explainError(err);
      if (/Seat .+ was just taken/i.test(message)) setSeat(null);
      setPhase({
        name: "failed",
        failure: { kind: "chain", message },
        attestation: canRetryWithSameAttestation(err) ? att : undefined,
      });
    } finally {
      inFlight.current = false;
    }
  }

  function onVerifyFailed(failure: VerifyFailure) {
    playCue("reject");
    setRunVerify(false);
    setPickWallet(false);
    setPhase({ name: "failed", failure });
    inFlight.current = false;
  }

  function tryAgain() {
    if (phase.name !== "failed") return;
    if (/Seat .+ was just taken/i.test(phase.failure.message)) setSeat(null);
    if (phase.attestation) {
      setPhase({ name: "booking", step: "pay", done: ["verify"] });
      void onVerified(phase.attestation);
      return;
    }
    setRunVerify(false);
    setPickWallet(false);
    setPhase({ name: "idle" });
  }

  function cancelWalletPick() {
    if (phase.name === "booking") return;
    playCue("tap");
    setPickWallet(false);
  }

  return (
    <div className="relative" aria-busy={locked}>
      {locked ? (
        <div
          className="fixed inset-0 z-40 bg-ink/55 backdrop-blur-[1px]"
          aria-hidden
        />
      ) : null}

      <div className={`relative ${locked ? "z-50" : ""}`}>
        <div className={locked && view.name === "idle" ? "pointer-events-none select-none opacity-40" : undefined}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">From</p>
              <p className="mt-1 font-display text-[clamp(2.75rem,8vw,4.25rem)] font-black leading-[0.9] tracking-tight">
                {formatUsdt(event.priceUsd)}
              </p>
            </div>
            {state && !state.cancelled ? (
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
            ) : state?.cancelled ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stamp">Cancelled</p>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {error ? "Offline" : "Checking seats"}
              </p>
            )}
          </div>

        </div>

        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            {view.name === "booking" ? (
              <motion.div
                key="booking"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-[6px] bg-paper p-1 shadow-[0_28px_60px_-32px_rgba(20,16,12,0.65)]"
              >
                <TicketMinting
                  done={view.done}
                  current={view.step}
                  title={event.title}
                  priceLabel={formatUsdt(event.priceUsd)}
                  seatLabel={mode === "join" ? "Waitlist" : seat != null ? seatCaption(seat) : undefined}
                  kind={mode === "join" ? "join" : "buy"}
                />
                {runVerify ? (
                  <VerifyHuman
                    key={`verify-${payWallet ?? state?.wallet}`}
                    eventId={event.id}
                    wallet={(payWallet ?? state!.wallet) as `0x${string}`}
                    purpose={mode === "join" ? "join" : mode === "claim" ? "claim" : "buy"}
                    assurance={event.assurance}
                    label="Confirm"
                    hideButton
                    autoStart
                    onVerified={onVerified}
                    onFailed={onVerifyFailed}
                  />
                ) : null}
                <p className="px-4 pb-4 text-center text-sm text-ink-soft">Stay on this screen. Booking is locked until this finishes.</p>
              </motion.div>
            ) : null}

            {view.name === "idle" && !state ? (
              <motion.div key="loading" className="rounded-[4px] bg-paper-deep/80 px-4 py-4 text-sm text-ink-soft" role="status">
                {error
                  ? "Could not reach the contract. Check your network, then refresh."
                  : event.status === "sold_out"
                    ? "Checking the waitlist on-chain…"
                    : "Checking seats on-chain…"}
              </motion.div>
            ) : null}

            {view.name === "idle" && state ? (
              <motion.div key="idle" exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {state.cancelled ? (
                  state.mine.ticketId != null ? (
                    <p className="rounded-[4px] bg-paper-deep p-5 text-sm">
                      This show was cancelled.{" "}
                      <Link href="/tickets" className="font-semibold underline underline-offset-4">
                        Claim your refund
                      </Link>{" "}
                      from your tickets.
                    </p>
                  ) : (
                    <p className="rounded-[4px] bg-paper-deep p-5 text-sm">This show was cancelled. Sales are closed.</p>
                  )
                ) : state.mine.ticketId != null ? (
                  <Link
                    href="/tickets"
                    className="flex items-center justify-between rounded-full bg-admit px-6 py-4 font-semibold text-paper"
                  >
                    You have a ticket for this show <ArrowRight />
                  </Link>
                ) : state.mine.waitlistPosition != null ? (
                  <WaitlistSpot position={state.mine.waitlistPosition} slug={event.id} />
                ) : (
                  <div className={locked ? "pointer-events-none select-none opacity-40" : undefined}>
                    {mode === "join" ? (
                      <p className="mb-5 rounded-[4px] border border-stamp/30 bg-stamp/5 px-4 py-3 text-sm text-ink-soft">
                        Sold out. Join the public waitlist at face value. When someone hands a seat back, the first
                        person still waiting gets it in the same transaction.{" "}
                        <Link href={`/e/${event.id}/waitlist`} className="font-medium text-stamp underline underline-offset-4">
                          See the line
                        </Link>
                      </p>
                    ) : (
                      <div className="mb-6">
                        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">1 · Choose seat</p>
                        <SeatMap
                          chainEventId={event.chainEventId!}
                          capacity={state.capacity}
                          seated={seated}
                          value={seat}
                          onChange={(next) => {
                            setFundError(null);
                            setSeat(next);
                          }}
                          disabled={locked}
                        />
                      </div>
                    )}

                    {seatReady ? (
                      <>
                        <div className="mb-5 rounded-[4px] border border-ink/15 p-4">
                          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                            {mode === "join" ? "1 · Waitlist order" : "2 · Your order"}
                          </p>
                          <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-ink-soft">{mode === "join" ? "Place" : "Tickets"}</dt>
                              <dd className="font-semibold">
                                {qty} <span className="font-normal text-muted">(max 1 per person)</span>
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-ink-soft">{mode === "join" ? "People in line" : "Host capacity"}</dt>
                              <dd className="font-semibold">
                                {mode === "join"
                                  ? `${state.waitlistActive} waiting`
                                  : `${state.available} left of ${state.capacity}`}
                              </dd>
                            </div>
                            {mode !== "join" ? (
                              <div className="flex justify-between gap-4">
                                <dt className="text-ink-soft">Seat</dt>
                                <dd className="font-semibold">{seat != null ? seatCaption(seat) : "—"}</dd>
                              </div>
                            ) : null}
                            <div className="flex justify-between gap-4">
                              <dt className="text-ink-soft">Face price held</dt>
                              <dd className="font-semibold">{formatUsdt(event.priceUsd)}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-ink-soft">You pay</dt>
                              <dd className="font-semibold">{formatUsdt(event.priceUsd)}</dd>
                            </div>
                          </dl>
                        </div>

                        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                          {mode === "join" ? "2 · Pay & join" : "3 · Pay"}
                        </p>
                        <VerifyHuman
                          eventId={event.id}
                          wallet={(payWallet ?? state.wallet) as `0x${string}`}
                          purpose={mode === "join" ? "join" : mode === "claim" ? "claim" : "buy"}
                          assurance={event.assurance}
                          label={
                            mode === "join"
                              ? `Join waitlist · ${formatUsdt(event.priceUsd)}`
                              : mode === "claim"
                                ? `Take returned seat · ${formatUsdt(event.priceUsd)}`
                                : `Buy ${qty} · ${formatUsdt(event.priceUsd)}`
                          }
                          onRequestStart={startBooking}
                          onVerified={onVerified}
                          onFailed={onVerifyFailed}
                        />
                        {fundError ? <p className="mt-3 text-sm font-medium text-reject">{fundError}</p> : null}
                        <p className="mt-3 text-sm text-muted">
                          {mode === "join"
                            ? "Face value is held until you get a seat or leave for a full refund."
                            : "Confirm with World ID, then pay from the wallet you pick."}
                        </p>
                      </>
                    ) : (
                      <p className="rounded-[4px] bg-paper-deep/80 px-4 py-3 text-sm text-ink-soft">
                        {seated ? "Pick a seat above, then you can buy." : "Confirm standing entry above, then you can buy."}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : null}

            {view.name === "bought" ? (
              <motion.div key="bought" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TicketPrint>
                  <TicketStub
                    eyebrow={`Admit one · ${formatLongDate(event.startsAt, event.timezone)}`}
                    title={event.title}
                    lines={[
                      { label: "Venue", value: event.venue },
                      { label: "Paid", value: formatUsdt(event.priceUsd) },
                      { label: "Seat", value: seatCaption(view.seat) },
                      { label: "Ticket", value: `No. ${String(view.ticketId + 1).padStart(4, "0")}` },
                    ]}
                    serial={`HSF-${event.chainEventId}-${view.ticketId}`}
                    stub={<span className="font-display text-4xl font-black uppercase leading-none text-stamp">In</span>}
                  />
                </TicketPrint>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <Link href="/tickets" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-semibold text-paper">
                    Open your ticket <ArrowRight size={18} />
                  </Link>
                  <TxLink hash={view.hash} />
                </div>
              </motion.div>
            ) : null}

            {view.name === "joined" ? (
              <motion.div key="joined" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <WaitlistSpot position={view.position} slug={event.id} fresh />
                <div className="mt-3">
                  <TxLink hash={view.hash} />
                </div>
              </motion.div>
            ) : null}

            {view.name === "failed" ? (
              <motion.div
                key="failed"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: [0, -6, 5, -3, 0] }}
                transition={{ duration: 0.45 }}
                className="rounded-[4px] border-l-[3px] border-stamp bg-paper-deep p-5"
              >
                <p className="font-semibold">{view.failure.message}</p>
                <FailureNext kind={view.failure.kind} assurance={event.assurance} />
                {view.attestation ? (
                  <p className="mt-2 text-sm text-ink-soft">Your verification is still good. Try again continues the payment.</p>
                ) : null}
                <button type="button" onClick={tryAgain} className="mt-4 text-sm font-medium underline underline-offset-4">
                  Try again
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <PayWalletSheet
        open={pickWallet}
        onClose={cancelWalletPick}
        onChoose={(wallet) => {
          void onWalletChosen(wallet);
        }}
      />
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
        you cannot go, resell at face value so the next person gets it.
      </p>
    );
  }
  if (kind === "signin") {
    return (
      <p className="mt-2 text-sm text-ink-soft">
        Sign in with World ID once, then checkout reuses that proof for shows your credential covers.
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
