import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { cities, events, hosts, venues } from "../src/server/db/schema";
import { buildSearchQuery, parseSearchParams, searchHref, dateWindow } from "../src/server/search-query";

const now = Date.parse("2026-11-07T12:00:00Z") / 1000;
const zones = [{ slug: "mumbai", timezone: "Asia/Kolkata" }, { slug: "new-york", timezone: "America/New_York" }];
const client = createClient({ url: "file::memory:" });
const db = drizzle(client);
beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE cities (slug TEXT PRIMARY KEY, timezone TEXT);
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT, area TEXT);
    CREATE TABLE hosts (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, lineup TEXT, city_slug TEXT, venue_id TEXT, host_id TEXT, category TEXT, starts_at INTEGER, ends_at INTEGER, price_usd INTEGER, status TEXT);
    INSERT INTO cities VALUES ('mumbai','Asia/Kolkata'),('new-york','America/New_York');
    INSERT INTO venues VALUES ('v','Harbour Hall','Docks');
    INSERT INTO hosts VALUES ('h','Good Shows');
  `);
  for (const [id, title, city, category, start, price, status] of [
    ["a", "Saturday Music", "mumbai", "music", "2026-11-07T14:00Z", 10, "on_sale"],
    ["b", "Sunday Comedy", "mumbai", "comedy", "2026-11-08T14:00Z", 20, "sold_out"],
    ["c", "Monday Music", "new-york", "music", "2026-11-09T14:00Z", 10, "on_sale"],
    ["d", "100%_Live", "new-york", "theatre", "2026-12-01T14:00Z", 0, "announced"],
    ["past", "Past Music", "mumbai", "music", "2026-11-06T14:00Z", 1, "past"],
  ] as const) {
    const at = Date.parse(start) / 1000;
    await client.execute({ sql: "INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", args: [id, title, "An evening out", '["Guest Singer"]', city, "v", "h", category, at, at + 7200, price, status] });
  }
});
afterAll(() => client.close());

async function results(params: Record<string, string>) {
  const query = buildSearchQuery(parseSearchParams(params), zones, now);
  return (await db.select({ id: events.id, title: events.title, subtitle: events.subtitle, lineup: events.lineup, venue: venues.name, area: venues.area, host: hosts.name }).from(events)
    .innerJoin(cities, eq(events.citySlug, cities.slug))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .innerJoin(hosts, eq(events.hostId, hosts.id))
    .where(query.where).orderBy(...query.orderBy))
    .filter(row => query.matchesText([row.title, row.subtitle, ...row.lineup, row.venue, row.area, row.host]))
    .map(row => row.id);
}

describe("search URL", () => {
  it("validates untrusted values and preserves zero prices", () => {
    expect(parseSearchParams({ q: ["  music  ", "ignored"], city: "mumbai", category: "wrong", date: "forever", maxPrice: "0", sort: "oops" })).toEqual({ q: "music", city: "mumbai", category: undefined, date: undefined, maxPrice: 0, sort: "date" });
    for (const maxPrice of ["-1", "Infinity", "NaN", "1e9", "0x10", ""]) expect(parseSearchParams({ maxPrice }).maxPrice).toBeUndefined();
  });
  it("round trips filters without losing spaces or special characters", () => {
    const filters = parseSearchParams({ q: "live & loud", city: "mumbai", category: "music", date: "weekend", maxPrice: "12.5", sort: "price-desc" });
    const href = searchHref(filters);
    expect(parseSearchParams(Object.fromEntries(new URL(href, "http://local").searchParams))).toEqual(filters);
    expect(searchHref(parseSearchParams({}))).toBe("/search");
  });
});

describe("search query against real rows", () => {
  it("combines filters and includes sold-out shows", async () => {
    expect(await results({ q: "comedy", city: "mumbai", category: "comedy", date: "weekend", maxPrice: "20" })).toEqual(["b"]);
    expect(await results({ maxPrice: "0" })).toEqual(["d"]);
    expect(await results({ city: "missing" })).toEqual([]);
  });
  it("matches title, venue, area, host and lineup without treating punctuation as wildcards", async () => {
    expect(await results({ q: "%_" })).toEqual(["d"]);
    expect(await results({ q: "' OR 1=1 --" })).toEqual([]);
    for (const q of ["harbour", "docks", "good shows", "guest singer"]) expect(await results({ q })).toEqual(["a", "b", "c", "d"]);
  });
  it("matches accented titles regardless of case or composed spelling", async () => {
    await client.execute({ sql: "INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", args: ["accent", "Édith live", "", "[]", "mumbai", "v", "h", "music", now + 100, now + 7300, 5, "on_sale"] });
    try {
      for (const q of ["Édith", "édith", "ÉDITH", "E\u0301dith"]) expect(await results({ q })).toEqual(["accent"]);
    } finally {
      await client.execute("DELETE FROM events WHERE id = 'accent'");
    }
  });
  it("sorts prices with stable date and id tie breakers", async () => {
    expect(await results({ sort: "price-asc" })).toEqual(["d", "a", "c", "b"]);
    expect(await results({ sort: "price-desc" })).toEqual(["b", "a", "c", "d"]);
  });
  it("applies today, weekend, next seven days and calendar month", async () => {
    expect(await results({ date: "today" })).toEqual(["a"]);
    expect(await results({ date: "weekend" })).toEqual(["a", "b"]);
    expect(await results({ date: "week" })).toEqual(["a", "b", "c"]);
    expect(await results({ date: "month" })).toEqual(["a", "b", "c"]);
  });
});

describe("local calendar windows", () => {
  it("uses each city's local date even near midnight", () => {
    const at = Date.parse("2026-11-08T02:00Z") / 1000;
    expect(dateWindow("today", at, "Asia/Kolkata")).toEqual({ from: Date.parse("2026-11-07T18:30Z") / 1000, to: Date.parse("2026-11-08T18:30Z") / 1000 });
    expect(dateWindow("today", at, "America/New_York")).toEqual({ from: Date.parse("2026-11-07T05:00Z") / 1000, to: Date.parse("2026-11-08T05:00Z") / 1000 });
  });
  it("handles daylight saving, Sunday weekends and year rollover", () => {
    const sunday = Date.parse("2026-11-01T17:00Z") / 1000;
    expect(dateWindow("today", sunday, "America/New_York")).toEqual({ from: Date.parse("2026-11-01T04:00Z") / 1000, to: Date.parse("2026-11-02T05:00Z") / 1000 });
    expect(dateWindow("weekend", sunday, "America/New_York").to).toBe(Date.parse("2026-11-02T05:00Z") / 1000);
    expect(dateWindow("month", Date.parse("2026-12-31T12:00Z") / 1000, "Asia/Kolkata").to).toBe(Date.parse("2026-12-31T18:30Z") / 1000);
  });
});
