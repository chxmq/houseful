import "server-only";
import { hashSignal } from "@worldcoin/idkit/hashing";
import { signRequest } from "@worldcoin/idkit/signing";
import type { IDKitResult, RpContext } from "@worldcoin/idkit";
import type { Assurance } from "@/lib/assurance";
import { serverEnv } from "./env";

export type WorldRequest = {
  appId: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  rpContext: RpContext;
};

export function createWorldRequest(action: string): WorldRequest {
  const env = serverEnv();
  const sig = signRequest({ signingKeyHex: env.WORLD_RP_SIGNING_KEY, action, ttl: 300 });

  return {
    appId: env.WORLD_APP_ID as `app_${string}`,
    action,
    environment: env.WORLD_ENVIRONMENT,
    rpContext: {
      rp_id: env.WORLD_RP_ID,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    },
  };
}

export type VerifiedHuman = {
  nullifier: bigint;
  credential: "orb" | "document" | "selfie" | "device";
  environment: string;
};

export class WorldVerificationError extends Error {
  constructor(
    readonly code:
      | "wrong-action"
      | "wrong-environment"
      | "legacy-proof"
      | "signal-mismatch"
      | "wrong-shape"
      | "weak-credential"
      | "rejected-by-world"
      | "world-unreachable",
    message: string,
  ) {
    super(message);
  }
}

const credentialBySchema: Record<number, VerifiedHuman["credential"]> = {
  1: "orb",
  9303: "document",
  9310: "document",
  11: "selfie",
};

/** Credentials that satisfy each show's minimum. Stronger ones always pass a weaker bar. */
const allowedForAssurance: Record<Assurance, ReadonlySet<VerifiedHuman["credential"]>> = {
  selfie: new Set(["selfie", "document", "orb"]),
  human: new Set(["document", "orb"]),
};

export function parseNullifier(value: string): bigint {
  if (value.startsWith("nil_")) return BigInt(`0x${value.slice(4)}`);
  if (value.startsWith("0x")) return BigInt(value);
  return BigInt(value);
}

type VerifyResultItem = {
  identifier?: string;
  success?: boolean;
  nullifier?: string;
  code?: string;
  detail?: string;
};

type VerifySuccessBody = {
  success?: boolean;
  code?: string;
  detail?: string;
  results?: VerifyResultItem[];
};

/**
 * Checks a proof with World's verify API and binds it to the wallet that will pay.
 * The wallet is the IDKit signal, so a proof shown for one wallet cannot be replayed for another.
 *
 * World's 200 means "at least one proof verified", with per-item results. We require exactly one
 * response and take the nullifier only from a successful entry in the verify response.
 */
export async function verifyWorldProof(
  result: IDKitResult,
  expected: { action: string; wallet: `0x${string}`; assurance: Assurance },
): Promise<VerifiedHuman> {
  const env = serverEnv();

  if (result.protocol_version !== "4.0" || !("action" in result)) {
    throw new WorldVerificationError("legacy-proof", "Only World ID 4 uniqueness proofs are accepted.");
  }
  if (result.action !== expected.action) {
    throw new WorldVerificationError("wrong-action", "This proof was made for a different show.");
  }
  if (result.environment !== env.WORLD_ENVIRONMENT) {
    throw new WorldVerificationError(
      "wrong-environment",
      `Proof came from ${result.environment}, this deployment expects ${env.WORLD_ENVIRONMENT}.`,
    );
  }

  if (!Array.isArray(result.responses) || result.responses.length !== 1) {
    throw new WorldVerificationError(
      "wrong-shape",
      "Houseful accepts exactly one World ID proof per purchase.",
    );
  }

  const item = result.responses[0];
  if (!item || !("nullifier" in item) || typeof item.nullifier !== "string") {
    throw new WorldVerificationError("wrong-shape", "The proof is missing a uniqueness nullifier.");
  }

  const signalHash = hashSignal(expected.wallet.toLowerCase()).toLowerCase();
  if (item.signal_hash?.toLowerCase() !== signalHash) {
    throw new WorldVerificationError("signal-mismatch", "This proof is bound to a different wallet.");
  }

  let response: Response;
  try {
    response = await fetch(`${env.WORLD_VERIFY_URL}/${env.WORLD_RP_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...result, environment: env.WORLD_ENVIRONMENT }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new WorldVerificationError("world-unreachable", "Could not reach World to check the proof.");
  }

  const body = (await response.json().catch(() => ({}))) as VerifySuccessBody;
  if (!response.ok || body.success !== true) {
    throw new WorldVerificationError(
      "rejected-by-world",
      body.detail ?? body.code ?? `World rejected the proof (HTTP ${response.status}).`,
    );
  }

  const verified = (body.results ?? []).find((r) => r.success === true && typeof r.nullifier === "string");
  if (!verified?.nullifier) {
    throw new WorldVerificationError(
      "rejected-by-world",
      "World did not return a verified uniqueness nullifier.",
    );
  }

  // Prefer World's verified nullifier; refuse if it disagrees with the client-supplied one.
  if (parseNullifier(verified.nullifier) !== parseNullifier(item.nullifier)) {
    throw new WorldVerificationError(
      "rejected-by-world",
      "The verified nullifier did not match the proof that was submitted.",
    );
  }

  const credential = credentialBySchema[item.issuer_schema_id] ?? "device";
  if (!allowedForAssurance[expected.assurance].has(credential)) {
    throw new WorldVerificationError(
      "weak-credential",
      expected.assurance === "human"
        ? "This show asks for Proof of Human. A Selfie Check is not enough."
        : "Your World ID does not have the credential this show asks for yet.",
    );
  }

  return {
    nullifier: parseNullifier(verified.nullifier),
    credential,
    environment: result.environment,
  };
}
