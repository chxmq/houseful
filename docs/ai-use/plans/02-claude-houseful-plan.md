# Plan: Claude CLI's share of Houseful (tasks A to D), and Cursor's work

Updated Sat 7 Nov, 00:10 IST. Submissions close 09:00 IST, target 07:00.

## Context
Cursor built Houseful in `~/ethglobal-mumbai/houseful` (20 local commits at `7c6c6da`, no remote, clean tree, nothing new since 23:00). Cursor's status gives me four tasks that don't overlap with its work: A README, B unit tests, C 375px phone pass, D `docs/`. Nothing has been changed yet.

Approving this plan means I may edit and commit the files below, and start a throwaway copy of the app for testing. No pushing, no accounts, no changes to Cursor's running servers or database.

**New rule from you:** no Claude or Cursor insignia. No `Co-authored-by` lines, tool names or badges in commits or the product. The one place the tools are named is the AI section of the README and the form's AI field, because ETHGlobal's rules require saying which tools were used and where.

## Work to give Cursor
```
From Claude CLI. Work for you, in this order. I read the code for these and ran nothing.

1. NO TOOL BRANDING. Turn off Cursor's commit attribution in settings. No Co-authored-by lines or tool names in any commit from now on. The tree is clean and there's no remote, so remove the trailer from the existing 20 commits now, keeping their dates:
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --msg-filter "sed '/^Co-authored-by: Cursor/d'" -- main
Check that `git diff 7c6c6da HEAD` is empty and `git log --format=%B | grep -c Co-authored-by` prints 0. Tell the user when it's done, because I start committing after that.

2. BEFORE YOU DEPLOY, since the contract can't change afterwards. Attestations have no nonce. leaveWaitlist frees the nullifier (Houseful.sol:259) and _admit only checks the deadline (:537-544), so one signature can loop join and leave for 15 minutes, adding dead slots. _nextWaiter (:555-563) can't resume across transactions, so enough dead slots make every surrender revert for good. Fix it and add a test, or accept it knowingly and tell me, so the threat model says so.

3. CRITICAL, one person one ticket can be bypassed. apps/web/src/server/world.ts:90,108,116. verifyWorldProof takes the nullifier and signal hash from the first item in responses, then checks only top-level success. World's docs say a 200 means "At least one proof verified successfully", with per-item results. A client-built list with an invented first item plus one real proof could earn attestations for made-up nullifiers. Fix: require exactly one response, and take the nullifier from a successful entry in the verify response's results.

4. WORLD'S PRIZE NEEDS THESE. The required credential is only set in the browser (verify-human.tsx:111), and verify/route.ts never compares it with world.ts:117, so a Selfie proof can buy a Proof of Human show. Also, verify-human.tsx:105-106 throws after onFailed, and IDKit seems to call onError with failed_by_host_app (146-149), replacing "already holds a ticket" with a generic code message. That refusal is the alternative path the prize wants shown.

5. DEPLOY. The operator has 0.5 ETH on World Chain Sepolia and 99.5 on Ethereum Sepolia (balances read at 00:08), so you're unblocked. seed-chain.ts:74-76 skips existing event ids, so seed straight after deploying and check who hosts each show. Then Vercel plus Turso and production env.

6. REAL WORLD ID RUN once the user has the portal keys. Record one successful verification and one refusal. Send me the time to first success, the friction you hit, what was missing from the docs, the contract address, explorer links and hosted URL. The README needs them, and I won't claim any of it until then.

7. PRODUCT GAPS.
- app/tickets/page.tsx:11 lists upcoming Mumbai shows only, so after endsAt, waitlist money and cancelled-show refunds vanish from the UI though the contract still pays.
- The 0.02 ETH faucet drip can't fund a fresh wallet for shows above about Rs 5,400 (faucet/route.ts:8).
- A new browser gets a new wallet and sees nothing, and re-verifying says already holds. There's no wallet export, so moving a ticket to a new phone looks impossible on real devices. Add export and import, or drop the claim.
- No service worker or manifest, so reloading /door offline should fail. Add one, or never reload in the demo.

8. COPY THAT OVERCLAIMS. assurance.ts:12 and how-it-works/page.tsx:26 ("no resale margin", yet a wallet key can be sold). tickets/page.tsx:32-33 (a screenshot works on a fresh scanner for 20 to 40 seconds). waitlist/page.tsx:43-45 ("verified human", yet seeded rows skipped World ID). device-wallet.ts:20 (tickets are bound to the wallet).

9. SMALL. backdrop-blur at site-header.tsx:24 goes against the no-glass rule. "ETH ETH" at show-form.tsx:274 and host-console.tsx:128. A Devanagari title makes an empty slug and submit silently does nothing (show-form.tsx:74,83,87-88).

10. LAST. Add an MIT LICENSE. Push once gh auth refresh is done, then push after each logical group of commits.

Stay out of README.md, docs/ and apps/web/test/, which are mine. I'll also touch apps/web/package.json and pnpm-lock.yaml to add vitest, and for phone layout only: components/ticket-stub.tsx, door-code.tsx, host/show-form.tsx, door/scanner.tsx, app/e/[slug]/page.tsx, app/[city]/page.tsx. Tell the user if you're mid-edit in any of them.
```

