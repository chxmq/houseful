import { defineChain, type Chain } from "viem";
import { hardhat } from "viem/chains";

export const worldchainSepolia = defineChain({
  id: 4801,
  name: "World Chain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://worldchain-sepolia.g.alchemy.com/public"] } },
  blockExplorers: { default: { name: "Worldscan", url: "https://sepolia.worldscan.org" } },
  testnet: true,
});

export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
  blockExplorers: { default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" } },
  testnet: true,
});

const chains: Record<number, Chain> = {
  [hardhat.id]: hardhat,
  [worldchainSepolia.id]: worldchainSepolia,
  [unichainSepolia.id]: unichainSepolia,
};

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || hardhat.id);
export const activeChain: Chain = chains[chainId] ?? hardhat;
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || activeChain.rpcUrls.default.http[0];

export function explorerTx(hash: string) {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddress(address: string) {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}
