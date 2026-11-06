import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SearchResults } from "@/components/search-results";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { cities, searchEvents } from "@/server/queries";
import { parseSearchParams, searchHref } from "@/server/search-query";

export const metadata: Metadata = { title: "Find a show", description: "Find shows by city, date, category and price." };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return <Suspense fallback={<><SiteHeader /><main id="main" className="mx-auto w-full max-w-[1320px] px-5 py-12"><p role="status">Finding shows…</p></main></>}><SearchContent searchParams={searchParams} /></Suspense>;
}

async function SearchContent({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const filters = parseSearchParams(await searchParams);
  const [allCities, events] = await Promise.all([cities(), searchEvents(filters)]);
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-10 md:px-8">
        <h1 className="mb-6 font-display text-6xl font-black uppercase">Find a show</h1>
        <SearchForm key={searchHref(filters)} filters={filters} cities={allCities} />
        <SearchResults events={events} resetHref={filters.city ? searchHref(parseSearchParams({ city: filters.city })) : "/search"} />
      </main>
      <SiteFooter />
    </>
  );
}
