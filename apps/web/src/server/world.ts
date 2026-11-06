import "server-only";
import { hashSignal } from "@worldcoin/idkit/hashing";
import { signRequest } from "@worldcoin/idkit/signing";
import type { IDKitResult, RpContext } from "@worldcoin/idkit";
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

export function parseNullifier(value: string): bigint {
  if (value.startsWith("nil_")) return BigInt(`0x${value.slice(4)}`);
  if (value.startsWith("0x")) return BigInt(value);
  return BigInt(value);
}

/**
 * Checks a proof with World's verify API and binds it to the wallet that will pay.
 * The wallet is the IDKit signal, so a proof shown for one wallet cannot be replayed for another.
 */
export async function verifyWorldProof(
  result: IDKitResult,
  expected: { action: string; wallet: `0x${string}` },
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

  const signalHash = hashSignal(expected.wallet.toLowerCase()).toLowerCase();
  const item = result.responses.find((r) => "nullifier" in r);
  if (!item || !("nullifier" in item) || item.signal_hash?.toLowerCase() !== signalHash) {
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

  const body = (await response.json().catch(() => ({}))) as { success?: boolean; code?: string; detail?: string };
  if (!response.ok || body.success !== true) {
    throw new WorldVerificationError(
      "rejected-by-world",
      body.detail ?? body.code ?? `World rejected the proof (HTTP ${response.status}).`,
    );
  }

  return {
    nullifier: parseNullifier(item.nullifier),
    credential: credentialBySchema[item.issuer_schema_id] ?? "device",
    environment: result.environment,
  };
}
