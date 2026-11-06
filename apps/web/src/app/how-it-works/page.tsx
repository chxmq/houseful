import type { Metadata } from "next";
import Link from "next/link";
import { TicketJourney } from "@/components/how/ticket-journey";
import { ArrowRight } from "@/components/icons";
import { RiseText, RuleReveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Follow one ticket from sale to door: one person, a fixed price, returns to the waitlist, door codes and cancelled-show refunds.",
};

const contents = [
  { id: "one-person", n: "01", label: "One person" },
  { id: "face-value", n: "02", label: "Face value" },
  { id: "hand-it-back", n: "03", label: "Resell at face value" },
  { id: "the-door", n: "04", label: "The door" },
  { id: "cancelled", n: "05", label: "Cancelled shows" },
];

const limits = [
  {
    title: "Someone can still be paid to queue.",
    body: "Someone can still pay another person to buy and attend, or buy access to their phone or wallet outside this app. A person check does not prevent those arrangements.",
  },
  {
    title: "The waitlist is first come, first served.",
    body: "Whoever joins first gets the next seat that comes back. It is not a lottery and it does not know who the bigger fan is. People can check the order of the line.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="flex-1">
        <section className="mx-auto grid max-w-[1320px] gap-12 px-5 pb-16 pt-12 md:px-8 md:pt-20 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">How it works</p>
            <h1 className="mt-4 font-display text-[clamp(3.75rem,12vw,11.5rem)] font-black uppercase leading-[0.8] tracking-[-0.01em]">
              <RiseText text="Follow" />
              <br />
              <RiseText text="one ticket" delay={0.12} />
              <br />
              <RiseText text="to the door" delay={0.24} className="text-stamp" />
            </h1>
          </div>
          <div className="lg:pb-4">
            <p className="text-lg leading-relaxed text-ink-soft">
              Follow a sample ticket priced at $18 in test USDT: buying it, returning it, showing it at the door and
              asking for a refund if the show is cancelled. These examples are for testing, not real admission.
            </p>
            <ol className="mt-8 border-t border-ink/20">
              {contents.map((c) => (
                <li key={c.id} className="border-b border-ink/10">
                  <a href={`#${c.id}`} className="flex items-baseline gap-4 py-2.5">
                    <span className="font-mono text-[11px] text-muted">{c.n}</span>
                    <span className="font-display text-xl font-bold uppercase">{c.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <TicketJourney />

        <section aria-labelledby="limits" className="bg-ink text-paper">
          <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-paper/50">Being straight with you</p>
              <h2
                id="limits"
                className="mt-4 font-display text-[clamp(3rem,7vw,6rem)] font-black uppercase leading-[0.84]"
              >
                What this does not fix
              </h2>
            </div>
            <ol className="lg:pt-10">
              {limits.map((item, i) => (
                <li key={item.title} className="grid grid-cols-[3rem_1fr] border-t border-paper/15 py-8">
                  <span className="font-mono text-xs text-paper/50">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-display text-3xl font-extrabold uppercase leading-[0.95] text-marigold">
                      {item.title}
                    </h3>
                    <p className="mt-3 max-w-[52ch] leading-relaxed text-paper/75">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 md:px-8 md:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Now go out</p>
          <ul className="mt-6">
            <li>
              <RuleReveal>
                <Link
                  href="/cities"
                  className="flex items-end justify-between gap-6 py-6 font-display text-[clamp(2.75rem,8vw,7rem)] font-black uppercase leading-[0.85]"
                >
                  Find your city
                  <ArrowRight size={56} className="mb-2 hidden shrink-0 text-stamp md:block" />
                </Link>
              </RuleReveal>
            </li>
            <li>
              <RuleReveal index={1}>
                <Link
                  href="/host"
                  className="flex items-end justify-between gap-6 py-6 font-display text-[clamp(2.75rem,8vw,7rem)] font-black uppercase leading-[0.85] text-ink-soft"
                >
                  List a show
                  <ArrowRight size={56} className="mb-2 hidden shrink-0 md:block" />
                </Link>
              </RuleReveal>
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
