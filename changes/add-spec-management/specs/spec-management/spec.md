# Delta: spec-management

New capability: how requests become specs, how specs change, and how they're checked. The format and folder layout come from [ADR 0001](../../../../docs/adr/0001-spec-management-approach.md), the PR flow from [ADR 0002](../../../../docs/adr/0002-change-lifecycle.md). The decisions behind each requirement are in the [proposal](../../proposal.md) (G1–G17).

## ADDED Requirements

### Requirement: Spec layout
The factory SHALL keep a target project's specs as plain markdown in that project's repo: `GLOSSARY.md`, `docs/adr/NNNN-<title>.md`, an overview in `spec.md`, living specs in `specs/<capability>/spec.md`, in-flight changes in `changes/<change-name>/`, and finished changes in `changes/archive/YYYY-MM-DD-<change-name>/`.

#### Scenario: spec-management/living-spec-after-archive
- GIVEN an approved change that adds requirements to capability `widgets`
- WHEN its last implementing PR merges
- THEN `specs/widgets/spec.md` contains those requirements
- AND `changes/` no longer has the change's folder outside `changes/archive/`

### Requirement: Requirement format
Every requirement in a living spec or delta SHALL have a `### Requirement:` heading, a statement using SHALL, and at least one scenario. Every scenario SHALL have a `#### Scenario:` heading with an ID of the form `<capability>/<slug>`, followed by GIVEN, WHEN, and THEN lines.

#### Scenario: spec-management/requirement-without-scenario
- GIVEN a delta with a requirement that has no scenario
- WHEN the spec lint runs
- THEN the lint fails and names the requirement

#### Scenario: spec-management/malformed-scenario-id
- GIVEN a scenario headed `#### Scenario: S1`
- WHEN the spec lint runs
- THEN the lint fails and says the ID must be `<capability>/<slug>`

