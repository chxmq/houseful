Roots: W=~/ethglobal-mumbai/houseful/apps/web/src; A=~/ethglobal-mumbai/houseful/apps/web; C=~/ethglobal-mumbai/houseful/packages/contracts; P=~/ethglobal-mumbai/houseful/packages/pass; IK=~/ethglobal-mumbai/houseful/node_modules/.pnpm/@worldcoin+idkit@4.6.0_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@worldcoin. Bare names repeat earlier paths; route.ts=verify route. HEAD 7f5319a plus uncommitted verify-human.tsx edit; app and tests not run.

**1. Today**
Browse a seeded guide; only Mumbai shows sell (A/scripts/seed.ts:1051). Buyers verify with World ID and pay fixed face value in test ETH from a browser-generated wallet (W/lib/device-wallet.ts:11-17). Tickets cannot transfer (C/contracts/Houseful.sol:381-403); hand-back refunds face value, moving the seat to the oldest waiter or returned pool (:267-299). Hosts list, cancel, withdraw. A door page checks rotating QR codes on-device.

Would overstate:
- On-chain or trustless World ID: server verifies; contract trusts one signer (Houseful.sol:13-14,541-543), which can attest without World ID (A/scripts/seed-chain.ts:47-54).
- Enforced Proof of Human: client preset only (W/components/verify-human.tsx:111); server never compares credential (W/app/api/world/verify/route.ts:61-69).
- "Bound to a verified person, not to a wallet" (device-wallet.ts:20): owner is the wallet (Houseful.sol:272,326).
- Offline: no service worker or manifest (git grep empty); holder wallet needs RPC (W/components/ticket-wallet.tsx:43); only open tabs survive [inference].
- Screenshots blocked (W/app/tickets/page.tsx:32-33): another scanner accepts replays for 20-40s; unsynced scanners admit surrendered codes (P/README.md:91-93).
- Testnet live: only C/deployments/31337.json exists.
- Flagship's 6,500 seats: chain capacity 3 (seed-chain.ts:20,80).
- Real payments: INR fixed at 300,000/ETH (W/lib/pricing.ts:2).

