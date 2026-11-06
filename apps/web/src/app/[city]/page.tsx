import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventPoster } from "@/components/event-poster";
import { EventRow, type EventRowData } from "@/components/event-row";
import { ArrowRight } from "@/components/icons";
import { Deal, RiseText } from "@/components/motion/reveal";
import { Stamp } from "@/components/motion/stamp";
import { SearchForm } from "@/components/search-form";
import { SearchResults } from "@/components/search-results";
import { parseSearchParams, searchHref } from "@/server/search-query";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { categoryLabel, formatDayMonth, formatUsdt, formatWeekday } from "@/lib/format";
import { cities, city as getCity, cityEvents, featured, searchEvents } from "@/server/queries";

export async function generateStaticParams() {
  const all = await cities();
  return all.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[city]">) {
  const { city } = await params;
  const c = await getCity(city);
  return { title: c ? `What's on in ${c.name}` : "City not found" };
}

export default function CityPage({ params, searchParams }: PageProps<"/[city]">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <CityContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Grouped = { label: string; events: EventRowData[] };

function groupByWeek(events: EventRowData[]): Grouped[] {
  const groups = new Map<string, EventRowData[]>();
  for (const e of events) {
    const d = new Date(e.startsAt * 1000);
    const label = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "Asia/Kolkata" }).format(d);
    const day = Number(new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }).format(d));
    const key = day <= 15 ? `Early ${label}` : `Late ${label}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].map(([label, events]) => ({ label, events }));
}

async function CityContent({ params, searchParams }: Pick<PageProps<"/[city]">, "params" | "searchParams">) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();

  const filters = parseSearchParams({ ...await searchParams, city: slug });
  const filtered = Boolean(filters.q || filters.category || filters.date || filters.maxPrice !== undefined || filters.sort !== "date");
  const [events, picks, allCities, matches] = await Promise.all([
    cityEvents(slug), featured(slug), cities(), filtered ? searchEvents(filters) : Promise.resolve([]),
  ]);
  const upcoming = events.filter((e) => e.status !== "past");
  const houseful = upcoming.filter((e) => e.status === "sold_out");
  const counts = upcoming.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <>
      <SiteHeader city={city} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[1320px] px-5 pb-10 pt-12 md:px-8 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {city.name} · {upcoming.length} shows · {houseful.length} sold out with a waitlist
          </p>
          <h1 className="mt-4 font-display text-[clamp(3.5rem,12vw,11rem)] font-black uppercase leading-[0.8] tracking-[-0.01em]">
            <RiseText text="What's on in" />
            <br />
            <RiseText text={city.name} delay={0.2} className="text-stamp" />
          </h1>

          <nav aria-label="Categories" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/15 pt-5">
            {Object.entries(counts).map(([cat, n]) => (
              <Link key={cat} href={`/${slug}/c/${cat}`} className="font-display text-2xl font-bold uppercase">
                {categoryLabel[cat] ?? cat}
                <sup className="ml-1 font-mono text-[11px] font-normal text-muted">{n}</sup>
              </Link>
            ))}
          </nav>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 md:px-8">
          <h2 className="mb-4 font-display text-3xl font-bold uppercase">Find your next show</h2>
          <p className="mb-4 text-sm"><Link href={searchHref({ ...filters, city: undefined })} className="underline">Browse all cities</Link></p>
          <SearchForm key={searchHref(filters)} filters={filters} cities={allCities} action={`/${slug}`} cityOnly />
        </section>
        {filtered ? (
          <div className="mx-auto max-w-[1320px] px-5 md:px-8">
            <SearchResults events={matches} resetHref={`/${slug}`} allCitiesHref={searchHref({ ...filters, city: undefined })} />
          </div>
        ) : <>
        {upcoming.length === 0 ? (
          <div className="mx-auto max-w-[1320px] px-5 md:px-8"><SearchResults events={[]} resetHref={`/${slug}`} /></div>
        ) : null}
        {picks.length > 0 ? (
          <section aria-labelledby="picks" className="pb-16">
            <div className="mx-auto flex max-w-[1320px] items-end justify-between px-5 md:px-8">
              <h2 id="picks" className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                Picked this week
              </h2>
            </div>
            <div className="mt-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-6 [scrollbar-width:none] md:px-[max(2rem,calc((100vw-1320px)/2+2rem))]">
              {picks.map((e, i) => (
                <Deal key={e.id} index={i} className={`shrink-0 snap-start ${i % 3 === 0 ? "w-[340px] md:w-[420px]" : "w-[260px] md:w-[300px]"}`}>
                  <Link href={`/e/${e.id}`} className="block">
                    <div className="relative">
                      <EventPoster
                        title={e.title}
                        subtitle={e.subtitle}
                        variant={e.posterVariant}
                        ink={e.posterInk}
                        startsAt={e.startsAt}
                        venue={e.venue.name}
                        className="rounded-[4px]"
                      />
                      {e.status === "sold_out" ? (
                        <span className="absolute bottom-5 right-4">
                          <Stamp label="Houseful" className="bg-paper/90" delay={0.4 + i * 0.08} />
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-4">
                      <p className="truncate text-sm font-semibold">{e.title}</p>
                      <p className="shrink-0 font-mono text-xs">{formatUsdt(e.priceUsd)}</p>
                    </div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                      {formatWeekday(e.startsAt)} {formatDayMonth(e.startsAt)} · {e.venue.area}
                    </p>
                  </Link>
                </Deal>
              ))}
            </div>
          </section>
        ) : null}

        {houseful.length > 0 ? (
          <section className="bg-ink py-16 text-paper">
            <div className="mx-auto grid max-w-[1320px] gap-10 px-5 md:grid-cols-[1fr_1.4fr] md:px-8">
              <div>
                <h2 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-black uppercase leading-[0.85]">
                  Sold out is not the end
                </h2>
                <p className="mt-5 max-w-[42ch] text-paper/70">
                  When someone cannot make it, their ticket goes back to the next verified person on the waitlist at
                  the price they paid. Nobody can sell it to you for more, and nobody can skip the line.
                </p>
                <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-2 font-medium text-marigold">
                  How the waitlist works <ArrowRight size={18} />
                </Link>
              </div>
              <ul className="divide-y divide-paper/15 border-y border-paper/15">
                {houseful.map((e) => (
                  <li key={e.id}>
                    <Link href={`/e/${e.id}`} className="flex items-center justify-between gap-6 py-5">
                      <span>
                        <span className="block font-display text-3xl font-extrabold uppercase leading-none">{e.title}</span>
                        <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-paper/55">
                          {formatWeekday(e.startsAt)} {formatDayMonth(e.startsAt)} · {e.venue.name}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-sm text-marigold">Join waitlist</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-[1320px] px-5 py-16 md:px-8">
          {groupByWeek(upcoming).map((group) => (
            <div key={group.label} className="mb-14">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">{group.label}</h2>
              {group.events.map((e, i) => (
                <EventRow key={e.id} event={e} index={i} />
              ))}
            </div>
          ))}
        </section>
        </>}
      </main>

      <SiteFooter />
    </>
  );
}
