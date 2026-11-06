import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventRow } from "@/components/event-row";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CATEGORY_LABELS, isEventCategory } from "@/server/catalog";
import { cities, city as getCity, cityEvents } from "@/server/queries";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];

export async function generateStaticParams() {
  const all = await cities();
  return all.flatMap((c) => CATEGORIES.map((category) => ({ city: c.slug, category })));
}

export async function generateMetadata({ params }: PageProps<"/[city]/c/[category]">) {
  const { city, category } = await params;
  const c = await getCity(city);
  if (!c || !isEventCategory(category)) return { title: "Not found" };
  return { title: `${CATEGORY_LABELS[category]} in ${c.name}` };
}

export default function CategoryPage({ params }: PageProps<"/[city]/c/[category]">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <CategoryContent params={params} />
    </Suspense>
  );
}

async function CategoryContent({ params }: Pick<PageProps<"/[city]/c/[category]">, "params">) {
  const { city: slug, category } = await params;
  if (!isEventCategory(category)) notFound();
  const city = await getCity(slug);
  if (!city) notFound();

  const [all, events] = await Promise.all([cityEvents(slug), cityEvents(slug, category)]);
  const upcoming = events.filter((e) => e.status !== "past");
  const waitlisted = upcoming.filter((e) => e.status === "sold_out").length;
  const counts = all
    .filter((e) => e.status !== "past")
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    }, {});
  const label = CATEGORY_LABELS[category];

  return (
    <>
      <SiteHeader city={city} />

      <main className="flex-1">
        <section className="mx-auto max-w-[1320px] px-5 pb-10 pt-12 md:px-8 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            <Link href={`/${slug}`} className="inline-flex items-center gap-1.5">
              <ArrowLeft size={14} /> All of {city.name}
            </Link>
            <span className="mx-2">·</span>
            {upcoming.length} {upcoming.length === 1 ? "show" : "shows"}
            {waitlisted > 0 ? ` · ${waitlisted} sold out with a waitlist` : ""}
          </p>
          <h1 className="mt-4 font-display text-[clamp(3.5rem,12vw,11rem)] font-black uppercase leading-[0.8] tracking-[-0.01em]">
            <RiseText text={label} />
            <br />
            <RiseText text={`in ${city.name}`} delay={0.15} className="text-stamp" />
          </h1>

          <nav aria-label="Categories" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/15 pt-5">
            {CATEGORIES.filter((c) => c === category || counts[c]).map((c) => {
              const active = c === category;
              return (
                <Link
                  key={c}
                  href={`/${slug}/c/${c}`}
                  aria-current={active ? "page" : undefined}
                  className={`font-display text-2xl font-bold uppercase ${active ? "text-stamp underline decoration-[3px] underline-offset-[6px]" : "text-ink"}`}
                >
                  {CATEGORY_LABELS[c]}
                  <sup className="ml-1 font-mono text-[11px] font-normal text-muted">{counts[c] ?? 0}</sup>
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 pb-24 pt-6 md:px-8">
          {upcoming.length > 0 ? (
            upcoming.map((e, i) => <EventRow key={e.id} event={e} index={i} />)
          ) : (
            <div className="grid gap-6 border-t border-ink/20 pt-10 md:grid-cols-[1fr_1.2fr]">
              <p className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-black uppercase leading-[0.85]">
                Nothing listed yet
              </p>
              <div className="text-ink-soft">
                <p className="max-w-[44ch]">
                  No {label.toLowerCase()} shows are listed in {city.name} right now. New shows appear here as soon as a
                  host lists them.
                </p>
                <Link href={`/${slug}`} className="mt-5 inline-flex items-center gap-2 font-medium text-ink">
                  See everything in {city.name} <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
