import Link from "next/link";
import { AccountSlot } from "./auth/account-slot";

type SiteHeaderProps = {
  city?: { slug: string; name: string };
};

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display text-[22px] font-black uppercase leading-none tracking-[0.02em] sm:gap-2 sm:text-[28px] ${className}`}>
      <svg className="h-[22px] w-[22px] sm:h-[26px] sm:w-[26px]" viewBox="0 0 64 64" aria-hidden="true">
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
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 overflow-x-clip px-4 sm:gap-4 sm:px-5 md:gap-6 md:px-8">
        <Link href={base} aria-label="Houseful home" className="min-w-0 shrink">
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

        <nav className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 text-sm font-medium sm:gap-1">
          <Link href={city ? `/search?city=${city.slug}` : "/search"} className="hidden px-3 py-2 whitespace-nowrap sm:block">
            Find shows
          </Link>
          <Link href={base} className="hidden px-3 py-2 md:block">
            What&apos;s on
          </Link>
          <Link href="/how-it-works" className="hidden px-3 py-2 lg:block">
            How it works
          </Link>
          <AccountSlot />
        </nav>
      </div>
    </header>
  );
}
