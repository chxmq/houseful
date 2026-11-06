# v2 contract review

Reviewed 7 November 2026. Production contracts are unchanged.

## Findings

### HF-01: High, two live tickets can own the same seat

Scenario: a seated show has capacity four. Buy ticket 0 for seat 1, surrender before the show sells out, buy a newly minted ticket 1 for seat 1, then claim returned ticket 0. Both wallets now own seat 1. The seat index points to only the last assignment, so later surrender or cancellation refunds can also clear another holder's seat flag.

File: `packages/contracts/contracts/Houseful.sol`, `surrender` at line 386, `buy` and `buyWithEth`, `claimReturned` at line 413 and `claimReturnedWithEth`.

Fix: reserve each minted ticket's seat even while returned, distinguish a reserved seat from a live owner in the seat view, and require returned seats to be claimed through their original ticket. Alternatively route a purchase of a returned seat to that original ticket. Checking only at claim time prevents the duplicate but leaves the original ticket unusable while a replacement holds that seat.

Evidence: `HF-01` in `test/invariants/Houseful.invariants.test.ts` reproduces both live owners. This is an observed invariant failure, not a passing safety guarantee.

### HF-02: High under a hostile router, unfunded ETH purchases and retained ETH

Scenario: configure a router whose multicall succeeds, sends no USDT and retains the buyer's ETH. Houseful mints a ticket and credits proceeds anyway. The buyer cannot surrender when the registry has no USDT. With pooled funds already present, the unfunded ticket can instead consume another event's USDT. The same unchecked credit occurs for waitlist joins and returned claims.

Files: `packages/contracts/contracts/Houseful.sol`, `_swapEthForFaceValue`; `packages/contracts/contracts/SaleEscrow.sol`, `_collectSaleFromBalance` at line 37 and `_collectEscrowFromBalance` at line 48.

Fix: measure USDT balance before and after each swap, require the exact face value increase before crediting either ledger, and validate the configured router at deployment. Balance checks prevent missing output from committing. They cannot compel arbitrary external code to quote honestly, so the immutable router must still be trusted. Refund only the ETH attributable to this call.

Evidence: `HF-02` proves a reverting swap rolls back with no ETH retained, a successful dishonest swap creates an unfunded liability and retains ETH, and nested refund entry fails with the reentrancy guard's exact error selector.

### HF-03: Medium under a hostile settlement token, successful calls do not prove payment

Scenario: an ERC20 returns success from transferFrom without moving tokens. A USDT purchase still mints and credits proceeds. A token that refuses outgoing transfers can block every refund indefinitely. The latter is an unavoidable dependency trust limit with an immutable settlement token.

File: `packages/contracts/contracts/SaleEscrow.sol`, `_collectSale` at line 31, `_collectEscrow` at line 42, `_sendUsdt` at line 76.

Fix: require exact balance increases on incoming transfers and deploy only with the intended, verified six-decimal token. A refund-credit fallback may isolate payout failure from ticket handover, but it cannot make an uncooperative token transfer. Describe the trusted token assumption explicitly.

Evidence: `HF-03` reproduces the missing payment. The hostile payout test proves a failed refund preserves ownership and proceeds, and succeeds on retry after the token resumes transfers. Both incoming and outgoing callbacks hit the reentrancy guard. A permanently hostile token cannot be certified as unable to trap funds.

## Coverage and accounting

The seeded state machine runs four repeatable seeds: 1, 42, 20261107 and 3735928559. Each runs 90 mixed transitions across a seated and a general admission show after initial purchases. It exercises both payment methods, returns, claims, waitlist entry and exit, duplicate people, recovery, cancellation refunds and host withdrawal after the end. Every transition reconciles balances against both the ledger and independently counted live tickets and active waiters. It checks unique owners, people and seats, capacity, reverse indexes, seat flags and immutable ticket seats.

Unclaimed cancellation refunds are already inside proceeds and escrow until paid. For a disjoint equation, reclassify those cancelled-event balances as unclaimed refunds: balance = non-cancelled proceeds + non-cancelled escrow + unclaimed cancellation refunds. Adding them to the raw ledger would count the same money twice. Direct token donations are excluded from this equality; in their presence the correct requirement is balance >= liabilities.

A separate seeded queue test skips more than 64 abandoned slots, proves surrender rolls back on backlog, advances exactly 64 slots and preserves the promoted seat. A recovery replay test first moves ownership away again so that the spent-signature check is actually reachable.

The random lifecycle suite starts with fully minted events to explore normal turnover. The pre-capacity seat violation and hostile dependency failures are isolated executable reproductions with assertions of the observed unsafe behavior. Green tests therefore do not certify these findings as fixed. The contract owner must turn these reproductions into rejection assertions when applying fixes.

## Limits

This is a targeted review with deterministic randomized testing, not a formal proof. Exact-output payments with the supplied honest mock reconcile correctly across the tested traces. Reentry into protected money operations is blocked, but a dishonest router or token can violate solvency as shown above. No claim is made that arbitrary dependencies cannot trap funds. Live routing, deployment identity and network behavior require their separate checks.
