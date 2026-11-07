"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CheckIcon } from "../icons";

export type MintStep = "verify" | "pay" | "bind";
export type MintKind = "buy" | "join";

const labels: Record<MintStep, string> = {
  verify: "Confirming you are one person",
  pay: "Taking payment",
  bind: "Locking the ticket to this wallet",
};

const joinLabels: Record<MintStep, string> = {
  verify: "Confirming you are one person",
  pay: "Holding your place at face value",
  bind: "Confirming your place in line",
};

type TicketMintingProps = {
  done: MintStep[];
  current: MintStep;
  title: string;
  priceLabel: string;
  seatLabel?: string;
  kind?: MintKind;
};

/**
 * Checkout wait state: a ticket feeds from a slot while each step inks in.
 * Reads as a real printer, not a spinner dashboard.
 */
export function TicketMinting({ done, current, title, priceLabel, seatLabel, kind = "buy" }: TicketMintingProps) {
  const reduce = useReducedMotion();
  const order: MintStep[] = kind === "join" ? ["verify", "pay"] : ["verify", "pay", "bind"];
  const stepLabels = kind === "join" ? joinLabels : labels;
  const progress = (done.filter((s) => order.includes(s)).length + (current && order.includes(current) ? 0.55 : 0)) / order.length;

  return (
    <div className="relative" role="status" aria-live="polite" aria-busy="true">
      <p className="sr-only">
        {stepLabels[current]}. {done.filter((s) => order.includes(s)).length} of {order.length} steps done.
      </p>

      <div className="relative z-10 mx-auto h-3.5 max-w-[520px] rounded-full bg-ink shadow-[inset_0_-3px_0_rgba(255,255,255,0.08),0_8px_20px_-12px_rgba(20,17,15,0.5)]">
        <span className="absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-paper/15" />
      </div>

      <div className="-mt-1 overflow-hidden px-2 pb-2 sm:px-4">
        <motion.div
          initial={reduce ? false : { y: "-18%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-[520px]"
        >
          <div className="relative flex overflow-hidden rounded-[14px] bg-paper-deep text-ink shadow-[0_22px_40px_-24px_rgba(20,17,15,0.45)]">
            <div className="min-w-0 flex-1 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {kind === "join" ? "Joining the line" : "Printing ticket"}
                </p>
                <span className="font-mono text-[10px] tabular-nums text-muted">{Math.round(progress * 100)}%</span>
              </div>

              <motion.div
                className="mt-3 h-1 overflow-hidden rounded-full bg-ink/10"
                initial={false}
              >
                <motion.div
                  className="h-full origin-left bg-stamp"
                  initial={false}
                  animate={{ scaleX: Math.max(0.08, progress) }}
                  transition={{ type: "spring", stiffness: 120, damping: 22 }}
                />
              </motion.div>

              <InkLine ready={done.includes("verify") || current === "verify"} delay={0.05} className="mt-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  {kind === "join" ? "One place in line" : "Admit one"}
                </p>
              </InkLine>

              <InkLine ready={done.includes("verify") || current === "verify"} delay={0.12} className="mt-2">
                <h3 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold uppercase leading-[0.9]">
                  {title}
                </h3>
              </InkLine>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <InkLine ready={done.includes("pay") || current === "pay"} delay={0.05}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Paid</p>
                  <p className="mt-0.5 text-sm font-medium">{priceLabel}</p>
                </InkLine>
                <InkLine ready={Boolean(seatLabel) && (done.includes("pay") || current === "pay")} delay={0.1}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Seat</p>
                  <p className="mt-0.5 text-sm font-medium">{seatLabel ?? "-"}</p>
                </InkLine>
              </div>

              {kind === "buy" ? (
                <InkLine ready={done.includes("bind") || current === "bind"} delay={0.08} className="mt-5">
                  <p className="font-mono text-[11px] tracking-[0.2em] text-muted">HSF · BINDING DOOR KEY</p>
                </InkLine>
              ) : (
                <InkLine ready={done.includes("pay") || current === "pay"} delay={0.08} className="mt-5">
                  <p className="font-mono text-[11px] tracking-[0.2em] text-muted">HSF · HOLDING YOUR PLACE</p>
                </InkLine>
              )}

              {!reduce ? <PrintHead /> : null}
            </div>

            <div className="perforation-y w-3 shrink-0 bg-paper-deep" aria-hidden />

            <div className="flex w-[32%] min-w-[120px] flex-col items-center justify-center bg-paper-deep p-3">
              <motion.div
                className="grid size-14 place-items-center rounded-full border border-ink/15"
                animate={
                  reduce
                    ? undefined
                    : current
                      ? { scale: [1, 1.04, 1], borderColor: ["rgba(20,17,15,0.15)", "rgba(226,64,27,0.55)", "rgba(20,17,15,0.15)"] }
                      : undefined
                }
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              >
                {kind === "buy" && done.includes("bind") ? (
                  <CheckIcon size={22} />
                ) : kind === "join" && done.includes("pay") && current !== "pay" ? (
                  <CheckIcon size={22} />
                ) : (
                  <span className="font-display text-2xl font-black uppercase text-stamp">{kind === "join" ? "#" : "In"}</span>
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      <ol className="mx-auto mt-6 max-w-[520px] space-y-2.5 px-1">
        {order.map((step) => {
          const isDone = done.includes(step);
          const isActive = current === step;
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                className={`grid size-6 place-items-center rounded-full ${
                  isDone ? "bg-admit text-paper" : isActive ? "border border-stamp text-stamp" : "border border-ink/20 text-muted"
                }`}
              >
                {isDone ? <CheckIcon size={14} /> : isActive ? <PulseDot /> : null}
              </span>
              <span className={isDone || isActive ? "text-ink" : "text-muted"}>{stepLabels[step]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function InkLine({
  ready,
  delay,
  className = "",
  children,
}: {
  ready: boolean;
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {ready ? (
          <motion.div
            key="ink"
            initial={reduce ? false : { opacity: 0, filter: "blur(4px)", y: 4 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="ghost"
            className="space-y-2"
            initial={false}
            animate={reduce ? undefined : { opacity: [0.35, 0.55, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <div className="h-3 w-[72%] rounded-sm bg-ink/10" />
            <div className="h-3 w-[48%] rounded-sm bg-ink/10" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PrintHead() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-stamp/25 via-stamp/5 to-transparent mix-blend-multiply"
      animate={{ top: ["8%", "78%", "8%"] }}
      transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
    />
  );
}

function PulseDot() {
  return (
    <motion.span
      className="block size-2 rounded-full bg-stamp"
      animate={{ opacity: [1, 0.35, 1], scale: [1, 0.85, 1] }}
      transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
    />
  );
}
