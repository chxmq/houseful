"use client";

import { generateHolderKey, type KeyPair } from "@houseful/pass";

const STORAGE_KEY = "houseful.doorkey.v1";

/** The key this phone signs door codes with. It never leaves the device. */
export function deviceDoorKey(): KeyPair {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as KeyPair;
      if (parsed.publicKey && parsed.secretKey) return parsed;
    } catch {}
  }
  const pair = generateHolderKey();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
  return pair;
}

export function doorKeyBytes32(pair: KeyPair): `0x${string}` {
  const hex = pair.publicKey.replace(/^0x/, "");
  return `0x${hex}`;
}
