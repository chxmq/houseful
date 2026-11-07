import Link from "next/link";
import { TicketIcon } from "@/components/icons";
import { signOutAction } from "@/server/auth/actions";
import type { SessionSummary } from "@/server/auth/session";

export function AccountMenu({ session }: { session: SessionSummary | null }) {
  if (!session) {
    return (
      <Link
        href="/login"
        className="ml-0.5 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3 py-2 text-sm font-medium text-paper sm:ml-1 sm:px-4"
      >
        Sign in
      </Link>
    );
  }

  if (session.account.kind === "host") {
    return (
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Link
          href="/host"
          aria-label="Host console"
          className="ml-0.5 inline-flex items-center whitespace-nowrap rounded-full bg-ink px-3 py-2 text-sm font-medium text-paper sm:ml-1 sm:px-4"
        >
          Host console
        </Link>
        <form action={signOutAction}>
          <input type="hidden" name="kind" value="host" />
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

  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link
        href="/tickets"
        className="ml-0.5 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3 py-2 text-sm font-medium text-paper sm:ml-1 sm:px-4"
      >
        <TicketIcon size={16} />
        <span className="sr-only sm:not-sr-only">Your tickets</span>
      </Link>
      <Link href="/account" aria-label="Account" className="px-2 py-2 text-sm font-medium sm:px-3">
        <span aria-hidden="true" className="sm:hidden">
          You
        </span>
        <span aria-hidden="true" className="hidden sm:inline">
          Account
        </span>
      </Link>
      <form action={signOutAction}>
        <input type="hidden" name="kind" value="fan" />
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
