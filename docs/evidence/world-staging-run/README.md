# World staging run, 7 November 2026

The one real World ID run recorded before the final build. [world-run-notes.md](world-run-notes.md) is the full record, with a timestamp on every line. The screenshots are numbered in the order they were taken.

**What it was.** A Claude Code subagent drove Chrome against the local development server, not the hosted site, with World's environment set to staging and World's simulator at https://simulator.worldcoin.org.

## What it shows

- A World ID 4.0 Human credential verified by our server: HTTP 200 in 3.89 seconds at 03:55:52 IST. The timestamps are in the notes. No screenshot of the success itself was taken.
- The cancelled path: closing the prompt shows "Verification was cancelled. Nothing was charged." ([05-cancelled-nothing-charged.jpg](05-cancelled-nothing-charged.jpg)).
- The simulator handoff on desktop ([02-verify-prompt-qr-use-simulator.jpg](02-verify-prompt-qr-use-simulator.jpg)).

## What it does not show

- **A purchase.** The first on-chain write after verification failed because the public RPC did not offer `eth_sendTransaction` ([03-purchase-failed-after-verified-proof.jpg](03-purchase-failed-after-verified-proof.jpg)). That was a wallet signing bug of ours, fixed in commit `2b8b70d`. The corrected path has not been re-run live.
- **The one-ticket refusal.** The second attempt, with a second wallet and the same simulated person, got HTTP 502 from World ([04-second-wallet-world-rejected-502.jpg](04-second-wallet-world-rejected-502.jpg)). That was not our refusal, because no ticket had been minted.
- **A real World App.** The staging environment does not accept one.

The summary of this run for World's prize is in [docs/notes/world-debrief.md](../../notes/world-debrief.md).
