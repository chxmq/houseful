import Link from "next/link";
import { signOutAction } from "@/server/auth/actions";
import type { SessionSummary } from "@/server/auth/session";

export function AccountMenu({ session }: { session: SessionSummary | null }) {
  if (!session) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className="px-3 py-2 text-sm font-medium">
          Sign in
        </Link>
        <Link href="/host/login" className="hidden px-3 py-2 text-sm font-medium text-ink-soft lg:block">
          Host
        </Link>
      </div>
    );
  }

  const home = session.account.kind === "host" ? "/host" : "/account";
  const label = session.account.kind === "host" ? "Host console" : "Account";

  return (
    <div className="flex items-center gap-1">
      <Link href={home} className="px-3 py-2 text-sm font-medium">
        {label}
      </Link>
      <form action={signOutAction}>
        <input type="hidden" name="kind" value={session.account.kind} />
        <button type="submit" className="px-3 py-2 text-sm font-medium text-ink-soft">
          Sign out
        </button>
      </form>
    </div>
  );
}
