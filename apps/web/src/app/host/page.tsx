import type { Metadata } from "next";
import { HostConsole, type CatalogShow } from "@/components/host/host-console";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireHost } from "@/server/auth/session";
import { cityEvents } from "@/server/queries";

export const metadata: Metadata = { title: "Host a show" };

const promises = [
  {
    title: "Your price stays your price",
    body: "Tickets sell at the face value you set and can only be handed back, never resold. There is no second market to lose money to.",
  },
  {
    title: "One ticket per person",
    body: "Every buyer verifies they are a unique human with World ID. Bots and bulk buyers cannot hold your room.",
  },
  {
    title: "A line nobody can cut",
    body: "When a show sells out, a public waitlist forms. Returned seats go to the next verified person, in order, automatically.",
  },
  {
    title: "Paid when the show ends",
    body: "Proceeds sit in the contract until the show is over, then go straight to your wallet. Cancel, and every fan can refund themselves.",
  },
];

export default async function HostPage() {
  await requireHost("/host");
  const events = await cityEvents("mumbai");
  const catalog: CatalogShow[] = events
    .filter((e) => e.chainEventId != null)
    .map((e) => ({ chainEventId: e.chainEventId!, slug: e.slug, title: e.title, startsAt: e.startsAt, priceUsd: e.priceUsd }));

  return (
    <>
      <SiteHeader city={{ slug: "mumbai", name: "Mumbai" }} />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 pb-24 pt-12 md:px-8 md:pt-16">
        <h1 className="font-display text-[clamp(3.5rem,10vw,8rem)] font-black uppercase leading-[0.82]">
          <RiseText text="Host a show" />
        </h1>
        <ol className="mt-10 grid max-w-[1000px] gap-x-12 gap-y-8 md:grid-cols-2">
          {promises.map((p, i) => (
            <li key={p.title} className="border-t border-ink/20 pt-4">
              <p className="font-mono text-xs text-stamp">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-lg font-semibold">{p.title}</p>
              <p className="mt-1 text-ink-soft">{p.body}</p>
            </li>
          ))}
        </ol>
        <h2 className="mt-20 font-display text-4xl font-extrabold uppercase leading-none">Your shows</h2>
        <div className="mt-6">
          <HostConsole catalog={catalog} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
