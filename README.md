# Houseful

One person, one ticket per show, at a fixed price.

Houseful is a testnet ticketing prototype built for ETHGlobal Mumbai 2026. Fans pick seats where offered, pay in test USDT or ETH, and return unwanted tickets before a cutoff. The “Resell at face value” action returns the ticket through the contract, refunds its face value in USDT and gives the same seat to the oldest active waiter in the same transaction, or puts it into the returned-ticket pool. Ordinary transfers and approvals revert.

The human check is a server trust boundary: the server verifies a World ID proof and signs an attestation that the contract accepts. The contract does not verify World ID itself. Selling a wallet key or lending an identity remains possible. See [the threat model](docs/threat-model.md).

## What is implemented

- Catalog, city and category pages, search and URL filters, event pages, checkout, a seat map, tickets, waitlist ledger, host listing and host console.
- USDT settlement with six decimals. ETH payments use an exact-output Uniswap v3 swap. Refunds and host proceeds are paid in USDT.
- Single-use, wallet-bound EIP-712 attestations, seat uniqueness, a public waitlist, cancellation refunds, and host withdrawal after the event ends.
- A browser wallet with key export and import. The wallet and door signing key are stored in browser localStorage.
- World ID fan sign-in at `/login`, browser-wallet host sign-in at `/host/login`, cookie sessions and an `/account` wallet-address list. `/tickets` and `/account` require a fan session; `/host` and `/host/new` require a host session.
- Rotating door codes and a scanner that checks them locally after a sync. A synced scanner rejects older ownership generations. Screenshots can still work on a fresh scanner for about 20 to 40 seconds.

[The v2 specification](docs/specs/v2.md) includes work beyond the implementation. Account integration remains partial: adding a wallet address does not prove ownership and selecting it does not change the checkout signer. Delinking checks all catalog events for a held ticket, including ended shows, but ignores waitlist places and uncataloged events. The listing server action still lacks its own host-session gate. Host login proves an external browser wallet while host transactions still default to the device wallet. These seams are PENDING(account-integration).

Checkout first requests an attestation from the fan session and opens World verification when there is no suitable session credential. The session endpoint supports recovery signatures, but there is no complete recovery UI. Identity continuity between the login action and per-event fallback is PENDING(identity-continuity), so a finished person-based recovery flow and uniform one-person enforcement across those paths are not established. Signing in on another phone does not restore the device wallet key. Exporting and importing that existing key is the available backup path.

The seed combines 21 source-backed research drafts with 28 sample shows, for 49 listings across 20 cities. Four cities have at least three bookable test listings. Every seeded listing has a chain event id, but assigning an id does not establish that the chain has been seeded. Real-event pages link to the official seller and say clearly that a Houseful booking gives no real admission. The research drafts have not been independently verified, and their dollar prices are test USDT amounts, not live seller quotes.

Unknown public facts are shown as “Not published”, including unconfirmed start times, doors, end time, age, duration and venue capacity. Internal settings such as a 100-place test allocation or a fallback booking window are separate from official event facts. Dates display in each city's timezone; search calendar filters use that timezone, while the older city-page time-window helper still uses IST. Catalog counts and seeded attendance are not proof of real ticket sales. PENDING(returned-seat-checkout): a returned seated ticket is reserved on chain but disabled in the current seat picker; see [the checkout handoff](docs/notes/contract-review.md#integration-handoff). See [the import policy](docs/notes/catalog-import.md), [catalog builder](apps/web/scripts/worldwide-catalog.ts) and [published-fact rules](apps/web/src/lib/catalog-facts.ts).

## Evidence and remaining demo work

