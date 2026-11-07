"use client";

import { useActionState, useState } from "react";
import { shortHex } from "@/lib/format";
import { deviceWallet } from "@/lib/device-wallet";
import {
  chooseWalletAction,
  delinkWalletAction,
  linkWalletAction,
  type AccountFormState,
} from "@/server/auth/actions";

type Wallet = {
  id: string;
  address: string;
  kind: string;
  label: string | null;
  active: boolean;
};

const initial: AccountFormState = null;

function readPhoneWallet(): `0x${string}` | null {
  try {
    return deviceWallet().address;
  } catch {
    return null;
  }
}

export function AccountWallets({ linked }: { linked: Wallet[] }) {
  const [phone] = useState(readPhoneWallet);
  const [linkState, linkAction, linkPending] = useActionState(linkWalletAction, initial);
  const [chooseState, chooseAction] = useActionState(chooseWalletAction, initial);
  const [delinkState, delinkAction, delinkPending] = useActionState(delinkWalletAction, initial);
  const error = linkState?.error ?? chooseState?.error ?? delinkState?.error;

  const phoneLinked = phone ? linked.some((w) => w.address.toLowerCase() === phone.toLowerCase()) : true;

  return (
    <section className="mt-12 border-y border-ink/15 py-8">
      <h2 className="font-display text-2xl font-bold uppercase">Wallets</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Link any wallet to pay. Choose which one is active. Delink one that holds no live ticket.
      </p>

      {error ? <p className="mt-4 text-sm font-medium text-reject">{error}</p> : null}

      {linked.length === 0 ? (
        <p className="mt-5 text-sm">No wallets linked yet. Add the phone wallet or an external one below.</p>
      ) : (
        <ul className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
          {linked.map((wallet) => (
            <li key={wallet.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-mono text-sm">{shortHex(wallet.address, 8, 6)}</p>
                <p className="mt-1 text-xs text-muted">
                  {wallet.kind}
                  {wallet.active ? " · active" : ""}
                  {wallet.label ? ` · ${wallet.label}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!wallet.active ? (
                  <form action={chooseAction}>
                    <input type="hidden" name="walletId" value={wallet.id} />
                    <button type="submit" className="border border-ink/20 px-3 py-1.5 text-sm">
                      Use this
                    </button>
                  </form>
                ) : null}
                <form action={delinkAction}>
                  <input type="hidden" name="walletId" value={wallet.id} />
                  <button type="submit" disabled={delinkPending} className="px-3 py-1.5 text-sm text-ink-soft underline">
                    Delink
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {phone && !phoneLinked ? (
        <form action={linkAction} className="mt-6">
          <input type="hidden" name="kind" value="device" />
          <input type="hidden" name="address" value={phone} />
          <button
            type="submit"
            disabled={linkPending}
            className="min-h-11 border border-ink/30 px-5 py-2 text-sm font-medium"
          >
            Link this phone&apos;s wallet ({shortHex(phone, 6, 4)})
          </button>
        </form>
      ) : null}

      <form action={linkAction} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="kind" value="external" />
        <label className="min-w-0 text-sm font-medium">
          Link a wallet address
          <input
            name="address"
            required
            placeholder="0x…"
            className="mt-2 block min-h-11 w-full border border-ink/30 bg-paper px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={linkPending} className="min-h-11 bg-ink px-5 py-2 text-sm font-medium text-paper">
            Link
          </button>
        </div>
      </form>
    </section>
  );
}
