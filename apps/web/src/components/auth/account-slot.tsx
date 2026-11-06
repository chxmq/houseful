import { Suspense } from "react";
import { getSession } from "@/server/auth/session";
import { AccountMenu } from "./account-menu";

async function AccountMenuLoaded() {
  const session = await getSession();
  return <AccountMenu session={session} />;
}

export function AccountSlot() {
  return (
    <Suspense fallback={<span className="px-3 py-2 text-sm text-muted">…</span>}>
      <AccountMenuLoaded />
    </Suspense>
  );
}
