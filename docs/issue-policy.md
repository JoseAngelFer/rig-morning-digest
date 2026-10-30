# Morning digest issue policy

Approved by the human for `plan:morning-digest`:

- Split: shared contract; reader; page; JSON; board links; route tests; review preview; cleanup.
- Every issue opens with `Source: plan.md § <section>`.
- Every issue carries the `plan:morning-digest` label.
- Required sections: Scope, Done when, Blocked by, **Acceptance tests**.
- Human chose final job status counts on the board, not event totals. A retried job that recovered counts as ok.
- The four section-2 workers may start once the shared types commit exists. Reader and route integration are final-check dependencies, not blanket start dependencies.
- One worker and separate branch/worktree per issue. Follow the closing-comment format in `AGENTS.md`; leave issues open until their done conditions actually hold.
- Publication and later replacement without the marker require separate human approval. Cleanup waits for the review, not merely submission.
- The course reviewer requires the preview issue to remain open until they have looked. Sending the link is not enough to close it, even though the original plan's wording says "sent".

The shared `plan-to-issues` skill remains at `.agents/skills/plan-to-issues/SKILL.md`. Pi supports this location natively; run Pi from this repo, or use `--skill` pointing to this directory. Do not copy the skill into a harness-specific folder.
