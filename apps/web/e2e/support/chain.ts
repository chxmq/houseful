import { housefulAbi } from "@houseful/contracts";
import { expect, type Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
  type Address,
  type GetContractEventsReturnType,
} from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { hardhat } from "viem/chains";
import { HARDHAT_KEYS, URLS, readDeployment } from "../stack/config";
import { toCanonicalNullifier } from "./world-bridge";

type HousefulEventName = Extract<(typeof housefulAbi)[number], { type: "event" }>["name"];
export type HousefulLog<Name extends HousefulEventName = HousefulEventName> = GetContractEventsReturnType<
  typeof housefulAbi,
  Name
>[number];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The test process's view of the local chain: fund wallets, read the Houseful contract, and wait for
 * what the app does on chain. Reads go straight to the Hardhat node, so they show the truth even when
 * the page has not caught up.
 */
export function createChain(rpcUrl: string = URLS.rpc) {
  const contract = readDeployment().address;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: hardhat, transport });

  // Hardhat keeps its development accounts unlocked and numbers their transactions itself. Asking it to send
  // (instead of signing here) means a test can fund a wallet at the same moment the app's faucet is paying one.
  const funder = createWalletClient({
    account: privateKeyToAddress(HARDHAT_KEYS.account0),
    chain: hardhat,
    transport,
  });

  const nullifierToBigint = (value: string | bigint) => BigInt(`0x${toCanonicalNullifier(value).slice(4)}`);

  async function balanceOf(address: Address): Promise<bigint> {
    return publicClient.getBalance({ address });
  }

  /** Sends test ETH from Hardhat account 0 and returns once the new balance is visible. */
  async function fund(address: Address, eth = "0.05"): Promise<bigint> {
    if (!isAddress(address)) throw new Error(`${address} is not an address.`);
    const before = await balanceOf(address);
    const value = parseEther(eth);
    const hash = await funder.sendTransaction({ to: address, value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Funding ${address} reverted (${hash}).`);
    for (let attempt = 0; attempt < 20; attempt++) {
      const now = await balanceOf(address);
      if (now >= before + value) return now;
      await pause(100);
    }
    throw new Error(`${address} was funded but its balance never rose by ${eth} ETH.`);
  }

  const read = {
    eventCount: () => publicClient.readContract({ address: contract, abi: housefulAbi, functionName: "eventCount" }),
    eventInfo: (chainEventId: number) =>
      publicClient.readContract({
        address: contract,
        abi: housefulAbi,
        functionName: "getEventInfo",
        args: [BigInt(chainEventId)],
      }),
    /** The wallet's ticket id for the show, or null when it holds none. */
    ticketOf: async (chainEventId: number, holder: Address): Promise<number | null> => {
      const [held, ticketId] = await publicClient.readContract({
        address: contract,
        abi: housefulAbi,
        functionName: "ticketOf",
        args: [BigInt(chainEventId), holder],
      });
      return held ? Number(ticketId) : null;
    },
    /** The wallet's place on the waitlist, or null when it is not waiting. */
    waitlistPositionOf: async (chainEventId: number, holder: Address): Promise<number | null> => {
      const [waiting, position] = await publicClient.readContract({
        address: contract,
        abi: housefulAbi,
        functionName: "waitlistPositionOf",
        args: [BigInt(chainEventId), holder],
      });
      return waiting ? Number(position) : null;
    },
    /** Whether this person (a nullifier in any spelling) already holds a ticket or a waitlist place for the show. */
    nullifierUsed: (chainEventId: number, person: string | bigint) =>
      publicClient.readContract({
        address: contract,
        abi: housefulAbi,
        functionName: "nullifierUsed",
        args: [BigInt(chainEventId), nullifierToBigint(person)],
      }),
  };

  /** Take this before acting, then pass it to waitForEvent so only what follows counts. */
  const blockNumber = () => publicClient.getBlockNumber();

  /** Resolves with the first matching Houseful event at or after `fromBlock`. */
  async function waitForEvent<Name extends HousefulEventName>(options: {
    eventName: Name;
    fromBlock?: bigint;
    where?: (log: HousefulLog<Name>) => boolean;
    timeoutMs?: number;
  }): Promise<HousefulLog<Name>> {
    const end = Date.now() + (options.timeoutMs ?? 30_000);
    while (Date.now() < end) {
      const logs = await publicClient.getContractEvents({
        address: contract,
        abi: housefulAbi,
        eventName: options.eventName,
        fromBlock: options.fromBlock ?? 0n,
        toBlock: "latest",
      });
      const match = (logs as HousefulLog<Name>[]).find((log) => (options.where ? options.where(log) : true));
      if (match) return match;
      await pause(200);
    }
    throw new Error(`No ${options.eventName} event appeared on the chain within ${(options.timeoutMs ?? 30_000) / 1000}s.`);
  }

  /**
   * Waits for a Houseful event on the chain, then for the page to show what it caused. The app reads the
   * chain on a timer, so `shows` is retried, and `reload` fetches the page again between tries for views that
   * only read the chain when they open. A failure says which half did not happen.
   */
  async function untilShown<Name extends HousefulEventName>(
    page: Page,
    event: { eventName: Name; fromBlock?: bigint; where?: (log: HousefulLog<Name>) => boolean },
    shows: () => Promise<void>,
    options: { timeoutMs?: number; reload?: boolean } = {},
  ): Promise<HousefulLog<Name>> {
    const log = await waitForEvent({ ...event, timeoutMs: options.timeoutMs });
    await expect(async () => {
      if (options.reload) await page.reload();
      await shows();
    }, `${event.eventName} is on the chain, but the page does not show it`).toPass({
      timeout: options.timeoutMs ?? 30_000,
      intervals: [250, 500, 1000, 2000],
    });
    return log;
  }

  return {
    rpcUrl,
    /** The Houseful contract the stack deployed. */
    contract,
    publicClient,
    balanceOf,
    fund,
    read,
    blockNumber,
    waitForEvent,
    untilShown,
  };
}

export type Chain = ReturnType<typeof createChain>;
