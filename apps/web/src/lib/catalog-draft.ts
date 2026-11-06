/** Research drafts are inputs, not a claim of independent verification. */
export type CatalogDraft = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  city: string;
  country: string;
  timezone: string;
  venue: {
    name: string;
    area: string;
    address: string;
    capacity: number | null;
    lat: number | null;
    lng: number | null;
    kind: string;
  } | null;
  startsAt: string | null;
  doorsAt: string | null;
  endsAt: string | null;
  durationMins: number | null;
  priceLocal: string | null;
  priceUsd: number | null;
  seated: boolean | null;
  ageLimit: number | null;
  language: string;
  lineup: string[];
  officialUrl: string;
  sourceUrl: string;
  confirmedFields: string[];
  confidence: string;
  notes: string;
  derivedFields?: string[];
};

export function eligibleDrafts(drafts: readonly CatalogDraft[]) {
  return drafts.filter(draft => draft.confidence === "high"
    && draft.priceUsd !== null && Number.isInteger(draft.priceUsd) && draft.priceUsd >= 0
    && draft.startsAt !== null && Number.isFinite(Date.parse(draft.startsAt))
    && draft.venue !== null && draft.venue.name.trim() !== "");
}
