"use client";

import { WINDOW } from "@houseful/pass";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Stand-in payload with the length of a real door code, so the QR has the same density. */
function demoPayload(window: number) {
  let seed = (window + 1) * 2654435761;
  let out = "";
  for (let i = 0; i < 180; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    out += ALPHABET[(seed >>> 0) % 64];
  }
  return out;
}

function qrPath(text: string) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  let d = "";
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) {
      if (modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { size: modules.size, d };
}

const RING = 2 * Math.PI * 26;

const checks = [
  "Ticket signed by Houseful",
  "Code signed by the holder's phone",
  "Code is from the last 20 seconds",
  "Not handed back, not already in",
];

export function DoorDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [inView]);

  const slot = Math.floor(tick / WINDOW);
  const left = WINDOW - (tick % WINDOW);
  const qr = useMemo(() => qrPath(demoPayload(slot)), [slot]);

  return (
    <div ref={ref} className="grid max-w-[600px] items-center gap-8 sm:grid-cols-[auto_1fr]">
      <div className="w-fit rounded-[14px] bg-ink p-4 text-paper">
        <div className="size-[188px] rounded-[6px] bg-paper p-3 [perspective:700px]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.svg
              key={slot}
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              className="size-full"
              role="img"
              aria-label="Door code, changes every 20 seconds"
              initial={reduce ? false : { rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={reduce ? undefined : { rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <path d={qr.d} fill="#14110f" shapeRendering="crispEdges" />
            </motion.svg>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true" className="-rotate-90">
            <circle cx="30" cy="30" r="26" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
            <motion.circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke="#f2a51a"
              strokeWidth="4"
              strokeDasharray={RING}
              initial={false}
              animate={{ strokeDashoffset: RING * (1 - (left - 1) / WINDOW) }}
              transition={reduce ? { duration: 0 } : { duration: left === WINDOW ? 0.35 : 1, ease: "linear" }}
            />
          </svg>
          <div>
            <p className="font-display text-3xl font-black leading-none tabular-nums">{String(left).padStart(2, "0")}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/60">Seconds to new code</p>
          </div>
        </div>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Door phone, no signal</p>
        <ul className="mt-3 space-y-2.5 font-mono text-[13px]">
          {checks.map((c, i) => (
            <motion.li
              key={c}
              className="flex items-start gap-2.5"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 1 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.16 }}
            >
              <CheckIcon size={16} className="mt-0.5 shrink-0 text-admit" />
              {c}
            </motion.li>
          ))}
        </ul>
        <motion.p
          className="mt-5 font-display text-[clamp(3.5rem,7vw,5rem)] font-black uppercase leading-none text-admit"
          initial={reduce ? false : { opacity: 0, scale: 1.4 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 24, delay: 0.95 }}
          style={{ transformOrigin: "0% 50%" }}
        >
          Admit
        </motion.p>
      </div>
    </div>
  );
}
