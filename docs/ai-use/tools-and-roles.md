# Tools and roles

## Who did what

| Who | What they did |
| --- | --- |
| Founder (Yash Saraogi, the only team member) | The idea, the product and design rules, the commit standards, directing and testing the agents, accounts and keys, database seeding and the production deployment. See [human-contributions.md](human-contributions.md). |
| Cursor (agents) | Wrote most of the contract and the web app: scaffold, visual identity, the contract and its deployment scripts, checkout, wallet, waitlist, host console, door scanner, World ID sign-in, and the hosting setup. |
| Claude Code (CLI and subagents) | Hackathon research and planning, unit tests, the design of the Playwright end-to-end harness and many of its specs, independent QA runs including the World simulator run, documentation drafts (architecture, threat model, README), the Uniswap developer feedback, the poster layout fix, the Vercel configuration fix, and the submission material. |
| Codex (CLI) | Search and filters, the randomized contract invariant tests and a contract review, the worldwide catalog import and its notes, and the port of the Playwright harness into the main tree. |

## How the work was run

The three tools did not talk to each other. The founder ran Cursor agents in the main working tree, Codex in a separate git worktree that was later merged into main, and Claude Code from a command line session with subagents. Plans, briefs and specs moved between them as files and as text the founder pasted. The split of jobs and the product rules the founder set are in [plans/03-work-split-cursor-codex.md](plans/03-work-split-cursor-codex.md). The Claude Code plan for this project is [plans/02-claude-houseful-plan.md](plans/02-claude-houseful-plan.md).

## How commits were made

Every commit is authored under the founder's git identity, because the tools committed through it. Git history therefore does not say which tool wrote a given commit. [attribution-map.md](attribution-map.md) reconstructs that from the work split, the commit subjects and the evidence that exists.

### Commit trailers

Cursor's commit attribution added a `Co-authored-by: Cursor` trailer to the first 20 commits. The founder asked for no tool names in commit messages, so those 20 commits were rewritten before the first push to remove the trailer. Nothing else changed: the file contents are identical (the trees match) and the author dates were kept, so it is the same work in the same order. The original commits still exist in the local clone that made them. Later commits were made without trailers.

This note is here so that the removal is not mistaken for hiding AI use. The AI use is documented in this folder, in the README and in the submission form.

## About this folder

This folder was assembled by Claude Code on 7 November 2026 from files that already existed, plus the attribution map and this text. See [redaction-log.md](redaction-log.md) for what was changed on the way in.
