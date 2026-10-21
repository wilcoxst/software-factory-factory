// Tests named "<capability>/<slug>" cover that scenario of the spec-management
// capability; the spec lint checks that each cited ID exists. Fixtures use a
// made-up "widgets" capability so they don't read as citations of this repo.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { lintRepo, type Finding } from "./lint.ts";

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-lint-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

const errors = (findings: Finding[]) => findings.filter((f) => f.severity === "error");
const rules = (findings: Finding[]) => findings.map((f) => f.rule);

function scenario(id: string): string {
  return `#### Scenario: ${id}\n- GIVEN a widget\n- WHEN it is added\n- THEN it is listed\n`;
}

function requirement(name: string, ...ids: string[]): string {
  return `### Requirement: ${name}\nThe system SHALL do ${name.toLowerCase()}.\n\n${ids.map(scenario).join("\n")}\n`;
}

const livingWidgets = `# widgets\n\n${requirement("Add widget", "widgets/add-widget")}`;

test("a well-formed living spec and delta pass", async () => {
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/list-widgets/specs/widgets/spec.md":
      `# Delta: widgets\n\n## ADDED Requirements\n\n${requirement("List widgets", "widgets/list-widgets")}`,
    "changes/list-widgets/tasks.md": "- [ ] Build it. Covers `widgets/list-widgets`.\n",
  });
  assert.deepEqual(await lintRepo(root), []);
});

test("spec-management/requirement-without-scenario", async () => {
  const root = await repo({
    "changes/add-widgets/specs/widgets/spec.md":
      "## ADDED Requirements\n\n### Requirement: Add widget\nThe system SHALL add widgets.\n",
  });
  const findings = errors(await lintRepo(root));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "requirement-without-scenario");
  assert.match(findings[0].message, /"Add widget"/);
});

test("spec-management/malformed-scenario-id", async () => {
  const root = await repo({
    "specs/widgets/spec.md": "### Requirement: Add widget\nThe system SHALL add widgets.\n\n" + scenario("S1"),
  });
  const findings = errors(await lintRepo(root));
  assert.deepEqual(rules(findings), ["scenario-id"]);
  assert.match(findings[0].message, /must be `<capability>\/<slug>`/);
});

test("spec-management/lint-duplicate-id", async () => {
  const root = await repo({
    "specs/widgets/spec.md": requirement("Add widget", "widgets/add-widget") +
      requirement("Copy widget", "widgets/add-widget"),
  });
  const findings = errors(await lintRepo(root));
  assert.deepEqual(rules(findings), ["duplicate-id"]);
  const [dup] = findings;
  assert.equal(dup.file, "specs/widgets/spec.md");
  assert.match(dup.message, /also at specs\/widgets\/spec\.md:4/);
  assert.notEqual(dup.line, 4, "the finding and the message name different locations");
});

test("spec-management/lint-stale-reference-after-rename", async () => {
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/rename-add/specs/widgets/spec.md":
      `## MODIFIED Requirements\n\n${requirement("Add widget", "widgets/create-widget")}`,
    "changes/rename-add/proposal.md": "Renames `widgets/add-widget` to `widgets/create-widget`.\n",
    "tests/widgets.test.ts": `test("widgets/add-widget", () => {});\n`,
  });
  const findings = errors(await lintRepo(root));
  assert.deepEqual(rules(findings), ["stale-citation"]);
  assert.equal(findings[0].file, "tests/widgets.test.ts");
  assert.match(findings[0].message, /"widgets\/add-widget".*"rename-add"/);
});

test("spec-management/lint-invalid-mermaid", async () => {
  const root = await repo({
    "specs/widgets/spec.md": `${livingWidgets}\n\`\`\`mermaid\nflowchart TD\n  a -->> b[[\n\`\`\`\n`,
    "spec.md": "```mermaid\nflowchart TD\n  a --> b\n```\n",
  });
  const findings = errors(await lintRepo(root));
  assert.deepEqual(rules(findings), ["mermaid"]);
  assert.equal(findings[0].file, "specs/widgets/spec.md");
  assert.equal(findings[0].line, livingWidgets.split("\n").length + 1, "the line of the opening fence");
});

