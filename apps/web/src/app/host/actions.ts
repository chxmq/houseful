"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { parseEventLogs, type Hex } from "viem";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { chainParams, draftSchedule, draftSchema, slugify } from "@/lib/event-draft";
import { usdToUnits } from "@/lib/pricing";
import { serverChain } from "@/server/chain";
import { db } from "@/server/db/client";
import { events, hosts, venues } from "@/server/db/schema";

export type ListShowResult = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Adds a show to the catalog after its host has created it on chain. The listing is accepted only
 * if the contract recorded the same terms and the same metadata hash, so the page a buyer reads is
 * the page the host committed to.
 */
export async function listShow(input: unknown, txHash: Hex): Promise<ListShowResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some details on the form are missing or out of range." };
  if (!contractAddress) return { ok: false, error: "Houseful is not deployed on this network." };
  const draft = parsed.data;

  const receipt = await serverChain().getTransactionReceipt({ hash: txHash });
  const [created] = parseEventLogs({
    abi: housefulAbi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === contractAddress!.toLowerCase()),
    eventName: "EventCreated",
  });
  if (!created) return { ok: false, error: "That transaction did not create a show." };

  const onChain = created.args;
  const expected = chainParams(draft, Number(onChain.saleStart));
  const agrees =
    onChain.metadataHash === expected.metadataHash &&
    onChain.metadataURI === expected.metadataURI &&
    onChain.faceValue === expected.faceValue &&
    onChain.capacity === expected.capacity &&
    onChain.surrenderCutoff === expected.surrenderCutoff &&
    onChain.endsAt === expected.endsAt;
  if (!agrees) return { ok: false, error: "The terms on chain do not match this listing." };

  const [venue] = await db.select().from(venues).where(eq(venues.id, draft.venueId)).limit(1);
  if (!venue) return { ok: false, error: "That venue is not in the guide." };

  const wallet = onChain.host.toLowerCase();
  const hostId = `wallet-${wallet}`;
  await db
    .insert(hosts)
    .values({
      id: hostId,
      slug: `${slugify(draft.hostName)}-${wallet.slice(2, 6)}`,
      name: draft.hostName,
      kind: "promoter",
      about: `${draft.hostName} sells tickets on Houseful from ${wallet.slice(0, 6)}…${wallet.slice(-4)}.`,
      payoutAddress: wallet,
    })
    .onConflictDoUpdate({ target: hosts.id, set: { name: draft.hostName } });

  const { doorsAt, endsAt } = draftSchedule(draft);
  const inserted = await db
    .insert(events)
    .values({
      id: draft.slug,
      chainEventId: Number(onChain.eventId),
      title: draft.title,
      subtitle: draft.subtitle,
      category: draft.category,
      citySlug: venue.citySlug,
      venueId: venue.id,
      hostId,
      startsAt: draft.startsAt,
      doorsAt,
      endsAt,
      priceUsd: draft.priceUsd,
      faceValueUnits: usdToUnits(draft.priceUsd),
      seated: draft.seated,
      capacity: draft.capacity,
      sold: 0,
      officialUrl: "",
      sourceUrl: "",
      status: "on_sale",
      featured: false,
      ageLimit: draft.ageLimit,
      language: draft.language,
      durationMins: draft.durationMins,
      description: draft.description,
      lineup: draft.lineup,
      highlights: [],
      posterVariant: draft.posterVariant,
      posterInk: draft.posterInk,
      surrenderCutoffHours: draft.surrenderCutoffHours,
    })
    .onConflictDoNothing()
    .returning({ id: events.id });
  if (inserted.length === 0) return { ok: false, error: "A show with this link already exists." };

  updateTag("events");
  return { ok: true, slug: draft.slug };
}
