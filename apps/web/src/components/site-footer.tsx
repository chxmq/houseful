import Link from "next/link";
import { Wordmark } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink text-paper">
      <div className="mx-auto max-w-[1320px] px-5 pb-10 pt-16 md:px-8">
        <p className="max-w-[18ch] font-display text-[clamp(2.75rem,7vw,6rem)] font-black uppercase leading-[0.85]">
          One person. One ticket. Face value.
        </p>

        <div className="mt-14 flex flex-col gap-10 border-t border-paper/15 pt-8 md:flex-row md:items-end md:justify-between">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[46ch] text-sm text-paper/65">
              Tickets are held by a public contract. Hosts cannot raise the price after the sale, resellers cannot
              list above face value, and refunds on a cancelled show cannot be blocked.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-paper/80">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/host">Host a show</Link>
            <Link href="/tickets">Your tickets</Link>
            <Link href="/door">Door scanner</Link>
            <Link href="/cities">Cities</Link>
            <a href="https://github.com/chxmq/houseful" rel="noreferrer">
              Source
            </a>
          </nav>
        </div>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
          Built at ETHGlobal Mumbai, November 2026. Testnet only.
        </p>
      </div>
    </footer>
  );
}
