import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import { ShowForm, type VenueOption } from "@/components/host/show-form";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireHost } from "@/server/auth/session";
import { listVenues } from "@/server/catalog";

export const metadata: Metadata = { title: "List a show" };

async function mumbaiVenues(): Promise<VenueOption[]> {
  "use cache";
  cacheLife("hours");
  const venues = await listVenues("mumbai");
  return venues
    .map((v) => ({ id: v.id, name: v.name, area: v.area, capacity: v.capacity }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function requestTime() {
  await connection();
  return Math.floor(Date.now() / 1000);
}

async function FormForToday() {
  const [now, venues] = await Promise.all([requestTime(), mumbaiVenues()]);
  return <ShowForm venues={venues} now={now} />;
}

export default async function NewShowPage() {
  await requireHost("/host/new");
  return (
    <>
      <SiteHeader city={{ slug: "mumbai", name: "Mumbai" }} />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 pb-24 pt-12 md:px-8 md:pt-16">
        <h1 className="font-display text-[clamp(3.5rem,10vw,8rem)] font-black uppercase leading-[0.82]">
          <RiseText text="List a show" />
        </h1>
        <p className="mt-4 max-w-[58ch] text-ink-soft">
          Your terms are written to a public contract the moment you list. Face value is fixed, every ticket belongs to a
          verified person, and a cancelled show refunds everyone without asking you.
        </p>
        <div className="mt-14">
          <Suspense fallback={<p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading venues</p>}>
            <FormForToday />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
