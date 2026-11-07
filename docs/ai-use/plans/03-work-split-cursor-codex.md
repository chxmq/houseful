# Work split, Cursor vs Codex

Live app: `~/ethglobal-mumbai/houseful` (this tree).
Codex worktree: `~/houseful-codex` (already pulled into main: search + contract invariants).
Claude CLI sandbox (never merged): see `docs/notes/claude-sandbox/WHERE.md`.

## Product rules (do not fight these)

- World ID = login identity (not email/password).
- Any wallet can pay.
- Organiser settlement = USDT only (under the hood).
- Fans see **dollar amounts**, not coin names. Pay controls: **Pay now** / **Pay with Ethereum**.
- One ticket per human per show.

## Already landed on main

- Unichain Sepolia Houseful v2, TestUSDT, seats, ETH→USDT buy, recover.
- Fan checkout polish, booth `/try`, minting animation.
- Codex: shareable `/search` + city filters; contract invariant + hostile-dep tests.
- Fan copy soft pass (no more “Pay in USDT / test USDT” in UI).

## Codex, take these next

Paste this block to Codex as its job list. Stay out of Cursor paths below.

1. **Worldwide catalog**
   - Draft JSON is at `docs/notes/claude-sandbox/catalog/*.json` (and the Claude job copy).
   - Wire into `apps/web/scripts/seed.ts` / catalog server so city pages are real worldwide inventory, not Mumbai-only demo.
   - Keep prices as dollar face values; do not put “USDT” in fan-facing catalog UI.

2. **Playwright harness (from Claude sandbox)**
   - Source: `~/.claude/jobs/333660b9/tmp/product/app/apps/web/e2e/{stack,support,harness,smoke,global-setup.ts}` + `playwright.config.ts` + `e2e` scripts in that `package.json`.
   - Rebase onto **this** main. Do not overwrite `e2e/chain/*` helpers blindly, chain helpers already match Pay now / Pay with Ethereum.
   - Ports: avoid 3000, 4801, 3100/3200/3210, 8546-8548 if Cursor is live; use the disposable stack’s own ports.

3. **README + architecture / threat docs**
   - Drafts: `~/.claude/jobs/333660b9/tmp/houseful-qa/{drafts,app}/README.md`, `docs/architecture.md`, `docs/threat-model.md`.
   - Re-read code at current HEAD before publishing. Mark anything unrun as PENDING. No overclaims.

4. **Do not ship Claude’s email/password login**
   - That sandbox auth (`server/auth/*`, `/login`, `/host/login`, password scrypt) fights World ID login.
   - Session cookie / account tables can be reused only if bound to a World nullifier, not email+password.

## Cursor, keeping these

- World ID as the real login (replace password plan).
- Wallet link / choose / delink on account.
- Host gating that uses the World-backed session.
- Any more chain/money/seats/Unichain checkout fixes.
- Fan-facing copy if coin names creep back.

## Claude CLI, what they actually did

| Where | What |
| --- | --- |
| `tmp/product/app` | Full password fan/host login, account page, Playwright disposable stack, smoke specs. **Diverged; not on main.** |
| `tmp/catalog` | Americas / APAC / Europe-MENA-Africa / India show JSON. |
| `tmp/houseful-qa` | README + architecture + threat drafts, phone QA copy. |
| `tmp/reports` | Planner / system map / threat notes. |
| Plans under `~/.claude/plans` | Early README/tests/docs share plan; unrelated to login. |

## Sync note for Codex worktree

After pulling main:

```bash
cd ~/houseful-codex
git fetch origin && git rebase origin/main
```

Origin of that worktree is this houseful repo.
