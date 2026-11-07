# Attribution map

Which tool wrote which part of the repository, and what each claim rests on.

## Limits

- All commits are under the founder's git identity, so the history does not name the tool. Only the first 20 commits carried a tool trailer, described in [tools-and-roles.md](tools-and-roles.md#commit-trailers).
- "Written by" names the tool that wrote the first version. Almost every file was later changed by more than one tool, directed by the founder.
- Where the basis is only the work split or the commit subjects, the table says so. Where nothing is recorded, it says "not recorded". Nothing here is guessed.

## The first 20 commits (Cursor)

These carried `Co-authored-by: Cursor` when they were made. The public hash is what is on GitHub; the original hash exists only in the clone that made the commit, and the two trees are identical.

| # | Original | Public | Subject |
| --- | --- | --- | --- |
| 1 | 43e98bc | a24eb2d | chore: scaffold pnpm monorepo with Next.js 16 web app |
| 2 | 3663ead | 0f592e1 | feat(web): visual identity, typography and generated event posters |
| 3 | 7e2c5c5 | 82d77f0 | feat(web): motion primitives for flaps, stamps, printing and tearing |
| 4 | 60d7a87 | b70e422 | feat(contracts): surrender-only ticket registry with public waitlist |
| 5 | 03d800a | 0520c95 | feat(web): catalog schema and seeded city guide |
| 6 | 6fd45cf | 96bb6b4 | feat(pass): offline door credentials with rotating holder codes |
| 7 | bb21e10 | d1cc823 | feat(web): city discovery page |
| 8 | 8488715 | 409e9a1 | feat(web): World ID verification and contract attestations |
| 9 | cb0faa2 | c50eac6 | feat(web): event page and on-device checkout |
| 10 | 1dc68a6 | d229d00 | feat(web): ticket wallet with rotating door codes and hand-back |
| 11 | ff8e629 | f70bb0b | feat(web): public waitlist with in-browser order verification |
| 12 | f1bf49b | 0007e51 | fix(contracts): revoke door codes when a ticket moves to another device |
| 13 | 58a9f98 | 6261f89 | refactor(web): share one server-side chain client |
| 14 | 7973d90 | c5e6d6c | feat(web): host console for listing and running shows |
| 15 | e7a2aba | dc59544 | feat(web): claim refunds for cancelled shows from the wallet |
| 16 | f4445db | 1fba581 | feat(web): offline door scanner |
| 17 | a198f0e | e973b2d | fix(web): point holders of a cancelled show to their refund |
| 18 | a9469c7 | 6385657 | feat(web): city, category, venue and host pages |
| 19 | 7f5319a | 2a0c9c6 | feat(web): how it works, told through one ticket |
| 20 | 7c6c6da | 9fc5da6 | fix(web): report a closed World ID prompt as cancelled |

The public hashes in this table are the first 20 commits on `main`, in order.

## By path

| Path | Written by | Basis |
| --- | --- | --- |
| `packages/contracts/contracts/`, `packages/contracts/scripts/`, `packages/contracts/test/Houseful.test.ts`, `packages/contracts/test/helpers.ts` | Cursor | Trailers on commits 4 and 12 above; work split ("chain, money, seats, checkout fixes" stay with Cursor); the v2 contract commits `404b70e` and `d6f4971` |
| `packages/contracts/test/invariants/`, `docs/notes/contract-review.md`, `docs/notes/work-plan.md` | Codex | Work split ("contract invariant and hostile-dependency tests"); added in `ae1ea87` |
| `packages/pass/` | Cursor | Trailer on commit 6 above |
| `apps/web/src/` | Cursor, except search and filters (Codex) and poster layout (Claude Code) | Trailers on commits 1 to 3, 5, 7 to 11 and 13 to 20 above; `ebd8a2f` for search; `3713355` for the poster layout |
| `apps/web/scripts/worldwide-catalog.ts`, `apps/web/scripts/data/`, `docs/notes/catalog-import.md` | Codex for the import code and its rules. The research drafts behind the data were written by Claude Code research agents | Work split; `f8b41c7` |
| `apps/web/test/event-draft.test.ts`, `apps/web/test/format.test.ts`, `apps/web/test/poster-layout.test.ts` | Claude Code | `c58af5a`, `79e971e`, `3713355` |
| `apps/web/test/search-query.test.ts`, `apps/web/test/catalog-draft.test.ts` | Codex | Added with `ebd8a2f` and `f8b41c7` |
| `apps/web/e2e/` | The harness (disposable stack, World ID stubbed at the network edge, injected test wallet) was designed by Claude Code and ported into main with Codex. Specs were written and repaired by Claude Code agents, Codex and Cursor | Work split, item 2; the `test(e2e)` commit subjects. Per-spec attribution is not recorded |
| `docs/architecture.md`, `docs/threat-model.md` | Drafted by Claude Code, checked against the code and published by Codex (`81c1a6e`), edited since by Cursor and Claude Code | Work split, item 3 |
| `README.md` | Drafted by Claude Code, edited by Codex and Cursor. This version by Claude Code | Commit history of the file |
| `FEEDBACK.md` | Claude Code, from the log Cursor kept in `docs/notes/uniswap-friction.md` | `da6603a` |
| `docs/specs/v2.md`, `docs/notes/uniswap-friction.md`, `docs/notes/hosting.md` | Cursor | `a070cc2`; working notes kept by Cursor |
| `vercel.json`, `docs/ai-use/`, `docs/evidence/`, `docs/images/` | Claude Code | The commits that add them |
| Everything else | Not recorded | |
