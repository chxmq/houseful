import Link from "next/link";
import { signOutAction } from "@/server/auth/actions";
import type { SessionSummary } from "@/server/auth/session";

export function AccountMenu({ session }: { session: SessionSummary | null }) {
  if (!session) {
    return (
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Link href="/login" className="px-2 py-2 text-sm font-medium sm:px-3">
          Sign in
        </Link>
        <Link href="/host/login" className="hidden px-3 py-2 text-sm font-medium text-ink-soft lg:block">
          Host
        </Link>
      </div>
    );
  }

  const home = session.account.kind === "host" ? "/host" : "/account";
  const fullLabel = session.account.kind === "host" ? "Host console" : "Account";
  const shortLabel = session.account.kind === "host" ? "Host" : "You";

  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link href={home} aria-label={fullLabel} className="px-2 py-2 text-sm font-medium sm:px-3">
        <span aria-hidden="true" className="sm:hidden">
          {shortLabel}
        </span>
        <span aria-hidden="true" className="hidden sm:inline">
          {fullLabel}
        </span>
      </Link>
      <form action={signOutAction}>
        <input type="hidden" name="kind" value={session.account.kind} />
        <button type="submit" aria-label="Sign out" className="px-2 py-2 text-sm font-medium text-ink-soft sm:px-3">
          <span aria-hidden="true" className="sm:hidden">
            Out
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            Sign out
          </span>
        </button>
      </form>
    </div>
  );
}
