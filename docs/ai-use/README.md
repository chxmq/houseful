# AI use in Houseful

Houseful was built at ETHGlobal Mumbai (5 to 7 November 2026) by one founder directing AI coding tools. Most of the code was written by those tools. This folder records how: who did what, what the tools were told, and which planning documents sit behind the code. The event's rules ask for AI use to be documented and for specs, prompts and planning artifacts to be kept in the repository, so they are here.

## What is here

| Path | What it holds |
| --- | --- |
| [tools-and-roles.md](tools-and-roles.md) | The three tools and the founder, what each did, how commits were made, and a note about commit trailers |
| [attribution-map.md](attribution-map.md) | Which tool wrote which part of the repository, and what evidence exists for each claim |
| [human-contributions.md](human-contributions.md) | What the founder decided, wrote and did by hand |
| [plans/](plans/) | Planning documents, the Claude Code plan for this project, and the work split between Cursor and Codex |
| [prompts/workflows/](prompts/workflows/) | The orchestration scripts that carry the prompts given to the research, test, documentation and audit agents |
| [redaction-log.md](redaction-log.md) | Every change made to these files before publishing |

Outside this folder: the product specification is [docs/specs/v2.md](../specs/v2.md), and the job briefs and logs written during the build are in [docs/notes](../notes/). The AI use statement filed with the submission form says the same thing in short.

The plans are historical. They describe the project as it was when they were written. For example, the contract and World ID verification bugs listed in [plans/02-claude-houseful-plan.md](plans/02-claude-houseful-plan.md) were fixed afterwards, in commits `2026a81` and `0818844`.

## What is not here

- **Raw chat transcripts** of the three tools, about 50 MB together. They mix this project with account setup, credential handling and unrelated work, so they are not published. Organisers can ask for them.
- **The founder's typed prompts as separate files.** They have not been extracted and redacted. The decisions they carried are written down in [human-contributions.md](human-contributions.md) and in the product rules in [plans/03-work-split-cursor-codex.md](plans/03-work-split-cursor-codex.md).
- **Show research drafts**, four JSON files written by research agents. The data that was used is in `apps/web/scripts/data/catalog-drafts.json`.
- **Ten ideation and research scripts** from 6 November, written before the idea was chosen, and plans for unrelated projects.
- **A prototype that was never merged**: email and password login and a first Playwright stack, built in a scratch folder. Its Playwright harness was ported into `apps/web/e2e`. The password login was rejected because World ID is the login.
