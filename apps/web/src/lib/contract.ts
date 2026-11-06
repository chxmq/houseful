import { housefulAbi, housefulAddress } from "@houseful/contracts";
import { chainId } from "./chain";

export { housefulAbi };

export const contractAddress = (process.env.NEXT_PUBLIC_HOUSEFUL_ADDRESS || housefulAddress(chainId)) as
  | `0x${string}`
  | undefined;

export const purposeCode = { buy: 1, join: 2, claim: 3 } as const;
export type PurposeName = keyof typeof purposeCode;
