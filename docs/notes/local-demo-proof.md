# Local demo proof, 7 November 2026

This records the interactive run on `http://localhost:3300` with a fresh local chain on port 8550, chain id 31337. It is evidence for this local session, not the hosted build or a real-person identity claim. Test identities and test money only.

## World sign-in

The official World simulator completed a Human request. The app posted the proof to the official World verification service and `/api/account/login` returned HTTP 200 in 920 ms, including 854 ms of application work. The account page displayed credential `orb` and the signed-in account menu. This timing is the server login response, not the whole interactive verification time.

Sign-in and checkout request Proof of Human with a server-issued login challenge so the staging simulator Human card works. The backend still requires World ID 4.0 and rejects Device-only proofs. The booth cut does not expose a credential method picker.

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

Real World accounts remain separate from this staging flow. Hosted/public-RPC purchases, returned seated checkout and door admission after revocation still need their own checks. A successful local purchase does not resolve the reported port 3000 ownership/binding failure.

## Booth checkout decisions (current main)

The shared booth cut uses: Proof of Human only (no method picker), wallet picker then ETH under the hood without fan-facing Uniswap/ETH→USDT copy, no key export/import, four demo cities, Devcon Mumbai poster, and waitlist hardening. Those decisions supersede the clone notes above about method selection and dual payment chips.
