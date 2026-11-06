import { sha256 } from "@noble/hashes/sha2.js";
import { MAX_EVENT_ID_BYTES, MAX_U32 } from "./constants";

const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function isU32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_U32;
}

export function assertU32(name: string, value: unknown): asserts value is number {
  if (!isU32(value)) {
    throw new RangeError(`${name} must be an integer in [0, ${MAX_U32}]`);
  }
}

export function eventIdBytes(event: string): Uint8Array {
  const bytes = utf8(event);
  if (bytes.length === 0 || bytes.length > MAX_EVENT_ID_BYTES) {
    throw new RangeError(`event id must be 1 to ${MAX_EVENT_ID_BYTES} UTF-8 bytes`);
  }
  return bytes;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function u8(value: number): Uint8Array {
  return Uint8Array.of(value);
}

export function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

export function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

export function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  return concat(u8(bytes.length), bytes);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

const HEX_RE = /^(?:[0-9a-fA-F]{2})*$/;

export function isHex(value: unknown, byteLength: number): value is string {
  return typeof value === "string" && value.length === byteLength * 2 && HEX_RE.test(value);
}

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_RE.test(hex)) throw new TypeError("invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64URL.length; i++) table[B64URL.charCodeAt(i)] = i;
  return table;
})();

export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]!;
  }
  return out;
}

export function base64urlDecodedLength(encodedLength: number): number | null {
  const rem = encodedLength % 4;
  if (rem === 1) return null;
  return Math.floor(encodedLength / 4) * 3 + (rem === 0 ? 0 : rem - 1);
}

/** Strict: rejects padding, foreign characters and non-zero trailing bits, so every byte string has exactly one encoding. */
export function base64urlDecode(text: string): Uint8Array | null {
  const length = base64urlDecodedLength(text.length);
  if (length === null) return null;
  const out = new Uint8Array(length);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const v = code < 128 ? B64URL_LOOKUP[code]! : -1;
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if ((acc & ((1 << bits) - 1)) !== 0) return null;
  return out;
}
