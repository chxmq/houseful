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
    title: "One person can hold one ticket.",
    body: [
      "A person check helps keep one ticket per person for each show. Houseful receives a proof, not your selfie or document. Your wallet and ticket activity are public.",
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
        { label: "Ticket price", value: FACE_VALUE },
        { label: "Status", value: "Held" },
      ],
    },
  },
  {
    id: "face-value",
    n: "02",
    kicker: "Ticket price",
    title: "The price cannot move.",
    body: [
      "The show has a fixed price. The host cannot raise it once tickets are listed here.",
      "Tickets cannot be sent or sold to another wallet. If you cannot go, return yours through the waitlist.",
    ],
    demo: <FaceValueDemo />,
    ticket: {
      stub: "Ticket price",
      status: "Tickets cannot be transferred",
      gen: 1,
      lines: [
        { label: "Holder", value: HOLDER },
        { label: "Ticket price", value: `${FACE_VALUE}, fixed` },
        { label: "Transfers", value: "Not allowed" },
        { label: "Status", value: "Held" },
      ],
    },
  },
  {
    id: "hand-it-back",
    n: "03",
    kicker: "Resell at face value",
    title: "Cannot go? Resell at face value.",
    body: [
      "Before the return deadline, you can return your ticket and get its price back in test USDT. If someone is waiting, the first person in line gets the seat using the payment they made when they joined.",
      "The waiting order decides who gets it. An online door sees the change after it syncs; an offline door needs a fresh sync before it can reject the old holder.",
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
    title: "A door code that changes.",
    body: [
      "At the door your ticket shows a code that changes every 20 seconds. Your phone makes each code using its saved ticket key.",
      "After syncing, the door phone can check codes without a network. Old codes expire. A fresh screenshot may still work briefly, and separate offline doors do not share who has entered until they sync.",
    ],
    demo: <DoorDemo />,
    ticket: {
      stub: "Admitted",
      status: "Scanned at the door, offline",
      gen: 2,
      lines: [
        { label: "Holder", value: NEXT },
        { label: "Door code", value: "New every 20s" },
        { label: "Ticket price", value: FACE_VALUE },
        { label: "Status", value: "Admitted" },
      ],
    },
  },
  {
    id: "cancelled",
    n: "05",
    kicker: "Cancelled shows",
    title: "Cancelled? Ask for your money back.",
    body: [
      "If a host cancels, ticket holders and people on the waitlist can ask for their payment back in test USDT.",
      "The host cannot take the payments for a cancelled show. Fans request their own refunds, so the host does not need to approve each one.",
    ],
    demo: <RefundDemo />,
    ticket: {
      stub: "Refunded",
      status: `Show cancelled, ${FACE_VALUE} refunded`,
      gen: 2,
      lines: [
        { label: "Holder", value: NEXT },
        { label: "Refund", value: FACE_VALUE },
        { label: "Host approval", value: "Not needed" },
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
