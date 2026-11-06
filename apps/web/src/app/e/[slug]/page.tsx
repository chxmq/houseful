import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventPoster } from "@/components/event-poster";
import { CalendarIcon, PinIcon } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketPanel } from "@/components/ticket-panel";
import { assuranceCopy, assuranceFor } from "@/lib/assurance";
import { categoryLabel, formatUsdt, formatLongDate, formatTime } from "@/lib/format";
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
  const copy = assuranceCopy[assurance];

  return (
    <>
      <SiteHeader city={{ slug: e.citySlug, name: e.city?.name ?? e.citySlug }} />

      <main className="mx-auto grid w-full max-w-[1320px] flex-1 gap-10 px-5 pb-24 pt-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16 md:px-8 md:pt-12">
        <div className="md:sticky md:top-24 md:self-start">
          <EventPoster
            title={e.title}
            subtitle={e.subtitle}
            variant={e.posterVariant}
            ink={e.posterInk}
            startsAt={e.startsAt}
            venue={e.venue.name}
            className="rounded-[4px] shadow-[0_30px_60px_-30px_rgba(20,17,15,0.45)]"
          />
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            <Link href={`/${e.citySlug}/c/${e.category}`}>{categoryLabel[e.category] ?? e.category}</Link>
            {" · "}
            {e.language} · {e.durationMins} min · {/^\d+$/.test(String(e.ageLimit)) ? `${e.ageLimit}+` : e.ageLimit}
          </p>
          <h1 className="mt-3 font-display text-[clamp(3rem,8vw,6.5rem)] font-black uppercase leading-[0.82]">
            <RiseText text={e.title} />
          </h1>
          {e.subtitle ? <p className="mt-3 text-lg text-ink-soft">{e.subtitle}</p> : null}

          <dl className="mt-8 grid gap-4 border-y border-ink/15 py-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarIcon className="mt-0.5 shrink-0" />
              <div>
                <dt className="sr-only">When</dt>
                <dd className="font-medium">{formatLongDate(e.startsAt)}</dd>
                <dd className="text-sm text-muted">
                  Doors {formatTime(e.doorsAt)}, starts {formatTime(e.startsAt)}
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <PinIcon className="mt-0.5 shrink-0" />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="font-medium">
                  <Link href={`/v/${e.venue.slug}`}>{e.venue.name}</Link>
                </dd>
                <dd className="text-sm text-muted">{e.venue.area}</dd>
              </div>
            </div>
          </dl>

          <TicketPanel
            event={{
              id: e.id,
              title: e.title,
              chainEventId: e.chainEventId,
              priceUsd: e.priceUsd,
              faceValueUnits: e.faceValueUnits,
              capacity: e.capacity,
              sold: e.sold,
              status: e.status,
              startsAt: e.startsAt,
              venue: e.venue.name,
              assurance,
            }}
          />

          <section aria-labelledby="rules" className="mt-12">
            <h2 id="rules" className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              The rules on this ticket
            </h2>
            <ol className="mt-4 divide-y divide-dashed divide-ink/25 rounded-[4px] bg-paper-deep px-5 font-mono text-[13px] leading-relaxed">
              <Rule n={1} title={`${formatUsdt(e.priceUsd)}, for everyone, forever`}>
                The price is fixed in the contract when the show is listed. The host cannot raise it later and nobody can
                resell above it.
              </Rule>
              <Rule n={2} title={`One person, one ticket. Checked with ${copy.label}`}>
                {copy.why}
              </Rule>
              <Rule n={3} title="Cannot make it? Hand it back">
                Until {e.surrenderCutoffHours} hours before doors you can return your ticket. You get the full price back
                and the next verified person on the waitlist gets your seat in the same transaction.
              </Rule>
              <Rule n={4} title="Cancelled show, guaranteed refund">
                If the host cancels, every ticket holder can pull their money back from the contract. Nobody, including
                us, can stop that refund.
              </Rule>
              <Rule n={5} title="Entry by live code, works offline">
                Your ticket shows a code that changes every 20 seconds and is signed by your phone. A screenshot stops
                working before it can be shared.
              </Rule>
            </ol>
          </section>

          <section aria-labelledby="about" className="mt-12 grid gap-8 md:grid-cols-[1fr_200px]">
            <div>
              <h2 id="about" className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                About
              </h2>
              <div className="mt-3 space-y-4 text-[17px] leading-relaxed text-ink-soft">
                {e.description.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              {e.highlights.length > 0 ? (
                <ul className="mt-6 space-y-2 text-sm">
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
                <ul className="mt-3 space-y-1 font-display text-2xl font-bold uppercase leading-tight">
                  {e.lineup.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <p className="mt-12 text-sm text-muted">
            Hosted by{" "}
            <Link href={`/h/${e.host.slug}`} className="font-medium text-ink underline decoration-ink/30 underline-offset-4">
              {e.host.name}
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Rule({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-2 py-4">
      <span className="text-muted">{String(n).padStart(2, "0")}</span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-ink-soft">{children}</p>
      </div>
    </li>
  );
}
