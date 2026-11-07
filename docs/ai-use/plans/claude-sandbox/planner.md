At HEAD 7c6c6da: clean tree, no hooks, no remote. Nothing below was run. Roots: R=~/ethglobal-mumbai/houseful, W=R/apps/web/src, N=~/ethglobal-mumbai/docs, IK=R/node_modules/.pnpm/@worldcoin+idkit@4.6.0_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@worldcoin.

## 1. Order and concurrency

First tell Cursor our file list. B install and commit 1 go next, closing the only shared-file window; tests follow, because R/apps/web/tsconfig.json:27 typechecks `**/*.ts` and an unresolved `vitest` import would break Cursor's typecheck. Then draft A and D while QA capture runs; neither touches the index. Commit D, then A, then C fixes one at a time. Only the main session commits.

```sh
cd ~/ethglobal-mumbai/houseful
g() { git --no-optional-locks --literal-pathspecs "$@"; }
P=('apps/web/src/app/e/[slug]/page.tsx')     # exact paths
g diff HEAD -- "${P[@]}"                     # only our hunks
S=$(g diff --cached --name-only)             # Cursor's staged set
g add -N -- "${P[@]}"                        # new files only
g commit --only -m "fix(web): ..." -- "${P[@]}"
g show --name-only --format='%h %s' HEAD     # must equal P
[ "$S" = "$(g diff --cached --name-only)" ]  # else inspect
```

`--only` ignores what others staged but takes the whole working file: if the diff shows Cursor's hunks, wait. `-N` stores no content, so Cursor's plain commit cannot take our file [inference; fallback `git add`].

Forbidden: `stash`, `reset`, `restore`, `checkout --`, `clean`, `add -A`, `commit -a`, `--amend`, `rebase`, `push`, `--no-verify`. Never stage R/apps/web/AGENTS.md; next dev rewrites it (:7).

On index.lock or `cannot lock ref`, nothing changed: wait with a Monitor until-loop, rerun the preflight. Never `rm` the lock. After 2 minutes, run `lsof .git/index.lock` and ask Cursor or the user.

## 2. Commit ladder

Paths relative to R; Claude trailer on each, mirroring `Co-authored-by: Cursor` on all 20 commits.

1. `chore(web): add vitest for unit tests`: apps/web/package.json, pnpm-lock.yaml. `CI=1 pnpm --filter web add -D vitest@^5.1.0 --reporter=append-only`
2. `test(web): pin draft hash, schedule and validation`: apps/web/package.json (`"test": "vitest run"`), apps/web/test/event-draft.test.ts
3. `test(web): cover price, date and address formatting`: apps/web/test/format.test.ts
4. `docs: add architecture overview and diagrams`: docs/architecture.md
5. `docs: add threat model`: docs/threat-model.md
6. `docs: add README with setup and AI attribution`: README.md
7. `docs: add World ID rationale, debrief and demo script`: README.md
8. `fix(web): stack ticket stub and enlarge door code on phones`: apps/web/src/components/ticket-stub.tsx, apps/web/src/components/door-code.tsx
9. `fix(web): contain long names on the event page`: apps/web/src/app/e/[slug]/page.tsx
10. `fix(web): contain the host form preview on phones`: apps/web/src/components/host/show-form.tsx
11. `fix(web): stop phones zooming into form inputs`: apps/web/src/components/host/show-form.tsx, apps/web/src/components/door/scanner.tsx
12. `fix(web): show the next rail card on phones`: apps/web/src/app/[city]/page.tsx
13. `docs: record the testnet and World ID runs`: README.md, docs/architecture.md, docs/threat-model.md

8-12 need a reproducing measurement; other confirmed bugs take this shape. 13 needs real outputs. The test script waits for commit 2, keeping `pnpm -r test` (R/package.json:12) green [inference: vitest fails an empty suite].

## 3. Docs

Every fact is re-read in code at a recorded SHA; docs cite symbols, not lines.

