// Per-run results shared by every scenario process in one e2e run:
// <results dir>/runs.jsonl, one line per agent run. The cost ceiling
// (E2E_MAX_COST_USD) is checked against the sum of these lines.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface RunRecord {
  scenario: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  outcome: string;
  durationMs: number;
}

export function resultsDir(): string {
  const dir = resolve(process.env.E2E_RESULTS_DIR ?? ".e2e-results");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readRuns(dir = resultsDir()): RunRecord[] {
  const path = join(dir, "runs.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function recordRun(record: RunRecord, dir = resultsDir()): void {
  appendFileSync(join(dir, "runs.jsonl"), JSON.stringify(record) + "\n");
}

export function spentUsd(dir = resultsDir()): number {
  return readRuns(dir).reduce((sum, r) => sum + r.costUsd, 0);
}

/** Remaining budget under E2E_MAX_COST_USD, or Infinity when no ceiling is set. */
export function remainingUsd(dir = resultsDir()): number {
  const ceiling = Number(process.env.E2E_MAX_COST_USD);
  return Number.isFinite(ceiling) && ceiling > 0 ? ceiling - spentUsd(dir) : Infinity;
}
