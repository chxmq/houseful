"use client";

import { activeChain, explorerAddress } from "@/lib/chain";
import { contractAddress, usdtAddr } from "@/lib/contract";
import { shortHex } from "@/lib/format";

/** Plain reminder that checkout settles on a real testnet contract, not a fake balance. */
export function SettlementStrip() {
  const houseful = contractAddress ? explorerAddress(contractAddress) : null;
  const usdt = usdtAddr ? explorerAddress(usdtAddr) : null;

  return (
    <p className="mt-4 text-xs leading-relaxed text-muted">
      Settles on {activeChain.name}
      {houseful && contractAddress ? (
        <>
          {" · "}
          <a href={houseful} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Houseful {shortHex(contractAddress, 4, 4)}
          </a>
        </>
      ) : null}
      {usdt && usdtAddr ? (
        <>
          {" · "}
          <a href={usdt} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            test USDT {shortHex(usdtAddr, 4, 4)}
          </a>
        </>
      ) : (
        " · test USDT"
      )}
      .
    </p>
  );
}