README.md:
- What it is; status (local Hardhat only, R/packages/contracts/deployments/31337.json); real/seeded/pending table (system-map 7); architecture (2-3); run locally with traps (5), proven in the clone; tests, counts only from real output.
- World ID: the event is taking a scarce fixed-price seat; rule from W/lib/assurance.ts:10-20; limits stated: preset client-only (W/components/verify-human.tsx:111), server never compares (W/app/api/world/verify/route.ts:37).
- Alternative path: same person, second wallet, refused, nothing charged (verify/route.ts:52-57; W/components/ticket-panel.tsx:260-265).
- Debrief: friction marked "from integration, no live run": close missing onError (verify-human.tsx:131); ProofOfHuman forcing legacy (IK/idkit-core/dist/index.js:2730-2733) against verify-human.tsx:142.
- AI attribution from `git log` trailers; human work from the user.
- Demo table: route, action, spoken line, target time; human voice, desktop recording (N/01-rules.md:48-49); discloses seeded holders skipped World ID (R/apps/web/scripts/seed-chain.ts:42-65).

docs/architecture.md: system flowchart, buy sequence, door sequence, each opening `%%{init: {"theme":"neutral"}}%%`, no `classDef`.

docs/threat-model.md: attacker table (stops, does not stop, residual), verbatim test names, open issues; bug 1 as a class, no recipe, until fixed.

Greppable markers until Cursor's run:
- `PENDING(world-run)`: portal app, successful verification, time to first success, live friction, missing capability, one improvement, alternative-path recording, re-verification after hand-back, legacy Orb behaviour.
- `PENDING(testnet)`: 4801 address, explorer links, hosted URL.
- `PENDING(user)`: human contributions, planning artifacts.

Until then no production claims; unrun at submission reads "Not run before submission."

## 4. QA

Scratch instance: clone R to /tmp/houseful-qa/app, frozen install, `.env.local` from `.env.example` with a fresh door key, own Hardhat on :8546 (`LOCAL_RPC_URL`, R/packages/contracts/hardhat.config.ts:17), db:reset and seed-chain there only, `next dev --port 3100`. Stop only our PIDs. If Cursor objects: :3000 stateless states only.

Viewing: cached chromium_headless_shell-1254, throwaway profile, CDP from a /tmp Node script: `Emulation.setDeviceMetricsOverride` 375x812, DPR 3, mobile, touch. Exploring: Claude in Chrome injects a 375px same-origin iframe into localhost:3100/door (no frame headers; no touch or iOS zoom). Avoid :3000 there: wallets are per origin.

States: /mumbai; /e/bijli-ka-bill-siddharth-kale buy, /e/chawl-no-9-prithvi join, /e/saltwater-weekender-jio-world-garden announced, /e/chawl-no-9-prithvi/waitlist, blank-key verify failure (ticket-panel.tsx:238); /tickets empty, bound via clone-only script copying seedFan (seed-chain.ts:42-65) [inference until run], hand-back tear; /host/new empty, long unbroken title, full preview; /door and /door/<slug> unsynced, synced, rejection flood, admit via Copy code.

On :3000: links, typing without submit, "Sync this show" (GET, W/app/api/door/[chainEventId]/sync/route.ts:37), pasting codes (local only, W/components/door/scanner.tsx:338-350). Never Verify, Bind, Hand back, Leave, Cancel, Withdraw, List, camera; CDP `Fetch` fails POSTs to /api/world, /api/faucet and `eth_sendRawTransaction`. On :3100, anything but a World scan; scripted attestations never become doc evidence.

Evidence: /tmp/houseful-qa/evidence/<route>-<state>-<before|after>.png plus metrics.json (scrollWidth vs clientWidth, elements past 375 outside scrollers, inputs under 16px, QR px per module). Uncommitted; commit bodies quote numbers. Each fix reruns 375, 640, 1280, and all TicketStub callers (ticket-panel.tsx:199, W/components/ticket-wallet.tsx:223, W/components/how/ticket-journey.tsx:234).

