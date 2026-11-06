import "server-only";
import { and, asc, eq, gt, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db/client";
import {
  EVENT_CATEGORIES,
  cities,
  events,
  hosts,
  venues,
  type City,
  type EventCategory,
  type EventStatus,
  type Host,
  type HostKind,
  type PosterInk,
  type Venue,
} from "./db/schema";

// All timestamps are unix seconds. Day boundaries are computed in IST, which every seeded city uses.
const IST_OFFSET = 5.5 * 3600;
const DAY = 86400;
const LATE_NIGHT_CUTOFF = 5 * 3600;

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  music: "Music",
  comedy: "Comedy",
  theatre: "Theatre",
  sports: "Sports",
  food: "Food",
  workshops: "Workshops",
  nightlife: "Nightlife",
};

export type When = "tonight" | "weekend" | "month";

export type ListEventsInput = {
  city: string;
  category?: EventCategory;
  when?: When;
  q?: string;
  /** Unix seconds. Defaults to the current time. */
  now?: number;
  includePast?: boolean;
  limit?: number;
};

type TimeOptions = { now?: number };

export type CitySummary = City & { upcomingCount: number };

export type EventSummary = {
  id: string;
  slug: string;
  chainEventId: number | null;
  title: string;
  subtitle: string;
  category: EventCategory;
  categoryLabel: string;
  citySlug: string;
  city: { slug: string; name: string };
  venue: { id: string; slug: string; name: string; area: string };
  host: { id: string; slug: string; name: string };
  startsAt: number;
  doorsAt: number;
  endsAt: number;
  priceUsd: number;
  faceValueUnits: string;
  seated: boolean;
  capacity: number;
  sold: number;
  remaining: number;
  status: EventStatus;
  featured: boolean;
  ageLimit: number;
  language: string;
  durationMins: number;
  description: string;
  lineup: string[];
  highlights: string[];
  posterVariant: number;
  posterInk: PosterInk;
  surrenderCutoffHours: number;
};

export type EventDetail = Omit<EventSummary, "city" | "venue" | "host"> & {
  city: City;
  venue: Venue;
  host: Host;
};

export type VenueSummary = Venue & { upcomingCount: number };
export type VenueDetail = Venue & { city: City; upcoming: EventSummary[] };
export type HostDetail = Host & { upcoming: EventSummary[]; past: EventSummary[] };

export type CategoryShelf = {
  category: EventCategory;
  label: string;
  eventCount: number;
  events: EventSummary[];
};

const nowSeconds = (now?: number) => now ?? Math.floor(Date.now() / 1000);

const istDayStart = (t: number) => Math.floor((t + IST_OFFSET) / DAY) * DAY - IST_OFFSET;
const istWeekday = (t: number) => new Date((t + IST_OFFSET) * 1000).getUTCDay();

/** [from, to) window for a "when" filter, in unix seconds. */
export function whenWindow(when: When, now: number): { from: number; to: number } {
  const today = istDayStart(now);
  if (when === "tonight") return { from: now, to: today + DAY + LATE_NIGHT_CUTOFF };
  if (when === "month") return { from: now, to: now + 30 * DAY };

  const dow = istWeekday(now);
  const sunday = today + ((7 - dow) % 7) * DAY;
  const fridayEvening = sunday - 2 * DAY + 17 * 3600;
  return { from: Math.max(now, fridayEvening), to: sunday + DAY + LATE_NIGHT_CUTOFF };
}

const eventSelection = {
  event: events,
  cityName: cities.name,
  venueSlug: venues.slug,
  venueName: venues.name,
  venueArea: venues.area,
  hostSlug: hosts.slug,
  hostName: hosts.name,
};

type EventRow = {
  event: typeof events.$inferSelect;
  cityName: string;
  venueSlug: string;
  venueName: string;
  venueArea: string;
  hostSlug: string;
  hostName: string;
};

function baseEvent(e: typeof events.$inferSelect) {
  const { createdAt: _createdAt, ...rest } = e;
  return {
    ...rest,
    slug: e.id,
    categoryLabel: CATEGORY_LABELS[e.category],
    remaining: Math.max(0, e.capacity - e.sold),
    lineup: [...e.lineup],
    highlights: [...e.highlights],
  };
}

function toSummary(row: EventRow): EventSummary {
  const e = row.event;
  return {
    ...baseEvent(e),
    city: { slug: e.citySlug, name: row.cityName },
    venue: { id: e.venueId, slug: row.venueSlug, name: row.venueName, area: row.venueArea },
    host: { id: e.hostId, slug: row.hostSlug, name: row.hostName },
  };
}

function selectEvents(where: SQL | undefined) {
  return db
    .select(eventSelection)
    .from(events)
    .innerJoin(cities, eq(events.citySlug, cities.slug))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .innerJoin(hosts, eq(events.hostId, hosts.id))
    .where(where);
}

const upcomingFilter = (now: number) => and(ne(events.status, "past"), gt(events.endsAt, now));

const sellThrough = (e: EventSummary) => (e.capacity > 0 ? e.sold / e.capacity : 0);

export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

export async function listCities(opts: TimeOptions = {}): Promise<CitySummary[]> {
  const now = nowSeconds(opts.now);
  const rows = await db
    .select({
      slug: cities.slug,
      name: cities.name,
      state: cities.state,
      country: cities.country,
      timezone: cities.timezone,
      upcomingCount: sql<number>`count(${events.id})`,
    })
    .from(cities)
    .leftJoin(events, and(eq(events.citySlug, cities.slug), upcomingFilter(now)))
    .groupBy(cities.slug)
    .orderBy(sql`count(${events.id}) desc`, asc(cities.name));
  return rows.map((r) => ({ ...r, upcomingCount: Number(r.upcomingCount) }));
}

