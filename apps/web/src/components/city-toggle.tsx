"use client";

import Link from "next/link";
import { DEMO_CITY_LABELS, DEMO_CITY_SLUGS, isDemoCity } from "@/lib/demo-cities";

type CityToggleProps = {
  active?: string;
  compact?: boolean;
};

/** One-tap switch: Mumbai · New York · London · Tokyo */
export function CityToggle({ active, compact = false }: CityToggleProps) {
  const current = active && isDemoCity(active) ? active : null;

  return (
    <nav
      aria-label="Cities"
      className={`flex items-center ${compact ? "gap-1 overflow-x-auto [scrollbar-width:none]" : "flex-wrap gap-2"}`}
    >
      {DEMO_CITY_SLUGS.map((slug) => {
        const on = current === slug;
        return (
          <Link
            key={slug}
            href={`/${slug}`}
            aria-current={on ? "page" : undefined}
            className={
              compact
                ? `shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                    on ? "bg-ink text-paper" : "border border-ink/15 text-ink hover:border-ink/40"
                  }`
                : `rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    on ? "bg-ink text-paper" : "border border-ink/20 text-ink hover:border-ink/40"
                  }`
            }
          >
            {DEMO_CITY_LABELS[slug]}
          </Link>
        );
      })}
    </nav>
  );
}