**2. Components**
- Contracts: Houseful.sol (events, tickets, waitlist, refunds); SaleEscrow.sol (proceeds, escrow); generated C/src/index.ts (ABI, EIP-712, addresses; C/scripts/lib/exportAbi.ts:37-96), imported by web.
- Pass: ed25519 credential, payload, Verifier; no network (P/src/verifier.ts:53-71).
- Server: W/app/api/{world,pass,door,faucet}, W/app/host/actions.ts, W/server/*; reads chain via serverChain (W/server/chain.ts:9-11).
- Client: browser signs and sends to RPC directly, topping up via faucet (W/lib/ticket-actions.ts:51-81; device-wallet.ts:29-45); keys in localStorage. wagmi and react-query are declared (A/package.json:20,31) but unused (git grep empty).
- DB: Drizzle/libSQL catalog plus humans, verifications, attendance (W/server/db/schema.ts:49-167); events.chain_event_id links to contract (:92). Verifications are an audit log; replay result ignored (route.ts:61). recordAdmission has no app caller (A/scripts/check-catalog.ts:77 only).

**3. Flows**
- List: ShowForm.submit (W/components/host/show-form.tsx:85) → createShow (W/lib/host-actions.ts:9) → listShow matches EventCreated log, inserts (W/app/host/actions.ts:20-98).
- Buy: TicketPanel (W/components/ticket-panel.tsx:52), VerifyHuman, buyTicket: `buy`, then `setDoorKey` (ticket-actions.ts:88-98).
- Join: mode join when no seats (ticket-panel.tsx:78) → joinWaitlist (ticket-actions.ts:110) → escrow, hash head (Houseful.sol:228-248).
- Claim: returnedSeat, claimReturnedSeat (ticket-actions.ts:100,134) → claimReturned (Houseful.sol:303).
- Hand back: HeldTicket.handBack (ticket-wallet.tsx:179) → surrender (Houseful.sol:267).
- Cancel/refund: HostedRow (W/components/host/host-console.tsx:157) → cancelEvent; HeldTicket.refund or WaitingSpot.leave (ticket-wallet.tsx:196,323) → claimRefund (Houseful.sol:343). /tickets lists only upcoming Mumbai shows (W/app/tickets/page.tsx:11; W/server/catalog.ts:170), though refunds outlive endsAt on chain (C/test/Houseful.test.ts:632). Catalog status never updates (git grep).
- Withdraw: after endsAt (host-console.tsx:141; Houseful.sol:369-378). Seeded shows belong to the faucet key (seed-chain.ts:24), so a judge's console omits them (host-actions.ts:54).
- New phone: `setDoorKey` from the same wallet bumps generation (Houseful.sol:324-330); button at ticket-wallet.tsx:265. A new browser gets a new wallet, sees nothing, and re-verifying returns already-holds (route.ts:52-57). No wallet export exists, so the button needs a copied key or cleared door key [inference].
- Door sync: unauthenticated GET /api/door/[id]/sync returns issuer key and every ticket generation (W/app/api/door/[chainEventId]/sync/route.ts:37-87); stored locally, re-synced every 2 minutes (W/components/door/scanner.tsx:35,278-306).
- Scan: DoorCode fetches /api/pass, signs every 20s (W/components/door-code.tsx:31-80); checkCode runs Verifier, persisted per device (scanner.tsx:332-367). No device-to-device sharing.
- Waitlist check: readLedger recomputes keccak chain, compares contract head (W/components/waitlist-ledger.tsx:31-81). One RPC supplies both; proves order, not humanity [inference].

**4. World ID**
- IDKit ^4.6.0, installed 4.6.0 (A/package.json:21).
- Credential: Proof of Human if catalog sold_out, or capacity ≥5000 and price ≥₹1500; else Selfie Check: "The minimum credential that makes cheating cost more than it earns" (W/lib/assurance.ts:10-20). Seeded: chain ids 1,7,9,10,18 (local DB).
- Request: POST /api/world/request {eventId} → signRequest, ttl 300 (W/server/world.ts:14-30).
- Verify: POST /api/world/verify checks protocol, action, environment, wallet signal hash, then POSTs {WORLD_VERIFY_URL}/{rp_id}, default https://developer.world.org/api/v4/verify, 12s timeout (world.ts:76-105; W/server/env.ts:20); then nullifierUsed, recordVerification, attestation (route.ts:45-76).
- Nullifier: RP-scoped (IK/idkit-core/dist/index.d.ts:136), action `ticket:<slug>` (assurance.ts:34-36); on chain per event (Houseful.sol:93), freed by surrender, leaveWaitlist (:276,:259).
- Attestation: domain Houseful/1/chainId/contract; `Attestation(uint256 eventId,uint256 nullifier,address wallet,uint8 purpose,uint256 deadline)`; buy 1, join 2, claim 3; 15-minute deadline (W/server/attest.ts:7,21-32); checked in `_admit` (Houseful.sol:530-545).
- IDKit text (verify-human.tsx:44-64,128-135): "Your World ID does not have the credential this show asks for yet." / "Verification was cancelled. Nothing was charged." / "This person has already used their one ticket for this show." / "World App did not respond in time. Nothing was charged." / "World could not verify this request ({code})." Follow-ups: ticket-panel.tsx:251-269.
- Server text: "Missing event." (W/app/api/world/request/route.ts:9); "The verification request was incomplete." / "This show is not on sale through Houseful." / "This person already holds a ticket or a waitlist place for this show. One each, so everyone gets a fair go." (route.ts:25,31,56); "Only World ID 4 uniqueness proofs are accepted." / "This proof was made for a different show." / "Proof came from {x}, this deployment expects {y}." / "This proof is bound to a different wallet." / "Could not reach World to check the proof." / World's detail or code, else "World rejected the proof (HTTP {n})." (world.ts:77-111). Fallbacks: "World ID is not reachable right now." / "The proof did not check out." (verify-human.tsx:86,104). Chain reverts: ticket-actions.ts:9-31.
- Likely bug [inference, not run]: a thrown handleVerify makes IDKit fire onError failed_by_host_app (IK/idkit/dist/index.js:2179,2194), replacing server text with the {code} message.
- Mismatch: proofOfHuman forces allowLegacy (IK/idkit-core/dist/index.js:2730-2733) despite allow_legacy_proofs={false} (verify-human.tsx:142); server rejects 3.0 proofs, so legacy Orb users may fail [inference].
- Keys missing: example values `app_`, `rp_` pass; blank signing key returns 500 (request/route.ts:14), panel shows "Server environment is incomplete: WORLD_RP_SIGNING_KEY. See apps/web/.env.example." plus Try again (env.ts:16-18,31; ticket-panel.tsx:238-240). No bypass exists. Door passes keep working (env.ts:44).

**5. Run**
Node 24 (.nvmrc), pnpm 11.28.9 (root package.json:4), solc 0.8.28 (C/hardhat.config.ts:9).
1. `pnpm install`
2. `cp apps/web/.env.example apps/web/.env.local`; set DOOR_ISSUER_SECRET_KEY (`openssl rand -hex 32` [inference]) and World keys. Without door key, passes, sync and listing fail (W/server/chain.ts:10).
3. `pnpm --filter @houseful/contracts run node`
4. `pnpm --filter @houseful/contracts deploy:local`
5. `pnpm --filter web db:reset`
6. `pnpm --filter web exec tsx scripts/seed-chain.ts` (no package script; invocation [inference])
7. `pnpm dev`

Testnet: fill C/.env, `pnpm --filter @houseful/contracts deploy:worldchain-sepolia`, set web chain vars to 4801 [inference].

Traps: skip contracts `seed:local` (C/README.md:24); its unrelated events 1-6 make seed-chain skip them (seed-chain.ts:73-77). C/scripts/deploy.ts:14 says VERIFIER_PRIVATE_KEY; web reads ATTESTER_PRIVATE_KEY (env.ts:21). Browser RPC 127.0.0.1 won't reach a second phone [inference]; camera needs HTTPS (scanner.tsx:684).

A/.env.example: DATABASE_URL, DATABASE_AUTH_TOKEN (catalog); NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_HOUSEFUL_ADDRESS (browser chain; blank address uses deployments); CHAIN_ID, RPC_URL (server chain); WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY, WORLD_ENVIRONMENT (portal); ATTESTER_PRIVATE_KEY (signs attestations, matches verifier); FAUCET_PRIVATE_KEY, FAUCET_DRIP_ETH (test ETH); DOOR_ISSUER_SECRET_KEY (signs credentials). Unlisted: WORLD_VERIFY_URL.

C/.env.example: VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY (verifier); DEPLOYER_PRIVATE_KEY, WORLDCHAIN_SEPOLIA_RPC_URL (deploy); LOCAL_RPC_URL, REPORT_GAS (optional).

Chains: Hardhat 31337, World Chain Sepolia 4801 (C/hardhat.config.ts:15-22); unknown ids fall back to Hardhat (W/lib/chain.ts:13-19).

**6. Tests**
`pnpm test` runs both suites (root package.json:12).
- `pnpm --filter @houseful/contracts test`: Houseful.test.ts, 55 `it` blocks: deployment and admin, createEvent, buy, waitlist, surrender, no transfers, door keys, cancellation and refunds, withdrawProceeds, reentrancy.
- `pnpm --filter @houseful/pass test`: credential.test.ts (keys, encodeCredential, issueCredential); payload.test.ts (buildDoorPayload, rotation clock, base64url codec); verifier.test.ts (happy path, malformed, wrong event, forged credential, expired, surrender revocation, stolen credential, screenshot replay, clock skew, already admitted, state merge, buildRevocationMap), with two "KNOWN LIMIT" cases (:177,:225).
- `pnpm --filter web db:check`: script; asserts catalog and humans helpers, expecting exactly 17 upcoming Mumbai shows (A/scripts/check-catalog.ts:22); host-listed shows may break it [inference].
- No web, API, World ID or end-to-end tests; no CI. `pnpm typecheck`, `pnpm lint` exist.

**7. Real, seeded, pending**
- Real: contract rules; ed25519 checks; hash chain; listing cross-check; on-device scanner; World verify API call (world.ts:97).
- Seeded/simulated: 28 catalog events with static sold and status (A/scripts/seed.ts:1041-1078); on-chain holders and waiters use random wallets and nullifiers, no World ID (seed-chain.ts:42-65), yet the ledger page says "verified human" (W/app/e/[slug]/waitlist/page.tsx:43-45); burner wallets, faucet; how-it-works demos use stand-in data (W/components/how/door-demo.tsx:11); staging simulator (A/.env.example:12).
- Pending: no 4801 deployment; git-ignored apps/.env.worldchain exists, unopened, unreferenced. No real proof confirmed: local DB had zero humans and verifications (may have been reset). Whether World accepts re-verification after hand-back is unconfirmed; contract allows it. Faucet has only an in-memory per-address throttle (W/app/api/faucet/route.ts:9,19-23). No hosting config, root README or LICENSE.