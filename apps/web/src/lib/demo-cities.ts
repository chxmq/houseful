/** Four demo cities: Mumbai plus three global hubs. */
export const DEMO_CITY_SLUGS = ["mumbai", "new-york", "london", "tokyo"] as const;

export type DemoCitySlug = (typeof DEMO_CITY_SLUGS)[number];

export const DEMO_CITY_LABELS: Record<DemoCitySlug, string> = {
  mumbai: "Mumbai",
  "new-york": "New York",
  london: "London",
  tokyo: "Tokyo",
};

export function isDemoCity(slug: string): slug is DemoCitySlug {
  return (DEMO_CITY_SLUGS as readonly string[]).includes(slug);
}

export function sortDemoCities<T extends { slug: string }>(cities: T[]): T[] {
  const rank = new Map<string, number>(DEMO_CITY_SLUGS.map((slug, i) => [slug, i]));
  return [...cities].sort((a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99));
}
