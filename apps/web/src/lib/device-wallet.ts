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
 * A wallet that lives on this device. Tickets are bound to a verified person, not to a
 * wallet, so the wallet only needs to pay and sign. Judges can buy without installing anything.
 */
export function deviceWallet() {
  const account = privateKeyToAccount(loadOrCreateKey());
  const client = createWalletClient({ account, chain: activeChain, transport: http(rpcUrl) });
  return { account, client, address: account.address };
}

export async function ensureFunded(address: `0x${string}`, needWei: bigint) {
  const balance = await publicClient.getBalance({ address });
  if (balance >= needWei) return balance;

  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error ?? "Could not top up this wallet with test ETH.");
  }
  const { hash } = (await res.json()) as { hash: Hex };
  await publicClient.waitForTransactionReceipt({ hash });
  return publicClient.getBalance({ address });
}