### Requirement: Triage every request
The factory SHALL triage every request, whatever its source (chat, a GitHub issue carrying the factory label, a verifier's draft change, or a loop-metrics suggestion). Triage SHALL assign one of the sizes defined in the loop config and record that size with a one-line reason in the proposal, or in the PR for a trivial edit.

#### Scenario: spec-management/triage-records-size-and-reason
- GIVEN a request made in chat
- WHEN triage runs
- THEN the resulting proposal or PR states a size from the loop config and a one-line reason

#### Scenario: spec-management/triage-github-issue
- GIVEN an open GitHub issue carrying the factory label
- WHEN the factory picks it up
- THEN it's triaged like a chat request
- AND the resulting proposal or PR links to the issue

#### Scenario: spec-management/triage-configured-sizes
- GIVEN a loop config that defines only the sizes `trivial` and `big`
- WHEN triage runs on any request
- THEN the size it assigns is `trivial` or `big`

### Requirement: Trivial edits
A request triaged as trivial SHALL be made as a direct edit to the living spec in a single PR. Before approving, the review model SHALL check that no requirement or scenario changed meaning. If one did, the edit SHALL be sent back to triage as small.

#### Scenario: spec-management/trivial-typo-approved
- GIVEN a PR that only fixes a typo in a requirement
- WHEN the review model reviews it
- THEN the review model approves the PR

#### Scenario: spec-management/trivial-meaning-changed
- GIVEN a PR triaged as trivial that changes "SHALL" to "MAY" in a requirement
- WHEN the review model reviews it
- THEN the review model does not approve the PR
- AND the request is re-triaged as small and gets a change folder

### Requirement: Grill big requests
Before drafting a proposal for a request triaged as big, the factory SHALL interview the user until the proposal has no open questions. While grilling, it SHALL add new or clarified terms to `GLOSSARY.md` and record each decision in the proposal's Decisions table.

#### Scenario: spec-management/grill-unknown-term
- GIVEN a big request that uses a term not in GLOSSARY.md
- WHEN grilling runs
- THEN the user is asked to define the term
- AND GLOSSARY.md contains the term before any delta is drafted

#### Scenario: spec-management/grill-records-decisions
- GIVEN a grilling session in which the user answers a question
- WHEN the answer is given
- THEN the proposal's Decisions table has a row for that question and answer

### Requirement: Grilling question style
The grill skill SHALL ask its questions with the agent tool's structured multiple-choice picker when the tool has one, listing the recommended option first and asking at most four related questions per round. Without a picker, it SHALL ask the same questions as numbered options in plain text.

#### Scenario: spec-management/grill-uses-picker
- GIVEN an agent tool that has a multiple-choice picker
- WHEN grilling asks a round of questions
- THEN it uses the picker, with at most four questions, each listing its recommended option first

#### Scenario: spec-management/grill-plain-text-fallback
- GIVEN an agent tool without a multiple-choice picker
- WHEN grilling asks a question
- THEN the question appears as text with numbered options, the recommended one marked

### Requirement: Resume grilling
Grilling SHALL be resumable from the draft proposal alone. `proposal.md` SHALL keep a Decisions table and an Open questions list, and a resumed session SHALL start at the first open question.

#### Scenario: spec-management/grill-resume
- GIVEN a proposal whose Open questions list starts with G8
- WHEN a new session runs the grill skill on that change
- THEN the first question it asks is G8

### Requirement: When to write an ADR
Grilling SHALL write an ADR in `docs/adr/` for a decision that is hard to reverse, affects more than one capability, or would surprise a future reader. Every other decision SHALL stay only in the proposal's Decisions table.

#### Scenario: spec-management/adr-for-cross-capability-decision
- GIVEN a grilling decision that changes how both `coding` and `verification` behave
- WHEN the decision is recorded
- THEN a new ADR in `docs/adr/` describes it and cites the proposal

#### Scenario: spec-management/local-decision-no-adr
- GIVEN a grilling decision that affects only the capability being specified and is easy to reverse
- WHEN the decision is recorded
- THEN it appears in the proposal's Decisions table and no new ADR is created

### Requirement: Change folder
For a request triaged as small or big, the factory SHALL create `changes/<change-name>/` containing a `proposal.md` (why, decisions, size and reason), a `tasks.md`, and one delta per affected capability at `specs/<capability>/spec.md`, with sections named `ADDED Requirements`, `MODIFIED Requirements`, or `REMOVED Requirements`. Small requests SHALL skip grilling.

#### Scenario: spec-management/small-change-no-grilling
- GIVEN a request triaged as small
- WHEN the factory handles it
- THEN a change folder is created with a proposal, tasks, and deltas
- AND the user isn't asked any grilling questions

### Requirement: Spec lint
A deterministic spec lint (no model) SHALL run on every change before the review model's spec check. It SHALL fail when:
- a requirement or scenario is malformed (see Requirement format)
- a scenario ID is duplicated within a capability
- a cited scenario ID doesn't resolve, whether it's cited in specs, changes, or tests
- a scenario ID that an in-flight change renames or removes is still cited outside that change
- a Mermaid block doesn't parse

It SHALL report, without failing, any requirement that more than one in-flight change modifies.

On a proposal PR (one whose changed files are all inside a single `changes/<change-name>/` folder), the lint SHALL report stale citations of renamed or removed IDs without failing. The tests that cite them can't change until the implementing PR.

#### Scenario: spec-management/lint-duplicate-id
- GIVEN two scenarios in the same capability with the ID `widgets/add-widget`
- WHEN the spec lint runs
- THEN the lint fails and names both locations

#### Scenario: spec-management/lint-stale-reference-after-rename
- GIVEN a change that renames scenario `widgets/add-widget` to `widgets/create-widget`
- AND a test that still cites `widgets/add-widget`
- WHEN the spec lint runs on an implementing PR
- THEN the lint fails and names the test file

#### Scenario: spec-management/lint-stale-reference-on-proposal-pr
- GIVEN a proposal PR whose change renames scenario `widgets/add-widget` to `widgets/create-widget`
- AND a test that still cites `widgets/add-widget`
- WHEN the spec lint runs on that PR
- THEN the lint passes
- AND it reports a warning that names the test file and the change

#### Scenario: spec-management/lint-invalid-mermaid
- GIVEN a spec containing a `mermaid` block with a syntax error
- WHEN the spec lint runs
- THEN the lint fails and names the file and block

#### Scenario: spec-management/lint-flags-overlap
- GIVEN two in-flight changes that both modify requirement "Add widget"
- WHEN the spec lint runs on either change
- THEN the lint passes but reports the overlap and names the other change

### Requirement: Spec check
After the spec lint passes, the review model SHALL check that:
- every domain term is used with its meaning in `GLOSSARY.md`
- no delta contradicts a living spec or an accepted ADR, unless it explicitly MODIFIES or REMOVES the conflicting requirement
- every THEN can be observed from outside the system (by an end-to-end test, a screenshot, or CLI output)

Findings SHALL go back to the proposer, who revises the change.

#### Scenario: spec-management/check-undefined-term
- GIVEN a delta that uses a domain term not in GLOSSARY.md
- WHEN the spec check runs
- THEN it reports the term and the change goes back to the proposer

#### Scenario: spec-management/check-contradiction
- GIVEN a delta whose ADDED requirement contradicts an existing living requirement
- WHEN the spec check runs
- THEN it reports the contradiction and names both requirements

#### Scenario: spec-management/check-unobservable-then
- GIVEN a scenario whose THEN is "the code is clean"
- WHEN the spec check runs
- THEN it reports that the THEN can't be observed from outside

### Requirement: Approval on a proposal PR
A small or big change SHALL be submitted as a proposal PR that contains only its change folder. Who approves it SHALL come from the approval policy in the loop config. In this project, the review model approves small changes and a human approves big ones. Build SHALL NOT start until the proposal PR merges.

#### Scenario: spec-management/proposal-pr-only-change-folder
- GIVEN a change that passes the spec lint and spec check
- WHEN its proposal PR is opened
- THEN every file in the PR is under `changes/<change-name>/`

#### Scenario: spec-management/small-approved-by-review-model
- GIVEN a proposal PR for a small change, under this project's approval policy
- WHEN the spec check finds nothing
- THEN the review model approves the PR without a human review

#### Scenario: spec-management/big-waits-for-human
- GIVEN a proposal PR for a big change, under this project's approval policy
- WHEN the review model has commented
- THEN the PR doesn't merge until a human approves it

#### Scenario: spec-management/human-rejects-returns-to-grill
- GIVEN a proposal PR for a big change
- WHEN the human requests changes with open questions
- THEN those questions appear in the proposal's Open questions list and grilling resumes

### Requirement: Archive in the implementing PR
The last implementing PR for a change SHALL merge the change's deltas into the living specs and move its folder to `changes/archive/YYYY-MM-DD-<change-name>/`. If another change touching the same requirements was archived first, the change SHALL rebase its deltas onto the updated living spec and pass the spec lint and spec check again before its PR merges.

#### Scenario: spec-management/archive-merges-deltas
- GIVEN an implementing PR for change `add-widgets` that passes verification
- WHEN its final step runs
- THEN the living specs contain the change's ADDED and MODIFIED requirements and none of its REMOVED ones
- AND the folder is at `changes/archive/<date>-add-widgets/`

#### Scenario: spec-management/archive-second-change-rebases
- GIVEN changes A and B that both modify requirement "Add widget", and A has been archived
- WHEN B's implementing PR tries to archive
- THEN B's delta is rebased onto the updated living spec
- AND the spec lint and spec check run again before B's PR can merge

### Requirement: Amend an unarchived change
To change a requirement that exists only in an approved change that hasn't been archived, the factory SHALL amend that change's folder in a new proposal PR, not create a separate change. The amendment SHALL be recorded as a new decision in that change's proposal, with its own size and reason, and approved under the approval policy for that size.

#### Scenario: spec-management/amend-unarchived-change
- GIVEN an approved change `add-widgets` that hasn't been archived
- AND a request to change one of the requirements it adds
- WHEN the request is handled
- THEN a proposal PR changes only files in `changes/add-widgets/`
- AND the proposal of `add-widgets` records the amendment as a new decision with a size and reason

### Requirement: Spec changes from verification
When the verifier decides a spec is wrong, it SHALL draft a change in `changes/` explaining the problem and link it from the implementing PR. That PR SHALL stay blocked until the draft change is accepted or rejected. The draft SHALL enter triage like any other request.

#### Scenario: spec-management/verifier-draft-blocks-pr
- GIVEN an implementing PR whose e2e failure the verifier attributes to the spec
- WHEN the verifier records its decision
- THEN a draft change exists in `changes/`, linked from the PR
- AND the PR can't merge while the draft is open

#### Scenario: spec-management/verifier-draft-rejected
- GIVEN an implementing PR blocked on a draft spec change
- WHEN the draft change is rejected
- THEN the PR is unblocked and goes back to the coder with the rejection reason

### Requirement: Portable skills
The factory's spec-management skills (triage, grill, propose-change, check-spec, archive-change) SHALL be packaged in the Agent Skills standard as `SKILL.md` files.

#### Scenario: spec-management/skills-load-in-claude-code
- GIVEN a target project with the spec-management skills installed
- WHEN Claude Code lists the available skills
- THEN triage, grill, propose-change, check-spec, and archive-change all appear
