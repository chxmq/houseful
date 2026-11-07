# Houseful threat model

Source reviewed through `229aeb2` on 7 November 2026.

This is a source-based review of the prototype, not a security audit. Statements about protection describe checks in the current implementation. PENDING items are unproven or incomplete. No test count or live-service outcome is inferred from the presence of code. See the [architecture](architecture.md) and [README evidence table](../README.md#evidence-and-remaining-demo-work).

## Assets and trusted roles

The assets are test USDT deposits, ticket ownership and seats, waitlist order, wallet and holder keys, proof metadata, and admission state. The configured settlement token, router and RPC are trusted dependencies. This project uses test tokens and has no established production-money deployment.

| Role or boundary | Authority and consequence of compromise |
| --- | --- |
| Registry owner | Can replace the admission verifier. It cannot directly withdraw a host's proceeds or a waiter's escrow through an owner sweep function. |
| Attestation signer | Can certify arbitrary nullifiers and wallets, including recovery to another wallet. A compromise defeats the human gate and can move tickets through recovery. |
| Door issuer | Can sign arbitrary credentials trusted by a scanner using its public key. Local scanning does not prove the credential matches current chain ownership. |
| Event host | Sets event terms, cancels before event end and withdraws proceeds after end. The contract does not prove that a show takes place. |
| Catalog and server | Choose event-to-chain mappings, assurance inputs, listing descriptions and the key/generation data served to doors. |
| Browser origin | Holds plaintext wallet and holder keys plus scanner state in localStorage. Script compromise or device access can expose or change them. |
| Scanner operator | Controls physical admission, clock and local reset. The application cannot force staff to honour a rejection. |

World proof verification is off chain. Trust in the configured attester is essential even with correct World verification code. Key separation, deployment review and monitoring are PENDING(production-hardening).

## Many wallets and false human claims

The contract binds an attestation to wallet, event, purpose, chain id, registry address and deadline. It checks one active nullifier per event, one ticket or waitlist place per wallet, and a spent-digest map. Surrender or leaving releases the active nullifier but does not unspend the signature. These checks address simple replay and multiple-wallet purchases using the same attested nullifier.

The server requires exactly one World ID 4.0 response, the expected action and environment, and the expected wallet signal hash. It requires a successful result from the verify API and compares its verified nullifier with the submitted value. It enforces the catalog-derived assurance requirement server-side. These are implemented defenses against accepting the wrong response item or a weaker credential, not a claim of independent live adversarial verification.

Residual limits:

- Staging identities are simulator identities. Seeded holders and waiters are signed directly without World proofs. Neither establishes real-person scarcity.
- Identity rental, collusion and coercion remain possible. The door checks a device signature rather than re-verifying the person.
- One ticket per attested nullifier depends on World's uniqueness behavior. Every show uses the same World action (`houseful-login`, see `worldActionFor`), so one person has one nullifier and the contract's per-event nullifier check refuses a second place. A Proof of Human show after a Selfie Check login asks World to verify that same action again, which has not been run live. PENDING(identity-mapping-review).
- Assurance depends on mutable catalog capacity, price and status, rather than a credential policy committed on chain. A malicious server or database can weaken it.
- A dishonest or compromised attester can bypass the gate. Verifier rotation stops old-key signatures, but does not automatically undo tickets already issued.

PENDING(world-live): a production credential run, a complete post-verification public-RPC purchase, and a recorded duplicate-person refusal remain separate from local stub tests. The staging run did verify a simulator proof on the server, then failed during approval. Local signing has since been corrected in the code, without a successful live rerun recorded here. A second-wallet attempt returned World HTTP 502, not the intended already-holds refusal. The server now maps World responses of 500 and above to `world-unreachable`, so an upstream failure such as that 502 no longer reads as a rejected proof. Other non-OK responses still read as a rejection. PENDING(World-error-classification): the mapping has not been run against a live World failure. See the README for the scope of these observations.

## Resale and lost keys

Transfers and approvals revert. The ordinary redistribution path is surrender before a cutoff, with a face-value USDT refund and promotion of the oldest active waiter, or a returned-ticket claim. The contract provides no price-setting transfer market.

This does not prevent off-platform sales of a device, a smart-account controller or a rented identity. The app no longer offers wallet-key export/import. Keys still exist in browser localStorage, so device access or XSS can still expose them. A holder signature proves access to a key, not that the original verified person is at the door.

Contract recovery requires a matching ticket nullifier and a recovery attestation for the receiving wallet. It bumps generation and clears the door key. The fan-session `/api/attest` endpoint can issue a recovery signature, while the event-proof endpoint still accepts only buy, join and claim. PENDING(recovery): there is no complete recovery UI or demonstrated identity continuity from every purchase path. Do not promise that a lost wallet can be recovered or that a sold key is worthless.

Losing the device wallet (cleared storage, new browser) can strand refunds, waitlist deposits or host proceeds until World-proven recovery ships. Browser storage is not encrypted by the application. PENDING(key-storage-hardening). PENDING(recovery-ui).

## Screenshots, relays and offline revocation

The pass library verifies the issuer signature, credential expiry, generation floor, accepted time window and holder signature. It records admission by ticket id rather than generation. A copied credential alone lacks the secret needed to sign a payload, and editing a signed payload invalidates it.

The following limits remain part of the design:

| Scenario | Result and limit |
| --- | --- |
| Old screenshot | Rejected once outside the accepted window. With 20-second windows and one-window tolerance, it can remain valid for about 20 to 40 seconds after capture. |
| Live screenshot on another scanner | Can be admitted within the window if that scanner has not recorded the ticket. There is no automatic sharing of admission state. |
| Same code on the same scanner | Rejected after that scanner records admission, unless its stored state is reset, lost or rolled back. |
| Surrender, recovery, refund or re-key after sync | An offline scanner may accept the old generation until it receives updated state. Rotation is not revocation. |
| Wrong scanner clock | Can accept or reject codes at the wrong time and change expiry behavior. The scanner trusts its local clock. |
| Cancelled event | The sync response does not carry cancellation status; an unrefunded credential can remain cryptographically valid until its expiry. |
| Issuer substitution | The scanner takes the issuer public key from sync rather than an independently pinned trust root. A compromised server can substitute it. |

The scanner requires an initial sync and persists verifier state in localStorage. Resync is attempted every two minutes while mounted and online; stale state is warned about rather than made unusable. Door staff can reset local state. The application has no shared admission backend enforcing a single use across all doors and no authenticated staff login. PENDING(door-operations): agree operational admission and resync rules before using this for a real venue.

PENDING(revocation-rollback-review): the app rebuilds a verifier from synced data and saved admission state. Monotonic generation handling across replacement sync records and storage loss needs explicit validation. A latest-sync label alone does not establish that a revoked generation can never become accepted again.

## Payments, escrow and host behavior

`SaleEscrow` keeps proceeds separate from waitlist deposits in per-event ledgers. Exact USDT balance-delta checks reject short token payments. Paying functions use a reentrancy guard and update accounting before outgoing transfers. ETH payment performs an exact-output swap and only credits the sale after the expected USDT increase. Token, router and liquidity behavior still matter, and this is not an audited general-purpose token integration.

Hosts cannot withdraw waiter escrow through `withdrawProceeds`, or withdraw proceeds before `endsAt`. A cancelled event exposes pull refunds for holders and waiters without host approval, including after event end. Refund availability still requires a working chain, gas and the controlling wallet. The app cannot provide a refund for a no-show unless the host cancels: there is no dispute process, attendance oracle or automatic cancellation.

The app's device transaction path first requests a test-faucet top-up when its estimated balance floor is unmet. An unavailable faucet can therefore block the UI before it attempts an otherwise affordable transaction. Direct contract access remains subject to normal chain gas requirements. PENDING(faucet-resilience).

The test faucet is public, uses an in-memory address throttle and has no complete authentication, budget or distributed rate-limit system. Many fresh addresses or a restart can defeat an address-only throttle. It must not be treated as a real-funds service. PENDING(faucet-hardening).

ETH quote headroom caps the input sent for the swap; it does not guarantee success when liquidity or prices move. The quote path falls back to the mock fixed-rate calculation when live quote settings are absent. PENDING(config-validation): prevent an unintended fallback on public networks. The swap sends the registry's remaining ETH balance to the caller, so unrelated ETH sent to the registry is not preserved as a separate deposit.

## Waitlist fairness and availability

The waitlist is public and each join commits the previous head, nullifier and wallet into a hash chain. The UI recomputes the commitment. This establishes consistency with the chain's join order, not fairness of server admission, honest identities, or absence of transaction-order advantage.

Surrender scans at most 64 slots. Too many inactive slots can cause `WaitlistBacklog`; anyone can advance the cursor in bounded calls before retrying. This avoids unbounded work in one transaction but requires liveness and gas from someone clearing the backlog. An actor can still create churn with fresh attestations. PENDING(waitlist-load-review).

The door sync endpoint is public and reads all minted tickets using parallel RPC calls. Large events or repeated requests can overload the RPC or app and leave scanners stale. PENDING(sync-limits): batching, pagination, caching policy and request limits have not been established here.

## Catalog integrity and access control

The host listing action checks an `EventCreated` receipt from the configured registry and compares terms and metadata commitments before inserting a catalog row. It does not establish that a host controls a venue or that an event is genuine. The action does not explicitly compare the `seated` event field, though the draft metadata commitment also covers seating. PENDING(listing-review): validate the complete listing policy and abuse controls.

Catalog data can diverge from chain data after insertion; metadata hashes are not continuously rechecked by page rendering. Seeded events use a zero metadata hash and reduced allocations. A seed script also skips existing event ids, so it must be used only against a controlled fresh deployment with known event ownership. PENDING(seed-deployment-check).

The worldwide additions are source-backed research drafts, not independently verified official inventory. Their test-listing notice and official-seller link distinguish test bookings from real admission. Published-fact flags suppress unknown doors, start or end times, age, duration and venue capacity. Internal test prices, seating and allocation are still choices made by this application. A source URL or high-confidence draft label cannot establish current availability, venue authority or a live price. PENDING(catalog-maintenance): recheck sources and preserve the distinction as listings change.

The `/host` console and `/host/new` require a host session; `/account` and `/tickets` require a fan session. The chain still requires the original host wallet for cancellation and withdrawal. The catalog listing action requires a host session and accepts a listing only when the contract recorded the same terms and metadata hash. A public listing form needs complete role checks, moderation, impersonation controls and receipt replay review before real deployment. PENDING(host-access-review).

The wallet page includes ended and upcoming shows from all catalog cities, which keeps those refund actions discoverable. It does not discover arbitrary uncataloged chain events. The current seat picker also blocks returned seated inventory by treating reserved seats as unavailable while requiring a selected seat for claims. See [HF-04](notes/contract-review.md#integration-handoff); this checkout handoff is PENDING. Missing UI discovery does not remove a contract refund entitlement, but can make it hard to exercise. PENDING(wallet-discovery).

## Account and wallet integration limits

Fan login binds a World proof to `houseful-login` and a random challenge in a ten-minute HttpOnly cookie. Host login instead verifies a browser-wallet signature over its cookie challenge. Successful login removes the challenge and starts a 30-day session with a random token; the database stores its SHA-256 hash. Cookies use SameSite Lax and Secure in production. A fan account is keyed by the verified nullifier, while a host account is keyed by a wallet address. PENDING(auth-verification): validate both new login paths and replay behavior after these changes.

The account wallet list still does not establish wallet possession. A signed-in fan can submit any valid address without a signature or wallet nonce. Selecting the active database record now affects checkout and holdings; a different address requires a matching injected wallet. Delinking now checks ownership of the record and blocks when `ticketOf` finds a holding on any catalog event. It does not distinguish ended or cancelled shows, ignores waitlist places and uncataloged events, and returns no block when the contract is unconfigured. Its UI wording about waiting until a show ends is therefore broader than the implementation supports. PENDING(wallet-authentication): possession proof, wallet switching coverage and precise removal policy.

The session attestation endpoint signs for a requested wallet without requiring a linked record or wallet-ownership proof. This does not itself spend the wallet's funds, since the eventual contract call still needs its key, but session compromise can authorize purchases or recovery to an attacker's chosen wallet. Host helpers request the wallet proved by the host session through `hostSigner`. PENDING(host-signer-verification): prove external-wallet prompts, switching and payout expectations end to end.

Checkout tries the session attestation first and opens World verification when there is no session, or when its credential is weaker than the show asks for. Login and checkout both use the single World action `houseful-login` (`worldActionFor` in `apps/web/src/lib/assurance.ts`), so one person yields one nullifier on both paths, and the contract's per-event nullifier check refuses a second place for that person at the same show. One-time action limits still make returning verification a risk without World session proofs. Different credential families can have independent uniqueness sets, so exposing method selection is not evidence of one global person identity across all credentials. Not shown: that World accepts a repeat proof on the same action when a Proof of Human show follows a Selfie Check login, and that recovery works end to end. PENDING(identity-continuity): prove returning sign-in, stronger-credential checks and recovery, and define a safe cross-credential account policy.

Signing in alone does not restore a wallet key. Holdings and ticket actions now resolve the selected linked address, but that still needs its matching key or injected-wallet connection. A session is therefore not a complete ticket backup. PENDING(account-ticket-integration).

Both login pages and their client components normalize the `next` destination through `safeNextPath`, which permits same-site relative paths and rejects external or protocol-relative URLs. PENDING(auth-hardening): review session creation, concurrent challenge use, login throttling and role checks across every route and action. HttpOnly cookies do not protect plaintext wallet keys from same-origin script compromise.

## Privacy and verification scope

Houseful stores nullifiers, credential category, action, wallet, event, purpose and environment in verification records. Account rows additionally associate nullifiers with roles and wallet-address records; session rows record hashed tokens and expiry. Nullifiers and wallets also appear in contract state or logs. This is pseudonymous metadata, not an assurance of anonymity. The first row per action/nullifier/purpose is retained rather than every later attempt; scanner admissions are primarily local state, not a complete central audit trail. PENDING(privacy-policy): retention and deletion policy, access controls and user-facing disclosure.

The repo contains contract tests, seeded randomized invariants, pass tests, web unit tests and Playwright flow specs. Local end-to-end tests replace the World bridge and verify API and use a Hardhat node. They cannot establish live World behavior, public RPC signing compatibility, independent scanner synchronization or physical identity at the door. The 7 November local run passed web typecheck, 284 web tests (re-run at 08:07 IST), 83 pass tests, 55 contract tests and 20 discovery browser checks on desktop and 375px phone layouts. The production build passed in that discovery run. This is targeted evidence; the full browser suite, new auth flow and live-service behavior remain unproven. The older contract seed-local script still fails supplemental typechecking because its event parameters omit `seated`.
