import {
  assertU32,
  bytesToHex,
  concat,
  eventIdBytes,
  hexToBytes,
  isHex,
  lengthPrefixed,
  u32,
  u8,
  utf8,
} from "./bytes";
import { CREDENTIAL_DOMAIN, CREDENTIAL_VERSION } from "./constants";
import { publicKeyBytes, publicKeyFromSecret, secretKeyBytes, sign, verify } from "./keys";

export interface DoorCredential {
  v: 1;
  /** Event id. 1 to 255 UTF-8 bytes. */
  event: string;
  /** Token id, uint32. */
  ticket: number;
  /** Ownership generation, uint32. Bumped on-chain on every surrender. */
  gen: number;
  /** Holder ed25519 public key, 32 bytes hex. */
  holderKey: string;
  /** Expiry, unix seconds, uint32. Valid up to and including this second. */
  exp: number;
}

export interface SignedCredential {
  credential: DoorCredential;
  /** Issuer ed25519 signature over encodeCredential(credential), 64 bytes hex. */
  issuerSignature: string;
}

export function normalizeCredential(credential: DoorCredential): DoorCredential {
  if (credential.v !== CREDENTIAL_VERSION) throw new RangeError(`credential version must be ${CREDENTIAL_VERSION}`);
  if (typeof credential.event !== "string") throw new TypeError("event must be a string");
  eventIdBytes(credential.event);
  assertU32("ticket", credential.ticket);
  assertU32("gen", credential.gen);
  assertU32("exp", credential.exp);
  publicKeyBytes(credential.holderKey);
  return {
    v: CREDENTIAL_VERSION,
    event: credential.event,
    ticket: credential.ticket,
    gen: credential.gen,
    holderKey: credential.holderKey.toLowerCase(),
    exp: credential.exp,
  };
}

export function encodeCredentialParts(
  event: Uint8Array,
  ticket: number,
  gen: number,
  holderKey: Uint8Array,
  exp: number,
): Uint8Array {
  return concat(
    lengthPrefixed(utf8(CREDENTIAL_DOMAIN)),
    u8(CREDENTIAL_VERSION),
    lengthPrefixed(event),
    u32(ticket),
    u32(gen),
    holderKey,
    u32(exp),
  );
}

/** Canonical bytes the issuer signs. Throws if the credential is out of range. */
export function encodeCredential(credential: DoorCredential): Uint8Array {
  const c = normalizeCredential(credential);
  return encodeCredentialParts(eventIdBytes(c.event), c.ticket, c.gen, hexToBytes(c.holderKey), c.exp);
}

export function issueCredential(credential: DoorCredential, issuerSecretKey: string): SignedCredential {
  const normalized = normalizeCredential(credential);
  const signature = sign(encodeCredential(normalized), secretKeyBytes(issuerSecretKey));
  return { credential: normalized, issuerSignature: bytesToHex(signature) };
}

export function verifyCredential(signed: SignedCredential, issuerPublicKey: string): boolean {
  try {
    if (!isHex(signed.issuerSignature, 64)) return false;
    return verify(hexToBytes(signed.issuerSignature), encodeCredential(signed.credential), publicKeyBytes(issuerPublicKey));
  } catch {
    return false;
  }
}

export function holderKeyMatches(credential: DoorCredential, holderSecretKey: string): boolean {
  try {
    return publicKeyFromSecret(holderSecretKey) === credential.holderKey.toLowerCase();
  } catch {
    return false;
  }
}
