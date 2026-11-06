# Contract review and discovery plan

Spec: docs/specs/v2.md.

## Contract review

- Add a deterministic generator and a stateful suite under packages/contracts/test/invariants.
- Check pooled balances against event liabilities after every action, including cancellation refunds and host withdrawals. Refunds remain inside the two ledger buckets until paid, so do not count them twice.
- Track seats, owners, people, capacity, recovery generations, spent signatures and waitlist order through mixed payment paths.
- Add hostile dependency fixtures and reproduce any failures separately from the invariant suite.
- Record severity, scenario, source and proposed fixes without editing the production contract.
- Rebase, run required checks, then commit this review as one logical change.

## Discovery

- Build a validated URL query with text, city, category, local date windows, maximum price and deterministic sorting.
- Test parsing, literal text, combined filters, timezone boundaries and stable ordering before implementation.
- Add server results and a native GET form, country-grouped city selection, clear reset links and narrow layouts. Reuse the existing catalog.
- Connect city pages to the same filters. Keep automated browser specs pending the shared harness.
- Check desktop and 375px layouts, rebase, run required checks and commit discovery separately.

## Wallets

Wait for the explicit accounts handoff before starting.
