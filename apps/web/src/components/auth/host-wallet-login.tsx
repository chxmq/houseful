"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWalletClient, custom, type Hex } from "viem";
import { safeNextPath } from "@/lib/safe-next";
import { hostLoginMessage } from "@/lib/host-login-message";

type HostWalletLoginProps = {
  next?: string;
};

function plainWalletError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|rejected the request|action_rejected/i.test(text)) {
    return "The wallet did not sign. Try again when you are ready.";
  }
  if (/connect a browser wallet/i.test(text)) return text;
  if (/no wallet account/i.test(text)) return text;
  return "Host sign-in failed. Check the wallet and try again.";
}

export function HostWalletLogin({ next = "/host" }: HostWalletLoginProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = safeNextPath(next, "/host");

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!eth) throw new Error("Connect a browser wallet to sign in as a host.");

      const client = createWalletClient({ transport: custom(eth as never) });
      const [address] = await client.requestAddresses();
      if (!address) throw new Error("No wallet account was shared.");

      const chal = await fetch("/api/account/host-challenge", { method: "POST" });
      const chalBody = await chal.json();
      if (!chal.ok) throw new Error(chalBody.error ?? "Could not start host sign-in.");

      const message = hostLoginMessage({
        origin: chalBody.origin as string,
        address,
        challenge: chalBody.challenge as string,
        issuedAt: chalBody.issuedAt as string,
        expirationTime: chalBody.expirationTime as string,
      });

      const signature = (await client.signMessage({
        account: address,
        message,
      })) as Hex;

      const res = await fetch("/api/account/host-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Host sign-in failed.");

      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(plainWalletError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-4 text-base font-semibold text-paper disabled:opacity-60"
      >
        {busy ? "Check your wallet" : "Sign in with wallet"}
      </button>
      {error ? <p className="mt-3 text-sm font-medium text-reject">{error}</p> : null}
      <p className="mt-3 text-sm text-ink-soft">Hosts prove the payout wallet with a one-time signed message. No password.</p>
    </div>
  );
}
