"use client";

import { BaseError, ContractFunctionRevertedError, parseEventLogs, type Hex } from "viem";
import type { Attestation } from "@/components/verify-human";
import { contractAddress, housefulAbi } from "./contract";
import { deviceDoorKey, doorKeyBytes32 } from "./door-key";
import { deviceWallet, ensureFunded, publicClient } from "./device-wallet";

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
  InvalidAttestation: "The verification did not match this purchase.",
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
};

export function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return friendly[name] ?? `The contract refused: ${name || revert.shortMessage}`;
    }
    if (/insufficient funds/i.test(err.message)) return "This phone's wallet does not have enough test ETH.";
    return err.shortMessage;
  }
  return (err as Error)?.message ?? "Something went wrong.";
}

function requireContract() {
  if (!contractAddress) throw new Error("Houseful is not deployed on this network yet.");
  return contractAddress;
}

export async function send(
  functionName:
    | "buy"
    | "joinWaitlist"
    | "claimReturned"
    | "surrender"
    | "leaveWaitlist"
    | "setDoorKey"
    | "createEvent"
    | "cancelEvent"
    | "withdrawProceeds"
    | "claimRefund",
  args: readonly unknown[],
  value = 0n,
) {
  const address = requireContract();
  const { client, account } = deviceWallet();
  await ensureFunded(account.address, value + 2_000_000_000_000_000n);

  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi: housefulAbi,
    functionName,
    args: args as never,
    value,
  } as never);
  const hash = await client.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function bindDoorKey(chainEventId: number, ticketId: number) {
  const key = deviceDoorKey();
  return send("setDoorKey", [BigInt(chainEventId), BigInt(ticketId), doorKeyBytes32(key)]);
}

export async function buyTicket(chainEventId: number, faceValue: bigint, att: Attestation) {
  const { hash, receipt } = await send(
    "buy",
    [BigInt(chainEventId), BigInt(att.nullifier), BigInt(att.deadline), att.signature],
    faceValue,
  );
  const [bought] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "TicketBought" });
  const ticketId = Number(bought.args.ticketId);
  const bind = await bindDoorKey(chainEventId, ticketId);
  return { hash, ticketId, bindHash: bind.hash };
}

export async function claimReturnedSeat(chainEventId: number, ticketId: number, faceValue: bigint, att: Attestation) {
  const { hash } = await send(
    "claimReturned",
    [BigInt(chainEventId), BigInt(ticketId), BigInt(att.nullifier), BigInt(att.deadline), att.signature],
    faceValue,
  );
  const bind = await bindDoorKey(chainEventId, ticketId);
  return { hash, ticketId, bindHash: bind.hash };
}

export async function joinWaitlist(chainEventId: number, faceValue: bigint, att: Attestation) {
  const { hash, receipt } = await send(
    "joinWaitlist",
    [BigInt(chainEventId), BigInt(att.nullifier), BigInt(att.deadline), att.signature],
    faceValue,
  );
  const [joined] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "WaitlistJoined" });
  return { hash, position: Number(joined.args.position), head: joined.args.head as Hex };
}

export async function surrenderTicket(chainEventId: number, ticketId: number) {
  const { hash, receipt } = await send("surrender", [BigInt(chainEventId), BigInt(ticketId)]);
  const [ev] = parseEventLogs({ abi: housefulAbi, logs: receipt.logs, eventName: "Surrendered" });
  return { hash, to: ev.args.to as `0x${string}`, generation: Number(ev.args.generation) };
}

export async function claimRefund(chainEventId: number) {
  return send("claimRefund", [BigInt(chainEventId)]);
}

export async function leaveWaitlist(chainEventId: number, position: number) {
  return send("leaveWaitlist", [BigInt(chainEventId), BigInt(position)]);
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
