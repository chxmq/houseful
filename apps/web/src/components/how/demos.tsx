"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { CheckIcon, CrossIcon, PersonCheckIcon, TicketIcon } from "@/components/icons";

export const HOLDER = "Fan A";
export const NEXT = "Fan B";
export const FACE_VALUE = "$18";

const ease = [0.22, 1, 0.36, 1] as const;

function useStill() {
  const reduce = useReducedMotion();
  return <T,>(live: MotionValue<T>, still: T) => (reduce ? still : live);
}

const withheld = ["Name", "Phone number", "Face", "Document number"];

export function IdentityDemo() {
  const reduce = useReducedMotion();

  return (
    <div className="max-w-[540px]">
      <figure>
        <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          What the show receives
        </figcaption>
        <ul className="mt-3 divide-y divide-dashed divide-ink/25 rounded-[4px] bg-paper-deep px-5 font-mono text-[13px]">
          {withheld.map((label, i) => (
            <li key={label} className="flex items-center justify-between gap-4 py-3 text-muted">
              <span className="relative">
                {label}
                <motion.span
                  aria-hidden="true"
                  className="absolute -inset-x-1 top-1/2 h-[2px] origin-left bg-stamp"
                  initial={reduce ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 1 }}
                  transition={{ duration: 0.5, ease, delay: 0.15 + i * 0.14 }}
                />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em]">Not shared</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 py-3 text-ink">
            <span className="font-semibold">Proof for this show</span>
            <span className="flex items-center gap-2">
              {HOLDER}
              <CheckIcon size={16} className="text-admit" />
            </span>
          </li>
        </ul>
      </figure>

      <dl className="mt-10 grid grid-cols-[minmax(0,11rem)_1fr] gap-x-6 gap-y-5 border-t border-ink/20 pt-5">
        <dt className="font-display text-2xl font-extrabold uppercase leading-none">Selfie Check</dt>
        <dd className="text-sm text-ink-soft">The person check requested by most sample shows.</dd>
        <dt className="font-display text-2xl font-extrabold uppercase leading-none text-stamp">Proof of Human</dt>
        <dd className="text-sm text-ink-soft">
          Shows where demand is higher than the seats. A stronger person check from World.
        </dd>
      </dl>
    </div>
  );
}

export function FaceValueDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useStill();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 85%", "center 45%"] });
  const strike = useTransform(p, [0.35, 0.8], [0, 1]);
  const revert = useTransform(p, [0.8, 0.95], [0, 1]);
  const revertY = useTransform(p, [0.8, 0.95], [8, 0]);

  return (
    <div ref={ref} className="max-w-[560px]">
      <p className="font-display text-[clamp(4.5rem,10vw,8rem)] font-black leading-[0.8]">{FACE_VALUE}</p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Face value of ticket 0417. Written once, at listing.
      </p>

      <figure className="mt-8 rounded-[4px] bg-ink p-5 font-mono text-[13px] text-paper">
        <figcaption className="text-[11px] uppercase tracking-[0.16em] text-paper/50">What happens to ticket 0417</figcaption>
        <ol className="mt-4 space-y-4">
          <li className="grid grid-cols-[1fr_auto_3.5rem] gap-4">
            <span>Buy a ticket</span>
            <span>{FACE_VALUE}</span>
            <span className="text-right text-marigold">ok</span>
          </li>
          <li>
            <div className="relative grid grid-cols-[1fr_auto_3.5rem] gap-4 text-paper/75">
              <span className="truncate">Try to resell it</span>
              <span>$90</span>
              <span />
              <motion.span
                aria-hidden="true"
                className="absolute inset-x-[-4px] top-1/2 h-[2px] origin-left bg-stamp"
                style={{ scaleX: still(strike, 1) }}
              />
            </div>
            <motion.p className="mt-1.5 text-stamp" style={{ opacity: still(revert, 1), y: still(revertY, 0) }}>
              Not allowed: tickets cannot be transferred
            </motion.p>
          </li>
          <li className="grid grid-cols-[1fr_auto_3.5rem] gap-4">
            <span>Return a ticket</span>
            <span>{FACE_VALUE} back</span>
            <span className="text-right text-marigold">ok</span>
          </li>
        </ol>
      </figure>
    </div>
  );
}

const queue = [
  { id: "Fan A", before: "You", after: "Refunded" },
  { id: "Fan B", before: "1st", after: "Holder" },
  { id: "Fan C", before: "2nd", after: "1st" },
  { id: "Fan D", before: "3rd", after: "2nd" },
  { id: "Fan E", before: "4th", after: "3rd" },
];

