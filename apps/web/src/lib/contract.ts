import {
  housefulAbi,
  housefulAddress,
  usdtAbi,
  usdtAddress,
  quoterAddress,
  deployments,
} from "@houseful/contracts";
import { chainId } from "./chain";

export { housefulAbi, usdtAbi };

export const contractAddress = (process.env.NEXT_PUBLIC_HOUSEFUL_ADDRESS || housefulAddress(chainId)) as
  | `0x${string}`
  | undefined;

export const usdtAddr = (process.env.NEXT_PUBLIC_USDT_ADDRESS || usdtAddress(chainId)) as `0x${string}` | undefined;

export const quoterAddr = (process.env.NEXT_PUBLIC_QUOTER_ADDRESS || quoterAddress(chainId)) as
  | `0x${string}`
  | undefined;

export const poolFee = deployments[chainId]?.poolFee ?? 3000;

export const purposeCode = { buy: 1, join: 2, claim: 3, recover: 4 } as const;
export type PurposeName = keyof typeof purposeCode;
