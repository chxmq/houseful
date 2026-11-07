**Method.** I confirmed Part 1 values by running the real modules with in-memory `node -e` (Node 24.22.2). Widths are advances from the served woff2 files, with no browser or kerning. Catalog facts come from an immutable SQLite read. `.env.local` stayed unopened and I made no RPC calls, so chain state is unconfirmed.

## Part 1: unit tests

**Setup**
- `~/ethglobal-mumbai/houseful/apps/web/src/lib/pricing.ts:1-10` reads no env and imports nothing. `~/ethglobal-mumbai/houseful/apps/web/src/lib/format.ts` imports nothing. `~/ethglobal-mumbai/houseful/apps/web/src/lib/event-draft.ts:1-3` imports only viem, zod, `./pricing`. No `@/` alias, no setup.
- Match `vitest ^5.1.0`, resolved 5.1.0 (`~/ethglobal-mumbai/houseful/packages/pass/package.json:21`; `~/ethglobal-mumbai/houseful/pnpm-lock.yaml:184-186`).
- No config needed: defaults are `environment:"node"`, `globals:false` (`~/ethglobal-mumbai/houseful/packages/pass/node_modules/vitest/dist/chunks/defaults.B1FCaFfh.js:55-56`); packages/pass has none. Import from `"vitest"` (`~/ethglobal-mumbai/houseful/packages/pass/test/credential.test.ts:1`). Add `"test":"vitest run"` (package.json:11); root `pnpm -r test` then includes it (`~/ethglobal-mumbai/houseful/package.json:12`).
- `tsc` picks up src tests (`~/ethglobal-mumbai/houseful/apps/web/tsconfig.json:27,33`), and so does eslint, which has no test ignore (`~/ethglobal-mumbai/houseful/apps/web/eslint.config.mjs:9-15`). Install vitest first or typecheck fails.

**Fixture F:** `slug:"the-last-local-abcd", title:"The Last Local", subtitle:"One night only", category:"music", venueId:"nsci-dome", hostName:"Kaali Peeli", startsAt:1795271400, doorsBeforeMins:60, durationMins:150, priceInr:999, capacity:300, surrenderCutoffHours:24, ageLimit:18, language:"Hindi, English", description:"A long enough description of the show.", lineup:["Asha","Ravi"], posterVariant:2, posterInk:"stamp"`. startsAt is Sat 21 Nov 2026, 20:00 IST.

**Proposed cases**
- **Hash:** reversed keys match; pin `0x009705ca716958a146f142a7e85f03e904d4da2fc90ec1d41a6098e5d4b9b79f` (computed; equals keccak of hand-written sorted JSON). `lineup:["Ravi","Asha"]` differs. Mutating each of 18 keys gives 19 unique hashes; assert coverage of `Object.keys(draftSchema.shape)`. A padded title parses to the same hash.
- **Schedule(F):** doorsAt 1795267800, endsAt 1795280400, surrenderCutoff 1795181400. With hours 0, doors 0: duration 15 gives cutoff 1795271400; duration 0 hits the clamp at 1795271340. **Finding:** the clamp cannot fire for schema-valid drafts, since durationMins is at least 15 (event-draft.ts:18,59). Call `draftSchedule` directly.
- **chainParams(F,1795000000):** 3330000000000000n, 300n, 1795000000n, 1795181400n, 1795280400n, `houseful:event/the-last-local-abcd`, pinned hash. `inrToWei`: 1="3333333333333", 100000="333333333333333333"; -1, 1.5, NaN throw.
- **slugify:** `"The Last Local"`=the-last-local; `"  --Hello, World!--  "`=hello-world; `"A&B"`=a-b; `"!!!"`=empty; 70 a=60 a. Quirks: `"Café Déjà Vu"`=cafe-de-ja-vu; 59 a+`" bc"` keeps a trailing hyphen (event-draft.ts:38-39). **Bug:** `"मुंबई"`=empty, so slug `-ab12` fails and submit silently returns with the button enabled (`~/ethglobal-mumbai/houseful/apps/web/src/components/host/show-form.tsx:74,83,87-88`).
- **Rejections:** slug `Bad_Slug`,`-x`,`x-`,`a--b`,81 chars; title `"  a "`,61; subtitle 91; category `opera`; venueId empty; hostName `x`,61; startsAt 1.5,NaN,string,2**53; doorsBeforeMins -1,241; durationMins 14,1441; priceInr -1,100001,1.5; capacity 0,100001; surrenderCutoffHours -1,337; ageLimit -1,22; language `x`,41; description 19 after trim,1201; lineup 13 items,`[""]`,`["   "]`,61-char item; posterVariant -1,6; posterInk `blue`; extra key; missing key. Adjacent boundaries pass; startsAt -1 passes.
- **formatInr:** 0=₹0; 1000=₹1,000; 100000=₹1,00,000; 1234567=₹12,34,567; 10000000=₹1,00,00,000; 1499.5=₹1,500; -500=-₹500.
- **Dates at 1795271400:** `8:00pm`, `Sat`, `21 Nov`, `Saturday, 21 November`, `21`, `NOV`. 1795242600=`12:00pm`; 1795285800=`12:00am`.
- **Timezone:** 1795291200 gives `1:30am`, `Sun`, `22 Nov`, `Sunday, 22 November`, `22`, `NOV` under TZ=UTC, America/Los_Angeles, Pacific/Kiritimati. Run the suite with those prefixes.
- **U+202F is not a real bug on Node.** With ICU 78.3, `format()` emits U+0020 (`38 3a 30 30 20 70 6d`); only `formatToParts()` shows U+202F. Safari and Firefox are unverified, and formatTime runs client-side (`~/ethglobal-mumbai/houseful/apps/web/src/components/door/scanner.tsx:409`). To check, look for `20` rather than `202f`, in Node or a browser console: `node -p "[...new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'}).format(0)].map(c=>c.codePointAt(0).toString(16)).join(' ')"`. Assert `/^\d{1,2}:\d{2}(am|pm)$/`. Hardening: `.replace(/\s/g,"")` at format.ts:17.
- **formatEth:** `0n`=`0 ETH`; `3330000000000000n`=`0.00333 ETH`; `1999999999999999999n`=`1.99999 ETH` (truncates); `9999999999999n`=`0 ETH`; `"1500000000000000000"`=`1.5 ETH`; `"abc"` throws SyntaxError; `1234567890000000000n` with digits 2=`1.23 ETH`, 8=`1.23456789 ETH`, 0=`1 ETH`. **Bug:** show-form.tsx:274 and `~/ethglobal-mumbai/houseful/apps/web/src/components/host/host-console.tsx:128` append ETH again: `0.00333 ETH ETH`.
- **shortHex:** `0x5FbDB2315678afecb367f032d93F642f64180aa3`=`0x5FbD…0aa3`; 12 chars unchanged; `0x12345678901`=`0x1234…8901`; tail 0 repeats the whole string (format.ts:29).
- **Categories:** CATEGORIES map to Music, Comedy, Theatre, Sports, Food, Workshops, Nightlife; key sets match (format.ts:32-40; event-draft.ts:5).

