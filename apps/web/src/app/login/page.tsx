import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorldLogin } from "@/components/auth/world-login";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { safeNextPath } from "@/lib/safe-next";
import { signOutAction } from "@/server/auth/actions";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with World ID to buy and hold tickets.",
  robots: { index: false },
};

const reasons: Record<string, string> = {
  signin: "Sign in with World ID to continue.",
  "host-account": "That session is a host wallet. Sign in here as a fan.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return <Suspense fallback={<main id="main" className="px-5 py-16" role="status">Loading sign in…</main>}><LoginContent {...props} /></Suspense>;
}

async function LoginContent({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/account");
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const session = await getSession();

  if (session?.account.kind === "fan") redirect(next);
  // Wrong role: stay so the notice can show, and offer Sign out to switch.
  if (session?.account.kind === "host" && reason !== "host-account") redirect("/host");

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Fan</p>
        <h1 className="mt-3 font-display text-5xl font-black uppercase leading-none">Sign in</h1>
        <p className="mt-4 max-w-prose text-ink-soft">
          Your World ID is the account. No email, no password. One human, one place to keep tickets and wallets.
        </p>
        {reason && reasons[reason] ? <p className="mt-4 text-sm font-medium">{reasons[reason]}</p> : null}
        {session?.account.kind === "host" ? (
          <form action={signOutAction} className="mt-4">
            <input type="hidden" name="kind" value="host" />
            <button type="submit" className="text-sm font-semibold underline underline-offset-4">
              Sign out of the host wallet first
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <WorldLogin next={next} />
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
