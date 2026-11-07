import { getSession } from "@/server/auth/session";
import { db, linkWallet, listWallets, setActiveWallet } from "@/server/auth/store";
import { isAddress } from "viem";

export async function GET() {
  const session = await getSession();
  if (!session || session.account.kind !== "fan") {
    return Response.json({ signedIn: false, wallets: [] as const });
  }
  const linked = await listWallets(db, session.account.id);
  return Response.json({
    signedIn: true,
    wallets: linked.map((w) => ({
      id: w.id,
      address: w.address,
      kind: w.kind,
      label: w.label,
      active: w.active,
    })),
  });
}

/** Prefer a linked wallet for the next payment. Links this phone's wallet when needed. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.account.kind !== "fan") {
    return Response.json({ error: "Sign in with World ID first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { address?: string; kind?: string };
  const address = String(body.address ?? "").trim().toLowerCase();
  if (!isAddress(address)) {
    return Response.json({ error: "That is not a wallet address." }, { status: 400 });
  }

  const linked = await listWallets(db, session.account.id);
  let row = linked.find((w) => w.address.toLowerCase() === address);
  if (!row) {
    const kind = body.kind === "device" ? "device" : "external";
    row = await linkWallet(db, {
      accountId: session.account.id,
      address: address as `0x${string}`,
      kind,
      label: kind === "device" ? "This phone" : "Linked wallet",
    });
  }
  await setActiveWallet(db, session.account.id, row.id);
  return Response.json({ address: row.address, id: row.id });
}
