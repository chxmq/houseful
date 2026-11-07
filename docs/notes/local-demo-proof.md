# Local demo proof, 7 November 2026

This records the interactive run on `http://localhost:3300` with a fresh local chain on port 8550, chain id 31337. It is evidence for this local session, not the hosted build or a real-person identity claim. Test identities and test money only.

## World sign-in

The official World simulator completed a Human request. The app posted the proof to the official World verification service and `/api/account/login` returned HTTP 200 in 920 ms, including 854 ms of application work. The account page displayed credential `orb` and the signed-in account menu. This timing is the server login response, not the whole interactive verification time.

The sign-in page now lets the person choose Human, Passport or Selfie Check. Human is the initial choice. The request uses the corresponding SDK preset and a server-issued login challenge. The backend still requires World ID 4.0 and rejects Device-only proofs. Presets can carry legacy compatibility metadata; the simulator must remain on World ID 4.0. Choosing a stronger credential does not weaken the server's per-show policy.

A staging request now renders a visible Open simulator link on desktop and phone widths. It carries the active connection into the official simulator, and the page polls for the result. No proof or login result is faked by this UI. Production keeps the standard connection widget. While the server confirms a proof, cancellation and new attempts are blocked; callbacks from an older request cannot change a newer attempt. Failed backend logins reject the verification callback rather than reporting a successful sign-in.

The earlier missing-key startup error was fixed only in the clone's ignored local environment. A separate random door issuer key was created locally; World registration settings were copied from the existing shared checkout without printing values.

## Purchases and contract state

Both purchases came from the signed-in browser wallet. Independent reads confirmed the ticket owner, owner index, nonzero door key and proceeds after the UI completed.

| Show | Method | Chain event and ticket | Proceeds | Purchase transaction |
| --- | --- | --- | --- | --- |
| Bijli Ka Bill | Test USDT | event 2, ticket 0 | 7,000,000 USDT base units, or 7 test USDT | `0xfe1b93499c79084237c9d81e4da193e8241a37fb047d88d8def9e0a3eec7894b` |
| Kaali Peeli Sound System | ETH, `buyWithEth` | event 3, ticket 0 | 9,000,000 USDT base units, or 9 test USDT | `0x70b7473e761f196d8953f37d6a5928131d5b14be32b87794e46d651191d389ba` |

The Bijli Ka Bill page printed ticket `HSF-2-0`, then `/tickets` displayed its rotating code. `/api/pass` returned 200. The displayed availability fell from 19 to 18. The local ETH purchase uses MockSwapRouter at its fixed test rate; it is not evidence of a live Uniswap swap. See `../../FEEDBACK.md` for the separately recorded Unichain transaction.

Screenshots from the run are saved locally as `/tmp/houseful-sign-in-success.png`, `/tmp/houseful-usdt-purchase-success.png` and `/tmp/houseful-local-ticket-qr.png` and `/tmp/houseful-eth-purchase-success.png`. These are local artifacts, not committed admission credentials.

## Regression checks and limits

Unit checks cover selected preset and challenge binding, version-specific errors, failed backend login rejection, explicit success confirmation and simulator link encoding. Browser specs cover each method, mobile simulator access, cancellation, rejected verification and a delayed server confirmation. The new browser specs have not been run against the disposable harness during this live testing session; the app and persistent local chain were kept available for the user.

Real World accounts remain separate from this staging flow. Repeat sign-in against the real service, account continuity across credential families, hosted/public-RPC purchases, returned seated checkout and door admission after revocation still need their own checks. A successful local purchase does not resolve the reported port 3000 ownership/binding failure.

## Parallel checkout work

At inspection, the shared checkout contained uncommitted payment-sheet, wallet-selection, settlement text, minting and sign-in changes. Those files were read without editing the shared checkout. Its sign-in preset change to Human is consistent with this fix; the clone also adds method selection, explicit simulator access and backend-error handling.

The uncommitted checkout rewrite calls purchase functions with `"usdt"` and removes the ETH selection. An environment toggle alone would not restore that UI path. Preserve an explicit, tested ETH checkout or another clearly demonstrated Uniswap action for the sponsor demo. These uncommitted changes have not been presented as integrated or verified in the clone.
