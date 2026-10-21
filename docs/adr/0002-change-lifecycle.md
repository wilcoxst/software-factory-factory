# ADR 0002: Change lifecycle

- **Status:** Accepted (2026-10-21)
- **Deciders:** Stephen Wilcox
- **Source:** grilling for [add-spec-management](../../changes/add-spec-management/proposal.md) (G3, G8, G12, G17)

## Context

[ADR 0001](0001-spec-management-approach.md) separates living specs from changes but doesn't say how a change moves through PRs. That path affects three capabilities: `spec-management`, `coding`, and `verification`. It's also hard to change once skills and CI depend on it.

## Decision

1. **Trivial edits use one PR.** It edits the living spec directly, and the review model approves it after checking that no requirement or scenario changed meaning.
2. **Small and big changes use a proposal PR first.** It contains only `changes/<name>/`. Approving it is the approval of the change: the review model approves small changes, and a human approves big ones (the approval policy in the loop config). Once it merges, build can start.
3. **Then one or more implementing PRs build the change.** The last one archives it, merging the deltas into `specs/` and moving the folder to `changes/archive/`. Verification must pass before it can merge, so the living specs and the code land on main together.
4. **If the verifier decides the spec is wrong, the implementing PR is blocked.** The verifier drafts a change in `changes/`, linked from the PR. That draft goes through triage like any other request. The implementing PR stays blocked until the draft is accepted or rejected.

## Consequences

- Living specs on main never describe behaviour that hasn't been built. Approved changes waiting to be built are visible in `changes/`.
- A small or big change needs at least two PRs. That's extra ceremony, but approval of the design is kept separate from review of the code.
- The `coding` and `verification` capabilities must treat the archive step as part of the implementing PR, and must support blocking a PR on a linked draft change.
