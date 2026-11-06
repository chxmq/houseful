"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type TicketStubProps = {
  eyebrow: string;
  title: string;
  lines: { label: string; value: string }[];
  stub: ReactNode;
  serial: string;
  torn?: boolean;
  tone?: "paper" | "ink";
  onTornComplete?: () => void;
};

const tear = { duration: 0.9, ease: [0.76, 0, 0.24, 1] as const };

export function TicketStub({
  eyebrow,
  title,
  lines,
  stub,
  serial,
  torn = false,
  tone = "paper",
  onTornComplete,
}: TicketStubProps) {
  const reduce = useReducedMotion();
  const surface = tone === "ink" ? "bg-ink text-paper" : "bg-paper-deep text-ink";

  return (
    <div className="relative flex w-full max-w-[640px] items-stretch drop-shadow-[0_18px_30px_rgba(20,17,15,0.16)]">
      <motion.div
        animate={torn && !reduce ? { rotate: -2.5, x: -10, y: 6 } : { rotate: 0, x: 0, y: 0 }}
        transition={tear}
        className={`relative min-w-0 flex-1 rounded-l-[14px] p-5 sm:p-6 ${surface}`}
        style={{ transformOrigin: "0% 100%" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-70">{eyebrow}</p>
        <h3 className="mt-2 font-display text-[clamp(2rem,5vw,3rem)] font-extrabold uppercase leading-[0.9]">
          {title}
        </h3>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
          {lines.map((line) => (
            <div key={line.label}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">{line.label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 font-mono text-[11px] tracking-[0.2em] opacity-60">{serial}</p>
      </motion.div>

      <motion.div
        aria-hidden="true"
        animate={torn && !reduce ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`perforation-y w-3 shrink-0 ${surface}`}
      />

      <motion.div
        animate={
          torn && !reduce
            ? { rotate: 14, x: 70, y: 180, opacity: 0 }
            : { rotate: 0, x: 0, y: 0, opacity: 1 }
        }
        transition={torn ? { ...tear, opacity: { delay: 0.55, duration: 0.35 } } : tear}
        onAnimationComplete={() => torn && onTornComplete?.()}
        className={`relative flex w-[34%] min-w-[136px] flex-col items-center justify-center rounded-r-[14px] p-3 sm:p-5 ${surface}`}
        style={{ transformOrigin: "0% 0%" }}
      >
        {stub}
      </motion.div>
    </div>
  );
}