export async function getCity(slug: string): Promise<City | null> {
  const [row] = await db.select().from(cities).where(eq(cities.slug, slug)).limit(1);
  return row ? { ...row } : null;
}

export async function listEvents(input: ListEventsInput): Promise<EventSummary[]> {
  const now = nowSeconds(input.now);
  const conditions: (SQL | undefined)[] = [eq(events.citySlug, input.city)];

  if (input.category) conditions.push(eq(events.category, input.category));
  if (!input.includePast) conditions.push(upcomingFilter(now));
  if (input.when) {
    const { from, to } = whenWindow(input.when, now);
    conditions.push(lt(events.startsAt, to), gt(events.endsAt, from));
  }

  const term = input.q?.trim().toLowerCase().replace(/[%_]/g, "");
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        sql`lower(${events.title}) like ${pattern}`,
        sql`lower(${events.subtitle}) like ${pattern}`,
        sql`lower(${events.lineup}) like ${pattern}`,
        sql`lower(${venues.name}) like ${pattern}`,
        sql`lower(${venues.area}) like ${pattern}`,
        sql`lower(${hosts.name}) like ${pattern}`,
      ),
    );
  }

  const query = selectEvents(and(...conditions)).orderBy(asc(events.startsAt));
  const rows = input.limit ? await query.limit(input.limit) : await query;
  return rows.map(toSummary);
}

export async function getEvent(slug: string): Promise<EventDetail | null> {
  const [row] = await db
    .select({ event: events, city: cities, venue: venues, host: hosts })
    .from(events)
    .innerJoin(cities, eq(events.citySlug, cities.slug))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .innerJoin(hosts, eq(events.hostId, hosts.id))
    .where(eq(events.id, slug))
    .limit(1);
  if (!row) return null;
  return { ...baseEvent(row.event), city: { ...row.city }, venue: { ...row.venue }, host: { ...row.host } };
}

export async function getEventByChainId(chainEventId: number): Promise<EventDetail | null> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.chainEventId, chainEventId))
    .limit(1);
  return row ? getEvent(row.id) : null;
}

export async function listVenues(city: string, opts: TimeOptions = {}): Promise<VenueSummary[]> {
  const now = nowSeconds(opts.now);
  const rows = await db
    .select({ venue: venues, upcomingCount: sql<number>`count(${events.id})` })
    .from(venues)
    .leftJoin(events, and(eq(events.venueId, venues.id), upcomingFilter(now)))
    .where(eq(venues.citySlug, city))
    .groupBy(venues.id)
    .orderBy(sql`count(${events.id}) desc`, asc(venues.name));
  return rows.map((r) => ({ ...r.venue, upcomingCount: Number(r.upcomingCount) }));
}

export async function getVenue(slug: string, opts: TimeOptions = {}): Promise<VenueDetail | null> {
  const now = nowSeconds(opts.now);
  const [row] = await db
    .select({ venue: venues, city: cities })
    .from(venues)
    .innerJoin(cities, eq(venues.citySlug, cities.slug))
    .where(eq(venues.slug, slug))
    .limit(1);
  if (!row) return null;
  const upcoming = await selectEvents(and(eq(events.venueId, row.venue.id), upcomingFilter(now))).orderBy(
    asc(events.startsAt),
  );
  return { ...row.venue, city: { ...row.city }, upcoming: upcoming.map(toSummary) };
}

export async function getHost(slug: string, opts: TimeOptions = {}): Promise<HostDetail | null> {
  const now = nowSeconds(opts.now);
  const [host] = await db.select().from(hosts).where(eq(hosts.slug, slug)).limit(1);
  if (!host) return null;
  const rows = (await selectEvents(eq(events.hostId, host.id)).orderBy(asc(events.startsAt))).map(toSummary);
  const isPast = (e: EventSummary) => e.status === "past" || e.endsAt <= now;
  return {
    ...host,
    upcoming: rows.filter((e) => !isPast(e)),
    past: rows.filter(isPast).reverse(),
  };
}

/** Upcoming events in a city: hand-picked first, then by sell-through, then by date. */
export async function featuredEvents(city: string, opts: TimeOptions & { limit?: number } = {}): Promise<EventSummary[]> {
  const upcoming = await listEvents({ city, now: opts.now });
  return upcoming
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || sellThrough(b) - sellThrough(a) || a.startsAt - b.startsAt,
    )
    .slice(0, opts.limit ?? 6);
}

/** Categories ordered by tickets sold, each with its best-selling upcoming events. */
export async function trendingByCategory(
  city: string,
  opts: TimeOptions & { perCategory?: number } = {},
): Promise<CategoryShelf[]> {
  const upcoming = await listEvents({ city, now: opts.now });
  const groups = new Map<EventCategory, EventSummary[]>();
  for (const e of upcoming) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);

  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      label: CATEGORY_LABELS[category],
      eventCount: list.length,
      sold: list.reduce((n, e) => n + e.sold, 0),
      events: list
        .sort((a, b) => sellThrough(b) - sellThrough(a) || a.startsAt - b.startsAt)
        .slice(0, opts.perCategory ?? 4),
    }))
    .sort((a, b) => b.sold - a.sold || b.eventCount - a.eventCount)
    .map(({ sold: _sold, ...shelf }) => shelf);
}

export type { EventCategory, EventStatus, HostKind, PosterInk };
