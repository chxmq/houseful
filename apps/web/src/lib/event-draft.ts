import { keccak256, toBytes, type Hex } from "viem";
import { z } from "zod";
import { usdToUnits } from "./pricing";

export const CATEGORIES = ["music", "comedy", "theatre", "sports", "food", "workshops", "nightlife"] as const;
export const INKS = ["stamp", "marigold", "ink", "admit"] as const;

export const draftSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    title: z.string().trim().min(2).max(60),
    subtitle: z.string().trim().max(90),
    category: z.enum(CATEGORIES),
    venueId: z.string().min(1),
    hostName: z.string().trim().min(2).max(60),
    startsAt: z.number().int(),
    doorsBeforeMins: z.number().int().min(0).max(240),
    durationMins: z.number().int().min(15).max(24 * 60),
    priceUsd: z.number().int().min(0).max(1_00_000),
    capacity: z.number().int().min(1).max(1_00_000),
    seated: z.boolean(),
    surrenderCutoffHours: z.number().int().min(0).max(14 * 24),
    ageLimit: z.number().int().min(0).max(21),
    language: z.string().trim().min(2).max(40),
    description: z.string().trim().min(20).max(1200),
    lineup: z.array(z.string().trim().min(1).max(60)).max(12),
    posterVariant: z.number().int().min(0).max(5),
    posterInk: z.enum(INKS),
  })
  .strict();

export type EventDraft = z.infer<typeof draftSchema>;

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Key-sorted JSON, so the same draft always hashes the same on the client and the server. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function draftHash(draft: EventDraft): Hex {
  return keccak256(toBytes(canonical(draft)));
}

export function draftSchedule(draft: EventDraft) {
  const doorsAt = draft.startsAt - draft.doorsBeforeMins * 60;
  const endsAt = draft.startsAt + draft.durationMins * 60;
  const surrenderCutoff = Math.min(doorsAt - draft.surrenderCutoffHours * 3600, endsAt - 60);
  return { doorsAt, endsAt, surrenderCutoff };
}

/** The exact arguments the host's wallet passes to `createEvent`. */
export function chainParams(draft: EventDraft, saleStart: number) {
  const { endsAt, surrenderCutoff } = draftSchedule(draft);
  return {
    faceValue: BigInt(usdToUnits(draft.priceUsd)),
    capacity: BigInt(draft.capacity),
    seated: draft.seated,
    saleStart: BigInt(saleStart),
    surrenderCutoff: BigInt(surrenderCutoff),
    endsAt: BigInt(endsAt),
    metadataURI: `houseful:event/${draft.slug}`,
    metadataHash: draftHash(draft),
  };
}
