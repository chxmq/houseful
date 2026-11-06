import Link from "next/link";
import { TicketIcon } from "./icons";

type SiteHeaderProps = {
  city?: { slug: string; name: string };
};

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-[28px] font-black uppercase leading-none tracking-[0.02em] ${className}`}>
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 14h52v11a7 7 0 0 0 0 14v11H6V39a7 7 0 0 0 0-14z" fill="#e2401b" />
        <path d="M23 22v20M41 22v20M23 32h18" stroke="#f1ece2" strokeWidth="6" />
      </svg>
      Houseful
    </span>
  );
}

export function SiteHeader({ city }: SiteHeaderProps) {
  const base = city ? `/${city.slug}` : "/mumbai";

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-5 md:px-8">
        <Link href={base} aria-label="Houseful home">
          <Wordmark />
        </Link>

        {city ? (
          <Link
            href="/cities"
            className="hidden items-center gap-1.5 border-l border-ink/15 pl-5 font-mono text-xs uppercase tracking-[0.16em] text-ink-soft md:inline-flex"
          >
            {city.name}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </Link>
        ) : null}

        <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
          <Link href={base} className="hidden px-3 py-2 sm:block">
            What&apos;s on
          </Link>
          <Link href="/how-it-works" className="hidden px-3 py-2 lg:block">
            How it works
          </Link>
          <Link href="/host" className="hidden px-3 py-2 sm:block">
            For hosts
          </Link>
          <Link
            href="/tickets"
            className="ml-2 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-paper"
          >
            <TicketIcon size={16} />
            <span className="sr-only sm:not-sr-only">Your tickets</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
