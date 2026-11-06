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
        <div className="relative overflow-hidden border-b border-ink/10 bg-ink text-paper">
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(226,64,27,0.55), transparent 70%)" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-32 -left-16 size-[22rem] rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(242,165,26,0.35), transparent 70%)" }}
            aria-hidden
          />

          <div className="relative mx-auto grid w-full max-w-[1320px] gap-10 px-5 py-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-14 md:px-8 md:py-14">
            <div className="md:sticky md:top-24 md:self-start">
              <EventPoster
                title={e.title}
                subtitle={e.subtitle}
                variant={e.posterVariant}
                ink={e.posterInk}
                startsAt={e.startsAt}
                venue={e.venue.name}
                className="rounded-[6px] shadow-[0_40px_80px_-28px_rgba(0,0,0,0.65)] ring-1 ring-paper/10"
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
                {/^\d+$/.test(String(e.ageLimit)) ? `${e.ageLimit}+` : e.ageLimit}
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
                    <dd className="font-medium text-paper">{formatLongDate(e.startsAt)}</dd>
                    <dd className="text-sm text-paper/55">
                      Doors {formatTime(e.doorsAt)} · starts {formatTime(e.startsAt)}
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

              <div className="mt-8 rounded-[6px] bg-paper p-5 text-ink shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] sm:p-6">
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
