# World sign-in and checkout review

Reviewed 7 November 2026 against source `ef8ae83` and the hosted production alias, `https://houseful-chxmqs-projects.vercel.app`. This is a targeted flow review, not a successful real-account or purchase test. No protected checkout, World verifier or contract source was changed.

## Captured steps

Screenshots were captured and inspected during this run. Local evidence is in `/tmp/houseful-world-review/`.

| Step | Screen | Health | Evidence |
| --- | --- | --- | --- |
| 1 | Desktop sign-in | Opens, but omits credential choice and test-environment explanation | [01-sign-in.png](/tmp/houseful-world-review/01-sign-in.png) |
| 2 | World connection prompt | Blocked for the intended real-account test: explicitly offers staging and links to `staging.world.org` | [02-world-staging.png](/tmp/houseful-world-review/02-world-staging.png) |
| 3 | Close the prompt | Returns to sign-in with a cancellation message | [03-cancelled.png](/tmp/houseful-world-review/03-cancelled.png) |
| 4 | Mumbai home at 375px | Main content fits the phone window in the inspected view | [04-phone-home.png](/tmp/houseful-world-review/04-phone-home.png) |
| 5 | General-admission checkout at 375px | Controls fit, but payment and admission choices are confusing | [05-phone-checkout.png](/tmp/houseful-world-review/05-phone-checkout.png) |
| 6 | Checkout's World handoff at 375px | Opens a second staging connection with an Open World ID App link | [06-phone-world-handoff.png](/tmp/houseful-world-review/06-phone-world-handoff.png) |

The user reports scanning the QR on a phone causes no reaction in the app. This review confirms a staging handoff on the hosted site, but does not establish which app/version is installed on that phone or observe its response. Real-account completion remains PENDING.

## Findings, in priority order

### WF-01: Blocker, the hosted public flow requests staging verification

Observed in steps 2 and 6: desktop offers “Testing in staging?” and a simulator link; both desktop and mobile connection URLs use `staging.world.org`. Step 1 gives no warning that an ordinary real-account test is incompatible with this test flow.

The request environment comes from `apps/web/src/server/world.ts` and is passed unchanged by the sign-in and checkout components. World documents staging as the simulator/testing setting and production as the ordinary request setting. Sandbox identities and production identities are separate. This is the leading explanation for the reported scan failure, not proof of the exact phone-side failure.

Fix: configure a matched production World app, relying party, signing credentials and environment for real-account testing, then redeploy and test the physical phone handoff. Do not change just one environment flag without checking its matching registration. Keep simulator testing on a clearly labeled separate test deployment. If this deployment intentionally remains staging, say so before the scan and do not imply it accepts a real World account.

