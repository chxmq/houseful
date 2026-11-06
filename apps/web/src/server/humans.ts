import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import {
  attendance,
  humans,
  verifications,
  type Credential,
  type VerificationPurpose,
} from "./db/schema";

export type RecordVerificationInput = {
  nullifier: string;
  credential: Credential;
  action: string;
  purpose: VerificationPurpose;
  environment: string;
  eventId?: string | null;
  wallet?: string | null;
  /** Unix seconds. Defaults to the current time. */
  at?: number;
};

export type RecordVerificationResult = {
  /** True when this (action, nullifier, purpose) was already recorded, so the proof must not be honoured again. */
  alreadyUsed: boolean;
  /** True when this nullifier had never been seen before. */
  newHuman: boolean;
  verificationId: number | null;
};

const normalise = (value: string) => value.trim().toLowerCase();

export async function recordVerification(input: RecordVerificationInput): Promise<RecordVerificationResult> {
  const nullifier = normalise(input.nullifier);
  const at = input.at ?? Math.floor(Date.now() / 1000);

  return db.transaction(async (tx) => {
    const insertedHuman = await tx
      .insert(humans)
      .values({ nullifier, credential: input.credential, firstVerifiedAt: at })
      .onConflictDoNothing()
      .returning({ nullifier: humans.nullifier });

    const insertedVerification = await tx
      .insert(verifications)
      .values({
        nullifier,
        action: input.action,
        purpose: input.purpose,
        environment: input.environment,
        eventId: input.eventId ?? null,
        wallet: input.wallet ? normalise(input.wallet) : null,
        createdAt: at,
      })
      .onConflictDoNothing({ target: [verifications.action, verifications.nullifier, verifications.purpose] })
      .returning({ id: verifications.id });

    return {
      alreadyUsed: insertedVerification.length === 0,
      newHuman: insertedHuman.length > 0,
      verificationId: insertedVerification[0]?.id ?? null,
    };
  });
}

export async function hasVerified(
  nullifier: string,
  action: string,
  purpose?: VerificationPurpose,
): Promise<boolean> {
  const conditions = [eq(verifications.nullifier, normalise(nullifier)), eq(verifications.action, action)];
  if (purpose) conditions.push(eq(verifications.purpose, purpose));
  const [row] = await db
    .select({ id: verifications.id })
    .from(verifications)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/** Marks a human as admitted at the door. Returns the original admission time on a repeat scan. */
export async function recordAdmission(
  eventId: string,
  nullifier: string,
  at = Math.floor(Date.now() / 1000),
): Promise<{ alreadyAdmitted: boolean; admittedAt: number }> {
  const key = normalise(nullifier);
  const inserted = await db
    .insert(attendance)
    .values({ eventId, nullifier: key, admittedAt: at })
    .onConflictDoNothing()
    .returning({ admittedAt: attendance.admittedAt });
  if (inserted[0]) return { alreadyAdmitted: false, admittedAt: inserted[0].admittedAt };

  const [existing] = await db
    .select({ admittedAt: attendance.admittedAt })
    .from(attendance)
    .where(and(eq(attendance.eventId, eventId), eq(attendance.nullifier, key)))
    .limit(1);
  return { alreadyAdmitted: true, admittedAt: existing?.admittedAt ?? at };
}
