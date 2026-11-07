L = doc line.

CONFIRMED 289, WRONG 4, UNSUPPORTED 5, of 298 units (sentences, rows, titles, no-test tails).

Mechanical: backticks, titles, env vars, scripts, routes resolve. Five L173 strings wrap source lines (git grep -F misses them). Banned-content scan clean. PENDING on 19/19 issues. No World ID run, public deployment or outright-block claim. Reran: 55 passing; 83 passed, 3 files; subsets. World paths read only.

WRONG
1. L216 "Nothing quoted here touches `apps/web`." L173-174 quote `scanner.tsx`. Fix: "No quoted test title touches `apps/web`."
2. L150 "Refunds on a cancelled show and waiter escrow stay in the contract for good, since no sweep function exists." `surrender` and `_escrowToProceeds` spend a lost waiter's escrow. Fix: append "unless a returned seat reaches that slot."
3. L105 "(`verifier`, set through `ATTESTER_PRIVATE_KEY`)". Constructor and `setVerifier` set it. Fix: "held in `ATTESTER_PRIVATE_KEY`, matching `verifier`".
4. L173 "no resale margin" (`lib/assurance.ts`): a comment, not copy. Fix: "comment in `lib/assurance.ts`".

UNSUPPORTED
5. L142 "so an edited id could give the same person a new nullifier and a second ticket." Per-action nullifiers are World behaviour, unevidenced here. Fix: prepend "if World scopes nullifiers by action,".
6. L141 "The pass route and the sync route read owners and generations from chain." Sync discards owner, needs `getEventByChainId`. Fix: "The pass route reads owner and generation from chain. The sync route reads generations and needs a catalog row." Mark in L144.
7-9. App claims missing `no test`: L70 pass route comparison, L120 `signAttestation` deadline, L127 `WaitlistLedger` recompute. Fix: add to L72, L123, L130.

COULD MISLEAD (counted confirmed)
- L84 "`syncRevocations` only raises a ticket's minimum generation." `verifierFor` rebuilds from the latest sync plus state saved at the last scan. Replay (/tmp/hf-fc/sim.ts): lower list, no scan between, revoked code admitted.
- L84 "resyncs every 2 minutes while online": only while `Scanner` is mounted.
- L171 "both accept": needs earlier `saleStart`; `createShow`'s now-60 reverted at cutoff 1h past (eth_call).
- L148 "Nobody else can take the ticket": a finder holds the unencrypted key (`loadOrCreateKey`).
- L55 "cannot be moved on chain": L128's timed `surrender` moves it. Fix: "cannot be transferred".