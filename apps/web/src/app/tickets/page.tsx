import type { Metadata } from "next";
import { RiseText } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketWallet, type WalletEvent } from "@/components/ticket-wallet";
import { WalletBackup } from "@/components/wallet-backup";
import { cityEventsForWallet } from "@/server/queries";

export const metadata: Metadata = { title: "Your tickets" };

export default async function TicketsPage() {
  const events = await cityEventsForWallet("mumbai");
  const onChain: WalletEvent[] = events
    .filter((e) => e.chainEventId != null)
    .map((e) => ({
      slug: e.slug,
      chainEventId: e.chainEventId!,
      title: e.title,
      startsAt: e.startsAt,
      doorsAt: e.doorsAt,
      priceUsd: e.priceUsd,
      venue: e.venue.name,
    }));

  return (
    <>
      <SiteHeader city={{ slug: "mumbai", name: "Mumbai" }} />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 pb-24 pt-12 md:px-8 md:pt-16">
        <h1 className="font-display text-[clamp(3.5rem,10vw,8rem)] font-black uppercase leading-[0.82]">
          <RiseText text="Your tickets" />
        </h1>
        <p className="mt-4 max-w-[52ch] text-ink-soft">
          Show the live code at the door. It changes every 20 seconds and is signed by this phone. A screenshot may work
          on a fresh scanner for one or two rotations (about 20 to 40 seconds) until the window moves on.
        </p>
        <div className="mt-12">
          <TicketWallet events={onChain} />
        </div>
        <div className="mt-16 max-w-[52ch]">
          <WalletBackup />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