## Part 2: 375px hazards

Every outcome is a static prediction [inference]. **OFF LIMITS: no fix below lands there.** `app/door`, `app/tickets` and `app/host/new` pages need no change. `door-code`, `scanner` and `show-form` paths are allowed but serve those flows.

**Likely to break**
- `~/ethglobal-mumbai/houseful/apps/web/src/components/door-code.tsx:89`: QR is 96.5px inside padding for 61 modules (247-char payload, `~/ethglobal-mumbai/houseful/packages/pass/test/payload.test.ts:12`; EC M, door-code.tsx:77; computed), 1.58 CSS px per module. Scanner caps jsQR frames at 720px (scanner.tsx:236). Likely unscannable. Stack the stub and size near 70vw.
- `~/ethglobal-mumbai/houseful/apps/web/src/components/ticket-stub.tsx:33,70`: no phone stacking; `min-w-[136px]` leaves 147px text width on /tickets, 123px on the /e receipt (`~/ethglobal-mumbai/houseful/apps/web/src/components/motion/ticket-print.tsx:15`). `BREAKFAST` (132px) overflows 123px (:41). Columns are 61.5px (:44,48): `Contemporary` (96px) and `Amphitheatre` (90px) hit the next column at 85.5px.
- `~/ethglobal-mumbai/houseful/apps/web/src/app/e/[slug]/page.tsx:40,53,59`: implicit grid track, no `min-w-0`, no `[overflow-wrap:anywhere]` (compare `~/ethglobal-mumbai/houseful/apps/web/src/app/v/[slug]/page.tsx:58`). A host word over about 16 letters widens the page; nothing clips overflow (`~/ethglobal-mumbai/houseful/apps/web/src/app/globals.css:24-46`).
- show-form.tsx:104,270,286: same track; metadataURI has 279px, 38 mono chars. A longer unhyphenated title widens the page.
- show-form.tsx:259: poster and "What your wallet signs" land after the submit button (:246).
- show-form.tsx:297 (15px), scanner.tsx:765 (14px): iOS zooms focused inputs under 16px.