## Order of my work
1. Save your no-insignia rule and the Houseful status to memory.
2. Wait until Cursor's history cleanup is done, confirmed by `git log`, so nothing of mine lands mid-rewrite.
3. Commit 1, so the shared lockfile window closes quickly, and check `:3000` still answers afterwards.
4. Tests, commits 2 and 3.
5. At the same time: draft the docs (no git use) and run the phone capture on a throwaway copy.
6. Commit docs, then phone fixes one at a time.
7. Independent checks, then the report.
8. Commit 13 only once real testnet and World ID results exist.

Drafting and checking run as workflows with subagents. Only this session commits.

## Commit ladder
Commit messages name no tools and carry no trailers. The author is your git identity.

| # | Message | Paths |
|---|---|---|
| 1 | `chore(web): add vitest for unit tests` | `apps/web/package.json`, `pnpm-lock.yaml` |
| 2 | `test(web): pin draft hash, schedule and validation` | `apps/web/package.json` (test script), `apps/web/test/event-draft.test.ts` |
| 3 | `test(web): cover price, date and address formatting` | `apps/web/test/format.test.ts` |
| 4 | `docs: add architecture overview and diagrams` | `docs/architecture.md` |
| 5 | `docs: add threat model` | `docs/threat-model.md` |
| 6 | `docs: add README with setup and AI attribution` | `README.md` |
| 7 | `docs: add World ID rationale, debrief and demo script` | `README.md` |
| 8 | `fix(web): stack ticket stub and enlarge door code on phones` | `components/ticket-stub.tsx`, `components/door-code.tsx` |
| 9 | `fix(web): contain long names on the event page` | `app/e/[slug]/page.tsx` |
| 10 | `fix(web): contain the host form preview on phones` | `components/host/show-form.tsx` |
| 11 | `fix(web): stop phones zooming into form inputs` | `components/host/show-form.tsx`, `components/door/scanner.tsx` |
| 12 | `fix(web): show the next rail card on phones` | `app/[city]/page.tsx` |
| 13 | `docs: record the testnet and World ID runs` | `README.md`, `docs/*` |

Commits 8 to 12 come from reading the code. Each happens only if a measurement reproduces it, and other confirmed layout bugs take the same shape.

## Sharing a checkout with Cursor
```sh
g() { git --no-optional-locks --literal-pathspecs "$@"; }
g diff HEAD -- "${P[@]}"          # must show only my hunks, otherwise wait
S=$(g diff --cached --name-only)  # what Cursor has staged
g add -N -- "${P[@]}"             # new files only
g commit --only -m "..." -- "${P[@]}"
g show --name-only --format='%h %s' HEAD   # must equal my paths
[ "$S" = "$(g diff --cached --name-only)" ] # Cursor's staging untouched
```
Before each commit: `pnpm --filter web typecheck` and eslint on changed files.

Never used: `stash`, `reset`, `restore`, `checkout --`, `clean`, `add -A`, `commit -a`, `--amend`, `rebase`, `push`, `--no-verify`. Never stage `apps/web/AGENTS.md`, because `next dev` rewrites it. On `index.lock`, wait and retry, never delete it. After 2 minutes, check who holds it and report.

## B. Unit tests
Add `vitest@^5.1.0` with `CI=1 pnpm --filter web add -D vitest@^5.1.0 --reporter=append-only`. Tests go in `apps/web/test/`, matching `packages/pass/test/`. No config is needed.
- `event-draft`: reversed keys give the same hash; hash pinned against hand-written sorted JSON; lineup order changes it; each of the 18 fields changes it; schedule maths including the `surrenderCutoff` clamp (only reachable by calling `draftSchedule` directly); `chainParams`; `slugify`; schema boundaries.
- `format`: Indian grouping; dates and times; timezone independence; `formatEth` truncation, zero, string input, digits; `shortHex`; every category has a label.
- Known bugs are reported, not pinned as correct. I won't change `canonical` or `draftHash`, because live hashes depend on them.

