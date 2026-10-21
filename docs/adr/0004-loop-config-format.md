# ADR 0004: Loop config format and location

- **Status:** Accepted (2026-10-21)
- **Deciders:** Stephen Wilcox
- **Source:** prerequisite in [add-spec-management tasks](../../changes/add-spec-management/tasks.md)

## Context

Every target project has a **loop config**: the settings that skills and deterministic tools read to decide how the loop behaves there. Today that means sizes and the approval policy. Later it will cover model routing, stages, extra decision points, and metrics thresholds, and it will be the source for the generated loop diagram. The config is read by code, so its values must be exact and checkable. People and agents also edit it, so the reasons behind each setting need a place to live.

Plain markdown was ruled out because it has no standard way to represent nested data. Tools would have to depend on a home-made convention, such as "the table under `## Sizes`", which a well-meant rewording could break, and there'd be no off-the-shelf schema validation.

## Options considered

| Option | For | Against |
|---|---|---|
| **Markdown with YAML frontmatter** | Exact values that tools parse and a schema validates, plus a body that explains them, in one file. Same pattern as `SKILL.md`. | Needs a frontmatter parser. Two parts of the file to keep in step. |
| YAML with a JSON Schema | Simplest to parse | Reasons can only go in comments |
| TypeScript file | Type-checked for free | It's code, so it's harder to validate or generate a diagram from safely |
| JSON | No dependencies | No comments; unpleasant to edit |

## Decision

- **Format:** the frontmatter of `loop.md` holds every value. The markdown body explains them. The frontmatter is validated against `loop.schema.json`, a JSON Schema in the 2020-12 draft. Tools ignore the body.
- **Location:** `factory/` at the root of the target project, visible rather than hidden. It holds `factory/loop.md`, `factory/loop.schema.json`, and later whatever else the factory installs. This repo is its own first target project, so its config is at `factory/loop.md` too.
- **Roles, not models:** approvers, and later routing, refer to the roles `human`, `decision-model`, `generative-model`, and `review-model`. Only `routing` maps roles to concrete models, so changing models never touches the approval policy.
- **Shape first:** sections for capabilities that haven't been specified (`routing`, `stages`, `decision_points`, `metrics`) are present but empty. They show the intended shape, and tools ignore them until their capability defines them.

## Consequences

- Deterministic tools need `gray-matter` (frontmatter) and `ajv` (schema validation). Both were tested 2026-10-21 on Node 24.15: the stub validates, and a copy with a model ID as approver and a missing `process` fails with both errors.
- `factory/` is now a reserved name in target projects. Installation must check for a clash before writing there.
- Changing a setting means updating its explanation in the body in the same PR. The spec check can flag frontmatter changes that come with no change to the body.
