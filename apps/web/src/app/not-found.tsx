import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-5 py-24 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">404</p>
        <h1 className="mt-3 font-display text-[clamp(3rem,10vw,6rem)] font-black uppercase leading-[0.85]">
          Seat not found
        </h1>
        <p className="mt-4 max-w-[42ch] text-lg text-ink-soft">
          That page is gone, or the show was never listed. Pick a city and see what is still on sale.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/mumbai" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper">
            What&apos;s on in Mumbai
          </Link>
          <Link href="/cities" className="rounded-full border border-ink/20 px-5 py-3 text-sm font-semibold">
            All cities
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