## A and D. README and docs
Every fact is re-read in the code at a recorded commit. Docs cite symbols, not line numbers.
- **`README.md`:** what it is; status; a real, seeded and pending table; architecture summary; run locally, including known traps; tests with counts from real output; AI attribution as plain text, with no logos or badges.
- **World ID section:** the trust moment is taking a scarce fixed-price seat; why that credential is the minimum (`lib/assurance.ts`), with its limits stated; the alternative path (same person, second wallet, refused, nothing charged); the four debrief items World requires.
- **Demo script:** 3 minutes, as a table of route, action, spoken line and time. Your voice, recorded on a computer. It says seeded holders skipped World ID.
- **`docs/architecture.md`:** system flowchart, buy sequence, door sequence. Each diagram sets `%%{init: {"theme":"neutral"}}%%`, because Mermaid's default is lilac.
- **`docs/threat-model.md`:** each attacker with what stops them, what doesn't, what's left, and the test that proves it. Includes the 20 to 40 second screenshot window, unsynced doors, lost wallets and compromised keys. The critical bug is described as a class with no recipe until it's fixed.
- **Nothing unproven gets claimed.** Greppable markers stay until real results exist: `PENDING(world-run)` (including time to first success), `PENDING(testnet)`, `PENDING(user)`. Anything still unrun at submission becomes "Not run before submission."

## C. Phone pass at 375px
- **Throwaway copy:** clone into `$CLAUDE_JOB_DIR/tmp/houseful-qa`, with env from `.env.example` only, its own Hardhat on `:8546`, its own database and seed, and `next dev --port 3100`. It never touches `:3000`, `:8545` or Cursor's database. I stop only my own processes.
- **Viewing:** the cached Playwright Chromium over CDP at 375x812, DPR 3, touch on. Fallback: Claude in Chrome with a 375px same-origin iframe.
- **States:** `/mumbai`; `/e/bijli-ka-bill-siddharth-kale` (buy); `/e/chawl-no-9-prithvi` (join) and its waitlist; `/e/saltwater-weekender-jio-world-garden` (announced); `/tickets` empty and with a ticket; `/host/new` empty, long title, full preview; `/door` and `/door/<slug>` unsynced, synced, rejected, admitted.
- **Filled tickets without World ID:** a script kept only in the copy, based on `seedFan` in `scripts/seed-chain.ts`. It is never committed and never used as evidence in the docs.
- **Biggest expected problem:** the door QR is 96.5px at 375px wide (`door-code.tsx:89`), about 1.6px per module, and is probably unscannable.
- **Evidence:** before and after screenshots plus `metrics.json` (page overflow, elements past 375px, inputs under 16px, QR pixels per module). Every fix is rechecked at 375, 640 and 1280, and in every place `TicketStub` is used.
- **Off-limits causes:** if a fix would land in `packages/contracts`, `.env*`, `server/env.ts`, `lib/ticket-actions.ts`, `app/host`, `app/tickets` or `app/door`, I don't edit or mask it. Cursor gets the file, line, screenshot and proposed diff. Non-layout finds are report-only.

## Verification
- **Tests:** `pnpm --filter web test` under `TZ=UTC`, `America/Los_Angeles` and `Pacific/Kiritimati`. In the copy only, removing the key sort must make tests fail.
- **Docs:** a fresh subagent with no prior reports marks every factual sentence CONFIRMED, WRONG or UNSUPPORTED against the code. Anything not confirmed gets fixed or deleted.
- **Mechanical:** paths exist; test names, UI strings, env vars, scripts and routes are grepped; README setup steps run in the copy; `git diff <sha>..HEAD --stat` is rechecked after Cursor's last commit.
- **Banned list:** a scan of docs, commit messages and my added code for em dashes, tool names in commits and the other banned items. Mermaid blocks are rendered and checked for purple.
- **Phone:** `scrollWidth` is 375 after each fix, and desktop is unchanged.

## What only you can do
- Create the World portal app and give Cursor the keys. Without them, no real purchase can go through.
- Run `gh auth refresh -h github.com`.
- Say what you personally did. The rules warn that fully AI-made projects may lose partner prizes and finalist eligibility, and removing the trailers doesn't change that. I'll pre-fill what I saw (you proposed the World ID ticket idea, set the platform scope, the banned list and the commit rules) for you to correct.
- Record the video in your own voice.

## Flags
- **Trailers versus disclosure:** rewriting commit messages is fine because the rules only ask for attribution in the submission, and the dates and code stay the same. Leaving AI use out of the README and the form as well would put eligibility at risk, so the README section stays.
- **Sponsors:** World is the only one right now, and its IDKit prize is $1,250 for up to 2 teams. My view: Uniswap no longer fits, since buying is fixed-price on World Chain Sepolia and the earlier docs check only found its auction on Ethereum Sepolia, so I'd drop it. Arkiv could still mirror public listings and waitlists; the last sensible start is about 03:00.
- **Planning files:** research stays out of the repo by default, because it's yours to publish. The inclusion rule applies to spec-driven tools; I don't know if Cursor used any.
- **Commit history:** the two biggest commits are mostly lockfile and generated ABI, so they're fine. All 20 are within about an hour and will arrive in one first push, so push soon and regularly after that. The only rewrite is the trailer removal above.
- **Deadline:** commits stop by 09:00 IST.

## Final report
Commit hashes, test output, the phone results table, evidence path, handoff diffs for Cursor, all remaining bugs, remaining `PENDING` lines, and anything I couldn't verify (real phone scan, iOS zoom, GitHub rendering).
