# Uniswap friction log (Unichain Sepolia)

Timestamps are IST on Sat 7 Nov 2026. This file feeds FEEDBACK.md.

## Goal

Live `buyWithEth` on Unichain Sepolia (1301) through SwapRouter02, with a WETH/USDT 0.3% pool seeded at 1 ETH = 3,000 USDT.

## Addresses from the spec (confirmed)

| Contract | Address |
|---|---|
| Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| SwapRouter02 | `0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166` |
| QuoterV2 | `0x6Dd37329A1A225a6Fca658265D460423DCafBF89` |
| NonfungiblePositionManager | `0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075` |
| WETH | `0x4200000000000000000000000000000000000006` |
| L1StandardBridgeProxy (to confirm) | `0xea58fcA6849d79EAd1f26608855c2D6407d54Ce2` |

## Log

### 01:35 — rename commit landed

`acef39d` prices the catalog in USDT. Contract rewrite started.

### 01:36 — bridge address confirmed

Superchain registry `sepolia/unichain.toml` lists
`L1StandardBridgeProxy = 0xea58fcA6849d79EAd1f26608855c2D6407d54Ce2` for chain id 1301.
Matches the spec.

### 01:50 — operator balances checked

Operator `0x4e1D675AFb8dceA73bee527951a715d2B7536655`:
- Ethereum Sepolia: **99.499999999989836016 ETH**
- Unichain Sepolia: **0 ETH**

### 01:51 — bridged 3 ETH

`depositETH(200000, 0x)` on the confirmed L1StandardBridgeProxy.
L1 tx: `0x6930620933284f58d313a228001e19b61205af1200fd8b66b87fc1b1477db256`

### 01:52 — L2 credit

Unichain balance reached 3 ETH about **60 seconds** after the L1 receipt.

### 01:53 — deployed TestUSDT + Houseful

- TestUSDT: `0x75a6Cb564AF5A94259238Ef62369E1BC30fDFD5a` (stable)
- First Houseful (prove): `0x26fc1B16FaDE5B92B82CcF5eA598f5b9513430D1`
- Final Houseful (empty for catalog seed): `0x6625C6c097C51d5E77f8Ba2E6AcD098e4B6a51ac`
- Verifier: `0x805d719053f43b96631E8C617B45e41DA085d9F2`
- Wrote `deployments/1301.json`

### 01:54 — first pool

`createAndInitializePoolIfNecessary` + full-range mint (1 ETH + 3,000 USDT) through NPM.
- Pool: `0x64921E7Bc30A947626e54143578937B32D329BC6`
- Create tx: `0x7aa9c7f8da2bf9a6d6712a51308874f04f64a9237a55fce73ec3d6ba0bf23e0e`
- Mint tx: `0x1ebd231a0cb401f67744a90abcf16b0c4204d2fb3080583dd0deadd746cfae4f`
- Doc gap: factory `getPool` can still return zero for a few hundred ms after create on this RPC. Re-query before treating create as failed.

### 01:55 — first QuoterV2 quote

`quoteExactOutputSingle` for 10 USDT out returned **0.003354545241074395 ETH** in.
Time from deploy to first working quote: **about 2 minutes**.

### 01:55 — first `buyWithEth`

`scripts/prove-uniswap.ts` bought event #1 ticket 0 on the first Houseful deploy.
- Tx: `0x3c08d9ca308ad68c6446a8f26a45869fa82aaac78c773cee7cb775249a616966`
- Explorer: https://sepolia.uniscan.xyz/tx/0x3c08d9ca308ad68c6446a8f26a45869fa82aaac78c773cee7cb775249a616966
- Multicall path: `exactOutputSingle` + `refundETH`, recipient = Houseful

Confirmed again on a second deploy:
- Tx: `0x88abc160de3dae410ba86f0dca889d742fb267ac76c4447d65f5707ab7181030`
- Explorer: https://sepolia.uniscan.xyz/tx/0x88abc160de3dae410ba86f0dca889d742fb267ac76c4447d65f5707ab7181030
- Houseful USDT after: 10_000_000

Then redeployed a clean Houseful at `0x6625C6c097C51d5E77f8Ba2E6AcD098e4B6a51ac` for catalog seeding (eventCount 0). Pool and TestUSDT unchanged.

Time to first success (bridge start → live buyWithEth): **about 4 minutes**.

## Errors

- Prove script first pass printed `Houseful USDT before 0 after 0` then failed decoding `getTicket` through ethers (tuple layout). On-chain state was fine: `TicketBought` in the receipt and USDT balance 10e6. Script now asserts on the event and receipt status instead of the view decode.

## Doc gaps

- Superchain registry is the right place for the L1 bridge; Uniswap docs do not surface Unichain Sepolia NPM / Quoter addresses in one place. Spec table was accurate.
- SwapRouter02 `ExactOutputSingleParams` has no `deadline` field (unlike the older SwapRouter). Using the v1 struct silently mis-encodes.
- Public Unichain RPC lags `getPool` briefly after pool creation.
