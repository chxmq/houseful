# Uniswap developer feedback

Project: Houseful, built at ETHGlobal Mumbai, 5 to 7 November 2026.
Chain: Unichain Sepolia (chain id 1301). Everything below was done on that test network.

## What we built with Uniswap

A buyer can pay for a ticket in ETH. The Houseful contract swaps that ETH for exactly the ticket's face value in a test USDT, in the same transaction, and sends any leftover ETH back to the buyer.

- **Swap:** `_swapEthForFaceValue` in `packages/contracts/contracts/Houseful.sol` calls SwapRouter02 `multicall` with two calls: `exactOutputSingle` (recipient is the Houseful contract) then `refundETH`. It measures the contract's USDT balance before and after, and only credits the sale if the balance rose by exactly the face value.
- **Quote:** `apps/web/src/lib/ticket-actions.ts` calls QuoterV2 `quoteExactOutputSingle` so the fan sees the ETH amount first. The page sends a small margin over the quote, and the router returns what it does not use.
- **Pool:** `packages/contracts/scripts/seed-pool.ts` creates and initialises a WETH and test USDT pool at the 0.3% fee through the NonfungiblePositionManager (`createAndInitializePoolIfNecessary`, then a full-range mint of 1 ETH and 3,000 test USDT).
- **Proof script:** `packages/contracts/scripts/prove-uniswap.ts` does a real ETH purchase and prints the explorer link.

Contracts we used on Unichain Sepolia: factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`, SwapRouter02 `0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166`, QuoterV2 `0x6Dd37329A1A225a6Fca658265D460423DCafBF89`, NonfungiblePositionManager `0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075`, WETH `0x4200000000000000000000000000000000000006`.

Live transactions (all succeeded):
- ETH purchase on the final Houseful contract `0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e`: https://sepolia.uniscan.xyz/tx/0x8ca75ec0da716d5469bf4706232a47ee5eb19a0e3702055de304e0bfe785780f
- Earlier ETH purchases on two previous deployments: https://sepolia.uniscan.xyz/tx/0x3c08d9ca308ad68c6446a8f26a45869fa82aaac78c773cee7cb775249a616966 and https://sepolia.uniscan.xyz/tx/0x88abc160de3dae410ba86f0dca889d742fb267ac76c4447d65f5707ab7181030
- Pool creation: https://sepolia.uniscan.xyz/tx/0x7aa9c7f8da2bf9a6d6712a51308874f04f64a9237a55fce73ec3d6ba0bf23e0e and liquidity mint: https://sepolia.uniscan.xyz/tx/0x1ebd231a0cb401f67744a90abcf16b0c4204d2fb3080583dd0deadd746cfae4f

## How long it took (from our log in `docs/notes/uniswap-friction.md`, 7 November, IST)

- 01:51 bridged ETH from Ethereum Sepolia; it arrived on Unichain about 60 seconds after the L1 receipt.
- 01:53 deployed our test token and contract.
- 01:54 created and seeded the pool.
- 01:55 first QuoterV2 quote (about 2 minutes after the deploy) and first successful `buyWithEth`.
- About 4 minutes from starting the bridge to the first live swap.

## What worked well

- Unichain Sepolia already has the official v3 contracts, and blocks are fast, so a swap is confirmed in a couple of seconds.
- The `multicall` plus `refundETH` pattern let a contract pay with ETH and get the unused part back without wrapping or unwrapping by hand.
- QuoterV2 is simple to call for an exact-output quote.

## Friction we hit

1. **Addresses are scattered.** The docs we read do not list the Unichain Sepolia NonfungiblePositionManager and QuoterV2 addresses in one place. We took them from the SDK addresses file and checked each one has code on chain. The L1 bridge address came from the Superchain registry.
2. **`ExactOutputSingleParams` in SwapRouter02 has no `deadline` field**, unlike the older SwapRouter. Using the older struct compiles but silently encodes the wrong call data. A warning in the docs would have saved us time.
3. **Public RPC lag after pool creation.** The factory's `getPool` returned zero for a few hundred milliseconds after the pool was created. We re-query before treating creation as failed.

## What we did not use

We read the Continuous Clearing Auction contracts and docs (`requiredCurrencyRaised`, `validationHook`) while designing a pledge feature. We did not build on it for this submission, so we have no hands-on feedback about it.

## Suggestions

- One deployments page per chain with factory, router, quoter, position manager, WETH and Permit2 side by side, with explorer links, including testnets.
- State clearly on the SwapRouter02 reference page that its swap params have no `deadline`, and show the `multicall` plus `refundETH` recipe for a contract that pays with ETH.
- Mention RPC propagation delay in the pool creation guide.
