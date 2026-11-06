"use client";

import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  type Hex,
  type WalletClient,
} from "viem";
import type { Attestation } from "@/components/verify-human";
import { contractAddress, housefulAbi, quoterAddr, usdtAddr, usdtAbi, poolFee } from "./contract";
import { deviceDoorKey, doorKeyBytes32 } from "./door-key";
import { deviceWallet, ensureFunded, publicClient } from "./device-wallet";

/** Wallet the product stream will swap in; device wallet fills this until then. */
export type ActionSigner = {
  address: `0x${string}`;
  kind: "device" | "external";
  client: WalletClient;
};

export function deviceSigner(): ActionSigner {
  const { client, account } = deviceWallet();
  return { address: account.address, kind: "device", client };
}

const payWithEth = process.env.NEXT_PUBLIC_PAY_WITH_ETH !== "false";

const friendly: Record<string, string> = {
  SurrenderOnly: "Houseful tickets cannot be sold or sent on. You can only hand them back to the waitlist.",
  SoldOut: "The last seat went a moment ago. You can join the waitlist instead.",
  SeatsAvailable: "Seats are still on sale, so there is no waitlist yet.",
  SaleNotOpen: "Sales for this show are not open.",
  WaitlistClosed: "The waitlist has closed for this show.",
  SurrenderClosed: "It is too close to the show to hand a ticket back.",
  NullifierUsed: "This person already holds a ticket or waitlist place for this show.",
  WalletHasTicket: "This phone already holds a ticket for this show.",
  WalletOnWaitlist: "This phone is already on the waitlist.",
  AttestationExpired: "Your verification expired. Verify again to continue.",
  AttestationSpent: "This verification was already used. Verify again to continue.",
  InvalidAttestation: "The verification did not match this purchase.",
  WaitlistBacklog: "The waitlist has a backlog of departed slots. Ask someone to clear it, then try again.",
  EventIsCancelled: "This show was cancelled. You can claim a refund.",
  WrongPayment: "The amount sent did not match the face value.",
  NotTicketOwner: "This ticket is not held by this phone.",
  InvalidSchedule: "The dates do not work: the hand-back cutoff must come after sales open and before the show ends.",
  InvalidCapacity: "A show needs at least one seat.",
  NotHost: "Only the wallet that listed this show can do that.",
  EventEnded: "This show has already ended.",
  EventNotEnded: "Proceeds unlock once the show has ended.",
  ProceedsAlreadyWithdrawn: "Proceeds for this show were already withdrawn.",
  NothingToRefund: "There is nothing to refund to this phone.",
  SeatTaken: "That seat was just taken. Pick another.",
  InvalidSeat: "That seat is not available for this show.",
  SwapFailed: "Could not convert Ethereum to cover this ticket. Try Pay now instead.",
  InsufficientEthForSwap: "Not enough Ethereum was sent to cover the ticket price.",
};

export function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      if (name === "SeatTaken") {
        const seat = (revert.data?.args as unknown[] | undefined)?.[0];
        return seat != null ? `Seat ${seat} was just taken. Pick another.` : friendly.SeatTaken;
      }
      return friendly[name] ?? `The contract refused: ${name || revert.shortMessage}`;
    }
    if (/insufficient funds/i.test(err.message)) return "This wallet does not have enough Ethereum for network fees.";
    return err.shortMessage;
  }
  return (err as Error)?.message ?? "Something went wrong.";
}

function requireContract() {
  if (!contractAddress) throw new Error("Houseful is not deployed on this network yet.");
  return contractAddress;
}

function requireUsdt() {
  if (!usdtAddr) throw new Error("Settlement token is not configured on this network yet.");
  return usdtAddr;
}

