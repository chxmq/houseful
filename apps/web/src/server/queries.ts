import { cacheLife, cacheTag } from "next/cache";
import * as catalog from "./catalog";

export async function cities() {
  "use cache";
  cacheLife("hours");
  return catalog.listCities();
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
