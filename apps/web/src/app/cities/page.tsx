import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cities } from "@/server/queries";

export const metadata: Metadata = {
  title: "Choose a city",
  description: "Find shows by country and city. All bookings here are for testing.",
};

export default function CitiesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-12 md:px-8">
        <h1 className="font-display text-[clamp(3.5rem,10vw,7rem)] font-black uppercase leading-none">Choose a city</h1>
        <p className="mt-5 max-w-prose text-lg text-ink-soft">Find a show near you or plan a night away. Dates and times follow the city you choose.</p>
        <p className="mt-3 max-w-prose text-sm text-muted">All bookings here are tests. For real tickets, follow the official seller link on the show page.</p>
        <Suspense fallback={<p role="status" className="py-12">Loading cities…</p>}><CityList /></Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CityList() {
  const all = await cities();
  const countries = [...new Set(all.map(city => city.country))].sort();
  if (!all.length) return <p className="py-12">No cities are listed yet. Please try again later.</p>;
  return (
    <div className="mt-10 space-y-10">
      {countries.map(country => (
        <section key={country} aria-label={country}>
          <h2 className="border-b border-ink/30 pb-3 font-mono text-sm uppercase tracking-wider">{country}</h2>
          <ul className="divide-y divide-ink/20">
            {all.filter(city => city.country === country).sort((a, b) => a.name.localeCompare(b.name)).map(city => (
              <li key={city.slug}>
                <Link href={`/${city.slug}`} className="flex min-h-16 items-center justify-between gap-4 py-4">
                  <span className="min-w-0 break-words font-display text-4xl font-bold uppercase">{city.name}</span>
                  <span className="shrink-0 text-sm text-muted">{city.upcomingCount} {city.upcomingCount === 1 ? "show" : "shows"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
