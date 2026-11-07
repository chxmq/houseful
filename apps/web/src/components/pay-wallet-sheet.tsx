"use client";

import { useEffect, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { activeChain } from "@/lib/chain";
import { shortHex } from "@/lib/format";
import { deviceWallet } from "@/lib/device-wallet";

export type PayWalletOption = {
  address: `0x${string}`;
  label: string;
  kind: "device" | "external";
  active?: boolean;
};

type PayWalletSheetProps = {
  open: boolean;
  onClose: () => void;
  onChoose: (wallet: PayWalletOption) => void;
};

function phoneOption(): PayWalletOption | null {
  try {
    const address = deviceWallet().address.toLowerCase() as `0x${string}`;
    return { address, label: "This phone", kind: "device" };
  } catch {
    return null;
  }
}

export function PayWalletSheet({ open, onClose, onChoose }: PayWalletSheetProps) {
  const [options, setOptions] = useState<PayWalletOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setBusy(true);
    (async () => {
      const phone = phoneOption();
      const byAddress = new Map<string, PayWalletOption>();
      if (phone) byAddress.set(phone.address, phone);
      try {
        const res = await fetch("/api/account/wallets", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          wallets?: Array<{ address: string; kind: string; label: string | null; active: boolean }>;
        };
        for (const w of data.wallets ?? []) {
          if (!/^0x[0-9a-fA-F]{40}$/.test(w.address)) continue;
          const address = w.address.toLowerCase() as `0x${string}`;
          const kind = w.kind === "device" ? "device" : "external";
          byAddress.set(address, {
            address,
            kind,
            label: w.label?.trim() || (kind === "device" ? "This phone" : "Linked wallet"),
            active: w.active,
          });
        }
      } catch {
        // Offline or signed out: phone wallet alone is enough.
      }
      if (!cancelled) {
        const list = [...byAddress.values()];
        list.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "device" ? -1 : 1;
          return Number(Boolean(b.active)) - Number(Boolean(a.active));
        });
        setOptions(list);
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function connectBrowser() {
    setConnecting(true);
    setError(null);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!eth) throw new Error("No browser wallet found. Install MetaMask, or pay with this phone.");
      const client = createWalletClient({ chain: activeChain, transport: custom(eth as never) });
      try {
        await client.switchChain({ id: activeChain.id });
      } catch {
        // Wallet may already be on the chain, or will prompt on send.
      }
      const accounts = (await client.requestAddresses()) as Address[];
      if (!accounts.length) throw new Error("No account was shared by the browser wallet.");
      const picked = accounts[0].toLowerCase() as `0x${string}`;
      onChoose({ address: picked, kind: "external", label: "Browser wallet" });
    } catch (err) {
      setError((err as Error).message || "Could not connect the browser wallet.");
      setConnecting(false);
    }
  }

  if (!open) return null;

  const phone = options.find((w) => w.kind === "device");
  const linked = options.filter((w) => w.kind === "external");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-wallet-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-[16px] bg-paper shadow-[0_28px_70px_-30px_rgba(20,16,12,0.6)] sm:rounded-[12px]">
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        <div className="px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Checkout</p>
              <h2 id="pay-wallet-title" className="mt-1 font-display text-[2rem] font-black uppercase leading-none">
                Choose wallet
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-ink/5"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-3 max-w-[36ch] text-sm text-ink-soft">Ticket goes to the wallet you pick. Fastest is this phone.</p>
        </div>

        {error ? (
          <p className="mx-5 mb-2 rounded-[4px] bg-reject/10 px-3 py-2 text-sm font-medium text-reject sm:mx-6">{error}</p>
        ) : null}

        <div className="space-y-3 px-5 pb-6 sm:px-6">
          {busy && !phone ? (
            <p className="py-6 text-center text-sm text-ink-soft">Loading…</p>
          ) : (
            <>
              {phone ? (
                <button
                  type="button"
                  onClick={() => onChoose(phone)}
                  className="flex w-full items-center gap-4 rounded-[8px] bg-ink px-4 py-4 text-left text-paper transition hover:bg-ink/90"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/15 font-display text-sm font-black tracking-wide">
                    PH
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">Pay with this phone</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-paper/55">{shortHex(phone.address, 6, 4)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-marigold">Go →</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={connectBrowser}
                disabled={connecting}
                className="flex w-full items-center gap-4 rounded-[8px] border border-ink/20 bg-paper px-4 py-4 text-left transition hover:border-ink/40 disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-paper-deep font-display text-sm font-black tracking-wide text-ink">
                  MM
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-ink">
                    {connecting ? "Connecting…" : "MetaMask / browser wallet"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">Shows a real confirm prompt</span>
                </span>
              </button>

              {linked.length > 0 ? (
                <div className="pt-2">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Linked</p>
                  <ul className="overflow-hidden rounded-[8px] border border-ink/15">
                    {linked.map((wallet) => (
                      <li key={wallet.address} className="border-b border-ink/10 last:border-b-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-paper-deep/70"
                          onClick={() => onChoose(wallet)}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{wallet.label}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-muted">
                              {shortHex(wallet.address, 8, 6)}
                            </span>
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stamp">
                            {wallet.active ? "Active" : "Use"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          <button type="button" onClick={onClose} className="w-full py-2 text-center text-sm font-medium text-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
