import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventRow } from "@/components/event-row";
import { ArrowRight, PinIcon } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { venue as getVenue } from "@/server/queries";

const KIND_LABELS: Record<string, string> = {
  arena: "Arena",
  outdoor: "Open air",
  auditorium: "Auditorium",
  theatre: "Theatre",
  club: "Club",
  studio: "Studio",
  arts_space: "Arts space",
  brewpub: "Brewpub",
  meeting_point: "Meeting point",
  trail: "Trailhead",
};

const count = new Intl.NumberFormat("en-IN");

export async function generateMetadata({ params }: PageProps<"/v/[slug]">) {
  const { slug } = await params;
  const v = await getVenue(slug);
  return v ? { title: `${v.name}, ${v.area}`, description: v.address } : { title: "Venue not found" };
}

export default function VenuePage({ params }: PageProps<"/v/[slug]">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <VenueContent params={params} />
    </Suspense>
  );
}

async function VenueContent({ params }: Pick<PageProps<"/v/[slug]">, "params">) {
  const { slug } = await params;
  const v = await getVenue(slug);
  if (!v) notFound();

  const maps = `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  const kind = KIND_LABELS[v.kind] ?? v.kind;
  const gathering = v.kind === "meeting_point" || v.kind === "trail";

  return (
    <>
      <SiteHeader city={v.city} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[1320px] px-5 pb-12 pt-12 md:px-8 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {kind} · {v.area}, {v.city.name}
          </p>
          <h1 className="mt-4 max-w-[14ch] font-display text-[clamp(3.25rem,11vw,10rem)] font-black uppercase leading-[0.8] tracking-[-0.01em] [overflow-wrap:anywhere]">
            <RiseText text={v.name} />
          </h1>

          <dl className="mt-12 grid gap-y-8 border-t border-ink/15 pt-6 md:ml-[22%] md:grid-cols-[10rem_10rem_1fr] md:gap-x-10">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Kind</dt>
              <dd className="mt-1 font-display text-3xl font-bold uppercase">{kind}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                {gathering ? "Group size" : "Capacity"}
              </dt>
              <dd className="mt-1 font-display text-3xl font-bold uppercase">{v.capacity > 0 ? count.format(v.capacity) : "Not published"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                {gathering ? "Meet at" : "Address"}
              </dt>
              <dd className="mt-1 max-w-[40ch] text-ink-soft">{v.address}</dd>
              <dd className="mt-3">
                <a
                  href={maps}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 font-medium underline decoration-ink/30 underline-offset-4"
                >
                  <PinIcon size={18} /> Open in Google Maps
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="upcoming" className="mx-auto max-w-[1320px] px-5 pb-24 md:px-8">
          <h2 id="upcoming" className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Coming up at {v.name} · {v.upcoming.length}
          </h2>
          {v.upcoming.length > 0 ? (
            v.upcoming.map((e, i) => <EventRow key={e.id} event={e} index={i} />)
          ) : (
            <div className="border-t border-ink/20 pt-8">
              <p className="max-w-[44ch] text-ink-soft">Nothing is listed here right now.</p>
              <Link href={`/${v.city.slug}`} className="mt-4 inline-flex items-center gap-2 font-medium">
                See what is on in {v.city.name} <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
