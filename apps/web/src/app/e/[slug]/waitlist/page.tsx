import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "@/components/icons";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WaitlistLedger } from "@/components/waitlist-ledger";
import { formatLongDate } from "@/lib/format";
import { event as getEvent } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/e/[slug]/waitlist">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  return { title: e ? `Waitlist for ${e.title}` : "Show not found" };
}

export default function WaitlistPage({ params }: PageProps<"/e/[slug]/waitlist">) {
  return (
    <Suspense fallback={<SiteHeader />}>
      <WaitlistContent params={params} />
    </Suspense>
  );
}

async function WaitlistContent({ params }: Pick<PageProps<"/e/[slug]/waitlist">, "params">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) notFound();

  return (
    <>
      <SiteHeader city={{ slug: e.citySlug, name: e.city?.name ?? e.citySlug }} />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-5 pb-24 pt-10 md:px-8 md:pt-14">
        <Link href={`/e/${e.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
          <ArrowLeft size={16} /> {e.title}
        </Link>
        <h1 className="mt-6 font-display text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-[0.82]">
          <RiseText text="The line" />
        </h1>
        <div className="mt-5 grid gap-6 text-ink-soft md:grid-cols-2">
          <p>
            Everyone waiting for {e.title} on {formatLongDate(e.startsAt)}, in the order they joined. Each live join is
            one World ID with one place in line; seeded demo seats skipped verification. When a ticket comes back it
            goes to the first person still waiting. Nobody, including the host, can reorder it.
          </p>
          <p>
            Each entry is folded into a running hash that the contract stores. This page recomputes that hash in your
            browser from the list below. If anyone had slipped in or been moved, it would not match.
          </p>
        </div>
        <div className="mt-12">
          {e.chainEventId != null ? (
            <WaitlistLedger chainEventId={e.chainEventId} />
          ) : (
            <p className="text-ink-soft">This show is not on sale through Houseful yet.</p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
