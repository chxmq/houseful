import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ScanIcon } from "@/components/icons";
import { Wordmark } from "@/components/site-header";
import { formatLongDate, formatTime } from "@/lib/format";
import { cityEvents } from "@/server/queries";

export const metadata: Metadata = {
  title: "Door",
  description: "Scan Houseful tickets at the door. Works with no network once synced.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#14110f",
};

export default function DoorIndexPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-ink text-paper">
      <header className="flex h-16 items-center gap-4 border-b border-paper/10 px-5 md:px-8">
        <Link href="/mumbai" aria-label="Houseful home">
          <Wordmark className="text-paper" />
        </Link>
        <span className="border-l border-paper/15 pl-4 font-mono text-xs uppercase tracking-[0.16em] text-paper/60">
          Door
        </span>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-10 md:px-8 md:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-marigold">For door staff</p>
        <h1 className="mt-3 font-display text-[clamp(3rem,11vw,6rem)] font-black uppercase leading-[0.85]">
          Pick a show to scan
        </h1>
        <p className="mt-4 max-w-[52ch] text-paper/70">
          Open the show, sync while you still have signal, then scan. Codes are checked on this device, so the door keeps
          working if the venue network drops.
        </p>

        <Suspense fallback={<p className="mt-10 font-mono text-xs uppercase tracking-[0.16em] text-paper/50">Loading shows</p>}>
          <ShowList />
        </Suspense>
      </div>
    </main>
  );
}

async function ShowList() {
  const shows = (await cityEvents("mumbai")).filter((e) => e.chainEventId != null);

  if (shows.length === 0) {
    return <p className="mt-10 text-paper/70">No Mumbai shows are selling on Houseful right now.</p>;
  }

  return (
    <ul className="mt-10 border-t border-paper/15">
      {shows.map((show) => (
        <li key={show.id} className="border-b border-paper/15">
          <Link href={`/door/${show.slug}`} className="flex items-center gap-5 py-5">
            <ScanIcon size={22} className="shrink-0 text-marigold" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-3xl font-extrabold uppercase leading-[0.95]">{show.title}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60">
                {show.venue.name} · {formatLongDate(show.startsAt)} · Doors {formatTime(show.doorsAt)}
              </p>
            </div>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60 sm:block">
              {show.sold} sold
            </span>
            <ArrowRight className="shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
