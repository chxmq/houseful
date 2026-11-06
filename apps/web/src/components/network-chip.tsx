"use client";

import { activeChain, chainId } from "@/lib/chain";

/** Small production-style network marker so testnet never looks like mainnet. */
export function NetworkChip() {
  const testnet = activeChain.testnet ?? chainId === 31337;
  if (!testnet) return null;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-ink/15 bg-paper-deep px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft sm:inline-flex"
      title={`${activeChain.name} · chain ${chainId}`}
    >
      <span className="size-1.5 rounded-full bg-marigold" aria-hidden />
      {activeChain.name}
    </span>
  );
}
