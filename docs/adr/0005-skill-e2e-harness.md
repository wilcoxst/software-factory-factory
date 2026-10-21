# ADR 0005: End-to-end test harness for skills

- **Status:** Accepted (2026-10-21)
- **Deciders:** Stephen Wilcox
- **Source:** prerequisite in [add-spec-management tasks](../../changes/add-spec-management/tasks.md)

## Context

Every scenario has a slug ID that tests cite ([ADR 0001](0001-spec-management-approach.md)). For skills, a scenario test has to:
- run an agent with the skills loaded, inside a fixture repo
- answer the skill's questions, since grilling is interactive
- check the files, git state, and GitHub calls that result

Agent runs aren't deterministic, so the harness also needs a policy for how often to run and what counts as a pass.

Two tools were researched on 2026-10-21:

- **[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals)** is Claude Code's built-in runner. Each case is a prompt plus graders: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, and `baseline`. It runs each case with and without the plugin to show the plugin's contribution (Δ). It supports a cost ceiling, a JSON report, and CI exit codes. However, runs are non-interactive, nothing can answer `AskUserQuestion`, and there are no custom-code graders.
- **The [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/user-input)** (TypeScript) runs an agent from code. Its `canUseTool` callback receives every `AskUserQuestion` call, and a test can answer by returning `{ behavior: "allow", updatedInput: { questions, answers } }`. Assertions can be any code. The catch is that we build and maintain the runner.

## Decision

Use **both**, for different jobs.

### 1. Scenario tests: Agent SDK and `node:test`

- **Where:** one test file per scenario, at `tests/e2e/<capability>/<scenario-slug>.test.ts`. The test's name is the scenario ID, so the spec lint can check that cited IDs exist.
- **Runtime:** TypeScript run directly by Node with the built-in `node:test` runner, per [ADR 0003](0003-tool-runtime.md). No extra test framework.
- **Fixture:** each run builds a fresh temp repo (git init plus fixture files, including a `factory/loop.md`), loads the skills under test, and sends the scenario's prompt.
- **Scripted user:** each test scripts the answers it cares about, matched by question `header` or a regex on the question text. Any other question gets its first option, which by convention is the recommended one. This is deterministic and makes no model calls.
- **GitHub:** a **fake `gh`** on `PATH` records every call as JSON lines and returns canned responses: issue lists, PR numbers, review states. A **local bare repo** is the `origin`. Tests assert on the recorded calls and on what was pushed. Nothing touches the network.
- **Assertions:** code that checks files, git log and branches, recorded `gh` calls, the transcript's tool calls, and the spec lint's result. A model judge is allowed only where a THEN can't be checked by code, and the test has to say why.
- **Permissions:** file and shell tools are allowed only inside the temp repo, with Claude Code's sandbox on.

### 2. Skill triggering and Δ: `claude plugin eval`

An `evals/` suite checks that each skill fires on natural phrasing (`tool_used: Skill`), that it doesn't fire on prompts it shouldn't, and how much it adds over no skill. This suite runs **on demand only**, typically when changing a skill's `description`. It isn't part of CI.

### Reliability and CI

- **When:** in CI on each PR, **path-filtered** to PRs that touch skills, tools, `factory/loop.md`, specs, or tests. Deterministic tool tests, such as the spec lint's own tests, run on every PR.
- **How many runs:** one per scenario. A failed scenario is **re-run once** automatically:
  - fail, then pass: **flaky**. Reported on the PR, doesn't block the merge, and is recorded for `loop-metrics`.
  - fail twice: **blocks** the PR.
- **Model:** pinned **per role**, using the same role-to-model mapping as production. That will come from `routing` in `factory/loop.md` once it's specified; until then, a pinned default in the test config. A pass therefore means the real setup works.
- **Cost:** each CI run has a cost ceiling, and the results (pass, flaky, fail, cost, and tokens per scenario) are written as a JSON artifact.

## Consequences

- We maintain a small harness: the runner, the scripted user, and the fake `gh`. In return it covers interactive skills, which plugin eval can't.
- The harness uses Claude-specific tooling (the Agent SDK and plugin eval), but the skills themselves stay portable Agent Skills (G4).
- For plugin eval to load the skills, they must also be packaged as a Claude Code plugin, either a manifest or a skills-directory plugin.
- CI needs a model API key stored as a GitHub Actions secret. Adding it is a human step.
- One run per PR is cheap but noisy. The flaky count is the signal to watch, and loop metrics should track it per scenario.
