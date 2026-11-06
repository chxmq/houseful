"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/** A rule that draws across, then the content rises out from under it, like a line being typeset. */
export function RuleReveal({ children, index = 0, className = "" }: { children: ReactNode; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  const delay = Math.min(index, 8) * 0.06;

  return (
    <motion.div
      className={`relative ${className}`}
      initial={reduce ? false : "hidden"}
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px origin-left bg-ink/20"
        variants={{ hidden: { scaleX: 0 }, shown: { scaleX: 1 } }}
        transition={{ duration: 0.7, ease, delay }}
      />
      <div className="overflow-hidden">
        <motion.div
          variants={{ hidden: { y: "40%", opacity: 0 }, shown: { y: "0%", opacity: 1 } }}
          transition={{ duration: 0.65, ease, delay: delay + 0.12 }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Headline words rise from below their baseline one after another. */
export function RiseText({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.06em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: "105%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.8, ease, delay: delay + i * 0.07 }}
          >
            {word}
            {i < words.length - 1 ? "\u00a0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Posters are dealt onto the table: they land slightly rotated and settle square. */
export function Deal({ children, index = 0, className = "" }: { children: ReactNode; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  const tilt = index % 2 === 0 ? -6 : 5;

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { y: 80, rotate: tilt, opacity: 0 }}
      whileInView={{ y: 0, rotate: 0, opacity: 1 }}
      viewport={{ once: true, margin: "0px 0px -5% 0px" }}
      transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.9, delay: index * 0.08 }}
    >
      {children}
    </motion.div>
  );
}