export function HandBackDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useStill();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 80%", "end 40%"] });
  const x = useTransform(p, [0.2, 0.6], ["0%", "100%"]);
  const lift = useTransform(p, [0.2, 0.4, 0.6], [0, -22, 0]);
  const tilt = useTransform(p, [0.2, 0.4, 0.6], [0, -9, 0]);
  const before = useTransform(p, [0.55, 0.65], [1, 0]);
  const after = useTransform(p, [0.55, 0.65], [0, 1]);
  const tx = useTransform(p, [0.7, 0.85], [0, 1]);

  return (
    <div ref={ref} className="max-w-[580px]">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">The waitlist for ticket 0417</p>
      <div className="relative mt-3 grid grid-cols-5 border-y border-ink/20">
        {queue.map((slot, i) => (
          <div key={slot.id} className={`px-1.5 pb-4 pt-20 sm:px-3 ${i > 0 ? "border-l border-ink/15" : ""}`}>
            <PersonCheckIcon size={22} className={i === 0 ? "text-ink" : "text-ink-soft"} />
            <p className="mt-2 font-mono text-[11px] sm:text-xs">{slot.id}</p>
            <p className="relative mt-1 h-4 font-mono text-[10px] uppercase tracking-[0.12em] sm:text-[11px]">
              <motion.span className="absolute inset-0 text-muted" style={{ opacity: still(before, 0) }}>
                {slot.before}
              </motion.span>
              <motion.span
                className={`absolute inset-0 ${i === 1 ? "text-stamp" : i === 0 ? "text-admit" : "text-muted"}`}
                style={{ opacity: still(after, 1) }}
              >
                {slot.after}
              </motion.span>
            </p>
          </div>
        ))}
        <motion.div
          aria-hidden="true"
          className="absolute left-0 top-4 w-1/5 px-1.5 sm:px-3"
          style={{ x: still(x, "100%"), y: still(lift, 0), rotate: still(tilt, 0) }}
        >
          <div className="flex h-11 items-center justify-center gap-1.5 rounded-[3px] bg-stamp font-mono text-[11px] text-paper">
            <TicketIcon size={16} className="hidden sm:block" />
            0417
          </div>
        </motion.div>
      </div>

      <motion.p
        className="mt-5 rounded-[4px] bg-paper-deep px-4 py-3 font-mono text-[12px] leading-relaxed"
        style={{ opacity: still(tx, 1) }}
      >
        {FACE_VALUE} goes back to Fan A. Fan B gets the seat, using the payment they made when they joined the waitlist.
        <span className="block text-muted">Both happen together.</span>
      </motion.p>
    </div>
  );
}

const refundLog: { call: string; by: string; result: string; ok: boolean | null }[] = [
  { call: "Cancel the show", by: "Host", result: "Show cancelled", ok: null },
  { call: "Ask for a refund", by: "Fan A", result: `${FACE_VALUE} paid`, ok: true },
  { call: "Ask for a refund", by: "Fan B", result: `${FACE_VALUE} paid`, ok: true },
  { call: "Ask for a refund", by: "Fan C, waitlist", result: `${FACE_VALUE} returned`, ok: true },
  { call: "Ask for host payout", by: "Host", result: "Not paid: show cancelled", ok: false },
];

export function RefundDemo() {
  const reduce = useReducedMotion();

  return (
    <figure className="max-w-[580px]">
      <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        The Last Local, cancelled
      </figcaption>
      <ol className="mt-3 divide-y divide-dashed divide-ink/25 rounded-[4px] bg-paper-deep px-5 font-mono text-[12px] sm:text-[13px]">
        {refundLog.map((row, i) => (
          <motion.li
            key={`${row.call}-${row.by}`}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[11rem_1fr_auto]"
            initial={reduce ? false : { opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 1 }}
            transition={{ duration: 0.45, ease, delay: i * 0.18 }}
          >
            <span className={row.ok === false ? "text-muted line-through decoration-stamp decoration-2" : "text-ink"}>
              {row.call}
            </span>
            <span className="order-3 col-span-2 text-muted sm:order-none sm:col-span-1">{row.by}</span>
            <span
              className={`flex items-center justify-end gap-1.5 text-right ${row.ok === false ? "text-stamp" : row.ok ? "text-admit" : "text-ink-soft"}`}
            >
              {row.ok === true ? <CheckIcon size={14} /> : row.ok === false ? <CrossIcon size={14} /> : null}
              {row.result}
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Fans ask for their own refunds. The host does not approve each one.
      </p>
    </figure>
  );
}
