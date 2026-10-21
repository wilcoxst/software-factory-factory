---
# Loop config for this project. Tools read this frontmatter; the body below explains it.
# Schema: factory/loop.schema.json. Format and location: docs/adr/0004-loop-config-format.md
version: 1

# Sizes triage can assign, and what each one gets. (spec-management G1, G2, G5, G8, G17)
sizes:
  trivial:
    description: Wording, typos, or formatting. No requirement or scenario changes meaning.
    process: edit-living-spec
    approver: review-model
  small:
    description: A contained behaviour change whose design is clear without an interview.
    process: change-folder
    approver: review-model
  big:
    description: A new capability, a change across capabilities, or anything with open design questions.
    process: grill-then-change-folder
    approver: human

# --- Placeholders: not yet specified. Each fills in when its capability is grilled. ---

# Which concrete model or provider fills each role. (decomposition-and-routing)
routing: {}

# The loop's stages, in order; the source for the generated loop diagram. (loop-configuration)
stages: []

# Extra decision points added to the standard stages. (loop-configuration)
decision_points: []

# What to measure and the thresholds that trigger suggested loop changes. (loop-metrics)
metrics: {}
---

# Loop config

These are the settings for this project's loop. Tools read only the YAML frontmatter above, and [the schema](loop.schema.json) validates it. This body records why each setting is what it is. Change both together.

## Roles

Approvers and, later, routing refer to **roles**, never to specific models:

| Role | Does |
|---|---|
| `human` | You |
| `decision-model` | Routes and classifies, e.g. triage. Should be cheap. |
| `generative-model` | Writes content: proposals, code |
| `review-model` | Checks work. Should be a different, often stronger, model from the one that wrote it. |

`routing` (once it's specified) maps each role to a concrete model, so switching models never touches the approval policy.

## Sizes

The triage model picks a size using judgement, not fixed rules (G1). The `description` fields are its guidance, and it records a one-line reason (G6).

- **trivial:** a direct edit to the living spec in one PR. The review model approves it after checking that nothing changed meaning; if something did, the edit is sent back to triage as small (G8).
- **small:** a change folder with no grilling. Its proposal PR is approved by the review model (G5, G17).
- **big:** grilling, then a change folder. Its proposal PR is approved by you (G5, G17).

`process` values:
- `edit-living-spec`: direct edit to the living spec.
- `change-folder`: proposal, tasks, and deltas.
- `grill-then-change-folder`: the same, after grilling.

`approver` is a role, either `human` or `review-model`.

The decisions are recorded in [add-spec-management](../changes/add-spec-management/proposal.md).

## Placeholders

`routing`, `stages`, `decision_points`, and `metrics` are empty on purpose. They show the eventual shape. Each is filled in when its capability is grilled; until then, tools ignore them.