export async function send(
  signer: ActionSigner,
  functionName:
    | "buy"
    | "buyWithEth"
    | "joinWaitlist"
    | "joinWaitlistWithEth"
    | "claimReturned"
    | "claimReturnedWithEth"
    | "surrender"
    | "leaveWaitlist"
    | "setDoorKey"
    | "createEvent"
    | "cancelEvent"
    | "withdrawProceeds"
    | "claimRefund"
    | "recoverTicket",
  args: readonly unknown[],
  value = 0n,
) {
  const address = requireContract();
  if (signer.kind === "device") {
    await ensureFunded(signer.address, value + 2_000_000_000_000_000n);
  }

  const { request } = await publicClient.simulateContract({
    account: signer.client.account,
    address,
    abi: housefulAbi,
    functionName,
    args: args as never,
    value,
  } as never);
  const hash = await signer.client.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

async function ensureUsdt(signer: ActionSigner, need: bigint) {
  const token = requireUsdt();
  const balance = await publicClient.readContract({
    address: token,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [signer.address],
  });
  if (balance >= need) return;

  if (signer.kind !== "device") {
    throw new Error("This wallet needs funds for the face price. Use a faucet or the Houseful top-up on a device wallet.");
  }

  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: signer.address, needUsdt: need.toString() }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error ?? "Could not top up this wallet for the face price.");
  }
  const { usdtHash, hash } = (await res.json()) as { usdtHash?: Hex; hash?: Hex };
  const waitHash = usdtHash ?? hash;
  if (waitHash) await publicClient.waitForTransactionReceipt({ hash: waitHash });
  for (let i = 0; i < 20; i++) {
    const next = await publicClient.readContract({
      address: token,
      abi: usdtAbi,
      functionName: "balanceOf",
      args: [signer.address],
    });
    if (next >= need) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function approveUsdt(signer: ActionSigner, amount: bigint) {
  const token = requireUsdt();
  const spender = requireContract();
  const allowance = await publicClient.readContract({
    address: token,
    abi: usdtAbi,
    functionName: "allowance",
    args: [signer.address, spender],
  });
  if (allowance >= amount) return;
  const { request } = await publicClient.simulateContract({
    account: signer.client.account,
    address: token,
    abi: usdtAbi,
    functionName: "approve",
    args: [spender, amount],
  });
  const hash = await signer.client.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
}

const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** Quote ETH needed for exact faceValue USDT, then add 2 percent headroom. */
export async function quoteEthForUsdt(faceValue: bigint): Promise<bigint> {
  const weth = process.env.NEXT_PUBLIC_WETH_ADDRESS as `0x${string}` | undefined;
  const usdt = usdtAddr;
  if (quoterAddr && quoterAddr !== "0x0000000000000000000000000000000000000000" && weth && usdt) {
    const { result } = await publicClient.simulateContract({
      address: quoterAddr,
      abi: quoterV2Abi,
      functionName: "quoteExactOutputSingle",
      args: [
        {
          tokenIn: weth,
          tokenOut: usdt,
          amount: faceValue,
          fee: poolFee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const amountIn = result[0];
    return amountIn + (amountIn * 2n) / 100n;
  }
  // Fixed mock rate: 1 ETH = 3,000 USDT.
  const amountIn = (faceValue * 10n ** 12n + 2999n) / 3000n;
  return amountIn + (amountIn * 2n) / 100n;
}

export function ethPaymentsEnabled() {
  return payWithEth;
}

export async function bindDoorKey(signer: ActionSigner, chainEventId: number, ticketId: number) {
  const key = deviceDoorKey();
  return send(signer, "setDoorKey", [BigInt(chainEventId), BigInt(ticketId), doorKeyBytes32(key)]);
}

export type PayMethod = "usdt" | "eth";

export async function buyTicket(
  signer: ActionSigner,
  chainEventId: number,
  seat: number,
  faceValue: bigint,
  att: Attestation,
  pay: PayMethod = "usdt",
) {
  const args = [BigInt(chainEventId), seat, BigInt(att.nullifier), BigInt(att.deadline), att.signature] as const;
  let hash: Hex;
  let receipt;
  if (pay === "eth") {
    const value = await quoteEthForUsdt(faceValue);
    ({ hash, receipt } = await send(signer, "buyWithEth", args, value));
  } else {
    await ensureUsdt(signer, faceValue);
    await approveUsdt(signer, faceValue);
    ({ hash, receipt } = await send(signer, "buy", args));
  }
  const [bought] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "TicketBought" });
  const ticketId = Number(bought.args.ticketId);
  const bind = await bindDoorKey(signer, chainEventId, ticketId);
  return { hash, ticketId, seat: Number(bought.args.seat), bindHash: bind.hash };
}

export async function claimReturnedSeat(
  signer: ActionSigner,
  chainEventId: number,
  ticketId: number,
  faceValue: bigint,
  att: Attestation,
  pay: PayMethod = "usdt",
) {
  const args = [
    BigInt(chainEventId),
    BigInt(ticketId),
    BigInt(att.nullifier),
    BigInt(att.deadline),
    att.signature,
  ] as const;
  let hash: Hex;
  if (pay === "eth") {
    const value = await quoteEthForUsdt(faceValue);
    ({ hash } = await send(signer, "claimReturnedWithEth", args, value));
  } else {
    await ensureUsdt(signer, faceValue);
    await approveUsdt(signer, faceValue);
    ({ hash } = await send(signer, "claimReturned", args));
  }
  const bind = await bindDoorKey(signer, chainEventId, ticketId);
  return { hash, ticketId, bindHash: bind.hash };
}

export async function joinWaitlist(
  signer: ActionSigner,
  chainEventId: number,
  faceValue: bigint,
  att: Attestation,
  pay: PayMethod = "usdt",
) {
  const args = [BigInt(chainEventId), BigInt(att.nullifier), BigInt(att.deadline), att.signature] as const;
  let hash: Hex;
  let receipt;
  if (pay === "eth") {
    const value = await quoteEthForUsdt(faceValue);
    ({ hash, receipt } = await send(signer, "joinWaitlistWithEth", args, value));
  } else {
    await ensureUsdt(signer, faceValue);
    await approveUsdt(signer, faceValue);
    ({ hash, receipt } = await send(signer, "joinWaitlist", args));
  }
  const [joined] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "WaitlistJoined" });
  return { hash, position: Number(joined.args.position), head: joined.args.head as Hex };
}

export async function surrenderTicket(signer: ActionSigner, chainEventId: number, ticketId: number) {
  const { hash, receipt } = await send(signer, "surrender", [BigInt(chainEventId), BigInt(ticketId)]);
  const [ev] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "Surrendered" });
  return { hash, to: ev.args.to as `0x${string}`, generation: Number(ev.args.generation) };
}

export async function claimRefund(signer: ActionSigner, chainEventId: number) {
  return send(signer, "claimRefund", [BigInt(chainEventId)]);
}

export async function leaveWaitlist(signer: ActionSigner, chainEventId: number, position: number) {
  return send(signer, "leaveWaitlist", [BigInt(chainEventId), BigInt(position)]);
}

export async function recoverTicket(
  signer: ActionSigner,
  chainEventId: number,
  ticketId: number,
  att: Attestation,
) {
  return send(signer, "recoverTicket", [
    BigInt(chainEventId),
    BigInt(ticketId),
    BigInt(att.nullifier),
    BigInt(att.deadline),
    att.signature,
  ]);
}

export async function returnedSeat(chainEventId: number): Promise<number | null> {
  const address = requireContract();
  const ids = await publicClient.readContract({
    address,
    abi: housefulAbi,
    functionName: "returnedTickets",
    args: [BigInt(chainEventId)],
  });
  return ids.length > 0 ? Number(ids[0]) : null;
}
