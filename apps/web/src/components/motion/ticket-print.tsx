"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * A ticket feeding out of a slot in short, uneven pulls, like a thermal printer.
 */
export function TicketPrint({ children, onPrinted }: { children: ReactNode; onPrinted?: () => void }) {
  const reduce = useReducedMotion();

  return (
    <div className="relative">
      <div className="relative z-10 h-3 rounded-full bg-ink shadow-[inset_0_-3px_0_rgba(255,255,255,0.08)]" />
      <div className="-mt-1.5 overflow-hidden px-3 pb-6">
        <motion.div
          initial={reduce ? false : { y: "-102%" }}
          animate={{ y: ["-102%", "-74%", "-70%", "-41%", "-37%", "-12%", "-9%", "0%"] }}
          transition={{
            duration: 1.6,
            times: [0, 0.16, 0.24, 0.42, 0.5, 0.7, 0.78, 1],
            ease: "easeOut",
          }}
          onAnimationComplete={onPrinted}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
