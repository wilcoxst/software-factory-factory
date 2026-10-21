# Tasks: add-spec-management

These are the input to decomposition, which hasn't been specified yet. Each task names the scenarios it makes pass.

## Prerequisites

- [x] **Choose a runtime for the factory's deterministic tools.** Decided in [ADR 0003](../../docs/adr/0003-tool-runtime.md): TypeScript run directly by Node 24+, with Mermaid checked using `mermaid` and `jsdom`.
- [x] **Stub the loop config.** Done in [factory/loop.md](../../factory/loop.md): sizes and approval policy, plus empty sections for routing, stages, decision points, and metrics. Format and location are in [ADR 0004](../../docs/adr/0004-loop-config-format.md).
- [x] **Choose an e2e test harness for skills.** Decided in [ADR 0005](../../docs/adr/0005-skill-e2e-harness.md): Agent SDK and `node:test` for scenario tests, with a scripted user and a fake `gh`. `claude plugin eval` checks skill triggering on demand.

## Test harness (from ADR 0005)

- [ ] Scenario runner: temp fixture repo, skills loaded, Agent SDK `query()` with role-pinned models, sandboxed tools.
- [ ] Scripted user: answers matched by question header or regex; otherwise the first (recommended) option.
- [ ] Fake `gh` (records calls as JSON lines, returns canned responses) and a local bare `origin`.
- [ ] CI workflow: path filter, one run plus one retry, flaky versus failed, cost ceiling, JSON results artifact.
- [ ] **Human:** add the model API key as a GitHub Actions secret.
- [ ] Package the skills as a Claude Code plugin and add an `evals/` suite for skill triggering (run on demand).

## Spec lint (deterministic)

Built in `tools/spec-lint/` (`npm run lint:specs`), tested in `tools/spec-lint/spec-lint.test.ts`, and run in CI on every PR.

- [x] Parse requirements and scenarios; check headings, SHALL, and the ID format. Covers `spec-management/requirement-without-scenario` and `spec-management/malformed-scenario-id`.
- [x] Check that IDs are unique within each capability. Covers `spec-management/lint-duplicate-id`.
- [x] Resolve scenario IDs cited in specs, changes, and tests. Covers `spec-management/lint-stale-reference-after-rename`.
- [x] Parse `mermaid` blocks. Covers `spec-management/lint-invalid-mermaid`.
- [x] Report requirements that more than one in-flight change modifies. Covers `spec-management/lint-flags-overlap`.

## Skills (Agent Skills `SKILL.md`)

- [ ] **`triage`**: size a request and record the reason; accept chat, labelled-issue, verifier-draft, and metrics requests. Covers the `triage-*` scenarios.
- [ ] **`grill`**: picker or plain-text questions, glossary updates, Decisions table, resume from proposal, ADR threshold. Covers the `grill-*`, `adr-for-cross-capability-decision`, and `local-decision-no-adr` scenarios.
- [ ] **`propose-change`**: create the change folder and deltas, then open a proposal PR containing only the change folder. Covers `small-change-no-grilling` and `proposal-pr-only-change-folder`.
- [ ] **`check-spec`**: run the lint, then the review-model check of glossary terms, contradictions, and observable THENs. Also review trivial edits. Covers the `check-*` and `trivial-*` scenarios.
- [ ] **`archive-change`**: merge deltas, rebase after another change archives first, and move the folder to the archive. Covers `archive-*` and `living-spec-after-archive`.
- [ ] **Approval policy wiring**: small changes approved by the review model, big ones by a human. Covers `small-approved-by-review-model`, `big-waits-for-human`, and `human-rejects-returns-to-grill`.
- [ ] **Package as installable skills.** Covers `skills-load-in-claude-code`.

## Amendments (G18–G19)

- [ ] Spec lint proposal-PR mode: add `--base <ref>`. If every file changed since the base is inside one `changes/<change-name>/` folder, report `stale-citation` as a warning. Covers `spec-management/lint-stale-reference-on-proposal-pr`; `spec-management/lint-stale-reference-after-rename` becomes the implementing-PR case.
- [ ] CI: pass the PR's base branch to the spec lint.
- [ ] `propose-change`: when the target requirement exists only in an unarchived change, amend that change's folder and record a new decision. Covers `spec-management/amend-unarchived-change`.

## Deferred to other capabilities

- The verifier writing draft changes and blocking PRs (`verifier-*` scenarios) is built under `verification`. This change only defines how such drafts enter triage.

## Bootstrap

- [ ] Archive this change, which creates `specs/spec-management/spec.md`. From then on, this project's own spec changes go through the skills above.
