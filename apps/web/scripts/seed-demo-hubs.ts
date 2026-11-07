/**
 * Keeps only Mumbai / New York / London / Tokyo.
 * Pads New York drafts that lack a USD quote so the city isn't a single listing.
 */
import "./load-env";
import catalogDrafts from "./data/catalog-drafts.json";
import { buildWorldwideCatalog } from "./worldwide-catalog";
import { DEMO_CITY_SLUGS } from "../src/lib/demo-cities";
import { eligibleDrafts, type CatalogDraft } from "../src/lib/catalog-draft";
import { db } from "../src/server/db/connection";
import { cities, events, hosts, venues } from "../src/server/db/schema";
import { eq, inArray, notInArray, sql } from "drizzle-orm";

const HUBS = DEMO_CITY_SLUGS.filter((s) => s !== "mumbai");
const KEEP = [...DEMO_CITY_SLUGS];
const DEMO_FALLBACK_USD = 25;

function padHubDrafts(drafts: readonly CatalogDraft[]): CatalogDraft[] {
  const eligible = new Set(eligibleDrafts(drafts).map((d) => d.slug));
  return drafts.map((draft) => {
    if (draft.city !== "New York" || eligible.has(draft.slug)) return draft;
    if (draft.startsAt == null || draft.venue == null || draft.priceUsd != null) return draft;
    return {
      ...draft,
      priceUsd: DEMO_FALLBACK_USD,
      priceLocal: draft.priceLocal ?? `USD ${DEMO_FALLBACK_USD} (demo)`,
      notes: `${draft.notes} Demo pad: test USDT ${DEMO_FALLBACK_USD}.`,
    };
  });
}

async function main() {
  const worldwide = buildWorldwideCatalog(padHubDrafts(catalogDrafts as CatalogDraft[]), 200);
  const hubCities = worldwide.cities.filter((c) => (HUBS as readonly string[]).includes(c.slug));
  const hubVenues = worldwide.venues.filter((v) => (HUBS as readonly string[]).includes(v.citySlug));
  const hubEvents = worldwide.events.filter((e) => (HUBS as readonly string[]).includes(e.citySlug));
  const hubHosts = worldwide.hosts;

  if (!hubCities.length || !hubEvents.length) {
    throw new Error(`No hub drafts found for ${HUBS.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    // Drop everything outside the four demo cities.
    await tx.delete(events).where(notInArray(events.citySlug, KEEP));
    await tx.delete(venues).where(notInArray(venues.citySlug, KEEP));
    await tx.delete(cities).where(notInArray(cities.slug, KEEP));

    for (const city of hubCities) {
      await tx.insert(cities).values(city).onConflictDoUpdate({
        target: cities.slug,
        set: { name: city.name, country: city.country, timezone: city.timezone },
      });
    }
    for (const host of hubHosts) {
      await tx.insert(hosts).values(host).onConflictDoUpdate({
        target: hosts.id,
        set: { name: host.name, about: host.about },
      });
    }
    for (const venue of hubVenues) {
      await tx.insert(venues).values(venue).onConflictDoUpdate({
        target: venues.id,
        set: {
          name: venue.name,
          area: venue.area,
          citySlug: venue.citySlug,
          capacity: venue.capacity,
          address: venue.address,
        },
      });
    }
    const existing = await tx.select({ id: events.id }).from(events).where(inArray(events.citySlug, [...HUBS]));
    if (existing.length) {
      await tx.delete(events).where(inArray(events.id, existing.map((e) => e.id)));
    }
    if (hubEvents.length) await tx.insert(events).values(hubEvents);

    // Drop hosts that no longer own any remaining event.
    await tx.run(sql`
      DELETE FROM hosts
      WHERE id NOT IN (SELECT DISTINCT host_id FROM events)
    `);
  });

  for (const slug of KEEP) {
    const n = await db.select().from(events).where(eq(events.citySlug, slug));
    console.log(`${slug}: ${n.length} shows`);
  }
  const leftover = await db.select({ slug: cities.slug }).from(cities);
  console.log(`cities left: ${leftover.map((c) => c.slug).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
