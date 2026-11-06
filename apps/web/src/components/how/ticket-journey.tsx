"use client";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RuleReveal } from "@/components/motion/reveal";
import { SplitFlap } from "@/components/motion/split-flap";
import { Stamp } from "@/components/motion/stamp";
import { TicketStub } from "@/components/ticket-stub";
import { FACE_VALUE, FaceValueDemo, HandBackDemo, HOLDER, IdentityDemo, NEXT, RefundDemo } from "./demos";
import { DoorDemo } from "./door-demo";

type Chapter = {
  id: string;
  n: string;
  kicker: string;
  title: string;
  body: string[];
  demo: ReactNode;
  ticket: { stub: string; status: string; gen: number; lines: { label: string; value: string }[] };
};

const CHAPTERS: Chapter[] = [
  {
    id: "one-person",
    n: "01",
    kicker: "One person",
    title: "A real person. Not a name.",
    body: [
      "World ID proves you are a unique human without telling anyone who you are. For each show it produces a number that is the same every time you try, and different for every other show. One number gets one ticket.",
      "Each show asks for the least it needs. Most ask for a Selfie Check. Shows where demand is higher than the seats ask for Proof of Human.",
    ],
    demo: <IdentityDemo />,
    ticket: {
      stub: "One person",
      status: "Held by one verified person",
      gen: 1,
      lines: [
        { label: "Holder", value: HOLDER },
        { label: "Checked with", value: "Selfie Check" },
        { label: "Face value", value: FACE_VALUE },
        { label: "Status", value: "Held" },
      ],
    },
  },
  {
    id: "face-value",
    n: "02",
    kicker: "Face value",
    title: "The price cannot move.",
    body: [
      "The price is written into a public contract when the show is listed. There is no function to raise it later, for the host or for us.",
      "Tickets cannot be transferred at all. A resale site can list yours at five times the price, but when a buyer tries, the transfer reverts. There is nothing to buy.",
    ],
    demo: <FaceValueDemo />,
    ticket: {
      stub: "Face value",
      status: "Resale above face value reverts",
      gen: 1,
      lines: [
        { label: "Holder", value: HOLDER },
        { label: "Face value", value: `${FACE_VALUE}, fixed` },
        { label: "Transfers", value: "Always revert" },
        { label: "Status", value: "Held" },
      ],
    },
  },
  {
    id: "hand-it-back",
    n: "03",
    kicker: "Hand it back",
    title: "Cannot go? Hand it back.",
    body: [
      "You surrender the ticket to the contract and get the full price back. The first person on the waitlist, who paid into escrow when they joined, becomes the holder. It all happens in one transaction.",
      "Nobody picks who gets it and nobody earns on it. Your old door code stops working the moment the seat moves.",
    ],
    demo: <HandBackDemo />,
    ticket: {
      stub: "Handed on",
      status: `Passed to the next in line at ${FACE_VALUE}`,
      gen: 2,
      lines: [
        { label: "Holder", value: NEXT },
        { label: "Checked with", value: "Selfie Check" },
        { label: "Paid", value: FACE_VALUE },
        { label: "Status", value: "Reassigned" },
      ],
    },
  },
  {
    id: "the-door",
    n: "04",
    kicker: "The door",
    title: "A code that will not keep.",
    body: [
      "At the door your ticket shows a code that changes every 20 seconds. Your phone signs each one with a key that never leaves it.",
      "The door phone checks everything itself: our signature on the ticket, your phone's signature on the code, the time, and whether the ticket is already in. No signal needed. A screenshot is stale before it can be forwarded.",
    ],
    demo: <DoorDemo />,
    ticket: {
      stub: "Admitted",
      status: "Scanned at the door, offline",
      gen: 2,
      lines: [
        { label: "Holder", value: NEXT },
        { label: "Door code", value: "New every 20s" },
        { label: "Face value", value: FACE_VALUE },
        { label: "Status", value: "Admitted" },
      ],
    },
  },
  {
    id: "cancelled",
    n: "05",
    kicker: "Cancelled shows",
    title: "Cancelled means refunded.",
    body: [
      "If a host cancels, every ticket holder and everyone on the waitlist can pull their money straight from the contract.",
      "The host cannot withdraw from a cancelled show. There is no function, ours or theirs, that can pause or block a refund.",
    ],
    demo: <RefundDemo />,
    ticket: {
      stub: "Refunded",
      status: `Show cancelled, ${FACE_VALUE} refunded`,
      gen: 2,
      lines: [
        { label: "Holder", value: NEXT },
        { label: "Refund", value: FACE_VALUE },
        { label: "Can block it", value: "Nobody" },
        { label: "Status", value: "Refunded" },
      ],
    },
  },
];

