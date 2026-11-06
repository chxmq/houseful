import type { NewCity, NewEvent, NewHost, NewVenue, VenueKind, EventCategory } from "../src/server/db/schema";
import { eligibleDrafts, type CatalogDraft } from "../src/lib/catalog-draft";
import { detailsOf } from "../src/lib/catalog-facts";
import { usdToUnits } from "../src/lib/pricing";

/** Internal demo settings, not claims about a real venue or event duration. */
export const TEST_ALLOCATION = 100;
export const TEST_BOOKING_HOURS = 24;
const slugify = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const categoryOf = (category: string): EventCategory => category === "conference" ? "workshops" : category === "festival" ? "music" : category as EventCategory;
const kindOf = (kind: string): VenueKind => kind === "stadium" ? "arena" : kind === "hall" ? "arts_space" : kind as VenueKind;
const ink = ["stamp", "marigold", "ink", "admit"] as const;

export function buildWorldwideCatalog(drafts: readonly CatalogDraft[], firstChainId: number) {
  const cities = new Map<string, NewCity>();
  const venues = new Map<string, NewVenue>();
  const host: NewHost = {
    id: "houseful-test-listings", slug: "houseful-test-listings", name: "Houseful test listings", kind: "promoter",
    about: "Test bookings using public event listings. Houseful is not the real event organiser. Follow the official seller link for real admission.", payoutAddress: null,
  };
  const events: NewEvent[] = [];
  for (const [index, draft] of eligibleDrafts(drafts).entries()) {
    const venue = draft.venue!;
    const citySlug = slugify(draft.city);
    const venueSlug = `${citySlug}-${slugify(venue.name)}`;
    cities.set(citySlug, { slug: citySlug, name: draft.city, state: "", country: draft.country, timezone: draft.timezone });
    const kind = kindOf(venue.kind);
    const published = detailsOf(draft);
    venues.set(venueSlug, {
      id: venueSlug, slug: venueSlug, name: venue.name, area: venue.area, citySlug, kind,
      // Zero marks an unpublished fact. It must never be displayed as a capacity.
      capacity: published.capacity ? venue.capacity! : 0, address: venue.address, lat: venue.lat ?? 0, lng: venue.lng ?? 0,
    });
    const startsAt = Date.parse(draft.startsAt!) / 1000;
    const endsAt = published.endTime ? Date.parse(draft.endsAt!) / 1000 : startsAt + TEST_BOOKING_HOURS * 3600;
    events.push({
      id: draft.slug, chainEventId: firstChainId + index, title: draft.title, subtitle: draft.subtitle,
      category: categoryOf(draft.category), citySlug, venueId: venueSlug, hostId: host.id,
      startsAt, doorsAt: draft.doorsAt ? Date.parse(draft.doorsAt) / 1000 : 0,
      endsAt, priceUsd: draft.priceUsd!, faceValueUnits: usdToUnits(draft.priceUsd!),
      seated: ["theatre", "auditorium", "arena"].includes(kind),
      capacity: TEST_ALLOCATION, sold: 0, status: "on_sale", featured: true,
      ageLimit: draft.ageLimit ?? -1, language: draft.confirmedFields.includes("language") ? draft.language : "Not published",
      durationMins: draft.durationMins ?? 0,
      description: `${draft.subtitle}\n\nTest listing, not affiliated with the artist or organiser. No real admission is provided. The price shown is a whole-dollar test USDT amount from the research draft, not a live seller quote.\n\nThis draft has not been independently verified. Check the official event page for current details and ticket availability.`,
      lineup: draft.lineup, highlights: [
        `Draft ticket price: ${draft.priceLocal ?? "Not published"}. Check the official seller for the current price.`,
        "Seats and availability here are test allocations, not the real venue's capacity or seating plan.",
        ...(!published.endTime ? ["A test booking window is used internally; the official end time is Not published."] : []),
      ],
      officialUrl: draft.officialUrl, sourceUrl: draft.sourceUrl, posterVariant: index % 6, posterInk: ink[index % ink.length], surrenderCutoffHours: 1,
    });
  }
  return { cities: [...cities.values()], venues: [...venues.values()], hosts: [host], events };
}
