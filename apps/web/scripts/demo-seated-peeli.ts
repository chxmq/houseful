/**
 * Demo fix: Peeli (and a couple theatre nights) were listed as general admission,
 * so the seat map never appeared. Creates small seated chain events and points
 * the catalog rows at them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { housefulAbi } from "@houseful/contracts";
import { createClient } from "@libsql/client";
import { createPublicClient, createWalletClient, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

for (const line of readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i < 0) continue;
  const key = trimmed.slice(0, i);
  if (!process.env[key]) process.env[key] = trimmed.slice(i + 1);
}

const houseful = process.env.NEXT_PUBLIC_HOUSEFUL_ADDRESS as Hex;
const hostKey = process.env.FAUCET_PRIVATE_KEY as Hex;
const rpc = process.env.RPC_URL ?? "https://sepolia.unichain.org";

const demos = [
  { id: "kaali-peeli-sound-system-choti-diwali", capacity: 24, faceValue: 9_000_000n },
  { id: "tatkaar-ncpa", capacity: 36, faceValue: 18_000_000n },
  { id: "marine-drive-string-quartet-royal-opera-house", capacity: 40, faceValue: 25_000_000n },
] as const;

const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(rpc) });
const host = createWalletClient({
  account: privateKeyToAccount(hostKey),
  chain: unichainSepolia,
  transport: http(rpc),
});
const db = createClient({ url: process.env.DATABASE_URL || "file:./data/houseful.db" });

async function wait(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx failed ${hash}`);
  return receipt;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  for (const demo of demos) {
    const endsAt = BigInt(now + 7 * 86_400);
    const cutoff = BigInt(now + 3 * 86_400);
    const hash = await host.writeContract({
      address: houseful,
      abi: housefulAbi,
      functionName: "createEvent",
      args: [
        {
          faceValue: demo.faceValue,
          capacity: BigInt(demo.capacity),
          seated: true,
          saleStart: BigInt(now - 60),
          surrenderCutoff: cutoff,
          endsAt,
          metadataURI: `houseful:event/${demo.id}:seated-demo`,
          metadataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      ],
    });
    const receipt = await wait(hash);
    const [created] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "EventCreated" });
    const eventId = Number(created!.args.eventId);
    await db.execute({
      sql: "update events set chain_event_id = ?, seated = 1, capacity = ?, sold = 0, status = 'on_sale' where id = ?",
      args: [eventId, demo.capacity, demo.id],
    });
    console.log(`${demo.id} → chain #${eventId} seated capacity ${demo.capacity}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
