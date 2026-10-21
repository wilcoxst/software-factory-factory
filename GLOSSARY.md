# Glossary

The shared vocabulary for this project. Grilling checks terms against this file: if a term is missing or used two ways, it gets resolved here before anything else is written. Each entry gives a definition and, where useful, words to avoid using for the same thing.

## Factory

**Factory.** This project: the tool that designs, installs, and tunes a loop in a target project. *Avoid:* "framework", "harness".

**Target project.** A repo the factory installs a loop into. This repo is its own first target project; the card game is the second.

**Skill.** A portable `SKILL.md` instruction package in the Agent Skills standard. The factory installs and customizes skills in target projects.

**Loop config.** A target project's settings for its loop: sizes, approval policy, model routing, stages, decision points, and metrics. It lives in the YAML frontmatter of `factory/loop.md`, and the markdown body explains each setting ([ADR 0004](docs/adr/0004-loop-config-format.md)). Specified by the `loop-configuration` capability.

**Role.** What the loop config names instead of a model: `human`, `decision-model`, `generative-model`, or `review-model`. Routing maps each role to a concrete model.

**Loop.** The configured sequence of stages that turns a request into verified, merged work, and feeds what it learns back into the specs and into its own configuration.

## Specs

**Capability.** One coherent area of behaviour, with its own folder under `specs/`. Roughly a bounded context in Domain-Driven Design terms.

**Living spec.** `specs/<capability>/spec.md`: what is true now. It changes only when a change is archived, or through a trivial edit.

**Change.** A proposed modification to one or more living specs, kept in `changes/<change-name>/` until it's done. *Avoid:* "feature" when you mean the folder.

**Delta.** The part of a change that says which requirements are ADDED, MODIFIED, or REMOVED in a capability.

**Requirement.** A single SHALL statement about the behaviour of the system. Every requirement has at least one scenario.

**Scenario.** A concrete GIVEN/WHEN/THEN example of a requirement, with a slug ID (for example `spec-management/grill-unknown-term`) that tests cite. Renaming an ID means updating every reference in the same change.

**Request.** Anything that might change a spec: a chat message, a labelled GitHub issue, a verifier's draft change, or a loop-metrics suggestion. Every request goes through triage.

**Proposal PR.** A PR containing only a change folder. Merging it is the approval of that change. It's used for small and big changes.

**Implementing PR.** A PR that builds an approved change. Its last step archives the change, so the specs and the code land on main together.

**Scenario test.** An automated test of one scenario, named by its scenario ID, at `tests/e2e/<capability>/<scenario-slug>.test.ts` ([ADR 0005](docs/adr/0005-skill-e2e-harness.md)).

**Scripted user.** The test harness's stand-in for a person. It gives each scenario's scripted answers, and the first (recommended) option for any other question.

**Flaky.** A scenario that fails and then passes on its automatic retry. It doesn't block the PR, but loop metrics records it.

**Archive.** Merging a finished change's deltas into the living specs and moving its folder to `changes/archive/YYYY-MM-DD-<name>/`.

**ADR.** Architecture Decision Record: `docs/adr/NNNN-<title>.md`, which records one decision and why it was made.

**Grilling.** An interview that keeps asking until every open branch of a request is resolved. It updates the glossary and ADRs as it goes.

**Triage.** The decision step that gives a request a size, with a one-line reason, which picks how much process it gets.

**Size.** The label triage gives a request. The available sizes are set in the loop config; this project uses **trivial**, **small**, and **big**. *Avoid:* "substantial" (an early name for big).

**Deterministic tool.** A factory script that runs without a model and always gives the same output for the same input. Written in TypeScript and run directly by Node 24+ ([ADR 0003](docs/adr/0003-tool-runtime.md)).

**Spec lint.** The deterministic (no model) check of spec structure and ID references. `npm run lint:specs`. It runs before the review model's spec check.

**Citation.** A reference to a scenario ID that the spec lint checks. In markdown under `specs/` or `changes/` (not the archive), it's inline code that is exactly `<capability>/<slug>` for a capability that exists. In a `*.test.ts` file, it's a quoted string that is exactly such an ID, or a test file at `tests/e2e/<capability>/<slug>.test.ts`.

**Approval policy.** The rule in the loop config that says who approves each size before build, either a human or the review model.
