# Redaction log

What was changed in each file on its way into this folder.

| Published as | Source | Changes |
| --- | --- | --- |
| `plans/01-ethglobal-recon-plan.md` | Claude Code plan file, 6 November 02:28 IST | Paths and dashes only (see below) |
| `plans/02-claude-houseful-plan.md` | Claude Code plan file, 7 November 00:10 IST | Paths and dashes only |
| `plans/03-work-split-cursor-codex.md` | `docs/notes/WORK-SPLIT.md`, which was kept out of version control until now | Paths and dashes, and a stray last line reading `EOF` removed |
| `plans/claude-sandbox/` | `docs/notes/claude-sandbox/*.md`, kept out of version control until now | Paths and dashes only |
| `prompts/workflows/` | The five Houseful workflow scripts from the Claude Code session | Paths and dashes only |
| `docs/evidence/world-staging-run/` | The staging run notes and seven screenshots | Paths shortened, a temporary folder path removed |

## The changes

1. The local home folder in file paths was replaced with `~`.
2. Em dashes and en dashes were replaced with commas or hyphens, because the project does not use them. No wording was changed otherwise.
3. Nothing else was edited, added or removed.

## What was checked

Every file was scanned for keys, tokens, passwords, email addresses and long random strings before it was copied. The scan found only public contract addresses, environment variable names, file paths and one test hash. Nothing was removed for being secret.

## What was left out

See [README.md](README.md#what-is-not-here).
