import Link from "next/link";
import { categoryLabel } from "@/lib/format";
import type { CitySummary } from "@/server/catalog";
import { EVENT_CATEGORIES } from "@/server/db/schema";
import type { SearchFilters } from "@/server/search-query";

const control = "mt-2 block min-h-11 w-full min-w-0 rounded-none border border-ink/30 bg-paper px-3 py-2 text-base";

export function SearchForm({ filters, cities, action = "/search", cityOnly = false }: {
  filters: SearchFilters;
  cities: CitySummary[];
  action?: string;
  cityOnly?: boolean;
}) {
  const countries = [...new Set(cities.map(city => city.country))].sort();
  return (
    <form action={action} method="get" className="border-y border-ink/20 py-6" role="search" aria-label="Find shows">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-sm font-medium sm:col-span-2">
          Search shows, artists or venues
          <input className={control} type="search" name="q" maxLength={200} defaultValue={filters.q} placeholder="Who do you want to see?" />
        </label>
        {!cityOnly ? (
          <label className="min-w-0 text-sm font-medium">
            City
            <select className={control} name="city" defaultValue={filters.city ?? ""}>
              <option value="">All cities</option>
              {filters.city && !cities.some(city => city.slug === filters.city) ? <option value={filters.city}>City not found</option> : null}
              {countries.map(country => (
                <optgroup key={country} label={country}>
                  {cities.filter(city => city.country === country).sort((a, b) => a.name.localeCompare(b.name)).map(city => <option key={city.slug} value={city.slug}>{city.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}
        <label className="min-w-0 text-sm font-medium">
          Category
          <select className={control} name="category" defaultValue={filters.category ?? ""}>
            <option value="">All categories</option>
            {EVENT_CATEGORIES.map(category => <option key={category} value={category}>{categoryLabel[category]}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          Date
          <select className={control} name="date" defaultValue={filters.date ?? ""}>
            <option value="">Any date</option>
            <option value="today">Today</option>
            <option value="weekend">This weekend</option>
            <option value="week">Next 7 days</option>
            <option value="month">This month</option>
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          Maximum price
          <input className={control} type="number" name="maxPrice" min="0" step="0.000001" defaultValue={filters.maxPrice ?? ""} placeholder="Any price" inputMode="decimal" />
        </label>
        <label className="min-w-0 text-sm font-medium">
          Sort by
          <select className={control} name="sort" defaultValue={filters.sort}>
            <option value="date">Soonest first</option>
            <option value="price-asc">Lowest price first</option>
            <option value="price-desc">Highest price first</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <button className="min-h-11 bg-ink px-5 py-2 font-medium text-paper" type="submit">Find shows</button>
          <Link href={action} className="py-3 text-sm underline">Clear filters</Link>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">Dates follow each city&apos;s local time. Copy this page&apos;s link to share your results.</p>
    </form>
  );
}
