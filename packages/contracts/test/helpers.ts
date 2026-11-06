import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Signer, TypedDataDomain } from "ethers";
import type { Houseful } from "../typechain-types";
import type { TestUSDT } from "../typechain-types";

export const Purpose = { None: 0, Buy: 1, Join: 2, Claim: 3, Recover: 4 } as const;
export type PurposeValue = (typeof Purpose)[keyof typeof Purpose];

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "eventId", type: "uint256" },
    { name: "nullifier", type: "uint256" },
    { name: "wallet", type: "address" },
    { name: "purpose", type: "uint8" },
    { name: "deadline", type: "uint256" },
  ],
};

/** 10 USDT in 6-decimal base units. */
export const FACE = 10n * 10n ** 6n;
export const HOUR = 3600;
export const POOL_FEE = 3000;

export async function domainOf(c: Houseful): Promise<TypedDataDomain> {
  const { chainId } = await ethers.provider.getNetwork();
  return { name: "Houseful", version: "1", chainId, verifyingContract: await c.getAddress() };
}

export interface AttestOptions {
  signer: Signer;
  eventId: bigint | number;
  nullifier: bigint | number;
  wallet: string;
  purpose: PurposeValue;
  deadline?: bigint | number;
  domain?: TypedDataDomain;
}

export async function attest(c: Houseful, o: AttestOptions): Promise<{ deadline: bigint; sig: string }> {
  const deadline = BigInt(o.deadline ?? (await time.latest()) + HOUR);
  const sig = await o.signer.signTypedData(o.domain ?? (await domainOf(c)), ATTESTATION_TYPES, {
    eventId: o.eventId,
    nullifier: o.nullifier,
    wallet: o.wallet,
    purpose: o.purpose,
    deadline,
  });
  return { deadline, sig };
}

export function chainHead(entries: { nullifier: bigint; wallet: string }[]): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return entries.reduce(
    (head, e) => ethers.keccak256(coder.encode(["bytes32", "uint256", "address"], [head, e.nullifier, e.wallet])),
    ethers.ZeroHash,
  );
}

export async function fundAndApprove(usdt: TestUSDT, houseful: Houseful, who: { address: string }, amount = FACE * 20n) {
  await usdt.mint(who.address, amount);
  await usdt.connect(who as never).approve(await houseful.getAddress(), amount);
}

export async function usdtBal(usdt: TestUSDT, who: string) {
  return usdt.balanceOf(who);
}
