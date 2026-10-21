// Live smoke test of the harness itself, not a spec scenario: runs a real
// model against a fixture skill that touches every harness piece (scripted
// user, fake gh, local origin). Needs model credentials; costs a few cents.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runScenario } from "../../../tools/e2e/runner.ts";
import { ScriptedUser } from "../../../tools/e2e/scripted-user.ts";

const plugin = join(dirname(fileURLToPath(import.meta.url)), "fixture-plugin");

test("harness smoke: scripted answer, fake gh, and push all reach the run", async () => {
  const run = await runScenario({
    name: "harness/smoke",
    prompt: "Pick a colour.",
    plugins: [plugin],
    user: new ScriptedUser([{ header: "Colour", answer: "Blue" }]),
    gh: { issues: [{ number: 3, title: "Add widgets", body: "", labels: ["factory"], state: "OPEN" }] },
    maxBudgetUsd: 1,
  });

  assert.equal(run.result?.subtype, "success", `run ended with ${run.result?.subtype}`);
  assert.ok(run.toolCalls.some((c) => c.name === "Skill"), "the skill was invoked");
  assert.deepEqual(run.denied, [], "nothing needed a permission the harness refuses");

  const [question] = run.user.questions;
  assert.equal(question?.header, "Colour");
  assert.equal(question?.scripted, true);

  const colour = readFileSync(join(run.fixture.repo, "colour.txt"), "utf8");
  assert.match(colour, /^Blue$/m);
  assert.match(colour, /^issues: 1$/m);

  assert.ok(run.ghCalls.some((c) => c.argv.join(" ").startsWith("issue list --label factory")));
  const [pr] = run.ghState.prs;
  assert.equal(pr?.title, "Colour choice");
  assert.equal(pr?.head, "colour");
  assert.deepEqual(pr?.files, ["colour.txt"]);

  const pushed = execFileSync("git", ["--git-dir", run.fixture.origin, "rev-parse", "colour"], { encoding: "utf8" }).trim();
  assert.equal(pushed, run.fixture.git("rev-parse", "colour"));
  console.log(`harness smoke cost: $${run.costUsd.toFixed(4)}`);
});