Off-limits root cause: no edit, no masking such as global overflow clipping. Log route, screenshot, file:line, proposed diff for Cursor; continue. Non-layout finds (`ETH ETH`, W/components/host/show-form.tsx:274; phone nav, W/components/site-header.tsx:43-49): report only.

## 5. Verification

B: `pnpm --filter web test` under `TZ=UTC`, `America/Los_Angeles`, `Pacific/Kiritimati`; hash pinned against hand-written sorted JSON; clone-only mutations (drop the sort at W/lib/event-draft.ts:46) must fail. Typecheck failing only in Cursor's dirty files: confirm in the clone.

C: `scrollWidth` 375 after each fix, desktop unchanged.

A, D facts: a fresh subagent without the reports extracts every factual sentence, returns CONFIRMED, WRONG or UNSUPPORTED with file:line; fix or delete non-confirmed. Mechanical: backticked paths `test -e`; test names and UI strings `git grep -F`; env vars, pnpm scripts, routes and slugs checked against source; README steps run in the clone. Re-check `git diff <SHA>..HEAD --stat` after Cursor's last commit.

Banned:
```sh
perl -CSD -ne 'print "$ARGV:$.:$_" if /\x{2014}|purple|violet|lilac|gradient|glass|glow|bento|\bInter\b|Geist|Lucide|sparkle|lorem|testimonial|dot.grid|pricing tier|hover/i || /^#.*[^\x00-\x7F]/' README.md docs/*.md
```
Same over commit messages and added lines of `git diff <base>..HEAD -- apps/web/src`, plus `hover:|backdrop-blur|indigo|fuchsia`. Render each Mermaid block in the throwaway browser; confirm no purple-hue fills.

## 6. Final report

Both get SHAs, test output, QA table, evidence path, handoff diffs, remaining PENDING lines.

Bugs for Cursor (read, not exercised):
1. Critical [docs]: verify trusts the first proof and top-level `success` (W/server/world.ts:90,108,116).
2. High: credential never checked server-side (verify/route.ts:37).
3. High [inference]: a thrown `handleVerify` becomes `failed_by_host_app`, overwriting already-holds text (verify-human.tsx:105-106,146-149; IK/idkit/dist/index.js:2155,2179); breaks the alternative-path demo.
4. High: /tickets hides refunds after endsAt (W/app/tickets/page.tsx:11).
5. Threats bugs 4-9; QR 1.58px per module, likely unscannable [inference] (W/components/door-code.tsx:89).
6. Overclaims: W/lib/assurance.ts:12, W/app/tickets/page.tsx:32-33, W/app/how-it-works/page.tsx:26, W/app/e/[slug]/waitlist/page.tsx:43-45, W/lib/device-wallet.ts:20.
7. Banned hits already present: W/app/globals.css:51,58; W/components/motion/stamp.tsx:23; W/components/site-header.tsx:24; AGENTS.md:7.

Blocked: real verification, time to first success, testnet, off-limits fixes, real-phone scan, iOS zoom, GitHub rendering (no remote).

Eligibility risks:
- 20 of 20 commits co-authored by Cursor, one human author; AI-reliant projects may lose eligibility (N/01-rules.md:75). Only the user can state the human work.
- Planning artifacts sit outside the repo (sibling ideation/); N/01-rules.md:76 wants them inside if spec-driven. User decides.
- All commits span 21:59 to 23:00 on 6 Nov, some same-second; N/01-rules.md:47 warns against dumps. No history rewrite.
- No remote, no LICENSE; public open source required (N/01-rules.md:46).
- IDKit prize needs a server-side or on-chain credential check (N/03-sponsors.md:84); bugs 1-2 undercut it.
- Commits stop by 09:00 IST (N/01-rules.md:83).

### Critical Files for Implementation
- ~/ethglobal-mumbai/houseful/apps/web/src/lib/event-draft.ts
- ~/ethglobal-mumbai/houseful/apps/web/src/components/ticket-stub.tsx
- ~/ethglobal-mumbai/houseful/apps/web/src/components/verify-human.tsx