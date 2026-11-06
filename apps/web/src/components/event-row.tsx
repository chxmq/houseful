import Link from "next/link";
import { categoryLabel, formatDayNum, formatInr, formatMonShort, formatTime, formatWeekday } from "@/lib/format";
import { RuleReveal } from "./motion/reveal";

export type EventRowData = {
  id: string;
  title: string;
  subtitle: string | null;
  category: string;
  startsAt: number;
  priceInr: number;
  capacity: number;
  sold: number;
  status: string;
  venue: { name: string; area: string };
};

export function availability(event: Pick<EventRowData, "status" | "capacity" | "sold">) {
  if (event.status === "announced") return { label: "Announced", tone: "muted" as const };
  if (event.status === "past") return { label: "Happened", tone: "muted" as const };
  if (event.status === "sold_out" || event.sold >= event.capacity) return { label: "Houseful. Waitlist open", tone: "stamp" as const };
  const left = event.capacity - event.sold;
  if (left / event.capacity < 0.12) return { label: `${left} left`, tone: "marigold" as const };
  return { label: "On sale", tone: "ink" as const };
}

const toneClass = {
  muted: "text-muted",
  stamp: "text-stamp",
  marigold: "text-[#9a6200]",
  ink: "text-ink",
};

export function EventRow({ event, index = 0 }: { event: EventRowData; index?: number }) {
  const a = availability(event);

  return (
    <RuleReveal index={index}>
      <Link
        href={`/e/${event.id}`}
        className="grid grid-cols-[64px_1fr] items-baseline gap-x-5 gap-y-1 py-5 md:grid-cols-[88px_1fr_200px_140px] md:gap-x-8"
      >
        <div className="row-span-2 md:row-span-1">
          <span className="block font-display text-[44px] font-black leading-[0.85] md:text-[56px]">{formatDayNum(event.startsAt)}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {formatMonShort(event.startsAt)} {formatWeekday(event.startsAt)}
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {categoryLabel[event.category] ?? event.category} · {formatTime(event.startsAt)}
          </p>
          <h3 className="mt-1 font-display text-[28px] font-extrabold uppercase leading-[0.95] md:text-[34px]">{event.title}</h3>
          {event.subtitle ? <p className="mt-1 text-sm text-ink-soft">{event.subtitle}</p> : null}
        </div>

        <p className="col-start-2 text-sm text-ink-soft md:col-start-auto">
          {event.venue.name}
          <span className="block text-muted">{event.venue.area}</span>
        </p>

        <div className="col-start-2 flex items-baseline gap-3 md:col-start-auto md:block md:text-right">
          <p className="font-mono text-base font-medium">{formatInr(event.priceInr)}</p>
          <p className={`font-mono text-[11px] uppercase tracking-[0.14em] ${toneClass[a.tone]}`}>{a.label}</p>
        </div>
      </Link>
    </RuleReveal>
  );
}
