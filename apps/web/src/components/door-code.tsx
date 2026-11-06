"use client";

import { buildDoorPayload, secondsUntilRotation, WINDOW, type SignedCredential } from "@houseful/pass";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { deviceDoorKey } from "@/lib/door-key";

type DoorCodeProps = {
  chainEventId: number;
  ticketId: number;
  wallet: `0x${string}`;
};

const cacheKey = (e: number, t: number) => `houseful.credential.${e}.${t}`;

function heldHere(signed: SignedCredential) {
  const mine = deviceDoorKey().publicKey.replace(/^0x/, "").toLowerCase();
  return signed.credential.holderKey.replace(/^0x/, "").toLowerCase() === mine;
}

async function loadCredential(props: DoorCodeProps): Promise<SignedCredential> {
  const signed = await fetchCredential(props);
  if (!heldHere(signed)) {
    window.localStorage.removeItem(cacheKey(props.chainEventId, props.ticketId));
    throw new Error("This phone's key does not match the ticket. Bind it again.");
  }
  return signed;
}

async function fetchCredential(props: DoorCodeProps): Promise<SignedCredential> {
  try {
    const res = await fetch("/api/pass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(props),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.localStorage.setItem(cacheKey(props.chainEventId, props.ticketId), JSON.stringify(data));
    return data;
  } catch (err) {
    const cached = window.localStorage.getItem(cacheKey(props.chainEventId, props.ticketId));
    if (cached) return JSON.parse(cached) as SignedCredential;
    throw err;
  }
}

export function DoorCode(props: DoorCodeProps) {
  const { chainEventId, ticketId, wallet } = props;
  const [credential, setCredential] = useState<SignedCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [svg, setSvg] = useState<{ slot: number; markup: string; payload: string } | null>(null);

  useEffect(() => {
    let live = true;
    loadCredential({ chainEventId, ticketId, wallet }).then(
      (c) => live && setCredential(c),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [chainEventId, ticketId, wallet]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => clearInterval(timer);
  }, []);

  const slot = Math.floor(now / WINDOW);

  useEffect(() => {
    if (!credential || svg?.slot === slot) return;
    const payload = buildDoorPayload(credential, deviceDoorKey().secretKey, now);
    QRCode.toString(payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#14110f", light: "#00000000" } }).then(
      (markup) => setSvg({ slot, markup, payload }),
    );
  }, [credential, slot, now, svg?.slot]);

  if (error) return <p className="max-w-[18ch] text-center text-xs text-paper/70">{error}</p>;

  const left = secondsUntilRotation(now);
  const progress = left / WINDOW;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-[min(80vw,340px)] rounded-[6px] bg-paper p-[min(5vw,22px)] sm:size-[min(132px,30vw)] sm:p-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {svg ? (
            <motion.div
              key={svg.slot}
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="size-full [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: svg.markup }}
            />
          ) : (
            <div className="size-full animate-pulse rounded-[3px] bg-paper-deep" />
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/70">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="-rotate-90">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="#f2a51a"
            strokeWidth="2"
            strokeDasharray={2 * Math.PI * 6.5}
            strokeDashoffset={2 * Math.PI * 6.5 * (1 - progress)}
            style={{ transition: "stroke-dashoffset 250ms linear" }}
          />
        </svg>
        New code in {left}s
      </div>
      {svg ? (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(svg.payload)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50 underline underline-offset-4"
        >
          Copy code
        </button>
      ) : null}
    </div>
  );
}
