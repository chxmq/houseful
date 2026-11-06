import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, isHex } from "./bytes";

export interface KeyPair {
  secretKey: string;
  publicKey: string;
}

export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = ed25519.keygen();
  return { secretKey: bytesToHex(secretKey), publicKey: bytesToHex(publicKey) };
}

export function generateHolderKey(): KeyPair {
  return generateKeyPair();
}

export function generateIssuerKey(): KeyPair {
  return generateKeyPair();
}

export function publicKeyFromSecret(secretKey: string): string {
  return bytesToHex(ed25519.getPublicKey(secretKeyBytes(secretKey)));
}

export function secretKeyBytes(secretKey: string): Uint8Array {
  if (!isHex(secretKey, 32)) throw new TypeError("secret key must be 32 bytes of hex");
  return hexToBytes(secretKey);
}

export function publicKeyBytes(publicKey: string): Uint8Array {
  if (!isHex(publicKey, 32)) throw new TypeError("public key must be 32 bytes of hex");
  const bytes = hexToBytes(publicKey);
  if (!ed25519.utils.isValidPublicKey(bytes, false)) throw new TypeError("public key is not a valid ed25519 point");
  return bytes;
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey);
}

/** Strict RFC 8032 verification (zip215 off) so signatures are non-malleable. Never throws. */
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
