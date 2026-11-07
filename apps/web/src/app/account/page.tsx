import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountWallets } from "@/components/auth/account-wallets";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { signOutAction } from "@/server/auth/actions";
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

        <AccountWallets linked={linked} />

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
