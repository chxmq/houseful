import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CityToggle } from "@/components/city-toggle";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { sortDemoCities } from "@/lib/demo-cities";
import { cities } from "@/server/queries";

export const metadata: Metadata = {
  title: "Cities",
  description: "Mumbai, New York, London and Tokyo. All bookings here are for testing.",
};

export default function CitiesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-12 md:px-8">
        <h1 className="font-display text-[clamp(3.5rem,10vw,7rem)] font-black uppercase leading-none">Four cities</h1>
        <p className="mt-5 max-w-prose text-lg text-ink-soft">
          Mumbai, New York, London, Tokyo. Tap any city in the top bar to switch.
        </p>
        <div className="mt-8">
          <CityToggle />
        </div>
        <Suspense fallback={<p role="status" className="py-12">Loading…</p>}>
          <CityList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CityList() {
  const all = sortDemoCities(await cities());
  if (!all.length) return <p className="py-12">No cities are listed yet.</p>;
  return (
    <ul className="mt-12 divide-y divide-ink/15 border-y border-ink/15">
      {all.map((city) => (
        <li key={city.slug}>
          <Link href={`/${city.slug}`} className="flex min-h-16 items-center justify-between gap-4 py-5">
            <span className="font-display text-4xl font-bold uppercase sm:text-5xl">{city.name}</span>
            <span className="shrink-0 text-sm text-muted">
              {city.upcomingCount} {city.upcomingCount === 1 ? "show" : "shows"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
