import { describe, expect, it } from "vitest";
import drafts from "../scripts/data/catalog-drafts.json";
import { eligibleDrafts } from "../src/lib/catalog-draft";
import { buildWorldwideCatalog, TEST_ALLOCATION, TEST_BOOKING_HOURS } from "../scripts/worldwide-catalog";
import { detailsOf } from "../src/lib/catalog-facts";

const example = drafts.find(draft => draft.priceUsd !== null)!;

describe("catalog eligibility", () => {
  it("imports only priced, dated high-confidence records with a named venue", () => {
    expect(eligibleDrafts(drafts)).toHaveLength(21);
    expect(drafts).toHaveLength(32);
    for (const record of eligibleDrafts(drafts)) {
      expect(record.confidence).toBe("high");
      expect(record.officialUrl).toMatch(/^https:\/\//);
      expect(record.sourceUrl).toMatch(/^https:\/\//);
    }
  });
  it("does not fill in a missing price, date or venue", () => {
    expect(eligibleDrafts([
      { ...example, priceUsd: null }, { ...example, startsAt: null },
      { ...example, venue: null }, { ...example, venue: { ...example.venue!, name: "" } },
      { ...example, confidence: "medium" }, { ...example, startsAt: "unknown" },
      { ...example, priceUsd: 3.5 }, { ...example, priceUsd: -1 },
    ])).toEqual([]);
    expect(eligibleDrafts([{ ...example, priceUsd: 0 }])).toHaveLength(1);
  });
});


describe("worldwide test catalog", () => {
  it("keeps source facts and gives each eligible show a stable chain id", () => {
    const built = buildWorldwideCatalog(drafts, 29);
    expect(built.events).toHaveLength(21);
    expect(built.events.map(event => event.chainEventId)).toEqual(Array.from({ length: 21 }, (_, index) => index + 29));
    for (const event of built.events) {
      const source = drafts.find(draft => draft.slug === event.id)!;
      expect(event.title).toBe(source.title);
      expect(event.priceUsd).toBe(source.priceUsd);
      expect(event.officialUrl).toBe(source.officialUrl);
      expect(event.sourceUrl).toBe(source.sourceUrl);
      expect(event.capacity).toBe(TEST_ALLOCATION);
      const venue = built.venues.find(venue => venue.id === event.venueId)!;
      expect(event.seated).toBe(["theatre", "auditorium", "arena"].includes(venue.kind));
      expect(event.description).toContain("Test listing, not affiliated");
    }
    expect(built.cities.find(city => city.slug === "london")?.timezone).toBe("Europe/London");
    expect(built.cities.find(city => city.slug === "new-york")?.country).toBe("United States");
  });
  it("marks unknown official facts while keeping test booking values separate", () => {
    const source = drafts.find(draft => draft.slug === "bruno-mars-romantic-tour-goyang-2027-05-21")!;
    const event = buildWorldwideCatalog([source], 1).events[0];
    expect(event.doorsAt).toBe(0);
    expect(event.durationMins).toBe(0);
    expect(event.endsAt).toBe(event.startsAt + TEST_BOOKING_HOURS * 3600);
    expect(detailsOf(source)).toMatchObject({ startTime: true, doors: false, endTime: false, capacity: false, duration: false });
    const noAge = drafts.find(draft => draft.slug === "yoasobi-super-planet-tokyo-dome-2026-12-05")!;
    expect(buildWorldwideCatalog([noAge], 2).events[0].ageLimit).toBe(-1);
    expect(detailsOf(noAge).age).toBe(false);
  });
  it("does not present date-only placeholders as published clock times", () => {
    const source = drafts.find(draft => draft.slug === "web-summit-qatar-2027-doha")!;
    expect(detailsOf(source)).toMatchObject({ startTime: false, doors: false, endTime: false, age: false, capacity: false });
    expect(buildWorldwideCatalog([source], 1).events[0].language).toBe("Not published");
  });
});

it("does not turn a duration-derived finish into a published end time", () => {
  for (const slug of [
    "the-nutcracker-royal-ballet-royal-opera-house-2026-12-03",
    "australian-ballet-swan-lake-sydney-opera-house-2027-04-09",
    "melbourne-international-comedy-festival-gala-2027",
  ]) {
    const source = drafts.find(draft => draft.slug === slug)!;
    expect(detailsOf(source).duration).toBe(true);
    expect(detailsOf(source).endTime).toBe(false);
  }
});