test("spec-management/lint-flags-overlap", async () => {
  const modify = `## MODIFIED Requirements\n\n${requirement("Add widget", "widgets/add-widget")}`;
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/faster-add/specs/widgets/spec.md": modify,
    "changes/safer-add/specs/widgets/spec.md": modify,
  });
  const findings = await lintRepo(root);
  assert.deepEqual(errors(findings), [], "overlap alone doesn't fail the lint");
  assert.deepEqual(rules(findings), ["overlap", "overlap"]);
  const faster = findings.find((f) => f.file.startsWith("changes/faster-add/"))!;
  assert.match(faster.message, /"safer-add"/);
});

test("a citation of a scenario that doesn't exist fails", async () => {
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/x/tasks.md": "Covers `widgets/remove-widget`.\n",
    "tests/e2e/widgets/paint-widget.test.ts": "",
  });
  const findings = errors(await lintRepo(root));
  assert.deepEqual(rules(findings), ["unresolved-citation", "unresolved-citation"]);
  assert.deepEqual(findings.map((f) => f.file), ["changes/x/tasks.md", "tests/e2e/widgets/paint-widget.test.ts"]);
});

test("paths and unknown capabilities aren't citations", async () => {
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/x/tasks.md": "See `specs/widgets/spec.md` and `gadgets/anything`.\n",
  });
  assert.deepEqual(await lintRepo(root), []);
});

test("requirements need SHALL and ordered GIVEN/WHEN/THEN", async () => {
  const root = await repo({
    "specs/widgets/spec.md":
      "### Requirement: Add widget\nThe system adds widgets.\n\n" +
      "#### Scenario: widgets/add-widget\n- WHEN it is added\n- GIVEN a widget\n- THEN it is listed\n\n" +
      "#### Scenario: widgets/no-then\n- GIVEN a widget\n- WHEN it is added\n",
  });
  const messages = errors(await lintRepo(root)).map((f) => f.message);
  assert.deepEqual(messages, [
    'Requirement "Add widget" has no SHALL statement',
    'Scenario "widgets/add-widget" must list GIVEN, then WHEN, then THEN',
    'Scenario "widgets/no-then" has no THEN line',
  ]);
});

test("scenario IDs must name their own capability", async () => {
  const root = await repo({ "specs/widgets/spec.md": requirement("Add widget", "gadgets/add-widget") });
  const [finding] = errors(await lintRepo(root));
  assert.match(finding.message, /names capability "gadgets" but is in "widgets"/);
});

test("deltas must target existing requirements correctly", async () => {
  const root = await repo({
    "specs/widgets/spec.md": livingWidgets,
    "changes/x/specs/widgets/spec.md":
      `## ADDED Requirements\n\n${requirement("Add widget", "widgets/add-widget-again")}` +
      `## MODIFIED Requirements\n\n${requirement("Paint widget", "widgets/paint-widget")}` +
      `## RENAMED Requirements\n`,
  });
  const messages = errors(await lintRepo(root)).map((f) => f.message);
  assert.equal(messages.length, 3);
  assert.match(messages[0], /ADDED requirement "Add widget" already exists/);
  assert.match(messages[1], /MODIFIED requirement "Paint widget" isn't in specs\/widgets\/spec\.md/);
  assert.match(messages[2], /Unknown section "## RENAMED Requirements"/);
});

test("two changes can't add the same scenario ID", async () => {
  const add = `## ADDED Requirements\n\n${requirement("Paint widget", "widgets/paint-widget")}`;
  const root = await repo({
    "changes/a/specs/widgets/spec.md": add,
    "changes/b/specs/widgets/spec.md": add.replace("Paint widget", "Colour widget"),
  });
  const [finding] = errors(await lintRepo(root));
  assert.equal(finding.rule, "duplicate-id");
  assert.match(finding.message, /also added by change "a"/);
});

test("examples in fenced code blocks and archived changes are ignored", async () => {
  const root = await repo({
    "docs/adr/0001.md": "```markdown\n### Requirement: Example\nNo shall here.\n```\n",
    "specs/widgets/spec.md": livingWidgets + "\n```markdown\n#### Scenario: S1\n```\n",
    "changes/archive/2026-01-01-old/specs/widgets/spec.md": "### Requirement: Broken\n",
    "changes/archive/2026-01-01-old/tasks.md": "`widgets/long-gone`\n",
  });
  assert.deepEqual(await lintRepo(root), []);
});