| Item | Recorded evidence and limit |
| --- | --- |
| Chain | Unichain Sepolia, chain id `1301`; [deployment record](packages/contracts/deployments/1301.json) |
| Houseful | [`0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e`](https://sepolia.uniscan.xyz/address/0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e) |
| Live Uniswap route | [Recorded ETH purchase transaction](https://sepolia.uniscan.xyz/tx/0x8ca75ec0da716d5469bf4706232a47ee5eb19a0e3702055de304e0bfe785780f), also documented in [FEEDBACK.md](FEEDBACK.md) |
| World ID | The 7 November staging run recorded `/api/world/verify` returning 200 after simulator approval at 03:55:52 IST. This is staging proof verification, not a production World App run. |
| Browser purchase after World verification | PENDING(live-purchase). That run failed at the USDT approval because the public RPC rejected `eth_sendTransaction`; no ticket was minted. The code now passes the wallet's local account through simulation so writes can be signed locally. A fresh successful live run is still needed. |
| Alternative World path | In that run, declining in the simulator left the modal connecting; closing the modal showed “Verification was cancelled. Nothing was charged.” |
| Second wallet, same simulated person | The second attempt received World HTTP 502, shown as “World rejected the proof (HTTP 502).” No faucet or purchase followed. This did not exercise the intended already-holds refusal because no ticket had been minted. |
| Hosted demo and phone on another network | PENDING(hosted-check). [Hosting setup notes](docs/notes/hosting.md) describe the Vercel/Turso path; deployment credentials and a successful external-network check are not established here. |
| Local verification, 7 November | Web typecheck passed; 237 web tests, 83 pass-library tests, 55 contract tests and 20 discovery browser checks passed. Discovery ran on desktop and 375px phone layouts, including a production build and all 49 local chain listings. Changed-file lint has no errors and two existing catalog warnings. |
| Supplemental contract typecheck | Fails in the older `packages/contracts/scripts/seed-local.ts:41`, which omits `seated`. The contract tests pass independently. |

The [World integration debrief](docs/notes/world-debrief.md) records time to first server verification, the failed payment, the simulator decline behavior and the second-wallet 502. It separates the observed staging proof success from the still PENDING live purchase and duplicate-ticket refusal. The highest-impact requested improvement is a visible copyable connection link with a completed, cancelled or failed status returned to the app.

## Uniswap integration

The exact swap implementation is [`_swapEthForFaceValue` in Houseful.sol](packages/contracts/contracts/Houseful.sol). It calls SwapRouter02 `multicall` with `exactOutputSingle` followed by `refundETH`, checks the exact USDT balance increase, and returns remaining ETH to the buyer. The [checkout action library](apps/web/src/lib/ticket-actions.ts) quotes through QuoterV2 and adds 2% headroom. Local tests use `MockSwapRouter` at a fixed rate; that is separate from the live transaction above.

The [pool script](packages/contracts/scripts/seed-pool.ts), [live purchase script](packages/contracts/scripts/prove-uniswap.ts), [integration notes](docs/notes/uniswap-friction.md) and [developer feedback](FEEDBACK.md) describe the route and the recorded transactions. Test USDT is a deployed test token, not official Tether or real dollars.

## Repository

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js 16, React 19, Tailwind 4, Drizzle/libSQL, IDKit and viem |
| `packages/contracts` | Solidity registry, USDT ledger, deployment records, Hardhat tests and invariant tests |
| `packages/pass` | ed25519 credentials, rotating QR payloads and local verification |
| `apps/web/e2e` | Playwright stack, network-edge World stubs, browser-wallet harness and flow specs |
| `docs` | [Architecture](docs/architecture.md), [threat model](docs/threat-model.md), specs and integration notes |

## Run locally

Use Node 24 or newer and pnpm `11.28.9` as declared in the root package manifest.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Fill the World app and relying-party settings, the matching attester key and a fresh 32-byte hex door issuer secret in the local environment file. Set both `NEXT_PUBLIC_RPC_URL` and `RPC_URL` to `http://127.0.0.1:8550`, and both chain id settings to `31337`. Keep secrets out of source control. The sample Hardhat keys are public development keys and must only be used on a local throwaway chain. The deployment's `verifier` must match the account behind `ATTESTER_PRIVATE_KEY`.

Start the local chain in one terminal:

```sh
pnpm --filter @houseful/contracts exec hardhat node --port 8550
```

In another terminal, deploy, initialise the database and seed the catalog's chain events:

```sh
LOCAL_RPC_URL=http://127.0.0.1:8550 pnpm --filter @houseful/contracts deploy:local
pnpm --filter web db:push
pnpm --filter web db:seed
pnpm --filter web exec tsx scripts/seed-chain.ts
pnpm --filter web dev --port 3300
```

Open [localhost:3300](http://localhost:3300). Use the deployment record or set `NEXT_PUBLIC_HOUSEFUL_ADDRESS` to the newly deployed address. Keep browser `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` aligned with server `CHAIN_ID` / `RPC_URL`. The generated deployment exports provide the settlement token and router settings; overrides are read in [contract.ts](apps/web/src/lib/contract.ts).

Use the web `seed-chain.ts` path above rather than the older contracts `seed:local` script: the latter still contains the previous ETH-era event shape. On a fresh local chain, the web seed signs synthetic identities directly with the attester key. Those holders and waiters have not passed World ID. It also uses reduced chain allocations, so catalog venue capacity and chain ticket capacity can differ. `/try` links to the ordinary event checkout and still requires World verification; it is not an identity bypass.

World verification needs valid portal configuration and network access. `WORLD_ENVIRONMENT=staging` enables the simulator workflow. For a phone, localhost RPC addresses refer to the phone itself; supply a reachable RPC and app URL. Camera scanning needs a secure browser context.

## Checks and demo path

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
E2E_WEB_PORT=3300 E2E_CHAIN_PORT=8550 E2E_WORLD_PORT=3399 pnpm --filter web e2e e2e/discovery
```

The evidence table above records the local checks actually run. The commands also include broader checks that were not all run; they are not a claim of a clean full-repository typecheck, lint or live-service run. The [end-to-end guide](apps/web/e2e/README.md) explains the isolated local chain, database, server World stub and browser bridge stub. These tests do not establish that the live World service or a public RPC purchase works. Several flow specs contain fixture-gated skips. `recover.spec.ts` is gated on `E2E_RECOVER_READY` and expects an account recovery flow that does not yet exist; it is not evidence of recovery support.

For a demo: open a show with a chain event id, choose a seat if asked, verify, and buy. Sign in as a fan to open `/tickets`, then sync `/door/[slug]` on a second screen before scanning. Choose “Resell at face value” before the cutoff and check the USDT refund and waitlist promotion. Both `/host` and `/host/new` require host wallet sign-in. Cancellation and withdrawal permissions remain enforced by the transaction wallet on chain; the host session and device transaction signer still need integration.

## AI use disclosure

This table records the team's stated contributions. Founder details still need final confirmation before submission.

| Contributor or tool | Contribution |
| --- | --- |
| Founder | Proposed World ID ticketing; set platform scope, design and commit rules; chose dollar prices, USDT settlement, Uniswap ETH payments and face-value hand-back; directed and tested work; handled accounts and keys. PENDING(founder-confirmation): correct and complete the personal contribution statement. |
| Cursor agents | Wrote most contract and web app code through scaffolding and implementation iterations. |
| Claude Code | Hackathon research, planning, unit tests, Playwright harness, documentation drafts, independent test and review runs, and the staging World simulator run. |
| Codex | Search and filters, randomized contract invariant tests and review; subsequent documentation and catalog work. |

Planning inputs are retained in [the v2 spec](docs/specs/v2.md) and [notes](docs/notes/). AI assistance does not establish independent review, a security audit or deployment readiness.

## License

[MIT](LICENSE).
