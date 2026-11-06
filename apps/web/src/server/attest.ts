import "server-only";
import { attestationDomain, attestationPrimaryType, attestationTypes } from "@houseful/contracts";
import { privateKeyToAccount } from "viem/accounts";
import { contractAddress, purposeCode, type PurposeName } from "@/lib/contract";
import { serverEnv } from "./env";

const TTL_SECONDS = 15 * 60;

export async function signAttestation(input: {
  chainEventId: number;
  nullifier: bigint;
  wallet: `0x${string}`;
  purpose: PurposeName;
}) {
  const env = serverEnv();
  if (!contractAddress) throw new Error("No Houseful contract is configured for this chain.");

  const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as `0x${string}`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + TTL_SECONDS);

  const signature = await account.signTypedData({
    domain: attestationDomain(env.CHAIN_ID, contractAddress),
    types: attestationTypes,
    primaryType: attestationPrimaryType,
    message: {
      eventId: BigInt(input.chainEventId),
      nullifier: input.nullifier,
      wallet: input.wallet,
      purpose: purposeCode[input.purpose],
      deadline,
    },
  });

  return { signature, deadline: Number(deadline) };
}
