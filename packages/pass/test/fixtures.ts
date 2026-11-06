import { base64urlDecode, base64urlEncode, eventIdBytes } from "../src/bytes";
import { doorMessage, windowOf } from "../src/payload";
import { secretKeyBytes, sign } from "../src/keys";
import {
  generateHolderKey,
  generateIssuerKey,
  issueCredential,
  Verifier,
  type DoorCredential,
  type KeyPair,
  type RevocationMap,
} from "../src";

export const EVENT = "mumbai-fest";
/** Aligned to a window boundary: T0 / 20 is an integer. */
export const T0 = 1_800_000_000;
export const DAY = 86_400;

export interface World {
  issuer: KeyPair;
  alice: KeyPair;
  bob: KeyPair;
  mallory: KeyPair;
  credentialFor: (holder: KeyPair, overrides?: Partial<DoorCredential>) => DoorCredential;
  verifier: (minGenerations?: RevocationMap) => Verifier;
}

export function world(): World {
  const issuer = generateIssuerKey();
  return {
    issuer,
    alice: generateHolderKey(),
    bob: generateHolderKey(),
    mallory: generateHolderKey(),
    credentialFor: (holder, overrides = {}) => ({
      v: 1,
      event: EVENT,
      ticket: 7,
      gen: 0,
      holderKey: holder.publicKey,
      exp: T0 + DAY,
      ...overrides,
    }),
    verifier: (minGenerations) =>
      new Verifier({ issuerPublicKey: issuer.publicKey, event: EVENT, ...(minGenerations ? { minGenerations } : {}) }),
  };
}

export function issue(w: World, holder: KeyPair, overrides?: Partial<DoorCredential>) {
  return issueCredential(w.credentialFor(holder, overrides), w.issuer.secretKey);
}

export function decodeBytes(payload: string): Uint8Array {
  const bytes = base64urlDecode(payload);
  if (bytes === null) throw new Error("fixture payload did not decode");
  return bytes;
}

export function mutate(payload: string, edit: (bytes: Uint8Array) => void): string {
  const bytes = decodeBytes(payload);
  edit(bytes);
  return base64urlEncode(bytes);
}

const HOLDER_SIG_OFFSET = 121;
const WINDOW_OFFSET = 117;

/** Re-signs the holder part of a payload with an arbitrary key, bypassing buildDoorPayload's key check. */
export function resignHolder(payload: string, secretKey: string, ticket: number, gen: number, nowSeconds: number) {
  const window = windowOf(nowSeconds);
  const sig = sign(doorMessage(eventIdBytes(EVENT), ticket, gen, window), secretKeyBytes(secretKey));
  return mutate(payload, (bytes) => {
    new DataView(bytes.buffer).setUint32(WINDOW_OFFSET, window, false);
    bytes.set(sig, HOLDER_SIG_OFFSET);
  });
}

export function setWindow(payload: string, window: number): string {
  return mutate(payload, (bytes) => new DataView(bytes.buffer).setUint32(WINDOW_OFFSET, window, false));
}
