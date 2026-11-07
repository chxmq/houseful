import Link from "next/link";
import { AccountSlot } from "./auth/account-slot";
import { CityToggle } from "./city-toggle";

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
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:h-16 sm:gap-4 sm:px-5 md:px-8">
        <Link href={base} aria-label="Houseful home" className="shrink-0">
          <Wordmark />
        </Link>

        <div className="min-w-0 flex-1">
          <CityToggle active={city?.slug} compact />
        </div>

        <nav className="flex shrink-0 items-center gap-0.5 text-sm font-medium sm:gap-1">
          <Link href={city ? `/search?city=${city.slug}` : "/search"} className="hidden px-3 py-2 whitespace-nowrap md:block">
            Find
          </Link>
          <AccountSlot />
        </nav>
      </div>
    </header>
  );
}
