README written, not committed: `~/.claude/jobs/333660b9/tmp/houseful-qa/app/README.md`

**Tests run:** contracts 55 passing; pass 83 passed across 3 files. Web is marked PENDING(test-count).

**Blocker, seen in a browser:** after the second-wallet 409, the panel shows `World could not verify this request (failed_by_host_app).`, not the refusal text. IDKit's `onError` in `verify-human.tsx` overwrites it. The wallet balance stayed 0. The README marks this PENDING(cursor-fix), and the spoken line doesn't quote the screen. `docs/threat-model.md` doesn't mention it. Fix before recording.

**How I checked:** I walked the demo path on a private copy (ports 3101 and 8547) with World's bridge and verify API stubbed. That copy is stopped and deleted. Screenshots and scripts: `~/.claude/jobs/333660b9/tmp/houseful-qa/evidence/readme-walkthrough/`

**Judgement calls:**
- Door steps come after the hand-back, so the new holder is the one admitted.
- PENDING(cursor-fix) also marks the first-item nullifier check and attestation reuse.

**Check script:** it flagged only two items, both false positives: the commit hash and the runtime-composed env message, which I saw live on 3100.

**Clone state:** 3100 and 8546 are still up. The flagship on 8546 now shows 3 of 3 minted; I never wrote to that chain.