"use client";

import { createWalletClient, custom, type Address } from "viem";
import { activeChain } from "./chain";
import { deviceWallet } from "./device-wallet";
import { deviceSigner, type ActionSigner } from "./ticket-actions";

/**
 * Resolves the wallet that should pay and hold tickets: the account's active linked
 * wallet when signed in, otherwise this phone's built-in key.
 */
export async function activePayAddress(): Promise<`0x${string}` | null> {
  try {
    const res = await fetch("/api/account/active-wallet", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: string };
    if (data.address && /^0x[0-9a-fA-F]{40}$/.test(data.address)) {
      return data.address.toLowerCase() as `0x${string}`;
    }
  } catch {
    // Signed out or offline: fall through to the device wallet.
  }
  return null;
}

export async function paySigner(): Promise<ActionSigner> {
  const active = await activePayAddress();
  if (!active) return deviceSigner();
  return signerForAddress(active);
}

/** Signer for a host session address: injected wallet preferred, device only when it matches. */
export async function hostSigner(sessionAddress: `0x${string}`): Promise<ActionSigner> {
  return signerForAddress(sessionAddress.toLowerCase() as `0x${string}`);
}

async function signerForAddress(address: `0x${string}`): Promise<ActionSigner> {
  const device = deviceWallet();
  if (device.address.toLowerCase() === address.toLowerCase()) {
    return deviceSigner();
  }

  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) {
    throw new Error("Connect the wallet this account chose, or link this phone's wallet on Account.");
  }

  const browser = createWalletClient({ chain: activeChain, transport: custom(eth as never) });
  const accounts = (await browser.requestAddresses()) as Address[];
  const match = accounts.find((a) => a.toLowerCase() === address.toLowerCase());
  if (!match) {
    throw new Error("Switch your browser wallet to the address this account is using, then try again.");
  }

  return {
    address: match.toLowerCase() as `0x${string}`,
    kind: "external",
    client: createWalletClient({
      account: match,
      chain: activeChain,
      transport: custom(eth as never),
    }),
  };
}
