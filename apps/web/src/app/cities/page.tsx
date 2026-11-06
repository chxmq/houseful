import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "@/components/icons";
import { RiseText, RuleReveal } from "@/components/motion/reveal";
import { Stamp } from "@/components/motion/stamp";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cities } from "@/server/queries";

export const metadata: Metadata = {
  title: "Choose a city",
  description: "Pick a city to see what is on. Booking is live in Mumbai.",
};

const BOOKING_LIVE = new Set(["mumbai"]);

export default function CitiesPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1320px] px-5 pb-8 pt-12 md:px-8 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Cities</p>
          <h1 className="mt-4 font-display text-[clamp(3.5rem,10vw,9rem)] font-black uppercase leading-[0.8]">
            <RiseText text="Where are" />
            <br />
            <RiseText text="you going out?" delay={0.15} />
          </h1>
          <p className="mt-8 max-w-[52ch] text-lg text-ink-soft md:ml-[20%]">
            Booking is open in Mumbai. The other cities list their shows so you can see what is coming, and open for
            booking as their hosts join.
          </p>
        </section>

        <Suspense fallback={<div className="mx-auto h-[60vh] max-w-[1320px]" />}>
          <CityList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CityList() {
  const all = await cities();
  const ordered = [...all].sort((a, b) => Number(BOOKING_LIVE.has(b.slug)) - Number(BOOKING_LIVE.has(a.slug)));

  return (
    <ol className="mx-auto max-w-[1320px] px-5 pb-24 md:px-8">
      {ordered.map((c, i) => {
        const live = BOOKING_LIVE.has(c.slug);
        return (
          <li key={c.slug}>
            <RuleReveal index={i}>
              <Link
                href={`/${c.slug}`}
                className="grid grid-cols-[2.5rem_1fr] items-end gap-x-4 gap-y-3 py-6 md:grid-cols-[4rem_1fr_16rem] md:gap-x-8 md:py-8"
              >
                <span className="self-start pt-3 font-mono text-xs text-muted md:pt-5">{String(i + 1).padStart(2, "0")}</span>
                <span
                  className={`font-display text-[clamp(3.75rem,13vw,11.5rem)] font-black uppercase leading-[0.78] ${live ? "text-ink" : "text-ink/80"}`}
                >
                  {c.name}
                </span>
                <span className="col-start-2 flex flex-wrap items-center gap-x-5 gap-y-2 pb-2 md:col-start-auto md:flex-col md:items-end md:gap-3 md:text-right">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{c.state}</span>
                  <span className="font-mono text-sm">
                    {c.upcomingCount} upcoming {c.upcomingCount === 1 ? "show" : "shows"}
                  </span>
                  {live ? (
                    <Stamp label="Booking live" rotate={-6} delay={0.3} className="text-xl" />
                  ) : (
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Listings only</span>
                  )}
                </span>
              </Link>
            </RuleReveal>
          </li>
        );
      })}
      <li className="border-t border-ink/20 pt-8">
        <Link href="/host" className="inline-flex items-center gap-2 font-medium">
          Running shows in another city? List them on Houseful <ArrowRight size={18} />
        </Link>
      </li>
    </ol>
  );
}
