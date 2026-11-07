# World ID staging run: Houseful ticketing app

Date: 2026-11-07 (all times local, HH:MM:SS, taken from the machine clock at the moment each line was written)
App: http://localhost:3000 (Next.js dev server, Unichain Sepolia, World environment "staging")
Simulator: https://simulator.worldcoin.org
Driver: Claude sub-agent using Claude in Chrome (own tabs only, user's tabs untouched)
Rules honoured: read-only on source, no .env read, no server start/stop, max 2 purchase attempts, no secrets typed anywhere.

## Result in six lines
- Show: twelve-to-twelve-nye-nsci-dome ($29, general admission, 4860 seats left), asks for Proof of Human (Orb). Simulator identity 0x18310f83 already had a valid Human (Orb) credential.
- Attempt 1 (03:53:52): World ID proof VERIFIED on our server (HTTP 200, 3.89 s). The purchase then FAILED on the first on-chain write with: The method "eth_sendTransaction" does not exist / is not available. No ticket minted, nothing charged. Cause found in ticket-actions.ts (see friction item 1).
- Attempt 2 (04:03:45, second wallet via localStorage trick, same simulator identity): World's verify endpoint answered HTTP 502, our UI showed: World rejected the proof (HTTP 502).  This is NOT the designed "already holds a ticket" refusal (no ticket existed). Nothing charged.
- Cancelled path: closing the prompt gives "Verification was cancelled. Nothing was charged."; pressing Cancel inside the simulator gives the app nothing (modal hangs on "Connecting...").
- Purchase attempts used: 2 of 2. The cancel test started a verification at 03:59:56 but was never approved, so it is not counted as a purchase attempt.
- Not completed: successful purchase and mint, ticket on /tickets, success timing, the real refusal message.

## Timeline

- 03:47:47 Started. Opened tab group, read apps/web/src/lib/assurance.ts.
- 03:49:30 Step 1: show selection (details below).

## Step 1: choosing the show

Rule in apps/web/src/lib/assurance.ts, assuranceFor(): "human" (Proof of Human) if status is sold_out, or capacity >= 5000 and priceUsd >= 18. Everything else asks for "selfie" (Selfie Check).
Server side (apps/web/src/server/world.ts) a "human" show accepts only Orb (issuer_schema_id 1) or Document (9303/9310) credentials; a Selfie Check (11) is refused with "This show asks for Proof of Human. A Selfie Check is not enough."

Candidates from the seed data (apps/web/scripts/seed.ts; live DB checked on the page afterwards):
- the-last-local-nsci-dome: human, but sold_out and the flagship, excluded by instruction.
- chawl-no-9-prithvi, sufi-raat-bandra-fort: human only because sold_out, waitlist only, not on sale.
- saltwater-weekender-jio-world-garden: capacity 9000, $59 (human rule) but status "announced", not on sale.
- twelve-to-twelve-nye-nsci-dome: capacity 7000, $29, status on_sale, 2140 of 7000 sold in the seed, general admission. Meets the human rule and has seats left.

Pick: twelve-to-twelve-nye-nsci-dome ("Twelve to Twelve", New Year's Eve at NSCI Dome). Credential asked: Proof of Human (Orb level).
- 03:51:39 Step 2: opened https://simulator.worldcoin.org in my own tab. No sign-in, no terms, no cookie banner. After about 3 s the page redirected itself to /id/0x18310f83, i.e. it auto-created a test identity (chicken avatar) with four credential cards already installed: Human, Passport, ID, Device.
- 03:51:39 Opened the Human card: "Valid", Uniqueness level Highest, Verification method Orb, Issuer World Foundation, shares "Proof of Unique Human". So the Orb-level (Proof of Human) credential was already there; nothing had to be added and I pressed no "add credential" button (none was visible).

## Step 2 notes: simulator
- Simulator ready, identity 0x18310f83, Human credential = Orb, Highest, Valid.
- Confusing: the top banner says "This simulator will change with the adoption of World ID 4.0. Learn more." It does not say whether the simulator already handles World ID 4.0 requests (our app sends 4.0 proofs). Nothing on the home screen says what format "Paste code" wants or where to get the code.
- Confusing: the first click on the stacked "Human" card (accessibility ref, which clicks the element centre) opened the Passport card instead, because the cards overlap. Clicking the visible top strip of the Human card worked.
- The phone frame is blank white for about 2 s before the identity loads, with no spinner.

## Steps 3 and 4: timeline of attempt 1
- 03:51:49 Opened http://localhost:3000/e/twelve-to-twelve-nye-nsci-dome in my own second tab. 4 s after load it still said "CHECKING SEATS"; it was ready by about 10 s, showing "4860 LEFT", "$29", the line "Checked with Proof of Human. No World App? Use the simulator in the next step.", a general admission box, "Pay now" / "Pay with Ethereum", and the red "Get tickets" button.
- 03:53:16 Installed a passive in-page logger (fetch timing, DOM text changes) in the app tab so timings below are measured in the browser, not guessed.
- 03:53:41 Clicked "Continue without a seat" (general admission) and "Pay now" (already the default). Nothing is charged by these two clicks.
- 03:53:52.870 Clicked "Get tickets" (the verify button; there is no button literally called "Verify and buy").
- 03:53:54.197 POST /api/world/request returned 200 (1.33 s). IDKit modal opened: "Connect your World ID, Use phone camera to scan the QR code". QR placeholder first, real QR about 4 s after the click.
- 03:59:21 (written late) The modal has NO copy-link button and no text box on desktop. It has the QR, a link "Testing in staging? Use the simulator", a hidden "Open World ID App" deep link and a hidden "Display QR Code" button (mobile only).
  I tried to read the connect link out of the DOM with javascript_tool; the tool refused ("[BLOCKED: Cookie/query string data]") because the link contains a query string. I did not try to get round that block. Instead I clicked the modal's own "Use the simulator" link (target=_blank, goes to simulator.worldcoin.org/ with one query parameter). So I did NOT use the simulator's "Paste code" box; the link prefilled the request.
- 03:55:15 New tab opened by that link: simulator at /id/0x18310f83 (same identity as my first simulator tab) with a ready-made sheet "Complete verification": chips Human (selected) / Passport / ID / Device, "Houseful will see these proofs: Unique Human", buttons Cancel and Continue, and "SIMULATOR OPTIONS: Legacy v3 proof | World ID 4.0" with World ID 4.0 already selected.
- 03:55:43.7 Clicked Continue (approve) in the simulator. The simulator then showed "Presented" with a green tick.
- 03:55:48.744 POST /api/world/verify started (5.0 s after my approve click: proof generation and relay to the app).
- 03:55:52.630 POST /api/world/verify returned 200 (3.89 s). So the proof VERIFIED on our server: World verify API accepted it, the on-chain nullifierUsed check passed, an attestation was signed.
- 03:55:53.311 POST /api/faucet started, 200 at 03:55:59.378 (6.07 s) to give the fresh device wallet test ETH and test USDT. The UI showed the "Printing ticket 52%" animation with steps: "Checking you are one person" (ticked), "Taking face value into the contract" (running), "Binding this phone for the door".
- 03:56:03.440 first on-chain write from the browser: JSON-RPC eth_sendTransaction to sepolia.unichain.org. 03:56:03.758 the RPC answered HTTP 403.
- 03:56:05.010 UI shows, verbatim: The method "eth_sendTransaction" does not exist / is not available.   (with a "Try again" link). PURCHASE FAILED, no ticket minted.

## Step 3 and 4 results (attempt 1 of max 2)
- Show: twelve-to-twelve-nye-nsci-dome, $29, general admission, Proof of Human (Orb). 4860 left before and after.
- Proof verified on our server: YES (200, 3.89 s).
- Purchase and minting completed: NO. Failed at the first on-chain write (the USDT approve).
- Ticket at /tickets: NO. Page says "NOTHING BOOKED YET", wallet 0x0C14...0EF6 (device wallet created by the app).
- Seconds from clicking "Get tickets" to success: no success happened. Click to failure message was 132.1 s = 110.8 s from the click to my approve click (QR ready after about 4 s; the rest was me finding the link and switching to the simulator, a person with a phone would need maybe 10 to 20 s) + 21.3 s from approve to the failure message (proof hand-off 5.0 s, server verify 3.9 s, 0.7 s gap, faucet 6.1 s, 5.6 s from faucet end to the error shown).
- Console errors: none logged (the app catches the error and shows it in the panel; the browser's own 403 line is not exposed by the console tool).
- Charged: nothing spent. The faucet gave the device wallet test funds (not a charge). Seats left still 4860.
- Likely root cause (read-only look at source): apps/web/src/lib/ticket-actions.ts. send() and approveUsdt() call publicClient.simulateContract({ account: signer.address, ... }) and then signer.client.writeContract(request). Because the account is given as a bare address, viem treats it as a JSON-RPC account and (viem 2.57.16, actions/wallet/sendTransaction.ts line 223) sends eth_sendTransaction instead of signing locally with the device key. The public Unichain Sepolia RPC does not offer eth_sendTransaction, so it answers 403. Passing signer.client.account (the local account) to simulateContract would make viem sign locally and send eth_sendRawTransaction. This is probably invisible against a local dev node that accepts eth_sendTransaction.
- 03:59:45 Clicked "Try again" on the failure panel: panel went back to idle (general admission and Pay now still selected, 4860 left). Same wallet, no ticket.

## Step 5b: cancelled path (done first, because it needs a wallet with no ticket and does not spend anything)
- 03:59:56.379 Clicked "Get tickets" again (this is a started verification, not a purchase: nothing was approved, nothing paid). /api/world/request 200 in 0.08 s (warm, versus 1.33 s the first time).
- about 04:00:10 Clicked the modal's "Use the simulator" link: new tab, same identity 0x18310f83, same "Complete verification" sheet.
- about 04:00:40 Clicked "Cancel" (decline) in the simulator. The simulator just closed the sheet and went back to its credentials screen, with no message.
- The app's modal changed to "Connecting... Please continue in app" with a spinner and STAYED there. I watched for 70 s (04:00:44 to 04:01:52): no decline, no error, no message in the app. So declining inside the simulator is not reported back to the website in this setup.
- 04:01:53.647 Clicked the modal's X (close). Immediately the panel showed, verbatim: Verification was cancelled. Nothing was charged.   (with "Try again"). Seats left still 4860.

## Step 5a: refusal path (second wallet, same simulated person), attempt 2 of max 2
- 04:02:43.706 In the app tab ran localStorage.removeItem('houseful.wallet.v1') (key existed before: true, after: false), then reloaded the show page. I never read the key value.
- 04:03:06 Page ready again with 4860 left. /tickets showed a NEW device wallet 0x4779...b8B8 (the first one was 0x0C14...0EF6) and "NOTHING BOOKED YET". The old wallet's key is gone from this browser (it only held test funds from the faucet, no ticket).
- 04:03:45.164 Clicked "Get tickets" (general admission, Pay now). /api/world/request 200 in 0.05 s. Used the modal's "Use the simulator" link: new tab, SAME identity /id/0x18310f83, same Human credential, World ID 4.0 selected.
- 04:04:17.06 Clicked Continue (approve) in the simulator.
- 04:04:23.077 POST /api/world/verify started (6.0 s after approve). 04:04:25.679 it returned HTTP 422 with body {"code":"rejected-by-world","error":"World rejected the proof (HTTP 502)."} (2.6 s).
- 04:04:26.106 UI shows, verbatim: World rejected the proof (HTTP 502).   (with "Try again", no other text).
- Charged: nothing. After the refusal the logger shows no /api/faucet call and no on-chain transaction from the browser. Seats left still 4860. So nothing was charged, nothing minted.
- IMPORTANT: this is NOT the refusal the test was designed to show. The intended message ("This person already holds a ticket or a waitlist place for this show. One each, so everyone gets a fair go.", from apps/web/src/app/api/world/verify/route.ts, or "This person has already used their one ticket for this show." from IDKit) was NOT observed. That check only fires when the contract already has the nullifier, which happens at purchase, and purchase 1 failed, so no ticket exists to refuse against.
- What the 502 means: our server only prints "(HTTP <status>)" when World's response has neither a "detail" nor a "code" field, so World's staging verify endpoint answered 502 with no JSON error. That is a gateway or server error on World's side, or an undocumented way of refusing a replayed proof from the same person; I cannot tell which. The same identity and action had verified fine with HTTP 200 nine minutes earlier. I had used both allowed purchase attempts, so I stopped instead of retrying.
- Our UI labels a World server error as "World rejected the proof", which reads like the person was refused. The code maps every non-OK World answer to "rejected-by-world" (422); only a network failure becomes "world-unreachable".

## Step 6: screenshots (copies in , originals in the Chrome temp folder (local temp folder))
1. Simulator ready (Human credential: Orb, Highest, Valid): world-run-screens/01-simulator-ready-human-orb.jpg   (original screenshot-1794003687968-5.jpg)
2. Verify prompt (IDKit modal with QR and "Use the simulator" link): world-run-screens/02-verify-prompt-qr-use-simulator.jpg   (original screenshot-1794003848720-7.jpg)
3. NO success screenshot exists, the purchase failed. The failure after a verified proof ('The method "eth_sendTransaction" does not exist / is not available.'): world-run-screens/03-purchase-failed-after-verified-proof.jpg   (original screenshot-1794004114328-8.jpg)
4. Second wallet, same person, message shown (not the intended refusal, see above): world-run-screens/04-second-wallet-world-rejected-502.jpg   (original screenshot-1794004476938-13.jpg)
5. Cancelled path, "Verification was cancelled. Nothing was charged.": world-run-screens/05-cancelled-nothing-charged.jpg   (original screenshot-1794004315760-12.jpg)
Supporting: extra-no-ticket-on-tickets-page.jpg (/tickets says NOTHING BOOKED YET after attempt 1; original screenshot-1794004114329-10.jpg) and extra-after-simulator-cancel-app-stuck-connecting.jpg (app modal stuck on "Connecting... Please continue in app" after Cancel in the simulator; original screenshot-1794004242720-11.jpg). Other files in that temp folder dated 6 Nov are not mine.

## Friction list
1. BLOCKER, purchase never completes on the real testnet: first on-chain write fails with the raw viem text 'The method "eth_sendTransaction" does not exist / is not available.' after the person has already been verified and the faucet has already paid out. The message does not say verification worked, does not say whether verifying again is needed, and "Try again" restarts from the World ID step.
   Cause (read-only look, high confidence): ticket-actions.ts lines about 112 and 173 pass account: signer.address to simulateContract, so the returned request carries a JSON-RPC account, and viem 2.57.16 (actions/wallet/sendTransaction.ts line 223) then sends eth_sendTransaction instead of signing with the device key. The public Unichain Sepolia RPC answers 403 to that. The Playwright suite uses a fake wallet that answers eth_sendTransaction itself (apps/web/e2e/support/fake-wallet.ts), which may be why tests did not catch it (my guess).
2. After the first verified-but-unpaid attempt, the same person verifying again from a new wallet got World HTTP 502, shown as "World rejected the proof (HTTP 502)." So a person who hits the bug above may be unable to retry (not proven, one sample).
3. Desktop IDKit modal has no copy-link button and no text box. Only a QR plus a small grey "Testing in staging? Use the simulator" link (new tab). The simulator's "Paste code" box was not needed and not used. The brief assumed copy and paste; the link route is the only one on desktop.
4. The connect link cannot be read through the browser tool (output blocked as query-string data), which is fine for security but means copy and paste automation does not work.
5. QR takes about 4 s to appear (blurred placeholder for the first 2 s). The /api/world/request call took 1.33 s cold, 0.05 to 0.08 s warm.
6. Declining ("Cancel") in the simulator does not tell the website anything: the modal stays on "Connecting... Please continue in app" (watched 70 s). Only the X on the modal gives the "cancelled" message. With a real World App a decline should come back as user_rejected; I could not test that.
7. Proof hand-off is slow: 5.0 s and 6.0 s from pressing Continue in the simulator until our server receives the proof. Server verify 3.9 s (attempt 1) and 2.6 s (attempt 2, failed). Faucet top-up 6.1 s.
8. Show page shows "CHECKING SEATS" after each load (public RPC reads): still showing 4 s after the first load, ready by about 10 s, and under 7 s on the later reload. The buy button only appears after that.
9. "Continue without a seat" looks like a required step but general admission is already selected and "Get tickets" already works.
10. Simulator: the credential cards overlap, so a click on the element centre opens the wrong card (Passport instead of Human). Blank phone for about 2 s on first load. Banner says the simulator "will change with the adoption of World ID 4.0" without saying what works today. The approval sheet has a "Legacy v3 proof / World ID 4.0" switch (4.0 was the default); I did not try Legacy, the app would refuse it ("Only World ID 4 uniqueness proofs are accepted.").
11. Request lifetime is 300 s (ttl in createWorldRequest). Slow approvers would fail; not hit.
12. Chrome console and network tools returned nothing useful (tracking resets on navigation, and the app swallows the error into the panel). The in-page logger was the only source of timings. No console errors were recorded.

## Not completed
- Purchase and mint (blocked by friction item 1). No ticket, no ticket screenshot, no success timing.
- The "already holds a ticket" refusal text (needs a minted ticket first).
- Decline from a real World App (only the simulator was available).

## State left behind
- Browser localStorage on localhost:3000 now holds wallet 0x4779...b8B8 (no funds, no ticket). Wallet 0x0C14...0EF6 (test ETH and test USDT from the faucet, no ticket) is no longer stored in this browser.
- Verification records: from reading the code, the proof accepted in attempt 1 should have been written to the verifications table by recordVerification (I did not look at the database). No contract state changed (nothing bought, 4860 left).
- Tabs: I closed both simulator tabs, the /tickets tab and a replacement empty tab. The tab group vanished before I could close my last app tab (localhost:3000/e/twelve-to-twelve-nye-nsci-dome, id 2129390599): the browser tool said the group no longer exists and could not target it. That tab may still be open and ungrouped in Chrome, please close it by hand if you see it.
- 04:07:21 Final sections written.
