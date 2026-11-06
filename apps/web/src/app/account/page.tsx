import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { shortHex } from "@/lib/format";
import {
  chooseWalletAction,
  delinkWalletAction,
  linkWalletAction,
  signOutAction,
} from "@/server/auth/actions";
import { requireFan } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listWallets } from "@/server/auth/store";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

export default function AccountPage() {
  return <Suspense fallback={<main id="main" className="px-5 py-16" role="status">Loading account…</main>}><AccountContent /></Suspense>;
}

async function AccountContent() {
  const session = await requireFan();
  const linked = await listWallets(db, session.account.id);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-5 py-12 md:px-8 md:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Account</p>
        <h1 className="mt-3 font-display text-5xl font-black uppercase leading-none">You</h1>
        <p className="mt-4 text-ink-soft">
          Signed in with World ID. Credential: {session.account.credential}. Tickets follow this person, not a
          phone.
        </p>

        <section className="mt-12 border-y border-ink/15 py-8">
          <h2 className="font-display text-2xl font-bold uppercase">Wallets</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Link any wallet to pay. Choose which one is active. Delink one that holds no live ticket.
          </p>

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
                      <form action={chooseWalletAction}>
                        <input type="hidden" name="walletId" value={wallet.id} />
                        <button type="submit" className="border border-ink/20 px-3 py-1.5 text-sm">
                          Use this
                        </button>
                      </form>
                    ) : null}
                    <form action={delinkWalletAction}>
                      <input type="hidden" name="walletId" value={wallet.id} />
                      <button type="submit" className="px-3 py-1.5 text-sm text-ink-soft underline">
                        Delink
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form action={linkWalletAction} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
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
              <button type="submit" className="min-h-11 bg-ink px-5 py-2 text-sm font-medium text-paper">
                Link
              </button>
            </div>
          </form>
        </section>

        <div className="mt-10 flex flex-wrap gap-5 text-sm">
          <Link href="/tickets" className="underline underline-offset-4">
            Your tickets
          </Link>
          <form action={signOutAction}>
            <input type="hidden" name="kind" value="fan" />
            <button type="submit" className="underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
