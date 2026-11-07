# What the founder did

This is the founder's own account, as filed in the AI use field of the submission form, checked against artifacts that exist in this repository or this folder. Where a point rests only on the founder's instructions in chat, it says so.

## Decisions

- **The idea and the product rules.** A ticketing app where every ticket belongs to one verified person and sells only at face value, with hand-back to a public waitlist instead of resale. Fans see dollar prices with test USDT underneath, can pay in ETH through Uniswap, and sign in with World ID. These rules are written down as "Product rules (do not fight these)" in [plans/03-work-split-cursor-codex.md](plans/03-work-split-cursor-codex.md) and carried into [docs/specs/v2.md](../specs/v2.md).
- **Which sponsors to build for.** World ID for identity and Uniswap for ETH payments, set by the founder as part of the scope. The Claude Code plan in [plans/02-claude-houseful-plan.md](plans/02-claude-houseful-plan.md) records the options that were weighed at the time.
- **World ID is the login.** A prototype with email and password login was built in a scratch folder and rejected, so it was never merged. The rejection is recorded in the work split.
- **The design rules and commit standards.** The founder set a list of design bans for the interface and a standard of small conventional commits, and held the agents to both. The commit subjects in the repository follow the standard.
- **No tool names in commit messages or in the product.** The founder's rule. It is why the commit trailers were removed from the first 20 commits (see [tools-and-roles.md](tools-and-roles.md#commit-trailers)). The AI use is documented here instead.

## Work done by hand

- Set up and signed in to the World developer portal (the app and its keys), GitHub, Vercel and Turso accounts that the agents used. The agents were not given passwords or private keys in chat. Keys live in local environment files.
- Ran the production database seeding and the production deployment.
- Directed the three tools, tested what they built, and decided what to cut when time ran short.

## Decisions recorded in chat only

These are not checkable from the repository. They are in the chat transcripts, which are not published (see [README.md](README.md#what-is-not-here)): deciding to keep the project on World ID login after the password prototype existed, cancelling a verification pass to spend the time on code, and deferring ENS until the core work was finished.
