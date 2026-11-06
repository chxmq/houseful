import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventPoster } from "@/components/event-poster";
import { CalendarIcon, PinIcon } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketPanel } from "@/components/ticket-panel";
import { assuranceFor } from "@/lib/assurance";
import { categoryLabel, formatLongDate, formatTime } from "@/lib/format";
import { event as getEvent } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  return e ? { title: e.title, description: e.subtitle ?? undefined } : { title: "Show not found" };
}

export default function EventPage({ params }: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: Pick<PageProps<"/e/[slug]">, "params">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) notFound();

  const assurance = assuranceFor(e);

  return (
    <>
      <SiteHeader city={{ slug: e.citySlug, name: e.city?.name ?? e.citySlug }} />

      <main id="main" className="flex-1">
        <aside className="border-b border-ink/20 px-5 py-4 text-sm md:px-8" aria-label="Test listing">
          <div className="mx-auto max-w-[1256px]">
            <p>Test listing, not affiliated with the artist or organiser. A booking here does not give real admission.</p>
            {e.officialUrl ? (
              <a href={e.officialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block py-1 font-medium underline">Official event and tickets (opens a new tab)</a>
            ) : <p className="mt-1 text-muted">This is a sample show created for testing.</p>}
          </div>
        </aside>
        <div className="relative overflow-hidden border-b border-ink/10 bg-ink text-paper">
          <div className="relative mx-auto grid w-full max-w-[1320px] gap-10 px-5 py-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-14 md:px-8 md:py-14">
            <div className="md:sticky md:top-24 md:self-start">
              <EventPoster
                title={e.title}
                subtitle={e.subtitle}
                variant={e.posterVariant}
                ink={e.posterInk}
                startsAt={e.startsAt}
                timezone={e.city.timezone}
                venue={e.venue.name}
                className="rounded-[6px] ring-1 ring-paper/10"
              />
            </div>

            <div className="flex flex-col justify-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/55">
                <Link href={`/${e.citySlug}/c/${e.category}`} className="text-paper">
                  {categoryLabel[e.category] ?? e.category}
                </Link>
                {" · "}
                {e.language}
                {" · "}
                {e.published?.age === false ? "Age rules: Not published" : e.ageLimit === 0 ? "All ages" : `${e.ageLimit}+`}
              </p>
              <h1 className="mt-4 font-display text-[clamp(3rem,8vw,6.25rem)] font-black uppercase leading-[0.82] text-paper">
                <RiseText text={e.title} />
              </h1>
              {e.subtitle ? <p className="mt-4 max-w-[36ch] text-lg text-paper/70">{e.subtitle}</p> : null}

              <dl className="mt-8 grid gap-5 border-t border-paper/15 pt-6 sm:grid-cols-2">
                <div className="flex gap-3">
                  <CalendarIcon className="mt-0.5 shrink-0 text-marigold" />
                  <div>
                    <dt className="sr-only">When</dt>
                    <dd className="font-medium text-paper">{formatLongDate(e.startsAt, e.city.timezone)}, {new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: e.city.timezone }).format(new Date(e.startsAt * 1000))}</dd>
                    <dd className="text-sm text-paper/55">
                      Doors {formatTime(e.doorsAt, e.city.timezone)} · starts {e.published?.startTime === false ? "Not published" : formatTime(e.startsAt, e.city.timezone)}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <PinIcon className="mt-0.5 shrink-0 text-marigold" />
                  <div>
                    <dt className="sr-only">Where</dt>
                    <dd className="font-medium text-paper">
                      <Link href={`/v/${e.venue.slug}`} className="underline decoration-paper/25 underline-offset-4">
                        {e.venue.name}
                      </Link>
                    </dd>
                    <dd className="text-sm text-paper/55">{e.venue.area}</dd>
                  </div>
                </div>
              </dl>

              {e.officialUrl ? (
                <dl className="mt-5 space-y-2 text-sm text-paper/70">
                  <div><dt className="inline">Official end time: </dt><dd className="inline">{e.published?.endTime ? formatTime(e.endsAt, e.city.timezone) : "Not published"}</dd></div>
                  <div><dt className="inline">Venue capacity: </dt><dd className="inline">{e.published?.capacity ? e.venue.capacity.toLocaleString("en-IN") : "Not published"}</dd></div>
                  <div><dt className="inline">Duration: </dt><dd className="inline">{e.published?.duration ? `${e.durationMins} minutes` : "Not published"}</dd></div>
                  <div><dt className="inline">Test booking settings: </dt><dd className="inline">availability and seats are demo allocations. Any booking window is for this test only.</dd></div>
                </dl>
              ) : null}
              <div className="mt-8 rounded-[6px] bg-paper p-5 text-ink sm:p-6">
                <TicketPanel
                  event={{
                    id: e.id,
                    title: e.title,
                    chainEventId: e.chainEventId,
                    priceUsd: e.priceUsd,
                    faceValueUnits: e.faceValueUnits,
                    capacity: e.capacity,
                    seated: e.seated,
                    sold: e.sold,
                    status: e.status,
                    startsAt: e.startsAt,
                    timezone: e.city.timezone,
                    venue: e.venue.name,
                    assurance,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1320px] px-5 py-14 md:px-8 md:py-20">
          <section aria-labelledby="about" className="grid gap-10 md:grid-cols-[1fr_220px] md:gap-16">
            <div>
              <h2 id="about" className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                About the night
              </h2>
              <div className="mt-4 max-w-[58ch] space-y-4 text-[17px] leading-relaxed text-ink-soft">
                {e.description.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              {e.highlights.length > 0 ? (
                <ul className="mt-8 space-y-2.5 text-sm">
                  {e.highlights.map((h) => (
                    <li key={h} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-stamp" />
                      {h}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {e.lineup.length > 0 ? (
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted">On stage</h2>
                <ul className="mt-4 space-y-1 font-display text-2xl font-bold uppercase leading-tight">
                  {e.lineup.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <p className="mt-14 text-sm text-muted">
            Hosted by{" "}
            <Link href={`/h/${e.host.slug}`} className="font-medium text-ink underline decoration-ink/30 underline-offset-4">
              {e.host.name}
            </Link>
            {" · "}
            <Link href="/how-it-works" className="underline decoration-ink/25 underline-offset-4">
              How tickets work
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
