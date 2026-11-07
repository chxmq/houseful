import { getSession } from "@/server/auth/session";
import { db, listWallets } from "@/server/auth/store";

export async function GET() {
  const session = await getSession();
  if (!session || session.account.kind !== "fan") {
    return Response.json({ address: null });
  }
  const linked = await listWallets(db, session.account.id);
  const active = linked.find((w) => w.active) ?? linked[0] ?? null;
  return Response.json({
    address: active?.address ?? null,
    kind: active?.kind ?? null,
  });
}
