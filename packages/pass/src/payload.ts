import {
  assertU32,
  base64urlDecode,
  base64urlEncode,
  concat,
  eventIdBytes,
  hexToBytes,
  isHex,
  lengthPrefixed,
  readU32,
  sha256Bytes,
  u32,
  u8,
  utf8,
} from "./bytes";
import { DOOR_DOMAIN, EVENT_TAG_BYTES, EVENT_TAG_DOMAIN, PAYLOAD_VERSION, WINDOW } from "./constants";
import { holderKeyMatches, normalizeCredential, type SignedCredential } from "./credential";
import { secretKeyBytes, sign } from "./keys";

/*
 * Binary layout, all integers big-endian uint32:
 *   version(1) eventTag(8) ticket(4) gen(4) holderKey(32) exp(4) issuerSig(64) window(4) holderSig(64)
 * The full event id is not carried; the verifier already knows it and recomputes the tag and both signed messages.
 */
const OFFSET = {
  version: 0,
  eventTag: 1,
  ticket: 1 + EVENT_TAG_BYTES,
  gen: 5 + EVENT_TAG_BYTES,
  holderKey: 9 + EVENT_TAG_BYTES,
  exp: 41 + EVENT_TAG_BYTES,
  issuerSig: 45 + EVENT_TAG_BYTES,
  window: 109 + EVENT_TAG_BYTES,
  holderSig: 113 + EVENT_TAG_BYTES,
} as const;

export const DOOR_PAYLOAD_BYTES = OFFSET.holderSig + 64;

export const DOOR_PAYLOAD_LENGTH = base64urlEncode(new Uint8Array(DOOR_PAYLOAD_BYTES)).length;

export interface DecodedDoorPayload {
  eventTag: Uint8Array;
  ticket: number;
  gen: number;
  holderKey: Uint8Array;
  exp: number;
  issuerSignature: Uint8Array;
  window: number;
  holderSignature: Uint8Array;
}

export function windowOf(nowSeconds: number): number {
  return Math.floor(nowSeconds / WINDOW);
}

/** Seconds until the QR rotates, in (0, WINDOW]. Accepts fractional seconds for a smooth countdown. */
export function secondsUntilRotation(nowSeconds: number): number {
  const into = ((nowSeconds % WINDOW) + WINDOW) % WINDOW;
  return WINDOW - into;
}

export function eventTag(eventBytes: Uint8Array): Uint8Array {
  return sha256Bytes(concat(lengthPrefixed(utf8(EVENT_TAG_DOMAIN)), lengthPrefixed(eventBytes))).slice(
    0,
    EVENT_TAG_BYTES,
  );
}

export function doorMessage(eventBytes: Uint8Array, ticket: number, gen: number, window: number): Uint8Array {
  return concat(lengthPrefixed(utf8(DOOR_DOMAIN)), lengthPrefixed(eventBytes), u32(ticket), u32(gen), u32(window));
}

export function buildDoorPayload(signed: SignedCredential, holderSecretKey: string, nowSeconds: number): string {
  const c = normalizeCredential(signed.credential);
  if (!isHex(signed.issuerSignature, 64)) throw new TypeError("issuerSignature must be 64 bytes of hex");
  if (!holderKeyMatches(c, holderSecretKey)) throw new Error("holder secret key does not match credential.holderKey");
  const window = windowOf(nowSeconds);
  assertU32("window", window);

  const eventBytes = eventIdBytes(c.event);
  const holderSignature = sign(doorMessage(eventBytes, c.ticket, c.gen, window), secretKeyBytes(holderSecretKey));
  const bytes = concat(
    u8(PAYLOAD_VERSION),
    eventTag(eventBytes),
    u32(c.ticket),
    u32(c.gen),
    hexToBytes(c.holderKey),
    u32(c.exp),
    hexToBytes(signed.issuerSignature),
    u32(window),
    holderSignature,
  );
  return base64urlEncode(bytes);
}

export function decodeDoorPayload(payload: unknown): DecodedDoorPayload | null {
  if (typeof payload !== "string" || payload.length !== DOOR_PAYLOAD_LENGTH) return null;
  const bytes = base64urlDecode(payload);
  if (bytes === null || bytes.length !== DOOR_PAYLOAD_BYTES || bytes[OFFSET.version] !== PAYLOAD_VERSION) return null;
  return {
    eventTag: bytes.slice(OFFSET.eventTag, OFFSET.ticket),
    ticket: readU32(bytes, OFFSET.ticket),
    gen: readU32(bytes, OFFSET.gen),
    holderKey: bytes.slice(OFFSET.holderKey, OFFSET.exp),
    exp: readU32(bytes, OFFSET.exp),
    issuerSignature: bytes.slice(OFFSET.issuerSig, OFFSET.window),
    window: readU32(bytes, OFFSET.window),
    holderSignature: bytes.slice(OFFSET.holderSig, DOOR_PAYLOAD_BYTES),
  };
}
