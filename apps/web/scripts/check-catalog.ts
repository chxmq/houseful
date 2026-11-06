// Run with `pnpm db:check`. Needs --conditions=react-server so the server-only guard resolves to its no-op build.
import "./load-env";
import * as catalog from "../src/server/catalog";
import { hasVerified, recordAdmission, recordVerification } from "../src/server/humans";
import { client } from "../src/server/db/connection";

// Saturday 7 November 2026, 10 am IST: the demo day.
const now = Date.UTC(2026, 10, 7, 4, 30) / 1000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`check failed: ${message}`);
}

async function main() {
  const cities = await catalog.listCities({ now });
  console.log("cities", cities.map((c) => `${c.slug}:${c.upcomingCount}`).join(" "));
  assert(cities[0]?.slug === "mumbai", "Mumbai has the most upcoming events");
  assert((await catalog.getCity("pune"))?.name === "Pune", "getCity");

  const mumbai = await catalog.listEvents({ city: "mumbai", now });
  console.log("mumbai upcoming", mumbai.length);
  assert(mumbai.length === 17, "17 upcoming Mumbai events (one is past)");
  assert(mumbai.every((e) => Array.isArray(e.lineup) && e.venue.name && e.host.name && e.city.name), "joined shape");

  const tonight = await catalog.listEvents({ city: "mumbai", when: "tonight", now });
  const weekend = await catalog.listEvents({ city: "mumbai", when: "weekend", now });
  console.log("tonight", tonight.map((e) => e.slug));
  console.log("weekend", weekend.map((e) => e.slug));
  assert(tonight.length >= 2 && weekend.length >= 3, "tonight and weekend windows");

  const month = await catalog.listEvents({ city: "mumbai", when: "month", category: "music", now });
  console.log("month music", month.map((e) => e.slug));

  const search = await catalog.listEvents({ city: "mumbai", q: "bandra", now });
  console.log("q=bandra", search.map((e) => e.slug));
  assert(search.length > 0, "search by area");

  const flagship = await catalog.getEvent("the-last-local-nsci-dome");
  assert(flagship?.status === "sold_out" && flagship.chainEventId === 1, "flagship");
  assert(flagship.venue.address && flagship.host.about && flagship.city.state, "detail joins");
  console.log("flagship", flagship.title, flagship.faceValueWei, flagship.highlights.length, "highlights");

  const featured = await catalog.featuredEvents("mumbai", { now });
  console.log("featured", featured.map((e) => e.slug));
  assert(featured[0]?.slug === "the-last-local-nsci-dome", "flagship leads featured");

  const shelves = await catalog.trendingByCategory("mumbai", { now });
  console.log("trending", shelves.map((s) => `${s.category}:${s.eventCount}`).join(" "));

  const venues = await catalog.listVenues("mumbai", { now });
  console.log("venues", venues.length);
  const dome = await catalog.getVenue("nsci-dome", { now });
  assert(dome && dome.upcoming.length === 3, "NSCI Dome has three upcoming events");

  const kpss = await catalog.getHost("kaali-peeli-sound-system", { now });
  assert(kpss && kpss.upcoming.length === 1 && kpss.past.length === 1, "host upcoming/past split");

  assert((await catalog.getEventByChainId(1))?.id === "the-last-local-nsci-dome", "getEventByChainId");
  assert((await catalog.getEvent("nope")) === null, "missing event is null");

  const nullifier = `0xcheck${Date.now().toString(16)}`;
  const input = {
    nullifier,
    credential: "orb" as const,
    action: "join-waitlist",
    purpose: "join" as const,
    environment: "staging",
    eventId: "the-last-local-nsci-dome",
    wallet: "0xABC",
  };
  const first = await recordVerification(input);
  const second = await recordVerification(input);
  assert(!first.alreadyUsed && first.newHuman, "first verification");
  assert(second.alreadyUsed && !second.newHuman, "replay is flagged");
  assert(await hasVerified(nullifier, "join-waitlist"), "hasVerified");
  assert(!(await hasVerified(nullifier, "join-waitlist", "buy")), "hasVerified by purpose");
  const gate1 = await recordAdmission("the-last-local-nsci-dome", nullifier);
  const gate2 = await recordAdmission("the-last-local-nsci-dome", nullifier);
  assert(!gate1.alreadyAdmitted && gate2.alreadyAdmitted, "admission is once only");

  await client.execute({ sql: "DELETE FROM attendance WHERE nullifier = ?", args: [nullifier] });
  await client.execute({ sql: "DELETE FROM verifications WHERE nullifier = ?", args: [nullifier] });
  await client.execute({ sql: "DELETE FROM humans WHERE nullifier = ?", args: [nullifier] });

  console.log("All catalog checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