References: [IDKit integration](https://docs.world.org/world-id/idkit/integrate), [sandbox boundaries](https://docs.world.org/world-id/sandbox/testing-selfie-check).

### WF-02: High, sign-in hardcodes Selfie Check and offers no method choice

Observed in steps 1 and 2: one sign-in button opens the connection prompt with no method selector. Source: `apps/web/src/components/auth/world-login.tsx:116` always builds `selfieCheck({ signal })`. Checkout separately chooses a preset from the event's assurance policy in `apps/web/src/components/verify-human.tsx`. A real Orb account does not cause sign-in to request an Orb proof automatically.

Fix: expose the supported sign-in methods with their requirements, use the selected credential request, and retain server-side assurance enforcement. Higher-assurance shows must not be weakened by an arbitrary method selector. Check identity continuity when changing credentials; method selection must not create a second account for the same intended identity. The current `world_id_4_not_available` message also incorrectly implies that every such failure means a missing Selfie Check.

Reference: [World credential requests](https://docs.world.org/world-id/idkit/credentials).

### WF-03: High, returning login uses a one-time uniqueness request

Source-derived risk, not reproduced with a real identity: every login requests the same `houseful-login` action with a fresh challenge, using `IDKitRequestWidget`. Checkout also uses that action. No World session id is stored or proved on return. The application login cookie is a separate mechanism and does not solve a new proof after sign-out, expiry or another device.

World documents a uniqueness action as usable once per person and recommends session proofs for returning Selfie Check users. A repeated check can therefore hit replay or verification-limit failures. Portal-specific limits were not inspected in this run.

Fix: review enrollment with a uniqueness proof plus World session creation, then verify the saved World session for returning users. Preserve the enrollment identity used by ticket attestations and contract nullifiers; changing the action per login would undermine the one-person policy. Validate sign-out/sign-in and a second phone against the real service.

Reference: [session proofs and returning users](https://docs.world.org/world-id/idkit/session-proofs).

### WF-04: High, a failed server login is reported to the widget as success

Source-derived defect: `apps/web/src/components/auth/world-login.tsx:106` sets an error and returns normally for a non-OK login response. The installed widget treats a resolved `handleVerify` promise as passed, then runs `onSuccess`, which closes the prompt. The person can see the dialog disappear without being signed in. This does not bypass the server's session checks, but it misrepresents the result.

Fix: reject the verification callback on a failed server response, preserve a useful failure message, and navigate only after confirmed session creation. Add coverage for rejected proof, provider outage, expired challenge, malformed response and retry. These failure cases were not injected into the hosted app.

### WF-05: Medium, checkout controls describe actions they do not perform

Observed in step 5: “Pay now” is a payment-method toggle beside “Pay with Ethereum”, followed by the actual “Get tickets” action. General admission adds a “Continue without a seat” button even though there are no assigned seats. Helper text tells ordinary fans to use a simulator, blending a public-looking ticket purchase with developer testing.

Files: `apps/web/src/components/ticket-panel.tsx` and `apps/web/src/components/seatmap/seat-map.tsx`. These checkout files remain owned by the checkout implementer.

Fix: label payment methods consistently, identify test currency clearly, preselect general admission without an extra confirmation, and use one clearly named next action. Explain the current verification method and the handoff state. Keep simulator instructions inside an explicit test mode. Test selection state with keyboard and a screen reader; the inspected general-admission selection changes color but does not expose `aria-pressed`.

## Limits and release checks

No biometric check, real World sign-in, purchase, minted ticket, refund, returned-seat claim or host flow was completed in this run. No external wallet transaction was submitted. The user’s exact phone-side symptom was not directly observed. The review confirms public prompt behavior and source-derived defects, not a complete accessibility audit.

Before calling the flow ready, record a successful real-account login, sign-out/sign-in, supported credential selection, phone handoff and return, explicit decline, timeout, server rejection and one complete test ticket purchase. Recheck the returned-seat issue in `contract-review.md` independently. Existing unit and simulated browser passes do not substitute for those live checks.

## Follow-up local implementation and evidence

The clone's current sign-in work addresses WF-02 and WF-04: Human, Passport and Selfie Check can be selected before opening World; the SDK preset matches that choice; version failures are no longer described as missing Selfie Check; backend failures reject the verification callback. A staging-only inline connection panel supplies an Open simulator link on narrow screens as well as desktop. The server continues requiring World ID 4.0. Production retains the standard connection widget.

A Human staging sign-in subsequently returned 200 from the app after official World verification, with an Orb credential on the account. Browser purchases on the local chain completed with both test USDT and ETH, and the ticket code page opened. See `local-demo-proof.md`. These observations supersede the earlier absence of local successful completion. WF-01 still describes the separate real-account environment mismatch, and WF-03 remains unresolved.

The reported port 3000 purchase uses Unichain Sepolia. A read-only check found event 2 had one minted ticket, owned by `0x4779157A…`, with an unbound door key. This owner has not been matched to the current user's browser in this review. It is consistent with a completed buy followed by a failed bind; the UI must not imply that a second purchase is the right recovery. The holdings page already offers Bind this phone for an unbound owned ticket. The protected checkout owner should retain the paid transaction and resume binding after ownership is confirmed, rather than replaying a consumed purchase attestation.
