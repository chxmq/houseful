import "./load-env";
import { attestationDomain, attestationPrimaryType, attestationTypes, housefulAbi, housefulAddress } from "@houseful/contracts";
import { asc, isNotNull } from "drizzle-orm";
import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain, chainId } from "../src/lib/chain";
import { db } from "../src/server/db/connection";
import { events } from "../src/server/db/schema";

/**
 * Lists every Mumbai show from the catalog on the Houseful contract, in chainEventId order.
 *
 * On-chain capacity is the Houseful allocation still for sale. Shows marked sold out are filled by
 * seeded holders so the waitlist can be demonstrated; the flagship keeps one seat so a live buyer can
 * take the last one and a second phone can join the line. The other sold-out shows get a short public
 * waitlist, with one person who left, so the line has history to verify.
 */

const FLAGSHIP = "the-last-local-nsci-dome";
const SOLD_OUT_ALLOCATION = 3;
const WAITERS = 5;

const rpc = process.env.RPC_URL ?? activeChain.rpcUrls.default.http[0];
const hostKey = (process.env.FAUCET_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY) as Hex | undefined;
const attesterKey = process.env.ATTESTER_PRIVATE_KEY as Hex | undefined;
const address = (process.env.NEXT_PUBLIC_HOUSEFUL_ADDRESS || housefulAddress(chainId)) as Hex | undefined;

if (!hostKey || !attesterKey || !address) {
  throw new Error("Set FAUCET_PRIVATE_KEY, ATTESTER_PRIVATE_KEY and a Houseful deployment for this chain.");
}

const publicClient = createPublicClient({ chain: activeChain, transport: http(rpc) });
const host = createWalletClient({ account: privateKeyToAccount(hostKey), chain: activeChain, transport: http(rpc) });
const attester = privateKeyToAccount(attesterKey);

async function wait(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

async function fundFan(to: `0x${string}`, amount: bigint) {
  await wait(await host.sendTransaction({ to, value: amount }));
  // Public RPCs can return the receipt before eth_getBalance / eth_estimateGas see the credit.
  for (let i = 0; i < 20; i++) {
    const bal = await publicClient.getBalance({ address: to });
    if (bal >= amount) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Funded ${to} but balance never reached ${amount}`);
}

async function waitForEvent(eventId: bigint) {
  for (let i = 0; i < 30; i++) {
    try {
      return await publicClient.readContract({
        address: address!,
        abi: housefulAbi,
        functionName: "getEventInfo",
        args: [eventId],
      });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Event #${eventId} not readable after create`);
}

async function seedFan(eventId: bigint, faceValue: bigint, action: "buy" | "joinWaitlist") {
  const key = generatePrivateKey();
  const fan = createWalletClient({ account: privateKeyToAccount(key), chain: activeChain, transport: http(rpc) });
  await fundFan(fan.account.address, faceValue + parseEther("0.0005"));

  const nullifier = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("hex")}`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const signature = await attester.signTypedData({
    domain: attestationDomain(chainId, address!),
    types: attestationTypes,
    primaryType: attestationPrimaryType,
    message: { eventId, nullifier, wallet: fan.account.address, purpose: action === "buy" ? 1 : 2, deadline },
  });
  await wait(
    await fan.writeContract({
      address: address!,
      abi: housefulAbi,
      functionName: action,
      args: [eventId, nullifier, deadline, signature],
      value: faceValue,
    }),
  );
  return fan;
}

async function main() {
  const existing = await publicClient.readContract({ address: address!, abi: housefulAbi, functionName: "eventCount" });
  const rows = await db.select().from(events).where(isNotNull(events.chainEventId)).orderBy(asc(events.chainEventId));
  const now = Math.floor(Date.now() / 1000);

  for (const e of rows) {
    const id = BigInt(e.chainEventId!);
    const soldOut = e.status === "sold_out";
    const capacity = BigInt(soldOut ? SOLD_OUT_ALLOCATION : Math.max(1, e.capacity - e.sold));
    const faceValue = BigInt(e.faceValueWei);
    const holdersWanted = soldOut ? Number(capacity) - (e.id === FLAGSHIP ? 1 : 0) : 0;

    if (id > existing) {
      const endsAt = BigInt(Math.max(e.endsAt, now + 86_400));
      const cutoff = BigInt(Math.min(Number(endsAt) - 60, Math.max(e.doorsAt - e.surrenderCutoffHours * 3600, now + 3600)));
      const receipt = await wait(
        await host.writeContract({
          address: address!,
          abi: housefulAbi,
          functionName: "createEvent",
          args: [
            {
              faceValue,
              capacity,
              saleStart: BigInt(now - 60),
              surrenderCutoff: cutoff,
              endsAt,
              metadataURI: `houseful:event/${e.id}`,
              metadataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            },
          ],
        }),
      );
      const [created] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "EventCreated" });
      if (!created || created.args.eventId !== id) {
        throw new Error(`Chain id drift: ${e.id} expected #${id}, contract assigned #${created?.args.eventId}`);
      }
      await waitForEvent(id);
      console.log(`list  #${id} ${e.id}  capacity ${capacity}`);
    } else {
      console.log(`skip  #${id} ${e.id} (already listed)`);
    }

    if (holdersWanted > 0) {
      const info = await waitForEvent(id);
      const missing = holdersWanted - Number(info.sold);
      for (let i = 0; i < missing; i++) await seedFan(id, faceValue, "buy");
      if (missing > 0) console.log(`fill  #${id} ${e.id}  +${missing} holders`);
    }
  }

  for (const e of rows) {
    if (e.status !== "sold_out" || e.id === FLAGSHIP) continue;
    const id = BigInt(e.chainEventId!);
    const info = await waitForEvent(id);
    if (info.sold < info.capacity) {
      console.log(`wait  #${id} ${e.id}  not sold out yet (${info.sold}/${info.capacity})`);
      continue;
    }
    if (info.waitlistLength > 0n) continue;

    const faceValue = BigInt(e.faceValueWei);
    const fans = [];
    for (let i = 0; i < WAITERS; i++) fans.push(await seedFan(id, faceValue, "joinWaitlist"));
    await wait(
      await fans[1].writeContract({ address: address!, abi: housefulAbi, functionName: "leaveWaitlist", args: [id, 1n] }),
    );
    console.log(`line  #${id} ${e.id}  ${WAITERS} waiting, one left`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
