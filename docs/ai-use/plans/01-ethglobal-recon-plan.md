# ETHGlobal Mumbai: Hackathon Recon Plan

## Context
The user is at ETHGlobal Mumbai (https://ethglobal.com/events/mumbai) and wants a full analysis of the hackathon before choosing what to build. The output is documentation covering the rules, the schedule, every sponsor's prizes and requirements, and a recommendation on strategy. This is research only. No project code gets written in this phase.

## Approach
Run parallel research subagents. Each one uses Claude in Chrome, because the user is signed in and the event pages are JS-heavy. Each writes its findings to a file, so a resumed run doesn't redo finished work.

### Step 0: Setup (main agent)
- Create `~/ethglobal-mumbai/` with `raw/` (per-agent notes) and `docs/` (final docs).
- Load the Chrome tools in one ToolSearch call, then call `tabs_context_mcp`.
- Open the event page in a new tab. Map the nav (Overview, Prizes, Partners, Schedule, Rules, FAQ, Judging, Projects) so agents get exact URLs.

### Step 1: Parallel research agents (one message, one new tab each)
1. **Rules and logistics.** Event rules, eligibility, team size, what counts as "started before", AI-tool policy, code/commit rules, submission requirements (demo video length, repo, deck, deployed contracts), judging process and criteria, finalist rules, the code of conduct, and the FAQ.
2. **Schedule and deadlines.** Hacking start and end, submission cutoff, judging slots, workshops, mentor hours, ceremonies, meals and venue info. Everything is converted to IST with exact times.
3. **Sponsor prizes, group A.** The first half of the partner list, to avoid overlap. For each sponsor: prize pool and tiers, exact qualification requirements, required tech/SDK/APIs, bonus conditions, number of winners, the contact or booth, docs links, and past-winner patterns if visible.
4. **Sponsor prizes, group B.** The second half of the partner list, with the same fields.
5. **Past winners and trends** (optional). ETHGlobal showcase winners from recent events, for patterns in what wins.

Each agent writes to `raw/<topic>.md` and returns only a short summary. This keeps the main context small and makes resumes safe.

### Step 2: Synthesis (main agent)
Merge `raw/*` into `docs/`:
- `00-README.md`: index, TL;DR, key deadlines.
- `01-rules.md`: rules, eligibility, submission checklist, judging criteria.
- `02-schedule.md`: timeline in IST.
- `03-sponsors.md`: a table (sponsor, prize, requirements, tech, effort, fit), then a section per sponsor with source links.
- `04-strategy.md`: prize-stacking matrix (which sponsor tracks combine without conflict), a ranked shortlist of 3 to 5 directions, risks, and a build-hours timeline.
- `05-open-questions.md`: ambiguities to ask organizers or sponsors about at their booths.

Each claim carries a source URL. Anything uncertain is marked "unverified" instead of guessed.

### Step 3: Verification
- A separate agent spot-checks about 10 random claims in the docs against the live pages, mainly deadlines and prize amounts.
- Present the docs and the strategy options to the user, and confirm their team, skills and interests before narrowing down ideas.

### Step 4: Publish
- Offer to publish the docs as a private artifact, so the team can read them on a phone at the venue.

## Notes
- The user's quality bar is no AI slop. Docs must be specific and checkable, and every claim needs a source.
- Per project history, I will not select a project idea until the user approves the shortlist.
- If a page requires login or a dialog blocks the extension, stop and ask the user.
