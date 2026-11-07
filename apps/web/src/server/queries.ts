import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { isDemoCity, sortDemoCities } from "@/lib/demo-cities";
import * as catalog from "./catalog";
import type { SearchFilters } from "./search-query";

export async function cities() {
  "use cache";
  cacheLife("hours");
  return sortDemoCities((await catalog.listCities()).filter((c) => isDemoCity(c.slug)));
}

export async function city(slug: string) {
  "use cache";
  cacheLife("hours");
  return catalog.getCity(slug);
}

export async function cityEvents(citySlug: string, category?: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  return catalog.listEvents({ city: citySlug, category: category as catalog.ListEventsInput["category"] });
}

/** Upcoming and past shows with a chain id, so refunds stay visible after endsAt. */
export async function cityEventsForWallet(citySlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  return catalog.listEvents({ city: citySlug, includePast: true });
}

export async function featured(citySlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  return catalog.featuredEvents(citySlug);
}

export async function event(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("events", `event:${slug}`);
  return catalog.getEvent(slug);
}

export async function venue(slug: string) {
  "use cache";
  cacheLife("minutes");
  return catalog.getVenue(slug);
}

export async function host(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  return catalog.getHost(slug);
}

/** Request-time results keep local date windows and URL filters current. */
export async function searchEvents(filters: SearchFilters) {
  await connection();
  return catalog.searchEvents(filters);
}
