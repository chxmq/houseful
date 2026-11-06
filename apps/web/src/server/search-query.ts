import { and, asc, desc, eq, gt, gte, lte, lt, ne, or, sql } from "drizzle-orm";
import { EVENT_CATEGORIES, events, type EventCategory } from "./db/schema";

export const DATE_FILTERS = ["today", "weekend", "week", "month"] as const;
export const SEARCH_SORTS = ["date", "price-asc", "price-desc"] as const;
export type DateFilter = (typeof DATE_FILTERS)[number];
export type SearchFilters = {
  q: string;
  city?: string;
  category?: EventCategory;
  date?: DateFilter;
  maxPrice?: number;
  sort: (typeof SEARCH_SORTS)[number];
};
export type SearchParams = Record<string, string | string[] | undefined>;

/** First occurrence wins for repeated URL keys. Invalid filters fall back to all shows. */
export function parseSearchParams(params: SearchParams): SearchFilters {
  const value = (key: string) => {
    const raw = params[key];
    return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  };
  const category = value("category");
  const date = value("date");
  const sort = value("sort");
  const price = value("maxPrice");
  const maxPrice = /^\d+(\.\d{1,6})?$/.test(price) && Number.isSafeInteger(Math.ceil(Number(price))) ? Number(price) : undefined;
  return {
    q: value("q").slice(0, 200),
    city: value("city") || undefined,
    category: EVENT_CATEGORIES.find(c => c === category),
    date: DATE_FILTERS.find(d => d === date),
    maxPrice,
    sort: SEARCH_SORTS.find(s => s === sort) ?? "date",
  };
}

export function searchHref(filters: SearchFilters, path = "/search") {
  const params = new URLSearchParams();
  for (const key of ["q", "city", "category", "date", "maxPrice", "sort"] as const) {
    const value = filters[key];
    if (value !== undefined && value !== "" && !(key === "sort" && value === "date")) params.set(key, String(value));
  }
  return `${path}${params.size ? `?${params}` : ""}`;
}

const DAY = 86400;

function localParts(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(at * 1000));
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

/** Convert local midnight to UTC, resolving the offset at that date, including DST. */
function midnight(wallDate: number, timezone: string) {
  let at = wallDate;
  for (let i = 0; i < 4; i++) {
    const p = localParts(at, timezone);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
    const correction = wallDate - observed;
    at += correction;
    if (!correction) break;
  }
  return at;
}

/** Calendar windows are half open. Weekend means Saturday and Sunday. */
export function dateWindow(date: DateFilter, now: number, timezone: string) {
  const p = localParts(now, timezone);
  const today = Date.UTC(p.year, p.month - 1, p.day) / 1000;
  let from = today;
  let to = today + DAY;
  if (date === "week") to = today + 7 * DAY;
  if (date === "month") {
    from = Date.UTC(p.year, p.month - 1, 1) / 1000;
    to = Date.UTC(p.year, p.month, 1) / 1000;
  }
  if (date === "weekend") {
    const weekday = new Date(today * 1000).getUTCDay();
    from = today + (weekday === 0 ? -1 : 6 - weekday) * DAY;
    to = from + 2 * DAY;
  }
  return { from: midnight(from, timezone), to: midnight(to, timezone) };
}

/** Pure SQL builder, independent of the database connection and rendering runtime. */
export function buildSearchQuery(filters: SearchFilters, cities: { slug: string; timezone: string }[], now: number) {
  const conditions = [ne(events.status, "past"), gt(events.endsAt, now)];
  if (filters.city) conditions.push(eq(events.citySlug, filters.city));
  if (filters.category) conditions.push(eq(events.category, filters.category));
  if (filters.maxPrice !== undefined) conditions.push(lte(events.priceUsd, filters.maxPrice));
  // SQLite lower() only folds ASCII. Match text after SQL filters so accented
  // titles and queries use the same Unicode normalization on every database.
  const fold = (value: string) => value.normalize("NFKC").toLowerCase();
  const term = fold(filters.q);
  const matchesText = (values: readonly string[]) => !term || values.some(value => fold(value).includes(term));
  if (filters.date) {
    const relevant = cities.filter(city => !filters.city || city.slug === filters.city);
    conditions.push(or(...relevant.map(city => {
      const window = dateWindow(filters.date!, now, city.timezone);
      return and(eq(events.citySlug, city.slug), gte(events.startsAt, window.from), lt(events.startsAt, window.to));
    })) ?? sql`0`);
  }
  const prices = filters.sort === "price-asc" ? [asc(events.priceUsd)] : filters.sort === "price-desc" ? [desc(events.priceUsd)] : [];
  return { where: and(...conditions), orderBy: [...prices, asc(events.startsAt), asc(events.id)], matchesText };
}
