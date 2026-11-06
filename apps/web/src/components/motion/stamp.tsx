"use client";

import { motion, useReducedMotion } from "motion/react";

type StampProps = {
  label: string;
  rotate?: number;
  delay?: number;
  className?: string;
};

export function Stamp({ label, rotate = -8, delay = 0, className = "" }: StampProps) {
  const reduce = useReducedMotion();

  return (
    <motion.span
      role="status"
      initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: rotate - 10 }}
      whileInView={{ scale: 1, opacity: 1, rotate }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.9, delay }}
      className={`pointer-events-none inline-block select-none border-[3px] border-stamp px-3 py-1 font-display text-2xl font-extrabold uppercase leading-none tracking-[0.08em] text-stamp mix-blend-multiply ${className}`}
      style={{ maskImage: "radial-gradient(circle at 30% 40%, #000 62%, rgba(0,0,0,0.78) 100%)" }}
    >
      {label}
    </motion.span>
  );
}
