// Deterministic tests of the e2e harness pieces; no model calls.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { emptyState, type FakeGhState } from "./fake-gh/fake-gh.ts";
import { createFixture } from "./fixture.ts";
import { recordRun, remainingUsd } from "./ledger.ts";
import { modelFor } from "./models.ts";
import { classify, exitCodeFor } from "./run.ts";
import { ScriptedUser, type Question } from "./scripted-user.ts";

const GH_BIN = join(dirname(fileURLToPath(import.meta.url)), "fake-gh", "bin");

describe("fixture", () => {
  test("creates a committed repo whose origin is a local bare repo", async () => {
    const fixture = await createFixture({ "README.md": "hello\n" });
    assert.equal(fixture.git("rev-parse", "--abbrev-ref", "HEAD"), "main");
    assert.equal(fixture.git("status", "--porcelain"), "");
    assert.match(fixture.git("ls-files"), /factory\/loop\.md/);
    const remoteHead = execFileSync("git", ["--git-dir", fixture.origin, "rev-parse", "main"], { encoding: "utf8" }).trim();
    assert.equal(remoteHead, fixture.git("rev-parse", "HEAD"));
  });
});

describe("fake gh", () => {
  async function setup(state: Partial<FakeGhState> = {}) {
    const fixture = await createFixture();
    const ghDir = mkdtempSync(join(tmpdir(), "fake-gh-"));
    writeFileSync(join(ghDir, "state.json"), JSON.stringify({ ...emptyState(), ...state }));
    const gh = (...args: string[]) =>
      spawnSync("gh", args, {
        cwd: fixture.repo,
        encoding: "utf8",
        env: { ...process.env, PATH: `${GH_BIN}:${process.env.PATH}`, FAKE_GH_DIR: ghDir },
      });
    const calls = () => readFileSync(join(ghDir, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const state_ = (): FakeGhState => JSON.parse(readFileSync(join(ghDir, "state.json"), "utf8"));
    return { fixture, gh, calls, state: state_ };
  }

  test("lists issues filtered by label, as JSON", async () => {
    const { gh } = await setup({
      issues: [
        { number: 7, title: "Add widgets", body: "", labels: ["factory"], state: "OPEN" },
        { number: 8, title: "Unrelated", body: "", labels: [], state: "OPEN" },
      ],
    });
    const run = gh("issue", "list", "--label", "factory", "--json", "number,title");
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), [{ number: 7, title: "Add widgets" }]);
  });

  test("records pr create with the files changed on the branch", async () => {
    const { fixture, gh, calls, state } = await setup();
    fixture.git("switch", "--quiet", "-c", "add-widgets");
    writeFileSync(join(fixture.repo, "changes.md"), "x\n");
    fixture.git("add", "changes.md");
    fixture.git("commit", "--quiet", "-m", "x");
    const run = gh("pr", "create", "--title", "Proposal", "--body", "Why");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /\/pull\/1$/m);
    assert.deepEqual(state().prs[0].files, ["changes.md"]);
    assert.deepEqual(calls()[0].argv, ["pr", "create", "--title", "Proposal", "--body", "Why"]);

    const view = gh("pr", "view", "--json", "number,state,headRefName");
    assert.deepEqual(JSON.parse(view.stdout), { number: 1, state: "OPEN", headRefName: "add-widgets" });
    assert.equal(gh("pr", "review", "1", "--approve").status, 0);
    assert.equal(state().prs[0].reviewDecision, "APPROVED");
  });

  test("fails loudly on unsupported commands, but still records them", async () => {
    const { gh, calls } = await setup();
    const run = gh("release", "create", "v1");
    assert.equal(run.status, 1);
    assert.match(run.stderr, /unsupported command: gh release create v1/);
    assert.equal(calls().length, 1);
  });
});

describe("scripted user", () => {
  const q = (header: string, question: string, ...labels: string[]): Question => ({
    header,
    question,
    multiSelect: false,
    options: labels.map((label) => ({ label })),
  });

  test("answers scripted questions and defaults the rest to the first option", () => {
    const user = new ScriptedUser([
      { header: "Size", answer: "big" },
      { question: /which capabilities/i, answer: ["coding", "verification"] },
    ]);
    const reply = user.answer({
      questions: [
        q("Size", "How big is it?", "small", "big"),
        q("Caps", "Which capabilities does it touch?", "coding", "verification"),
        q("Style", "Which style?", "Picker (Recommended)", "Free text"),
      ],
    });
    assert.deepEqual(reply.answers, {
      "How big is it?": "big",
      "Which capabilities does it touch?": ["coding", "verification"],
      "Which style?": "Picker (Recommended)",
    });
    assert.deepEqual(user.questions.map((x) => x.scripted), [true, true, false]);
    assert.equal(user.rounds.length, 1);
  });

  test("a script entry needs a header or question to match", () => {
    const user = new ScriptedUser([{ answer: "never" }]);
    const reply = user.answer({ questions: [q("A", "A?", "first", "second")] });
    assert.equal(reply.answers["A?"], "first");
  });
});

describe("retry outcomes", () => {
  test("classify", () => {
    assert.equal(classify([true]), "pass");
    assert.equal(classify([false, true]), "flaky");
    assert.equal(classify([false, false]), "fail");
    assert.equal(classify([]), "not-run");
  });

  test("exit codes: fail beats not-run beats pass and flaky", () => {
    assert.equal(exitCodeFor(["pass", "flaky"]), 0);
    assert.equal(exitCodeFor(["pass", "not-run"]), 2);
    assert.equal(exitCodeFor(["not-run", "fail"]), 1);
  });
});

describe("ledger and models", () => {
  test("the cost ceiling counts every recorded run", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const before = process.env.E2E_MAX_COST_USD;
    process.env.E2E_MAX_COST_USD = "1";
    try {
      const run = { scenario: "x", inputTokens: 0, outputTokens: 0, turns: 1, outcome: "success", durationMs: 1 };
      recordRun({ ...run, costUsd: 0.25 }, dir);
      recordRun({ ...run, costUsd: 0.5 }, dir);
      assert.equal(remainingUsd(dir), 0.25);
    } finally {
      if (before === undefined) delete process.env.E2E_MAX_COST_USD;
      else process.env.E2E_MAX_COST_USD = before;
    }
  });

  test("role models default to pinned IDs and can be overridden", () => {
    assert.equal(modelFor("review-model"), process.env.E2E_MODEL_REVIEW_MODEL || "claude-opus-5-5");
    process.env.E2E_MODEL_DECISION_MODEL = "claude-test-model";
    try {
      assert.equal(modelFor("decision-model"), "claude-test-model");
    } finally {
      delete process.env.E2E_MODEL_DECISION_MODEL;
    }
  });
});
