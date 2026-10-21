# ADR 0001: How we manage specs

- **Status:** Accepted (2026-10-21)
- **Date:** 2026-10-21
- **Deciders:** Stephen Wilcox

## Context

This project builds an agent engineering loop, uses it to build itself, and then installs it into a target project. The spec-management approach is the first stage of that loop, so it has to work for both projects.

What the approach needs to do, taken from [spec.md](../../spec.md):

1. **Shared by people and agents.** Plain text in git, so it can be diffed, reviewed in PRs, and read by any model without a special tool.
2. **Two levels.** One overview for the whole project and one spec per capability or feature.
3. **Testable.** The verifier has to decide whether a failing end-to-end test means the test is out of date, the PR is wrong, or the spec is wrong. That only works if every requirement has concrete scenarios that tests can point back to.
4. **Accepts changes from downstream.** When verification finds a problem in the spec, it proposes a spec change. The approach needs a standard way to make that change and review it.
5. **Low ceremony for small changes.** A typo fix shouldn't require a full set of documents.
6. **Portable.** The factory has to be able to install it into another repo and customize it there.
7. **Renderable diagrams** inside the spec.

## Options considered

| # | Option | What it is | Strengths | Weaknesses | Fit |
|---|---|---|---|---|---|
| 1 | **Single `spec.md`** (what we have now) | One growing file | No setup | Gets unwieldy. No way to propose a change separately from the current truth. Hard for tests to point at a requirement. | Starting point only |
| 2 | **[GitHub Spec Kit](https://github.com/github/spec-kit)** | `constitution.md` plus a folder per feature (`spec.md`, `plan.md`, `tasks.md`, `research.md`, `contracts/`), driven by specify → plan → tasks → implement | Popular, works with many agents. The constitution is a good idea. | Heaviest option. Uses a branch per spec. Lots of generated files to review. Specs are snapshots of each feature rather than a living description of the system. | Poor. Too much ceremony for small changes. |
| 3 | **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** | Living specs in `specs/`, plus in-flight changes in `changes/<name>/` (proposal, tasks, spec deltas) that are merged into the specs and archived when done | Light. Plain markdown. Separates the current truth from proposed changes. Requirements use SHALL with WHEN/THEN scenarios, which map directly to tests. | Doesn't capture vocabulary or decisions. Delta merging is fairly new. | **Strong** for the spec store |
| 4 | **[Matt Pocock's skills](https://github.com/mattpocock/skills)** | `/grill-with-docs` interviews the user and updates `GLOSSARY.md` and ADRs as it goes, then `/to-spec` → `/to-tickets` → `/implement` | Best capture method: a relentless interview. Glossary gives a shared vocabulary (from Domain-Driven Design). ADRs record why decisions were made. | Specs go to the issue tracker, not a living spec in the repo. | **Strong** for capture, glossary and decisions |
| 5 | **[pstack](https://github.com/cursor/plugins/tree/main/pstack)** (Lauren Tan) | "The best spec is code." Upfront design uses `/architect` and `/in-your-own-words`. Feature Maps (`references/features/`) are "materialized memory". Includes a verification skill and CLI. | Very strong on verification and learning (`/reflect`, `/correct`, `/show-me-your-work`) | Deliberately has no spec store | Use it for the verification and coding stages, not for specs |
| 6 | **Personal wiki / second brain** (e.g. Obsidian) | Linked notes | Good for exploring ideas | Unstructured. Hard to trace to tests. Usually lives outside the repo. | Keep [ideas.md](../../ideas.md) as the scratchpad; don't use this as the spec |
| 7 | **[Kiro](https://kiro.dev) / [Tessl](https://tessl.io)** | Spec-native IDE / spec-as-source (generated code is marked do-not-edit) | Tight coupling between spec and code | Tied to a vendor or IDE. Tessl is still in beta. Doesn't fit a factory that installs into any repo. | Poor |

Domain-Driven Design isn't a storage approach. It shows up here as the glossary (ubiquitous language) and, later, bounded contexts (one `specs/` capability per context).

## Decision

Use a **hybrid in plain markdown**: Matt Pocock's capture method and OpenSpec's storage model, with our own small skills driving both.

```
GLOSSARY.md                          # shared vocabulary; terms are challenged during grilling
docs/adr/NNNN-<title>.md             # decisions and why they were made (this file is 0001)
spec.md                              # overview: vision, loop diagram, list of capabilities
specs/<capability>/spec.md           # living specs: what is true now
changes/<change-name>/
    proposal.md                      # why and what
    tasks.md                         # checklist (input to decomposition, defined later)
    specs/<capability>/spec.md       # deltas: ADDED / MODIFIED / REMOVED requirements
changes/archive/YYYY-MM-DD-<name>/   # finished changes, after their deltas are merged
```

**Requirement format** (from OpenSpec, plus stable scenario IDs so tests can point at them):

```markdown
### Requirement: Grill before proposing
The factory SHALL interview the user until every open branch of the request is resolved
before drafting a change proposal.

#### Scenario: spec-management/S1 — unresolved term
- GIVEN a request that uses a term not in GLOSSARY.md
- WHEN the grill step runs
- THEN the user is asked to define the term
- AND GLOSSARY.md is updated before the proposal is drafted
```

E2E tests name the scenario IDs they cover. When a test fails, the verifier follows the ID back to the requirement, and that's how it decides whether the test, the PR, or the spec is wrong.

**Scaling to the size of the change:** a triage step decides how much process to apply. A trivial change edits the living spec directly in its PR. A substantial change goes through grilling and a change folder.

### Why this combination

- OpenSpec's split between living specs and change deltas gives requirement 4 a home: the verifier writes a proposal into `changes/`, and the human approves or rejects it.
- Grilling with a glossary and ADRs covers what OpenSpec lacks: shared vocabulary and the reasons behind decisions.
- Writing our own skills rather than installing OpenSpec or Spec Kit wholesale keeps each step configurable. That configurability is the product. Because the file format follows OpenSpec, its CLI is still an option if we ever want it.

### Diagrams: Mermaid

| Option | Renders in GitHub, VS Code, Obsidian with no extra tooling | Notes |
|---|---|---|
| **Mermaid** | Yes. GitHub renders `mermaid` code blocks natively. | LLMs write it reliably. Layout control is weak, and each diagram type has its own syntax. |
| D2 | No. Needs the CLI or CI to render SVGs. | Better layout and more consistent syntax. Worth revisiting if Mermaid layouts become unreadable. |
| LikeC4 / Structurizr | No. Needs a runtime or workspace. | Built for C4 architecture models, which is overkill for a process loop |
| PlantUML | No. Needs a server. | Older. Weaker native rendering. |

Recommendation: write diagrams as inline Mermaid in the spec. Later, generate the loop diagram from the factory's loop config file, so the picture can't drift from what's actually configured (see [ideas.md](../../ideas.md)).

## Consequences

- `spec.md` becomes the overview. As each capability is grilled, its details move into `specs/<capability>/spec.md`.
- The first skills to build are: `grill` (with glossary and ADR updates), `propose-change`, `check-spec` (consistency and testability lint), and `archive-change`.
- We keep only the OpenSpec file format and don't use its CLI. Our own skills drive each step.
