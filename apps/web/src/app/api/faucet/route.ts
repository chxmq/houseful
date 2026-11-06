import { createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { activeChain } from "@/lib/chain";

const body = z.object({ address: z.string().refine(isAddress, "Not an address") });

const DRIP = parseEther(process.env.FAUCET_DRIP_ETH ?? "0.02");
const recent = new Map<string, number>();

export async function POST(req: Request) {
  const key = process.env.FAUCET_PRIVATE_KEY;
  if (!key) return Response.json({ error: "Test ETH top-ups are switched off on this deployment." }, { status: 503 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a valid address." }, { status: 400 });

  const address = parsed.data.address.toLowerCase() as `0x${string}`;
  const last = recent.get(address) ?? 0;
  if (Date.now() - last < 60_000) {
    return Response.json({ error: "This wallet was topped up a moment ago. Try again in a minute." }, { status: 429 });
  }
  recent.set(address, Date.now());

  const client = createWalletClient({
    account: privateKeyToAccount(key as `0x${string}`),
    chain: activeChain,
    transport: http(process.env.RPC_URL ?? activeChain.rpcUrls.default.http[0]),
  });

  try {
    const hash = await client.sendTransaction({ to: address, value: DRIP });
    return Response.json({ hash });
  } catch (err) {
    recent.delete(address);
    return Response.json({ error: `Top-up failed: ${(err as Error).message.split("\n")[0]}` }, { status: 502 });
  }
}
