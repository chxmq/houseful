import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventRow } from "@/components/event-row";
import { ArrowRight } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { host as getHost } from "@/server/queries";

const KIND_LABELS: Record<string, string> = {
  promoter: "Promoter",
  venue: "Venue",
  collective: "Collective",
  company: "Company",
  studio: "Studio",
  club: "Club",
};

export async function generateMetadata({ params }: PageProps<"/h/[slug]">) {
  const { slug } = await params;
  const h = await getHost(slug);
  return h ? { title: h.name, description: h.about } : { title: "Host not found" };
}

export default function HostPage({ params }: PageProps<"/h/[slug]">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <HostContent params={params} />
    </Suspense>
  );
}

async function HostContent({ params }: Pick<PageProps<"/h/[slug]">, "params">) {
  const { slug } = await params;
  const h = await getHost(slug);
  if (!h) notFound();

  const home = (h.upcoming[0] ?? h.past[0])?.city;
  const cityNames = [...new Set([...h.upcoming, ...h.past].map((e) => e.city.name))];

  return (
    <>
      <SiteHeader city={home} />

      <main id="main" className="flex-1">
        <section className="mx-auto grid max-w-[1320px] gap-10 px-5 pb-14 pt-12 md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] md:gap-16 md:px-8 md:pt-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Host · {KIND_LABELS[h.kind] ?? h.kind}
              {cityNames.length > 0 ? ` · ${cityNames.join(", ")}` : ""}
            </p>
            <h1 className="mt-4 font-display text-[clamp(3.25rem,10vw,9rem)] font-black uppercase leading-[0.8] tracking-[-0.01em] [overflow-wrap:anywhere]">
              <RiseText text={h.name} />
            </h1>
          </div>
          <div className="self-end border-t border-ink/20 pt-5 md:pb-3">
            <p className="text-lg leading-relaxed text-ink-soft">{h.about}</p>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {h.upcoming.length} upcoming · {h.past.length} past
            </p>
          </div>
        </section>

        <section aria-labelledby="upcoming" className="mx-auto max-w-[1320px] px-5 pb-16 md:px-8">
          <h2 id="upcoming" className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Coming up
          </h2>
          {h.upcoming.length > 0 ? (
            h.upcoming.map((e, i) => <EventRow key={e.id} event={e} index={i} />)
          ) : (
            <div className="border-t border-ink/20 pt-8">
              <p className="max-w-[44ch] text-ink-soft">{h.name} has nothing on sale right now.</p>
              {home ? (
                <Link href={`/${home.slug}`} className="mt-4 inline-flex items-center gap-2 font-medium">
                  See what is on in {home.name} <ArrowRight size={18} />
                </Link>
              ) : null}
            </div>
          )}
        </section>

        {h.past.length > 0 ? (
          <section aria-labelledby="past" className="bg-paper-deep">
            <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8">
              <h2 id="past" className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
                Already happened
              </h2>
              <div className="text-ink/70">
                {h.past.map((e, i) => (
                  <EventRow key={e.id} event={e} index={i} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}
