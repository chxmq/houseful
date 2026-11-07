/**
 * Confirms the post-World purchase path on Unichain Sepolia 1301:
 * faucet → USDT mint/approve → attester attestation → buy, using signer.client.account.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  attestationDomain,
  attestationPrimaryType,
  attestationTypes,
  housefulAbi,
  usdtAbi,
} from "@houseful/contracts";
import { createPublicClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

for (const line of readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i < 0) continue;
  const key = trimmed.slice(0, i);
  const value = trimmed.slice(i + 1);
  if (!process.env[key]) process.env[key] = value;
}

const chainId = 1301;
const rpc = process.env.RPC_URL ?? "https://sepolia.unichain.org";
const houseful = (process.env.NEXT_PUBLIC_HOUSEFUL_ADDRESS ?? process.env.HOUSEFUL_ADDRESS) as Hex;
const usdt = (process.env.USDT_ADDRESS ?? process.env.NEXT_PUBLIC_USDT_ADDRESS) as Hex;
const attesterKey = process.env.ATTESTER_PRIVATE_KEY as Hex;
const faucetKey = process.env.FAUCET_PRIVATE_KEY as Hex;

if (!houseful || !usdt || !attesterKey || !faucetKey) {
  throw new Error("Need HOUSEFUL, USDT, ATTESTER_PRIVATE_KEY, FAUCET_PRIVATE_KEY");
}

const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(rpc) });
const faucet = privateKeyToAccount(faucetKey);
const faucetClient = createWalletClient({ account: faucet, chain: unichainSepolia, transport: http(rpc) });
const attester = privateKeyToAccount(attesterKey);

async function wait(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx failed: ${hash}`);
  return receipt;
}

async function main() {
  const eventCount = await publicClient.readContract({
    address: houseful,
    abi: housefulAbi,
    functionName: "eventCount",
  });
  const eventId = eventCount;
  const view = await publicClient.readContract({
    address: houseful,
    abi: housefulAbi,
    functionName: "getEventInfo",
    args: [eventId],
  });
  const price = view.faceValue;
  // Seated shows reject seat 0; general admission uses 0.
  const seat = view.seated ? 1 : 0;
  console.log(`event #${eventId} faceValue=${price} seated=${view.seated} seat=${seat} sold=${view.sold}/${view.capacity}`);

  const account = privateKeyToAccount(generatePrivateKey());
  const client = createWalletClient({ account, chain: unichainSepolia, transport: http(rpc) });
  console.log(`fan ${account.address}`);

  await wait(await faucetClient.sendTransaction({ to: account.address, value: parseEther("0.02") }));
  await wait(
    await faucetClient.writeContract({
      address: usdt,
      abi: usdtAbi,
      functionName: "mint",
      args: [account.address, price],
    }),
  );

  const approveHash = await client.writeContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "approve",
    args: [houseful, price],
    account: client.account,
  });
  const approveReceipt = await wait(approveHash);
  console.log(`approve ${approveHash} status=${approveReceipt.status} block=${approveReceipt.blockNumber}`);
  // Public Unichain RPC can return a receipt before eth_call sees the new state.
  let allowance = 0n;
  for (let i = 0; i < 30; i++) {
    allowance = await publicClient.readContract({
      address: usdt,
      abi: usdtAbi,
      functionName: "allowance",
      args: [account.address, houseful],
    });
    if (allowance >= price) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`allowance=${allowance}`);
  if (allowance < price) throw new Error(`approve did not stick (allowance ${allowance})`);

  const nullifier = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("hex")}`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const signature = await attester.signTypedData({
    domain: attestationDomain(chainId, houseful),
    types: attestationTypes,
    primaryType: attestationPrimaryType,
    message: {
      eventId,
      nullifier,
      wallet: account.address,
      purpose: 1,
      deadline,
    },
  });

  // Same path as ticket-actions.send: simulate with the wallet's own account, then write.
  const { request: buyReq } = await publicClient.simulateContract({
    account: client.account,
    address: houseful,
    abi: housefulAbi,
    functionName: "buy",
    args: [eventId, seat, nullifier, deadline, signature],
  });
  const hash = await client.writeContract(buyReq);
  const receipt = await wait(hash);
  const held = await publicClient.readContract({
    address: houseful,
    abi: housefulAbi,
    functionName: "ticketOf",
    args: [eventId, account.address],
  });
  console.log(`bought tx=${hash} block=${receipt.blockNumber} held=${JSON.stringify(held, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
