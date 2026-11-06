import Link from "next/link";
import type { EventSummary } from "@/server/catalog";
import { formatUsdt } from "@/lib/format";

export function SearchResults({ events, resetHref = "/search", allCitiesHref = "/search" }: {
  events: EventSummary[];
  resetHref?: string;
  allCitiesHref?: string;
}) {
  return (
    <section aria-labelledby="results-heading" className="py-8">
      <h2 id="results-heading" className="font-display text-3xl font-bold uppercase">{events.length} {events.length === 1 ? "show" : "shows"} found</h2>
      {events.length === 0 ? (
        <div className="mt-6 border-y border-ink/20 py-10">
          <h3 className="text-xl font-semibold">No shows match yet</h3>
          <p className="mt-3 max-w-prose text-ink-soft">Try another date, a higher price or a shorter search. You can also see what&apos;s on in other cities.</p>
          <div className="mt-5 flex flex-wrap gap-5">
            <Link href={resetHref} className="underline">Clear filters</Link>
            <Link href={allCitiesHref} className="underline">Browse all cities</Link>
          </div>
        </div>
      ) : (
        <ol className="mt-5 divide-y divide-ink/20 border-y border-ink/20">
          {events.map(event => {
            const date = new Intl.DateTimeFormat("en-IN", { timeZone: event.city.timezone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt * 1000));
            return (
              <li key={event.id} className="py-6">
                <Link href={`/e/${event.id}`} className="grid min-w-0 gap-3 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-soft">{event.categoryLabel} · {event.city.name}</p>
                    <h3 className="mt-1 break-words font-display text-3xl font-bold uppercase leading-tight">{event.title}</h3>
                    <p className="mt-2 text-sm"><time dateTime={new Date(event.startsAt * 1000).toISOString()}>{date}</time> <span className="text-muted">(local time)</span></p>
                    <p className="mt-1 text-sm text-ink-soft">{event.venue.name} · {event.venue.area}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="font-mono">{formatUsdt(event.priceUsd)}</p>
                    <p className="mt-1 text-sm">{event.status === "sold_out" || event.sold >= event.capacity ? "Sold out · Waitlist" : event.status === "announced" ? "Announced" : "Tickets available"}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