**Moderate**
- `~/ethglobal-mumbai/houseful/apps/web/src/app/[city]/page.tsx:91,93`: 20+340+24 starts the second card at 384px: no peek, hidden scrollbar.
- ticket-stub.tsx:65: torn stub moves `x:70,y:180`; brief sideways scroll.
- `~/ethglobal-mumbai/houseful/apps/web/src/components/ticket-panel.tsx:274-281`: 127px SplitFlap leaves a 136px text column.
- `~/ethglobal-mumbai/houseful/apps/web/src/components/site-header.tsx:33,43,46,49`: nav and city switcher hidden; only footer links remain (`~/ethglobal-mumbai/houseful/apps/web/src/components/site-footer.tsx:21-30`).
- e/[slug]/page.tsx:42: 419px poster pushes the ticket panel below the fold.
- `~/ethglobal-mumbai/houseful/apps/web/src/components/event-poster.tsx:51,61`: on 260px cards, venue is 8.8px, subtitle 8.3px.

**Checked, fits:** ADMIT 302/327px (scanner.tsx:836); /mumbai h1 285/335px ([city]/page.tsx:68); `SHAAM-E-GHAZAL` 331/335px; ledger wallet nowrap 116/128px (`~/ethglobal-mumbai/houseful/apps/web/src/components/waitlist-ledger.tsx:139,144`); hash `break-all` (:121). No `<table>` in these pages. IDKit modal not assessed.

## Part 3: safe QA

**Load effects**
- `/e/[slug]` with chain id: creates `houseful.wallet.v1`; RPC reads every 4s, announced shows included (`~/ethglobal-mumbai/houseful/apps/web/src/lib/use-event-chain.ts:28,66`; `~/ethglobal-mumbai/houseful/apps/web/src/lib/device-wallet.ts:12-16`; ticket-panel.tsx:53,68).
- Waitlist: same wallet, every 8s (waitlist-ledger.tsx:79,93).
- `/tickets`: wallet plus `houseful.doorkey.v1`, every 6s (`~/ethglobal-mumbai/houseful/apps/web/src/components/ticket-wallet.tsx:38,86,93`). Bound tickets POST `/api/pass` (door-code.tsx:33).
- `/host`: wallet, every 8s (host-console.tsx:20,27).
- `/door/[slug]`: stored sync re-fetches by GET (scanner.tsx:298-301); camera is click-only (:670-673).
- `/mumbai`, `/door`, `/host/new`: none found.
- `/api/faucet`: never on load, only via `send()` (`~/ethglobal-mumbai/houseful/apps/web/src/lib/ticket-actions.ts:68`; device-wallet.ts:33).

**No dev bypass.** Grep found only `~/ethglobal-mumbai/houseful/apps/web/.env.example:12`, "Use staging with the simulator while developing". Verify always calls World (`~/ethglobal-mumbai/houseful/apps/web/src/app/api/world/verify/route.ts:37`; `~/ethglobal-mumbai/houseful/apps/web/src/server/world.ts:97`).

**Seeds:** none creates browser-owned tickets.
- `~/ethglobal-mumbai/houseful/apps/web/scripts/seed-chain.ts:43,49-54,108-125`: attester-signed holders and waitlists with discarded keys; no npm script. Appears already run [inference]: catalog has chain id 19, `monsoon-tapes-live-4134`, possibly QA residue visible on /mumbai.
- `~/ethglobal-mumbai/houseful/apps/web/scripts/seed.ts:1104-1107` deletes catalog rows; avoid.
- `~/ethglobal-mumbai/houseful/packages/contracts/scripts/seed-local.ts:12-19`: events only, different slugs.

**Filled states**
- Event: `/e/bijli-ka-bill-siddharth-kale` buy; `/e/chawl-no-9-prithvi` join; `/e/saltwater-weekender-jio-world-garden` announced.
- Line: `/e/chawl-no-9-prithvi/waitlist`, five rows, one left (seed-chain.ts:113-125).
- Door: "Sync this show" is a GET needing DOOR_ISSUER_SECRET_KEY (`~/ethglobal-mumbai/houseful/apps/web/src/app/api/door/[chainEventId]/sync/route.ts:45-46`). Paste any text: No entry flood, tallies, recents, localStorage only (scanner.tsx:338-350). "Reset this door" clears them (:391-397).
- Tickets: empty by default (ticket-wallet.tsx:117-126). The /how-it-works stub is hidden below lg (`~/ethglobal-mumbai/houseful/apps/web/src/components/how/ticket-journey.tsx:206,234`). Real fill [inference, untested]: throwaway script copying `seedFan` (seed-chain.ts:42-65) using a key placed in `houseful.wallet.v1` (device-wallet.ts:12-13); the contract checks only attester signature and sender (`~/ethglobal-mumbai/houseful/packages/contracts/contracts/Houseful.sol:541-543`). Leave 0.002 ETH to avoid the faucet (ticket-actions.ts:68). Then Bind, Copy code (door-code.tsx:123-131), paste for Admit. This writes to the local chain.
- Use localhost emulation: .env.example:7 points RPC at 127.0.0.1 (`~/ethglobal-mumbai/houseful/apps/web/src/lib/chain.ts:20`); camera needs a secure context (scanner.tsx:629) [inference for LAN phones].