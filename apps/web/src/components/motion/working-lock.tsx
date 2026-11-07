"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

type WorkingLockProps = {
  label: string;
  /** Soft pulse while the chain catches up. */
  detail?: string;
};

/**
 * Full-screen lock + in-place working strip. Use while a wallet action is on-chain
 * so the person cannot tap another control mid-flight.
 */
export function WorkingLock({ label, detail }: WorkingLockProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/55 p-4 backdrop-blur-[1px] sm:items-center" role="status" aria-live="polite" aria-busy="true">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[4px] bg-paper p-5 text-ink shadow-[0_24px_60px_-28px_rgba(20,16,12,0.55)]"
      >
        <div className="flex items-center gap-3">
          <span className="relative grid size-8 place-items-center">
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-stamp/30"
              animate={reduce ? undefined : { scale: [1, 1.25, 1], opacity: [0.7, 0.2, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            />
            <motion.span
              className="size-2.5 rounded-full bg-stamp"
              animate={reduce ? undefined : { scale: [1, 0.75, 1] }}
              transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
            />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-bold uppercase leading-none">{label}</p>
            {detail ? <p className="mt-2 text-sm text-ink-soft">{detail}</p> : null}
          </div>
        </div>
        <motion.div
          className="mt-5 h-1 overflow-hidden rounded-full bg-ink/10"
          initial={false}
        >
          <motion.div
            className="h-full w-1/3 bg-stamp"
            animate={reduce ? undefined : { x: ["-10%", "220%"] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          />
        </motion.div>
        <p className="mt-3 text-center text-xs text-muted">Stay on this screen until the chain answers.</p>
      </motion.div>
    </div>
  );
}
