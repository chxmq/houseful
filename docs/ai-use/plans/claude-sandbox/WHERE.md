# Claude CLI sandbox (not merged into main)

Product work landed in Claude's job dir, not on `houseful` main:

- App + password auth + Playwright harness:
  `~/.claude/jobs/333660b9/tmp/product/app`
  Commits `e7ba261`…`2ce6e40` (ahead of an old main; diverged from live Unichain/USDT work).
- Worldwide catalog drafts (JSON, copied here under `catalog/`):
  `~/.claude/jobs/333660b9/tmp/catalog`
- Docs drafts / phone QA:
  `~/.claude/jobs/333660b9/tmp/houseful-qa`
- Architecture/threat reports (copied here):
  `~/.claude/jobs/333660b9/tmp/reports`

Do not cherry-pick the password login as-is. Product rule: World ID is the login identity; any wallet pays; organiser settlement stays USDT under the hood; fans see dollar amounts.
