# Houseful

**Tickets for people, not bots.**

Houseful is a face-value ticketing app. Every ticket belongs to one verified human, sells at a fixed price, and can only change hands by reselling at face value: the holder gets a full refund, and the next person on a public waitlist gets the seat in the same transaction. The door works offline with a code that rotates every 20 seconds. After a scanner has synced, older codes stop working there.

Built for [ETHGlobal Mumbai 2026](https://ethglobal.com/events/mumbai).

## Why

Secondary markets and bots pull tickets away from people who would actually go. Hosts lose control of price. Fans who cannot make it either eat the loss or flip the seat at a markup.

Houseful writes the rules into a public contract instead:

1. **Face value forever.** The price is fixed when the show is listed. Nobody resells above it.
2. **One person, one ticket.** World ID keeps it to one ticket or waitlist place per human per show. The app never learns who you are.
3. **Resell at face value.** Until the surrender cutoff, return the ticket, get the full price back, and promote the waitlist head in one transaction. Transfers and approvals revert.
4. **Cancelled show, guaranteed refund.** Holders pull their money from the contract. Nobody, including the platform, can block it.
5. **Entry by live code.** A rotating QR signed by the phone. Codes change every 20 seconds; synced scanners reject older ones. The scanner works with no network after a pre-door sync.

## Identity

- **Fans:** World ID is the account. Action `houseful-login` sets a signed `hf_session` cookie whose account id is the nullifier. No email or password. Fans buy and hold tickets under that id. Checkout first tries `/api/attest` from the session so a fan does not scan again per show when the stored credential is enough; otherwise World runs at checkout.
- **Hosts:** separate wallet sign-in. The host signs a one-time challenge message; the session account id is the wallet. `/host` is host-only; `/tickets` and `/account` are fan-only.
- **Wallets:** fans link, choose, and delink wallets under the World account. A wallet that still holds a live ticket cannot be delinked.

## Demo flow

1. Open a city page, pick a show.
2. Sign in with World ID (staging simulator works locally), or verify at checkout if you skip login.
3. Buy at face value, or join the waitlist if it is sold out.
4. Open **Your tickets**: see the rotating door code.
5. Open `/door/[slug]` on a second device: scan, admit, reject a stale or repeat code.
6. Resell at face value: refund lands, waitlist advances.
7. Host console: sign in with the payout wallet, list a show, watch sales and waitlist, withdraw proceeds after `endsAt`.

## Monorepo

```
houseful/
├── apps/web                 Next.js app (catalog, fan flows, host console, door)
├── packages/contracts       Houseful registry + escrow (Hardhat)
├── packages/pass            Offline door credentials (@houseful/pass)
└── docs/
    ├── specs/v2.md          current product + chain target
    └── notes/               friction logs (Uniswap, etc.)
```

| Package | Role |
|---|---|
| `apps/web` | Catalog, checkout, tickets, waitlist, host console, door scanner |
| `@houseful/contracts` | On-chain events, tickets, waitlist, surrender, refunds, proceeds |
| `@houseful/pass` | ed25519 door credentials + rotating QR verifier (browser and Node) |

More detail: [`packages/contracts/README.md`](packages/contracts/README.md), [`packages/pass/README.md`](packages/pass/README.md).

## How the pieces fit

```
Fan / host browser
        │
        ▼
   apps/web (Next.js)
        │  World ID login (or checkout proof) ──► backend verifies ──► EIP-712 attestation
        │  wallet signs buy / join / claim / surrender
        ▼
   Houseful.sol  (+ SaleEscrow per event)
        │
        ├── ticket bound to nullifier (one human per event)
        ├── face-value sale only
        └── surrender → refund + waitlist claim in one tx

Door phone                          Scanner (offline after sync)
   pass credential + device key ──► rotating QR ──► Verifier.check()
```

World ID proofs are verified by the Houseful backend. After a successful verify (login or checkout), the backend signs an EIP-712 `Attestation(eventId, nullifier, wallet, purpose, deadline)` with the platform verifier key. The contract checks that signature; it does not talk to World itself.

## Stack

- **App:** Next.js 16, React 19, Tailwind 4, Drizzle + libSQL, wagmi / viem, Motion
- **Identity:** World ID (IDKit) + signed session + server attestation
- **Contracts:** Solidity, Hardhat, OpenZeppelin
- **Door:** `@houseful/pass` (ed25519, 20s windows)
- **Package manager:** pnpm 11, Node ≥ 24

**Chain today:** Unichain Sepolia (`1301`) is the live demo network. Local Hardhat (`31337`) remains for tests. World Chain Sepolia (`4801`) deploy is kept for reference.

### Deployments

| Chain | Id | Houseful |
|---|---|---|
| Hardhat local | 31337 | see `packages/contracts/deployments/31337.json` |
| Unichain Sepolia | 1301 | `0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e` |
| World Chain Sepolia | 4801 | `0x75a6Cb564AF5A94259238Ef62369E1BC30fDFD5a` |

## Quick start

### 1. Install

```sh
pnpm install
```

### 2. Contracts (local)

```sh
# terminal 1
pnpm --filter @houseful/contracts node

# terminal 2
pnpm --filter @houseful/contracts deploy:local
pnpm --filter @houseful/contracts seed:local
```

Without `VERIFIER_ADDRESS` / `VERIFIER_PRIVATE_KEY`, local deploy uses Hardhat account 1 as the verifier and prints its key for the web app.

### 3. Web app

```sh
cp apps/web/.env.example apps/web/.env.local
# set NEXT_PUBLIC_HOUSEFUL_ADDRESS from the deploy output
# DOOR_ISSUER_SECRET_KEY: 32-byte hex ed25519 secret

pnpm --filter web db:push
pnpm --filter web db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful scripts from the repo root:

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js app |
| `pnpm test` | All package tests |
| `pnpm typecheck` | Typecheck everything |
| `pnpm build` | Build all packages |

World ID: use staging + the [developer simulator](https://developer.world.org) while developing. Register action `houseful-login` on the app. Set `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, and `WORLD_ENVIRONMENT=staging` in `.env.local`.

## Product rules (on chain)

- No transfers: only `surrender` moves a ticket (resell at face value).
- One nullifier per event (buy or waitlist).
- Spent attestations cannot be replayed.
- Proceeds and escrow are separate; hosts withdraw proceeds only after `endsAt`.
- Refunds cannot be blocked by the host or the platform.

## AI use

This project was built with AI coding assistants (Cursor agents) for scaffolding, contract and app iteration, tests, and docs. Specs, prompts, and planning notes live under `docs/`. Humans directed product choices, reviewed diffs, and ran deployments and demos. AI assisted; it did not ship the project unsupervised.

## License

MIT. See [LICENSE](LICENSE).