const LAST = CHAPTERS.length - 1;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function TicketJourney() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [ticketHeight, setTicketHeight] = useState(0);
  const travel = useMotionValue(0);

  const { scrollYProgress: progress } = useScroll({ target: trackRef, offset: ["start center", "end center"] });

  useMotionValueEvent(progress, "change", (v) => {
    const next = Math.min(LAST, Math.max(0, Math.floor(v * CHAPTERS.length)));
    setActive((prev) => (prev === next ? prev : next));
  });

  // Station i sits at the middle of chapter i, so the ticket parks on it while that chapter is centred.
  const target = useTransform(() => clamp01((progress.get() * CHAPTERS.length - 0.5) / LAST) * travel.get());
  const y = useSpring(target, { stiffness: 140, damping: 26, mass: 0.6 });
  const velocity = useVelocity(y);
  const rotate = useTransform(velocity, [-1400, 0, 1400], [4, 0, -4], { clamp: true });
  const fill = useTransform(() => (travel.get() > 0 ? y.get() / travel.get() : 0));

  useEffect(() => {
    const stage = stageRef.current;
    const ticket = ticketRef.current;
    if (!stage || !ticket) return;
    const observer = new ResizeObserver(() => {
      setTicketHeight(ticket.offsetHeight);
      travel.set(Math.max(0, stage.clientHeight - ticket.offsetHeight));
    });
    observer.observe(stage);
    observer.observe(ticket);
    return () => observer.disconnect();
  }, [travel]);

  const chapter = CHAPTERS[active];
  const half = ticketHeight / 2;

  return (
    <div
      ref={trackRef}
      className="relative mx-auto max-w-[1320px] px-5 md:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-16"
    >
      <div className="sticky top-16 z-30 -mx-5 border-b border-ink/10 bg-paper px-5 py-3 md:-mx-8 md:px-8 lg:hidden">
        <div className="flex items-center gap-3">
          <SplitFlap value={chapter.n} className="text-sm" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Ticket 0417 · {chapter.kicker}</p>
            <p className="truncate text-sm font-medium">{chapter.ticket.status}</p>
          </div>
        </div>
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-stamp"
          style={{ scaleX: progress }}
        />
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col py-12">
          <div ref={stageRef} className="relative flex-1">
            <div aria-hidden="true" className="absolute inset-y-0 left-0 w-14">
              <div className="absolute left-[7px] w-px bg-ink/15" style={{ top: half, bottom: half }} />
              <motion.div
                className="absolute left-[7px] w-px origin-top bg-ink"
                style={{ top: half, bottom: half, scaleY: reduce ? active / LAST : fill }}
              />
              {CHAPTERS.map((c, i) => (
                <div
                  key={c.id}
                  className="absolute left-0 flex -translate-y-1/2 items-center gap-2.5"
                  style={{ top: `calc(${half}px + (100% - ${ticketHeight}px) * ${i / LAST})` }}
                >
                  <span
                    className={`block size-[15px] border-2 ${i <= active ? "border-stamp bg-stamp" : "border-ink/30 bg-paper"}`}
                  />
                  <span className={`font-mono text-[11px] ${i === active ? "text-ink" : "text-muted"}`}>{c.n}</span>
                </div>
              ))}
            </div>

            <motion.div
              ref={ticketRef}
              className="absolute left-16 right-0 top-0"
              style={reduce ? undefined : { y, rotate }}
            >
              <TicketStub
                tone="ink"
                eyebrow="Admit one · NSCI Dome"
                title="The Last Local"
                lines={chapter.ticket.lines}
                serial={`TICKET 0417 · GEN ${chapter.ticket.gen}`}
                torn={chapter.id === "the-door"}
                stub={
                  <div className="text-center">
                    <SplitFlap value={chapter.n} className="text-3xl" cellClassName="bg-paper! text-ink!" />
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">{chapter.ticket.stub}</p>
                  </div>
                }
              />
              {chapter.id === "cancelled" ? (
                <span className="absolute -top-16 right-6">
                  <Stamp label="Refunded" rotate={-7} className="bg-paper/90 text-3xl" />
                </span>
              ) : null}
            </motion.div>
          </div>
          <p className="mt-6 pl-16 font-mono text-[11px] uppercase tracking-[0.16em] text-muted" aria-live="polite">
            {chapter.ticket.status}
          </p>
        </div>
      </div>

      <div>
        {CHAPTERS.map((c, i) => (
          <ChapterSection key={c.id} chapter={c} index={i} />
        ))}
      </div>
    </div>
  );
}

function ChapterSection({ chapter, index }: { chapter: Chapter; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const numeralY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section
      ref={ref}
      id={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className="flex min-h-[100svh] scroll-mt-16 flex-col justify-center py-20 lg:py-28"
    >
      <div className="flex items-end gap-5">
        <motion.span
          aria-hidden="true"
          className="font-display text-[clamp(5.5rem,13vw,10rem)] font-black leading-[0.75] text-stamp"
          style={reduce ? undefined : { y: numeralY }}
        >
          {chapter.n}
        </motion.span>
        <p className="pb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted">
          Chapter {index + 1} of {CHAPTERS.length}
          <span className="block text-ink">{chapter.kicker}</span>
        </p>
      </div>

      <RuleReveal className="mt-8 pt-6">
        <h2
          id={`${chapter.id}-title`}
          className="font-display text-[clamp(2.75rem,6vw,5.25rem)] font-black uppercase leading-[0.86]"
        >
          {chapter.title}
        </h2>
      </RuleReveal>

      <div className="mt-6 max-w-[48ch] space-y-4 text-[17px] leading-relaxed text-ink-soft">
        {chapter.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <div className="mt-12">{chapter.demo}</div>
    </section>
  );
}
