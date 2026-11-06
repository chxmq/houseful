"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWalletClient, custom, type Hex } from "viem";

type HostWalletLoginProps = {
  next?: string;
};

export function HostWalletLogin({ next = "/host" }: HostWalletLoginProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const signature = (await client.signMessage({
        account: address,
        message: chalBody.message as string,
      })) as Hex;

      const res = await fetch("/api/account/host-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Host sign-in failed.");

      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
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
