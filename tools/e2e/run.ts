// Usage: node tools/e2e/run.ts [test files...]   (default: tests/e2e/**/*.test.ts)
//
// Runs each scenario file once; a failure is re-run once (ADR 0005):
//   pass                -> pass
//   fail, then pass     -> flaky (reported, doesn't block)
//   fail, then fail     -> fail  (exit 1)
// Files not started because E2E_MAX_COST_USD ran out are "not-run" (exit 2
// when nothing failed). Results go to $E2E_RESULTS_DIR (default
// .e2e-results/<timestamp>): runs.jsonl per agent run, summary.json overall.

import { spawnSync } from "node:child_process";
import { appendFile, glob, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { remainingUsd, resultsDir, spentUsd } from "./ledger.ts";

export type Outcome = "pass" | "flaky" | "fail" | "not-run";

export function classify(attempts: boolean[]): Outcome {
  if (attempts.length === 0) return "not-run";
  if (attempts[0]) return "pass";
  return attempts[1] ? "flaky" : "fail";
}

export function exitCodeFor(outcomes: Outcome[]): number {
  if (outcomes.includes("fail")) return 1;
  if (outcomes.includes("not-run")) return 2;
  return 0;
}

function runOnce(file: string): boolean {
  const child = spawnSync(process.execPath, ["--test", file], { stdio: "inherit", env: process.env });
  return child.status === 0;
}

async function main(): Promise<number> {
  process.env.E2E_RESULTS_DIR ??= join(".e2e-results", new Date().toISOString().replace(/[:.]/g, "-"));
  const dir = resultsDir();
  const args = process.argv.slice(2);
  const files = args;
  if (files.length === 0) {
    for await (const file of glob("tests/e2e/**/*.test.ts")) files.push(file);
    files.sort();
  }

  const results: { file: string; outcome: Outcome; attempts: boolean[] }[] = [];
  for (const file of files) {
    const attempts: boolean[] = [];
    while (attempts.length < 2 && !attempts.includes(true) && remainingUsd() > 0) {
      attempts.push(runOnce(file));
    }
    results.push({ file, outcome: classify(attempts), attempts });
  }

  const outcomes = results.map((r) => r.outcome);
  const summary = { costUsd: spentUsd(dir), partial: outcomes.includes("not-run"), results };
  await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\ne2e results (${dir})`);
  for (const r of results) console.log(`  ${r.outcome.padEnd(7)} ${r.file}`);
  console.log(`  cost: $${summary.costUsd.toFixed(4)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((r) => `| ${r.outcome} | \`${r.file}\` | ${r.attempts.length} |`).join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### e2e scenarios\n\n| Outcome | File | Attempts |\n|---|---|---|\n${rows}\n\nCost: $${summary.costUsd.toFixed(4)}\n`);
  }
  return exitCodeFor(outcomes);
}

if (import.meta.main) process.exitCode = await main();
