# Change: add-spec-management

- **Status:** Grilling complete; spec deltas not yet drafted
- **Capability:** `spec-management` (new)
- **Follows:** [ADR 0001](../../docs/adr/0001-spec-management-approach.md)

## Why

The loop's first stage is turning requests into specs that people and agents can both work from, and that tests can point back to. ADR 0001 chose the format. This change specifies how the stage behaves.

## Decisions so far

| # | Question | Decision |
|---|---|---|
| G1 | What makes a change trivial? | **The triage model decides.** There's no fixed rule; it judges size from risk and effort. |
| G2 | Who approves a change before build? | **Set per project in the loop config.** By default, a human approves big changes and the review model approves the rest. |
| G3 | What happens when the verifier decides the spec is wrong? | **It drafts a change and the PR is blocked.** The verifier writes a draft change in `changes/` explaining the problem and links it to the PR. The PR waits until that change is accepted or rejected. |
| G4 | Which agent tools must the skills work in? | **The Agent Skills standard.** Skills are portable `SKILL.md` files, tested in Claude Code first. |
| G5 | How many sizes does triage use, and who approves each? | **Set per project in the loop config.** This project uses three. **Trivial:** edit the living spec, approved in normal PR review. **Small:** change folder with no grilling; the review model approves. **Big:** grilling and a change folder; a human approves. |
| G6 | What stops triage from under-sizing a change? | **The reason is recorded.** Triage writes the size and a one-line reason into the proposal or PR, so it can be audited and fed into loop metrics. There's no automatic escalation for now. |
| G7 | What are the initial capabilities? | `spec-management`, `decomposition-and-routing`, `coding`, `verification`, `loop-metrics`, `loop-configuration`, `installation`. See [spec.md](../../spec.md#capabilities). |
| G7a | Where does the loop config belong? | In the `loop-configuration` capability. Spec management only reads the sizes and approval policy from it. |
| G8 | Who reviews trivial edits? | **The review model.** It checks that no requirement or scenario changed meaning, then merges. If meaning did change, it sends the edit back to triage as small. |
| G9 | What does the spec check verify? | **A deterministic lint first**, then the review model. The lint checks structure: headings, SHALL statements, scenario IDs present and unique, every cited ID exists. The review model then checks that terms match the glossary, nothing contradicts living specs or accepted ADRs unless the change explicitly MODIFIES or REMOVES that requirement, and every requirement has a scenario whose THEN can be observed from outside. Findings go back to the proposer. |
| G10 | What format do scenario IDs use? | **Slugs**, `<capability>/<scenario-slug>` (e.g. `spec-management/grill-unknown-term`). A rename must update every reference (tests, specs, changes) in the same change; the lint enforces this. |
| G11 | How does interrupted grilling resume? | **From the draft proposal.** `proposal.md` keeps a Decisions table and an Open questions list. The grill skill resumes at the first open question. |
| G12 | When is a change archived? | **In the PR that implements it.** That PR's last step merges the deltas into the living specs and moves the change folder to the archive. Since it can't merge until verification passes, the specs and the code land on main together, and living specs never describe behaviour that hasn't been built. If a change spans several PRs, the last one archives it. |
| G13 | What if two in-flight changes touch the same requirement? | **Allowed, but the lint flags it.** Whichever change archives second must rebase its deltas onto the updated living spec and pass the spec check again before it merges. |
| G14 | When does grilling write an ADR? | **When a decision is hard to reverse, affects more than one capability, or would surprise a future reader.** Every other decision stays in the proposal's Decisions table and is archived with the change. |
| G15 | How does the grill skill ask questions? | **With the tool's multiple-choice picker when it has one.** The recommended option goes first, with up to 4 related questions per round. Tools without a picker get numbered options in plain text. |
| G16 | Where do requests come from? | **Four sources, all of which go through triage:** chat with an agent, the verifier's draft changes, GitHub issues labelled for the factory (linked from the proposal), and suggestions from loop metrics. |
| G17 | Where does approval happen, and how is it recorded? | **On a proposal PR.** Small and big changes go up as a PR containing only the change folder. Approving that PR is the approval: a human reviews big changes, and the review model comments and approves small ones. Build starts once the proposal merges. A separate implementing PR then builds the change and archives it (G12). Trivial edits use a single PR that the review model approves (G8). |

ADR-worthy decisions (per G14): G3, G12 and G17 together set the change lifecycle across spec management, coding and verification. They're recorded in [ADR 0002](../../docs/adr/0002-change-lifecycle.md).

## Open questions

None. The next step is drafting the `spec-management` deltas (requirements and scenarios) from the decisions above.
