// Usage: node tools/spec-lint/cli.ts [repo-root] [--json]
// Exits 1 if any finding is an error; warnings alone exit 0.

import { resolve } from "node:path";
import { lintRepo } from "./lint.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");

const findings = await lintRepo(root);
const errors = findings.filter((f) => f.severity === "error").length;

if (json) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}: ${f.severity} [${f.rule}] ${f.message}`);
  console.log(`spec-lint: ${errors} error(s), ${findings.length - errors} warning(s)`);
}
process.exitCode = errors > 0 ? 1 : 0;
