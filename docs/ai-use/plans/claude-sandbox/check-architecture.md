CONFIRMED 131, WRONG 1, UNSUPPORTED 3, out of 135 sentences, table rows and diagram edges.

Mechanical: all 139 backticked tokens resolve (`Verifier.check` means class plus method). Env vars and routes exist. The doc quotes no test names, UI strings, pnpm scripts or slugs. Em dashes, emojis, banned words: 0. No claim of a real World ID run, public deployment or blocked screenshot.

WRONG
1. "Only `Verifier.check` is network-free." `buildDoorPayload` (`packages/pass/src/payload.ts`) is too: I ran both with `fetch` disabled. This also contradicts the Pass library row. Fix: "Only the pass steps, `buildDoorPayload` and `Verifier.check`, are network-free."

UNSUPPORTED
2. "A person's World ID credential stays in World App" No code shows this; it describes World's product. Fix: "Houseful code handles only the IDKit result."
3-4. `W-->>B: Proof result, bound to wallet` and `W-->>S: success`. Replies never seen from real World: `README.md` says nothing has run against it, and QA `/api/world/request` returned 500 (`serverEnv`, no `WORLD_RP_SIGNING_KEY`). Fix, under the diagram: "World replies are what the code expects. PENDING(world-run)."

MARKER MISSING
"| Live World verification | Not recorded in this repository |" True, but unmarked. Fix: "PENDING(world-run)".

CORRECT BUT COULD MISLEAD
- "The contract trusts one address, `verifier`." `setVerifier` is `onlyOwner` (`Houseful.sol`). Fix: "For admission, the contract trusts `verifier`, which the owner can replace."
- "`verifications` is an audit log" `recordVerification` (`humans.ts`) uses `onConflictDoNothing` on action, nullifier and purpose, so repeats and later wallets are dropped. Fix: "`verifications` keeps the first row per action, nullifier and purpose."
- "Contract owner, `DEPLOYER_PRIVATE_KEY` on 4801" No 4801 deployment exists. QA `owner()` is Hardhat account 0, the `.env.example` `FAUCET_PRIVATE_KEY`, so the example env gives the server the owner key. Fix: "Owner: Hardhat account 0 on 31337, the example faucet key. `DEPLOYER_PRIVATE_KEY` on 4801: PENDING(testnet)."
- "Be exported or recovered." The key is plaintext in localStorage (`device-wallet.ts`), so devtools can copy it. Fix: "The app offers no export or recovery path, but the plaintext key can be copied."
- "`serverEnv` requires the World and attester settings." `schema` extends `door`, so `DOOR_ISSUER_SECRET_KEY` is required too. Fix: "`serverEnv` requires the World, attester and door settings."