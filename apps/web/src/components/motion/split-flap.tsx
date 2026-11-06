"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type SplitFlapProps = {
  value: string | number;
  className?: string;
  cellClassName?: string;
};

export function SplitFlap({ value, className = "", cellClassName = "" }: SplitFlapProps) {
  const chars = String(value).split("");
  const reduce = useReducedMotion();

  return (
    <span className={`inline-flex gap-[0.08em] font-mono tabular-nums ${className}`} aria-label={String(value)}>
      {chars.map((char, index) => (
        <span
          key={`${chars.length}-${index}`}
          aria-hidden="true"
          className={`relative inline-flex h-[1.35em] w-[0.82em] items-center justify-center overflow-hidden rounded-[3px] bg-ink text-paper [perspective:400px] ${cellClassName}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={char}
              initial={reduce ? false : { rotateX: -92, y: "-12%", opacity: 0.2 }}
              animate={{ rotateX: 0, y: "0%", opacity: 1 }}
              exit={reduce ? undefined : { rotateX: 92, y: "12%", opacity: 0 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: index * 0.035 }}
              className="block origin-center [backface-visibility:hidden]"
            >
              {char}
            </motion.span>
          </AnimatePresence>
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-paper/15" />
        </span>
      ))}
    </span>
  );
}
