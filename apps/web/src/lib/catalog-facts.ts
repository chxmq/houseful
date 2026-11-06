import drafts from "../../scripts/data/catalog-drafts.json";
import { eligibleDrafts, type CatalogDraft } from "./catalog-draft";

export type PublishedDetails = {
  startTime: boolean;
  doors: boolean;
  endTime: boolean;
  age: boolean;
  capacity: boolean;
  duration: boolean;
};

const bySlug = new Map(eligibleDrafts(drafts).map(draft => [draft.slug, draft]));

/** Never promote internal test booking settings into official event facts. */
export function detailsOf(draft: CatalogDraft): PublishedDetails {
  const timed = draft.confirmedFields.includes("time");
  return {
    startTime: timed,
    doors: draft.doorsAt !== null,
    endTime: timed && draft.endsAt !== null && !draft.derivedFields?.includes("endsAt"),
    age: draft.ageLimit !== null,
    capacity: draft.venue?.capacity != null && !/capacity.*(?:wikipedia|not.*official)/i.test(draft.notes),
    duration: draft.durationMins !== null,
  };
}

export function publishedDetails(slug: string): PublishedDetails | undefined {
  const draft = bySlug.get(slug);
  return draft ? detailsOf(draft) : undefined;
}
