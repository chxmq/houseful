# @houseful/contracts

Houseful is a single registry contract that runs many ticketed events, each identified by a `uint256` id starting at 1. Every ticket is bound to one verified human through their World ID nullifier, every sale happens at exactly face value, and the only way a ticket changes hands is `surrender`: the holder returns it, gets face value back, and the oldest active person on the public waitlist receives it in the same transaction. Transfers and approvals exist only to revert with `SurrenderOnly()`.

World ID proofs are verified by the Houseful backend. After a successful verify, the backend signs an EIP-712 `Attestation(uint256 eventId,uint256 nullifier,address wallet,uint8 purpose,uint256 deadline)` with the platform verifier key, under the domain name `Houseful` and version `1`. The purpose is 1 for buy, 2 for joining the waitlist and 3 for claiming a returned seat.

## Layout

`contracts/Houseful.sol` holds events, tickets, the waitlist and surrender logic. `contracts/SaleEscrow.sol` is the per-event ETH ledger, split into proceeds (backing held seats, the only thing a host can withdraw) and escrow (backing waitlist deposits). A different primary sale, such as a continuous clearing auction, can replace the fixed price by overriding `_salePrice` without touching surrender or the waitlist. `src/index.ts` is generated and exports the ABI, EIP-712 constants, purpose values and deployment addresses for the web app.

## Test

```sh
pnpm install
pnpm test
pnpm typecheck
```

## Run locally

```sh
pnpm node            # terminal 1
pnpm deploy:local    # terminal 2
pnpm seed:local
```

Without `VERIFIER_ADDRESS` or `VERIFIER_PRIVATE_KEY`, the local deploy uses Hardhat account 1 as the verifier and prints its well known private key so the web app can sign attestations. The seed script creates events 1 to 6 and skips any that already exist.

## Deploy to World Chain Sepolia

Copy `.env.example` to `.env`, set `DEPLOYER_PRIVATE_KEY` and either `VERIFIER_ADDRESS` or `VERIFIER_PRIVATE_KEY`, then run:

```sh
pnpm deploy:worldchain-sepolia
```

Each deploy writes `deployments/<chainId>.json` and regenerates `src/index.ts`. Run `pnpm export-abi` to regenerate it by hand after changing the contract.
