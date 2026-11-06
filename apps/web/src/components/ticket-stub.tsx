"use client";

import { motion, useReducedMotion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

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

/** From this width the page has room for the stub to swing out sideways as it falls. */
const ROOM_TO_SWING = "(min-width: 768px)";

function subscribeToRoom(callback: () => void) {
  const query = window.matchMedia(ROOM_TO_SWING);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useRoomToSwing() {
  return useSyncExternalStore(
    subscribeToRoom,
    () => window.matchMedia(ROOM_TO_SWING).matches,
    () => true,
  );
}

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
  const roomToSwing = useRoomToSwing();
  const surface = tone === "ink" ? "bg-ink text-paper" : "bg-paper-deep text-ink";

  return (
    <div className="relative flex w-full max-w-[640px] flex-col items-stretch drop-shadow-[0_18px_30px_rgba(20,17,15,0.16)] sm:flex-row">
      <motion.div
        animate={torn && !reduce ? { rotate: -2.5, x: -10, y: 6 } : { rotate: 0, x: 0, y: 0 }}
        transition={tear}
        className={`relative min-w-0 p-5 max-sm:rounded-t-[14px] sm:flex-1 sm:rounded-l-[14px] sm:p-6 ${surface}`}
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
        className={`relative h-3 shrink-0 sm:h-auto sm:w-3 ${surface}`}
      >
        <span className="perforation-x absolute inset-0 sm:hidden" />
        <span className="perforation-y absolute inset-0 max-sm:hidden" />
      </motion.div>

      <motion.div
        animate={
          torn && !reduce
            ? { rotate: 14, x: roomToSwing ? 70 : 0, y: 180, opacity: 0 }
            : { rotate: 0, x: 0, y: 0, opacity: 1 }
        }
        transition={torn ? { ...tear, opacity: { delay: 0.55, duration: 0.35 } } : tear}
        onAnimationComplete={() => torn && onTornComplete?.()}
        className={`relative flex flex-col items-center justify-center px-3 py-5 max-sm:rounded-b-[14px] sm:w-[34%] sm:min-w-[136px] sm:rounded-r-[14px] sm:p-5 ${surface}`}
        style={{ transformOrigin: "0% 0%" }}
      >
        {stub}
      </motion.div>
    </div>
  );
}
