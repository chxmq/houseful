import type { Metadata } from "next";
import Link from "next/link";
import { BoothQr } from "@/components/booth-qr";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatUsdt } from "@/lib/format";
import { getEvent } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Try Houseful",
  description: "Scan to buy a real testnet ticket. World ID simulator works without World App.",
};

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_SLUG ?? "the-last-local-nsci-dome";

function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export default async function TryPage() {
  const event = await getEvent(DEMO_SLUG);
  const href = `${appOrigin()}/e/${DEMO_SLUG}?from=booth`;
  const doorHref = `${appOrigin()}/door/${DEMO_SLUG}`;

  return (
    <>
      <SiteHeader city={event?.citySlug === "mumbai" ? { slug: "mumbai", name: "Mumbai" } : undefined} />
      <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-5 pb-20 pt-10 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">ETHGlobal booth</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,5rem)] font-black uppercase leading-[0.85]">
          Try a real ticket
        </h1>
        <p className="mt-4 max-w-[46ch] text-lg text-ink-soft">
          Scan, verify with the World ID simulator, pay face value on Unichain Sepolia, and open the rotating door code.
          Demo funds are topped up for you on this phone.
        </p>

        <div className="mt-10 rounded-[4px] border border-ink/15 bg-paper-deep p-6 md:p-8">
          <BoothQr href={href} />
          <p className="mt-4 break-all text-center font-mono text-[11px] text-muted">{href}</p>
        </div>

        {event ? (
          <div className="mt-8 border-t border-dashed border-ink/20 pt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">You will open</p>
            <p className="mt-2 font-display text-3xl font-extrabold uppercase leading-none">{event.title}</p>
            <p className="mt-2 text-sm text-ink-soft">
              {event.venue.name} · {formatUsdt(event.priceUsd)} · {event.remaining} seats left in the catalog view
            </p>
          </div>
        ) : (
          <p className="mt-8 text-sm text-reject">Demo show `{DEMO_SLUG}` is missing from the catalog.</p>
        )}

        <ol className="mt-10 space-y-4 text-sm leading-relaxed text-ink-soft">
          <li>
            <span className="font-semibold text-ink">1. Scan</span> on your phone. Stay on this network or the hosted URL.
          </li>
          <li>
            <span className="font-semibold text-ink">2. Pick a seat</span> if asked, then tap verify. In the World sheet,
            choose the <span className="font-semibold text-ink">simulator</span> if you do not have World App.
          </li>
          <li>
            <span className="font-semibold text-ink">3. Pay</span> the face price. Use Pay now, or Pay with Ethereum if
            you prefer.
          </li>
          <li>
            <span className="font-semibold text-ink">4. Open My tickets</span> for the live door code, then try{" "}
            <Link href={doorHref} className="font-semibold text-ink underline underline-offset-4">
              the door scanner
            </Link>{" "}
            on a second screen.
          </li>
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/e/${DEMO_SLUG}?from=booth`}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
          >
            Open on this screen
          </Link>
          <Link href="/tickets" className="rounded-full border border-ink/20 px-5 py-3 text-sm font-semibold">
            My tickets
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
