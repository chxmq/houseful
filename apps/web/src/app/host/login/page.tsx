import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HostWalletLogin } from "@/components/auth/host-wallet-login";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { safeNextPath } from "@/lib/safe-next";
import { signOutAction } from "@/server/auth/actions";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Host sign in",
  description: "Sign in with your host wallet to list shows and withdraw proceeds.",
  robots: { index: false },
};

const reasons: Record<string, string> = {
  signin: "Sign the host challenge with your wallet.",
  "fan-account": "That session is a fan World ID. Sign in here with the host wallet.",
};

export default function HostLoginPage(props: PageProps<"/host/login">) {
  return <Suspense fallback={<main id="main" className="px-5 py-16" role="status">Loading sign in…</main>}><LoginContent {...props} /></Suspense>;
}

async function LoginContent({ searchParams }: PageProps<"/host/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/host");
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const session = await getSession();

  if (session?.account.kind === "host") redirect(next);
  if (session?.account.kind === "fan" && reason !== "fan-account") redirect("/account");

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Host</p>
        <h1 className="mt-3 font-display text-5xl font-black uppercase leading-none">Host sign in</h1>
        <p className="mt-4 max-w-prose text-ink-soft">
          Hosts sign a message with the payout wallet. Fans use World ID on a separate login.
        </p>
        {reason && reasons[reason] ? <p className="mt-4 text-sm font-medium">{reasons[reason]}</p> : null}
        {session?.account.kind === "fan" ? (
          <form action={signOutAction} className="mt-4">
            <input type="hidden" name="kind" value="fan" />
            <button type="submit" className="text-sm font-semibold underline underline-offset-4">
              Sign out of the fan account first
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <HostWalletLogin next={next} />
          </div>
        )}
        <p className="mt-8 text-sm text-ink-soft">
          Buying tickets?{" "}
          <Link href="/login" className="font-semibold underline underline-offset-4">
            Fan sign in
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
