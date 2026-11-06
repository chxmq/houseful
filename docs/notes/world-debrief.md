# World integration debrief

Evidence: the supplied `submission/world-run-notes.md` record, completed at 04:07 IST on 7 November 2026. This summarizes that run. It does not assert a new live run or a successful purchase.

## Time to first success

The first server-verified staging proof succeeded at 03:55:52 IST, about eight minutes after the investigation began. The server returned HTTP 200 after 3.89 seconds. This was a World ID 4.0 Human credential in the staging simulator, not a proof from a physical attendee's real World App.

A completed purchase was not observed. The following USDT approval failed because the public RPC did not support `eth_sendTransaction`; no ticket was minted. From clicking Get tickets to the failure message was 132.1 seconds, including 110.8 seconds before the person approved the prompt. There is no valid time-to-purchase-success measurement.

The signing path has since been corrected to preserve the wallet's local account. PENDING(live-purchase): rerun and record the real proof-to-ticket path after that change.

## Friction encountered

- The QR appeared after about four seconds. On desktop, the useful handoff was the small simulator link; there was no visible copyable connection URL.
- After approving in the simulator, the proof took about five seconds to reach the app. Server verification then took 3.89 seconds and the test faucet took 6.1 seconds.
- The purchase failure appeared after the person had already verified, and Try again restarted the person check rather than clearly identifying the failed payment step.
- Declining inside the simulator left the app connecting for the observed 70 seconds. Closing the app modal did show “Verification was cancelled. Nothing was charged.”
- A second wallet using the same simulated person received a World HTTP 502, wrapped by the app as a proof rejection. This was not evidence that the one-ticket rule refused a duplicate: the first purchase had never minted a ticket.
- The simulator mixed credential cards and legacy/version wording in ways that made it unclear which flow to use.

## Missing capability or documentation

A clear desktop connection-link handoff, documented decline behavior and a distinction between a provider outage and an invalid proof would improve integration. The observed 502 cannot establish whether the service failed or refused a repeated proof. PENDING(real-app-decline): a decline from a real World App was not tested.

## Highest-impact improvement

Provide a visible copyable connection link with a clear completed, cancelled or failed status returned to the app. This would make desktop demonstrations easier to complete and avoid leaving people on an indefinite connecting screen. The app should separately explain whether identity verification or payment failed.

## What this run does not prove

No purchase, minted ticket or successful same-person duplicate-ticket refusal was observed. A successful staging verification does not prove real-world uniqueness enforcement, live payment success or production reliability. A successful purchase recording, real-app decline check and hosted phone check remain PENDING.
