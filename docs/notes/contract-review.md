# v2 contract review

Reviewed 7 November 2026. Production contracts are unchanged.

## Findings

### HF-01: High, two live tickets can own the same seat — FIXED

Scenario: a seated show has capacity four. Buy ticket 0 for seat 1, surrender before the show sells out, buy a newly minted ticket 1 for seat 1, then claim returned ticket 0. Both wallets now own seat 1.

Fix applied: surrender into the returned pool no longer clears `_seatTicketIdPlusOne`. The seat stays reserved to the original ticket until `claimReturned` or a cancel refund. A fresh `buy` of that seat reverts `SeatTaken`.

Evidence: `HF-01` in `test/invariants/Houseful.invariants.test.ts` asserts `SeatTaken` on the duplicate buy and a clean claim on the original ticket.

### HF-02: High under a hostile router, unfunded ETH purchases and retained ETH — FIXED

Scenario: a router whose multicall succeeds, sends no USDT and retains the buyer's ETH. Houseful previously minted and credited proceeds anyway.

Fix applied: `_swapEthForFaceValue` measures USDT balance before and after the multicall and reverts `WrongPayment` unless the balance rises by exactly face value. The whole call rolls back, so ETH is not retained.

Evidence: `HF-02` asserts mint and proceeds stay zero and the router holds no ETH after the reverted dishonest swap. Nested reentry still hits the reentrancy guard.

### HF-03: Medium under a hostile settlement token, successful calls do not prove payment — FIXED (incoming)

Scenario: an ERC20 returns success from transferFrom without moving tokens. A USDT purchase previously minted and credited proceeds.

Fix applied: `_pullUsdtExact` requires the contract balance to rise by exactly the face value on every incoming transfer. A token that refuses outgoing transfers can still block refunds; that remains a trusted-token deployment assumption.

Evidence: `HF-03` asserts `WrongPayment` with zero mint and zero proceeds. Hostile payout retry behaviour is unchanged.

## Coverage and accounting

The seeded state machine runs four repeatable seeds: 1, 42, 20261107 and 3735928559. Each runs 90 mixed transitions across a seated and a general admission show after initial purchases. It exercises both payment methods, returns, claims, waitlist entry and exit, duplicate people, recovery, cancellation refunds and host withdrawal after the end. Every transition reconciles balances against both the ledger and independently counted live tickets and active waiters. It checks unique owners, people and seats, capacity, reverse indexes, seat flags and immutable ticket seats.

Unclaimed cancellation refunds are already inside proceeds and escrow until paid. For a disjoint equation, reclassify those cancelled-event balances as unclaimed refunds: balance = non-cancelled proceeds + non-cancelled escrow + unclaimed cancellation refunds. Adding them to the raw ledger would count the same money twice. Direct token donations are excluded from this equality; in their presence the correct requirement is balance >= liabilities.

A separate seeded queue test skips more than 64 abandoned slots, proves surrender rolls back on backlog, advances exactly 64 slots and preserves the promoted seat. A recovery replay test first moves ownership away again so that the spent-signature check is actually reachable.

The random lifecycle suite starts with fully minted events to explore normal turnover. The pre-capacity seat violation and hostile dependency failures are isolated executable reproductions with assertions of the observed unsafe behavior. Green tests therefore do not certify these findings as fixed. The contract owner must turn these reproductions into rejection assertions when applying fixes.

## Limits

This is a targeted review with deterministic randomized testing, not a formal proof. Exact-output payments with the supplied honest mock reconcile correctly across the tested traces. Reentry into protected money operations is blocked, but a dishonest router or token can violate solvency as shown above. No claim is made that arbitrary dependencies cannot trap funds. Live routing, deployment identity and network behavior require their separate checks.

## Verification note

The supplemental contract type check still fails in the existing `scripts/seed-local.ts:41`: the v2 event parameters omit `seated`. The production contract and that deployment script were left unchanged. The contract test command passes independently. The invariant suite additionally seeds nonzero door keys before recovery and surrender and checks FIFO promotion against the first active queue entry, including two competing waiters after a bounded scan.
