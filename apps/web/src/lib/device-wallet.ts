"use client";

import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain, rpcUrl } from "./chain";

const STORAGE_KEY = "houseful.wallet.v1";

export const publicClient = createPublicClient({ chain: activeChain, transport: http(rpcUrl) });

function loadOrCreateKey(): Hex {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && /^0x[0-9a-f]{64}$/i.test(existing)) return existing as Hex;
  const key = generatePrivateKey();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}

/**
 * A wallet that lives on this device. World ID binds the seat to a person; this key only
 * pays gas and holds the door credential. Export it before switching phones.
 */
export function deviceWallet() {
  const account = privateKeyToAccount(loadOrCreateKey());
  const client = createWalletClient({ account, chain: activeChain, transport: http(rpcUrl) });
  return { account, client, address: account.address };
}

export function exportDeviceWallet(): Hex {
  return loadOrCreateKey();
}

export function importDeviceWallet(key: string): Hex {
  if (!/^0x[0-9a-f]{64}$/i.test(key)) throw new Error("That does not look like a Houseful wallet key.");
  window.localStorage.setItem(STORAGE_KEY, key);
  return key as Hex;
}

export async function ensureFunded(address: `0x${string}`, needWei: bigint) {
  const balance = await publicClient.getBalance({ address });
  if (balance >= needWei) return balance;

  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, needWei: needWei.toString() }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error ?? "Could not top up this wallet for network fees.");
  }
  const { hash } = (await res.json()) as { hash: Hex };
  await publicClient.waitForTransactionReceipt({ hash });
  // Same public-RPC lag as seeding: wait until the credit is visible.
  for (let i = 0; i < 20; i++) {
    const next = await publicClient.getBalance({ address });
    if (next >= needWei) return next;
    await new Promise((r) => setTimeout(r, 400));
  }
  return publicClient.getBalance({ address });
}
